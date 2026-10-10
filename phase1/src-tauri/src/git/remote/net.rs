//! Cancellable network runner for git, with isolated config, private credential-helper
//! plumbing, progress parsing, tree kill and redacted diagnostics.

use super::{
    iso_env, CredentialLease, Policy, RResult, RemoteError, RemoteErrorCode,
};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_STDOUT: usize = 4 * 1024 * 1024;
const MAX_STDERR_TAIL: usize = 16 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Progress {
    pub phase: String,
    pub percent: Option<u8>,
}

/// Adapter point for the GitJob engine (S1): progress events out, nothing else.
pub trait JobSink: Send + Sync {
    fn progress(&self, p: &Progress);
}

/// Cancel flag + progress sink for one job.
#[derive(Clone)]
pub struct NetCtx {
    cancel: Arc<AtomicBool>,
    sink: Option<Arc<dyn JobSink>>,
}

impl NetCtx {
    pub fn new(sink: Option<Arc<dyn JobSink>>) -> Self {
        Self { cancel: Arc::new(AtomicBool::new(false)), sink }
    }
    /// Never cancelled, no progress. Used for reconciliation reads after a cancel.
    pub fn detached() -> Self {
        Self::new(None)
    }
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
    fn emit(&self, p: &Progress) {
        if let Some(s) = &self.sink {
            s.progress(p);
        }
    }
}

/// `git_network_cancel`: job id to cancel flag. The GitJob engine may replace this with its own table.
#[derive(Default)]
pub struct CancelRegistry {
    jobs: Mutex<HashMap<String, NetCtx>>,
}

impl CancelRegistry {
    pub fn register(&self, job_id: &str, sink: Option<Arc<dyn JobSink>>) -> NetCtx {
        let ctx = NetCtx::new(sink);
        self.jobs.lock().unwrap_or_else(|e| e.into_inner()).insert(job_id.to_string(), ctx.clone());
        ctx
    }
    /// True when a running job with that id was signalled.
    pub fn cancel(&self, job_id: &str) -> bool {
        match self.jobs.lock().unwrap_or_else(|e| e.into_inner()).get(job_id) {
            Some(c) => {
                c.cancel();
                true
            }
            None => false,
        }
    }
    pub fn finish(&self, job_id: &str) {
        self.jobs.lock().unwrap_or_else(|e| e.into_inner()).remove(job_id);
    }
}

pub(crate) struct NetOut {
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    /// Redacted, progress lines removed, last 16 KB.
    pub stderr: String,
    pub cancelled: bool,
    pub timed_out: bool,
}

// ---------------------------------------------------------------- redaction

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Removes URL userinfo and anything shaped like a GitHub token from text that may be shown or logged.
pub fn redact(input: &str) -> String {
    // 1. userinfo: scheme://user:pass@host -> scheme://***@host
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(pos) = rest.find("://") {
        let (head, tail) = rest.split_at(pos + 3);
        out.push_str(head);
        let end = tail.find(|c: char| c == '/' || c.is_whitespace() || c == '\'' || c == '"').unwrap_or(tail.len());
        let authority = &tail[..end];
        if let Some(at) = authority.rfind('@') {
            out.push_str("***");
            out.push_str(&authority[at..]);
        } else {
            out.push_str(authority);
        }
        rest = &tail[end..];
    }
    out.push_str(rest);
    // 2. token-shaped words
    let mut res = String::with_capacity(out.len());
    let mut word = String::new();
    let flush = |word: &mut String, res: &mut String| {
        let is_tok = word.len() >= 20
            && ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"].iter().any(|p| word.starts_with(p));
        if is_tok {
            res.push_str("***");
        } else {
            res.push_str(word);
        }
        word.clear();
    };
    for c in out.chars() {
        if is_token_char(c) {
            word.push(c);
        } else {
            flush(&mut word, &mut res);
            res.push(c);
        }
    }
    flush(&mut word, &mut res);
    res
}

// ---------------------------------------------------------------- classification

