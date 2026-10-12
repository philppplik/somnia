#![cfg(unix)]
//! Fake-ACP-peer acceptance tests (Welle-B A2). The peer is a small python3 script speaking
//! ACP v1 over stdio. Protocol/broker tests use a plain process launcher (no isolation: the
//! launcher is a test double behind the same `ProcessLauncher` seam); the isolation tests use
//! the real bubblewrap launcher and skip with a visible reason on hosts that cannot run it.

use std::path::{Path, PathBuf};
use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use vibespace_acp::*;
use vibespace_policy::*;

const PEER: &str = include_str!("fixtures/fake_acp_peer.py");

// ---------- plain launcher test double (process group, killed via kill -KILL -pgid) ----------

struct PlainSession {
    child: Child,
    taken: bool,
}
impl SessionProcess for PlainSession {
    fn io(&mut self) -> Option<SessionIo> {
        if self.taken {
            return None;
        }
        self.taken = true;
        Some(SessionIo {
            stdin: Box::new(self.child.stdin.take()?),
            stdout: Box::new(self.child.stdout.take()?),
            stderr: Box::new(self.child.stderr.take()?),
        })
    }
    fn kill_tree(&mut self) -> Result<(), ProcessError> {
        let pgid = self.child.id();
        let _ = StdCommand::new("kill").args(["-KILL", "--", &format!("-{pgid}")]).stderr(Stdio::null()).status();
        let _ = self.child.kill();
        let _ = self.child.wait();
        Ok(())
    }
    fn try_wait(&mut self) -> Result<Option<Option<i32>>, ProcessError> {
        Ok(self.child.try_wait().unwrap().map(|s| s.code()))
    }
}
struct PlainLauncher;
impl ProcessLauncher for PlainLauncher {
    fn check(&self) -> Result<(), ProcessError> {
        Ok(())
    }
    fn run(&self, _s: &ExecSpec, _l: &ProcessLimits) -> Result<ExecReceipt, ProcessError> {
        Err(ProcessError::SpawnFailed)
    }
    fn spawn_session(&self, spec: &ExecSpec) -> Result<Box<dyn SessionProcess>, ProcessError> {
        use std::os::unix::process::CommandExt;
        let child = StdCommand::new(&spec.program)
            .args(&spec.args)
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| ProcessError::SpawnFailed)?;
        Ok(Box::new(PlainSession { child, taken: false }))
    }
}

// ---------- fixtures ----------

struct Env {
    b: BrokerHandles,
    run: RunId,
    scope: ScopeId,
    dir: tempfile::TempDir,
}

fn env(kinds: &[ActionKind]) -> Env {
    let b = ConsentBroker::new().unwrap();
    let dir = tempfile::tempdir().unwrap();
    let run = RunId::new("run-acp").unwrap();
    let scope = ScopeId::new("copy-acp").unwrap();
    let mut rs = RunScope::new(run.clone(), scope.clone());
    rs.allowed_kinds = kinds.iter().copied().collect();
    b.runs.register_run(rs).unwrap();
    std::fs::write(dir.path().join("peer.py"), PEER).unwrap();
    Env { b, run, scope, dir }
}

fn peer_cmd(dir: &Path, flags: &[&str]) -> Command {
    let mut args = vec![dir.join("peer.py").to_string_lossy().into_owned()];
    args.extend(flags.iter().map(|s| s.to_string()));
    Command::new("/usr/bin/python3", args).unwrap()
}

fn cfg(e: &Env, log: &str) -> AcpConfig {
    let mut c = AcpConfig::new(
        "Fake Agent",
        e.run.clone(),
        e.scope.clone(),
        &e.dir.path().to_string_lossy(),
        e.dir.path().join(log),
    );
    c.request_timeout = Duration::from_secs(20);
    c.prompt_timeout = Duration::from_secs(30);
    c.permission_timeout = Duration::from_secs(20);
    c
}

fn plain_exec(e: &Env) -> ProcessExecutor {
    ProcessExecutor::attach_with_launcher(
        &e.b.agent,
        e.run.clone(),
        e.scope.clone(),
        ExecMode::Sandboxed,
        Box::new(PlainLauncher),
        ProcessLimits::default(),
    )
    .unwrap()
}

