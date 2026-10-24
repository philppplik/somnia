//! ACP bridge core (Welle-B A2): external ACP agents as runs of the ONE consent broker of the
//! owning `Runtime`. No tauri types here, so it is unit-testable without the desktop feature.
//!
//! * Isolation: the agent starts only through `ProcessExecutor` (bubblewrap + seccomp on
//!   Linux). No isolation means no spawn: the launch call fails with
//!   `vibespace_acp_isolation_unavailable` before anything starts. There is no elevated path.
//! * Consent: every permission request is a broker proposal of the session's run; the user
//!   answers through `Runtime::decide_acp` (same broker, same offered choices).
//! * The agent works in its own isolated root under the app data dir. It never sees a Space
//!   folder or the host home.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use somnia_vibespace_core::{runtime::Runtime, wire as w};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vibespace_acp::{last_session_id, read_events, AcpClient, AcpConfig, AcpError};
use vibespace_policy as policy;

/// Called (from a bridge thread) with `(session_key, reason)` whenever the session state
/// changed: status, event log or pending consent. The caller re-reads with `state`.
pub type Notify = Arc<dyn Fn(&str, &str) + Send + Sync>;

const MAX_SESSIONS: usize = 4;
const APPROVAL_WAIT: Duration = Duration::from_secs(300);
const MAX_PROMPT_CHARS: usize = 100_000;
const MAX_STATE_EVENTS: usize = 500;

/// Bridge failure: a fixed code, never agent output, argv or paths.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BridgeError(pub &'static str);

