//! Broker wiring for the MCP host (A7 host follow-up, inventory finding #8).
//!
//! MCP servers get ONE app-level broker scope (run `mcp-host`, registered on the app's single
//! consent broker). Nothing the host does for an MCP server happens outside it:
//!
//! - **stdio spawn**: `ProcessExecutor::propose_exec` -> consent -> `spawn_session` (sandboxed,
//!   fail-closed when the platform layer cannot start sessions). There is no direct spawn path
//!   left in this crate (`rmcp`'s child-process transport is not even compiled in).
//! - **HTTP**: `NetworkExecutor::propose_fetch` is the consent ask for the server's domain; only
//!   an `AllowForRun` domain grant admits the connection, and the client reaches the network
//!   only through the broker-owned `DomainProxy` (deny-default, SSRF guard, live grant check per
//!   connection, so a revoke takes effect on the next connection).
//! - **tool calls**: `McpRoute::propose_call` / `call` (digest-bound `AllowForRun` MCP grants).
//!
//! Origin is `Origin::Extension { name: "mcp:<server-id>" }`: informational, never widens
//! anything. Without an attached executor or proxy the broker denies (`no_enforcement`).
use crate::mcp_host::{validate_config, McpServerConfig};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt, DuplexStream};
use vibespace_policy as policy;
use policy::{ActionKind, Origin, PollResult, ProposeResult, UserDecision};

pub const MCP_RUN: &str = "mcp-host";
pub const MCP_SCOPE: &str = "mcp-host-scope";

/// Stable machine-readable failure codes (never process output, never argument values).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpBrokerError(pub &'static str);
impl std::fmt::Display for McpBrokerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(self.0) }
}
impl std::error::Error for McpBrokerError {}
impl From<McpBrokerError> for String { fn from(e: McpBrokerError) -> String { e.0.to_string() } }
type Res<T> = Result<T, McpBrokerError>;
fn e(code: &'static str) -> McpBrokerError { McpBrokerError(code) }

/// The user's answer to one pending MCP consent request, relayed by the trusted editor window.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Choice { Deny, AllowOnce, AllowForRun }
impl From<Choice> for UserDecision {
    fn from(c: Choice) -> Self {
        match c { Choice::Deny => UserDecision::Deny, Choice::AllowOnce => UserDecision::AllowOnce, Choice::AllowForRun => UserDecision::AllowForRun }
    }
}

/// Grants of the MCP scope, as shown in the grants view.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpGrantsReply {
    pub shell: Vec<policy::GrantView>,
    pub network: Vec<policy::GrantView>,
    pub mcp: Vec<policy::McpGrantView>,
}

/// Where an approved HTTP MCP client may connect: only through the broker's domain proxy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetRoute { pub proxy_url: String, pub domain: String }

/// A started stdio server: the client end of the bridged pipes plus the handle that kills the
/// sandboxed process tree when dropped.
pub struct StdioServer { pub io: DuplexStream, pub guard: StopGuard }

/// Dropping it stops the sandboxed server (the owning thread kills the whole tree).
pub struct StopGuard(Option<mpsc::Sender<()>>);
impl Drop for StopGuard { fn drop(&mut self) { if let Some(tx) = self.0.take() { let _ = tx.send(()); } } }

/// Bridge blocking std pipes to a tokio duplex stream (what rmcp's async-rw transport wants).
/// `r` is what the peer writes (child stdout), `w` is what we write to the peer (child stdin).
pub fn bridge_stdio(mut r: Box<dyn Read + Send>, mut w: Box<dyn Write + Send>, rt: tokio::runtime::Handle) -> DuplexStream {
    let (client, server) = tokio::io::duplex(64 * 1024);
    let (mut sr, mut sw) = tokio::io::split(server);
    let rt1 = rt.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match r.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => { if rt1.block_on(sw.write_all(&buf[..n])).is_err() { break; } }
            }
        }
        let _ = rt1.block_on(sw.shutdown());
    });
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match rt.block_on(sr.read(&mut buf)) {
                Ok(0) | Err(_) => break,
                Ok(n) => { if w.write_all(&buf[..n]).is_err() || w.flush().is_err() { break; } }
            }
        }
    });
    client
}

