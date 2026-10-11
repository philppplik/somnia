//! Controlled process runner (Policy v2, Welle-B A4).
//!
//! A shell effect runs only through a [`ProcessExecutor`] attached to the run scope, exactly
//! like the file broker. Two modes exist:
//!
//! * [`ExecMode::Sandboxed`] (default): the command runs inside OS isolation (Linux:
//!   bubblewrap + seccomp; Windows: AppContainer profile, PoC). If the isolation layer is not
//!   available, `attach` fails with a visible reason and every shell proposal for the run is
//!   denied (`no_enforcement`). There is no silent permissive fallback.
//! * [`ExecMode::Elevated`]: arbitrary unsandboxed exec. A separate, explicit mode that the
//!   user must have set up out of band ([`ElevatedSetup`]). Every proposal is always-ask with
//!   only Deny/AllowOnce offered; no autonomy level, skill or grant covers it. Never a default.
//!
//! macOS: no process execution. [`platform_support`] reports it as unavailable with a visible
//! reason; there is no fallback.
//!
//! Sandboxed processes get **no network**. Tool network is a separate capability enforced by
//! the broker-owned domain proxy ([`crate::net`]); provider/model transport stays on
//! [`crate::transport::ModelTransportPolicy`] and never crosses into the tool network.

use crate::action::*;
use crate::broker::{AgentHandle, EffectOutcome, ExecutionBinding, ProposeResult};
use crate::digest::ArgsDigest;
use crate::error::{ConsumeError, PolicyError};
use crate::token::ApprovalToken;
use std::fmt;
use std::time::Duration;

pub mod elevated;
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
pub mod seccomp;
#[cfg(windows)]
pub mod windows;

pub use elevated::ElevatedSetup;

/// How a process effect is isolated.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExecMode {
    /// OS-isolated worker. Fail-closed when isolation is unavailable.
    Sandboxed,
    /// Arbitrary unsandboxed exec. Requires [`ElevatedSetup`]; always-ask per command.
    Elevated,
}

/// Whether process execution is possible on this platform/build, and why not.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProcessSupport {
    /// Sandboxed execution available (still verified again at attach time).
    Sandboxed,
    /// Only elevated mode is possible (no verified sandbox on this platform).
    ElevatedOnly,
    /// Not available; the field is a short visible explanation for the UI.
    Unavailable {
        /// Why process execution is unavailable here.
        reason: &'static str,
    },
}

/// Platform support probe. Cheap; the authoritative check happens at attach time.
pub fn platform_support() -> ProcessSupport {
    #[cfg(target_os = "linux")]
    {
        ProcessSupport::Sandboxed
    }
    #[cfg(target_os = "windows")]
    {
        ProcessSupport::Sandboxed
    }
    #[cfg(target_os = "macos")]
    {
        ProcessSupport::Unavailable {
            reason: "process execution is not available on macOS in this alpha",
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        ProcessSupport::Unavailable {
            reason: "process execution is not supported on this platform",
        }
    }
}

/// One command to run. There is deliberately no shell: program and arguments are passed
/// directly to exec, so metacharacters in arguments are never interpreted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Command {
    /// Program: absolute path or bare name resolved via a fixed PATH inside the sandbox.
    pub program: String,
    /// Argument vector (no interpretation).
    pub args: Vec<String>,
    /// Working directory. Sandboxed mode: must be the isolated root or unset.
    pub cwd: Option<String>,
}