/// Maps git/HTTP stderr to a typed code. Order matters: SSO before auth, workflow scope
/// and protection before generic permission, so a scope rejection is never an "invalid token".
pub fn classify_transport(stderr: &str) -> RemoteErrorCode {
    use RemoteErrorCode as C;
    let s = stderr.to_lowercase();
    let has = |p: &str| s.contains(p);
    if has("saml") || has("sso") && has("organization") {
        return C::SsoRequired;
    }
    if has("workflow` scope") || has("workflow scope") || has("refusing to allow an oauth app to create or update workflow") || has("refusing to allow a personal access token to create or update workflow") {
        return C::WorkflowScopeMissing;
    }
    if has("protected branch") || has("gh006") || has("gh013") || has("repository rule violations") || has("rulesets") {
        return C::ProtectedBranch;
    }
    if has("non-fast-forward") || has("fetch first") || has("tip of your current branch is behind") {
        return C::NonFastForward;
    }
    if has("authentication failed") || has("invalid username or password") || has("could not read username") || has("could not read password") || has("returned error: 401") || has("bad credentials") || has("terminal prompts disabled") {
        return C::AuthRequired;
    }
    if (has("permission to") && has("denied")) || has("returned error: 403") || has("write access to repository not granted") {
        return C::PermissionDenied;
    }
    if has("repository not found") || has("returned error: 404") {
        return C::NotFound;
    }
    if has("pre-receive hook declined") || has("remote rejected") || has("hook declined") {
        return C::RemoteRejected;
    }
    if has("could not resolve host") || has("failed to connect") || has("connection refused") || has("network is unreachable") || has("connection timed out") || has("operation timed out") || has("couldn't connect") || has("ssl") && has("connect") || has("unable to access") && (has("timeout") || has("timed out")) || has("too slow") {
        return C::Offline;
    }
    C::Unknown
}

pub(crate) fn error_from_stderr(stderr: &str) -> RemoteError {
    let code = classify_transport(stderr);
    let detail: String = stderr.chars().rev().take(1500).collect::<Vec<_>>().into_iter().rev().collect();
    RemoteError::detail(code, super::friendly(code), detail)
}

// ---------------------------------------------------------------- runner

fn kill_tree(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg("-KILL").arg("--").arg(format!("-{pid}")).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
}

fn config_args(policy: &Policy, lease: Option<&dyn CredentialLease>) -> RResult<Vec<OsString>> {
    let mut a: Vec<String> = Vec::new();
    let mut c = |kv: &str| {
        a.push("-c".into());
        a.push(kv.into());
    };
    // Reset any helper list, deny prompts, deny non-HTTPS transports, no extra headers.
    c("credential.helper=");
    c("credential.useHttpPath=true");
    c("core.askPass=");
    c("http.extraHeader=");
    c("core.fsmonitor=false");
    c("http.lowSpeedLimit=1");
    c("http.lowSpeedTime=60");
    c("protocol.allow=never");
    c("protocol.https.allow=always");
    if policy.allow_test_urls {
        c("protocol.file.allow=always");
        c("protocol.http.allow=always");
    }
    if let Some(l) = lease {
        for (k, v) in l.git_config() {
            if !k.starts_with("credential.") || k.contains('=') || k.contains(char::is_whitespace) || v.contains('\n') || v.contains('\0') {
                return Err(RemoteError::detail(RemoteErrorCode::UrlRejected, "The credential setup is not allowed", "lease-config-key"));
            }
            c(&format!("{k}={v}"));
        }
    }
    Ok(a.into_iter().map(OsString::from).collect())
}

fn handle_stderr_chunk(line: &[u8], ctx: &NetCtx, tail: &mut Vec<u8>, last_pct: &mut Option<(String, u8)>, phase_default: &str) {
    let text = String::from_utf8_lossy(line);
    let t = text.trim();
    if t.is_empty() {
        return;
    }
    // "Receiving objects:  45% (45/100)" or "remote: Compressing objects: 100% (3/3)"
    if let Some((label, rest)) = t.split_once(':') {
        if let Some(pct_pos) = rest.find('%') {
            let digits: String = rest[..pct_pos].chars().rev().take_while(|c| c.is_ascii_digit()).collect::<Vec<_>>().into_iter().rev().collect();
            if let Ok(p) = digits.parse::<u8>() {
                let label = label.trim().trim_start_matches("remote:").trim().to_string();
                let label = if label.is_empty() { phase_default.to_string() } else { label };
                if last_pct.as_ref() != Some(&(label.clone(), p)) {
                    ctx.emit(&Progress { phase: label.clone(), percent: Some(p.min(100)) });
                    *last_pct = Some((label, p));
                }
                return;
            }
        }
    }
    tail.extend_from_slice(t.as_bytes());
    tail.push(b'\n');
    if tail.len() > MAX_STDERR_TAIL {
        let cut = tail.len() - MAX_STDERR_TAIL;
        tail.drain(..cut);
    }
}

