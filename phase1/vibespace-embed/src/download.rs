use crate::model::ModelSpec;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug)]
pub enum DownloadError {
    /// The caller did not acknowledge exactly the size shown to the user.
    ConsentMismatch { expected: u64, acknowledged: u64 },
    /// Only https (or loopback http for tests) is allowed.
    InsecureUrl(String),
    Cancelled,
    Http(String),
    SizeMismatch { file: String, expected: u64, got: u64 },
    HashMismatch { file: String },
    Io(String),
}
impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for DownloadError {}
impl From<std::io::Error> for DownloadError {
    fn from(e: std::io::Error) -> Self {
        DownloadError::Io(e.to_string())
    }
}

/// Proof that the user was shown the total size and agreed. Cannot be built without the exact number.
#[derive(Clone, Copy, Debug)]
pub struct DownloadConsent(u64);
impl DownloadConsent {
    pub fn bytes(&self) -> u64 {
        self.0
    }
    pub fn acknowledge(spec: &ModelSpec, acknowledged_bytes: u64) -> Result<Self, DownloadError> {
        if acknowledged_bytes != spec.total_bytes() {
            return Err(DownloadError::ConsentMismatch { expected: spec.total_bytes(), acknowledged: acknowledged_bytes });
        }
        Ok(DownloadConsent(acknowledged_bytes))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Progress {
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModelStatus {
    /// Nothing usable on disk.
    Missing,
    /// All files present with the pinned sizes and a verified marker.
    Ready,
}

pub struct ModelStore {
    dir: PathBuf,
}

impl ModelStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        ModelStore { dir: dir.into() }
    }
    pub fn model_dir(&self, spec: &ModelSpec) -> PathBuf {
        self.dir.join(&spec.id).join(&spec.revision)
    }
    /// Pure file-system check. Never touches the network and never creates anything.
    pub fn status(&self, spec: &ModelSpec) -> ModelStatus {
        let d = self.model_dir(spec);
        if !d.join(".verified").is_file() {
            return ModelStatus::Missing;
        }
        for f in &spec.files {
            match fs::metadata(d.join(&f.local_name)) {
                Ok(m) if m.is_file() && m.len() == f.size => {}
                _ => return ModelStatus::Missing,
            }
        }
        ModelStatus::Ready
    }
    /// Removes the model from disk (used when the user opts out and wants the space back).
    pub fn remove(&self, spec: &ModelSpec) -> std::io::Result<()> {
        let d = self.model_dir(spec);
        if d.exists() {
            fs::remove_dir_all(d)?;
        }
        Ok(())
    }

    /// Downloads and verifies every file. Needs `consent`. `on_progress` is called at least per chunk;
    /// setting `cancel` aborts, deletes partial files and returns `Cancelled`.
    pub fn download(
        &self,
        spec: &ModelSpec,
        base_url: &str,
        _consent: DownloadConsent,
        cancel: &AtomicBool,
        on_progress: &mut dyn FnMut(&Progress),
    ) -> Result<(), DownloadError> {
        if !(base_url.starts_with("https://") || base_url.starts_with("http://127.0.0.1")) {
            return Err(DownloadError::InsecureUrl(base_url.to_string()));
        }
        let dir = self.model_dir(spec);
        fs::create_dir_all(&dir)?;
        let _ = fs::remove_file(dir.join(".verified"));
        let mut done_before = 0u64;
        for f in &spec.files {
            let part = dir.join(format!("{}.part", f.local_name));
            let result = self.fetch_one(spec, base_url, f, &part, cancel, &mut |n| {
                on_progress(&Progress { file: f.local_name.clone(), downloaded: done_before + n, total: spec.total_bytes() })
            });
            if let Err(e) = result {
                let _ = fs::remove_file(&part);
                return Err(e);
            }
            fs::rename(&part, dir.join(&f.local_name))?;
            done_before += f.size;
        }
        fs::write(dir.join(".verified"), spec.revision.as_bytes())?;
        Ok(())
    }

    fn fetch_one(
        &self,
        spec: &ModelSpec,
        base_url: &str,
        f: &crate::model::FileSpec,
        part: &Path,
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(u64),
    ) -> Result<(), DownloadError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(DownloadError::Cancelled);
        }
        let resp = ureq::get(&spec.url(base_url, f))
            .timeout(std::time::Duration::from_secs(60))
            .call()
            .map_err(|e| DownloadError::Http(e.to_string()))?;
        let mut reader = resp.into_reader();
        let mut out = fs::File::create(part)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let mut got = 0u64;
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(DownloadError::Cancelled);
            }
            let n = reader.read(&mut buf)?;
            if n == 0 {
                break;
            }
            got += n as u64;
            if got > f.size {
                return Err(DownloadError::SizeMismatch { file: f.local_name.clone(), expected: f.size, got });
            }
            hasher.update(&buf[..n]);
            out.write_all(&buf[..n])?;
            progress(got);
        }
        out.flush()?;
        if got != f.size {
            return Err(DownloadError::SizeMismatch { file: f.local_name.clone(), expected: f.size, got });
        }
        let hex: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if hex != f.sha256 {
            return Err(DownloadError::HashMismatch { file: f.local_name.clone() });
        }
        Ok(())
    }
}
