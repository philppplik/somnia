//! The run lifecycle: prepare -> run -> (optional local commit). Never pushes, never touches the network.
use crate::engine::{EngineEvent, EngineTask, TaskEngine};
use crate::error::{CliError, ErrorKind, Result};
use crate::gitops;
use crate::guard::{self, WorkspaceLock};
use crate::protocol::{EventFrame, RunEvent, PROTOCOL_VERSION};
use crate::record::{self, Overrides, Producer, SessionRecord, Status, Usage, RECORD_SCHEMA};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSpec {
    pub task_id: String,
    pub request_id: Option<String>,
    pub prompt: String,
    pub root: PathBuf,
    pub bare: bool,
    pub yes: bool,
    pub attribution: bool,
    pub studio: Option<String>,
    pub branch: Option<String>,
    pub allowed_roots: Vec<String>,
    pub max_tokens: Option<u64>,
    pub max_cost: Option<f64>,
}

pub fn new_task_id() -> String {
    format!("t-{}", &uuid::Uuid::new_v4().simple().to_string()[..12])
}

pub fn repo_id(root: &Path) -> String {
    let h = Sha256::digest(root.to_string_lossy().as_bytes());
    h.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn branch_name(spec: &RunSpec) -> String {
    spec.branch.clone().unwrap_or_else(|| format!("somnia/task/{}", spec.task_id))
}

/// Cheap, side-effect-free checks (used by `--detach` before spawning, so blockers surface synchronously).
pub fn preflight(spec: &RunSpec) -> Result<()> {
    preflight_inner(spec)?;
    if !WorkspaceLock::is_free(&spec.root) {
        return Err(CliError::new(ErrorKind::WorkspaceBusy, "another Somnia run owns this workspace"));
    }
    Ok(())
}

fn attribution_trailer(spec: &RunSpec) -> Result<String> {
    // Owner decision D2: attribution is opt-in. The noreply identity is not chosen yet, so it must be supplied; never invented.
    let email = std::env::var("SOMNIA_ATTRIBUTION_EMAIL").unwrap_or_default();
    if email.trim().is_empty() || email.contains(['<', '>', '\n']) {
        return Err(CliError::new(ErrorKind::BadRequest, "attribution requested but SOMNIA_ATTRIBUTION_EMAIL (noreply identity) is not set"));
    }
    let name = std::env::var("SOMNIA_ATTRIBUTION_NAME").unwrap_or_else(|_| "Somnia Agent".into());
    if name.contains(['<', '>', '\n']) {
        return Err(CliError::new(ErrorKind::BadRequest, "invalid SOMNIA_ATTRIBUTION_NAME"));
    }
    Ok(format!("Co-authored-by: {name} <{}>\nX-Somnia-Session: {}", email.trim(), spec.task_id))
}

struct EventLog {
    path: PathBuf,
    task_id: String,
    seq: u64,
}
impl EventLog {
    fn emit(&mut self, ev: RunEvent, sink: &mut dyn FnMut(&EventFrame)) -> Result<()> {
        self.seq += 1;
        let frame = EventFrame { protocol: PROTOCOL_VERSION, task_id: self.task_id.clone(), seq: self.seq, event: ev };
        let mut f = OpenOptions::new().create(true).append(true).open(&self.path)?;
        writeln!(f, "{}", serde_json::to_string(&frame)?)?;
        sink(&frame);
        Ok(())
    }
}

fn under(path: &str, roots: &[String]) -> bool {
    roots.iter().any(|r| {
        let r = r.trim_start_matches("./").trim_end_matches('/');
        r.is_empty() || r == "." || path == r || path.starts_with(&format!("{r}/"))
    })
}

/// Runs the whole task. Errors before the record exists are returned as Err (nothing started);
/// afterwards every outcome, including failure, is a persisted record.
pub fn execute(spec: &RunSpec, engine: &dyn TaskEngine, cancel: &Arc<AtomicBool>, sink: &mut dyn FnMut(&EventFrame)) -> Result<SessionRecord> {
    preflight_inner(spec)?;
    let _lock = WorkspaceLock::acquire(&spec.root)?;
    let root = &spec.root;
    let base = gitops::head_sha(root)?;
    let branch = branch_name(spec);
    gitops::git(root, &["switch", "-c", &branch], None)?;
    gitops::git(root, &["update-ref", &format!("refs/somnia/safety/{}", spec.task_id), &base], None)?;

    let mut rec = SessionRecord {
        schema: RECORD_SCHEMA.into(),
        task_id: spec.task_id.clone(),
        repo_id: repo_id(root),
        branch: branch.clone(),
        base_sha: Some(base.clone()),
        head_sha: None,
        allowed_roots: spec.allowed_roots.clone(),
        producer: Producer { kind: "builtin".into(), name: "somnia-agent".into(), ..Default::default() },
        prompt: spec.prompt.clone(),
        plan: None,
        overrides: Overrides { bare: spec.bare, yes: spec.yes, attribution: spec.attribution, studio: spec.studio.clone(), branch: spec.branch.clone() },
        status: Status::Preparing,
        verification: None,
        usage: Usage::default(),
        unreviewed_checkpoint: false,
        error: None,
        created_at: record::now(),
        updated_at: 0,
    };
    record::save(root, &mut rec)?;
    let mut log = EventLog { path: record::events_path(root, &spec.task_id), task_id: spec.task_id.clone(), seq: 0 };
    log.emit(RunEvent::Status { status: Status::Running }, sink)?;
    rec.status = Status::Running;
    record::save(root, &mut rec)?;

    let task = EngineTask {
        task_id: spec.task_id.clone(),
        prompt: spec.prompt.clone(),
        cwd: root.to_string_lossy().into_owned(),
        allowed_roots: spec.allowed_roots.clone(),
        bare: spec.bare,
        studio: spec.studio.clone(),
        max_tokens: spec.max_tokens,
        max_cost: spec.max_cost,
    };
    let mut plan: Option<String> = None;
    let mut pending: Vec<RunEvent> = vec![];
    let outcome = engine.run(&task, cancel, &mut |e| match e {
        EngineEvent::Progress { text } => pending.push(RunEvent::Progress { text: text.clone() }),
        EngineEvent::Plan { text } => {
            plan = Some(text.clone());
            pending.push(RunEvent::Plan { text: text.clone() })
        }
        _ => {}
    });
    for ev in pending {
        log.emit(ev, sink)?;
    }
    rec.plan = plan;

    let finish: Result<()> = (|| {
        match outcome {
            Err(e) => Err(e),
            Ok(None) => {
                rec.status = Status::Cancelled;
                Ok(())
            }
            Ok(Some(EngineEvent::Failed { message })) => Err(CliError::new(ErrorKind::Internal, message)),
            Ok(Some(EngineEvent::NeedsInput { reason })) => {
                rec.status = Status::WaitingInput;
                log.emit(RunEvent::NeedsInput { reason }, sink)
            }
            Ok(Some(EngineEvent::Done { summary, tokens, cost, verification })) => {
                rec.usage = Usage { tokens, cost };
                rec.verification = verification;
                finish_done(spec, &mut rec, &base, summary.as_deref())
            }
            Ok(Some(_)) => Err(CliError::new(ErrorKind::Internal, "engine returned a non-terminal event as outcome")),
        }
    })();
    if let Err(e) = finish {
        rec.status = if e.kind == ErrorKind::ReviewRequired { Status::Review } else { Status::Failed };
        rec.error = Some(e);
    }
    record::save(root, &mut rec)?;
    log.emit(RunEvent::Result { summary: Box::new(rec.summary()) }, sink)?;
    Ok(rec)
}

fn preflight_inner(spec: &RunSpec) -> Result<()> {
    // Same checks as `preflight`, minus the lock probe (execute takes the real lock right after).
    let s = spec;
    if !record::valid_task_id(&s.task_id) {
        return Err(CliError::new(ErrorKind::BadRequest, "invalid task id"));
    }
    gitops::git_available()?;
    gitops::head_sha(&s.root)?;
    gitops::ensure_private_store(&s.root)?;
    if s.yes {
        gitops::identity_configured(&s.root)?;
    }
    if s.attribution {
        attribution_trailer(s)?;
    }
    guard::check_gui_state(&s.root, &s.allowed_roots)?;
    let dirty = gitops::dirty_paths(&s.root)?;
    if !dirty.is_empty() {
        return Err(CliError::new(ErrorKind::DirtyWorktree, "working tree has uncommitted changes; agent runs start from a clean tree")
            .with_details(serde_json::json!({"paths": dirty})));
    }
    let b = branch_name(s);
    gitops::git(&s.root, &["check-ref-format", "--branch", &b], None).map_err(|_| CliError::new(ErrorKind::BadRequest, "invalid branch name"))?;
    if gitops::git(&s.root, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{b}")], None).is_ok() {
        return Err(CliError::new(ErrorKind::BadRequest, format!("branch {b} already exists")));
    }
    Ok(())
}

fn finish_done(spec: &RunSpec, rec: &mut SessionRecord, base: &str, summary: Option<&str>) -> Result<()> {
    let root = &spec.root;
    // Unsaved-buffer guard is a BLOCKER again right before anything is committed.
    guard::check_gui_state(root, &spec.allowed_roots)?;
    let changes = gitops::dirty_paths(root)?;
    if changes.is_empty() {
        rec.head_sha = Some(base.to_string());
        rec.status = Status::Done;
        return Ok(());
    }
    if !spec.yes {
        // L0: commit gate stays manual. Work sits uncommitted on the task branch, awaiting review.
        rec.status = Status::Review;
        return Ok(());
    }
    let outside: Vec<&String> = changes.iter().filter(|p| !under(p, &spec.allowed_roots)).collect();
    if !outside.is_empty() {
        return Err(CliError::new(ErrorKind::ReviewRequired, "engine changed files outside the allowed roots; nothing was committed")
            .with_details(serde_json::json!({"outside_roots": outside})));
    }
    let mut add: Vec<&str> = vec!["add", "-A", "--"];
    let roots: Vec<&str> = spec.allowed_roots.iter().map(|s| s.as_str()).collect();
    add.extend(roots);
    gitops::git(root, &add, None)?;
    let title: String = spec.prompt.lines().next().unwrap_or("agent task").chars().take(60).collect();
    let mut msg = format!("Somnia agent: {title}\n");
    if let Some(s) = summary.filter(|s| !s.trim().is_empty()) {
        msg.push_str(&format!("\n{}\n", s.trim()));
    }
    if spec.attribution {
        msg.push_str(&format!("\n{}\n", attribution_trailer(spec)?));
    }
    gitops::git(root, &["commit", "-q", "-F", "-"], Some(&msg))?;
    rec.head_sha = Some(gitops::head_sha(root)?);
    rec.unreviewed_checkpoint = true;
    rec.status = Status::Done;
    Ok(())
}

/// Atomic claim of a request id: protects against duplicate runs after reconnect/retry.
pub fn claim_request(root: &Path, request_id: &str, task_id: &str) -> Result<Option<String>> {
    let dir = root.join(".somnia").join("requests");
    fs::create_dir_all(&dir)?;
    let h = Sha256::digest(request_id.as_bytes());
    let name: String = h.iter().take(16).map(|b| format!("{b:02x}")).collect();
    let p = dir.join(format!("{name}.json"));
    match OpenOptions::new().write(true).create_new(true).open(&p) {
        Ok(mut f) => {
            writeln!(f, "{}", serde_json::json!({"request_id": request_id, "task_id": task_id}))?;
            Ok(None)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            // The winner may still be writing; retry briefly.
            for _ in 0..20 {
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&fs::read(&p)?) {
                    if v["request_id"] == request_id {
                        return Ok(v["task_id"].as_str().map(String::from));
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(CliError::new(ErrorKind::Internal, "request claim unreadable"))
        }
        Err(e) => Err(e.into()),
    }
}

pub fn cancel_flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}
