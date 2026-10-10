//! Task-engine adapter (D5: TS agent engine as a sidecar). The Rust side only knows the `TaskEngine` trait;
//! S9's task-engine contract plugs in by implementing it (see `SidecarEngine` for the stdio NDJSON shape used here).
//!
//! Sidecar stdio protocol "somnia.task-engine/1" (ADAPTER ASSUMPTION, to be reconciled with S9):
//!   -> {"op":"start","contract":"somnia.task-engine/1","task":{taskId,prompt,cwd,allowedRoots,bare,studio,maxTokens,maxCost}}
//!   <- {"event":"progress","text":".."} | {"event":"plan","text":".."} | {"event":"needs-input","reason":".."}
//!      | {"event":"done","summary":"..","tokens":N,"cost":F,"verification":{..}} | {"event":"failed","message":".."}
//! Credentials are never sent over this channel; provider keys come from the sidecar's own environment.
use crate::error::{CliError, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

pub const ENGINE_CONTRACT: &str = "somnia.task-engine/1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTask {
    pub task_id: String,
    pub prompt: String,
    pub cwd: String,
    pub allowed_roots: Vec<String>,
    pub bare: bool,
    pub studio: Option<String>,
    pub max_tokens: Option<u64>,
    pub max_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum EngineEvent {
    Progress { text: String },
    Plan { text: String },
    NeedsInput { reason: String },
    Done { #[serde(default)] summary: Option<String>, #[serde(default)] tokens: Option<u64>, #[serde(default)] cost: Option<f64>, #[serde(default)] verification: Option<Value> },
    Failed { message: String },
}

impl EngineEvent {
    pub fn is_terminal(&self) -> bool {
        matches!(self, EngineEvent::Done { .. } | EngineEvent::Failed { .. } | EngineEvent::NeedsInput { .. })
    }
}

pub trait TaskEngine {
    /// Run to a terminal event. Must stop promptly when `cancel` is set (returns Ok(None)).
    fn run(&self, task: &EngineTask, cancel: &Arc<AtomicBool>, on_event: &mut dyn FnMut(&EngineEvent)) -> Result<Option<EngineEvent>>;
}

pub struct SidecarEngine {
    pub command: Vec<String>,
}

impl SidecarEngine {
    /// `SOMNIA_ENGINE_CMD` = JSON array (e.g. ["node","/path/engine.mjs"]); otherwise `node <exe-dir>/sidecar/engine.mjs`.
    pub fn from_env() -> Result<Self> {
        if let Ok(raw) = std::env::var("SOMNIA_ENGINE_CMD") {
            let cmd: Vec<String> = serde_json::from_str(&raw).map_err(|_| CliError::new(ErrorKind::BadRequest, "SOMNIA_ENGINE_CMD must be a JSON array of strings"))?;
            if cmd.is_empty() {
                return Err(CliError::new(ErrorKind::BadRequest, "SOMNIA_ENGINE_CMD is empty"));
            }
            return Ok(Self { command: cmd });
        }
        let exe = std::env::current_exe()?;
        let p = exe.parent().map(|d| d.join("sidecar").join("engine.mjs")).unwrap_or_default();
        if !p.exists() {
            return Err(CliError::new(ErrorKind::EngineUnavailable, "agent engine sidecar not found (set SOMNIA_ENGINE_CMD or install sidecar/engine.mjs next to the binary)"));
        }
        Ok(Self { command: vec!["node".into(), p.to_string_lossy().into_owned()] })
    }
}

impl TaskEngine for SidecarEngine {
    fn run(&self, task: &EngineTask, cancel: &Arc<AtomicBool>, on_event: &mut dyn FnMut(&EngineEvent)) -> Result<Option<EngineEvent>> {
        let mut child = Command::new(&self.command[0])
            .args(&self.command[1..])
            .current_dir(&task.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| CliError::new(ErrorKind::EngineUnavailable, format!("cannot start engine sidecar: {e}")))?;
        let mut stdin = child.stdin.take().unwrap();
        let start = serde_json::json!({"op":"start","contract":ENGINE_CONTRACT,"task":task});
        writeln!(stdin, "{start}")?;
        stdin.flush()?;
        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            for l in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
        let result = loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Ok(None);
            }
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(line) => {
                    let ev: EngineEvent = match serde_json::from_str(&line) {
                        Ok(e) => e,
                        Err(_) => continue, // tolerate non-contract noise lines; never forward them
                    };
                    on_event(&ev);
                    if ev.is_terminal() {
                        break Some(ev);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break None,
            }
        };
        drop(stdin);
        let _ = child.kill();
        let _ = child.wait();
        match result {
            Some(ev) => Ok(Some(ev)),
            None => Err(CliError::new(ErrorKind::EngineUnavailable, "engine sidecar exited without a terminal event")),
        }
    }
}
