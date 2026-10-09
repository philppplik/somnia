//! Sound Studio save access: one-time native grants and atomic WAV writes.
//! Same model as pdf_io: the renderer never gets a path, only a token for the location the user just picked.
use crate::service::{AppError, Result};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const MAX_AUDIO_WRITE: usize = 512 * 1024 * 1024;
const GRANT_TTL: Duration = Duration::from_secs(120);
pub const AUDIO_EXTENSIONS: [&str; 1] = ["wav"];

pub struct AudioGrant {
    token: String,
    path: PathBuf,
    created: Instant,
}
impl AudioGrant {
    pub fn new(path: PathBuf) -> Self {
        Self { token: uuid::Uuid::new_v4().to_string(), path, created: Instant::now() }
    }
    pub fn token(&self) -> &str {
        &self.token
    }
    /// Exact token, once. A wrong token does not consume the grant.
    pub fn consume(slot: &mut Option<Self>, token: &str) -> Result<PathBuf> {
        let grant = slot.as_ref().ok_or_else(|| AppError::Denied("Audio save grant expired. Pick the save location again.".into()))?;
        if grant.token != token || grant.created.elapsed() > GRANT_TTL {
            return Err(AppError::Denied("Audio save grant expired. Pick the save location again.".into()));
        }
        Ok(slot.take().unwrap().path)
    }
}

pub fn has_audio_extension(path: &Path) -> bool {
    path.extension().map(|e| AUDIO_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false)
}

fn is_wav(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE"
}

/// Write bytes next to the target and rename over it, so a crash leaves the old file or the new file, never half of one.
pub fn save_audio_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() {
        return Err(AppError::Denied("Nothing to save".into()));
    }
    if bytes.len() > MAX_AUDIO_WRITE {
        return Err(AppError::Limit);
    }
    if !has_audio_extension(path) {
        return Err(AppError::Denied("Save as WAV".into()));
    }
    if !is_wav(bytes) {
        return Err(AppError::Denied("Expected WAV bytes".into()));
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
    fn wav() -> Vec<u8> {
        let mut v = b"RIFF\0\0\0\0WAVE".to_vec();
        v.extend_from_slice(&[0; 8]);
        v
    }
    #[test]
    fn restricted_audio_save() {
        let dir = std::env::temp_dir().join(format!("somnia-audio-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let out = dir.join("take.wav");
        assert!(save_audio_atomic(&out, b"bad").is_err());
        assert!(save_audio_atomic(&out, b"").is_err());
        assert!(save_audio_atomic(&dir.join("x.txt"), &wav()).is_err());
        save_audio_atomic(&out, &wav()).unwrap();
        let mut second = wav();
        second.push(1);
        save_audio_atomic(&out, &second).unwrap();
        assert_eq!(fs::read(&out).unwrap(), second);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1, "no temp files left");
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn grant_is_single_use_and_token_bound() {
        let g = AudioGrant::new(PathBuf::from("a.wav"));
        let token = g.token().to_owned();
        let mut slot = Some(g);
        assert!(AudioGrant::consume(&mut slot, "wrong").is_err());
        assert!(slot.is_some());
        assert!(AudioGrant::consume(&mut slot, &token).is_ok());
        assert!(AudioGrant::consume(&mut slot, &token).is_err());
    }
}
