//! Unix layer: handle-relative walk with `openat(O_NOFOLLOW)`.
//!
//! The root directory is opened once and held as a file descriptor. Every later operation walks
//! from that descriptor one component at a time with `O_NOFOLLOW`, so a symlink anywhere in the
//! path (including one swapped in after validation) fails the open instead of redirecting it.
//! Final files are checked with `fstat` on the opened descriptor, not on the path.

#![allow(unsafe_code)]
// st_mode/st_nlink widths differ per platform, so the casts are needed on some targets.
#![allow(clippy::unnecessary_cast)]

use super::{path::RelPath, FsError, IsolationLevel, ISOLATED_MARKER};
use std::ffi::CString;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

pub(crate) struct Root {
    fd: OwnedFd,
}

fn cstr(s: &str) -> Result<CString, FsError> {
    CString::new(s).map_err(|_| FsError::InvalidPath)
}

fn errno() -> i32 {
    std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
}

fn map_errno(e: i32) -> FsError {
    match e {
        libc::ELOOP => FsError::Symlink,
        libc::ENOENT => FsError::NotFound,
        _ => FsError::Io(std::io::Error::from_raw_os_error(e).kind()),
    }
}

fn openat(dir: RawFd, name: &str, flags: i32, mode: u32) -> Result<OwnedFd, FsError> {
    let c = cstr(name)?;
    // SAFETY: `dir` is a live descriptor owned by the caller, `c` is NUL-terminated.
    let fd = unsafe {
        libc::openat(
            dir,
            c.as_ptr(),
            flags | libc::O_CLOEXEC,
            mode as libc::c_uint,
        )
    };
    if fd < 0 {
        Err(map_errno(errno()))
    } else {
        // SAFETY: fd is a fresh valid descriptor we own.
        Ok(unsafe { OwnedFd::from_raw_fd(fd) })
    }
}

fn fstat(fd: RawFd) -> Result<libc::stat, FsError> {
    // SAFETY: zeroed stat is a valid out-parameter; fd is live.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(fd, &mut st) } != 0 {
        return Err(map_errno(errno()));
    }
    Ok(st)
}

fn fstatat_nofollow(dir: RawFd, name: &str) -> Result<Option<libc::stat>, FsError> {
    let c = cstr(name)?;
    // SAFETY: as above.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstatat(dir, c.as_ptr(), &mut st, libc::AT_SYMLINK_NOFOLLOW) } != 0 {
        let e = errno();
        if e == libc::ENOENT {
            return Ok(None);
        }
        return Err(map_errno(e));
    }
    Ok(Some(st))
}

fn kind(st: &libc::stat) -> u32 {
    (st.st_mode as u32) & (libc::S_IFMT as u32)
}

fn check_regular(st: &libc::stat) -> Result<(), FsError> {
    let k = kind(st);
    if k == libc::S_IFLNK as u32 {
        return Err(FsError::Symlink);
    }
    if k != libc::S_IFREG as u32 {
        return Err(FsError::NotRegular);
    }
    if st.st_nlink as u64 > 1 {
        return Err(FsError::HardLink);
    }
    Ok(())
}

impl Root {
    pub(crate) fn level() -> IsolationLevel {
        IsolationLevel::HandleRelative
    }

    /// Create the directory and the isolation marker for a new isolated copy.
    pub(crate) fn initialize(path: &Path) -> Result<(), FsError> {
        std::fs::create_dir_all(path)?;
        let marker = path.join(ISOLATED_MARKER);
        if !marker.exists() {
            std::fs::write(&marker, b"vibespace isolated copy\n")?;
        }
        Ok(())
    }

