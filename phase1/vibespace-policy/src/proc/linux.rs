//! Linux sandbox launcher: bubblewrap + seccomp. This is the only Linux process isolation
//! level; there is no weaker fallback. If bubblewrap is missing, too old, or the filter
//! cannot be handed over, every check fails closed with a visible reason.
//!
//! Sandbox profile (per execution):
//! * `--unshare-all --new-session --die-with-parent`: own user/pid/ipc/uts/cgroup/net
//!   namespaces. The child has NO network; tool network goes through the broker-owned domain
//!   proxy (crate::net), provider/model traffic never enters the sandbox.
//! * Read-only view of the host userland (`/usr /bin /lib* /etc`), private /tmp, /dev, /proc.
//!   /home is NOT bound; the writable isolated copy is bind-mounted read-write at its own
//!   path (ancestors created with --dir).
//! * `--clearenv` plus a fixed minimal environment: no host variables (no secrets) leak in.
//! * seccomp denylist (see seccomp.rs) on top.

use super::seccomp;
use super::{ExecSpec, ProcessError, ProcessLauncher, ProcessLimits};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Minimum bubblewrap version with `--seccomp FD` (0.5.0).
const MIN_BWRAP: (u64, u64, u64) = (0, 5, 0);

/// bubblewrap launcher.
pub struct BwrapLauncher {
    bwrap: PathBuf,
    /// Extra syscall numbers to deny (tests); empty in production.
    extra_denied: Vec<u32>,
    /// Isolated copy root bound read-write; `None` means no writable path (pure compute).
    root: Option<PathBuf>,
}

impl BwrapLauncher {
    /// Detect the system bubblewrap and verify it is new enough. Fail closed otherwise.
    pub fn detect() -> Result<Self, ProcessError> {
        Self::detect_at("bwrap".as_ref())
    }