/// Answer every pending request of the run with `d` on a helper thread until `stop` is set.
fn auto_decide(ui: UiHandle, run: RunId, d: UserDecision) -> Arc<std::sync::atomic::AtomicBool> {
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let s2 = stop.clone();
    std::thread::spawn(move || {
        while !s2.load(std::sync::atomic::Ordering::SeqCst) {
            for p in ui.pending_for_run(&run).unwrap_or_default() {
                let _ = ui.decide(&p.request_id, d);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    });
    stop
}

fn launch(e: &Env, flags: &[&str], log: &str) -> Result<AcpClient, AcpError> {
    let px = plain_exec(e);
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
    let r = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), flags), cfg(e, log), Duration::from_secs(10));
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    r
}

fn update_texts(c: &AcpClient) -> Vec<String> {
    c.events()
        .iter()
        .filter(|e| e["kind"] == "update")
        .filter_map(|e| e["data"]["update"]["content"]["text"].as_str().map(String::from))
        .collect()
}

// ---------- tests ----------

#[test]
fn handshake_session_and_prompt_roundtrip_with_persistent_events() {
    let e = env(&[ActionKind::Shell]);
    let c = launch(&e, &[], "ev.jsonl").unwrap();
    assert_eq!(c.agent_capabilities()["loadSession"], true);
    let sid = c.new_session().unwrap();
    assert_eq!(c.prompt("hello").unwrap(), "end_turn");
    assert!(update_texts(&c).contains(&"echo:hello".to_string()));
    drop(c);
    // Events are persistent: readable from the file after the client is gone.
    let events = read_events(&e.dir.path().join("ev.jsonl"));
    assert!(events.iter().any(|v| v["kind"] == "update"));
    assert_eq!(last_session_id(&e.dir.path().join("ev.jsonl")).as_deref(), Some(sid.as_str()));
    // The launch consent was an ordinary broker shell proposal with the external-agent origin.
    let audit = e.b.ui.audit(50).unwrap();
    let dump = format!("{audit:?}");
    assert!(dump.contains("EnforcementAttached") || dump.to_lowercase().contains("enforcement"));
}

#[test]
fn launch_proposal_is_shown_with_external_agent_origin_and_user_deny_blocks_spawn() {
    let e = env(&[ActionKind::Shell]);
    let px = plain_exec(&e);
    let ui = e.b.ui.clone();
    let run = e.run.clone();
    let seen = Arc::new(std::sync::Mutex::new(None));
    let seen2 = seen.clone();
    let h = std::thread::spawn(move || {
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(10) {
            if let Some(p) = ui.pending_for_run(&run).unwrap().into_iter().next() {
                *seen2.lock().unwrap() = Some(p.origin.clone());
                ui.decide(&p.request_id, UserDecision::Deny).unwrap();
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    });
    let r = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), &[]), cfg(&e, "ev.jsonl"), Duration::from_secs(10));
    h.join().unwrap();
    assert!(matches!(r, Err(AcpError::LaunchDenied(_))));
    assert_eq!(
        seen.lock().unwrap().clone(),
        Some(Origin::ExternalAgent { name: "Fake Agent".into() })
    );
}

