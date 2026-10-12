//! The ACP client: JSON-RPC 2.0 over newline-delimited stdio.

use crate::events::EventLog;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use vibespace_policy::sanitize::sanitize_text;
use vibespace_policy::{
    ActionKind, AgentHandle, ArgsDigest, Command, DenyReason, EffectOutcome, ExecutionBinding, Origin,
    PollResult, ProcessError, ProcessExecutor, ProcessSession, Proposal, ProposeResult, RunId, ScopeId,
};

const PROTOCOL_VERSION: u64 = 1;
const MAX_LINE: usize = 4 * 1024 * 1024;

/// Client failures. Never carry prompt text, argv or approval tokens.
#[derive(Debug)]
pub enum AcpError {
    /// Process layer refused or failed (isolation missing, spawn failed, token rejected).
    Process(ProcessError),
    /// The broker denied starting the agent.
    LaunchDenied(DenyReason),
    /// The user did not decide on the launch in time.
    LaunchTimedOut,
    /// Broker bookkeeping failed.
    Broker(String),
    /// The agent speaks another protocol version.
    VersionMismatch(u64),
    /// The agent returned a JSON-RPC error (code only).
    Rpc(i64),
    /// Malformed or oversized message.
    Protocol(&'static str),
    /// The agent did not answer in time.
    Timeout,
    /// The agent process or stream is gone.
    Closed,
    /// The agent does not advertise `loadSession`.
    ResumeUnsupported,
    /// No session started yet.
    NoSession,
}

impl fmt::Display for AcpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AcpError::Process(e) => write!(f, "process: {e}"),
            AcpError::LaunchDenied(r) => write!(f, "launch denied: {}", r.as_str()),
            AcpError::VersionMismatch(v) => write!(f, "unsupported ACP protocol version {v}"),
            AcpError::Rpc(c) => write!(f, "agent error {c}"),
            AcpError::Protocol(w) => write!(f, "protocol: {w}"),
            AcpError::Broker(w) => write!(f, "broker: {w}"),
            AcpError::LaunchTimedOut => f.write_str("launch approval timed out"),
            AcpError::Timeout => f.write_str("timeout"),
            AcpError::Closed => f.write_str("agent closed"),
            AcpError::ResumeUnsupported => f.write_str("agent does not support session resume"),
            AcpError::NoSession => f.write_str("no session"),
        }
    }
}
impl std::error::Error for AcpError {}
impl From<ProcessError> for AcpError {
    fn from(e: ProcessError) -> Self {
        AcpError::Process(e)
    }
}

/// Client configuration.
#[derive(Clone, Debug)]
pub struct AcpConfig {
    /// Display name of the external agent (shown as the proposal origin).
    pub agent_name: String,
    /// Broker run this agent belongs to.
    pub run_id: RunId,
    /// Broker scope of the run.
    pub scope_id: ScopeId,
    /// Session working directory announced to the agent (inside the isolated root).
    pub cwd: String,
    /// Persistent event log (JSONL).
    pub event_log: PathBuf,
    /// How long a permission request may wait for the user before it is answered "cancelled".
    pub permission_timeout: Duration,
    /// How long a plain request (initialize, session/new, session/load) may take.
    pub request_timeout: Duration,
    /// How long a prompt turn may take.
    pub prompt_timeout: Duration,
}

impl AcpConfig {
    /// Defaults: 5 min permission wait, 30 s requests, 30 min prompt turns.
    pub fn new(agent_name: &str, run_id: RunId, scope_id: ScopeId, cwd: &str, event_log: PathBuf) -> Self {
        Self {
            agent_name: agent_name.to_string(),
            run_id,
            scope_id,
            cwd: cwd.to_string(),
            event_log,
            permission_timeout: Duration::from_secs(300),
            request_timeout: Duration::from_secs(30),
            prompt_timeout: Duration::from_secs(1800),
        }
    }
}

/// How one permission request ended (also recorded in the event log).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PermissionOutcome {
    /// The broker allowed it; the chosen ACP option id was returned.
    Allowed(String),
    /// The broker (or the user) denied it.
    Denied(String),
    /// Cancelled: timeout, cancel, no fitting option, or the stream ended.
    Cancelled,
}

type Reply = Result<Value, AcpError>;

