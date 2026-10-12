//! The consent broker: proposals in, decisions and request-bound tokens out.
//!
//! Three handles share one state:
//! * [`AgentHandle`] - for tool code. Can propose, poll and consume tokens. Cannot approve.
//! * [`UiHandle`] - for the host's consent UI commands. Can list and decide pending requests.
//!   It must only be reachable from the trusted frontend bridge, never from agent code paths.
//! * [`RunControl`] - for the Run-Manager: register, cancel, finish, revoke.

use crate::action::*;
use crate::audit::{AuditEvent, AuditKind, AuditLog, AuditSnapshot};
use crate::clock::{Clock, SystemClock};
use crate::digest::{ct_eq, hex, random, sha256, ArgsDigest};
use crate::mcp::{McpGrantRec, McpGrantView, McpPending};
use crate::error::{ConsumeError, PolicyError};
use crate::impact::classify;
use crate::sanitize::{sanitize_target, sanitize_text};
use crate::token::ApprovalToken;
use crate::ui::PendingView;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Tunables. Every collection in the broker is bounded by one of these.
#[derive(Clone, Debug)]
pub struct PolicyConfig {
    /// Lifetime of an issued token.
    pub token_ttl: Duration,
    /// How long a request waits for the user before it is denied as expired.
    pub pending_ttl: Duration,
    /// Max pending requests across all runs.
    pub max_pending_total: usize,
    /// Max pending requests per run.
    pub max_pending_per_run: usize,
    /// Max unconsumed tokens per run.
    pub max_tokens_per_run: usize,
    /// Max run grants per run.
    pub max_grants_per_run: usize,
    /// Max stored, not yet collected outcomes.
    pub max_outcomes: usize,
    /// Max ended runs remembered (to deny late proposals).
    pub max_ended_runs: usize,
    /// Audit ring capacity.
    pub audit_capacity: usize,
    /// Max characters of target kept for display.
    pub max_target_chars: usize,
    /// Max characters of reason kept for display.
    pub max_reason_chars: usize,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            token_ttl: Duration::from_secs(300),
            pending_ttl: Duration::from_secs(24 * 3600),
            max_pending_total: 1024,
            max_pending_per_run: 64,
            max_tokens_per_run: 256,
            max_grants_per_run: 256,
            max_outcomes: 1024,
            max_ended_runs: 1024,
            audit_capacity: 4096,
            max_target_chars: 1024,
            max_reason_chars: 500,
        }
    }
}

/// Why a proposal was refused without any effect.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DenyReason {
    /// Run not registered.
    UnknownRun,
    /// Run was cancelled or finished.
    RunNotActive,
    /// Proposal scope differs from the run's registered scope.
    ScopeMismatch,
    /// Scope does not permit this action kind.
    KindNotInScope,
    /// No verified enforcement exists for this capability, so it is off.
    NoEnforcement,
    /// Autonomy level is read-only.
    ReadOnly,
    /// A bounded queue is full.
    QueueFull,
    /// The user did not answer in time.
    Expired,
    /// The user said no.
    UserDenied,
    /// The run ended while the request was pending.
    RunEnded,
}

impl DenyReason {
    /// Stable short name for logs.
    pub fn as_str(self) -> &'static str {
        match self {
            DenyReason::UnknownRun => "unknown_run",
            DenyReason::RunNotActive => "run_not_active",
            DenyReason::ScopeMismatch => "scope_mismatch",
            DenyReason::KindNotInScope => "kind_not_in_scope",
            DenyReason::NoEnforcement => "no_enforcement",
            DenyReason::ReadOnly => "read_only",
            DenyReason::QueueFull => "queue_full",
            DenyReason::Expired => "expired",
            DenyReason::UserDenied => "user_denied",
            DenyReason::RunEnded => "run_ended",
        }
    }
}

/// Result of [`AgentHandle::propose`].
#[derive(Debug)]
pub enum ProposeResult {
    /// Refused. No effect may happen.
    Denied(DenyReason),
    /// Queued for the user. Poll with the id.
    Pending(ProposalId),
    /// Allowed now. `basis` is `AllowForRun` (scope, grant or autonomy).
    Approved {
        /// Proposal id.
        id: ProposalId,
        /// Request-bound token for exactly this proposal.
        token: ApprovalToken,
        /// Why it was allowed.
        basis: Decision,
    },
}

/// Result of [`AgentHandle::poll`].
#[derive(Debug)]
pub enum PollResult {
    /// Still waiting for the user.
    Pending,
    /// Approved. Returned once.
    Approved {
        /// Token.
        token: ApprovalToken,
        /// `AllowOnce` or `AllowForRun`.
        basis: Decision,
    },
    /// Refused.
    Denied(DenyReason),
    /// Already collected, unknown, or evicted.
    Gone,
}

/// What an executor is about to do, derived by the executor from its actual arguments.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionBinding {
    /// Run.
    pub run_id: RunId,
    /// Scope.
    pub scope_id: ScopeId,
    /// Action.
    pub kind: ActionKind,
    /// Canonical target.
    pub target: String,
    /// Digest of the arguments.
    pub args_digest: ArgsDigest,
}

/// Lifecycle of a run.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    /// Accepting proposals.
    Active,
    /// Cancelled: tokens revoked, effects drained.
    Cancelled,
    /// Finished normally.
    Finished,
}

/// Result of ending a run.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndReport {
    /// Tokens revoked.
    pub revoked_tokens: usize,
    /// Pending requests denied.
    pub denied_pending: usize,
    /// Grants dropped.
    pub dropped_grants: usize,
    /// True when no effect was still in flight at return. After `true`, no effect of this run
    /// can start or continue past its checkpoint.
    pub drained: bool,
}

/// A run-level grant (AllowForRun).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantView {
    /// Grant id.
    pub grant_id: GrantId,
    /// Action.
    pub kind: ActionKind,
    /// Exact target the grant covers.
    pub target: String,
}

/// Receipt of a user decision.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionReceipt {
    /// Request id.
    pub request_id: ProposalId,
    /// Applied decision.
    pub decision: Decision,
}

#[derive(Clone)]
enum Via {
    Once,
    Policy,
    Grant(GrantId),
}

#[derive(PartialEq, Eq, Clone, Copy, Debug)]
enum TokState {
    Issued,
    Consumed,
    Revoked,
}

