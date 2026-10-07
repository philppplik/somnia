//! Native file access for the image editor: one-time read grants and atomic saves.
//! The renderer never gets a path. It gets bytes for one file the user just picked in the OS dialog,
//! and it hands bytes back to be written where the user picks in the OS save dialog.
use crate::service::{AppError, Result};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const MAX_IMAGE_READ: u64 = 128 * 1024 * 1024;
pub const MAX_IMAGE_WRITE: usize = 256 * 1024 * 1024;
const GRANT_TTL: Duration = Duration::from_secs(120);
pub const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "svg"];

pub struct ImageGrant {
    token: String,
    path: PathBuf,
    created: Instant,
}
impl ImageGrant {
    pub fn new(path: PathBuf) -> Self {
        Self { token: uuid::Uuid::new_v4().to_string(), path, created: Instant::now() }
    }
    pub fn token(&self) -> &str {
        &self.token
    }
    /// Exact token, once. A wrong token does not consume the grant.
    pub fn consume(slot: &mut Option<Self>, token: &str) -> Result<PathBuf> {
        let grant = slot.as_ref().ok_or_else(|| AppError::Denied("Image grant expired. Pick the file again.".into()))?;
        if grant.token != token || grant.created.elapsed() > GRANT_TTL {
            return Err(AppError::Denied("Image grant expired. Pick the file again.".into()));
        }
        Ok(slot.take().unwrap().path)
    }
}

pub fn has_image_extension(path: &Path) -> bool {
    path.extension()
        .map(|e| IMAGE_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Size of a regular file the user picked, refusing anything else or anything over the read limit.
pub fn checked_image_size(path: &Path) -> Result<u64> {
    if !has_image_extension(path) {
        return Err(AppError::Denied("Only PNG, JPEG, WebP and SVG files can be opened".into()));
    }
    let meta = fs::metadata(path).map_err(|e| AppError::Io(e.to_string()))?;
    if !meta.is_file() {
        return Err(AppError::Denied("Pick a regular file".into()));
    }
    if meta.len() > MAX_IMAGE_READ {
        return Err(AppError::Limit);
    }
    Ok(meta.len())
}

/// Read the whole file with a hard cap even if it grows after the size check.
pub fn read_image(path: &Path) -> Result<Vec<u8>> {
    checked_image_size(path)?;
    let file = fs::File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_READ + 1).read_to_end(&mut bytes).map_err(|e| AppError::Io(e.to_string()))?;
    if bytes.len() as u64 > MAX_IMAGE_READ {
        return Err(AppError::Limit);
    }
    Ok(bytes)
}

/// Write bytes next to the target and rename over it, so a crash leaves the old file or the new file, never half of one.
pub fn save_image_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() {
        return Err(AppError::Denied("Nothing to save".into()));
    }
    if bytes.len() > MAX_IMAGE_WRITE {
        return Err(AppError::Limit);
    }
    if !has_image_extension(path) {
        return Err(AppError::Denied("Save as PNG, JPEG, WebP or SVG".into()));
    }
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
    #[test]
    fn grant_is_exact_once_and_wrong_token_keeps_it() {
        let mut slot = Some(ImageGrant::new(PathBuf::from("/tmp/a.png")));
        let token = slot.as_ref().unwrap().token().to_owned();
        assert!(ImageGrant::consume(&mut slot, "forged").is_err());
        assert_eq!(ImageGrant::consume(&mut slot, &token).unwrap(), PathBuf::from("/tmp/a.png"));
        assert!(ImageGrant::consume(&mut slot, &token).is_err());
    }
    #[test]
    fn expired_grant_is_refused() {
        let mut grant = ImageGrant::new(PathBuf::from("a.png"));
        grant.created = Instant::now() - Duration::from_secs(121);
        let token = grant.token().to_owned();
        assert!(ImageGrant::consume(&mut Some(grant), &token).is_err());
    }
    #[test]
    fn only_image_files_are_read_and_written() {
        let dir = tempfile::tempdir().unwrap();
        let txt = dir.path().join("note.txt");
        fs::write(&txt, b"x").unwrap();
        assert!(read_image(&txt).is_err());
        assert!(save_image_atomic(&txt, b"x").is_err());
        assert!(read_image(dir.path()).is_err());
        let png = dir.path().join("a.PNG");
        fs::write(&png, b"abc").unwrap();
        assert_eq!(read_image(&png).unwrap(), b"abc");
    }
    #[test]
    fn atomic_save_replaces_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("out.webp");
        save_image_atomic(&out, b"one").unwrap();
        save_image_atomic(&out, b"two").unwrap();
        assert_eq!(fs::read(&out).unwrap(), b"two");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        assert!(save_image_atomic(&out, b"").is_err());
    }
}
