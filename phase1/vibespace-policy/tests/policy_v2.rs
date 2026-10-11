//! Policy v2 acceptance tests (Welle-B A4): process isolation matrix, domain-proxy
//! allow/deny, token/audit behaviour for the new kinds, fail-closed proofs.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;
use vibespace_policy::*;

fn broker_with_run(kinds: &[ActionKind]) -> (BrokerHandles, RunId, ScopeId) {
    let b = ConsentBroker::new().unwrap();
    let run = RunId::new(format!("run-{}", std::process::id())).unwrap();
    let scope = ScopeId::new("copy-1").unwrap();
    let mut rs = RunScope::new(run.clone(), scope.clone());
    rs.allowed_kinds = kinds.iter().copied().collect();
    b.runs.register_run(rs).unwrap();
    (b, run, scope)
}

fn digest_of(kind: ActionKind, target: &str) -> ArgsDigest {
    ArgsDigest::builder(kind, target).finish()
}

// ---------- Policy v2 broker behaviour ----------

#[test]
fn shell_and_network_denied_without_enforcement() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell, ActionKind::Network]);
    for kind in [ActionKind::Shell, ActionKind::Network] {
        let p = Proposal {
            run_id: run.clone(),
            scope_id: scope.clone(),
            kind,
            target: "x".into(),
            reason: "r".into(),
            args_digest: digest_of(kind, "x"),
            origin: Origin::Model,
            declared_impact: vec![],
        };
        match b.agent.propose(p).unwrap() {
            ProposeResult::Denied(DenyReason::NoEnforcement) => {}
            other => panic!("expected no_enforcement deny, got {other:?}"),
        }
    }
}

#[test]
fn mcp_and_desktop_stay_denied_even_with_process_and_network_enforcement() {
    let (b, run, scope) = broker_with_run(&[
        ActionKind::Shell,
        ActionKind::Network,
        ActionKind::Mcp,
        ActionKind::Desktop,
    ]);
    ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(NoopLauncher),
        ProcessLimits::default(),
    )
    .unwrap();
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), test_proxy_cfg(443)).unwrap();
    drop(proxy);
    for kind in [ActionKind::Mcp, ActionKind::Desktop] {
        let p = Proposal {
            run_id: run.clone(),
            scope_id: scope.clone(),
            kind,
            target: "x".into(),
            reason: "r".into(),
            args_digest: digest_of(kind, "x"),
            origin: Origin::Skill {
                name: "s".into(),
                trust: SkillTrust::Verified,
            },
            declared_impact: vec![],
        };
        match b.agent.propose(p).unwrap() {
            ProposeResult::Denied(DenyReason::NoEnforcement) => {}
            other => panic!("{kind:?} must stay denied, got {other:?}"),
        }
    }
}

struct NoopLauncher;
impl ProcessLauncher for NoopLauncher {
    fn check(&self) -> Result<(), ProcessError> {
        Ok(())
    }
    fn run(&self, _s: &ExecSpec, _l: &ProcessLimits) -> Result<ExecReceipt, ProcessError> {
        Ok(ExecReceipt {
            exit_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
        })
    }
}

#[test]
fn shell_proposal_token_binding_and_replay() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let px = ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(NoopLauncher),
        ProcessLimits::default(),
    )
    .unwrap();
    let cmd = Command::new("/bin/echo", ["hi"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "say hi", Origin::Model).unwrap() else {
        panic!("shell must ask by default");
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    // Substituted arguments burn the token.
    let other = Command::new("/bin/echo", ["bye"]).unwrap();
    match px.exec(token, &other) {
        Err(ProcessError::Policy(ConsumeError::BindingMismatch)) => {}
        other => panic!("argv substitution must burn the token, got {other:?}"),
    }
    // Audit carries no argv and no secrets; the target is the program only.
    let audit = b.runs.audit(64).unwrap();
    let text = format!("{audit:?}");
    assert!(text.contains("Shell"), "audit must record the shell action");
    assert!(!text.contains("bye"), "audit must not contain argv");
}

#[test]
fn shell_grant_per_program_and_allow_for_run_flow() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let px = ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(NoopLauncher),
        ProcessLimits::default(),
    )
    .unwrap();
    let cmd = Command::new("/usr/bin/true", std::iter::empty::<&str>()).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "r", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowForRun).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    px.exec(token, &cmd).unwrap();
    // Same program, different argv: grant covers the program, each run is token-bound.
    let cmd2 = Command::new("/usr/bin/true", ["--ignored"]).unwrap();
    let ProposeResult::Approved { token, basis, .. } = px.propose_exec(&cmd2, "r", Origin::Model).unwrap() else {
        panic!("grant should auto-allow same program")
    };
    assert_eq!(basis, Decision::AllowForRun);
    px.exec(token, &cmd2).unwrap();
}