impl Command {
    /// Build and validate. Fails closed on empty program, control characters, or argument
    /// counts/sizes beyond the limits.
    pub fn new(
        program: impl Into<String>,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Result<Self, ProcessError> {
        let program = program.into();
        if program.is_empty()
            || program.len() > 1024
            || program.chars().any(|c| c.is_control() || c == '\0')
        {
            return Err(ProcessError::InvalidCommand("program"));
        }
        let args: Vec<String> = args.into_iter().map(Into::into).collect();
        if args.len() > 256 || args.iter().any(|a| a.len() > 8192 || a.contains('\0')) {
            return Err(ProcessError::InvalidCommand("args"));
        }
        Ok(Self {
            program,
            args,
            cwd: None,
        })
    }

    /// Set a working directory (validated again at execution against the mode).
    pub fn with_cwd(mut self, cwd: impl Into<String>) -> Result<Self, ProcessError> {
        let cwd = cwd.into();
        if cwd.len() > 4096 || cwd.chars().any(|c| c.is_control() || c == '\0') {
            return Err(ProcessError::InvalidCommand("cwd"));
        }
        self.cwd = Some(cwd);
        Ok(self)
    }

    /// Display/target string: the program only. Arguments are bound via the args digest and
    /// never land in the audit log or consent target (argv may carry sensitive values).
    pub fn target(&self) -> String {
        self.program.clone()
    }

    fn digest(&self, mode: ExecMode) -> ArgsDigest {
        let mut b = ArgsDigest::builder(ActionKind::Shell, &self.target()).part(
            "mode",
            match mode {
                ExecMode::Sandboxed => b"sandboxed",
                ExecMode::Elevated => b"elevated",
            },
        );
        for (i, a) in self.args.iter().enumerate() {
            b = b.part(&format!("arg{i}"), a.as_bytes());
        }
        if let Some(c) = &self.cwd {
            b = b.part("cwd", c.as_bytes());
        }
        b.finish()
    }
}

/// Process-runner failures. Never carry command output or argument bytes.
#[derive(Debug)]
pub enum ProcessError {
    /// The approval was not valid for this execution.
    Policy(ConsumeError),
    /// Broker bookkeeping failed while proposing.
    Broker(PolicyError),
    /// Command failed syntactic validation.
    InvalidCommand(&'static str),
    /// Isolation layer missing or broken. `reason` is the visible fail-closed cause.
    IsolationUnavailable(&'static str),
    /// This platform has no process execution.
    UnsupportedPlatform(&'static str),
    /// Elevated mode was requested without a valid elevated setup.
    ElevatedNotSetUp,
    /// The child could not be spawned (class only).
    SpawnFailed,
    /// The child exceeded its time limit and was killed.
    Timeout,
    /// Output exceeded the configured cap.
    OutputTooLarge,
    /// Other I/O failure (kind only).
    Io(std::io::ErrorKind),
}

impl ProcessError {
    /// Short fixed word for the audit log.
    pub fn class(&self) -> &'static str {
        match self {
            ProcessError::Policy(_) => "policy",
            ProcessError::Broker(_) => "broker",
            ProcessError::InvalidCommand(_) => "invalid_command",
            ProcessError::IsolationUnavailable(_) => "isolation_unavailable",
            ProcessError::UnsupportedPlatform(_) => "unsupported_platform",
            ProcessError::ElevatedNotSetUp => "elevated_not_set_up",
            ProcessError::SpawnFailed => "spawn_failed",
            ProcessError::Timeout => "timeout",
            ProcessError::OutputTooLarge => "output_too_large",
            ProcessError::Io(_) => "io",
        }
    }
}

impl fmt::Display for ProcessError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProcessError::Policy(e) => write!(f, "{e}"),
            ProcessError::Broker(e) => write!(f, "{e}"),
            ProcessError::IsolationUnavailable(r) => write!(f, "isolation_unavailable: {r}"),
            ProcessError::UnsupportedPlatform(r) => write!(f, "unsupported_platform: {r}"),
            ProcessError::InvalidCommand(w) => write!(f, "invalid command: {w}"),
            ProcessError::Io(k) => write!(f, "io: {k:?}"),
            e => f.write_str(e.class()),
        }
    }
}

impl std::error::Error for ProcessError {}
impl From<ConsumeError> for ProcessError {
    fn from(e: ConsumeError) -> Self {
        ProcessError::Policy(e)
    }
}
impl From<PolicyError> for ProcessError {
    fn from(e: PolicyError) -> Self {
        ProcessError::Broker(e)
    }
}

/// Behaviour limits of one executor.
#[derive(Clone, Debug)]
pub struct ProcessLimits {
    /// Wall-clock limit per execution.
    pub timeout: Duration,
    /// Max bytes captured from stdout and from stderr.
    pub max_output_bytes: usize,
}

impl Default for ProcessLimits {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(60),
            max_output_bytes: 1024 * 1024,
        }
    }
}

/// What the launcher needs to know. Derived by the executor from the approved command.
#[derive(Clone, Debug)]
pub struct ExecSpec {
    /// Program.
    pub program: String,
    /// Arguments.
    pub args: Vec<String>,
    /// Working directory.
    pub cwd: Option<String>,
}

/// Result of one execution.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecReceipt {
    /// Exit status when the child exited normally.
    pub exit_code: Option<i32>,
    /// Captured stdout (capped, replacement-char decoded).
    pub stdout: String,
    /// Captured stderr (capped, replacement-char decoded).
    pub stderr: String,
    /// True when output was cut at the cap.
    pub truncated: bool,
}

/// The platform launcher seam. Implemented by `linux` (bubblewrap+seccomp), `windows`
/// (AppContainer PoC) and the elevated direct runner. Public so platform ports and test
/// fixtures can provide one; executors re-check the approval token before every launch.
pub trait ProcessLauncher: Send + Sync {
    /// Fail-closed availability check with a visible reason.
    fn check(&self) -> Result<(), ProcessError>;
    /// Launch `spec` with captured, capped output and a timeout.
    fn run(&self, spec: &ExecSpec, limits: &ProcessLimits) -> Result<ExecReceipt, ProcessError>;
}

