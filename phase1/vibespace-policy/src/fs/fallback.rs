//! Non-Unix layer (Windows). Path-validated best effort: every component is checked with
//! `symlink_metadata` (symlink or reparse point rejected) and the final path is canonicalised
//! and compared to the canonical root. A local process that can swap directories between check
//! and use can still race this. The executor refuses to use it unless
//! `FileLimits::allow_path_validated_fallback` is set. COMPILE-CHECKED ONLY, never run in CI here.

use super::{path::RelPath, FsError, IsolationLevel, ISOLATED_MARKER};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub(crate) struct Root {
    path: PathBuf,
}

fn is_reparse(md: &std::fs::Metadata) -> bool {
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

fn check_component(p: &Path) -> Result<Option<std::fs::Metadata>, FsError> {
    match std::fs::symlink_metadata(p) {
        Ok(md) => {
            if md.file_type().is_symlink() || is_reparse(&md) {
                return Err(FsError::Symlink);
            }
            Ok(Some(md))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

impl Root {
    pub(crate) fn level() -> IsolationLevel {
        IsolationLevel::PathValidatedBestEffort
    }

    pub(crate) fn initialize(path: &Path) -> Result<(), FsError> {
        std::fs::create_dir_all(path)?;
        let marker = path.join(ISOLATED_MARKER);
        if !marker.exists() {
            std::fs::write(&marker, b"vibespace isolated copy\n")?;
        }
        Ok(())
    }

    pub(crate) fn open(path: &Path) -> Result<Self, FsError> {
        if !path.is_absolute() {
            return Err(FsError::BadRoot("root must be absolute"));
        }
        let md = std::fs::symlink_metadata(path).map_err(|_| FsError::BadRoot("root not found"))?;
        if md.file_type().is_symlink() || is_reparse(&md) || !md.is_dir() {
            return Err(FsError::BadRoot("root must be a real directory"));
        }
        let canon = std::fs::canonicalize(path).map_err(|_| FsError::BadRoot("root not found"))?;
        if canon.parent().is_none() {
            return Err(FsError::BadRoot("filesystem root refused"));
        }
        match check_component(&canon.join(ISOLATED_MARKER))? {
            Some(m) if m.is_file() => {}
            _ => return Err(FsError::BadRoot("missing isolation marker")),
        }
        Ok(Self { path: canon })
    }

    fn resolve_parent(&self, dirs: &[String], create: bool) -> Result<PathBuf, FsError> {
        let mut cur = self.path.clone();
        for d in dirs {
            cur.push(d);
            match check_component(&cur)? {
                Some(md) if md.is_dir() => {}
                Some(_) => return Err(FsError::NotRegular),
                None if create => {
                    std::fs::create_dir(&cur)?;
                    if check_component(&cur)?.is_none() {
                        return Err(FsError::NotFound);
                    }
                }
                None => return Err(FsError::NotFound),
            }
        }
        let canon = std::fs::canonicalize(&cur)?;
        if !canon.starts_with(&self.path) {
            return Err(FsError::Symlink);
        }
        Ok(canon)
    }

    pub(crate) fn read(&self, rel: &RelPath, max: u64) -> Result<Vec<u8>, FsError> {
        let (dirs, name) = rel.split();
        let parent = self.resolve_parent(dirs, false)?;
        let file = parent.join(name);
        let md = check_component(&file)?.ok_or(FsError::NotFound)?;
        if !md.is_file() {
            return Err(FsError::NotRegular);
        }
        if md.len() > max {
            return Err(FsError::TooLarge);
        }
        let f = OpenOptions::new().read(true).open(&file)?;
        let md2 = f.metadata()?;
        if !md2.is_file() || is_reparse(&md2) {
            return Err(FsError::NotRegular);
        }
        let mut buf = Vec::new();
        f.take(max.saturating_add(1)).read_to_end(&mut buf)?;
        if buf.len() as u64 > max {
            return Err(FsError::TooLarge);
        }
        Ok(buf)
    }

    pub(crate) fn write(
        &self,
        rel: &RelPath,
        bytes: &[u8],
        max: u64,
        create_parents: bool,
        checkpoint: &dyn Fn() -> Result<(), FsError>,
    ) -> Result<(), FsError> {
        if bytes.len() as u64 > max {
            return Err(FsError::TooLarge);
        }
        let (dirs, name) = rel.split();
        let parent = self.resolve_parent(dirs, create_parents)?;
        let target = parent.join(name);
        if let Some(md) = check_component(&target)? {
            if !md.is_file() {
                return Err(FsError::NotRegular);
            }
        }
        let tmp = parent.join(format!(
            ".vs-tmp-{}",
            crate::digest::hex(
                &crate::digest::random::<8>()
                    .map_err(|_| FsError::Io(std::io::ErrorKind::Other))?
            )
        ));
        let res = (|| -> Result<(), FsError> {
            let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()?;
            drop(f);
            checkpoint()?;
            std::fs::rename(&tmp, &target)?;
            Ok(())
        })();
        if res.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        res
    }

    pub(crate) fn delete(
        &self,
        rel: &RelPath,
        checkpoint: &dyn Fn() -> Result<(), FsError>,
    ) -> Result<(), FsError> {
        let (dirs, name) = rel.split();
        let parent = self.resolve_parent(dirs, false)?;
        let target = parent.join(name);
        let md = check_component(&target)?.ok_or(FsError::NotFound)?;
        if !md.is_file() {
            return Err(FsError::NotRegular);
        }
        checkpoint()?;
        std::fs::remove_file(&target)?;
        Ok(())
    }
}