    /// Detect at an explicit path (tests inject a missing path to prove fail-closed).
    pub fn detect_at(path: &Path) -> Result<Self, ProcessError> {
        let out = Command::new(path)
            .arg("--version")
            .output()
            .map_err(|_| ProcessError::IsolationUnavailable("bubblewrap not found"))?;
        if !out.status.success() {
            return Err(ProcessError::IsolationUnavailable(
                "bubblewrap --version failed",
            ));
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let ver = text
            .split_whitespace()
            .nth(1)
            .and_then(|v| {
                let mut it = v.split('.');
                Some((
                    it.next()?.parse().ok()?,
                    it.next().unwrap_or("0").parse().ok()?,
                    it.next().unwrap_or("0").parse().ok()?,
                ))
            })
            .ok_or(ProcessError::IsolationUnavailable(
                "bubblewrap version not parseable",
            ))?;
        if ver < MIN_BWRAP {
            return Err(ProcessError::IsolationUnavailable(
                "bubblewrap too old (needs --seccomp support, >= 0.5)",
            ));
        }
        Ok(Self {
            bwrap: path.to_path_buf(),
            extra_denied: Vec::new(),
            root: None,
        })
    }

    /// Bind this isolated copy read-write inside the sandbox (only this path is writable).
    pub fn with_root(mut self, root: &Path) -> Result<Self, ProcessError> {
        if !root.is_absolute() || !root.is_dir() {
            return Err(ProcessError::InvalidCommand("root"));
        }
        self.root = Some(root.to_path_buf());
        Ok(self)
    }

    /// Test seam: deny additional syscalls in the filter.
    pub fn with_extra_denied(mut self, syscalls: Vec<u32>) -> Self {
        self.extra_denied = syscalls;
        self
    }

    fn build_argv(&self, spec: &ExecSpec) -> Result<Vec<String>, ProcessError> {
        let mut a: Vec<String> = vec![
            "--unshare-all".into(),
            "--new-session".into(),
            "--die-with-parent".into(),
            "--clearenv".into(),
            "--ro-bind".into(),
            "/usr".into(),
            "/usr".into(),
            "--ro-bind".into(),
            "/bin".into(),
            "/bin".into(),
            "--ro-bind".into(),
            "/lib".into(),
            "/lib".into(),
        ];
        for opt in ["/lib64", "/lib32", "/etc"] {
            if Path::new(opt).exists() {
                a.push("--ro-bind-try".into());
                a.push(opt.into());
                a.push(opt.into());
            }
        }
        a.extend(
            ["--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp"]
                .into_iter()
                .map(Into::into),
        );
        if let Some(root) = &self.root {
            // Create ancestors of the bind destination inside the sandbox.
            let mut acc = PathBuf::new();
            for c in root.components() {
                if let Component::Normal(part) = c {
                    acc.push(part);
                    if acc != *root {
                        a.push("--dir".into());
                        a.push(acc.to_string_lossy().into_owned());
                    }
                }
            }
            a.push("--bind".into());
            a.push(root.to_string_lossy().into_owned());
            a.push(root.to_string_lossy().into_owned());
        }
        a.extend(
            [
                "--setenv",
                "PATH",
                "/usr/local/bin:/usr/bin:/bin",
                "--setenv",
                "HOME",
                "/tmp",
                "--setenv",
                "LANG",
                "C.UTF-8",
            ]
            .into_iter()
            .map(Into::into),
        );
        match &spec.cwd {
            Some(c) => {
                if let Some(root) = &self.root {
                    if !Path::new(c).starts_with(root) {
                        return Err(ProcessError::InvalidCommand("cwd outside root"));
                    }
                } else {
                    return Err(ProcessError::InvalidCommand("cwd without root"));
                }
                a.push("--chdir".into());
                a.push(c.clone());
            }
            None => {
                if let Some(root) = &self.root {
                    a.push("--chdir".into());
                    a.push(root.to_string_lossy().into_owned());
                }
            }
        }
        a.push("--".into());
        a.push(spec.program.clone());
        a.extend(spec.args.iter().cloned());
        Ok(a)
    }
}

impl ProcessLauncher for BwrapLauncher {
    fn check(&self) -> Result<(), ProcessError> {
        // Detected at construction; re-verify the binary still exists and the filter builds
        // (fail closed on either).
        if self.bwrap.is_absolute() && !self.bwrap.exists() {
            return Err(ProcessError::IsolationUnavailable("bubblewrap vanished"));
        }
        // Capability probe: one minimal real sandbox exec with the BASE filter (the
        // extra_denied test seam is not part of a host-capability check). On hosts where
        // unprivileged namespace or loopback setup is restricted (some CI runners deny
        // bwrap's RTM_NEWADDR inside the new netns), the probe fails and the sandbox
        // reports unavailable - fail closed, visible reason, no partial sandbox.
        let program = seccomp::build_filter().ok_or(ProcessError::IsolationUnavailable(
            "seccomp filter not available for this architecture",
        ))?;
        let probe = ExecSpec {
            program: "/bin/true".into(),
            args: Vec::new(),
            cwd: None,
        };
        let limits = ProcessLimits {
            timeout: Duration::from_secs(15),
            max_output_bytes: 4096,
        };
        match self.run_filtered(&program, &probe, &limits) {
            Ok(r) if r.exit_code == Some(0) => Ok(()),
            Ok(_) => Err(ProcessError::IsolationUnavailable(
                "sandbox probe exec failed (host cannot run bubblewrap sandboxes)",
            )),
            Err(_) => Err(ProcessError::IsolationUnavailable(
                "sandbox probe spawn failed (host cannot run bubblewrap sandboxes)",
            )),
        }
    }

    fn run(&self, spec: &ExecSpec, limits: &ProcessLimits) -> Result<super::ExecReceipt, ProcessError> {
        let program = self.filter_program()?;
        self.run_filtered(&program, spec, limits)
    }

