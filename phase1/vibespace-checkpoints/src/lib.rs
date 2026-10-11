//! Content-addressed checkpoints, isolated working copies, review and explicit apply for Vibe Space.
//!
//! Flow: `Vault::checkpoint` -> `Vault::isolated_copy` -> (agent edits only the copy) ->
//! `Vault::review_changes` -> `Vault::explicit_apply` or `Vault::discard`; `Vault::restore` undoes.
//! See `docs/vibespace/checkpoints.md` in the repository for guarantees and platform limits.

mod apply;
mod diff;
mod digest;
mod error;
mod fsutil;
mod manifest;
pub mod path;
mod scope;
mod store;
mod vault;

pub use apply::{
    ApplyOptions, ApplyReport, ApplyRequest, Inject, RecoveryReport, RestoreOptions, RestoreReport,
    Selection,
};
pub use diff::{
    Change, ChangeKind, ChangeSet, ContentDiff, MAX_TEXT_DIFF_BYTES, Review, ReviewedChange,
    unified_diff,
};
pub use digest::{CheckpointId, Digest};
pub use error::{Conflict, ConflictKind, Error, Result, RollbackReport};
pub use manifest::{Entry, Manifest, Skipped};
pub use scope::{Limits, Scope, ScopeRoot, SymlinkPolicy};
pub use store::{CorruptEntry, ObjectStore};
pub use vault::{
    Checkpoint, CheckpointRecord, IsolatedCopy, IsolatedCopyOptions, MarkerPolicy, RunMetadata,
    Vault,
};

/// Name of the marker file placed at the top of every root of an isolated copy. It is never
/// captured, diffed, reviewed or applied, in any directory, in any scan.
pub const MARKER_NAME: &str = ".vibespace-isolated";
