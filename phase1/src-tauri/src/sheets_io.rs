//! XLSX save-copy access: one-time native grants and atomic writes.
//! The renderer never gets a path. It gets bytes for one file the user just picked in the OS dialog,
//! and it hands bytes back to be written where the user picks in the OS save dialog.
use crate::service::{AppError, Result};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const MAX_SHEETS_WRITE: usize = 32 * 1024 * 1024;
const GRANT_TTL: Duration = Duration::from_secs(120);
pub const SHEETS_EXTENSIONS: [&str; 1] = ["xlsx"];

pub struct SheetsGrant {
    token: String,
    path: PathBuf,
    created: Instant,
}
impl SheetsGrant {
    pub fn new(path: PathBuf) -> Self {
        Self { token: uuid::Uuid::new_v4().to_string(), path, created: Instant::now() }
    }
    pub fn token(&self) -> &str {
        &self.token
    }
    /// Exact token, once. A wrong token does not consume the grant.
    pub fn consume(slot: &mut Option<Self>, token: &str) -> Result<PathBuf> {
        let grant = slot.as_ref().ok_or_else(|| AppError::Denied("XLSX save grant expired. Pick the save location again.".into()))?;
        if grant.token != token || grant.created.elapsed() > GRANT_TTL {
            return Err(AppError::Denied("XLSX save grant expired. Pick the save location again.".into()));
        }
        Ok(slot.take().unwrap().path)
    }
}

pub fn has_sheets_extension(path: &Path) -> bool {
    path.extension()
        .map(|e| SHEETS_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Copy-only publication: write/sync a sibling temp, hard-link to a new target, never replace an existing path.
pub fn save_sheets_copy(path: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() {
        return Err(AppError::Denied("Nothing to save".into()));
    }
    if bytes.len() > MAX_SHEETS_WRITE {
        return Err(AppError::Limit);
    }
    if !has_sheets_extension(path) {
        return Err(AppError::Denied("Save as XLSX".into()));
    }
    if !bytes.starts_with(b"PK\x03\x04") { return Err(AppError::Denied("Expected XLSX bytes".into())); }
    let dir = path.parent().ok_or_else(|| AppError::Denied("Invalid save location".into()))?;
    let name = path.file_name().ok_or_else(|| AppError::Denied("Invalid file name".into()))?;
    let tmp = dir.join(format!(".{}.somnia-{}.tmp", name.to_string_lossy(), uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::hard_link(&tmp, path)?;
        fs::remove_file(&tmp)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(AppError::Io(e.to_string()));
    }
    Ok(())
}


#[cfg(test)]
mod tests {use super::*;#[test]fn never_overwrites_existing_path(){let dir=std::env::temp_dir().join(format!("somnia-sheets-{}",uuid::Uuid::new_v4()));fs::create_dir_all(&dir).unwrap();let out=dir.join("copy.xlsx");assert!(save_sheets_copy(&out,b"bad").is_err());save_sheets_copy(&out,b"PK\x03\x04original").unwrap();assert!(save_sheets_copy(&out,b"PK\x03\x04new").is_err());assert_eq!(fs::read(&out).unwrap(),b"PK\x03\x04original");let mut slot=Some(SheetsGrant::new(out));let token=slot.as_ref().unwrap().token().to_owned();assert!(SheetsGrant::consume(&mut slot,"wrong").is_err());assert!(SheetsGrant::consume(&mut slot,&token).is_ok());assert!(SheetsGrant::consume(&mut slot,&token).is_err());fs::remove_dir_all(dir).unwrap();}}