#[test]
fn elevated_mode_always_asks_and_never_grants() {
    let dir = tempfile::tempdir().unwrap();
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    // Without a valid setup, elevated attach refuses.
    assert!(matches!(
        ProcessExecutor::attach_elevated(
            &b.agent,
            run.clone(),
            scope.clone(),
            &ElevatedSetup::establish(dir.path()).unwrap(),
            ProcessLimits::default(),
        ),
        Ok(_)
    ));
    // Revoke the marker: the same setup value no longer validates.
    let setup = ElevatedSetup::establish(dir.path()).unwrap();
    ElevatedSetup::revoke(dir.path());
    assert!(matches!(
        ProcessExecutor::attach_elevated(&b.agent, run.clone(), scope.clone(), &setup, ProcessLimits::default()),
        Err(ProcessError::ElevatedNotSetUp)
    ));
    // Valid setup: attach works, proposals are always-ask with no allow_for_run.
    let setup = ElevatedSetup::establish(dir.path()).unwrap();
    let px = ProcessExecutor::attach_elevated(&b.agent, run.clone(), scope.clone(), &setup, ProcessLimits::default()).unwrap();
    assert_eq!(px.mode(), ExecMode::Elevated);
    let cmd = Command::new("/bin/echo", ["x"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "r", Origin::Model).unwrap() else {
        panic!("elevated exec must ask")
    };
    let pending = b.ui.pending().unwrap();
    let view = pending.iter().find(|p| p.request_id == id).unwrap();
    assert!(
        !view.offered.contains(&UserDecision::AllowForRun),
        "elevated exec never offers run grants"
    );
    assert!(matches!(
        b.ui.decide(&id, UserDecision::AllowForRun),
        Err(PolicyError::DecisionNotOffered)
    ));
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert_eq!(r.exit_code, Some(0));
    // A second identical proposal still asks: no grant was created.
    let ProposeResult::Pending(_) = px.propose_exec(&cmd, "r", Origin::Model).unwrap() else {
        panic!("elevated exec must ask every time")
    };
}

#[test]
fn cancel_revokes_process_tokens() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let px = ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(NoopLauncher),
        ProcessLimits::default(),
    )
    .unwrap();
    let cmd = Command::new("/bin/echo", ["x"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "r", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    b.runs.cancel_run(&run, Duration::from_secs(1)).unwrap();
    assert!(matches!(
        px.exec(token, &cmd),
        Err(ProcessError::Policy(ConsumeError::Revoked))
            | Err(ProcessError::Policy(ConsumeError::RunNotActive))
            | Err(ProcessError::Policy(ConsumeError::Unknown))
    ));
}

// ---------- Linux isolation matrix (real bubblewrap) ----------

#[cfg(target_os = "linux")]
fn real_executor(b: &BrokerHandles, run: &RunId, scope: &ScopeId) -> Option<ProcessExecutor> {
    let launcher = vibespace_policy::proc::linux::BwrapLauncher::detect().ok()?;
    ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(launcher),
        ProcessLimits {
            timeout: Duration::from_secs(20),
            ..Default::default()
        },
    )
    .ok()
}

#[cfg(target_os = "linux")]
#[test]
fn linux_bwrap_absent_fails_closed() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let missing = std::path::Path::new("/nonexistent/bwrap");
    assert!(matches!(
        vibespace_policy::proc::linux::BwrapLauncher::detect_at(missing),
        Err(ProcessError::IsolationUnavailable(_))
    ));
    // Attach is impossible -> shell proposals deny with no_enforcement.
    let p = Proposal {
        run_id: run.clone(),
        scope_id: scope.clone(),
        kind: ActionKind::Shell,
        target: "/bin/true".into(),
        reason: "r".into(),
        args_digest: digest_of(ActionKind::Shell, "/bin/true"),
        origin: Origin::Model,
        declared_impact: vec![],
    };
    assert!(matches!(
        b.agent.propose(p).unwrap(),
        ProposeResult::Denied(DenyReason::NoEnforcement)
    ));
}