struct Shared {
    writer: Mutex<Box<dyn Write + Send>>,
    pending: Mutex<HashMap<u64, Sender<Reply>>>,
    next_id: AtomicU64,
    log: EventLog,
    agent: AgentHandle,
    cfg: AcpConfig,
    closed: AtomicBool,
    /// Bumped by cancel: in-flight permission waits end as "cancelled".
    cancel_epoch: AtomicU64,
}

impl Shared {
    fn send(&self, v: &Value) -> Result<(), AcpError> {
        let mut w = self.writer.lock().map_err(|_| AcpError::Closed)?;
        let mut line = v.to_string();
        line.push('\n');
        w.write_all(line.as_bytes()).map_err(|_| AcpError::Closed)?;
        w.flush().map_err(|_| AcpError::Closed)
    }

    fn request(&self, method: &str, params: Value, timeout: Duration) -> Reply {
        if self.closed.load(Ordering::SeqCst) {
            return Err(AcpError::Closed);
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = channel();
        self.pending.lock().map_err(|_| AcpError::Closed)?.insert(id, tx);
        if let Err(e) = self.send(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})) {
            self.pending.lock().ok().map(|mut p| p.remove(&id));
            return Err(e);
        }
        match rx.recv_timeout(timeout) {
            Ok(r) => r,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                self.pending.lock().ok().map(|mut p| p.remove(&id));
                Err(AcpError::Timeout)
            }
            Err(_) => Err(AcpError::Closed),
        }
    }

    fn fail_all(&self) {
        self.closed.store(true, Ordering::SeqCst);
        if let Ok(mut p) = self.pending.lock() {
            for (_, tx) in p.drain() {
                let _ = tx.send(Err(AcpError::Closed));
            }
        }
    }
}

/// A running ACP session with an external agent.
pub struct AcpClient {
    shared: Arc<Shared>,
    process: Mutex<ProcessSession>,
    session_id: Mutex<Option<String>>,
    agent_caps: Value,
}

impl AcpClient {
    /// Propose running the agent (origin = the external agent), wait for the user's decision
    /// up to `approval_wait`, start it in the sandbox, and run the ACP handshake.
    pub fn launch(
        agent: &AgentHandle,
        exec: &ProcessExecutor,
        cmd: &Command,
        cfg: AcpConfig,
        approval_wait: Duration,
    ) -> Result<Self, AcpError> {
        let reason = format!("start external agent {}", sanitize_text(&cfg.agent_name, 60));
        let origin = Origin::ExternalAgent {
            name: sanitize_text(&cfg.agent_name, 80),
        };
        let token = match exec.propose_exec(cmd, &reason, origin)? {
            ProposeResult::Denied(r) => return Err(AcpError::LaunchDenied(r)),
            ProposeResult::Approved { token, .. } => token,
            ProposeResult::Pending(id) => {
                let deadline = Instant::now() + approval_wait;
                loop {
                    match agent.poll(&id).map_err(|e| AcpError::Broker(e.to_string()))? {
                        PollResult::Approved { token, .. } => break token,
                        PollResult::Denied(r) => return Err(AcpError::LaunchDenied(r)),
                        PollResult::Gone => return Err(AcpError::LaunchTimedOut),
                        PollResult::Pending => {
                            if Instant::now() >= deadline {
                                return Err(AcpError::LaunchTimedOut);
                            }
                            std::thread::sleep(Duration::from_millis(20));
                        }
                    }
                }
            }
        };
        Self::launch_approved(agent, exec, token, cmd, cfg)
    }

    /// Start under an approval the caller already holds, then handshake.
    pub fn launch_approved(
        agent: &AgentHandle,
        exec: &ProcessExecutor,
        token: vibespace_policy::ApprovalToken,
        cmd: &Command,
        cfg: AcpConfig,
    ) -> Result<Self, AcpError> {
        let log = EventLog::open(&cfg.event_log).map_err(|_| AcpError::Protocol("event log"))?;
        let mut process = exec.spawn_session(token, cmd)?;
        log.append("lifecycle", json!({"event":"launched","agent":sanitize_text(&cfg.agent_name,80)}));
        let io = process.io().ok_or(AcpError::Protocol("no stdio"))?;
        let shared = Arc::new(Shared {
            writer: Mutex::new(io.stdin),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            log,
            agent: agent.clone(),
            cfg,
            closed: AtomicBool::new(false),
            cancel_epoch: AtomicU64::new(0),
        });
        spawn_stderr_drain(io.stderr);
        spawn_reader(shared.clone(), io.stdout);
        let mut client = Self {
            shared,
            process: Mutex::new(process),
            session_id: Mutex::new(None),
            agent_caps: Value::Null,
        };
        match client.handshake() {
            Ok(caps) => client.agent_caps = caps,
            Err(e) => {
                client.kill();
                return Err(e);
            }
        }
        Ok(client)
    }