pub struct McpBroker {
    handles: policy::BrokerHandles,
    run: policy::RunId,
    scope: policy::ScopeId,
    exec: Option<Arc<policy::ProcessExecutor>>,
    route: policy::McpRoute,
    proxy: Mutex<Option<Arc<policy::DomainProxy>>>,
    /// Why spawning is off (None when an executor is attached). Display only.
    pub exec_unavailable: Option<&'static str>,
}

fn origin(server: &str) -> Origin { Origin::Extension { name: format!("mcp:{server}") } }

impl McpBroker {
    /// Register the app-level scope on `handles` and attach process isolation via `make_exec`.
    /// A failing `make_exec` leaves spawning fail-closed (the broker then denies `shell`).
    pub fn open<F>(handles: policy::BrokerHandles, make_exec: F) -> Res<Self>
    where F: FnOnce(&policy::AgentHandle, &policy::RunId, &policy::ScopeId) -> Result<policy::ProcessExecutor, policy::ProcessError> {
        let run = policy::RunId::new(MCP_RUN).map_err(|_| e("mcp_broker_failed"))?;
        let scope = policy::ScopeId::new(MCP_SCOPE).map_err(|_| e("mcp_broker_failed"))?;
        let mut rs = policy::RunScope::new(run.clone(), scope.clone());
        rs.label = "MCP servers".into();
        rs.allowed_kinds = [ActionKind::Shell, ActionKind::Network, ActionKind::Mcp].into_iter().collect();
        handles.runs.register_run(rs).map_err(|_| e("mcp_broker_failed"))?;
        let (exec, why) = match make_exec(&handles.agent, &run, &scope) {
            Ok(x) => (Some(Arc::new(x)), None),
            Err(_) => (None, Some("mcp_isolation_unavailable")),
        };
        let route = policy::McpRoute::new(&handles.agent, run.clone(), scope.clone());
        Ok(Self { handles, run, scope, exec, route, proxy: Mutex::new(None), exec_unavailable: why })
    }

    fn pending_view(&self, id: &policy::ProposalId) -> Res<policy::PendingView> {
        self.handles.ui.pending_for_run(&self.run).map_err(|_| e("mcp_broker_failed"))?
            .into_iter().find(|p| &p.request_id == id).ok_or(e("mcp_consent_gone"))
    }

    /// Resolve a proposal into a token: grant/autonomy approval, or the user's relayed answer.
    /// `kind`/`target` must match the pending request being answered (defence in depth: the
    /// token binding is re-derived by the executor anyway).
    fn token_for(&self, r: ProposeResult, choice: Option<Choice>, kind: ActionKind, target: &str) -> Res<policy::ApprovalToken> {
        match r {
            ProposeResult::Denied(d) => Err(e(deny_code(d))),
            ProposeResult::Approved { token, .. } => Ok(token),
            ProposeResult::Pending(id) => {
                let Some(choice) = choice else { return Err(e("mcp_consent_required")); };
                let v = self.pending_view(&id)?;
                if v.kind != kind || v.target != target { return Err(e("mcp_consent_mismatch")); }
                self.handles.ui.decide_wire(MCP_RUN, id.as_str(), choice.into()).map_err(|_| e("mcp_consent_gone"))?;
                match self.handles.agent.poll(&id).map_err(|_| e("mcp_broker_failed"))? {
                    PollResult::Approved { token, .. } => Ok(token),
                    PollResult::Denied(d) => Err(e(deny_code(d))),
                    _ => Err(e("mcp_consent_gone")),
                }
            }
        }
    }

    // ---- stdio spawn ---------------------------------------------------------------------

