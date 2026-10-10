//! The credential lease: per-job scope, private endpoint, request policy.
use super::wire::{self, Op, Request, Response};
use super::{BridgeError, Policy, Secret, ValidatedRemote};
use crate::github_account;
use crate::oauth_store::{SecretBackend, StoreError};
use std::ffi::OsString;
#[cfg(unix)]
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_TTL: Duration = Duration::from_secs(15 * 60);
const MIN_TTL: Duration = Duration::from_secs(1);
/// git asks a helper once per auth round (info/refs, then receive-pack); more than this is abnormal.
const MAX_GETS: u32 = 6;

/// Supplies the token from the native credential store. Implementations never log or serialize it.
pub trait TokenSource: Send + Sync {
    /// Cheap readiness check done at lease open (before git runs): connected, scopes ok, right account.
    fn preflight(&self, login: &str) -> Result<(), BridgeError>;
    /// The token, only for the account the lease was opened for.
    fn token(&self, login: &str) -> Result<Secret, BridgeError>;
}

/// [`TokenSource`] over the existing GitHub device-flow account slot ([`github_account::Store`]).
pub struct StoreTokenSource<B: SecretBackend>(github_account::Store<B>);
impl<B: SecretBackend> StoreTokenSource<B> {
    pub fn new(backend: B) -> Self {
        Self(github_account::Store::new(backend))
    }
    fn account(&self, login: &str) -> Result<github_account::Account, BridgeError> {
        let acct = match self.0.load() {
            Ok(Some(a)) => a,
            Ok(None) | Err(StoreError::Corrupt) | Err(StoreError::Invalid) => return Err(BridgeError::NotConnected),
            Err(StoreError::Backend) => return Err(BridgeError::NeedsInput),
        };
        if !acct.login.eq_ignore_ascii_case(login) {
            return Err(BridgeError::AccountMismatch);
        }
        if acct.needs_scope_upgrade() {
            return Err(BridgeError::ScopeUpgradeNeeded);
        }
        Ok(acct)
    }
}
impl<B: SecretBackend> TokenSource for StoreTokenSource<B> {
    fn preflight(&self, login: &str) -> Result<(), BridgeError> {
        self.account(login).map(|_| ())
    }
    fn token(&self, login: &str) -> Result<Secret, BridgeError> {
        Ok(Secret::new(self.account(login)?.access_token.clone()))
    }
}

pub struct LeaseSpec {
    /// GitHub login the user selected for this operation.
    pub account_login: String,
    /// Output of [`super::validate_remote`] / [`super::validate_clone_url`].
    pub remote: ValidatedRemote,
    pub ttl: Duration,
}

/// Counters for the job outcome. No secrets.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LeaseOutcome {
    pub served: u32,
    pub refused: u32,
    /// git reported the credential rejected (`erase`): revoked token, SSO not authorized, no access.
    /// The stored token is NOT deleted; the caller reconciles (re-validate account, needs-input).
    pub auth_rejected: bool,
    pub refusal_codes: Vec<String>,
}

pub(crate) struct Shared {
    nonce: String,
    login: String,
    repo_key: String,
    policy: Policy,
    source: Arc<dyn TokenSource>,
    deadline: Instant,
    cancelled: AtomicBool,
    stop: AtomicBool,
    stats: Mutex<LeaseOutcome>,
    served: Mutex<Vec<Secret>>,
}