struct TokenRec {
    secret_hash: [u8; 32],
    binding: ExecutionBinding,
    state: TokState,
    expires_at: u64,
    via: Via,
}

struct PendingRec {
    id: ProposalId,
    binding: ExecutionBinding,
    shown_target: String,
    reason: String,
    origin: Origin,
    impact: BTreeSet<HighImpact>,
    offered: Vec<UserDecision>,
    created_at: u64,
    expires_at: u64,
    /// Set only for MCP requests: the digest-bound data an MCP grant is created from.
    mcp: Option<McpPending>,
}

enum Outcome {
    Approved(Option<(ApprovalToken, Decision)>),
    Denied(DenyReason),
}

struct RunRec {
    scope: RunScope,
    state: RunState,
    grants: Vec<(GrantId, ActionKind, String)>,
    in_flight: usize,
    file_enforced: bool,
    process_enforced: bool,
    /// True when process enforcement was attached in elevated mode: every shell proposal is
    /// always-ask and no run grant can be created for it.
    elevated_exec: bool,
    network_enforced: bool,
    /// MCP grants: a separate, stronger store (digest-bound), never mixed with folder grants.
    mcp_grants: Vec<McpGrantRec>,
}

struct Inner {
    cfg: PolicyConfig,
    clock: Arc<dyn Clock>,
    runs: HashMap<RunId, RunRec>,
    ended: VecDeque<RunId>,
    pending: BTreeMap<ProposalId, PendingRec>,
    outcomes: HashMap<ProposalId, Outcome>,
    outcome_order: VecDeque<ProposalId>,
    tokens: HashMap<ProposalId, TokenRec>,
    audit: AuditLog,
}

struct Shared {
    inner: Mutex<Inner>,
    drained: Condvar,
    broker_id: [u8; 16],
}

/// The three handles of one broker.
#[derive(Clone)]
pub struct BrokerHandles {
    /// For tool code.
    pub agent: AgentHandle,
    /// For the consent UI bridge.
    pub ui: UiHandle,
    /// For the Run-Manager.
    pub runs: RunControl,
}

/// Entry point.
pub struct ConsentBroker;

#[allow(clippy::new_ret_no_self)]
impl ConsentBroker {
    /// New broker with default config and the system clock.
    pub fn new() -> Result<BrokerHandles, PolicyError> {
        Self::with(PolicyConfig::default(), Arc::new(SystemClock))
    }

    /// New broker with explicit config and clock.
    pub fn with(cfg: PolicyConfig, clock: Arc<dyn Clock>) -> Result<BrokerHandles, PolicyError> {
        let shared = Arc::new(Shared {
            inner: Mutex::new(Inner {
                audit: AuditLog::new(cfg.audit_capacity),
                cfg,
                clock,
                runs: HashMap::new(),
                ended: VecDeque::new(),
                pending: BTreeMap::new(),
                outcomes: HashMap::new(),
                outcome_order: VecDeque::new(),
                tokens: HashMap::new(),
            }),
            drained: Condvar::new(),
            broker_id: random::<16>()?,
        });
        Ok(BrokerHandles {
            agent: AgentHandle {
                shared: shared.clone(),
            },
            ui: UiHandle {
                shared: shared.clone(),
            },
            runs: RunControl { shared },
        })
    }
}

impl Shared {
    fn lock(&self) -> Result<MutexGuard<'_, Inner>, PolicyError> {
        self.inner.lock().map_err(|_| PolicyError::Poisoned)
    }
}

impl Inner {
    #[allow(clippy::too_many_arguments)]
    fn log(
        &mut self,
        event: AuditKind,
        run: Option<&RunId>,
        scope: Option<&ScopeId>,
        pid: Option<&ProposalId>,
        action: Option<ActionKind>,
        target: &str,
        digest: Option<&ArgsDigest>,
        detail: &str,
    ) {
        let at_ms = self.clock.now_ms();
        let ev = AuditEvent {
            seq: 0,
            at_ms,
            event,
            run_id: run.cloned(),
            scope_id: scope.cloned(),
            proposal_id: pid.cloned(),
            action,
            target: sanitize_target(target, 200),
            digest: digest.map(|d| d.short()).unwrap_or_default(),
            detail: sanitize_text(detail, 80),
        };
        self.audit.push(ev);
    }

    fn log_b(
        &mut self,
        event: AuditKind,
        pid: Option<&ProposalId>,
        b: &ExecutionBinding,
        detail: &str,
    ) {
        let (r, s, k, t, d) = (
            b.run_id.clone(),
            b.scope_id.clone(),
            b.kind,
            b.target.clone(),
            b.args_digest,
        );
        self.log(
            event,
            Some(&r),
            Some(&s),
            pid,
            Some(k),
            &t,
            Some(&d),
            detail,
        );
    }

    fn now(&self) -> u64 {
        self.clock.now_ms()
    }

    fn store_outcome(&mut self, id: ProposalId, o: Outcome) {
        while self.outcomes.len() >= self.cfg.max_outcomes {
            match self.outcome_order.pop_front() {
                Some(old) => {
                    self.outcomes.remove(&old);
                }
                None => break,
            }
        }
        self.outcome_order.push_back(id.clone());
        self.outcomes.insert(id, o);
    }

    fn mint(
        &mut self,
        id: &ProposalId,
        binding: &ExecutionBinding,
        via: Via,
        broker_id: [u8; 16],
    ) -> Result<ApprovalToken, PolicyError> {
        let secret = random::<32>()?;
        let expires_at = self
            .now()
            .saturating_add(self.cfg.token_ttl.as_millis() as u64);
        self.tokens.insert(
            id.clone(),
            TokenRec {
                secret_hash: sha256(&secret),
                binding: binding.clone(),
                state: TokState::Issued,
                expires_at,
                via,
            },
        );
        self.log_b(AuditKind::TokenIssued, Some(id), binding, "");
        Ok(ApprovalToken {
            proposal_id: id.clone(),
            secret,
            broker_id,
        })
    }