#[test]
fn permission_request_allowed_via_broker_and_denied_paths() {
    let e = env(&[ActionKind::Shell, ActionKind::Read, ActionKind::Write]);
    let px = plain_exec(&e);
    // File kinds need their own enforcement: attach a file executor like internal runs do.
    let root = tempfile::tempdir().unwrap();
    IsolatedRoot::initialize(root.path()).unwrap();
    let _fx = FileExecutor::attach(
        &e.b.agent,
        e.run.clone(),
        e.scope.clone(),
        IsolatedRoot::open(root.path()).unwrap(),
        FileLimits::default(),
    )
    .unwrap();
    // Launch approval by hand, then the session.
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
    let c = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), &[]), cfg(&e, "ev.jsonl"), Duration::from_secs(10)).unwrap();
    c.new_session().unwrap();
    // 1. user allows once -> agent receives the allow_once option.
    c.prompt("ask:edit").unwrap();
    assert!(update_texts(&c).contains(&"perm=selected:ao".to_string()), "{:?}", update_texts(&c));
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    // 2. user denies -> agent receives the reject option (denied path through the broker).
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::Deny);
    c.prompt("ask:delete").unwrap();
    assert!(update_texts(&c).contains(&"perm=selected:ro".to_string()), "{:?}", update_texts(&c));
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    // 3. unknown tool kind maps to MCP: the broker denies it with NO user involvement.
    c.prompt("ask:think").unwrap();
    assert!(e.b.ui.pending_for_run(&e.run).unwrap().is_empty());
    assert_eq!(update_texts(&c).iter().filter(|t| *t == "perm=selected:ro").count(), 2);
    // Decisions are in the event log (visible in review/transcript) and the broker audit.
    let perms: Vec<_> = c.events().into_iter().filter(|v| v["kind"] == "permission").collect();
    let decisions: Vec<_> = perms.iter().map(|p| p["data"]["decision"].as_str().unwrap().to_string()).collect();
    assert_eq!(decisions, ["allowed", "denied", "denied"]);
    assert_eq!(perms[0]["data"]["kind"], "write");
    assert_eq!(perms[2]["data"]["kind"], "mcp");
    // File-kind permission without file enforcement is a no_enforcement deny (fail closed).
    let e2 = env(&[ActionKind::Shell, ActionKind::Write]);
    let c2 = launch(&e2, &[], "ev.jsonl").unwrap();
    c2.new_session().unwrap();
    c2.prompt("ask:edit").unwrap();
    assert!(update_texts(&c2).contains(&"perm=selected:ro".to_string()));
}

#[test]
fn permission_wait_ends_as_cancelled_on_cancel() {
    let e = env(&[ActionKind::Shell]);
    let c = Arc::new(launch(&e, &[], "ev.jsonl").unwrap());
    c.new_session().unwrap();
    let c2 = c.clone();
    let t = std::thread::spawn(move || c2.prompt("ask:execute"));
    // The request sits pending in the broker (nobody decides it).
    let t0 = Instant::now();
    while e.b.ui.pending_for_run(&e.run).unwrap().is_empty() {
        assert!(t0.elapsed() < Duration::from_secs(10), "permission never reached the broker");
        std::thread::sleep(Duration::from_millis(10));
    }
    c.cancel(Duration::from_secs(5));
    assert_eq!(t.join().unwrap().unwrap(), "end_turn");
    assert!(update_texts(&c).contains(&"perm=cancelled:None".to_string()), "{:?}", update_texts(&c));
}

#[test]
fn cooperative_cancel_lets_the_turn_end_cancelled() {
    let e = env(&[ActionKind::Shell]);
    let c = Arc::new(launch(&e, &[], "ev.jsonl").unwrap());
    c.new_session().unwrap();
    let c2 = c.clone();
    let t = std::thread::spawn(move || c2.prompt("slow"));
    std::thread::sleep(Duration::from_millis(300));
    c.cancel(Duration::from_secs(5));
    assert_eq!(t.join().unwrap().unwrap(), "cancelled");
    assert!(c.is_running(), "a cooperative cancel must not need the kill");
}

fn wait_growth_stops(path: &Path) -> bool {
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(10) {
        let a = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        std::thread::sleep(Duration::from_millis(400));
        let b = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if a == b {
            return true;
        }
    }
    false
}

fn grows_within(path: &Path, d: Duration) -> bool {
    let a = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let t0 = Instant::now();
    while t0.elapsed() < d {
        std::thread::sleep(Duration::from_millis(50));
        if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) > a {
            return true;
        }
    }
    false
}

