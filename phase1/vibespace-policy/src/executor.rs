//! Scoped file executor for an isolated copy.
//!
//! The only way to touch files in this crate. Every method takes an [`ApprovalToken`] and
//! re-derives the binding from its own arguments, so the check happens at execution time, not
//! only at proposal time. There is no method that performs an effect without a token.

use crate::action::*;
use crate::broker::{AgentHandle, EffectOutcome, ExecutionBinding, ProposeResult};
use crate::digest::{sha256, ArgsDigest};
use crate::error::{ConsumeError, PolicyError};
use crate::fs::path::RelPath;
use crate::fs::{FsError, IsolationLevel, Root, ISOLATED_MARKER};
use crate::token::ApprovalToken;
use std::fmt;
use std::path::Path;

/// Size and behaviour limits.
#[derive(Clone, Debug)]
pub struct FileLimits {
    /// Max bytes returned by a read.
    pub max_read_bytes: u64,
    /// Max bytes accepted by a write.
    pub max_write_bytes: u64,
    /// Create missing parent directories on write.
    pub create_parents: bool,
    /// Allow the weaker path-validated layer on platforms without handle-relative access.
    pub allow_path_validated_fallback: bool,
    /// Path components that are never readable or writable (ASCII case-insensitive).
    pub protected_components: Vec<String>,
}

impl Default for FileLimits {
    fn default() -> Self {
        Self {
            max_read_bytes: 8 * 1024 * 1024,
            max_write_bytes: 8 * 1024 * 1024,
            create_parents: true,
            allow_path_validated_fallback: false,
            protected_components: vec![".git".into(), ISOLATED_MARKER.into()],
        }
    }
}

/// Executor failure.
#[derive(Debug)]
pub enum ExecError {
    /// The approval was not valid for this action.
    Policy(ConsumeError),
    /// The file layer refused or failed.
    Fs(FsError),
    /// Broker bookkeeping failed while proposing.
    Broker(PolicyError),
}

impl fmt::Display for ExecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExecError::Policy(e) => write!(f, "{e}"),
            ExecError::Fs(e) => write!(f, "{e}"),
            ExecError::Broker(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ExecError {}

impl From<FsError> for ExecError {
    fn from(e: FsError) -> Self {
        ExecError::Fs(e)
    }
}
impl From<ConsumeError> for ExecError {
    fn from(e: ConsumeError) -> Self {
        ExecError::Policy(e)
    }
}
impl From<PolicyError> for ExecError {
    fn from(e: PolicyError) -> Self {
        ExecError::Broker(e)
    }
}

/// A verified isolated-copy root (absolute, real directory, carries the marker file).
pub struct IsolatedRoot(Root);

impl IsolatedRoot {
    /// Create the directory and marker for a new isolated copy. Called by whoever builds the copy.
    pub fn initialize(path: &Path) -> Result<(), FsError> {
        Root::initialize(path)
    }

    /// Open an existing isolated copy.
    pub fn open(path: &Path) -> Result<Self, FsError> {
        Root::open(path).map(IsolatedRoot)
    }
}

/// Receipt of a write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteReceipt {
    /// Bytes written.
    pub bytes: u64,
}

/// Executor bound to one run, one scope and one isolated root.
pub struct FileExecutor {
    agent: AgentHandle,
    run_id: RunId,
    scope_id: ScopeId,
    root: Root,
    limits: FileLimits,
}

impl FileExecutor {
    /// Attach to a registered run scope. This is what turns on file capabilities for that
    /// scope: without an attached executor the broker denies Read/Write/Delete as unenforced.
    pub fn attach(
        agent: &AgentHandle,
        run_id: RunId,
        scope_id: ScopeId,
        root: IsolatedRoot,
        limits: FileLimits,
    ) -> Result<Self, ExecError> {
        if Root::level() == IsolationLevel::PathValidatedBestEffort
            && !limits.allow_path_validated_fallback
        {
            return Err(ExecError::Fs(FsError::Unsupported(
                "handle-relative access unavailable on this platform",
            )));
        }
        agent.attach_file_enforcement(&run_id, &scope_id)?;
        Ok(Self {
            agent: agent.clone(),
            run_id,
            scope_id,
            root: root.0,
            limits,
        })
    }

    /// Isolation strength of this platform layer.
    pub fn isolation_level(&self) -> IsolationLevel {
        Root::level()
    }

    fn path(&self, rel: &str) -> Result<RelPath, FsError> {
        let p = RelPath::parse(rel)?;
        for c in p.components() {
            if c.starts_with(".vs-tmp-")
                || self
                    .limits
                    .protected_components
                    .iter()
                    .any(|x| c.eq_ignore_ascii_case(x))
            {
                return Err(FsError::Protected);
            }
        }
        Ok(p)
    }