    fn sweep(&mut self) {
        let now = self.now();
        let expired: Vec<ProposalId> = self
            .pending
            .iter()
            .filter(|(_, p)| p.expires_at <= now)
            .map(|(k, _)| k.clone())
            .collect();
        for id in expired {
            if let Some(p) = self.pending.remove(&id) {
                self.log_b(AuditKind::PendingExpired, Some(&id), &p.binding, "");
                self.store_outcome(id, Outcome::Denied(DenyReason::Expired));
            }
        }
        // Drop dead token records so the map stays bounded.
        if self.tokens.len() > 8192 {
            self.tokens
                .retain(|_, t| t.state == TokState::Issued && t.expires_at > now);
        }
    }

    fn pending_for_run(&self, run: &RunId) -> usize {
        self.pending
            .values()
            .filter(|p| &p.binding.run_id == run)
            .count()
    }

    fn issued_for_run(&self, run: &RunId) -> usize {
        let now = self.now();
        self.tokens
            .values()
            .filter(|t| {
                t.state == TokState::Issued && t.expires_at > now && &t.binding.run_id == run
            })
            .count()
    }

    fn end_run(&mut self, run_id: &RunId, to: RunState) -> Result<EndReport, PolicyError> {
        let rec = self.runs.get_mut(run_id).ok_or(PolicyError::UnknownRun)?;
        if rec.state != RunState::Active {
            return Err(PolicyError::RunNotActive);
        }
        rec.state = to;
        let dropped_grants = rec.grants.len() + rec.mcp_grants.len();
        rec.grants.clear();
        rec.mcp_grants.clear();
        let scope_id = rec.scope.scope_id.clone();
        let mut revoked = 0;
        let ids: Vec<ProposalId> = self
            .tokens
            .iter()
            .filter(|(_, t)| &t.binding.run_id == run_id)
            .map(|(k, _)| k.clone())
            .collect();
        for id in ids {
            if let Some(t) = self.tokens.get_mut(&id) {
                if t.state == TokState::Issued {
                    revoked += 1;
                }
                t.state = TokState::Revoked;
            }
        }
        let pend: Vec<ProposalId> = self
            .pending
            .iter()
            .filter(|(_, p)| &p.binding.run_id == run_id)
            .map(|(k, _)| k.clone())
            .collect();
        let denied = pend.len();
        for id in pend {
            if let Some(p) = self.pending.remove(&id) {
                self.log_b(AuditKind::Denied, Some(&id), &p.binding, "run_ended");
                self.store_outcome(id, Outcome::Denied(DenyReason::RunEnded));
            }
        }
        // Unclaimed approved outcomes hold tokens: drop them for this run.
        let own: Vec<ProposalId> = self
            .outcomes
            .iter()
            .filter(|(k, o)| {
                matches!(o, Outcome::Approved(Some(_)))
                    && self
                        .tokens
                        .get(*k)
                        .map(|t| &t.binding.run_id == run_id)
                        .unwrap_or(false)
            })
            .map(|(k, _)| k.clone())
            .collect();
        for id in own {
            self.outcomes.remove(&id);
        }
        self.tokens.retain(|_, t| &t.binding.run_id != run_id);
        let ev = if to == RunState::Cancelled {
            AuditKind::RunCancelled
        } else {
            AuditKind::RunFinished
        };
        self.log(ev, Some(run_id), Some(&scope_id), None, None, "", None, "");
        self.ended.push_back(run_id.clone());
        while self.ended.len() > self.cfg.max_ended_runs {
            if let Some(old) = self.ended.pop_front() {
                if self
                    .runs
                    .get(&old)
                    .map(|r| r.state != RunState::Active && r.in_flight == 0)
                    .unwrap_or(false)
                {
                    self.runs.remove(&old);
                }
            }
        }
        Ok(EndReport {
            revoked_tokens: revoked,
            denied_pending: denied,
            dropped_grants,
            drained: false,
        })
    }

    fn revoke_grant_inner(
        &mut self,
        run_id: &RunId,
        grant: Option<&GrantId>,
    ) -> Result<usize, PolicyError> {
        let rec = self.runs.get_mut(run_id).ok_or(PolicyError::UnknownRun)?;
        let before = rec.grants.len();
        let removed: Vec<GrantId> = rec
            .grants
            .iter()
            .filter(|(g, _, _)| grant.map(|x| x == g).unwrap_or(true))
            .map(|(g, _, _)| g.clone())
            .collect();
        rec.grants.retain(|(g, _, _)| !removed.contains(g));
        let n = before - rec.grants.len();
        let scope = rec.scope.scope_id.clone();
        // Tokens minted from a revoked grant die with it.
        for t in self.tokens.values_mut() {
            if let Via::Grant(g) = &t.via {
                if removed.contains(g) && t.state == TokState::Issued {
                    t.state = TokState::Revoked;
                }
            }
        }
        for _ in 0..n {
            self.log(
                AuditKind::GrantRevoked,
                Some(run_id),
                Some(&scope),
                None,
                None,
                "",
                None,
                "",
            );
        }
        Ok(n)
    }

    /// Revoke MCP grants only. Folder/run grants are untouched (separate stores).
    fn revoke_mcp_grant_inner(
        &mut self,
        run_id: &RunId,
        grant: Option<&GrantId>,
    ) -> Result<usize, PolicyError> {
        let rec = self.runs.get_mut(run_id).ok_or(PolicyError::UnknownRun)?;
        let removed: Vec<GrantId> = rec
            .mcp_grants
            .iter()
            .filter(|mg| grant.map(|x| x == &mg.id).unwrap_or(true))
            .map(|mg| mg.id.clone())
            .collect();
        rec.mcp_grants.retain(|mg| !removed.contains(&mg.id));
        let n = removed.len();
        let scope = rec.scope.scope_id.clone();
        // Tokens minted from a revoked grant die with it.
        for t in self.tokens.values_mut() {
            if let Via::Grant(g) = &t.via {
                if removed.contains(g) && t.state == TokState::Issued {
                    t.state = TokState::Revoked;
                }
            }
        }
        for _ in 0..n {
            self.log(
                AuditKind::McpGrantRevoked,
                Some(run_id),
                Some(&scope),
                None,
                None,
                "",
                None,
                "",
            );
        }
        Ok(n)
    }
}

fn new_proposal_id() -> Result<ProposalId, PolicyError> {
    ProposalId::new(format!("prop-{}", hex(&random::<12>()?)))
}