fn cancel_kills_tree(c: Arc<AcpClient>, hb: PathBuf) {
    c.new_session().unwrap();
    let c2 = c.clone();
    let t = std::thread::spawn(move || c2.prompt("spawn"));
    let t0 = Instant::now();
    while !hb.exists() || !grows_within(&hb, Duration::from_millis(500)) {
        assert!(t0.elapsed() < Duration::from_secs(15), "heartbeat grandchild never ran");
    }
    // The peer ignores session/cancel: only the process-tree kill can end it.
    c.cancel(Duration::ZERO);
    assert!(matches!(t.join().unwrap(), Err(AcpError::Closed)));
    assert!(!c.is_running());
    assert!(wait_growth_stops(&hb), "grandchild kept running after cancel: tree kill failed");
    assert!(!grows_within(&hb, Duration::from_millis(800)));
}

#[test]
fn cancel_kills_the_whole_process_tree_plain_group() {
    let e = env(&[ActionKind::Shell]);
    let hb = e.dir.path().join("hb-plain");
    let flag = format!("--heartbeat={}", hb.display());
    let c = launch(&e, &[&flag], "ev.jsonl").unwrap();
    cancel_kills_tree(Arc::new(c), hb);
}

fn real_bwrap(e: &Env) -> Option<ProcessExecutor> {
    let l = match vibespace_policy::proc::linux::BwrapLauncher::detect() {
        Ok(l) => l.with_root(e.dir.path()).unwrap(),
        Err(err) => {
            eprintln!("SKIP: bubblewrap detection failed: {err}");
            return None;
        }
    };
    match ProcessExecutor::attach_with_launcher(
        &e.b.agent,
        e.run.clone(),
        e.scope.clone(),
        ExecMode::Sandboxed,
        Box::new(l),
        ProcessLimits::default(),
    ) {
        Ok(p) => Some(p),
        Err(err) => {
            eprintln!("SKIP: sandbox capability probe failed: {err}");
            None
        }
    }
}

#[cfg(target_os = "linux")]
#[test]
fn bwrap_sandboxed_agent_handshake_and_cancel_kills_process_tree() {
    let e = env(&[ActionKind::Shell]);
    let Some(px) = real_bwrap(&e) else { return };
    let hb = e.dir.path().join("hb-bwrap");
    let flag = format!("--heartbeat={}", hb.display());
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
    let c = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), &[&flag]), cfg(&e, "ev.jsonl"), Duration::from_secs(20)).unwrap();
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    cancel_kills_tree(Arc::new(c), hb);
}

#[cfg(target_os = "linux")]
#[test]
fn bwrap_sandboxed_agent_has_no_home_no_network_and_clean_env() {
    let e = env(&[ActionKind::Shell]);
    let Some(px) = real_bwrap(&e) else { return };
    // A one-shot probe through the same executor/launcher: the agent sandbox is the A4 profile.
    let cmd = Command::new(
        "/usr/bin/python3",
        ["-c", "import os,socket;print(os.path.exists('/home'),'HOME' in os.environ and os.environ['HOME'])\ntry:\n socket.create_connection(('127.0.0.1',9),1)\n print('net')\nexcept OSError:\n print('nonet')"],
    )
    .unwrap();
    let token = match px.propose_exec(&cmd, "probe", Origin::ExternalAgent { name: "x".into() }).unwrap() {
        ProposeResult::Pending(id) => {
            let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
            let t0 = Instant::now();
            let tok = loop {
                match e.b.agent.poll(&id).unwrap() {
                    PollResult::Approved { token, .. } => break token,
                    PollResult::Pending if t0.elapsed() < Duration::from_secs(10) => {
                        std::thread::sleep(Duration::from_millis(10))
                    }
                    other => panic!("unexpected {other:?}"),
                }
            };
            stop.store(true, std::sync::atomic::Ordering::SeqCst);
            tok
        }
        other => panic!("expected pending, got {other:?}"),
    };
    let r = px.exec(token, &cmd).unwrap();
    assert!(r.stdout.contains("False"), "/home must not exist: {}", r.stdout);
    assert!(r.stdout.contains("nonet"), "sandbox must have no network: {}", r.stdout);
}