    /// Start an approved stdio server inside the sandbox. Blocking; call from a blocking
    /// context inside the tokio runtime. `Err("mcp_consent_required")` means the user must answer
    /// first (call again with `choice`).
    pub fn spawn_stdio(&self, cfg: &McpServerConfig, choice: Option<Choice>) -> Res<StdioServer> {
        validate_config(cfg).map_err(|_| e("mcp_invalid_config"))?;
        // The sandbox has a fixed environment and `Command` carries none: refuse instead of dropping it silently.
        if !cfg.env.is_empty() { return Err(e("mcp_env_unsupported")); }
        let exec = self.exec.clone().ok_or(e(self.exec_unavailable.unwrap_or("mcp_isolation_unavailable")))?;
        let cmd = policy::Command::new(cfg.command.clone(), cfg.args.clone()).map_err(|_| e("mcp_invalid_config"))?;
        let r = exec.propose_exec(&cmd, "Start MCP server", origin(&cfg.id)).map_err(|_| e("mcp_broker_failed"))?;
        let token = self.token_for(r, choice, ActionKind::Shell, &cmd.target())?;
        let (io_tx, io_rx) = mpsc::channel::<Result<policy::SessionIo, &'static str>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        // The sandbox is tied to the spawning thread on Linux: this thread owns the session for its whole life.
        std::thread::spawn(move || {
            let mut session = match exec.spawn_session(token, &cmd) {
                Ok(s) => s,
                Err(err) => { let _ = io_tx.send(Err(spawn_code(&err))); return; }
            };
            match session.io() {
                Some(io) => { let _ = io_tx.send(Ok(io)); }
                None => { let _ = io_tx.send(Err("mcp_spawn_failed")); let _ = session.kill_tree(); return; }
            }
            let _ = stop_rx.recv(); // a dropped sender also ends the wait
            let _ = session.kill_tree();
        });
        let io = io_rx.recv_timeout(std::time::Duration::from_secs(30)).map_err(|_| e("mcp_spawn_failed"))?.map_err(e)?;
        let mut stderr = io.stderr;
        std::thread::spawn(move || { let mut b = [0u8; 4096]; while matches!(stderr.read(&mut b), Ok(n) if n > 0) {} });
        let rt = tokio::runtime::Handle::try_current().map_err(|_| e("mcp_broker_failed"))?;
        Ok(StdioServer { io: bridge_stdio(io.stdout, io.stdin, rt), guard: StopGuard(Some(stop_tx)) })
    }

    // ---- tool calls ----------------------------------------------------------------------

    /// Propose one MCP tool call. Approved only by an exact digest-bound grant or the relayed answer.
    pub fn authorize_call(&self, server: &str, tool: &str, schema: policy::ArgsDigest, args_canonical: &[u8], choice: Option<Choice>) -> Res<(policy::McpCallPermit, policy::McpToolRef)> {
        let tool_ref = policy::McpToolRef::new(server, tool, schema).map_err(|_| e("mcp_invalid_tool"))?;
        let r = self.route.propose_call(&tool_ref, args_canonical, "Call MCP tool", origin(server)).map_err(|_| e("mcp_invalid_tool"))?;
        let token = self.token_for(r, choice, ActionKind::Mcp, &tool_ref.target())?;
        let permit = self.route.call(token, &tool_ref, args_canonical).map_err(|_| e("mcp_consent_gone"))?;
        Ok((permit, tool_ref))
    }

    // ---- HTTP ----------------------------------------------------------------------------

    fn proxy(&self) -> Res<Arc<policy::DomainProxy>> {
        let mut g = self.proxy.lock().map_err(|_| e("mcp_broker_failed"))?;
        if let Some(p) = g.as_ref() { return Ok(p.clone()); }
        let p = Arc::new(policy::DomainProxy::attach(&self.handles.agent, &self.handles.runs, self.run.clone(), self.scope.clone(), policy::ProxyConfig::default()).map_err(|_| e("mcp_network_unavailable"))?);
        *g = Some(p.clone());
        Ok(p)
    }