    fn handshake(&self) -> Result<Value, AcpError> {
        let r = self.shared.request(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                // No client-side fs or terminal: the agent works inside its sandbox only.
                "clientCapabilities": {"fs": {"readTextFile": false, "writeTextFile": false}, "terminal": false},
                "clientInfo": {"name": "somnia", "title": "Somnia", "version": env!("CARGO_PKG_VERSION")}
            }),
            self.shared.cfg.request_timeout,
        )?;
        let v = r["protocolVersion"].as_u64().ok_or(AcpError::Protocol("protocolVersion"))?;
        if v != PROTOCOL_VERSION {
            return Err(AcpError::VersionMismatch(v));
        }
        let caps = r["agentCapabilities"].clone();
        self.shared.log.append("lifecycle", json!({"event":"initialized","agentCapabilities":caps}));
        Ok(caps)
    }

    /// Agent capabilities from the handshake.
    pub fn agent_capabilities(&self) -> &Value {
        &self.agent_caps
    }

    /// Start a new session; returns its id (persisted in the event log).
    pub fn new_session(&self) -> Result<String, AcpError> {
        let r = self.shared.request(
            "session/new",
            json!({"cwd": self.shared.cfg.cwd, "mcpServers": []}),
            self.shared.cfg.request_timeout,
        )?;
        let id = r["sessionId"].as_str().ok_or(AcpError::Protocol("sessionId"))?.to_string();
        self.shared.log.append("session_ready", json!({"sessionId": id, "resumed": false}));
        *self.session_id.lock().map_err(|_| AcpError::Closed)? = Some(id.clone());
        Ok(id)
    }

    /// Resume a persisted session on this (fresh) agent process. Fails visibly when the agent
    /// does not advertise `loadSession`; there is no silent fallback to a new session.
    pub fn resume_session(&self, session_id: &str) -> Result<(), AcpError> {
        if self.agent_caps["loadSession"] != json!(true) {
            return Err(AcpError::ResumeUnsupported);
        }
        self.shared.request(
            "session/load",
            json!({"sessionId": session_id, "cwd": self.shared.cfg.cwd, "mcpServers": []}),
            self.shared.cfg.request_timeout,
        )?;
        self.shared.log.append("session_ready", json!({"sessionId": session_id, "resumed": true}));
        *self.session_id.lock().map_err(|_| AcpError::Closed)? = Some(session_id.to_string());
        Ok(())
    }

    /// Run one prompt turn to completion; returns the agent's `stopReason`.
    pub fn prompt(&self, text: &str) -> Result<String, AcpError> {
        let sid = self.session_id.lock().map_err(|_| AcpError::Closed)?.clone().ok_or(AcpError::NoSession)?;
        self.shared.log.append("prompt", json!({"sessionId": sid, "chars": text.chars().count()}));
        let r = self.shared.request(
            "session/prompt",
            json!({"sessionId": sid, "prompt": [{"type":"text","text": text}]}),
            self.shared.cfg.prompt_timeout,
        )?;
        let stop = r["stopReason"].as_str().unwrap_or("unknown").to_string();
        self.shared.log.append("prompt_done", json!({"stopReason": stop}));
        Ok(stop)
    }

    /// Cancel the current turn: send `session/cancel`, answer waiting permission requests as
    /// cancelled, give the agent `grace` to finish the turn, then kill the process tree through
    /// the isolation layer. `Duration::ZERO` kills immediately.
    pub fn cancel(&self, grace: Duration) {
        self.shared.cancel_epoch.fetch_add(1, Ordering::SeqCst);
        if let Ok(Some(sid)) = self.session_id.lock().map(|s| s.clone()) {
            let _ = self.shared.send(&json!({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":sid}}));
        }
        self.shared.log.append("lifecycle", json!({"event":"cancel_requested"}));
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            if self.shared.pending.lock().map(|p| p.is_empty()).unwrap_or(true) {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        self.kill();
    }

    /// Kill the agent process tree now (isolation layer). Idempotent.
    pub fn kill(&self) {
        if let Ok(mut p) = self.process.lock() {
            let _ = p.kill_tree();
        }
        self.shared.fail_all();
        self.shared.log.append("lifecycle", json!({"event":"killed"}));
    }

    /// True while the agent process runs.
    pub fn is_running(&self) -> bool {
        self.process.lock().map(|mut p| matches!(p.try_wait(), Ok(None))).unwrap_or(false)
    }

    /// Every event recorded so far (same data as the JSONL file).
    pub fn events(&self) -> Vec<Value> {
        crate::events::read_events(self.shared.log.path())
    }
}

impl Drop for AcpClient {
    fn drop(&mut self) {
        self.kill();
    }
}

fn spawn_stderr_drain(mut r: Box<dyn Read + Send>) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while matches!(r.read(&mut buf), Ok(n) if n > 0) {}
    });
}

