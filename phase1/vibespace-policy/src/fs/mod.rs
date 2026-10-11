//! Scoped file access: path validation plus a platform layer that walks from a held root
//! directory handle.

pub mod path;

#[cfg(all(unix, not(feature = "cap-layer")))]
mod unix;
#[cfg(all(unix, not(feature = "cap-layer")))]
pub(crate) use unix::Root;

#[cfg(any(not(unix), feature = "cap-layer"))]
mod windows;
#[cfg(any(not(unix), feature = "cap-layer"))]
pub(crate) use windows::Root;

use std::fmt;

/// File-layer errors. Never carry file content.
#[derive(Debug)]
pub enum FsError {
    /// Path failed syntactic validation.
    InvalidPath,
    /// A path component is a symbolic link or reparse point.
    Symlink,
    /// Target is not a regular file (directory, FIFO, socket, device).
    NotRegular,
    /// Regular file with more than one hard link.
    HardLink,
    /// Larger than the configured limit.
    TooLarge,
    /// Path lies in a protected location (for example `.git`).
    Protected,
    /// Does not exist.
    NotFound,
    /// The run was cancelled before the commit point.
    Cancelled,
    /// The isolated root is not acceptable.
    BadRoot(&'static str),
    /// This platform layer cannot give the required guarantee.
    Unsupported(&'static str),
    /// Other I/O failure (kind only).
    Io(std::io::ErrorKind),
}

impl FsError {
    /// Short fixed word for the audit log.
    pub fn class(&self) -> &'static str {
        match self {
            FsError::InvalidPath => "invalid_path",
            FsError::Symlink => "symlink",
            FsError::NotRegular => "not_regular",
            FsError::HardLink => "hardlink",
            FsError::TooLarge => "too_large",
            FsError::Protected => "protected",
            FsError::NotFound => "not_found",
            FsError::Cancelled => "cancelled",
            FsError::BadRoot(_) => "bad_root",
            FsError::Unsupported(_) => "unsupported",
            FsError::Io(_) => "io",
        }
    }
}

impl fmt::Display for FsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsError::BadRoot(w) | FsError::Unsupported(w) => write!(f, "{}: {w}", self.class()),
            FsError::Io(k) => write!(f, "io: {k:?}"),
            _ => f.write_str(self.class()),
        }
    }
}

impl std::error::Error for FsError {}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            FsError::NotFound
        } else {
            FsError::Io(e.kind())
        }
    }
}

/// How escapes are prevented. There is deliberately no weaker level: a platform that cannot
/// resolve paths relative to a held directory handle gets no writable file executor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IsolationLevel {
    /// Every component is opened relative to a held directory handle (`openat` with
    /// `O_NOFOLLOW` on Unix, `cap-std` on Windows).
    HandleRelative,
}

/// Name of the marker file that identifies an isolated copy.
pub const ISOLATED_MARKER: &str = ".vibespace-isolated";