/// Executor bound to one run, one scope and one mode.
pub struct ProcessExecutor {
    agent: AgentHandle,
    run_id: RunId,
    scope_id: ScopeId,
    mode: ExecMode,
    launcher: Box<dyn ProcessLauncher>,
    limits: ProcessLimits,
}

impl ProcessExecutor {
    /// Attach the platform-default sandboxed runner. Fails closed (with a visible reason)
    /// when the OS isolation layer is unavailable; macOS is always unavailable here.
    pub fn attach(
        agent: &AgentHandle,
        run_id: RunId,
        scope_id: ScopeId,
        limits: ProcessLimits,
    ) -> Result<Self, ProcessError> {
        let launcher = default_sandbox_launcher()?;
        Self::attach_with_launcher(agent, run_id, scope_id, ExecMode::Sandboxed, launcher, limits)
    }

    /// Attach the elevated (arbitrary, unsandboxed) runner. Requires a valid [`ElevatedSetup`]
    /// created by the explicit user setup flow. Every proposal stays always-ask.
    pub fn attach_elevated(
        agent: &AgentHandle,
        run_id: RunId,
        scope_id: ScopeId,
        setup: &ElevatedSetup,
        limits: ProcessLimits,
    ) -> Result<Self, ProcessError> {
        if !setup.is_valid() {
            return Err(ProcessError::ElevatedNotSetUp);
        }
        Self::attach_with_launcher(
            agent,
            run_id,
            scope_id,
            ExecMode::Elevated,
            Box::new(elevated::DirectLauncher),
            limits,
        )
    }

    /// Attach with an explicit launcher (platform ports, fixtures). Registers the enforcement
    /// with the broker; shell proposals for the run stay denied until this succeeds.
    pub fn attach_with_launcher(
        agent: &AgentHandle,
        run_id: RunId,
        scope_id: ScopeId,
        mode: ExecMode,
        launcher: Box<dyn ProcessLauncher>,
        limits: ProcessLimits,
    ) -> Result<Self, ProcessError> {
        // Fail closed BEFORE telling the broker anything: no launcher, no enforcement.
        launcher.check()?;
        agent.attach_process_enforcement(&run_id, &scope_id, mode == ExecMode::Elevated)?;
        Ok(Self {
            agent: agent.clone(),
            run_id,
            scope_id,
            mode,
            launcher,
            limits,
        })
    }

    /// Mode of this executor.
    pub fn mode(&self) -> ExecMode {
        self.mode
    }

    fn binding(&self, cmd: &Command) -> ExecutionBinding {
        ExecutionBinding {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind: ActionKind::Shell,
            target: cmd.target(),
            args_digest: cmd.digest(self.mode),
        }
    }

    /// Propose running `cmd`. Sandboxed proposals follow the normal policy (ask, grants per
    /// program); elevated proposals are always-ask. Never runs anything.
    pub fn propose_exec(&self, cmd: &Command, reason: &str, origin: Origin) -> Result<ProposeResult, ProcessError> {
        Ok(self.agent.propose(Proposal {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind: ActionKind::Shell,
            target: cmd.target(),
            reason: reason.to_string(),
            args_digest: cmd.digest(self.mode),
            origin,
            declared_impact: Vec::new(),
        })?)
    }

    /// Run `cmd` under an approval. The binding is re-derived from the actual command, so a
    /// substituted program, argument, cwd or mode burns the token.
    pub fn exec(&self, token: ApprovalToken, cmd: &Command) -> Result<ExecReceipt, ProcessError> {
        let guard = self.agent.consume(token, &self.binding(cmd))?;
        // Commit point: right before spawn, re-check the run is still active.
        guard.checkpoint()?;
        let spec = ExecSpec {
            program: cmd.program.clone(),
            args: cmd.args.clone(),
            cwd: cmd.cwd.clone(),
        };
        match self.launcher.run(&spec, &self.limits) {
            Ok(r) => {
                guard.complete(EffectOutcome::Ok {
                    bytes: (r.stdout.len() + r.stderr.len()) as u64,
                });
                Ok(r)
            }
            Err(e) => {
                guard.complete(EffectOutcome::Failed { class: e.class() });
                Err(e)
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn default_sandbox_launcher() -> Result<Box<dyn ProcessLauncher>, ProcessError> {
    Ok(Box::new(linux::BwrapLauncher::detect()?))
}

#[cfg(windows)]
fn default_sandbox_launcher() -> Result<Box<dyn ProcessLauncher>, ProcessError> {
    Ok(Box::new(windows::AppContainerLauncher::detect()?))
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn default_sandbox_launcher() -> Result<Box<dyn ProcessLauncher>, ProcessError> {
    Err(ProcessError::UnsupportedPlatform(
        "process execution is not available on this platform (macOS: not in this alpha)",
    ))
}
