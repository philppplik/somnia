//! One OS-exclusive owner for a runtime data directory (all Spaces in its SQLite).
//! Never unlink the lock inode: doing so would let two processes lock different files.
//! Lease age is diagnostic, not authority. Even explicit takeover cannot evict a live
//! kernel-lock owner. Unclean exits require explicit recovery before AllActive recovery.
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::mpsc,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OwnerKind {
    Gui,
    Cli,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OwnerRecord {
    pub kind: OwnerKind,
    pub pid: u32,
    pub heartbeat_ms: u64,
    pub lease_until_ms: u64,
    pub clean_close: bool,
}
#[derive(Debug)]
pub enum OwnershipError {
    Busy(Option<OwnerRecord>),
    RecoveryRequired(Option<OwnerRecord>),
    Io,
}
impl std::fmt::Display for OwnershipError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Busy(record) => write!(f, "Vibe Space is owned by {:?}; close its GUI/CLI owner first (takeover cannot evict a live owner)", record.as_ref().map(|r| (r.kind, r.pid))),
            Self::RecoveryRequired(record) => write!(f, "Vibe Space has an unclean/stale owner {:?}; explicit takeover is required", record.as_ref().map(|r| (r.kind, r.pid))),
            Self::Io => f.write_str("cannot acquire or persist Vibe Space ownership lock"),
        }
    }
}
impl std::error::Error for OwnershipError {}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn read(file: &mut File) -> Option<OwnerRecord> {
    file.seek(SeekFrom::Start(0)).ok()?;
    let mut bytes = vec![];
    file.take(4097).read_to_end(&mut bytes).ok()?;
    serde_json::from_slice(&bytes).ok()
}
fn write(file: &mut File, record: &OwnerRecord) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(record)?;
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&bytes)?;
    file.set_len(bytes.len() as u64)?;
    file.sync_data()
}
pub struct OwnershipGuard {
    stop: Option<mpsc::Sender<()>>,
    worker: Option<thread::JoinHandle<()>>,
}
impl OwnershipGuard {
    pub fn acquire(data: &Path, kind: OwnerKind, takeover: bool) -> Result<Self, OwnershipError> {
        std::fs::create_dir_all(data).map_err(|_| OwnershipError::Io)?;
        let path = data.join("owner.lock");
        // Reject existing symlink lock paths. Private data directory is trusted host input.
        if std::fs::symlink_metadata(&path)
            .is_ok_and(|m| m.file_type().is_symlink() || !m.is_file())
        {
            return Err(OwnershipError::Io);
        }
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .map_err(|_| OwnershipError::Io)?;
        file.try_lock_exclusive()
            .map_err(|_| OwnershipError::Busy(read(&mut file)))?;
        let previous = read(&mut file);
        let nonempty = file.metadata().map_err(|_| OwnershipError::Io)?.len() != 0;
        if nonempty && !previous.as_ref().is_some_and(|r| r.clean_close) && !takeover {
            return Err(OwnershipError::RecoveryRequired(previous));
        }
        let mut record = OwnerRecord {
            kind,
            pid: std::process::id(),
            heartbeat_ms: now(),
            lease_until_ms: now() + 30_000,
            clean_close: false,
        };
        write(&mut file, &record).map_err(|_| OwnershipError::Io)?;
        let (stop, receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            while receiver.recv_timeout(Duration::from_secs(10))
                == Err(mpsc::RecvTimeoutError::Timeout)
            {
                record.heartbeat_ms = now();
                record.lease_until_ms = now() + 30_000;
                // A metadata write error never releases the kernel lock.
                let _ = write(&mut file, &record);
            }
            record.clean_close = true;
            record.lease_until_ms = now();
            let _ = write(&mut file, &record);
            let _ = FileExt::unlock(&file);
        });
        Ok(Self {
            stop: Some(stop),
            worker: Some(worker),
        })
    }
}
impl Drop for OwnershipGuard {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gui_cli_conflict_and_clean_close() {
        let d = tempfile::tempdir().unwrap();
        let gui = OwnershipGuard::acquire(d.path(), OwnerKind::Gui, false).unwrap();
        for takeover in [false, true] {
            let e = OwnershipGuard::acquire(d.path(), OwnerKind::Cli, takeover)
                .err()
                .unwrap();
            assert!(matches!(e, OwnershipError::Busy(_)));
            assert!(e.to_string().contains("GUI/CLI"));
        }
        drop(gui);
        let cli = OwnershipGuard::acquire(d.path(), OwnerKind::Cli, false).unwrap();
        drop(cli);
        assert!(OwnershipGuard::acquire(d.path(), OwnerKind::Gui, false).is_ok());
    }
    #[test]
    fn stale_unclean_and_malformed_require_explicit_takeover() {
        let d = tempfile::tempdir().unwrap();
        for bytes in [
            b"{broken".to_vec(),
            serde_json::to_vec(&OwnerRecord {
                kind: OwnerKind::Cli,
                pid: 999999,
                heartbeat_ms: 0,
                lease_until_ms: 1,
                clean_close: false,
            })
            .unwrap(),
        ] {
            std::fs::write(d.path().join("owner.lock"), bytes).unwrap();
            assert!(matches!(
                OwnershipGuard::acquire(d.path(), OwnerKind::Gui, false),
                Err(OwnershipError::RecoveryRequired(_))
            ));
            drop(OwnershipGuard::acquire(d.path(), OwnerKind::Gui, true).unwrap());
        }
    }
}