/// Tool-code handle.
#[derive(Clone)]
pub struct AgentHandle {
    shared: Arc<Shared>,
}

impl AgentHandle {
    pub(crate) fn attach_file_enforcement(
        &self,
        run: &RunId,
        scope: &ScopeId,
    ) -> Result<(), PolicyError> {
        let mut g = self.shared.lock()?;
        let rec = g.runs.get_mut(run).ok_or(PolicyError::UnknownRun)?;
        if &rec.scope.scope_id != scope {
            return Err(PolicyError::InvalidProposal("scope mismatch"));
        }
        if rec.state != RunState::Active {
            return Err(PolicyError::RunNotActive);
        }
        rec.file_enforced = true;
        g.log(
            AuditKind::EnforcementAttached,
            Some(run),
            Some(scope),
            None,
            None,
            "",
            None,
            "file",
        );
        Ok(())
    }

    pub(crate) fn attach_process_enforcement(
        &self,
        run: &RunId,
        scope: &ScopeId,
        elevated: bool,
    ) -> Result<(), PolicyError> {
        let mut g = self.shared.lock()?;
        let rec = g.runs.get_mut(run).ok_or(PolicyError::UnknownRun)?;
        if &rec.scope.scope_id != scope {
            return Err(PolicyError::InvalidProposal("scope mismatch"));
        }
        if rec.state != RunState::Active {
            return Err(PolicyError::RunNotActive);
        }
        rec.process_enforced = true;
        rec.elevated_exec = elevated;
        g.log(
            AuditKind::EnforcementAttached,
            Some(run),
            Some(scope),
            None,
            None,
            "",
            None,
            if elevated {
                "process:elevated"
            } else {
                "process:sandboxed"
            },
        );
        Ok(())
    }

    pub(crate) fn attach_network_enforcement(
        &self,
        run: &RunId,
        scope: &ScopeId,
    ) -> Result<(), PolicyError> {
        let mut g = self.shared.lock()?;
        let rec = g.runs.get_mut(run).ok_or(PolicyError::UnknownRun)?;
        if &rec.scope.scope_id != scope {
            return Err(PolicyError::InvalidProposal("scope mismatch"));
        }
        if rec.state != RunState::Active {
            return Err(PolicyError::RunNotActive);
        }
        rec.network_enforced = true;
        g.log(
            AuditKind::EnforcementAttached,
            Some(run),
            Some(scope),
            None,
            None,
            "",
            None,
            "network:domain-proxy",
        );
        Ok(())
    }

    /// Submit a proposal. Never performs an effect.
    pub fn propose(&self, p: Proposal) -> Result<ProposeResult, PolicyError> {
        let mut g = self.shared.lock()?;
        g.sweep();
        if p.target.is_empty()
            || p.target.chars().count() > g.cfg.max_target_chars
            || p.target.chars().any(|c| c.is_control())
        {
            return Err(PolicyError::InvalidProposal("target"));
        }
        if p.reason.len() > 16 * 1024 {
            return Err(PolicyError::InvalidProposal("reason too long"));
        }
        if p.declared_impact.len() > 8 {
            return Err(PolicyError::InvalidProposal("declared impact"));
        }
        let binding = ExecutionBinding {
            run_id: p.run_id.clone(),
            scope_id: p.scope_id.clone(),
            kind: p.kind,
            target: p.target.clone(),
            args_digest: p.args_digest,
        };
        let id = new_proposal_id()?;
        g.log_b(AuditKind::Proposed, Some(&id), &binding, "");

        macro_rules! deny {
            ($r:expr) => {{
                let r: DenyReason = $r;
                g.log_b(AuditKind::Denied, Some(&id), &binding, r.as_str());
                return Ok(ProposeResult::Denied(r));
            }};
        }

        // 1. Run and scope.
        let (scope, state, enforced, elevated_exec, granted) = match g.runs.get(&p.run_id) {
            None => deny!(DenyReason::UnknownRun),
            Some(r) => {
                let enforced = match p.kind {
                    ActionKind::Read | ActionKind::Write | ActionKind::Delete => r.file_enforced,
                    ActionKind::Shell => r.process_enforced,
                    ActionKind::Network => r.network_enforced,
                    // MCP and desktop control have no enforcement in this crate (Welle-B A4
                    // scope: process + tool network only). They stay denied even when a scope
                    // lists them, even from a Verified skill.
                    ActionKind::Mcp | ActionKind::Desktop => false,
                };
                (
                    r.scope.clone(),
                    r.state,
                    enforced,
                    r.elevated_exec,
                    r.grants
                        .iter()
                        .any(|(_, k, t)| *k == p.kind && *t == p.target),
                )
            }
        };
        if state != RunState::Active {
            deny!(DenyReason::RunNotActive);
        }
        if scope.scope_id != p.scope_id {
            deny!(DenyReason::ScopeMismatch);
        }
        if !scope.allowed_kinds.contains(&p.kind) {
            deny!(DenyReason::KindNotInScope);
        }
        // 2. Deny capabilities without enforcement. A kind is enforceable only after the
        //    matching executor (file, process or network) was attached to this exact run
        //    scope. There is no fallback level: without verified isolation the action fails
        //    closed and the executor's attach error carries the visible reason.
        if !enforced {
            deny!(DenyReason::NoEnforcement);
        }
        // 3. Autonomy ceiling.
        if matches!(p.kind, ActionKind::Write | ActionKind::Delete)
            && scope.autonomy == Autonomy::ReadOnly
        {
            deny!(DenyReason::ReadOnly);
        }
        // 4. Baseline always-ask. Skills, origins and autonomy are not inputs here.
        //    Elevated-mode shell is always-ask by design (arbitrary exec is a separate,
        //    explicit, per-command decision; no run grant can ever cover it).
        let impact = classify(p.kind, &p.target, &p.declared_impact);
        let always_ask = !impact.is_empty() || (p.kind == ActionKind::Shell && elevated_exec);

        if !always_ask {
            let auto = if p.kind == ActionKind::Read {
                Some(Via::Policy)
            } else if granted {
                // Look the grant id up for revocation binding.
                let gid = g.runs.get(&p.run_id).and_then(|r| {
                    r.grants
                        .iter()
                        .find(|(_, k, t)| *k == p.kind && *t == p.target)
                        .map(|(i, _, _)| i.clone())
                });
                gid.map(Via::Grant)
            } else if p.kind == ActionKind::Write && scope.autonomy == Autonomy::AllowWritesInCopy {
                Some(Via::Policy)
            } else {
                None
            };
            if let Some(via) = auto {
                if g.issued_for_run(&p.run_id) >= g.cfg.max_tokens_per_run {
                    deny!(DenyReason::QueueFull);
                }
                let tok = g.mint(&id, &binding, via, self.shared.broker_id)?;
                g.log_b(AuditKind::AutoAllowed, Some(&id), &binding, "");
                return Ok(ProposeResult::Approved {
                    id,
                    token: tok,
                    basis: Decision::AllowForRun,
                });
            }
        }

        // 5. Ask.
        if g.pending.len() >= g.cfg.max_pending_total
            || g.pending_for_run(&p.run_id) >= g.cfg.max_pending_per_run
        {
            deny!(DenyReason::QueueFull);
        }
        let offered = if always_ask {
            vec![UserDecision::Deny, UserDecision::AllowOnce]
        } else {
            vec![
                UserDecision::Deny,
                UserDecision::AllowOnce,
                UserDecision::AllowForRun,
            ]
        };
        let now = g.now();
        let rec = PendingRec {
            id: id.clone(),
            shown_target: sanitize_target(&p.target, g.cfg.max_target_chars),
            reason: sanitize_text(&p.reason, g.cfg.max_reason_chars),
            origin: p.origin.clone(),
            impact,
            offered,
            created_at: now,
            expires_at: now.saturating_add(g.cfg.pending_ttl.as_millis() as u64),
            binding: binding.clone(),
            mcp: None,
        };
        g.pending.insert(id.clone(), rec);
        g.log_b(
            AuditKind::Queued,
            Some(&id),
            &binding,
            if always_ask { "always_ask" } else { "ask" },
        );
        Ok(ProposeResult::Pending(id))
    }

