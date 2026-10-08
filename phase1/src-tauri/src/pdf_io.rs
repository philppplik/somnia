//! PDF save-copy access: one-time native grants and atomic writes.
//! The renderer never gets a path. It gets bytes for one file the user just picked in the OS dialog,
//! and it hands bytes back to be written where the user picks in the OS save dialog.
use crate::service::{AppError, Result};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const MAX_PDF_WRITE: usize = 256 * 1024 * 1024;
const GRANT_TTL: Duration = Duration::from_secs(120);
pub const PDF_EXTENSIONS: [&str; 1] = ["pdf"];

pub struct PdfGrant {
    token: String,
    path: PathBuf,
    created: Instant,
}
impl PdfGrant {
    pub fn new(path: PathBuf) -> Self {
        Self { token: uuid::Uuid::new_v4().to_string(), path, created: Instant::now() }
    }
    pub fn token(&self) -> &str {
        &self.token
    }
    /// Exact token, once. A wrong token does not consume the grant.
    pub fn consume(slot: &mut Option<Self>, token: &str) -> Result<PathBuf> {
        let grant = slot.as_ref().ok_or_else(|| AppError::Denied("PDF save grant expired. Pick the save location again.".into()))?;
        if grant.token != token || grant.created.elapsed() > GRANT_TTL {
            return Err(AppError::Denied("PDF save grant expired. Pick the save location again.".into()));
        }
        Ok(slot.take().unwrap().path)
    }
}

pub fn has_pdf_extension(path: &Path) -> bool {
    path.extension()
        .map(|e| PDF_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Write bytes next to the target and rename over it, so a crash leaves the old file or the new file, never half of one.
pub fn save_pdf_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() {
        return Err(AppError::Denied("Nothing to save".into()));
    }
    if bytes.len() > MAX_PDF_WRITE {
        return Err(AppError::Limit);
    }
    if !has_pdf_extension(path) {
        return Err(AppError::Denied("Save as PDF".into()));
    }
    if !bytes.starts_with(b"%PDF-") { return Err(AppError::Denied("Expected PDF bytes".into())); }
    let dir = path.parent().ok_or_else(|| AppError::Denied("Invalid save location".into()))?;
    let name = path.file_name().ok_or_else(|| AppError::Denied("Invalid file name".into()))?;
    let tmp = dir.join(format!(".{}.somnia-{}.tmp", name.to_string_lossy(), uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(AppError::Io(e.to_string()));
    }
    Ok(())
}


#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn restricted_pdf_save() {
  let dir=std::env::temp_dir().join(format!("somnia-pdf-test-{}",uuid::Uuid::new_v4()));fs::create_dir_all(&dir).unwrap();
  let out=dir.join("copy.pdf"); assert!(save_pdf_atomic(&out,b"bad").is_err());
  assert!(save_pdf_atomic(&dir.join("x.txt"),b"%PDF-1.7\n").is_err());
  save_pdf_atomic(&out,b"%PDF-1.7\none").unwrap();save_pdf_atomic(&out,b"%PDF-1.7\ntwo").unwrap();assert_eq!(fs::read(&out).unwrap(),b"%PDF-1.7\ntwo");
  let mut grant=Some(PdfGrant::new(out));let token=grant.as_ref().unwrap().token().to_string();assert!(PdfGrant::consume(&mut grant,"wrong").is_err());assert!(PdfGrant::consume(&mut grant,&token).is_ok());assert!(PdfGrant::consume(&mut grant,&token).is_err());fs::remove_dir_all(&dir).unwrap();
 }
}