impl Shared {
    fn refuse(&self, code: &str) -> Option<Response> {
        if let Ok(mut s) = self.stats.lock() {
            s.refused += 1;
            if s.refusal_codes.len() < 16 {
                s.refusal_codes.push(code.to_owned());
            }
        }
        Some(Response::refuse(code))
    }
    /// Request policy. `None` = drop the connection silently (unauthenticated caller).
    pub(crate) fn handle(&self, req: Request) -> Option<Response> {
        if req.v != 1 || !wire::ct_eq(&req.nonce, &self.nonce) {
            if let Ok(mut s) = self.stats.lock() {
                s.refused += 1;
                if s.refusal_codes.len() < 16 {
                    s.refusal_codes.push("bad-nonce".into());
                }
            }
            return None;
        }
        if self.cancelled.load(Ordering::SeqCst) {
            return self.refuse("cancelled");
        }
        if Instant::now() >= self.deadline {
            return self.refuse("expired");
        }
        if req.protocol.as_deref() != Some(self.policy.scheme()) {
            return self.refuse("scheme");
        }
        if !req.host.as_deref().is_some_and(|h| h.eq_ignore_ascii_case(&self.policy.host_header())) {
            return self.refuse("host");
        }
        // useHttpPath is on: git must send the path, and it must be this lease's repository.
        match req.path.as_deref() {
            Some(p) if !p.is_empty() && wire::path_key(p) == self.repo_key => {}
            _ => return self.refuse("path"),
        }
        match req.op {
            Op::Erase => {
                if let Ok(mut s) = self.stats.lock() {
                    s.auth_rejected = true;
                }
                Some(Response::ack())
            }
            Op::Get => {
                if self.stats.lock().map(|s| s.served >= MAX_GETS).unwrap_or(true) {
                    return self.refuse("too-many");
                }
                match self.source.token(&self.login) {
                    Ok(tok) => {
                        let resp = Response { ok: true, username: Some(self.login.clone()), password: Some(tok.expose().to_owned()), code: None };
                        if let Ok(mut s) = self.stats.lock() {
                            s.served += 1;
                        }
                        if let Ok(mut v) = self.served.lock() {
                            v.push(tok);
                        }
                        Some(resp)
                    }
                    Err(_) => self.refuse("needs-input"),
                }
            }
        }
    }
}

#[cfg(unix)]
fn serve_stream<S: Read + Write>(shared: &Shared, mut s: S) {
    let mut line = String::new();
    {
        let mut r = BufReader::new((&mut s).take(wire::MAX_LINE as u64));
        if r.read_line(&mut line).is_err() || !line.ends_with('\n') {
            return;
        }
    }
    let Ok(req) = serde_json::from_str::<Request>(line.trim_end()) else { return };
    if let Some(resp) = shared.handle(req) {
        let mut out = serde_json::to_string(&resp).unwrap_or_default();
        out.push('\n');
        let _ = s.write_all(out.as_bytes());
        let _ = s.flush();
    }
}

pub struct CredentialLease {
    shared: Arc<Shared>,
    endpoint: String,
    helper_arg: String,
    thread: Option<std::thread::JoinHandle<()>>,
    cleanup: Option<PathBuf>,
}

fn new_nonce() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// Shell-safe `!'path'` helper spec for git's `credential.helper`. Forward slashes on Windows.
fn helper_spec(helper: &Path) -> Result<String, BridgeError> {
    let s = helper.to_str().ok_or(BridgeError::HelperMissing)?;
    let s = if cfg!(windows) { s.replace('\\', "/") } else { s.to_owned() };
    if !helper.is_absolute() || !helper.is_file() || s.chars().any(|c| c.is_control() || c == '\'' || c == '!') {
        return Err(BridgeError::HelperMissing);
    }
    Ok(format!("!'{s}'"))
}

impl CredentialLease {
    /// Opens the lease: preflights the account (so needs-input surfaces before git runs), creates the
    /// private endpoint and starts serving. Dropping the lease closes the endpoint.
    pub fn open(spec: LeaseSpec, policy: Policy, source: Arc<dyn TokenSource>, helper: &Path) -> Result<Self, BridgeError> {
        source.preflight(&spec.account_login)?;
        let helper_arg = helper_spec(helper)?;
        let ttl = spec.ttl.clamp(MIN_TTL, MAX_TTL);
        let shared = Arc::new(Shared {
            nonce: new_nonce(),
            login: spec.account_login,
            repo_key: spec.remote.repo.key(),
            policy,
            source,
            deadline: Instant::now() + ttl,
            cancelled: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            stats: Mutex::new(LeaseOutcome::default()),
            served: Mutex::new(Vec::new()),
        });
        let (endpoint, thread, cleanup) = transport::start(shared.clone())?;
        Ok(Self { shared, endpoint, helper_arg, thread: Some(thread), cleanup })
    }