    /// The explicit MCP route (see [`crate::mcp`]). Never a silent pass: no `Via::Policy`, no
    /// autonomy level and no folder grant applies. Auto-allows only through an exact,
    /// digest-bound MCP grant of this run.
    pub(crate) fn propose_mcp(
        &self,
        p: Proposal,
        mcp: McpPending,
    ) -> Result<ProposeResult, PolicyError> {
        let mut g = self.shared.lock()?;
        g.sweep();
        if p.kind != ActionKind::Mcp {
            return Err(PolicyError::InvalidProposal("kind"));
        }
        if p.target.is_empty()
            || p.target.chars().count() > g.cfg.max_target_chars
            || p.target.chars().any(|c| c.is_control())
        {
            return Err(PolicyError::InvalidProposal("target"));
        }
        if p.reason.len() > 16 * 1024 {
            return Err(PolicyError::InvalidProposal("reason too long"));
        }
        let binding = ExecutionBinding {
            run_id: p.run_id.clone(),
            scope_id: p.scope_id.clone(),
            kind: p.kind,
            target: p.target.clone(),
            args_digest: p.args_digest,
        };
        let id = new_proposal_id()?;
        g.log_b(AuditKind::Proposed, Some(&id), &binding, "");

        macro_rules! deny {
            ($r:expr) => {{
                let r: DenyReason = $r;
                g.log_b(AuditKind::Denied, Some(&id), &binding, r.as_str());
                return Ok(ProposeResult::Denied(r));
            }};
        }

        let (scope, state, granted) = match g.runs.get(&p.run_id) {
            None => deny!(DenyReason::UnknownRun),
            Some(r) => (
                r.scope.clone(),
                r.state,
                r.mcp_grants
                    .iter()
                    .find(|mg| {
                        mg.server == mcp.server
                            && mg.tool == mcp.tool
                            && mg.schema_digest == mcp.schema_digest
                    })
                    .map(|mg| mg.id.clone()),
            ),
        };
        if state != RunState::Active {
            deny!(DenyReason::RunNotActive);
        }
        if scope.scope_id != p.scope_id {
            deny!(DenyReason::ScopeMismatch);
        }
        if !scope.allowed_kinds.contains(&ActionKind::Mcp) {
            deny!(DenyReason::KindNotInScope);
        }

        // Baseline always-ask (credential-like targets, send/purchase/payment words): only
        // Deny / AllowOnce are offered and no MCP grant can be created.
        let impact = classify(p.kind, &p.target, &p.declared_impact);
        let always_ask = !impact.is_empty();

        if !always_ask {
            if let Some(gid) = granted {
                if g.issued_for_run(&p.run_id) >= g.cfg.max_tokens_per_run {
                    deny!(DenyReason::QueueFull);
                }
                let tok = g.mint(&id, &binding, Via::Grant(gid), self.shared.broker_id)?;
                g.log_b(AuditKind::AutoAllowed, Some(&id), &binding, "mcp_grant");
                return Ok(ProposeResult::Approved {
                    id,
                    token: tok,
                    basis: Decision::AllowForRun,
                });
            }
        }

        if g.pending.len() >= g.cfg.max_pending_total
            || g.pending_for_run(&p.run_id) >= g.cfg.max_pending_per_run
        {
            deny!(DenyReason::QueueFull);
        }
        let offered = if always_ask {
            vec![UserDecision::Deny, UserDecision::AllowOnce]
        } else {
            vec![
                UserDecision::Deny,
                UserDecision::AllowOnce,
                UserDecision::AllowForRun,
            ]
        };
        let now = g.now();
        let rec = PendingRec {
            id: id.clone(),
            binding: binding.clone(),
            shown_target: sanitize_target(&p.target, g.cfg.max_target_chars),
            reason: sanitize_text(&p.reason, g.cfg.max_reason_chars),
            origin: p.origin.clone(),
            impact,
            offered,
            created_at: now,
            expires_at: now.saturating_add(g.cfg.pending_ttl.as_millis() as u64),
            mcp: Some(mcp),
        };
        g.pending.insert(id.clone(), rec);
        g.log_b(
            AuditKind::Queued,
            Some(&id),
            &binding,
            if always_ask { "always_ask" } else { "ask" },
        );
        Ok(ProposeResult::Pending(id))
    }