    /// Approve connecting an HTTP MCP server. The URL host must be in `allowed_domains` (the
    /// server config's allowlist; empty means just the URL's own host). Only an `AllowForRun`
    /// domain grant admits the connection (a one-shot token cannot cover a POST session).
    pub fn authorize_http(&self, server: &str, url: &str, allowed_domains: &[String], choice: Option<Choice>) -> Res<NetRoute> {
        let u = url.strip_prefix("https://").ok_or(e("mcp_http_https_only"))?;
        let authority = u.split('/').next().unwrap_or("");
        if authority.contains(':') { return Err(e("mcp_http_port_not_allowed")); } // the proxy dials 443 only
        let req = policy::FetchRequest::parse(url).map_err(|_| e("mcp_invalid_url"))?;
        let domain = req.domain().as_str().to_string();
        if !allowed_domains.is_empty() && !allowed_domains.iter().any(|d| d.eq_ignore_ascii_case(&domain)) { return Err(e("mcp_domain_not_allowed")); }
        let proxy = self.proxy()?;
        let net = policy::NetworkExecutor::new(&self.handles.agent, &proxy, self.scope.clone());
        let r = net.propose_fetch(&req, "Connect to MCP server", origin(server)).map_err(|_| e("mcp_broker_failed"))?;
        match r {
            ProposeResult::Denied(d) => return Err(e(deny_code(d))),
            ProposeResult::Approved { .. } => {} // a standing domain grant (token unused: the proxy re-checks every connection)
            ProposeResult::Pending(id) => {
                let Some(choice) = choice else { return Err(e("mcp_consent_required")); };
                let v = self.pending_view(&id)?;
                if v.kind != ActionKind::Network || v.target != domain { return Err(e("mcp_consent_mismatch")); }
                if choice != Choice::AllowForRun {
                    if choice == Choice::Deny { let _ = self.handles.ui.decide_wire(MCP_RUN, id.as_str(), UserDecision::Deny); }
                    return Err(e(if choice == Choice::Deny { "mcp_denied" } else { "mcp_http_needs_run_grant" }));
                }
                self.handles.ui.decide_wire(MCP_RUN, id.as_str(), UserDecision::AllowForRun).map_err(|_| e("mcp_consent_gone"))?;
                // The token is not needed: the domain grant is what the proxy checks. Collect it so it cannot linger.
                let _ = self.handles.agent.poll(&id);
            }
        }
        // The grant must really exist now (the proxy is the only gate).
        let granted = self.handles.ui.grants(&self.run).map_err(|_| e("mcp_broker_failed"))?
            .iter().any(|g| g.kind == ActionKind::Network && g.target == domain);
        if !granted { return Err(e("mcp_http_needs_run_grant")); }
        Ok(NetRoute { proxy_url: format!("http://{}", proxy.endpoint()), domain })
    }

    // ---- grants view ---------------------------------------------------------------------

    pub fn grants(&self) -> Res<McpGrantsReply> {
        let all = self.handles.ui.grants(&self.run).map_err(|_| e("mcp_broker_failed"))?;
        let mcp = self.handles.ui.mcp_grants(&self.run).map_err(|_| e("mcp_broker_failed"))?;
        Ok(McpGrantsReply {
            shell: all.iter().filter(|g| g.kind == ActionKind::Shell).cloned().collect(),
            network: all.iter().filter(|g| g.kind == ActionKind::Network).cloned().collect(),
            mcp,
        })
    }

    /// Revoke one grant. `kind` is `shell`, `network` or `mcp`; stores stay separate.
    pub fn revoke(&self, kind: &str, grant_id: &str) -> Res<usize> {
        let id = policy::GrantId::new(grant_id).map_err(|_| e("mcp_invalid_grant"))?;
        let r = match kind {
            "mcp" => self.handles.ui.revoke_mcp_grant(&self.run, &id),
            "shell" | "network" => {
                let want = if kind == "shell" { ActionKind::Shell } else { ActionKind::Network };
                let ok = self.handles.ui.grants(&self.run).map_err(|_| e("mcp_broker_failed"))?.iter().any(|g| g.grant_id == id && g.kind == want);
                if !ok { return Ok(0); }
                self.handles.ui.revoke_grant(&self.run, &id)
            }
            _ => return Err(e("mcp_invalid_grant")),
        };
        r.map_err(|_| e("mcp_broker_failed"))
    }