type Result<T> = std::result::Result<T, BridgeError>;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcpLaunch {
    /// Display name, also the persistence key of the agent's event log.
    pub name: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchReply {
    pub session_key: String,
    pub run_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateReply {
    /// `awaiting_approval` | `ready` | `failed` | `closed`.
    pub status: String,
    /// Fixed failure code when `status` is `failed`.
    pub failure: Option<String>,
    pub run_id: String,
    pub name: String,
    /// Pending consent of the run (broker `PendingView` wire form, origin included).
    pub pending: Vec<Value>,
    /// Persistent ACP event log, oldest first (last 500).
    pub events: Vec<Value>,
    /// Newest persisted ACP session id of this agent (for resume).
    pub last_session_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Status {
    AwaitingApproval,
    Ready,
    Failed(&'static str),
    Closed,
}
impl Status {
    fn word(&self) -> &'static str {
        match self {
            Status::AwaitingApproval => "awaiting_approval",
            Status::Ready => "ready",
            Status::Failed(_) => "failed",
            Status::Closed => "closed",
        }
    }
}

struct Session {
    run_id: policy::RunId,
    name: String,
    log: PathBuf,
    status: Mutex<Status>,
    client: Mutex<Option<Arc<AcpClient>>>,
    broker: policy::BrokerHandles,
    stop: AtomicBool,
    /// File enforcement of the run's isolated root (kept alive with the session).
    _files: Mutex<Option<policy::FileExecutor>>,
}

#[derive(Default)]
pub struct AcpBridge {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

fn slug(name: &str) -> Result<String> {
    let t = name.trim();
    if t.is_empty() || t.chars().count() > 60 || t.chars().any(|c| c.is_control()) {
        return Err(BridgeError("vibespace_acp_invalid_agent"));
    }
    let s: String = t
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    Ok(s)
}

fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    m.lock().map_err(|_| BridgeError("vibespace_acp_failed"))
}

fn process_error_code(e: &policy::ProcessError) -> &'static str {
    match e {
        policy::ProcessError::IsolationUnavailable(_) | policy::ProcessError::UnsupportedPlatform(_) => {
            "vibespace_acp_isolation_unavailable"
        }
        _ => "vibespace_acp_failed",
    }
}

fn acp_error_code(e: &AcpError) -> &'static str {
    match e {
        AcpError::Process(p) => process_error_code(p),
        AcpError::LaunchDenied(_) => "vibespace_acp_launch_denied",
        AcpError::LaunchTimedOut => "vibespace_acp_launch_timeout",
        AcpError::VersionMismatch(_) => "vibespace_acp_version",
        AcpError::ResumeUnsupported => "vibespace_acp_resume_unsupported",
        AcpError::Timeout => "vibespace_acp_timeout",
        AcpError::Closed => "vibespace_acp_closed",
        _ => "vibespace_acp_failed",
    }
}

#[cfg(target_os = "linux")]
fn make_executor(
    agent: &policy::AgentHandle,
    run: &policy::RunId,
    scope: &policy::ScopeId,
    work: &Path,
) -> std::result::Result<policy::ProcessExecutor, policy::ProcessError> {
    let launcher = policy::proc::linux::BwrapLauncher::detect()?.with_root(work)?;
    policy::ProcessExecutor::attach_with_launcher(
        agent,
        run.clone(),
        scope.clone(),
        policy::ExecMode::Sandboxed,
        Box::new(launcher),
        policy::ProcessLimits::default(),
    )
}

#[cfg(not(target_os = "linux"))]
fn make_executor(
    agent: &policy::AgentHandle,
    run: &policy::RunId,
    scope: &policy::ScopeId,
    _work: &Path,
) -> std::result::Result<policy::ProcessExecutor, policy::ProcessError> {
    // Windows: the AppContainer launcher has no interactive sessions yet, so this attaches but
    // the spawn fails closed. macOS: unavailable.
    policy::ProcessExecutor::attach(agent, run.clone(), scope.clone(), policy::ProcessLimits::default())
}

impl AcpBridge {
    fn session(&self, key: &str) -> Result<Arc<Session>> {
        lock(&self.sessions)?
            .get(key)
            .cloned()
            .ok_or(BridgeError("vibespace_acp_unknown_session"))
    }

    /// Register the run, attach isolation, and start the agent in the background (the launch
    /// consent waits for the user). Fails closed and synchronously when isolation is missing.
    /// Blocking (capability probe): call from a blocking context.
    pub fn launch(
        &self,
        runtime: &Runtime,
        data_dir: &Path,
        spec: AcpLaunch,
        notify: Notify,
    ) -> Result<LaunchReply> {
        let slug = slug(&spec.name)?;
        let name = policy::sanitize::sanitize_text(spec.name.trim(), 60);
        let cmd = policy::Command::new(spec.program, spec.args)
            .map_err(|_| BridgeError("vibespace_acp_invalid_command"))?;
        {
            let sessions = lock(&self.sessions)?;
            let live = sessions
                .values()
                .filter(|s| !matches!(lock(&s.status).map(|g| g.clone()), Ok(Status::Closed | Status::Failed(_))))
                .count();
            if live >= MAX_SESSIONS {
                return Err(BridgeError("vibespace_acp_session_limit"));
            }
        }
        let key = format!("acp-{}", uuid::Uuid::new_v4());
        let run_id = policy::RunId::new(&key).map_err(|_| BridgeError("vibespace_acp_failed"))?;
        let scope_id = policy::ScopeId::new(format!("{key}-root")).map_err(|_| BridgeError("vibespace_acp_failed"))?;
        let agent_dir = data_dir.join("acp").join(&slug);
        let work = agent_dir.join("sessions").join(&key).join("work");
        std::fs::create_dir_all(&work).map_err(|_| BridgeError("vibespace_acp_failed"))?;
        let work = work.canonicalize().map_err(|_| BridgeError("vibespace_acp_failed"))?;
        let log = agent_dir.join("events.jsonl");

        let broker = runtime.acp_broker();
        let mut scope = policy::RunScope::new(run_id.clone(), scope_id.clone());
        scope.label = name.clone();
        scope.allowed_kinds = [
            policy::ActionKind::Shell,
            policy::ActionKind::Read,
            policy::ActionKind::Write,
            policy::ActionKind::Delete,
        ]
        .into_iter()
        .collect();
        broker.runs.register_run(scope).map_err(|_| BridgeError("vibespace_acp_failed"))?;
        let abort = |code: &'static str| {
            let _ = broker.runs.cancel_run(&run_id, Duration::from_secs(1));
            BridgeError(code)
        };
        policy::IsolatedRoot::initialize(&work).map_err(|_| abort("vibespace_acp_failed"))?;
        let files = policy::FileExecutor::attach(
            &broker.agent,
            run_id.clone(),
            scope_id.clone(),
            policy::IsolatedRoot::open(&work).map_err(|_| abort("vibespace_acp_failed"))?,
            policy::FileLimits::default(),
        )
        .map_err(|_| abort("vibespace_acp_failed"))?;
        let exec = make_executor(&broker.agent, &run_id, &scope_id, &work)
            .map_err(|e| abort(process_error_code(&e)))?;
        let cmd = cmd
            .with_cwd(work.to_string_lossy().into_owned())
            .map_err(|_| abort("vibespace_acp_invalid_command"))?;

        let session = Arc::new(Session {
            run_id: run_id.clone(),
            name: name.clone(),
            log: log.clone(),
            status: Mutex::new(Status::AwaitingApproval),
            client: Mutex::new(None),
            broker: broker.clone(),
            stop: AtomicBool::new(false),
            _files: Mutex::new(Some(files)),
        });
        lock(&self.sessions)?.insert(key.clone(), session.clone());

        // Start thread: launch consent (user decides via decide_acp), spawn, handshake.
        {
            let (session, notify, key) = (session.clone(), notify.clone(), key.clone());
            let cfg = AcpConfig::new(&name, run_id.clone(), scope_id, &work.to_string_lossy(), log);
            std::thread::spawn(move || {
                let r = AcpClient::launch(&session.broker.agent, &exec, &cmd, cfg, APPROVAL_WAIT);
                let next = match r {
                    Ok(c) => {
                        if let Ok(mut g) = session.client.lock() {
                            *g = Some(Arc::new(c));
                        }
                        Status::Ready
                    }
                    Err(e) => Status::Failed(acp_error_code(&e)),
                };
                let ready = next == Status::Ready;
                if let Ok(mut g) = session.status.lock() {
                    if *g != Status::Closed {
                        *g = next;
                    }
                }
                notify(&key, "status");
                // Linux ties the sandbox to the SPAWNING THREAD (PR_SET_PDEATHSIG on bwrap's
                // --die-with-parent fires when that thread exits). Keep this thread alive for
                // the whole session; it ends on close or when the agent process is gone.
                while ready && !session.stop.load(Ordering::SeqCst) {
                    let alive = session.client.lock().ok().and_then(|g| g.clone()).map(|c| c.is_running()).unwrap_or(false);
                    if !alive {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            });
        }
        // Watcher: tells the frontend when something changed (status, events, pending consent).
        {
            let (session, notify, key) = (session.clone(), notify, key.clone());
            std::thread::spawn(move || {
                let mut last = String::new();
                loop {
                    let status = session.status.lock().map(|g| g.word()).unwrap_or("closed");
                    let events = read_events(&session.log).len();
                    let pending = session
                        .broker
                        .ui
                        .pending_for_run(&session.run_id)
                        .map(|p| p.iter().map(|r| r.request_id.to_string()).collect::<Vec<_>>().join(","))
                        .unwrap_or_default();
                    let sig = format!("{status}|{events}|{pending}");
                    if sig != last {
                        last = sig;
                        notify(&key, "changed");
                    }
                    if session.stop.load(Ordering::SeqCst) || matches!(status, "closed" | "failed") {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(150));
                }
            });
        }
        Ok(LaunchReply { session_key: key, run_id: run_id.to_string() })
    }

    fn ready_client(&self, key: &str) -> Result<(Arc<Session>, Arc<AcpClient>)> {
        let s = self.session(key)?;
        let c = lock(&s.client)?.clone().ok_or(BridgeError("vibespace_acp_not_ready"))?;
        Ok((s, c))
    }

    /// Start a session on the agent, or resume the newest persisted one. Blocking.
    pub fn open_session(&self, key: &str, resume: bool) -> Result<String> {
        let (s, c) = self.ready_client(key)?;
        if resume {
            let id = last_session_id(&s.log).ok_or(BridgeError("vibespace_acp_no_session_to_resume"))?;
            c.resume_session(&id).map_err(|e| BridgeError(acp_error_code(&e)))?;
            Ok(id)
        } else {
            c.new_session().map_err(|e| BridgeError(acp_error_code(&e)))
        }
    }

    /// Run one prompt turn; returns the stop reason. Blocking.
    pub fn prompt(&self, key: &str, text: &str) -> Result<String> {
        if text.is_empty() || text.chars().count() > MAX_PROMPT_CHARS {
            return Err(BridgeError("vibespace_acp_invalid_prompt"));
        }
        let (_, c) = self.ready_client(key)?;
        c.prompt(text).map_err(|e| BridgeError(acp_error_code(&e)))
    }

    /// Decide a pending consent request of this session's run (launch or tool permission).
    pub fn decide(&self, runtime: &Runtime, key: &str, request_id: &str, choice: w::ConsentChoice) -> Result<()> {
        let s = self.session(key)?;
        runtime
            .decide_acp(w::ConsentDecision {
                run_id: s.run_id.to_string(),
                request_id: request_id.to_string(),
                choice,
            })
            .map_err(|_| BridgeError("vibespace_acp_consent_changed"))
    }

    /// Cancel the current turn (grace, then process-tree kill by the isolation layer). With
    /// `close` the agent is killed now, the run's tokens and grants are revoked, and the
    /// session ends. Blocking for up to the grace.
    pub fn cancel(&self, key: &str, grace_ms: u64, close: bool) -> Result<()> {
        let s = self.session(key)?;
        let client = lock(&s.client)?.clone();
        if let Some(c) = &client {
            c.cancel(Duration::from_millis(if close { 0 } else { grace_ms.min(30_000) }));
        }
        if close {
            s.stop.store(true, Ordering::SeqCst);
            let _ = s.broker.runs.cancel_run(&s.run_id, Duration::from_secs(2));
            *lock(&s.status)? = Status::Closed;
            *lock(&s._files)? = None;
        }
        Ok(())
    }

    /// Current state for the frontend (call after a notification, or to resync).
    pub fn state(&self, runtime: &Runtime, key: &str) -> Result<StateReply> {
        let s = self.session(key)?;
        let status = lock(&s.status)?.clone();
        let pending = runtime
            .acp_pending(s.run_id.as_str())
            .map_err(|_| BridgeError("vibespace_acp_failed"))?
            .into_iter()
            .filter_map(|p| serde_json::to_value(p).ok())
            .collect();
        let mut events = read_events(&s.log);
        if events.len() > MAX_STATE_EVENTS {
            events.drain(..events.len() - MAX_STATE_EVENTS);
        }
        Ok(StateReply {
            status: status.word().into(),
            failure: match status {
                Status::Failed(code) => Some(code.into()),
                _ => None,
            },
            run_id: s.run_id.to_string(),
            name: s.name.clone(),
            pending,
            events,
            last_session_id: last_session_id(&s.log),
        })
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use somnia_vibespace_core::ownership::OwnerKind;
    use std::time::Instant;

    const PEER: &str = include_str!("../../vibespace-acp/tests/fixtures/fake_acp_peer.py");

    fn wait<T>(what: &str, mut f: impl FnMut() -> Option<T>) -> T {
        let t0 = Instant::now();
        loop {
            if let Some(v) = f() {
                return v;
            }
            assert!(t0.elapsed() < Duration::from_secs(20), "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn spec() -> AcpLaunch {
        AcpLaunch {
            name: "Fake Agent".into(),
            program: "/usr/bin/python3".into(),
            args: vec!["-c".into(), PEER.into()],
        }
    }

    #[test]
    fn launch_consent_permission_roundtrip_cancel_and_resume_through_the_runtime_broker() {
        let data = tempfile::tempdir().unwrap();
        let runtime = Runtime::open_owned(data.path(), false, OwnerKind::Gui, false).unwrap();
        let bridge = AcpBridge::default();
        let notified = Arc::new(Mutex::new(0usize));
        let n2 = notified.clone();
        let notify: Notify = Arc::new(move |_k, _r| *n2.lock().unwrap() += 1);
        let reply = match bridge.launch(&runtime, data.path(), spec(), notify.clone()) {
            Ok(r) => r,
            Err(BridgeError("vibespace_acp_isolation_unavailable")) => {
                eprintln!("SKIP: host cannot run the bubblewrap sandbox");
                return;
            }
            Err(e) => panic!("{e:?}"),
        };
        assert!(reply.session_key.starts_with("acp-"));
        // 1. The launch is a consent request with the external-agent origin, in the SAME broker.
        let st = wait("launch consent", || {
            let s = bridge.state(&runtime, &reply.session_key).unwrap();
            (!s.pending.is_empty()).then_some(s)
        });
        assert_eq!(st.status, "awaiting_approval");
        assert_eq!(st.pending[0]["origin"]["type"], "external_agent");
        assert_eq!(st.pending[0]["origin"]["name"], "Fake Agent");
        assert_eq!(st.pending[0]["kind"], "shell");
        let rid = st.pending[0]["requestId"].as_str().unwrap().to_string();
        // The regular run decide path refuses ACP runs; only the ACP path decides them.
        assert!(runtime
            .decide(w::ConsentDecision {
                run_id: reply.run_id.clone(),
                request_id: rid.clone(),
                choice: w::ConsentChoice::AllowOnce
            })
            .is_err());
        bridge.decide(&runtime, &reply.session_key, &rid, w::ConsentChoice::AllowOnce).unwrap();
        wait("ready", || {
            (bridge.state(&runtime, &reply.session_key).unwrap().status == "ready").then_some(())
        });
        let sid = bridge.open_session(&reply.session_key, false).unwrap();
        // 2. A tool permission request waits for the user and is answered through the broker.
        let b = Arc::new(bridge);
        let (b2, key2) = (b.clone(), reply.session_key.clone());
        let turn = std::thread::spawn(move || b2.prompt(&key2, "ask:edit"));
        let st = wait("tool consent", || {
            let s = b.state(&runtime, &reply.session_key).unwrap();
            (!s.pending.is_empty()).then_some(s)
        });
        assert_eq!(st.pending[0]["kind"], "write");
        assert_eq!(st.pending[0]["origin"]["type"], "external_agent");
        let rid = st.pending[0]["requestId"].as_str().unwrap().to_string();
        b.decide(&runtime, &reply.session_key, &rid, w::ConsentChoice::Deny).unwrap();
        assert_eq!(turn.join().unwrap().unwrap(), "end_turn");
        let st = b.state(&runtime, &reply.session_key).unwrap();
        assert!(st.events.iter().any(|e| e["kind"] == "permission" && e["data"]["decision"] == "denied"));
        assert_eq!(st.last_session_id.as_deref(), Some(sid.as_str()));
        // Deciding twice or a foreign id fails closed.
        assert_eq!(
            b.decide(&runtime, &reply.session_key, &rid, w::ConsentChoice::AllowOnce),
            Err(BridgeError("vibespace_acp_consent_changed"))
        );
        // 3. Close kills the agent, ends the run and revokes it.
        b.cancel(&reply.session_key, 0, true).unwrap();
        let st = b.state(&runtime, &reply.session_key).unwrap();
        assert_eq!(st.status, "closed");
        assert!(st.events.iter().any(|e| e["kind"] == "lifecycle" && e["data"]["event"] == "killed"));
        assert_eq!(b.prompt(&reply.session_key, "x"), Err(BridgeError("vibespace_acp_closed")));
        assert!(*notified.lock().unwrap() > 0, "frontend notifications must fire");
        // 4. Resume on a fresh process reuses the persisted session id.
        let r2 = b.launch(&runtime, data.path(), spec(), notify).unwrap();
        let st = wait("launch consent 2", || {
            let s = b.state(&runtime, &r2.session_key).unwrap();
            (!s.pending.is_empty()).then_some(s)
        });
        let rid = st.pending[0]["requestId"].as_str().unwrap().to_string();
        b.decide(&runtime, &r2.session_key, &rid, w::ConsentChoice::AllowOnce).unwrap();
        wait("ready 2", || (b.state(&runtime, &r2.session_key).unwrap().status == "ready").then_some(()));
        assert_eq!(b.open_session(&r2.session_key, true).unwrap(), sid);
        b.cancel(&r2.session_key, 0, true).unwrap();
    }

    #[test]
    fn deny_of_the_launch_consent_fails_the_session_and_nothing_runs() {
        let data = tempfile::tempdir().unwrap();
        let runtime = Runtime::open_owned(data.path(), false, OwnerKind::Gui, false).unwrap();
        let bridge = AcpBridge::default();
        let notify: Notify = Arc::new(|_, _| {});
        let reply = match bridge.launch(&runtime, data.path(), spec(), notify) {
            Ok(r) => r,
            Err(BridgeError("vibespace_acp_isolation_unavailable")) => return,
            Err(e) => panic!("{e:?}"),
        };
        let st = wait("launch consent", || {
            let s = bridge.state(&runtime, &reply.session_key).unwrap();
            (!s.pending.is_empty()).then_some(s)
        });
        let rid = st.pending[0]["requestId"].as_str().unwrap().to_string();
        bridge.decide(&runtime, &reply.session_key, &rid, w::ConsentChoice::Deny).unwrap();
        let st = wait("failed", || {
            let s = bridge.state(&runtime, &reply.session_key).unwrap();
            (s.status == "failed").then_some(s)
        });
        assert_eq!(st.failure.as_deref(), Some("vibespace_acp_launch_denied"));
        assert_eq!(bridge.prompt(&reply.session_key, "x"), Err(BridgeError("vibespace_acp_not_ready")));
    }

    #[test]
    fn input_validation_fails_closed() {
        let data = tempfile::tempdir().unwrap();
        let runtime = Runtime::open_owned(data.path(), false, OwnerKind::Gui, false).unwrap();
        let bridge = AcpBridge::default();
        let notify: Notify = Arc::new(|_, _| {});
        let bad = |name: &str, program: &str| AcpLaunch { name: name.into(), program: program.into(), args: vec![] };
        assert_eq!(bridge.launch(&runtime, data.path(), bad("", "/bin/true"), notify.clone()).unwrap_err(), BridgeError("vibespace_acp_invalid_agent"));
        assert_eq!(bridge.launch(&runtime, data.path(), bad("a\nb", "/bin/true"), notify.clone()).unwrap_err(), BridgeError("vibespace_acp_invalid_agent"));
        assert_eq!(bridge.launch(&runtime, data.path(), bad("ok", ""), notify).unwrap_err(), BridgeError("vibespace_acp_invalid_command"));
        assert_eq!(bridge.state(&runtime, "acp-nope").unwrap_err(), BridgeError("vibespace_acp_unknown_session"));
        // Non-ACP runs can never be decided or listed through the ACP path.
        assert!(runtime.acp_pending("run-1").is_err());
    }
}