    /// Open an existing isolated root: absolute, not `/`, a real directory (not a symlink),
    /// carrying the marker file.
    pub(crate) fn open(path: &Path) -> Result<Self, FsError> {
        if !path.is_absolute() {
            return Err(FsError::BadRoot("root must be absolute"));
        }
        let canon = std::fs::canonicalize(path).map_err(|_| FsError::BadRoot("root not found"))?;
        if canon.parent().is_none() {
            return Err(FsError::BadRoot("filesystem root refused"));
        }
        let c =
            CString::new(canon.as_os_str().as_bytes()).map_err(|_| FsError::BadRoot("bad path"))?;
        // SAFETY: valid C string; AT_FDCWD with an absolute path.
        let fd = unsafe {
            libc::open(
                c.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err(FsError::BadRoot("cannot open root"));
        }
        // SAFETY: fresh descriptor.
        let fd = unsafe { OwnedFd::from_raw_fd(fd) };
        match fstatat_nofollow(fd.as_raw_fd(), ISOLATED_MARKER)? {
            Some(st) if kind(&st) == libc::S_IFREG as u32 => {}
            _ => return Err(FsError::BadRoot("missing isolation marker")),
        }
        Ok(Self { fd })
    }

    fn walk(&self, dirs: &[String], create: bool) -> Result<OwnedFd, FsError> {
        // SAFETY: dup of a live descriptor.
        let first = unsafe { libc::fcntl(self.fd.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 0) };
        if first < 0 {
            return Err(map_errno(errno()));
        }
        // SAFETY: fresh descriptor.
        let mut cur = unsafe { OwnedFd::from_raw_fd(first) };
        for comp in dirs {
            let flags = libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW;
            let next = match openat(cur.as_raw_fd(), comp, flags, 0) {
                Ok(fd) => fd,
                Err(FsError::NotFound) if create => {
                    let c = cstr(comp)?;
                    // SAFETY: live dir fd, valid C string.
                    if unsafe { libc::mkdirat(cur.as_raw_fd(), c.as_ptr(), 0o755) } != 0
                        && errno() != libc::EEXIST
                    {
                        return Err(map_errno(errno()));
                    }
                    openat(cur.as_raw_fd(), comp, flags, 0)?
                }
                Err(FsError::Io(_)) | Err(FsError::Symlink) => {
                    // ENOTDIR on a symlink-or-file component: classify.
                    return Err(match fstatat_nofollow(cur.as_raw_fd(), comp)? {
                        Some(st) if kind(&st) == libc::S_IFLNK as u32 => FsError::Symlink,
                        Some(_) => FsError::NotRegular,
                        None => FsError::NotFound,
                    });
                }
                Err(e) => return Err(e),
            };
            cur = next;
        }
        Ok(cur)
    }

    pub(crate) fn read(&self, rel: &RelPath, max: u64) -> Result<Vec<u8>, FsError> {
        let (dirs, name) = rel.split();
        let parent = self.walk(dirs, false)?;
        // Pre-check by name so we never open a FIFO or device.
        match fstatat_nofollow(parent.as_raw_fd(), name)? {
            None => return Err(FsError::NotFound),
            Some(st) => check_regular(&st)?,
        }
        let fd = openat(
            parent.as_raw_fd(),
            name,
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK,
            0,
        )?;
        let st = fstat(fd.as_raw_fd())?;
        check_regular(&st)?;
        if st.st_size < 0 || st.st_size as u64 > max {
            return Err(FsError::TooLarge);
        }
        let mut f = File::from(fd);
        let mut buf = Vec::with_capacity((st.st_size as usize).min(1 << 20));
        (&mut f).take(max.saturating_add(1)).read_to_end(&mut buf)?;
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
        let existing_mode = match fstatat_nofollow(parent.as_raw_fd(), name)? {
            None => None,
            Some(st) => {
                check_regular(&st)?;
                Some((st.st_mode as u32) & 0o777)
            }
        };
        let tmp = format!(
            ".vs-tmp-{}",
            crate::digest::hex(
                &crate::digest::random::<8>()
                    .map_err(|_| FsError::Io(std::io::ErrorKind::Other))?
            )
        );
        let fd = openat(
            parent.as_raw_fd(),
            &tmp,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW,
            0o600,
        )?;
        let mut f = File::from(fd);
        let result = (|| -> Result<(), FsError> {
            f.write_all(bytes)?;
            f.sync_all()?;
            let mode = existing_mode.unwrap_or(0o644);
            // SAFETY: live descriptor.
            if unsafe { libc::fchmod(f.as_raw_fd(), mode as libc::mode_t) } != 0 {
                return Err(map_errno(errno()));
            }
            // Last check before the commit point.
            checkpoint()?;
            let (a, b) = (cstr(&tmp)?, cstr(name)?);
            // SAFETY: live dir fd, valid C strings. rename replaces the name itself, never
            // following a symlink at the destination.
            if unsafe {
                libc::renameat(
                    parent.as_raw_fd(),
                    a.as_ptr(),
                    parent.as_raw_fd(),
                    b.as_ptr(),
                )
            } != 0
            {
                return Err(map_errno(errno()));
            }
            Ok(())
        })();
        if result.is_err() {
            let c = cstr(&tmp)?;
            // SAFETY: as above.
            unsafe { libc::unlinkat(parent.as_raw_fd(), c.as_ptr(), 0) };
        }
        result
    }

    pub(crate) fn delete(
        &self,
        rel: &RelPath,
        checkpoint: &dyn Fn() -> Result<(), FsError>,
    ) -> Result<(), FsError> {
        let (dirs, name) = rel.split();
        let parent = self.walk(dirs, false)?;
        match fstatat_nofollow(parent.as_raw_fd(), name)? {
            None => return Err(FsError::NotFound),
            Some(st) => {
                let k = kind(&st);
                if k == libc::S_IFLNK as u32 {
                    return Err(FsError::Symlink);
                }
                if k != libc::S_IFREG as u32 {
                    return Err(FsError::NotRegular);
                }
            }
        }
        checkpoint()?;
        let c = cstr(name)?;
        // SAFETY: live dir fd, valid C string; flags 0 = unlink a non-directory.
        if unsafe { libc::unlinkat(parent.as_raw_fd(), c.as_ptr(), 0) } != 0 {
            return Err(map_errno(errno()));
        }
        Ok(())
    }
}