fn spawn_reader(shared: Arc<Shared>, out: Box<dyn Read + Send>) {
    std::thread::spawn(move || {
        let mut rd = BufReader::new(out);
        loop {
            let mut line = Vec::new();
            let n = (&mut rd).take(MAX_LINE as u64 + 1).read_until(b'\n', &mut line);
            if !matches!(n, Ok(n) if n > 0) {
                break;
            }
            if line.len() > MAX_LINE {
                shared.log.append("lifecycle", json!({"event":"protocol_error","what":"line too long"}));
                break;
            }
            let Ok(v) = serde_json::from_slice::<Value>(&line) else { continue };
            dispatch(&shared, v);
        }
        shared.log.append("lifecycle", json!({"event":"stream_closed"}));
        shared.fail_all();
    });
}

fn dispatch(shared: &Arc<Shared>, v: Value) {
    let method = v["method"].as_str().map(String::from);
    match (method, v.get("id").cloned()) {
        (Some(m), Some(id)) => {
            let sh = shared.clone();
            let params = v["params"].clone();
            std::thread::spawn(move || {
                let resp = match m.as_str() {
                    "session/request_permission" => {
                        let outcome = handle_permission(&sh, &params);
                        json!({"jsonrpc":"2.0","id":id,"result":{"outcome": outcome_json(&outcome)}})
                    }
                    _ => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"method not supported"}}),
                };
                let _ = sh.send(&resp);
            });
        }
        (Some(m), None) => {
            if m == "session/update" {
                shared.log.append("update", v["params"].clone());
            }
        }
        (None, Some(id)) => {
            let Some(id) = id.as_u64() else { return };
            let tx = shared.pending.lock().ok().and_then(|mut p| p.remove(&id));
            if let Some(tx) = tx {
                let r = match v.get("error") {
                    Some(e) => Err(AcpError::Rpc(e["code"].as_i64().unwrap_or(0))),
                    None => Ok(v["result"].clone()),
                };
                let _ = tx.send(r);
            }
        }
        _ => {}
    }
}

fn outcome_json(o: &PermissionOutcome) -> Value {
    match o {
        PermissionOutcome::Allowed(id) | PermissionOutcome::Denied(id) => {
            json!({"outcome":"selected","optionId":id})
        }
        PermissionOutcome::Cancelled => json!({"outcome":"cancelled"}),
    }
}

/// Map an ACP tool kind to a broker action. Unknown kinds become `Mcp`, which the broker
/// always denies (fail closed).
fn map_kind(kind: &str) -> ActionKind {
    match kind {
        "read" | "search" => ActionKind::Read,
        "edit" | "move" => ActionKind::Write,
        "delete" => ActionKind::Delete,
        "execute" => ActionKind::Shell,
        "fetch" => ActionKind::Network,
        _ => ActionKind::Mcp,
    }
}

fn option_of<'a>(options: &'a [Value], kinds: &[&str]) -> Option<&'a str> {
    kinds.iter().find_map(|k| {
        options
            .iter()
            .find(|o| o["kind"] == *k)
            .and_then(|o| o["optionId"].as_str())
    })
}