    /// `-c` options that must precede the git subcommand. No secret in any of them.
    /// Resets every inherited helper (command-line config is read last, so this also clears
    /// URL-scoped `credential.<url>.helper` entries), turns on path-aware matching, refuses redirects,
    /// extra headers and every transport except the policy scheme.
    pub fn git_prefix_args(&self) -> Vec<OsString> {
        let mut v: Vec<OsString> = Vec::new();
        for kv in [
            "credential.helper=".to_owned(),
            format!("credential.helper={}", self.helper_arg),
            "credential.useHttpPath=true".to_owned(),
            "core.askPass=".to_owned(),
            "http.extraHeader=".to_owned(),
            "http.followRedirects=false".to_owned(),
            "protocol.allow=never".to_owned(),
            format!("protocol.{}.allow=always", self.shared.policy.scheme()),
        ] {
            v.push("-c".into());
            v.push(kv.into());
        }
        v
    }
    /// Environment for the git child: private endpoint + nonce. The token is never in the environment.
    pub fn env(&self) -> Vec<(OsString, OsString)> {
        vec![
            (wire::ENV_ENDPOINT.into(), self.endpoint.clone().into()),
            (wire::ENV_NONCE.into(), self.shared.nonce.clone().into()),
            ("GIT_TERMINAL_PROMPT".into(), "0".into()),
            ("GCM_INTERACTIVE".into(), "never".into()),
        ]
    }
    /// Stops serving; further helper requests are refused (`cancelled`).
    pub fn cancel(&self) {
        self.shared.cancelled.store(true, Ordering::SeqCst);
    }
    pub fn outcome(&self) -> LeaseOutcome {
        self.shared.stats.lock().map(|s| s.clone()).unwrap_or_default()
    }
    /// Replaces every token this lease has handed out in `bytes` (defense in depth for captured output).
    pub fn redact(&self, bytes: &[u8]) -> Vec<u8> {
        let mut out = bytes.to_vec();
        if let Ok(v) = self.shared.served.lock() {
            for t in v.iter() {
                let needle = t.expose().as_bytes();
                if needle.is_empty() {
                    continue;
                }
                while let Some(i) = out.windows(needle.len()).position(|w| w == needle) {
                    out.splice(i..i + needle.len(), b"[redacted]".iter().copied());
                }
            }
        }
        out
    }
    #[doc(hidden)]
    pub fn endpoint_for_tests(&self) -> (String, String) {
        (self.endpoint.clone(), self.shared.nonce.clone())
    }
}
impl Drop for CredentialLease {
    fn drop(&mut self) {
        self.shared.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
        if let Some(dir) = self.cleanup.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

#[cfg(unix)]
mod transport {
    use super::*;
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    use std::os::unix::net::{UnixListener, UnixStream};

    fn peer_is_same_user(s: &UnixStream) -> bool {
        use std::os::fd::AsRawFd;
        // SAFETY: plain libc calls on a valid fd with correctly sized out-parameters.
        unsafe {
            let me = libc::geteuid();
            #[cfg(any(target_os = "linux", target_os = "android"))]
            {
                let mut cred: libc::ucred = std::mem::zeroed();
                let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
                libc::getsockopt(s.as_raw_fd(), libc::SOL_SOCKET, libc::SO_PEERCRED, &mut cred as *mut _ as *mut libc::c_void, &mut len) == 0 && cred.uid == me
            }
            #[cfg(not(any(target_os = "linux", target_os = "android")))]
            {
                let (mut uid, mut gid) = (0 as libc::uid_t, 0 as libc::gid_t);
                libc::getpeereid(s.as_raw_fd(), &mut uid, &mut gid) == 0 && uid == me
            }
        }
    }

    pub(super) fn start(shared: Arc<Shared>) -> Result<(String, std::thread::JoinHandle<()>, Option<PathBuf>), BridgeError> {
        let mut base = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).filter(|p| p.is_dir()).unwrap_or_else(std::env::temp_dir);
        // sun_path is ~104 bytes; keep the socket path comfortably below.
        if base.as_os_str().len() > 60 {
            base = PathBuf::from("/tmp");
        }
        let dir = base.join(format!("sg-{}", &uuid::Uuid::new_v4().simple().to_string()[..12]));
        std::fs::DirBuilder::new().mode(0o700).create(&dir).map_err(|_| BridgeError::Endpoint)?;
        let guard = |e| {
            let _ = std::fs::remove_dir_all(&dir);
            e
        };
        if std::fs::metadata(&dir).map(|m| m.permissions().mode() & 0o077 != 0).unwrap_or(true) {
            return Err(guard(BridgeError::Endpoint));
        }
        let sock = dir.join("c.sock");
        let listener = UnixListener::bind(&sock).map_err(|_| guard(BridgeError::Endpoint))?;
        let _ = std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600));
        listener.set_nonblocking(true).map_err(|_| guard(BridgeError::Endpoint))?;
        let endpoint = sock.to_str().ok_or_else(|| guard(BridgeError::Endpoint))?.to_owned();
        let t = std::thread::spawn(move || {
            let hard_stop = shared.deadline + Duration::from_secs(2);
            while !shared.stop.load(Ordering::SeqCst) && Instant::now() < hard_stop {
                match listener.accept() {
                    Ok((s, _)) => {
                        let _ = s.set_nonblocking(false);
                        let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
                        let _ = s.set_write_timeout(Some(Duration::from_secs(5)));
                        if peer_is_same_user(&s) {
                            serve_stream(&shared, s);
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(5)),
                    Err(_) => break,
                }
            }
        });
        Ok((endpoint, t, Some(dir)))
    }
}