    fn read_digest(&self, p: &RelPath) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Read, &p.canonical())
            .part("max", &self.limits.max_read_bytes.to_be_bytes())
            .finish()
    }

    fn write_digest(p: &RelPath, bytes: &[u8]) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Write, &p.canonical())
            .part("sha256", &sha256(bytes))
            .part("len", &(bytes.len() as u64).to_be_bytes())
            .finish()
    }

    fn delete_digest(p: &RelPath) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Delete, &p.canonical()).finish()
    }

    fn binding(&self, kind: ActionKind, p: &RelPath, d: ArgsDigest) -> ExecutionBinding {
        ExecutionBinding {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind,
            target: p.canonical(),
            args_digest: d,
        }
    }

    fn proposal(
        &self,
        kind: ActionKind,
        p: &RelPath,
        d: ArgsDigest,
        reason: &str,
        origin: Origin,
    ) -> Proposal {
        Proposal {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind,
            target: p.canonical(),
            reason: reason.to_string(),
            args_digest: d,
            origin,
            declared_impact: Vec::new(),
        }
    }

    /// Propose reading `rel`. Validates the path first; nothing is read.
    pub fn propose_read(
        &self,
        rel: &str,
        reason: &str,
        origin: Origin,
    ) -> Result<ProposeResult, ExecError> {
        let p = self.path(rel)?;
        let d = self.read_digest(&p);
        Ok(self
            .agent
            .propose(self.proposal(ActionKind::Read, &p, d, reason, origin))?)
    }

    /// Propose writing `bytes` to `rel`. The approval is bound to the SHA-256 of `bytes`.
    pub fn propose_write(
        &self,
        rel: &str,
        bytes: &[u8],
        reason: &str,
        origin: Origin,
    ) -> Result<ProposeResult, ExecError> {
        let p = self.path(rel)?;
        if bytes.len() as u64 > self.limits.max_write_bytes {
            return Err(ExecError::Fs(FsError::TooLarge));
        }
        let d = Self::write_digest(&p, bytes);
        Ok(self
            .agent
            .propose(self.proposal(ActionKind::Write, &p, d, reason, origin))?)
    }

    /// Propose deleting `rel`. Always ask.
    pub fn propose_delete(
        &self,
        rel: &str,
        reason: &str,
        origin: Origin,
    ) -> Result<ProposeResult, ExecError> {
        let p = self.path(rel)?;
        let d = Self::delete_digest(&p);
        Ok(self
            .agent
            .propose(self.proposal(ActionKind::Delete, &p, d, reason, origin))?)
    }

    /// Read `rel` under an approval.
    pub fn read(&self, token: ApprovalToken, rel: &str) -> Result<Vec<u8>, ExecError> {
        let p = self.path(rel)?;
        let guard = self.agent.consume(
            token,
            &self.binding(ActionKind::Read, &p, self.read_digest(&p)),
        )?;
        match self.root.read(&p, self.limits.max_read_bytes) {
            Ok(v) => {
                guard.complete(EffectOutcome::Ok {
                    bytes: v.len() as u64,
                });
                Ok(v)
            }
            Err(e) => {
                guard.complete(EffectOutcome::Failed { class: e.class() });
                Err(e.into())
            }
        }
    }

    /// Write `bytes` to `rel` under an approval. Atomic replace via a temp file in the same
    /// directory. The commit point re-checks that the run is still active.
    pub fn write(
        &self,
        token: ApprovalToken,
        rel: &str,
        bytes: &[u8],
    ) -> Result<WriteReceipt, ExecError> {
        let p = self.path(rel)?;
        if bytes.len() as u64 > self.limits.max_write_bytes {
            return Err(ExecError::Fs(FsError::TooLarge));
        }
        let guard = self.agent.consume(
            token,
            &self.binding(ActionKind::Write, &p, Self::write_digest(&p, bytes)),
        )?;
        let cp = || guard.checkpoint().map_err(|_| FsError::Cancelled);
        let res = self.root.write(
            &p,
            bytes,
            self.limits.max_write_bytes,
            self.limits.create_parents,
            &cp,
        );
        match res {
            Ok(()) => {
                guard.complete(EffectOutcome::Ok {
                    bytes: bytes.len() as u64,
                });
                Ok(WriteReceipt {
                    bytes: bytes.len() as u64,
                })
            }
            Err(e) => {
                guard.complete(EffectOutcome::Failed { class: e.class() });
                Err(e.into())
            }
        }
    }

    /// Delete the file `rel` under an approval.
    pub fn delete(&self, token: ApprovalToken, rel: &str) -> Result<(), ExecError> {
        let p = self.path(rel)?;
        let guard = self.agent.consume(
            token,
            &self.binding(ActionKind::Delete, &p, Self::delete_digest(&p)),
        )?;
        let cp = || guard.checkpoint().map_err(|_| FsError::Cancelled);
        match self.root.delete(&p, &cp) {
            Ok(()) => {
                guard.complete(EffectOutcome::Ok { bytes: 0 });
                Ok(())
            }
            Err(e) => {
                guard.complete(EffectOutcome::Failed { class: e.class() });
                Err(e.into())
            }
        }
    }
}