    /// Pending consent requests of the scope (for audit/diagnostics views).
    pub fn pending(&self) -> Res<Vec<policy::PendingView>> {
        self.handles.ui.pending_for_run(&self.run).map_err(|_| e("mcp_broker_failed"))
    }
    pub fn audit_tail(&self, n: usize) -> Res<policy::AuditSnapshot> { self.handles.ui.audit(n).map_err(|_| e("mcp_broker_failed")) }
}

fn deny_code(d: policy::DenyReason) -> &'static str {
    use policy::DenyReason::*;
    match d {
        NoEnforcement => "mcp_isolation_unavailable",
        UserDenied => "mcp_denied",
        Expired => "mcp_consent_expired",
        QueueFull => "mcp_queue_full",
        _ => "mcp_denied",
    }
}
fn spawn_code(err: &policy::ProcessError) -> &'static str {
    match err {
        policy::ProcessError::IsolationUnavailable(_) | policy::ProcessError::UnsupportedPlatform(_) => "mcp_isolation_unavailable",
        policy::ProcessError::Policy(_) => "mcp_consent_gone",
        _ => "mcp_spawn_failed",
    }
}

/// Platform executor for the MCP scope. Linux binds the sandbox to `work`; other platforms use
/// the platform default launcher (Windows AppContainer sessions; macOS is unavailable, fail-closed).
#[cfg(target_os = "linux")]
pub fn platform_executor(work: &std::path::Path) -> impl FnOnce(&policy::AgentHandle, &policy::RunId, &policy::ScopeId) -> Result<policy::ProcessExecutor, policy::ProcessError> {
    let work = work.to_path_buf();
    move |agent, run, scope| {
        std::fs::create_dir_all(&work).map_err(|_| policy::ProcessError::SpawnFailed)?;
        let launcher = policy::proc::linux::BwrapLauncher::detect()?.with_root(&work)?;
        policy::ProcessExecutor::attach_with_launcher(agent, run.clone(), scope.clone(), policy::ExecMode::Sandboxed, Box::new(launcher), policy::ProcessLimits::default())
    }
}
#[cfg(not(target_os = "linux"))]
pub fn platform_executor(_work: &std::path::Path) -> impl FnOnce(&policy::AgentHandle, &policy::RunId, &policy::ScopeId) -> Result<policy::ProcessExecutor, policy::ProcessError> {
    |agent, run, scope| policy::ProcessExecutor::attach(agent, run.clone(), scope.clone(), policy::ProcessLimits::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp_host::McpHost;
    use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
    use rmcp::model::{ServerCapabilities, ServerConfig};
    use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler, ServiceExt};
    use serde_json::{json, Map, Value};
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
    struct SumRequest { a: i32, b: i32 }
    #[derive(Clone)]
    struct Calc { #[allow(dead_code)] tool_router: ToolRouter<Self> }
    #[tool_router]
    impl Calc {
        #[tool(description = "Add two numbers")]
        fn sum(&self, Parameters(SumRequest { a, b }): Parameters<SumRequest>) -> String { (a + b).to_string() }
    }
    #[tool_handler]
    impl ServerHandler for Calc {
        fn get_info(&self) -> ServerConfig { ServerConfig::new(ServerCapabilities::builder().enable_tools().build()) }
    }

    /// Mock launcher: records every spawn and serves an in-process MCP server over real pipes.
    #[derive(Clone, Default)]
    struct Mock { spawns: Arc<AtomicUsize>, specs: Arc<Mutex<Vec<policy::ExecSpec>>>, rt: Option<tokio::runtime::Handle> }
    impl Mock { fn new() -> Self { Self { rt: tokio::runtime::Handle::try_current().ok(), ..Default::default() } } }
    struct MockSession { io: Option<policy::SessionIo>, killed: Arc<AtomicUsize> }
    impl policy::SessionProcess for MockSession {
        fn io(&mut self) -> Option<policy::SessionIo> { self.io.take() }
        fn kill_tree(&mut self) -> Result<(), policy::ProcessError> { self.killed.fetch_add(1, Ordering::SeqCst); Ok(()) }
        fn try_wait(&mut self) -> Result<Option<Option<i32>>, policy::ProcessError> { Ok(None) }
    }
    impl policy::ProcessLauncher for Mock {
        fn check(&self) -> Result<(), policy::ProcessError> { Ok(()) }
        fn run(&self, _s: &policy::ExecSpec, _l: &policy::ProcessLimits) -> Result<policy::ExecReceipt, policy::ProcessError> { Err(policy::ProcessError::SpawnFailed) }
        fn spawn_session(&self, spec: &policy::ExecSpec) -> Result<Box<dyn policy::SessionProcess>, policy::ProcessError> {
            self.spawns.fetch_add(1, Ordering::SeqCst);
            self.specs.lock().unwrap().push(spec.clone());
            let (client_to_server_r, client_to_server_w) = std::io::pipe().unwrap();
            let (server_to_client_r, server_to_client_w) = std::io::pipe().unwrap();
            let rt = self.rt.clone().unwrap();
            std::thread::spawn(move || {
                let h = rt.clone();
                let server_io = bridge_stdio(Box::new(client_to_server_r), Box::new(server_to_client_w), rt);
                h.block_on(async move {
                    if let Ok(srv) = (Calc { tool_router: Calc::tool_router() }).serve(server_io).await { let _ = srv.waiting().await; }
                });
            });
            Ok(Box::new(MockSession {
                io: Some(policy::SessionIo { stdin: Box::new(client_to_server_w), stdout: Box::new(server_to_client_r), stderr: Box::new(std::io::empty()) }),
                killed: Arc::new(AtomicUsize::new(0)),
            }))
        }
    }

    fn broker_with(mock: Option<Mock>) -> (McpBroker, policy::BrokerHandles) {
        let handles = policy::ConsentBroker::new().unwrap();
        let h2 = handles.clone();
        let b = McpBroker::open(handles, move |agent, run, scope| match mock {
            Some(m) => policy::ProcessExecutor::attach_with_launcher(agent, run.clone(), scope.clone(), policy::ExecMode::Sandboxed, Box::new(m), policy::ProcessLimits::default()),
            None => Err(policy::ProcessError::IsolationUnavailable("test")),
        }).unwrap();
        (b, h2)
    }
    fn cfg(id: &str) -> McpServerConfig {
        let exe = std::env::current_exe().unwrap().to_string_lossy().to_string();
        McpServerConfig { id: id.into(), command: exe, args: vec!["--serve".into()], env: BTreeMap::new() }
    }
    async fn start(b: &Arc<McpBroker>, host: &McpHost, c: &McpServerConfig, ch: Option<Choice>) -> Result<(), String> { host.start_via_broker(b.clone(), c, ch).await }
    fn code<T: std::fmt::Debug>(r: Result<T, String>) -> String { r.unwrap_err() }
    fn sum_args() -> Map<String, Value> { let mut m = Map::new(); m.insert("a".into(), json!(2)); m.insert("b".into(), json!(3)); m }

    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_goes_through_the_broker_and_needs_consent() {
        let mock = Mock::new();
        let (b, handles) = broker_with(Some(mock.clone()));
        let (b, host, c) = (Arc::new(b), McpHost::new(), cfg("calc"));
        // No answer, no grant: nothing spawns.
        assert_eq!(code(start(&b, &host, &c, None).await), "mcp_consent_required");
        assert_eq!(code(start(&b, &host, &c, Some(Choice::Deny)).await), "mcp_denied");
        assert_eq!(mock.spawns.load(Ordering::SeqCst), 0);
        // Allow once: exactly one spawn, one-shot (no standing grant).
        start(&b, &host, &c, Some(Choice::AllowOnce)).await.unwrap();
        assert_eq!(mock.spawns.load(Ordering::SeqCst), 1);
        assert_eq!(mock.specs.lock().unwrap()[0].args, vec!["--serve".to_string()]);
        assert!(b.grants().unwrap().shell.is_empty());
        assert_eq!(code(start(&b, &host, &c, None).await), "mcp_consent_required");
        // The broker audit shows a Shell proposal with the MCP origin target (program only, no args).
        let audit = handles.ui.audit(50).unwrap();
        assert!(audit.events.iter().any(|e| e.action == Some(ActionKind::Shell) && matches!(e.event, policy::AuditKind::Proposed)));
        // Allow for run: a program grant, the next start needs no answer, revoke makes it ask again.
        start(&b, &host, &c, Some(Choice::AllowForRun)).await.unwrap();
        let g = b.grants().unwrap();
        assert_eq!(g.shell.len(), 1);
        host.stop("calc").await;
        start(&b, &host, &c, None).await.unwrap();
        assert_eq!(b.revoke("shell", g.shell[0].grant_id.as_str()).unwrap(), 1);
        host.stop("calc").await;
        assert_eq!(code(start(&b, &host, &c, None).await), "mcp_consent_required");
        assert_eq!(mock.spawns.load(Ordering::SeqCst), 3);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_is_fail_closed() {
        let host = McpHost::new();
        // No isolation layer: the broker denies, nothing can start, even with an answer.
        let (b, _) = broker_with(None);
        let b = Arc::new(b);
        assert_eq!(code(start(&b, &host, &cfg("calc"), Some(Choice::AllowForRun)).await), "mcp_isolation_unavailable");
        // Environment entries cannot reach the sandbox: refused, not silently dropped.
        let mock = Mock::new();
        let (b, _) = broker_with(Some(mock.clone()));
        let b = Arc::new(b);
        let mut c = cfg("calc");
        c.env.insert("TOKEN".into(), "x".into());
        assert_eq!(code(start(&b, &host, &c, Some(Choice::AllowForRun)).await), "mcp_env_unsupported");
        assert_eq!(mock.spawns.load(Ordering::SeqCst), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tool_calls_use_digest_bound_grants_that_revoke() {
        let (b, _) = broker_with(Some(Mock::new()));
        let (b, host, c) = (Arc::new(b), McpHost::new(), cfg("calc"));
        start(&b, &host, &c, Some(Choice::AllowOnce)).await.unwrap();
        let tools = host.tools("calc").await.unwrap();
        assert_eq!(tools[0].schema_digest.len(), 64);
        let call = |ch| { let (b, host) = (b.clone(), &host); async move { host.call_via_broker(&b, "calc", "sum", sum_args(), ch).await } };
        assert_eq!(code(call(None).await), "mcp_consent_required");
        assert_eq!(code(call(Some(Choice::Deny)).await), "mcp_denied");
        assert_eq!(call(Some(Choice::AllowOnce)).await.unwrap(), "5");
        assert!(b.grants().unwrap().mcp.is_empty());
        assert_eq!(code(call(None).await), "mcp_consent_required");
        assert_eq!(call(Some(Choice::AllowForRun)).await.unwrap(), "5");
        let g = b.grants().unwrap();
        assert_eq!((g.mcp[0].server.as_str(), g.mcp[0].tool.as_str(), g.mcp[0].schema_digest.as_str()), ("calc", "sum", tools[0].schema_digest.as_str()));
        // Granted: no answer needed. A changed definition (other digest) is not covered by the grant.
        assert_eq!(call(None).await.unwrap(), "5");
        let other = crate::mcp_host::tool_schema_digest("sum", "Add two numbers, now evil", &json!({}));
        let r = b.authorize_call("calc", "sum", other, b"{}", None);
        assert_eq!(r.err(), Some(e("mcp_consent_required")));
        // Revoke: asks again at once.
        assert_eq!(b.revoke("mcp", g.mcp[0].grant_id.as_str()).unwrap(), 1);
        assert_eq!(code(call(None).await), "mcp_consent_required");
        // A shell grant never covers an MCP call (stores are separate).
        assert_eq!(b.revoke("bogus", "x"), Err(e("mcp_invalid_grant")));
        // Unlisted tools have no digest: refused before the broker.
        assert_eq!(code(host.call_via_broker(&b, "calc", "nope", Map::new(), Some(Choice::AllowForRun)).await), "mcp_unknown_tool");
    }

    #[test]
    fn http_goes_only_through_the_domain_proxy() {
        let (b, _) = broker_with(None);
        let u = "https://mcp.example.com/mcp";
        assert_eq!(b.authorize_http("web", "http://mcp.example.com/mcp", &[], Some(Choice::AllowForRun)), Err(e("mcp_http_https_only")));
        assert_eq!(b.authorize_http("web", "https://mcp.example.com:8443/mcp", &[], Some(Choice::AllowForRun)), Err(e("mcp_http_port_not_allowed")));
        assert_eq!(b.authorize_http("web", u, &["other.example.com".into()], Some(Choice::AllowForRun)), Err(e("mcp_domain_not_allowed")));
        assert_eq!(b.authorize_http("web", u, &[], None), Err(e("mcp_consent_required")));
        // A one-shot token cannot cover a POST session: only a run grant admits the domain.
        assert_eq!(b.authorize_http("web", u, &[], Some(Choice::AllowOnce)), Err(e("mcp_http_needs_run_grant")));
        assert!(b.grants().unwrap().network.is_empty());
        let route = b.authorize_http("web", u, &["mcp.example.com".into()], Some(Choice::AllowForRun)).unwrap();
        assert_eq!(route.domain, "mcp.example.com");
        assert!(route.proxy_url.starts_with("http://127.0.0.1:"));
        let g = b.grants().unwrap();
        assert_eq!(g.network.len(), 1);
        // Granted: no answer needed; revoked: asks again and the proxy refuses the CONNECT.
        assert!(b.authorize_http("web", u, &[], None).is_ok());
        let connect = |host: &str| -> String {
            use std::io::{Read, Write};
            let addr = route.proxy_url.trim_start_matches("http://").to_string();
            let mut s = std::net::TcpStream::connect(addr).unwrap();
            s.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            write!(s, "CONNECT {host}:443 HTTP/1.1\r\nHost: {host}:443\r\n\r\n").unwrap();
            let mut buf = [0u8; 64];
            let n = s.read(&mut buf).unwrap_or(0);
            String::from_utf8_lossy(&buf[..n]).to_string()
        };
        assert!(connect("not-granted.example.org").contains("403"));
        assert_eq!(b.revoke("network", g.network[0].grant_id.as_str()).unwrap(), 1);
        assert!(connect("mcp.example.com").contains("403"));
        assert_eq!(b.authorize_http("web", u, &[], None), Err(e("mcp_consent_required")));
    }

    #[test]
    fn no_direct_spawn_or_fetch_path_is_left() {
        let host = include_str!("mcp_host.rs");
        let (a, b) = ("TokioChild", "Process");
        assert!(!host.contains(&format!("{a}{b}")) && !host.contains(&format!("{}::process::Command", "tokio")) && !host.contains(&format!("std::{}::Command", "process")));
        let http = include_str!("mcp_http.rs");
        assert!(http.contains(".proxy(") && http.contains("pool_max_idle_per_host(0)"));
        assert!(!http.contains("reqwest::get") && !http.contains("Client::new()"));
        let toml = include_str!("../Cargo.toml");
        assert!(!toml.lines().any(|l| l.starts_with("rmcp") && l.contains("transport-child-process") && !l.contains("dev")));
    }
}