/// Runs `git <config> <args>` in `cwd` with isolated config and the lease's private helper.
/// Cancel and timeout are reported in the result (not as errors) so callers can reconcile.
pub(crate) fn run_net(
    cwd: &Path,
    policy: &Policy,
    args: &[OsString],
    lease: Option<&dyn CredentialLease>,
    ctx: &NetCtx,
    timeout: Duration,
    phase: &str,
) -> RResult<NetOut> {
    if ctx.is_cancelled() {
        return Ok(NetOut { code: None, stdout: vec![], stderr: String::new(), cancelled: true, timed_out: false });
    }
    let cfg = config_args(policy, lease)?;
    let mut cmd = Command::new("git");
    crate::git::whitelist_env(&mut cmd);
    for (k, v) in iso_env() {
        cmd.env(k, v);
    }
    if let Some(l) = lease {
        for (k, v) in l.env() {
            if !k.starts_with("SOMNIA_") || k.contains('=') {
                return Err(RemoteError::detail(RemoteErrorCode::UrlRejected, "The credential setup is not allowed", "lease-env-key"));
            }
            cmd.env(k, v);
        }
    }
    cmd.current_dir(cwd)
        .arg("-c")
        .arg("core.quotepath=false")
        .args(&cfg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            RemoteError::new(RemoteErrorCode::GitMissing, "The git executable was not found")
        } else {
            RemoteError::detail(RemoteErrorCode::Io, "Could not start git", e.to_string())
        }
    })?;
    let pid = child.id();
    let mut out_h = child.stdout.take();
    let mut err_h = child.stderr.take();
    let out_t = std::thread::spawn(move || {
        let mut keep = Vec::new();
        let mut buf = [0u8; 32 * 1024];
        if let Some(r) = out_h.as_mut() {
            while let Ok(n) = r.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if keep.len() < MAX_STDOUT {
                    let room = MAX_STDOUT - keep.len();
                    keep.extend_from_slice(&buf[..n.min(room)]);
                }
            }
        }
        keep
    });
    let ctx2 = ctx.clone();
    let phase_s = phase.to_string();
    let err_t = std::thread::spawn(move || {
        let mut tail = Vec::new();
        let mut line = Vec::new();
        let mut last = None;
        let mut buf = [0u8; 8 * 1024];
        if let Some(r) = err_h.as_mut() {
            while let Ok(n) = r.read(&mut buf) {
                if n == 0 {
                    break;
                }
                for b in &buf[..n] {
                    if *b == b'\r' || *b == b'\n' {
                        handle_stderr_chunk(&line, &ctx2, &mut tail, &mut last, &phase_s);
                        line.clear();
                    } else if line.len() < 4096 {
                        line.push(*b);
                    }
                }
            }
            handle_stderr_chunk(&line, &ctx2, &mut tail, &mut last, &phase_s);
        }
        tail
    });
    let deadline = Instant::now() + timeout;
    let mut cancelled = false;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) => {
                if ctx.is_cancelled() {
                    cancelled = true;
                } else if Instant::now() >= deadline {
                    timed_out = true;
                }
                if cancelled || timed_out {
                    kill_tree(pid);
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                kill_tree(pid);
                let _ = child.kill();
                let _ = out_t.join();
                let _ = err_t.join();
                return Err(RemoteError::detail(RemoteErrorCode::Io, "Could not wait for git", e.to_string()));
            }
        }
    };
    let stdout = out_t.join().unwrap_or_default();
    let stderr = redact(&String::from_utf8_lossy(&err_t.join().unwrap_or_default()));
    Ok(NetOut { code: status.and_then(|s| s.code()), stdout, stderr, cancelled, timed_out })
}
