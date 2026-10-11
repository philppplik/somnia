//! Small filesystem helpers.

use crate::error::{Error, Result};
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// A process-unique name for temporary files.
pub fn unique_name(prefix: &str) -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{}-{t:x}-{n}", std::process::id())
}

/// Flush directory metadata (new names, renames) to disk. No-op where unsupported.
pub fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(f) = File::open(dir) {
        let _ = f.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Write a file by temp-file + fsync + rename in the same directory.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| Error::InvalidScope("no parent".into()))?;
    let tmp = dir.join(unique_name(".tmp"));
    let res = (|| -> std::io::Result<()> {
        let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)?;
        Ok(())
    })();
    if let Err(e) = res {
        let _ = fs::remove_file(&tmp);
        return Err(Error::io(format!("write {}", path.display()), e));
    }
    sync_dir(dir);
    Ok(())
}

pub fn is_reparse(md: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        md.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = md;
        false
    }
}

pub fn is_link_like(md: &Metadata) -> bool {
    md.file_type().is_symlink() || is_reparse(md)
}

pub fn exec_bit(md: &Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        md.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        let _ = md;
        false
    }
}

/// Open a path that `lmd` (an lstat result) said is a regular file, and make sure we really got
/// that same file (not a symlink swapped in between lstat and open). On Unix the device and inode
/// are compared. On Windows only the type is re-checked (documented limitation).
pub fn open_regular(path: &Path, lmd: &Metadata, key: &str) -> Result<(File, Metadata)> {
    let f = File::open(path).map_err(|e| Error::io(format!("open {}", path.display()), e))?;
    let md = f
        .metadata()
        .map_err(|e| Error::io(format!("stat {}", path.display()), e))?;
    if !md.is_file() {
        return Err(Error::ChangedDuringSnapshot(key.to_string()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if md.dev() != lmd.dev() || md.ino() != lmd.ino() {
            return Err(Error::ChangedDuringSnapshot(key.to_string()));
        }
    }
    #[cfg(not(unix))]
    let _ = lmd;
    Ok((f, md))
}
