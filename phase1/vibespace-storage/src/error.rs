use serde::{Deserialize, Serialize};
use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub enum Error {
    Sqlite(rusqlite::Error),
    Json(serde_json::Error),
    /// The database was written by a newer version of this crate. It is left untouched.
    NewerSchema {
        found: i64,
        supported: i64,
    },
    /// The file is a non-empty SQLite database that is not a Vibe Space database.
    ForeignDatabase,
    Migration {
        version: i64,
        message: String,
    },
    NotFound {
        entity: &'static str,
        id: String,
    },
    InvalidInput(String),
    InvalidTransition {
        axis: &'static str,
        from: String,
        to: String,
    },
    /// A feature that is deliberately not available (e.g. pause/resume).
    Unsupported(String),
    LimitExceeded(String),
    FencingMismatch,
    /// Optimistic concurrency or state conflict (stale expected state/revision, terminal run).
    Conflict(String),
    UnsupportedDtoVersion {
        found: u32,
    },
    LockPoisoned,
}

impl Error {
    /// Stable machine-readable code for the adapter layer.
    pub fn code(&self) -> &'static str {
        match self {
            Error::Sqlite(_) => "sqlite",
            Error::Json(_) => "json",
            Error::NewerSchema { .. } => "newer_schema",
            Error::ForeignDatabase => "foreign_database",
            Error::Migration { .. } => "migration_failed",
            Error::NotFound { .. } => "not_found",
            Error::InvalidInput(_) => "invalid_input",
            Error::InvalidTransition { .. } => "invalid_transition",
            Error::Unsupported(_) => "unsupported",
            Error::LimitExceeded(_) => "limit_exceeded",
            Error::FencingMismatch => "fencing_mismatch",
            Error::Conflict(_) => "conflict",
            Error::UnsupportedDtoVersion { .. } => "unsupported_dto_version",
            Error::LockPoisoned => "lock_poisoned",
        }
    }

    pub fn to_dto(&self) -> ErrorDto {
        ErrorDto {
            schema_version: crate::DTO_SCHEMA_VERSION,
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Sqlite(e) => write!(f, "sqlite error: {e}"),
            Error::Json(e) => write!(f, "json error: {e}"),
            Error::NewerSchema { found, supported } => write!(
                f,
                "database schema version {found} is newer than the supported version {supported}; refusing to open"
            ),
            Error::ForeignDatabase => write!(f, "file is a non-empty database that is not a Vibe Space database"),
            Error::Migration { version, message } => write!(f, "migration to version {version} failed and was rolled back: {message}"),
            Error::NotFound { entity, id } => write!(f, "{entity} not found: {id}"),
            Error::InvalidInput(m) => write!(f, "invalid input: {m}"),
            Error::InvalidTransition { axis, from, to } => write!(f, "invalid {axis} transition {from} -> {to}"),
            Error::Unsupported(m) => write!(f, "unsupported: {m}"),
            Error::LimitExceeded(m) => write!(f, "limit exceeded: {m}"),
            Error::FencingMismatch => write!(f, "fencing token mismatch"),
            Error::Conflict(m) => write!(f, "conflict: {m}"),
            Error::UnsupportedDtoVersion { found } => write!(f, "unsupported DTO schemaVersion {found}"),
            Error::LockPoisoned => write!(f, "store lock poisoned"),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Error::Sqlite(e)
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Json(e)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDto {
    pub schema_version: u32,
    pub code: String,
    pub message: String,
}
