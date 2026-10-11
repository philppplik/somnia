//! Non-Unix (Windows) layer on `cap-std`: handle-relative access.
//!
//! `cap_std::fs::Dir` holds an open directory handle and resolves every path relative to it
//! (on Windows through `NtCreateFile` with the directory as `RootDirectory`), refusing any
//! resolution that would leave the directory. On top of that this layer rejects symlinks
//! and junctions outright instead of following them inside the sandbox:
//!
//! * every parent component is checked with `symlink_metadata` and opened with
//!   `open_dir_nofollow`;
//! * the final file is checked with `symlink_metadata` and opened with `FollowSymlinks::No`;
//! * the opened handle is checked to be a regular file.
//!
//! Escape is prevented by the held handle plus cap-std's confinement even if a component is
//! swapped between check and use; the remaining race can only redirect inside the isolated
//! copy. Hard-link counts are not available on stable Rust for Windows, so a hard link to an
//! outside file is NOT detected here. Creating one needs write access to the outside file, but
//! the copy builder must not hard-link. STATUS: Windows native CI run38146543284 passed policy default/cap-layer,
//! junction and trailing-slash advisory regressions, composed Core and journals.
//! Symlink subcases may skip without privilege; no arbitrary-exec sandbox claim.
//! https://github.com/philppplik/somnia/actions/runs/38146543284

use super::{path::RelPath, FsError, IsolationLevel, ISOLATED_MARKER};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::Path;

pub(crate) struct Root {
    dir: Dir,
}

fn io_err(e: std::io::Error) -> FsError {
    match e.kind() {
        ErrorKind::NotFound => FsError::NotFound,
        // cap-std reports an attempted escape as PermissionDenied.
        ErrorKind::PermissionDenied => FsError::Symlink,
        k => FsError::Io(k),
    }
}

fn regular_or_missing(dir: &Dir, name: &str) -> Result<Option<cap_std::fs::Metadata>, FsError> {
    match dir.symlink_metadata(name) {
        Ok(md) => {
            if md.file_type().is_symlink() {
                return Err(FsError::Symlink);
            }
            if !md.is_file() {
                return Err(FsError::NotRegular);
            }
            Ok(Some(md))
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_err(e)),
    }
}

impl Root {
    pub(crate) fn level() -> IsolationLevel {
        IsolationLevel::HandleRelative
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
        let canon = std::fs::canonicalize(path).map_err(|_| FsError::BadRoot("root not found"))?;
        if canon.parent().is_none() {
            return Err(FsError::BadRoot("filesystem root refused"));
        }
        let dir = Dir::open_ambient_dir(&canon, ambient_authority())
            .map_err(|_| FsError::BadRoot("cannot open root"))?;
        match dir.symlink_metadata(ISOLATED_MARKER) {
            Ok(md) if md.is_file() => {}
            _ => return Err(FsError::BadRoot("missing isolation marker")),
        }
        Ok(Self { dir })
    }

    fn walk(&self, dirs: &[String], create: bool) -> Result<Dir, FsError> {
        let mut cur = self.dir.try_clone().map_err(io_err)?;
        for comp in dirs {
            match cur.symlink_metadata(comp.as_str()) {
                Ok(md) => {
                    if md.file_type().is_symlink() {
                        return Err(FsError::Symlink);
                    }
                    if !md.is_dir() {
                        return Err(FsError::NotRegular);
                    }
                }
                Err(e) if e.kind() == ErrorKind::NotFound && create => {
                    cur.create_dir(comp.as_str()).map_err(io_err)?;
                }
                Err(e) => return Err(io_err(e)),
            }
            cur = cur.open_dir_nofollow(comp.as_str()).map_err(io_err)?;
        }
        Ok(cur)
    }

    pub(crate) fn read(&self, rel: &RelPath, max: u64) -> Result<Vec<u8>, FsError> {
        let (dirs, name) = rel.split();
        let parent = self.walk(dirs, false)?;
        let md = regular_or_missing(&parent, name)?.ok_or(FsError::NotFound)?;
        if md.len() > max {
            return Err(FsError::TooLarge);
        }
        let mut opts = OpenOptions::new();
        opts.read(true).follow(FollowSymlinks::No);
        let f = parent.open_with(name, &opts).map_err(io_err)?;
        let md2 = f.metadata().map_err(io_err)?;
        if !md2.is_file() {
            return Err(FsError::NotRegular);
        }
        let mut buf = Vec::new();
        f.take(max.saturating_add(1))
            .read_to_end(&mut buf)
            .map_err(io_err)?;
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
        let parent = self.walk(dirs, create_parents)?;
        regular_or_missing(&parent, name)?;
        let tmp = format!(
            ".vs-tmp-{}",
            crate::digest::hex(
                &crate::digest::random::<8>().map_err(|_| FsError::Io(ErrorKind::Other))?
            )
        );
        let res = (|| -> Result<(), FsError> {
            let mut opts = OpenOptions::new();
            opts.write(true).create_new(true).follow(FollowSymlinks::No);
            let mut f = parent.open_with(&tmp, &opts).map_err(io_err)?;
            f.write_all(bytes).map_err(io_err)?;
            f.sync_all().map_err(io_err)?;
            drop(f);
            checkpoint()?;
            parent.rename(&tmp, &parent, name).map_err(io_err)?;
            Ok(())
        })();
        if res.is_err() {
            let _ = parent.remove_file(&tmp);
        }
        res
    }

    pub(crate) fn delete(
        &self,
        rel: &RelPath,
        checkpoint: &dyn Fn() -> Result<(), FsError>,
    ) -> Result<(), FsError> {
        let (dirs, name) = rel.split();
        let parent = self.walk(dirs, false)?;
        regular_or_missing(&parent, name)?.ok_or(FsError::NotFound)?;
        checkpoint()?;
        parent.remove_file(name).map_err(io_err)
    }
}