#[cfg(target_os = "linux")]
#[test]
fn linux_sandboxed_exec_real() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let Some(px) = real_executor(&b, &run, &scope) else {
        eprintln!("SKIP: bubblewrap unavailable in this environment");
        return;
    };
    // grep reads its own /proc/self/status: proves /proc works and the seccomp filter
    // is active (Seccomp: 2 = filter mode).
    let cmd = Command::new("/bin/grep", ["Seccomp", "/proc/self/status"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "check sandbox", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert_eq!(r.exit_code, Some(0), "stderr: {}", r.stderr);
    assert!(
        r.stdout.contains("Seccomp:\t2"),
        "seccomp filter must be active in the child, got: {}",
        r.stdout
    );
    // No network in the sandbox: reading an interface address must fail.
    let cmd = Command::new("/bin/cat", ["/sys/class/net/eth0/address"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "net probe", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert_ne!(r.exit_code, Some(0), "sandbox must have no usable network interfaces");
}

#[cfg(target_os = "linux")]
#[test]
fn linux_sandbox_no_home_and_env() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let Some(px) = real_executor(&b, &run, &scope) else {
        eprintln!("SKIP: bubblewrap unavailable in this environment");
        return;
    };
    // Host env (PATH, HOME, any secrets) must not leak: printenv SECRET_TEST must be empty.
    let cmd = Command::new("/usr/bin/printenv", ["HOME"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "env", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert_eq!(r.stdout.trim(), "/tmp", "sandbox HOME must be the fixed /tmp");
    // /home is not bound.
    let cmd = Command::new("/bin/ls", ["/home"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "ls", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert!(
        r.exit_code != Some(0) || r.stdout.trim().is_empty(),
        "no host home directories inside the sandbox"
    );
}

#[cfg(target_os = "linux")]
#[test]
fn linux_seccomp_denylist_blocks_listed_syscall() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
    let base = match vibespace_policy::proc::linux::BwrapLauncher::detect() {
        Ok(l) => l,
        Err(_) => {
            eprintln!("SKIP: bubblewrap unavailable");
            return;
        }
    };
    // statx is normally allowed; denying it must break a stat-using command visibly.
    let launcher = base.with_extra_denied(vec![libc::SYS_statx as u32]);
    let px = ProcessExecutor::attach_with_launcher(
        &b.agent,
        run.clone(),
        scope.clone(),
        ExecMode::Sandboxed,
        Box::new(launcher),
        ProcessLimits::default(),
    )
    .unwrap();
    let cmd = Command::new("/usr/bin/stat", ["/proc/self/status"]).unwrap();
    let ProposeResult::Pending(id) = px.propose_exec(&cmd, "stat", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    let r = px.exec(token, &cmd).unwrap();
    assert_ne!(r.exit_code, Some(0), "denied syscall must stop the command");
    assert!(
        r.stderr.contains("Operation not permitted") || r.stderr.contains("not permitted"),
        "expected EPERM, got: {}",
        r.stderr
    );
}

// ---------- Domain proxy ----------

fn test_proxy_cfg(port: u16) -> ProxyConfig {
    ProxyConfig {
        allow_private_targets: true, // 127.0.0.1 fixtures only
        allowed_ports: [80u16, 443u16, port].into_iter().collect(),
        ..Default::default()
    }
}

/// Tiny local HTTP server returning a fixed body. Returns its port.
fn local_server() -> u16 {
    let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = l.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for s in l.incoming().take(16) {
            if let Ok(mut s) = s {
                let mut buf = [0u8; 4096];
                let _ = s.read(&mut buf);
                let _ = s.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
                );
            }
        }
    });
    port
}

#[test]
fn proxy_deny_by_default_and_allow_with_grant() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    let port = local_server();
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), test_proxy_cfg(port)).unwrap();
    let ep = proxy.endpoint();

    // No grant: CONNECT refused without touching the origin.
    let mut s = std::net::TcpStream::connect(ep).unwrap();
    write!(s, "CONNECT 127.0.0.1:{port} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    let head = String::from_utf8_lossy(&buf);
    assert!(head.starts_with("HTTP/1.1 403"), "deny by default, got: {head}");

    // Grant the domain via the real consent flow.
    let nx = NetworkExecutor::new(&b.agent, &proxy, scope.clone());
    let req = FetchRequest::parse(&format!("http://127.0.0.1:{port}/data")).unwrap();
    let ProposeResult::Pending(id) = nx.propose_fetch(&req, "need data", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowForRun).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    // Token-bound host-side fetch works and returns only the body.
    let body = nx.fetch(token, &req).unwrap();
    assert_eq!(body, b"hello");
    // The grant now also admits a raw proxy CONNECT (target check against broker grants).
    let mut s = std::net::TcpStream::connect(ep).unwrap();
    write!(s, "CONNECT 127.0.0.1:{port} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if s.read(&mut byte).unwrap() == 0 {
            break;
        }
        head.push(byte[0]);
    }
    assert!(
        String::from_utf8_lossy(&head).starts_with("HTTP/1.1 200"),
        "granted domain must relay"
    );
}