/// The permission roundtrip: translate into a broker proposal, wait for the broker/user,
/// translate the answer back. No consent decision is ever made here.
fn handle_permission(sh: &Arc<Shared>, params: &Value) -> PermissionOutcome {
    let tc = &params["toolCall"];
    let kind_s = tc["kind"].as_str().unwrap_or("other");
    let kind = map_kind(kind_s);
    let title = sanitize_text(tc["title"].as_str().unwrap_or("tool call"), 200);
    let target = tc["locations"][0]["path"]
        .as_str()
        .map(|p| sanitize_text(p, 200))
        .unwrap_or_else(|| title.clone());
    let options: Vec<Value> = params["options"].as_array().cloned().unwrap_or_default();
    let digest = ArgsDigest::builder(kind, &target)
        .part("acp_kind", kind_s.as_bytes())
        .part("acp_tool_call_id", tc["toolCallId"].as_str().unwrap_or("").as_bytes())
        .part("acp_title", title.as_bytes())
        .finish();
    let binding = ExecutionBinding {
        run_id: sh.cfg.run_id.clone(),
        scope_id: sh.cfg.scope_id.clone(),
        kind,
        target: target.clone(),
        args_digest: digest.clone(),
    };
    let proposal = Proposal {
        run_id: sh.cfg.run_id.clone(),
        scope_id: sh.cfg.scope_id.clone(),
        kind,
        target: target.clone(),
        reason: format!("{} asks: {}", sanitize_text(&sh.cfg.agent_name, 60), title),
        args_digest: digest,
        origin: Origin::ExternalAgent {
            name: sanitize_text(&sh.cfg.agent_name, 80),
        },
        declared_impact: Vec::new(),
    };
    let epoch = sh.cancel_epoch.load(Ordering::SeqCst);
    let outcome = broker_roundtrip(sh, proposal, &binding, &options, epoch);
    sh.log.append(
        "permission",
        json!({
            "kind": kind.as_str(), "acpKind": sanitize_text(kind_s, 40), "target": target, "title": title,
            "decision": match &outcome {
                PermissionOutcome::Allowed(_) => "allowed",
                PermissionOutcome::Denied(_) => "denied",
                PermissionOutcome::Cancelled => "cancelled",
            },
            "optionId": match &outcome {
                PermissionOutcome::Allowed(o) | PermissionOutcome::Denied(o) => json!(o),
                PermissionOutcome::Cancelled => Value::Null,
            },
        }),
    );
    outcome
}

fn deny_outcome(options: &[Value]) -> PermissionOutcome {
    match option_of(options, &["reject_once", "reject_always"]) {
        Some(id) => PermissionOutcome::Denied(id.to_string()),
        None => PermissionOutcome::Cancelled,
    }
}

fn broker_roundtrip(
    sh: &Arc<Shared>,
    proposal: Proposal,
    binding: &ExecutionBinding,
    options: &[Value],
    epoch: u64,
) -> PermissionOutcome {
    let allow = |basis_for_run: bool, token| -> PermissionOutcome {
        // Burn the token and audit the (agent-side) effect so the approval cannot dangle.
        if let Ok(guard) = sh.agent.consume(token, binding) {
            guard.complete(EffectOutcome::Ok { bytes: 0 });
        } else {
            return PermissionOutcome::Cancelled;
        }
        let pick = if basis_for_run {
            option_of(options, &["allow_always", "allow_once"])
        } else {
            option_of(options, &["allow_once"])
        };
        match pick {
            Some(id) => PermissionOutcome::Allowed(id.to_string()),
            None => PermissionOutcome::Cancelled,
        }
    };
    let res = match sh.agent.propose(proposal) {
        Ok(r) => r,
        Err(_) => return deny_outcome(options),
    };
    match res {
        ProposeResult::Denied(_) => deny_outcome(options),
        ProposeResult::Approved { token, basis, .. } => {
            allow(basis == vibespace_policy::Decision::AllowForRun, token)
        }
        ProposeResult::Pending(id) => {
            let deadline = Instant::now() + sh.cfg.permission_timeout;
            loop {
                if sh.closed.load(Ordering::SeqCst) || sh.cancel_epoch.load(Ordering::SeqCst) != epoch {
                    return PermissionOutcome::Cancelled;
                }
                match sh.agent.poll(&id) {
                    Ok(PollResult::Approved { token, basis }) => {
                        return allow(basis == vibespace_policy::Decision::AllowForRun, token)
                    }
                    Ok(PollResult::Denied(_)) => return deny_outcome(options),
                    Ok(PollResult::Gone) | Err(_) => return PermissionOutcome::Cancelled,
                    Ok(PollResult::Pending) => {}
                }
                if Instant::now() >= deadline {
                    return PermissionOutcome::Cancelled;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        }
    }
}
