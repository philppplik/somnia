//! Local embedding for Vibe Space memory (package A6).
//!
//! * `model`: the pinned multilingual-e5-small file list (revision, sizes, sha256).
//! * `download`: the ONLY code that touches the network, and only through an explicit, size-acknowledged
//!   [`download::DownloadConsent`]. Progress, cancel, sha256 verification, atomic install.
//! * `embedder` (feature `fastembed`): runs the downloaded ONNX model locally.
//!
//! Nothing here is called at startup or by a search. No consent, no bytes.

pub mod download;
pub mod model;
#[cfg(feature = "fastembed")]
pub mod embedder;

pub use download::{DownloadConsent, DownloadError, ModelStatus, ModelStore, Progress};
pub use model::{e5_small, FileSpec, ModelSpec};