#[test]
fn proxy_allow_once_fetch_and_binding_burn() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    let port = local_server();
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), test_proxy_cfg(port)).unwrap();
    let nx = NetworkExecutor::new(&b.agent, &proxy, scope.clone());
    let req = FetchRequest::parse(&format!("http://127.0.0.1:{port}/a")).unwrap();
    let ProposeResult::Pending(id) = nx.propose_fetch(&req, "r", Origin::Model).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!()
    };
    // Swapped URL burns the token.
    let other = FetchRequest::parse(&format!("http://127.0.0.1:{port}/b")).unwrap();
    assert!(matches!(
        nx.fetch(token, &other),
        Err(NetError::Policy(ConsumeError::BindingMismatch))
    ));
    // AllowOnce created no grant: a raw CONNECT stays refused.
    let mut s = std::net::TcpStream::connect(proxy.endpoint()).unwrap();
    write!(s, "CONNECT 127.0.0.1:{port} HTTP/1.1\r\n\r\n").unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    assert!(String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 403"));
}

#[test]
fn ssrf_guard_refuses_private_destinations_even_when_granted() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    // Production config: private targets off.
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), ProxyConfig::default()).unwrap();
    // Even seeding the domain (widening the ACL) cannot open a private destination.
    let d = Domain::parse("127.0.0.1").unwrap();
    proxy.seed_domain(&d);
    let mut s = std::net::TcpStream::connect(proxy.endpoint()).unwrap();
    write!(s, "CONNECT 127.0.0.1:443 HTTP/1.1\r\n\r\n").unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    assert!(
        String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 403"),
        "SSRF guard must refuse loopback"
    );
    assert!(!is_public_ip(&"169.254.169.254".parse().unwrap()));
    assert!(!is_public_ip(&"10.0.0.1".parse().unwrap()));
    assert!(!is_public_ip(&"192.168.1.1".parse().unwrap()));
    assert!(!is_public_ip(&"100.64.0.1".parse().unwrap()));
    assert!(is_public_ip(&"8.8.8.8".parse().unwrap()));
    assert!(is_public_ip(&"1.1.1.1".parse().unwrap()));
}

#[test]
fn provider_network_stays_separate_from_tool_network() {
    // Model transport permits do not open the proxy, and proxy grants do not create permits.
    let mut mp = ModelTransportPolicy::new();
    mp.allow_model_host("api.example.com");
    assert!(mp.check("api.example.com").is_some());
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), test_proxy_cfg(443)).unwrap();
    let mut s = std::net::TcpStream::connect(proxy.endpoint()).unwrap();
    write!(s, "CONNECT api.example.com:443 HTTP/1.1\r\n\r\n").unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    assert!(
        String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 403"),
        "a model transport permit must never open the tool network"
    );
}

#[test]
fn network_grant_revocation_closes_the_proxy() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    let proxy = DomainProxy::attach(&b.agent, &b.runs, run.clone(), scope.clone(), test_proxy_cfg(443)).unwrap();
    let p = Proposal {
        run_id: run.clone(),
        scope_id: scope.clone(),
        kind: ActionKind::Network,
        target: "example.com".into(),
        reason: "r".into(),
        args_digest: digest_of(ActionKind::Network, "example.com"),
        origin: Origin::Model,
        declared_impact: vec![],
    };
    let ProposeResult::Pending(id) = b.agent.propose(p).unwrap() else {
        panic!()
    };
    b.ui.decide(&id, UserDecision::AllowForRun).unwrap();
    let _ = b.agent.poll(&id).unwrap();
    assert_eq!(b.runs.revoke_all_grants(&run).unwrap(), 1);
    let mut s = std::net::TcpStream::connect(proxy.endpoint()).unwrap();
    write!(s, "CONNECT example.com:443 HTTP/1.1\r\n\r\n").unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    assert!(String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 403"));
}

#[test]
fn domain_validation() {
    assert!(Domain::parse("example.com").is_ok());
    assert!(Domain::parse("API.Example.COM.").unwrap().as_str() == "api.example.com");
    assert!(Domain::parse("").is_err());
    assert!(Domain::parse("exa mple.com").is_err());
    assert!(Domain::parse("user@example.com").is_err());
    assert!(Domain::parse("example.com:443").is_err());
    assert!(Domain::parse("example.com/path").is_err());
}

#[test]
fn macos_and_platform_support_surface_is_honest() {
    match platform_support() {
        ProcessSupport::Sandboxed | ProcessSupport::ElevatedOnly => {}
        ProcessSupport::Unavailable { reason } => {
            assert!(!reason.is_empty(), "unavailable must carry a visible reason");
        }
    }
    #[cfg(target_os = "macos")]
    {
        assert!(matches!(
            platform_support(),
            ProcessSupport::Unavailable { .. }
        ));
        let (b, run, scope) = broker_with_run(&[ActionKind::Shell]);
        assert!(matches!(
            ProcessExecutor::attach(&b.agent, run, scope, ProcessLimits::default()),
            Err(ProcessError::UnsupportedPlatform(_))
        ));
    }
}