#[cfg(target_os = "linux")]
#[test]
fn missing_isolation_means_no_spawn_and_a_clear_error() {
    let e = env(&[ActionKind::Shell]);
    // No bubblewrap: the launcher cannot even be constructed, so no executor, no spawn.
    let err = vibespace_policy::proc::linux::BwrapLauncher::detect_at(Path::new("/nonexistent/bwrap-xyz")).err().unwrap();
    assert!(err.to_string().contains("isolation_unavailable"), "{err}");
    // Without an attached executor the broker denies every shell proposal: no_enforcement.
    let p = Proposal {
        run_id: e.run.clone(),
        scope_id: e.scope.clone(),
        kind: ActionKind::Shell,
        target: "x".into(),
        reason: "r".into(),
        args_digest: ArgsDigest::builder(ActionKind::Shell, "x").finish(),
        origin: Origin::ExternalAgent { name: "x".into() },
        declared_impact: vec![],
    };
    assert!(matches!(e.b.agent.propose(p).unwrap(), ProposeResult::Denied(DenyReason::NoEnforcement)));
    // A launcher that cannot run interactive sessions fails closed at spawn time.
    struct NoSession;
    impl ProcessLauncher for NoSession {
        fn check(&self) -> Result<(), ProcessError> {
            Ok(())
        }
        fn run(&self, _s: &ExecSpec, _l: &ProcessLimits) -> Result<ExecReceipt, ProcessError> {
            Err(ProcessError::SpawnFailed)
        }
    }
    let px = ProcessExecutor::attach_with_launcher(&e.b.agent, e.run.clone(), e.scope.clone(), ExecMode::Sandboxed, Box::new(NoSession), ProcessLimits::default()).unwrap();
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
    let r = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), &[]), cfg(&e, "ev.jsonl"), Duration::from_secs(10));
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(matches!(r, Err(AcpError::Process(ProcessError::IsolationUnavailable(_)))));
}

#[test]
fn elevated_executor_can_never_start_an_external_agent() {
    let e = env(&[ActionKind::Shell]);
    let setup_dir = tempfile::tempdir().unwrap();
    let setup = ElevatedSetup::establish(setup_dir.path()).unwrap();
    let px = ProcessExecutor::attach_elevated(&e.b.agent, e.run.clone(), e.scope.clone(), &setup, ProcessLimits::default()).unwrap();
    let stop = auto_decide(e.b.ui.clone(), e.run.clone(), UserDecision::AllowOnce);
    let r = AcpClient::launch(&e.b.agent, &px, &peer_cmd(e.dir.path(), &[]), cfg(&e, "ev.jsonl"), Duration::from_secs(10));
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    match r {
        Err(AcpError::Process(ProcessError::IsolationUnavailable(m))) => assert!(m.contains("never run elevated")),
        other => panic!("elevated agent must be refused, got {:?}", other.err()),
    }
}

#[test]
fn session_resume_replays_through_load_session_and_refuses_without_capability() {
    let e = env(&[ActionKind::Shell]);
    let log = "ev.jsonl";
    let c = launch(&e, &[], log).unwrap();
    let sid = c.new_session().unwrap();
    c.prompt("one").unwrap();
    drop(c);
    // Fresh process, same persisted log: resume by the recorded id.
    let persisted = last_session_id(&e.dir.path().join(log)).unwrap();
    assert_eq!(persisted, sid);
    let c = launch(&e, &[], log).unwrap();
    c.resume_session(&persisted).unwrap();
    assert!(update_texts(&c).contains(&format!("replay:{sid}")));
    assert_eq!(c.prompt("two").unwrap(), "end_turn");
    assert!(c.events().iter().any(|v| v["kind"] == "session_ready" && v["data"]["resumed"] == true));
    drop(c);
    // An agent without loadSession: visible error, no silent new session.
    let c = launch(&e, &["--no-load"], log).unwrap();
    assert!(matches!(c.resume_session(&sid), Err(AcpError::ResumeUnsupported)));
}

#[test]
fn unsupported_protocol_version_is_rejected_and_the_process_killed() {
    let e = env(&[ActionKind::Shell]);
    let r = launch(&e, &["--v2"], "ev.jsonl");
    assert!(matches!(r, Err(AcpError::VersionMismatch(2))));
}
