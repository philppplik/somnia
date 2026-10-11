//! Bounded audit log. Records ids, action kinds, sanitised targets, digest prefixes and outcome
//! words. It never stores arguments, file content, reasons or token secrets.

use crate::action::{ActionKind, ProposalId, RunId, ScopeId};
use serde::Serialize;
use std::collections::VecDeque;

/// Kind of audit event.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditKind {
    /// Run registered.
    RunRegistered,
    /// Run cancelled.
    RunCancelled,
    /// Run finished.
    RunFinished,
    /// File enforcement attached to a run scope.
    EnforcementAttached,
    /// Proposal received.
    Proposed,
    /// Denied before any effect.
    Denied,
    /// Queued for the user.
    Queued,
    /// Allowed by scope/grant/autonomy.
    AutoAllowed,
    /// User answered.
    UserDecided,
    /// Pending request expired.
    PendingExpired,
    /// Run grant created.
    GrantCreated,
    /// Run grant revoked.
    GrantRevoked,
    /// Token minted.
    TokenIssued,
    /// Token consumed at execution.
    TokenConsumed,
    /// Token refused at execution.
    TokenRejected,
    /// Effect finished OK.
    EffectOk,
    /// Effect failed.
    EffectFailed,
    /// Guard dropped without completing.
    EffectAbandoned,
}

/// One audit line.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    /// Monotonic sequence number.
    pub seq: u64,
    /// UTC milliseconds.
    pub at_ms: u64,
    /// Event kind.
    pub event: AuditKind,
    /// Run, if any.
    pub run_id: Option<RunId>,
    /// Scope, if any.
    pub scope_id: Option<ScopeId>,
    /// Proposal, if any.
    pub proposal_id: Option<ProposalId>,
    /// Action kind, if any.
    pub action: Option<ActionKind>,
    /// Sanitised, truncated target.
    pub target: String,
    /// First 8 hex chars of the args digest.
    pub digest: String,
    /// Short fixed-vocabulary detail (deny reason, error class, byte count).
    pub detail: String,
}

/// Ring buffer with a dropped counter.
#[derive(Debug)]
pub struct AuditLog {
    cap: usize,
    next_seq: u64,
    dropped: u64,
    events: VecDeque<AuditEvent>,
}

impl AuditLog {
    pub(crate) fn new(cap: usize) -> Self {
        let cap = cap.max(1);
        Self {
            cap,
            next_seq: 1,
            dropped: 0,
            events: VecDeque::with_capacity(cap.min(4096)),
        }
    }

    pub(crate) fn push(&mut self, mut e: AuditEvent) {
        e.seq = self.next_seq;
        self.next_seq += 1;
        if self.events.len() >= self.cap {
            self.events.pop_front();
            self.dropped += 1;
        }
        self.events.push_back(e);
    }

    pub(crate) fn snapshot(&self, last: usize) -> AuditSnapshot {
        let skip = self.events.len().saturating_sub(last);
        AuditSnapshot {
            events: self.events.iter().skip(skip).cloned().collect(),
            dropped: self.dropped,
            capacity: self.cap,
        }
    }
}

/// Copy of the log tail.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditSnapshot {
    /// Newest events, oldest first.
    pub events: Vec<AuditEvent>,
    /// Number of events evicted because the ring was full.
    pub dropped: u64,
    /// Ring capacity.
    pub capacity: usize,
}
