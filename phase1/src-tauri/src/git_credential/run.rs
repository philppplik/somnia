//! Runs one authenticated network git command under a lease.
use super::{BridgeError, CredentialLease, Operation, ValidatedRemote};
use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const MAX_OUT: usize = 4 * 1024 * 1024;
const MAX_ERR: usize = 2000;

/// Captured output with every token the lease handed out already replaced. `uncertain` is true when
/// the process was killed (timeout/cancel): a push may or may not have landed, reconcile before retry.
#[derive(Debug)]
pub struct NetGitOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// Subcommands allowed with a credential. Anything else (config, remote add, credential, alias) is refused.
fn allowed(op: Operation, sub: &str) -> bool {
    match op {
        Operation::Clone => sub == "clone",
        Operation::Fetch => matches!(sub, "fetch" | "ls-remote"),
        Operation::Push => sub == "push",
    }
}

/// `args` is the git argv after the `-c` prefix, e.g. `["push", "--porcelain", url, "refs/heads/a:refs/heads/a"]`.
/// The first element must be the subcommand allowed for the remote's operation; no arg may carry URL
/// userinfo, a `-c`/`--config*`/`--upload-pack`/`--receive-pack`/`--exec` option or a second URL.
/// The validated `remote.url` must appear as an argument so git connects to exactly what was validated.
pub fn run_git_with_lease(
    lease: &CredentialLease,
    remote: &ValidatedRemote,
    cwd: &Path,
    args: &[OsString],
    timeout: Duration,
    cancel: Option<&std::sync::atomic::AtomicBool>,
) -> Result<NetGitOutput, BridgeError> {
    let sub = args.first().and_then(|a| a.to_str()).ok_or(BridgeError::InvalidArgs)?;
    if !allowed(remote.operation, sub) {
        return Err(BridgeError::InvalidArgs);
    }
    let mut saw_url = false;
    for a in &args[1..] {
        let s = a.to_str().ok_or(BridgeError::InvalidArgs)?;
        let low = s.to_ascii_lowercase();
        if s == "-c" || low.starts_with("--config") || low.starts_with("--upload-pack") || low.starts_with("--receive-pack") || low.starts_with("--exec") || low.starts_with("--template") {
            return Err(BridgeError::InvalidArgs);
        }
        if s == remote.url {
            saw_url = true;
        } else if low.contains("://") || low.contains("::") {
            return Err(BridgeError::InvalidArgs);
        }
    }
    if !saw_url {
        return Err(BridgeError::InvalidArgs);
    }
    let mut cmd = Command::new("git");
    cmd.env_clear();
    for k in ["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "LANG", "XDG_CONFIG_HOME"] {
        if let Some(v) = std::env::var_os(k) {
            cmd.env(k, v);
        }
    }
    cmd.env("LC_ALL", "C");
    for (k, v) in lease.env() {
        cmd.env(k, v);
    }
    cmd.current_dir(cwd)
        .args(lease.git_prefix_args())
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|_| BridgeError::GitFailed)?;
    let mut so = child.stdout.take();
    let mut se = child.stderr.take();
    let t_out = std::thread::spawn(move || read_capped(so.as_mut(), MAX_OUT));
    let t_err = std::thread::spawn(move || read_capped(se.as_mut(), MAX_ERR * 2));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break Ok(s),
            Ok(None) => {
                let cancelled = cancel.is_some_and(|c| c.load(std::sync::atomic::Ordering::SeqCst));
                if cancelled || Instant::now() >= deadline {
                    lease.cancel();
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(if cancelled { BridgeError::Cancelled } else { BridgeError::Timeout });
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => {
                let _ = child.kill();
                break Err(BridgeError::GitFailed);
            }
        }
    };
    let out = t_out.join().unwrap_or_default();
    let err = t_err.join().unwrap_or_default();
    let status = status?;
    let clean = |b: &[u8], max: usize| String::from_utf8_lossy(&lease.redact(b)).chars().filter(|c| *c != '\r').take(max).collect::<String>();
    Ok(NetGitOutput { code: status.code(), stdout: clean(&out, MAX_OUT), stderr: clean(&err, MAX_ERR).trim().to_owned() })
}

fn read_capped<R: Read>(r: Option<&mut R>, cap: usize) -> Vec<u8> {
    let mut v = Vec::new();
    if let Some(r) = r {
        let mut buf = [0u8; 16 * 1024];
        while let Ok(n) = r.read(&mut buf) {
            if n == 0 {
                break;
            }
            if v.len() < cap {
                v.extend_from_slice(&buf[..n.min(cap - v.len())]);
            }
        }
    }
    v
}

