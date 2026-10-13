//! Typed errors (R4-C1/C4). The kind list is part of the stable JSON schema.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    GitMissing,
    IdentityMissing,
    Auth,
    Sso,
    Protection,
    StalePlan,
    DirtyWorktree,
    Diverged,
    UncertainOutcome,
    ReviewRequired,
    VersionMismatch,
    WorkspaceBusy,
    EngineUnavailable,
    BadRequest,
    NotFound,
    Internal,
}

pub const EXIT_DONE: i32 = 0;
pub const EXIT_FAILED: i32 = 1;
pub const EXIT_NEEDS_INPUT: i32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl CliError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), details: None }
    }
    pub fn with_details(mut self, d: Value) -> Self {
        self.details = Some(d);
        self
    }
    pub fn exit_code(&self) -> i32 {
        match self.kind {
            ErrorKind::ReviewRequired => EXIT_NEEDS_INPUT,
            _ => EXIT_FAILED,
        }
    }
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}
impl std::error::Error for CliError {}

impl From<std::io::Error> for CliError {
    fn from(e: std::io::Error) -> Self {
        CliError::new(ErrorKind::Internal, format!("io: {e}"))
    }
}
impl From<serde_json::Error> for CliError {
    fn from(e: serde_json::Error) -> Self {
        CliError::new(ErrorKind::Internal, format!("json: {e}"))
    }
}
pub type Result<T> = std::result::Result<T, CliError>;
