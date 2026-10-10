//! Native diagnostic DTOs. No renderer paths, free text or recovery claims are accepted.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
pub const MAX_EXPORT_BYTES: usize = 10 * 1024 * 1024;
pub const FILE_NAMES: [&str; 5] = [
    "manifest.json",
    "incidents.jsonl",
    "logs.jsonl",
    "swallow-counters.json",
    "health.json",
];
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticError {
    SnapshotUnavailable,
    StoreCorrupt,
    ZipWriteFailed,
    InvalidInput,
}
impl DiagnosticError {
    pub fn code(self) -> &'static str {
        match self {
            Self::SnapshotUnavailable => "SOM-APP-013",
            Self::StoreCorrupt => "SOM-APP-014",
            Self::ZipWriteFailed => "SOM-FS-014",
            Self::InvalidInput => "SOM-APP-011",
        }
    }
}
pub type Result<T> = std::result::Result<T, DiagnosticError>;
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildIdentity {
    pub release: String,
    pub sha: String,
    pub channel: String,
    pub arch: String,
    #[serde(rename = "frontend_build")]
    pub frontend_build: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RecoveryEvidence {
    Unknown,
    #[serde(rename_all = "camelCase")]
    DraftPresent {
        count: u32,
        newest_age_sec: u64,
        verified: bool,
    },
    #[serde(rename_all = "camelCase")]
    IncidentScoped {
        scope: String,
        checkpoint_at: String,
        session: String,
        snapshot_correlated: bool,
    },
}
impl Default for RecoveryEvidence {
    fn default() -> Self {
        Self::Unknown
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum IncidentKind {
    NativePanic,
    FrontendFatal,
    UncleanExit,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Artifact {
    pub kind: String,
    pub bytes: u64,
    pub available: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CrashMeta {
    pub incident_id: String,
    pub kind: IncidentKind,
    pub occurred_at: String,
    pub error_id: String,
    pub reviewed_at: Option<String>,
    pub build: BuildIdentity,
    #[serde(default = "unknown_recovery")]
    pub recovery: Vec<RecoveryEvidence>,
    pub artifacts: Vec<Artifact>,
}
pub fn unknown_recovery() -> Vec<RecoveryEvidence> {
    vec![RecoveryEvidence::Unknown]
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiagnosticsSelection {
    pub incident_ids: Vec<String>,
    pub include_logs: bool,
    pub include_incident_details: bool,
    pub include_capability_health: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticFilePreview {
    pub name: String,
    pub utf8_bytes: usize,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSnapshot {
    pub snapshot_id: String,
    pub created_at: String,
    pub selection: DiagnosticsSelection,
    pub files: Vec<DiagnosticFilePreview>,
    pub report_text: String,
    pub total_uncompressed_bytes: usize,
    pub expires_at: String,
    pub health: String,
    pub omissions: Vec<String>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SaveOutcome {
    Saved { bytes: u64 },
    Cancelled,
}
pub fn safe_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}
pub fn safe_source(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
}
pub fn safe_error_id(s: &str) -> bool {
    let p: Vec<_> = s.split('-').collect();
    p.len() == 3
        && p[0] == "SOM"
        && (2..=4).contains(&p[1].len())
        && p[1].bytes().all(|c| c.is_ascii_uppercase())
        && p[2].len() == 3
        && p[2].bytes().all(|c| c.is_ascii_digit())
}
pub fn safe_timestamp(s: &str) -> bool {
    s.len() == 24
        && s.as_bytes()[10] == b'T'
        && s.ends_with('Z')
        && s.bytes()
            .all(|c| c.is_ascii_digit() || b"-T:.Z".contains(&c))
}
/// Schema v2 projection. Unknown/free-text fields are removed before persistence/export.
pub fn safe_event(v: &Value) -> Option<Value> {
    if v.to_string().len() > 4096 || v.get("v")?.as_u64()? != 2 {
        return None;
    }
    let session = v.get("session")?.as_str()?;
    let source = v.get("source")?.as_str()?;
    let seq = v.get("seq")?.as_u64()?;
    let id = v.get("id")?.as_str()?;
    let ts = v.get("ts")?.as_str()?;
    if !safe_token(session)
        || !["ts", "rust"].contains(&source)
        || !safe_error_id(id)
        || !safe_timestamp(ts)
        || seq > 9_007_199_254_740_991
    {
        return None;
    }
    let level = v
        .get("level")
        .and_then(Value::as_str)
        .filter(|l| ["debug", "info", "warn", "error"].contains(l))
        .unwrap_or("error");
    let mut out = serde_json::json!({"v":2,"session":session,"source":source,"seq":seq,"id":id,"ts":ts,"expected":v.get("expected").and_then(Value::as_bool)==Some(true),"level":level,"context":{},"build":{},"fingerprint":"unknown"});
    if v.get("fatal").and_then(Value::as_bool) == Some(true) {
        out["fatal"] = true.into();
    }
    for key in ["window", "incident_id", "corr", "fingerprint"] {
        if let Some(t) = v.get(key).and_then(Value::as_str).filter(|t| safe_token(t)) {
            out[key] = t.into();
        }
    }
    for key in ["suppressed", "dur_ms"] {
        if let Some(n) = v
            .get(key)
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite() && *n >= 0.0)
        {
            out[key] = serde_json::json!(n);
        }
    }
    for key in ["release", "sha", "channel", "arch", "frontend_build"] {
        out["build"][key] = v
            .get("build")
            .and_then(|b| b.get(key))
            .and_then(Value::as_str)
            .filter(|t| safe_token(t))
            .unwrap_or("unknown")
            .into();
    }
    if let Some(ctx) = v.get("context") {
        for key in ["ordinal", "size", "count", "code", "cmd"] {
            if let Some(n) = ctx
                .get(key)
                .and_then(Value::as_f64)
                .filter(|n| n.is_finite())
            {
                out["context"][key] = serde_json::json!(n);
            } else if let Some(t) = ctx
                .get(key)
                .and_then(Value::as_str)
                .filter(|t| safe_token(t))
            {
                out["context"][key] = t.into();
            }
        }
    }
    Some(out)
}
pub fn safe_token(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
}
pub fn merge_events(native: &[Value], renderer: &[Value]) -> Vec<Value> {
    let mut map = BTreeMap::new();
    for v in native.iter().chain(renderer) {
        if let Some(e) = safe_event(v) {
            let key = serde_json::json!([e["session"], e["source"], e["seq"], e.get("window")])
                .to_string();
            map.insert(key, e);
        }
    }
    let mut out: Vec<_> = map.into_values().collect();
    out.sort_by(|a, b| a["ts"].as_str().cmp(&b["ts"].as_str()));
    out
}

/// Atomic replacement on Windows and POSIX; temp must be in the same directory.
pub fn atomic_replace(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    #[cfg(not(windows))]
    {
        std::fs::rename(from, to)
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" {
            fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
        }
        let from: Vec<_> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<_> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        // MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH. OS-owned destination only.
        let ok = unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 0x1 | 0x8) };
        if ok == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}