    fn spawn_session(&self, spec: &ExecSpec) -> Result<Box<dyn super::SessionProcess>, ProcessError> {
        let program = self.filter_program()?;
        let fd = seccomp::filter_fd(&program)
            .map_err(|_| ProcessError::IsolationUnavailable("seccomp handoff failed"))?;
        let argv = self.build_argv(spec)?;
        let mut cmd = Command::new(&self.bwrap);
        cmd.arg("--seccomp")
            .arg(fd.as_raw().to_string())
            .args(&argv)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let child = cmd.spawn().map_err(|_| ProcessError::SpawnFailed)?;
        drop(fd);
        Ok(Box::new(BwrapSession { child, io_taken: false }))
    }
}

/// A bubblewrap session child. bubblewrap runs the payload as init of its own pid namespace
/// with `--die-with-parent`, so SIGKILL on the bubblewrap process takes down the whole tree.
struct BwrapSession {
    child: std::process::Child,
    io_taken: bool,
}

impl super::SessionProcess for BwrapSession {
    fn io(&mut self) -> Option<super::SessionIo> {
        if self.io_taken {
            return None;
        }
        self.io_taken = true;
        Some(super::SessionIo {
            stdin: Box::new(self.child.stdin.take()?),
            stdout: Box::new(self.child.stdout.take()?),
            stderr: Box::new(self.child.stderr.take()?),
        })
    }
    fn kill_tree(&mut self) -> Result<(), ProcessError> {
        let _ = self.child.kill();
        let _ = self.child.wait();
        Ok(())
    }
    fn try_wait(&mut self) -> Result<Option<Option<i32>>, ProcessError> {
        self.child
            .try_wait()
            .map(|o| o.map(|s| s.code()))
            .map_err(|e| ProcessError::Io(e.kind()))
    }
}

impl BwrapLauncher {
    /// Execute with an explicit prebuilt filter (shared by `run` and the check probe).
    fn run_filtered(
        &self,
        program: &[u8],
        spec: &ExecSpec,
        limits: &ProcessLimits,
    ) -> Result<super::ExecReceipt, ProcessError> {
        let fd = seccomp::filter_fd(program)
            .map_err(|_| ProcessError::IsolationUnavailable("seccomp handoff failed"))?;
        let argv = self.build_argv(spec)?;
        let mut cmd = Command::new(&self.bwrap);
        cmd.arg("--seccomp")
            .arg(fd.as_raw().to_string())
            .args(&argv)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|_| ProcessError::SpawnFailed)?;
        drop(fd); // bwrap has inherited its copy; ours is no longer needed.
        wait_capped(&mut child, limits)
    }
}

impl BwrapLauncher {
    fn filter_program(&self) -> Result<Vec<u8>, ProcessError> {
        let p = if self.extra_denied.is_empty() {
            super::seccomp::build_filter()
        } else {
            super::seccomp::build_filter_with_extra(&self.extra_denied)
        };
        p.ok_or(ProcessError::IsolationUnavailable(
            "seccomp filter not available for this architecture",
        ))
    }
}

/// Wait for the child with a timeout; capture capped stdout/stderr without deadlock.
pub(crate) fn wait_capped(
    child: &mut std::process::Child,
    limits: &ProcessLimits,
) -> Result<super::ExecReceipt, ProcessError> {
    fn cap_reader(mut r: impl Read + Send + 'static, cap: usize) -> std::thread::JoinHandle<(Vec<u8>, bool)> {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let mut chunk = [0u8; 8192];
            let mut truncated = false;
            loop {
                match r.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let room = cap.saturating_sub(buf.len());
                        let take = room.min(n);
                        buf.extend_from_slice(&chunk[..take]);
                        if take < n {
                            truncated = true;
                        }
                    }
                    Err(_) => break,
                }
            }
            (buf, truncated)
        })
    }
    let stdout = child.stdout.take().ok_or(ProcessError::SpawnFailed)?;
    let stderr = child.stderr.take().ok_or(ProcessError::SpawnFailed)?;
    let cap = limits.max_output_bytes;
    let h_out = cap_reader(stdout, cap);
    let h_err = cap_reader(stderr, cap);
    let deadline = Instant::now() + limits.timeout.min(Duration::from_secs(3600));
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = h_out.join();
                    let _ = h_err.join();
                    return Err(ProcessError::Timeout);
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return Err(ProcessError::SpawnFailed),
        }
    };
    let (out, out_t) = h_out.join().map_err(|_| ProcessError::SpawnFailed)?;
    let (err, err_t) = h_err.join().map_err(|_| ProcessError::SpawnFailed)?;
    Ok(super::ExecReceipt {
        exit_code: status.code(),
        stdout: String::from_utf8_lossy(&out).into_owned(),
        stderr: String::from_utf8_lossy(&err).into_owned(),
        truncated: out_t || err_t,
    })
}