    /// Collect the outcome of a pending proposal.
    pub fn poll(&self, id: &ProposalId) -> Result<PollResult, PolicyError> {
        let mut g = self.shared.lock()?;
        g.sweep();
        if g.pending.contains_key(id) {
            return Ok(PollResult::Pending);
        }
        match g.outcomes.get_mut(id) {
            None => Ok(PollResult::Gone),
            Some(Outcome::Approved(slot)) => match slot.take() {
                Some((token, basis)) => Ok(PollResult::Approved { token, basis }),
                None => Ok(PollResult::Gone),
            },
            Some(Outcome::Denied(r)) => {
                let r = *r;
                g.outcomes.remove(id);
                Ok(PollResult::Denied(r))
            }
        }
    }

    /// Execution-time check. Called by executors immediately before the effect, with a binding
    /// derived from the executor's actual arguments. Moves the token: it cannot be reused.
    pub fn consume(
        &self,
        token: ApprovalToken,
        binding: &ExecutionBinding,
    ) -> Result<ExecutionGuard, ConsumeError> {
        let mut g = self.shared.lock().map_err(|_| ConsumeError::Poisoned)?;
        g.sweep();
        let pid = token.proposal_id.clone();
        macro_rules! reject {
            ($e:expr, $d:expr) => {{
                g.log_b(AuditKind::TokenRejected, Some(&pid), binding, $d);
                return Err($e);
            }};
        }
        if token.broker_id != self.shared.broker_id {
            reject!(ConsumeError::Unknown, "other_broker");
        }
        let now = g.now();
        let (state, hash_ok, expires, bind_ok, via) = match g.tokens.get(&pid) {
            None => reject!(ConsumeError::Unknown, "unknown"),
            Some(t) => (
                t.state,
                ct_eq(&t.secret_hash, &sha256(&token.secret)),
                t.expires_at,
                t.binding == *binding,
                t.via.clone(),
            ),
        };
        if !hash_ok {
            reject!(ConsumeError::Forged, "forged");
        }
        match state {
            TokState::Consumed => reject!(ConsumeError::AlreadyUsed, "already_used"),
            TokState::Revoked => reject!(ConsumeError::Revoked, "revoked"),
            TokState::Issued => {}
        }
        let run_active = g
            .runs
            .get(&binding.run_id)
            .map(|r| r.state == RunState::Active)
            .unwrap_or(false);
        if !run_active {
            if let Some(t) = g.tokens.get_mut(&pid) {
                t.state = TokState::Revoked;
            }
            reject!(ConsumeError::RunNotActive, "run_not_active");
        }
        if expires <= now {
            if let Some(t) = g.tokens.get_mut(&pid) {
                t.state = TokState::Revoked;
            }
            reject!(ConsumeError::Expired, "expired");
        }
        if !bind_ok {
            // Substitution attempt: burn the token.
            if let Some(t) = g.tokens.get_mut(&pid) {
                t.state = TokState::Revoked;
            }
            reject!(ConsumeError::BindingMismatch, "binding_mismatch");
        }
        if let Via::Grant(gid) = &via {
            let live = g
                .runs
                .get(&binding.run_id)
                .map(|r| {
                    r.grants.iter().any(|(i, _, _)| i == gid)
                        || r.mcp_grants.iter().any(|mg| &mg.id == gid)
                })
                .unwrap_or(false);
            if !live {
                if let Some(t) = g.tokens.get_mut(&pid) {
                    t.state = TokState::Revoked;
                }
                reject!(ConsumeError::Revoked, "grant_revoked");
            }
        }
        if let Some(t) = g.tokens.get_mut(&pid) {
            t.state = TokState::Consumed;
        }
        if let Some(r) = g.runs.get_mut(&binding.run_id) {
            r.in_flight += 1;
        }
        g.log_b(AuditKind::TokenConsumed, Some(&pid), binding, "");
        drop(g);
        Ok(ExecutionGuard {
            shared: self.shared.clone(),
            proposal_id: pid,
            binding: binding.clone(),
            via,
            done: false,
        })
    }
}

/// Outcome reported by an executor.
#[derive(Debug, Clone, Copy)]
pub enum EffectOutcome<'a> {
    /// Effect done; `bytes` moved.
    Ok {
        /// Byte count.
        bytes: u64,
    },
    /// Effect failed; `class` is a short fixed word (never content).
    Failed {
        /// Error class.
        class: &'a str,
    },
}

/// Held while an effect runs. Cancelling the run waits for it to drop.
pub struct ExecutionGuard {
    shared: Arc<Shared>,
    proposal_id: ProposalId,
    binding: ExecutionBinding,
    via: Via,
    done: bool,
}

impl ExecutionGuard {
    /// Re-check, right before committing the effect, that the run is still active and any
    /// run grant is still live.
    pub fn checkpoint(&self) -> Result<(), ConsumeError> {
        let g = self.shared.lock().map_err(|_| ConsumeError::Poisoned)?;
        let run = g
            .runs
            .get(&self.binding.run_id)
            .ok_or(ConsumeError::RunNotActive)?;
        if run.state != RunState::Active {
            return Err(ConsumeError::RunNotActive);
        }
        if let Via::Grant(gid) = &self.via {
            let live = run.grants.iter().any(|(i, _, _)| i == gid)
                || run.mcp_grants.iter().any(|mg| &mg.id == gid);
            if !live {
                return Err(ConsumeError::Revoked);
            }
        }
        Ok(())
    }

    /// Record the result in the audit log.
    pub fn complete(mut self, outcome: EffectOutcome<'_>) {
        self.done = true;
        if let Ok(mut g) = self.shared.lock() {
            match outcome {
                EffectOutcome::Ok { bytes } => g.log_b(
                    AuditKind::EffectOk,
                    Some(&self.proposal_id),
                    &self.binding,
                    &format!("bytes={bytes}"),
                ),
                EffectOutcome::Failed { class } => g.log_b(
                    AuditKind::EffectFailed,
                    Some(&self.proposal_id),
                    &self.binding,
                    class,
                ),
            }
        }
    }
}

impl Drop for ExecutionGuard {
    fn drop(&mut self) {
        if let Ok(mut g) = self.shared.inner.lock() {
            if !self.done {
                let (pid, b) = (self.proposal_id.clone(), self.binding.clone());
                g.log_b(AuditKind::EffectAbandoned, Some(&pid), &b, "");
            }
            if let Some(r) = g.runs.get_mut(&self.binding.run_id) {
                r.in_flight = r.in_flight.saturating_sub(1);
            }
        }
        self.shared.drained.notify_all();
    }
}

