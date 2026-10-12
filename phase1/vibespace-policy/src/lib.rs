//! Vibe Space consent broker, request-bound approval tokens and a scoped file executor.
//!
//! See `docs/vibespace/policy.md` for the model, guarantees and limits. Short version:
//!
//! * Tool code builds a [`Proposal`] (kind, explicit run scope, reason, args digest) and gets
//!   back Ask, Deny, or an [`ApprovalToken`] bound to exactly that proposal.
//! * Only the [`UiHandle`] can answer a pending request. Model output has no path to it.
//! * [`FileExecutor`] re-checks the token against its own arguments at execution time.
//! * Policy v2: shell runs only through a [`proc::ProcessExecutor`] (OS-isolated, fail-closed;
//!   elevated arbitrary exec is a separate explicit mode), tool network only through the
//!   broker-owned [`net::DomainProxy`]. MCP and desktop still have no enforcement and are
//!   always denied. macOS has no process execution ("not available", no fallback).
//!
//! ```
//! use vibespace_policy::*;
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = std::env::temp_dir().join(format!("vsp-doc-{}", std::process::id()));
//! IsolatedRoot::initialize(&dir)?;
//! let b = ConsentBroker::new()?;
//! let (run, scope) = (RunId::new("run-1")?, ScopeId::new("copy-1")?);
//! b.runs.register_run(RunScope::new(run.clone(), scope.clone()))?;
//! let fx = FileExecutor::attach(&b.agent, run, scope, IsolatedRoot::open(&dir)?, FileLimits::default())?;
//! let ProposeResult::Pending(id) = fx.propose_write("a.txt", b"hi", "create file", Origin::Model)? else { panic!() };
//! b.ui.decide(&id, UserDecision::AllowOnce)?;
//! let PollResult::Approved { token, .. } = b.agent.poll(&id)? else { panic!() };
//! fx.write(token, "a.txt", b"hi")?;
//! # std::fs::remove_dir_all(&dir).ok();
//! # Ok(()) }
//! ```

#![deny(unsafe_code)]
#![warn(missing_docs)]

pub mod action;
pub mod audit;
pub mod broker;
pub mod clock;
pub mod digest;
pub mod error;
pub mod executor;
pub mod fs;
pub mod impact;
pub mod net;
pub mod proc;
pub mod sanitize;
pub mod token;
pub mod transport;
pub mod ui;

#[cfg(test)]
mod tests;

pub use action::*;
pub use audit::{AuditEvent, AuditKind, AuditSnapshot};
pub use broker::*;
pub use clock::{Clock, ManualClock, SystemClock};
pub use digest::ArgsDigest;
pub use error::{ConsumeError, PolicyError};
pub use executor::{ExecError, FileExecutor, FileLimits, IsolatedRoot, WriteReceipt};
pub use fs::{FsError, IsolationLevel, ISOLATED_MARKER};
pub use net::{
    is_public_ip, Domain, DomainProxy, FetchRequest, NetError, NetworkExecutor, ProxyConfig,
};
pub use proc::{
    platform_support, Command, ElevatedSetup, ExecMode, ExecReceipt, ExecSpec, ProcessError,
    ProcessExecutor, ProcessLauncher, ProcessLimits, ProcessSession, ProcessSupport, SessionIo,
    SessionProcess,
};
pub use token::ApprovalToken;
pub use transport::{ModelTransportPermit, ModelTransportPolicy};
pub use ui::{ConsentDecisionWire, PendingView};