#[cfg(windows)]
mod transport {
    //! Named pipe, byte mode, remote clients rejected. NOT exercised on this build host: needs the
    //! Windows gate run (see docs/git/CREDENTIAL-BRIDGE.md).
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader as TBufReader};
    use tokio::net::windows::named_pipe::ServerOptions;

    pub(super) fn start(shared: Arc<Shared>) -> Result<(String, std::thread::JoinHandle<()>, Option<PathBuf>), BridgeError> {
        let name = format!(r"\\.\pipe\somnia-git-{}", uuid::Uuid::new_v4().simple());
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_| BridgeError::Endpoint)?;
        let first = {
            let _g = rt.enter();
            ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).max_instances(2).create(&name).map_err(|_| BridgeError::Endpoint)?
        };
        let pipe = name.clone();
        let t = std::thread::spawn(move || {
            rt.block_on(async move {
                let hard_stop = shared.deadline + Duration::from_secs(2);
                let mut server = first;
                while !shared.stop.load(Ordering::SeqCst) && Instant::now() < hard_stop {
                    match tokio::time::timeout(Duration::from_millis(50), server.connect()).await {
                        Err(_) => continue,
                        Ok(Err(_)) => break,
                        Ok(Ok(())) => {}
                    }
                    let Ok(next) = ServerOptions::new().reject_remote_clients(true).create(&pipe) else { break };
                    let mut conn = std::mem::replace(&mut server, next);
                    let _ = tokio::time::timeout(Duration::from_secs(5), async {
                        let mut line = String::new();
                        {
                            let mut r = TBufReader::new((&mut conn).take(wire::MAX_LINE as u64));
                            if r.read_line(&mut line).await.is_err() || !line.ends_with('\n') {
                                return;
                            }
                        }
                        let Ok(req) = serde_json::from_str::<Request>(line.trim_end()) else { return };
                        if let Some(resp) = shared.handle(req) {
                            let mut out = serde_json::to_string(&resp).unwrap_or_default();
                            out.push('\n');
                            let _ = conn.write_all(out.as_bytes()).await;
                            let _ = conn.flush().await;
                        }
                    })
                    .await;
                    let _ = conn.disconnect();
                }
            });
        });
        Ok((name, t, None))
    }
}
