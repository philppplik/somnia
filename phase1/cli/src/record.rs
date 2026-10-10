//! Task + session record (subset of R5-C1) and the `--json` run summary (R4-C4).
use crate::error::{CliError, ErrorKind, Result, EXIT_DONE, EXIT_FAILED, EXIT_NEEDS_INPUT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub const RECORD_SCHEMA: &str = "somnia.session/1";
pub const SUMMARY_SCHEMA: &str = "somnia.run/1";
pub const ERROR_SCHEMA: &str = "somnia.error/1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Queued,
    Preparing,
    Running,
    WaitingInput,
    Review,
    Done,
    Failed,
    Cancelled,
}

impl Status {
    pub fn is_terminal(self) -> bool {
        matches!(self, Status::WaitingInput | Status::Review | Status::Done | Status::Failed | Status::Cancelled)
    }
    /// 0 done, 1 failed (or cancelled), 2 needs-input / review-required.
    pub fn exit_code(self) -> i32 {
        match self {
            Status::Done => EXIT_DONE,
            Status::WaitingInput | Status::Review => EXIT_NEEDS_INPUT,
            _ => EXIT_FAILED,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Producer {
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Overrides {
    pub bare: bool,
    pub yes: bool,
    pub attribution: bool,
    #[serde(default)]
    pub studio: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Usage {
    #[serde(default)]
    pub tokens: Option<u64>,
    #[serde(default)]
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub schema: String,
    pub task_id: String,
    pub repo_id: String,
    pub branch: String,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
    pub allowed_roots: Vec<String>,
    pub producer: Producer,
    pub prompt: String,
    pub plan: Option<String>,
    pub overrides: Overrides,
    pub status: Status,
    pub verification: Option<Value>,
    pub usage: Usage,
    /// Local agent commits are never presented as human-approved versions (R5-C2 L1).
    pub unreviewed_checkpoint: bool,
    pub error: Option<CliError>,
    pub created_at: u64,
    pub updated_at: u64,
}

/// `--json` output: a defined subset of the session record. Field set is a stable contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSummary {
    pub schema: String,
    pub task_id: String,
    pub producer: Producer,
    pub prompt: String,
    pub plan: Option<String>,
    pub branch: String,
    pub base_sha: Option<String>,
    pub result_sha: Option<String>,
    pub overrides: Overrides,
    pub verification: Option<Value>,
    pub usage: Usage,
    pub status: Status,
    pub unreviewed_checkpoint: bool,
    pub error: Option<CliError>,
}

impl SessionRecord {
    pub fn summary(&self) -> RunSummary {
        RunSummary {
            schema: SUMMARY_SCHEMA.into(),
            task_id: self.task_id.clone(),
            producer: self.producer.clone(),
            prompt: self.prompt.clone(),
            plan: self.plan.clone(),
            branch: self.branch.clone(),
            base_sha: self.base_sha.clone(),
            result_sha: self.head_sha.clone(),
            overrides: self.overrides.clone(),
            verification: self.verification.clone(),
            usage: self.usage.clone(),
            status: self.status,
            unreviewed_checkpoint: self.unreviewed_checkpoint,
            error: self.error.clone(),
        }
    }
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn sessions_dir(root: &Path) -> PathBuf {
    root.join(".somnia").join("sessions")
}
pub fn record_path(root: &Path, task_id: &str) -> PathBuf {
    sessions_dir(root).join(format!("{task_id}.json"))
}
pub fn events_path(root: &Path, task_id: &str) -> PathBuf {
    sessions_dir(root).join(format!("{task_id}.events.ndjson"))
}

pub fn valid_task_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn save(root: &Path, rec: &mut SessionRecord) -> Result<()> {
    rec.updated_at = now();
    let dir = sessions_dir(root);
    fs::create_dir_all(&dir)?;
    let tmp = dir.join(format!("{}.json.tmp", rec.task_id));
    fs::write(&tmp, serde_json::to_vec_pretty(rec)?)?;
    fs::rename(&tmp, record_path(root, &rec.task_id))?;
    Ok(())
}

pub fn load(root: &Path, task_id: &str) -> Result<SessionRecord> {
    if !valid_task_id(task_id) {
        return Err(CliError::new(ErrorKind::BadRequest, "invalid task id"));
    }
    let p = record_path(root, task_id);
    let bytes = fs::read(&p).map_err(|_| CliError::new(ErrorKind::NotFound, format!("no session record for {task_id}")))?;
    Ok(serde_json::from_slice(&bytes)?)
}
