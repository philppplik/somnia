//! Trusted native system-Git argv runner. Never expose as a raw IPC endpoint.
use super::jobs::{Cancellation, GitJobError, GitJobErrorCode};
use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct GitCommand {
    pub(crate) args: Vec<OsString>,
    pub(crate) is_write: bool,
    pub(crate) is_network: bool,
    pub(crate) may_publish: bool,
    deadline: Option<Duration>,
    input: Option<Vec<u8>>,
    limit: usize,
}
// Intentionally no Debug/Serialize: argv and raw outputs must not enter logs.
pub struct GitCommandOutput {
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub truncated: bool,
}
impl GitCommand {
    pub fn new<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Self {
            args: args.into_iter().map(|a| a.as_ref().to_owned()).collect(),
            is_write: false,
            is_network: false,
            may_publish: false,
            deadline: Some(Duration::from_secs(30)),
            input: None,
            limit: 16 * 1024 * 1024,
        }
    }
    pub fn write(mut self) -> Self {
        self.is_write = true;
        self
    }
    pub fn network(mut self, may_publish: bool) -> Self {
        self.is_network = true;
        self.may_publish = may_publish;
        self.is_write = true;
        self.deadline = None;
        self
    }
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.deadline = Some(timeout);
        self
    }
    pub fn stdin(mut self, bytes: Vec<u8>) -> Self {
        self.input = Some(bytes);
        self
    }
    pub fn output_limit(mut self, bytes: usize) -> Self {
        self.limit = bytes.min(64 * 1024 * 1024);
        self
    }

    pub fn checked(
        &self,
        cwd: &Path,
        cancel: &Cancellation,
    ) -> Result<GitCommandOutput, GitJobError> {
        let out = self.run(cwd, cancel)?;
        if out.code != Some(0) {
            return Err(classify(&out.stderr));
        }
        Ok(out)
    }
    pub fn run(&self, cwd: &Path, cancel: &Cancellation) -> Result<GitCommandOutput, GitJobError> {
        if cancel.is_cancelled() {
            return Err(GitJobError::new(GitJobErrorCode::Cancelled));
        }
        // Callers own semantic validation. Reject obvious credential-bearing arguments as defense in depth.
        if self.args.iter().any(|arg| {
            let a = arg.to_string_lossy().to_ascii_lowercase();
            a.contains("authorization:")
                || a.contains("extraheader=")
                || a.contains("access_token=")
                || ((a.contains("https://") || a.contains("http://"))
                    && a.split("://")
                        .nth(1)
                        .is_some_and(|x| x.split('/').next().unwrap_or("").contains('@')))
        }) {
            return Err(GitJobError::new(GitJobErrorCode::Unsupported));
        }
        let mut cmd = Command::new("git");
        cmd.env_clear();
        for key in [
            "PATH",
            "HOME",
            "USERPROFILE",
            "HOMEDRIVE",
            "HOMEPATH",
            "SystemRoot",
            "TEMP",
            "TMP",
            "TMPDIR",
            "LANG",
        ] {
            if let Some(value) = std::env::var_os(key) {
                cmd.env(key, value);
            }
        }
        cmd.env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "never");
        if !self.is_write {
            cmd.env("GIT_OPTIONAL_LOCKS", "0");
        }
        // Network jobs must opt into their explicit auth route. Never silently use ambient helpers.
        if self.is_network {
            cmd.args([
                "-c",
                "credential.helper=",
                "-c",
                "credential.useHttpPath=true",
            ]);
        }
        cmd.current_dir(cwd)
            .args([
                "--no-pager",
                "-c",
                "core.quotepath=false",
                "-c",
                "core.longpaths=true",
            ])
            .args(&self.args)
            .stdin(if self.input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let mut child = cmd.spawn().map_err(|e| {
            GitJobError::new(if e.kind() == std::io::ErrorKind::NotFound {
                GitJobErrorCode::GitMissing
            } else {
                GitJobErrorCode::Io
            })
        })?;
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let limit = self.limit;
        let out_thread = std::thread::spawn(move || drain(stdout, limit));
        let err_thread = std::thread::spawn(move || drain(stderr, limit.min(64 * 1024)));
        let writer = match (child.stdin.take(), self.input.clone()) {
            (Some(mut pipe), Some(bytes)) => Some(std::thread::spawn(move || {
                let _ = pipe.write_all(&bytes);
            })),
            _ => None,
        };
        let started = Instant::now();
        let status = loop {
            if cancel.is_cancelled() || self.deadline.is_some_and(|d| started.elapsed() >= d) {
                stop_tree(&mut child);
                let _ = child.wait();
                let _ = out_thread.join();
                let _ = err_thread.join();
                if let Some(writer) = writer {
                    let _ = writer.join();
                }
                return Err(GitJobError::new(if cancel.is_cancelled() {
                    GitJobErrorCode::Cancelled
                } else {
                    GitJobErrorCode::Timeout
                }));
            }
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(_) => {
                    stop_tree(&mut child);
                    let _ = child.wait();
                    let _ = out_thread.join();
                    let _ = err_thread.join();
                    if let Some(writer) = writer {
                        let _ = writer.join();
                    }
                    return Err(GitJobError::new(GitJobErrorCode::Io));
                }
            }
        };
        // A completed Git process must not leave hooks/helpers holding our pipes open.
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
        if let Some(writer) = writer {
            let _ = writer.join();
        }
        let (stdout, out_cap) = out_thread
            .join()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        let (stderr, err_cap) = err_thread
            .join()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        Ok(GitCommandOutput {
            code: status.code(),
            stdout,
            stderr,
            truncated: out_cap || err_cap,
        })
    }
}
fn drain(mut pipe: impl Read, cap: usize) -> (Vec<u8>, bool) {
    let mut retained = Vec::new();
    let mut truncated = false;
    let mut buf = [0; 8192];
    loop {
        match pipe.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let take = n.min(cap.saturating_sub(retained.len()));
                retained.extend_from_slice(&buf[..take]);
                truncated |= take < n;
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    (retained, truncated)
}
fn stop_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
}
fn classify(stderr: &[u8]) -> GitJobError {
    let text = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    let code = if text.contains("not a git repository") {
        GitJobErrorCode::NotARepo
    } else if text.contains("saml") || text.contains("sso") {
        GitJobErrorCode::Sso
    } else if text.contains("protected branch") || text.contains("gh006") || text.contains("gh013")
    {
        GitJobErrorCode::Protection
    } else if text.contains("workflow") && text.contains("scope") {
        GitJobErrorCode::Permission
    } else if text.contains("authentication failed") || text.contains("could not read username") {
        GitJobErrorCode::AuthReconnect
    } else if text.contains("permission denied") || text.contains("403") {
        GitJobErrorCode::Permission
    } else if text.contains("non-fast-forward") || text.contains("divergent") {
        GitJobErrorCode::Divergence
    } else if text.contains("would be overwritten") || text.contains("unmerged files") {
        GitJobErrorCode::DirtyState
    } else if text.contains("unable to auto-detect email")
        || text.contains("author identity unknown")
    {
        GitJobErrorCode::IdentityMissing
    } else if text.contains("failed to sign") || text.contains("gpg failed") {
        GitJobErrorCode::Signing
    } else {
        GitJobErrorCode::Transport
    };
    GitJobError::new(code)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn argv_is_not_a_shell_and_output_is_bounded() {
        let dir = tempfile::tempdir().unwrap();
        let out = GitCommand::new(["--version", "; touch injected"])
            .run(dir.path(), &Cancellation::default())
            .unwrap();
        assert!(!dir.path().join("injected").exists());
        assert_eq!(out.code, Some(0));
        let out = GitCommand::new(["--version"])
            .output_limit(4)
            .run(dir.path(), &Cancellation::default())
            .unwrap();
        assert_eq!(out.stdout.len(), 4);
        assert!(out.truncated);
    }
    #[test]
    fn large_stdin_and_stdout_are_drained_concurrently() {
        let dir = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .arg(dir.path())
            .status()
            .unwrap()
            .success());
        let bytes = vec![b'x'; 2 * 1024 * 1024];
        let out = GitCommand::new(["hash-object", "--stdin"])
            .stdin(bytes)
            .checked(dir.path(), &Cancellation::default())
            .unwrap();
        assert_eq!(out.stdout.len(), 41);
        assert!(!out.truncated);
    }
    #[test]
    fn credential_argv_is_rejected_without_leaking_it() {
        let error = GitCommand::new(["fetch", "https://user:private@example.invalid/repo"])
            .run(Path::new("."), &Cancellation::default())
            .err()
            .unwrap();
        assert_eq!(error.code, GitJobErrorCode::Unsupported);
        assert!(!error.message.contains("private"));
    }
    #[test]
    fn network_has_no_default_local_deadline() {
        let command = GitCommand::new(["fetch"]).network(false);
        assert_eq!(command.deadline, None);
        assert!(command.is_network);
        assert!(!command.may_publish);
    }
    #[test]
    fn classifiers_are_typed_and_secret_free() {
        for (input, code) in [
            ("SAML SSO", GitJobErrorCode::Sso),
            ("protected branch GH006", GitJobErrorCode::Protection),
            ("workflow scope missing", GitJobErrorCode::Permission),
            ("Authentication failed", GitJobErrorCode::AuthReconnect),
            ("Author identity unknown", GitJobErrorCode::IdentityMissing),
            ("gpg failed", GitJobErrorCode::Signing),
            ("non-fast-forward", GitJobErrorCode::Divergence),
            ("would be overwritten", GitJobErrorCode::DirtyState),
        ] {
            let error = classify(format!("{input} secret-marker").as_bytes());
            assert_eq!(error.code, code);
            assert!(!error.message.contains("secret-marker"));
        }
    }
    #[cfg(unix)]
    fn slow_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .arg(dir.path())
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .current_dir(dir.path())
            .args(["config", "alias.slow", "!sleep 10"])
            .status()
            .unwrap()
            .success());
        dir
    }
    #[cfg(unix)]
    #[test]
    fn cancellation_kills_process_tree() {
        let dir = slow_repo();
        let cancel = Cancellation::default();
        let remote = cancel.clone();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            remote.cancel();
        });
        let started = Instant::now();
        let error = GitCommand::new(["slow"])
            .network(false)
            .run(dir.path(), &cancel)
            .err()
            .unwrap();
        thread.join().unwrap();
        assert_eq!(error.code, GitJobErrorCode::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(2));
    }
    #[cfg(unix)]
    #[test]
    fn timeout_kills_process_tree() {
        let dir = slow_repo();
        let started = Instant::now();
        let error = GitCommand::new(["slow"])
            .timeout(Duration::from_millis(50))
            .run(dir.path(), &Cancellation::default())
            .err()
            .unwrap();
        assert_eq!(error.code, GitJobErrorCode::Timeout);
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
