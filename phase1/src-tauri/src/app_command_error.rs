//! Typed command error returned by every wrapped Tauri command (`cmd()` / `invokeCmd`).
//!
//! Wire shape (snake_case, identical to C2 section 13.4 and `CommandError` in `invokeCmd.ts`):
//! `{ id, code, message, detail?, incident_id, expected }`. Never a bare string.
//! `message` is a fixed, user-safe sentence and `detail` is short and free of paths and secrets.
use crate::service::AppError;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppCommandError {
    /// Registry id, e.g. `SOM-FS-006`.
    pub id: String,
    /// Stable machine code for the failing variant, e.g. `locked`.
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Filled by `cmd()`. Empty for expected outcomes (they never create an incident).
    #[serde(default)]
    pub incident_id: String,
    pub expected: bool,
}

impl AppCommandError {
    pub fn new(id: &str, code: &str, message: &str, expected: bool) -> Self {
        Self { id: id.into(), code: code.into(), message: message.into(), detail: None, incident_id: String::new(), expected }
    }
    /// Short context for the UI/report. Callers must not pass paths, file names or secrets.
    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let mut d: String = detail.into();
        if d.chars().count() > 200 {
            d = d.chars().take(200).collect();
        }
        self.detail = Some(d);
        self
    }
    /// Level used by `cmd()` for the single log line.
    pub fn level(&self) -> &'static str {
        if self.expected { "info" } else { "error" }
    }
}

impl std::fmt::Display for AppCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}: {}", self.id, self.code, self.message)
    }
}
impl std::error::Error for AppCommandError {}

/// One row per `AppError` variant, ids from the R1 table (FS block). NoEdit has no R1 row and shares
/// SOM-FS-004 (client state out of sync); the registry (D1-A) owns final numbers, this is the single place to change them.
pub struct Mapping {
    pub code: &'static str,
    pub id: &'static str,
    pub message: &'static str,
    pub expected: bool,
}
pub fn map_app_error(e: &AppError) -> Mapping {
    match e {
        AppError::Io(_) => Mapping { code: "io", id: "SOM-FS-003", message: "The file operation failed", expected: false },
        AppError::Denied(_) => Mapping { code: "denied", id: "SOM-FS-002", message: "Access to this location was denied", expected: false },
        AppError::Conflict => Mapping { code: "conflict", id: "SOM-FS-001", message: "The disk file changed; compare or reload before saving", expected: true },
        AppError::NoEdit => Mapping { code: "no_edit", id: "SOM-FS-004", message: "No staged edit exists", expected: false },
        AppError::StaleRevision => Mapping { code: "stale_revision", id: "SOM-FS-004", message: "Stale client revision", expected: true },
        AppError::Locked => Mapping { code: "locked", id: "SOM-FS-006", message: "Another Somnia process has this project open", expected: true },
        AppError::Limit => Mapping { code: "limit", id: "SOM-FS-005", message: "File/project limit exceeded", expected: true },
        AppError::UnknownProject => Mapping { code: "unknown_project", id: "SOM-FS-007", message: "Project is closed or belongs to another window", expected: false },
        AppError::Invalid(_) => Mapping { code: "invalid", id: "SOM-FS-008", message: "Invalid UTF-8 or corrupt recovery record", expected: false },
        AppError::Dirty => Mapping { code: "dirty", id: "SOM-FS-009", message: "Unsaved edits remain; retain or discard them explicitly", expected: true },
    }
}

impl From<AppError> for AppCommandError {
    fn from(e: AppError) -> Self {
        let m = map_app_error(&e);
        // The variant payload can hold paths (Io/Denied/Invalid): it is dropped on purpose.
        Self::new(m.id, m.code, m.message, m.expected)
    }
}
impl From<std::io::Error> for AppCommandError {
    fn from(e: std::io::Error) -> Self {
        AppError::from(e).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn all() -> Vec<AppError> {
        vec![
            AppError::Io("C:\\Users\\x\\secret.html".into()),
            AppError::Denied("D:\\p".into()),
            AppError::Conflict,
            AppError::NoEdit,
            AppError::StaleRevision,
            AppError::Limit,
            AppError::Locked,
            AppError::UnknownProject,
            AppError::Invalid("bad C:\\x".into()),
            AppError::Dirty,
        ]
    }
    #[test]
    fn every_variant_is_mapped_with_unique_codes() {
        let mut codes = std::collections::HashSet::new();
        for e in all() {
            let c = AppCommandError::from(e);
            assert!(c.id.starts_with("SOM-FS-"), "{}", c.id);
            assert!(codes.insert(c.code.clone()), "duplicate code {}", c.code);
            assert!(c.incident_id.is_empty());
        }
    }
    #[test]
    fn ids_match_the_r1_fs_table() {
        let id = |e: AppError| AppCommandError::from(e).id;
        assert_eq!(id(AppError::Conflict), "SOM-FS-001");
        assert_eq!(id(AppError::Denied(String::new())), "SOM-FS-002");
        assert_eq!(id(AppError::Io(String::new())), "SOM-FS-003");
        assert_eq!(id(AppError::StaleRevision), "SOM-FS-004");
        assert_eq!(id(AppError::Limit), "SOM-FS-005");
        assert_eq!(id(AppError::Locked), "SOM-FS-006");
        assert_eq!(id(AppError::UnknownProject), "SOM-FS-007");
        assert_eq!(id(AppError::Invalid(String::new())), "SOM-FS-008");
        assert_eq!(id(AppError::Dirty), "SOM-FS-009");
    }
    #[test]
    fn payload_paths_never_reach_the_wire() {
        for e in all() {
            let json = serde_json::to_string(&AppCommandError::from(e)).unwrap();
            assert!(!json.contains("C:\\\\Users") && !json.contains("secret.html") && !json.contains("D:\\\\p"), "{json}");
        }
    }
    #[test]
    fn wire_shape_is_snake_case_and_omits_empty_detail() {
        let v = serde_json::to_value(AppCommandError::from(AppError::Locked)).unwrap();
        let keys: std::collections::BTreeSet<_> = v.as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys.into_iter().collect::<Vec<_>>(), ["code", "expected", "id", "incident_id", "message"]);
        let with = serde_json::to_value(AppCommandError::from(AppError::Locked).with_detail("x".repeat(500))).unwrap();
        assert_eq!(with["detail"].as_str().unwrap().len(), 200);
    }
    #[test]
    fn io_error_maps_like_app_error_io() {
        let c: AppCommandError = std::io::Error::other("D:\\x").into();
        assert_eq!(c.code, "io");
        assert!(!c.message.contains("D:"));
    }
}
