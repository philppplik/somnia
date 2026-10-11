//! Error type for the crate.

use crate::digest::Digest;
use std::fmt;
use std::io;
use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, Error>;

/// Why an apply or restore found the original tree in a state it refuses to touch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConflictKind {
    /// The original file differs from the baseline (the user edited it).
    ModifiedSinceBaseline,
    /// The original file was removed after the baseline was taken.
    DeletedSinceBaseline,
    /// The agent added a file but something already exists at that path.
    AlreadyExists,
    /// A parent of the target is a file, or the target is not a regular file.
    NotRegularFile,
    /// A parent directory of the target is a symlink or reparse point.
    SymlinkedParent,
    /// The result would contain paths that collide on a case-insensitive filesystem.
    CaseCollision,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
    pub path: String,
    pub kind: ConflictKind,
    pub detail: String,
}

/// What a rollback did and could not do.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RollbackReport {
    /// Paths put back to their pre-apply state.
    pub reverted: Vec<String>,
    /// Paths left alone because they no longer matched what this apply wrote
    /// (the user changed them in the meantime). Never overwritten.
    pub preserved: Vec<String>,
    /// Rollback steps that failed. If non-empty the journal is kept for `recover`.
    pub failures: Vec<String>,
}

#[derive(Debug)]
pub enum Error {
    Io {
        context: String,
        source: io::Error,
    },
    InvalidPath {
        path: String,
        reason: String,
    },
    Symlink(String),
    SpecialFile(String),
    CaseCollision {
        a: String,
        b: String,
    },
    QuotaExceeded {
        what: &'static str,
        limit: u64,
        path: Option<String>,
    },
    InvalidScope(String),
    OverlappingRoots {
        a: PathBuf,
        b: PathBuf,
    },
    ScopeOverlapsVault(PathBuf),
    MissingObject(Digest),
    CorruptObject {
        digest: Digest,
        reason: String,
    },
    CorruptRecord(String),
    ChangedDuringSnapshot(String),
    BaselineMismatch {
        expected: Digest,
        found: Digest,
    },
    UnknownIsolatedCopy(String),
    UnknownSelection(String),
    EmptySelection,
    /// The isolated file no longer matches what was reviewed.
    StaleReview(String),
    /// Nothing was written to the originals.
    Conflicts(Vec<Conflict>),
    /// A previous apply/restore was interrupted. Call `Vault::recover`.
    PendingRecovery(Vec<String>),
    /// Another process holds the vault lock.
    Locked,
    /// Apply failed after starting; everything was rolled back as far as possible.
    ApplyFailed {
        cause: Box<Error>,
        rollback: RollbackReport,
    },
    /// The isolated-copy marker is missing or was modified. Apply refuses.
    IsolatedTampered(String),
    /// Test hook: simulated crash (no rollback performed).
    InjectedCrash,
    /// Test hook: simulated failure.
    InjectedFailure,
    Unsupported(String),
}

impl Error {
    pub(crate) fn io(context: impl Into<String>, source: io::Error) -> Self {
        Error::Io {
            context: context.into(),
            source,
        }
    }
    pub(crate) fn path(path: impl Into<String>, reason: impl Into<String>) -> Self {
        Error::InvalidPath {
            path: path.into(),
            reason: reason.into(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io { context, source } => write!(f, "{context}: {source}"),
            Error::InvalidPath { path, reason } => write!(f, "invalid path {path:?}: {reason}"),
            Error::Symlink(p) => write!(f, "symlink or reparse point not allowed: {p}"),
            Error::SpecialFile(p) => {
                write!(f, "special file (device, fifo, socket) not allowed: {p}")
            }
            Error::CaseCollision { a, b } => write!(
                f,
                "paths collide on case-insensitive filesystems: {a:?} and {b:?}"
            ),
            Error::QuotaExceeded { what, limit, path } => {
                write!(f, "quota exceeded: {what} limit {limit}")?;
                if let Some(p) = path {
                    write!(f, " at {p}")?;
                }
                Ok(())
            }
            Error::InvalidScope(m) => write!(f, "invalid scope: {m}"),
            Error::OverlappingRoots { a, b } => write!(
                f,
                "scope roots overlap: {} and {}",
                a.display(),
                b.display()
            ),
            Error::ScopeOverlapsVault(p) => write!(
                f,
                "scope root overlaps the vault directory: {}",
                p.display()
            ),
            Error::MissingObject(d) => write!(f, "object missing from store: {d}"),
            Error::CorruptObject { digest, reason } => {
                write!(f, "corrupt object {digest}: {reason}")
            }
            Error::CorruptRecord(m) => write!(f, "corrupt record: {m}"),
            Error::ChangedDuringSnapshot(p) => {
                write!(f, "file changed while it was being read: {p}")
            }
            Error::BaselineMismatch { expected, found } => {
                write!(f, "baseline mismatch: expected {expected}, found {found}")
            }
            Error::UnknownIsolatedCopy(i) => write!(f, "unknown isolated copy: {i}"),
            Error::UnknownSelection(p) => write!(f, "selected path is not part of the review: {p}"),
            Error::EmptySelection => write!(f, "no paths selected"),
            Error::StaleReview(p) => write!(f, "isolated file changed after review: {p}"),
            Error::Conflicts(c) => {
                write!(f, "{} conflict(s); originals were not modified:", c.len())?;
                for x in c {
                    write!(f, " [{} {:?}: {}]", x.path, x.kind, x.detail)?;
                }
                Ok(())
            }
            Error::PendingRecovery(j) => write!(
                f,
                "interrupted apply/restore pending, run recover(): {}",
                j.join(", ")
            ),
            Error::Locked => write!(f, "vault is locked by another operation"),
            Error::ApplyFailed { cause, rollback } => write!(
                f,
                "apply failed ({cause}); rolled back {} path(s), preserved {}, rollback failures {}",
                rollback.reverted.len(),
                rollback.preserved.len(),
                rollback.failures.len()
            ),
            Error::IsolatedTampered(p) => {
                write!(f, "isolated copy marker missing or modified: {p}")
            }
            Error::InjectedCrash => write!(f, "injected crash"),
            Error::InjectedFailure => write!(f, "injected failure"),
            Error::Unsupported(m) => write!(f, "unsupported: {m}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Io { source, .. } => Some(source),
            Error::ApplyFailed { cause, .. } => Some(cause.as_ref()),
            _ => None,
        }
    }
}