/// Consent UI handle.
#[derive(Clone)]
pub struct UiHandle {
    shared: Arc<Shared>,
}

impl UiHandle {
    /// All pending requests, oldest first.
    pub fn pending(&self) -> Result<Vec<PendingView>, PolicyError> {
        let mut g = self.shared.lock()?;
        g.sweep();
        let mut v: Vec<PendingView> = g
            .pending
            .values()
            .map(|p| {
                let (label, attended) = g
                    .runs
                    .get(&p.binding.run_id)
                    .map(|r| (sanitize_text(&r.scope.label, 120), r.scope.attended))
                    .unwrap_or_default();
                PendingView::from_parts(
                    p.id.clone(),
                    &p.binding,
                    &p.shown_target,
                    &p.reason,
                    &p.origin,
                    &p.impact,
                    &p.offered,
                    p.created_at,
                    p.expires_at,
                    label,
                    attended,
                )
            })
            .collect();
        v.sort_by_key(|x| x.created_at_ms);
        Ok(v)
    }

    /// Pending requests of one run.
    pub fn pending_for_run(&self, run: &RunId) -> Result<Vec<PendingView>, PolicyError> {
        Ok(self
            .pending()?
            .into_iter()
            .filter(|p| &p.run_id == run)
            .collect())
    }

    /// Decide a pending request. The decision cannot change target, arguments or scope: the
    /// broker looks up the original proposal.
    pub fn decide(
        &self,
        request_id: &ProposalId,
        decision: UserDecision,
    ) -> Result<DecisionReceipt, PolicyError> {
        let mut g = self.shared.lock()?;
        g.sweep();
        let rec = g
            .pending
            .get(request_id)
            .ok_or(PolicyError::UnknownPending)?;
        let binding = rec.binding.clone();
        let offered = rec.offered.clone();
        let mcp_pending = rec.mcp.clone();
        let run_state = g.runs.get(&binding.run_id).map(|r| r.state);
        if run_state != Some(RunState::Active) {
            g.pending.remove(request_id);
            g.log_b(AuditKind::Denied, Some(request_id), &binding, "run_ended");
            g.store_outcome(request_id.clone(), Outcome::Denied(DenyReason::RunEnded));
            return Err(PolicyError::RunNotActive);
        }
        if !offered.contains(&decision) {
            return Err(PolicyError::DecisionNotOffered);
        }
        g.pending.remove(request_id);
        let label = match decision {
            UserDecision::Deny => "deny",
            UserDecision::AllowOnce => "allow_once",
            UserDecision::AllowForRun => "allow_for_run",
        };
        g.log_b(AuditKind::UserDecided, Some(request_id), &binding, label);
        let applied = match decision {
            UserDecision::Deny => {
                g.store_outcome(request_id.clone(), Outcome::Denied(DenyReason::UserDenied));
                Decision::Deny
            }
            UserDecision::AllowOnce => {
                let tok = g.mint(request_id, &binding, Via::Once, self.shared.broker_id)?;
                g.store_outcome(
                    request_id.clone(),
                    Outcome::Approved(Some((tok, Decision::AllowOnce))),
                );
                Decision::AllowOnce
            }
            UserDecision::AllowForRun => {
                let gid = GrantId::new(format!("grant-{}", hex(&random::<8>()?)))?;
                let max = g.cfg.max_grants_per_run;
                let gid = if let Some(mcp) = &mcp_pending {
                    // MCP grants are their own, stronger type: digest-bound and stored apart
                    // from folder/run grants.
                    let existing = g.runs.get(&binding.run_id).and_then(|r| {
                        r.mcp_grants
                            .iter()
                            .find(|mg| {
                                mg.server == mcp.server
                                    && mg.tool == mcp.tool
                                    && mg.schema_digest == mcp.schema_digest
                            })
                            .map(|mg| mg.id.clone())
                    });
                    match existing {
                        Some(e) => e,
                        None => {
                            let r = g
                                .runs
                                .get_mut(&binding.run_id)
                                .ok_or(PolicyError::UnknownRun)?;
                            if r.mcp_grants.len() >= max {
                                return Err(PolicyError::InvalidProposal("grant limit"));
                            }
                            r.mcp_grants.push(McpGrantRec {
                                id: gid.clone(),
                                server: mcp.server.clone(),
                                tool: mcp.tool.clone(),
                                schema_digest: mcp.schema_digest,
                            });
                            g.log_b(AuditKind::McpGrantCreated, Some(request_id), &binding, "");
                            gid
                        }
                    }
                } else {
                    let existing = g.runs.get(&binding.run_id).and_then(|r| {
                        r.grants
                            .iter()
                            .find(|(_, k, t)| *k == binding.kind && *t == binding.target)
                            .map(|(i, _, _)| i.clone())
                    });
                    match existing {
                        Some(e) => e,
                        None => {
                            let r = g
                                .runs
                                .get_mut(&binding.run_id)
                                .ok_or(PolicyError::UnknownRun)?;
                            if r.grants.len() >= max {
                                return Err(PolicyError::InvalidProposal("grant limit"));
                            }
                            r.grants
                                .push((gid.clone(), binding.kind, binding.target.clone()));
                            g.log_b(AuditKind::GrantCreated, Some(request_id), &binding, "");
                            gid
                        }
                    }
                };
                let tok = g.mint(request_id, &binding, Via::Grant(gid), self.shared.broker_id)?;
                g.store_outcome(
                    request_id.clone(),
                    Outcome::Approved(Some((tok, Decision::AllowForRun))),
                );
                Decision::AllowForRun
            }
        };
        Ok(DecisionReceipt {
            request_id: request_id.clone(),
            decision: applied,
        })
    }

    /// Wire entry: `{runId, requestId, choice}`. Verifies the request belongs to `run_id`.
    pub fn decide_wire(
        &self,
        run_id: &str,
        request_id: &str,
        choice: UserDecision,
    ) -> Result<DecisionReceipt, PolicyError> {
        let run = RunId::new(run_id)?;
        let req = ProposalId::new(request_id)?;
        {
            let g = self.shared.lock()?;
            let p = g.pending.get(&req).ok_or(PolicyError::UnknownPending)?;
            if p.binding.run_id != run {
                return Err(PolicyError::RunMismatch);
            }
        }
        self.decide(&req, choice)
    }

    /// Active grants of a run.
    pub fn grants(&self, run: &RunId) -> Result<Vec<GrantView>, PolicyError> {
        grants(&self.shared, run)
    }

    /// Revoke one grant (and any unused token minted from it).
    pub fn revoke_grant(&self, run: &RunId, grant: &GrantId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_grant_inner(run, Some(grant))
    }

    /// Revoke all grants of a run.
    pub fn revoke_all_grants(&self, run: &RunId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_grant_inner(run, None)
    }

    /// Active MCP grants of a run (separate, digest-bound store).
    pub fn mcp_grants(&self, run: &RunId) -> Result<Vec<McpGrantView>, PolicyError> {
        mcp_grants(&self.shared, run)
    }

    /// Revoke one MCP grant (and any unused token minted from it). Folder grants are untouched.
    pub fn revoke_mcp_grant(&self, run: &RunId, grant: &GrantId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_mcp_grant_inner(run, Some(grant))
    }

    /// Revoke all MCP grants of a run. Folder grants are untouched.
    pub fn revoke_all_mcp_grants(&self, run: &RunId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_mcp_grant_inner(run, None)
    }

    /// Audit tail.
    pub fn audit(&self, last: usize) -> Result<AuditSnapshot, PolicyError> {
        Ok(self.shared.lock()?.audit.snapshot(last))
    }
}

fn mcp_grants(shared: &Shared, run: &RunId) -> Result<Vec<McpGrantView>, PolicyError> {
    let g = shared.lock()?;
    let r = g.runs.get(run).ok_or(PolicyError::UnknownRun)?;
    Ok(r.mcp_grants
        .iter()
        .map(|mg| McpGrantView {
            grant_id: mg.id.clone(),
            server: sanitize_text(&mg.server, 80),
            tool: sanitize_text(&mg.tool, 128),
            schema_digest: mg.schema_digest.to_hex(),
        })
        .collect())
}

fn grants(shared: &Shared, run: &RunId) -> Result<Vec<GrantView>, PolicyError> {
    let g = shared.lock()?;
    let r = g.runs.get(run).ok_or(PolicyError::UnknownRun)?;
    Ok(r.grants
        .iter()
        .map(|(i, k, t)| GrantView {
            grant_id: i.clone(),
            kind: *k,
            target: sanitize_target(t, 512),
        })
        .collect())
}

/// Run-Manager handle.
#[derive(Clone)]
pub struct RunControl {
    shared: Arc<Shared>,
}

impl RunControl {
    /// Register an explicit run scope.
    pub fn register_run(&self, scope: RunScope) -> Result<(), PolicyError> {
        let mut g = self.shared.lock()?;
        if g.runs.contains_key(&scope.run_id) {
            return Err(PolicyError::RunExists);
        }
        let (r, s) = (scope.run_id.clone(), scope.scope_id.clone());
        g.runs.insert(
            r.clone(),
            RunRec {
                scope,
                state: RunState::Active,
                grants: Vec::new(),
                in_flight: 0,
                file_enforced: false,
                process_enforced: false,
                elevated_exec: false,
                network_enforced: false,
                mcp_grants: Vec::new(),
            },
        );
        g.log(
            AuditKind::RunRegistered,
            Some(&r),
            Some(&s),
            None,
            None,
            "",
            None,
            "",
        );
        Ok(())
    }

    /// Current state of a run.
    pub fn state(&self, run: &RunId) -> Result<Option<RunState>, PolicyError> {
        Ok(self.shared.lock()?.runs.get(run).map(|r| r.state))
    }

    /// Cancel: revoke tokens and grants, deny pending requests, refuse new proposals, then wait
    /// up to `wait` for in-flight effects to finish. Once `drained` is true, no effect of this
    /// run is running or can start.
    pub fn cancel_run(&self, run: &RunId, wait: Duration) -> Result<EndReport, PolicyError> {
        self.end(run, RunState::Cancelled, wait)
    }

    /// Finish normally. Same revocation semantics as cancel.
    pub fn finish_run(&self, run: &RunId, wait: Duration) -> Result<EndReport, PolicyError> {
        self.end(run, RunState::Finished, wait)
    }

    fn end(&self, run: &RunId, to: RunState, wait: Duration) -> Result<EndReport, PolicyError> {
        let mut g = self.shared.lock()?;
        let mut report = g.end_run(run, to)?;
        let deadline = Instant::now() + wait;
        loop {
            let n = g.runs.get(run).map(|r| r.in_flight).unwrap_or(0);
            if n == 0 {
                report.drained = true;
                break;
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            let (ng, _) = self
                .shared
                .drained
                .wait_timeout(g, left)
                .map_err(|_| PolicyError::Poisoned)?;
            g = ng;
        }
        Ok(report)
    }

    /// Active grants of a run.
    pub fn grants(&self, run: &RunId) -> Result<Vec<GrantView>, PolicyError> {
        grants(&self.shared, run)
    }

    /// Revoke all grants of a run.
    pub fn revoke_all_grants(&self, run: &RunId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_grant_inner(run, None)
    }

    /// Active MCP grants of a run (separate, digest-bound store).
    pub fn mcp_grants(&self, run: &RunId) -> Result<Vec<McpGrantView>, PolicyError> {
        mcp_grants(&self.shared, run)
    }

    /// Revoke one MCP grant (and any unused token minted from it). Folder grants are untouched.
    pub fn revoke_mcp_grant(&self, run: &RunId, grant: &GrantId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_mcp_grant_inner(run, Some(grant))
    }

    /// Revoke all MCP grants of a run. Folder grants are untouched.
    pub fn revoke_all_mcp_grants(&self, run: &RunId) -> Result<usize, PolicyError> {
        self.shared.lock()?.revoke_mcp_grant_inner(run, None)
    }

    /// Audit tail.
    pub fn audit(&self, last: usize) -> Result<AuditSnapshot, PolicyError> {
        Ok(self.shared.lock()?.audit.snapshot(last))
    }
}
