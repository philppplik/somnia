//! The explicit MCP tool-call route: its own, stronger grant type and no silent broker pass.
//!
//! MCP calls are effects without OS-level enforcement in this crate, so the generic
//! [`AgentHandle::propose`] path keeps denying them with `no_enforcement` (A4 invariant, proven
//! by tests). The only way an MCP call happens is this route:
//!
//! 1. Tool code builds an [`McpToolRef`] (server, tool, schema digest pinned at consent time)
//!    and calls [`McpRoute::propose_call`] with the canonical argument bytes, a reason and the
//!    [`Origin`]. The digest of the token binding covers schema **and** arguments.
//! 2. The broker auto-allows only when a matching [`McpGrant`](crate::McpGrantView) exists for
//!    this run: exact server + tool + schema digest, created by an explicit `AllowForRun`
//!    decision on an MCP ask. MCP grants live in their own store: folder/run grants never cover
//!    MCP calls and MCP grants never cover files. No autonomy level and no `Via::Policy` path
//!    applies.
//! 3. [`McpRoute::call`] consumes the one-time token, re-deriving the binding from the actual
//!    server, tool, schema and arguments, and returns an [`McpCallPermit`]. The host performs
//!    the call only while holding the permit and reports the outcome through it.
//!
//! Desktop control has no route and stays denied everywhere.

use crate::action::{ActionKind, Origin, Proposal, RunId, ScopeId};
use crate::broker::{AgentHandle, EffectOutcome, ExecutionBinding, ExecutionGuard, ProposeResult};
use crate::digest::ArgsDigest;
use crate::error::{ConsumeError, PolicyError};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Canonical argument bytes the largest MCP call may carry (matches the WebView arg cap).
pub const MAX_CALL_ARGS_BYTES: usize = 64 * 1024;

/// Errors of the MCP route. Denials are not errors: they arrive as [`ProposeResult::Denied`].
#[derive(Debug)]
pub enum McpError {
    /// Broker bookkeeping failed.
    Policy(PolicyError),
    /// The approval token could not be consumed.
    Consume(ConsumeError),
    /// Server or tool name failed validation.
    InvalidTool(&'static str),
    /// Canonical argument bytes exceed [`MAX_CALL_ARGS_BYTES`].
    ArgsTooLarge,
}

impl fmt::Display for McpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            McpError::Policy(e) => return write!(f, "{e}"),
            McpError::Consume(e) => return write!(f, "{e}"),
            McpError::InvalidTool(w) => match w {
                &"server" => "invalid MCP server name",
                _ => "invalid MCP tool name",
            },
            McpError::ArgsTooLarge => "MCP call arguments are too large",
        })
    }
}

impl std::error::Error for McpError {}
impl From<PolicyError> for McpError {
    fn from(e: PolicyError) -> Self {
        McpError::Policy(e)
    }
}
impl From<ConsumeError> for McpError {
    fn from(e: ConsumeError) -> Self {
        McpError::Consume(e)
    }
}

fn valid_name(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.chars().count() <= max
        && !s.chars().any(|c| c.is_control())
        && !s.contains('/')
        && s.trim() == s
}

/// One MCP tool as the user consented to it. The schema digest pins the exact tool definition
/// (name, description, input schema); when the server reports a changed definition the digest
/// changes and every grant bound to it stops matching.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpToolRef {
    server: String,
    tool: String,
    schema_digest: ArgsDigest,
}

impl McpToolRef {
    /// New reference. Server 1-64, tool 1-128 visible characters; no control characters, no
    /// `/`, no surrounding whitespace (they would break the canonical target form).
    pub fn new(server: &str, tool: &str, schema_digest: ArgsDigest) -> Result<Self, McpError> {
        if !valid_name(server, 64) {
            return Err(McpError::InvalidTool("server"));
        }
        if !valid_name(tool, 128) {
            return Err(McpError::InvalidTool("tool"));
        }
        Ok(Self {
            server: server.to_string(),
            tool: tool.to_string(),
            schema_digest,
        })
    }
    /// Server name.
    pub fn server(&self) -> &str {
        &self.server
    }
    /// Tool name.
    pub fn tool(&self) -> &str {
        &self.tool
    }
    /// Pinned schema digest.
    pub fn schema_digest(&self) -> &ArgsDigest {
        &self.schema_digest
    }
    /// Canonical target: `mcp://<server>/<tool>`.
    pub fn target(&self) -> String {
        format!("mcp://{}/{}", self.server, self.tool)
    }
}

/// What an `AllowForRun` decision on an MCP ask creates: the stronger grant type. Stored per
/// run, apart from folder/run grants, bound to server + tool + schema digest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct McpGrantRec {
    pub id: crate::action::GrantId,
    pub server: String,
    pub tool: String,
    pub schema_digest: ArgsDigest,
}

/// Extra data a pending MCP request carries so `AllowForRun` can create the digest-bound grant.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct McpPending {
    pub server: String,
    pub tool: String,
    pub schema_digest: ArgsDigest,
}

/// An MCP grant as the UI sees it. Separate list from folder/run grants.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpGrantView {
    /// Grant id (for revoke).
    pub grant_id: crate::action::GrantId,
    /// Server.
    pub server: String,
    /// Tool.
    pub tool: String,
    /// Schema digest the grant is bound to (64 hex chars).
    pub schema_digest: String,
}

/// Proof that one specific MCP call was approved. The host performs the call only while holding
/// it; dropping it without completing logs an abandoned effect.
pub struct McpCallPermit {
    server: String,
    tool: String,
    guard: ExecutionGuard,
}

impl McpCallPermit {
    /// Server the call goes to.
    pub fn server(&self) -> &str {
        &self.server
    }
    /// Tool being called.
    pub fn tool(&self) -> &str {
        &self.tool
    }
    /// Record a finished call. `bytes` is the result size, never its content.
    pub fn complete_ok(self, bytes: u64) {
        self.guard.complete(EffectOutcome::Ok { bytes });
    }
    /// Record a failed call. `class` is a short fixed word (never content or OS error text).
    pub fn complete_failed(self, class: &'static str) {
        self.guard.complete(EffectOutcome::Failed { class });
    }
}

/// Run-scoped MCP route. Cheap to construct; holds no enforcement flag because MCP has no
/// OS-level enforcement — consent and the digest-bound grant store are the whole gate.
#[derive(Clone)]
pub struct McpRoute {
    agent: AgentHandle,
    run_id: RunId,
    scope_id: ScopeId,
}

impl McpRoute {
    /// New route for one run scope. Does not change any enforcement state.
    pub fn new(agent: &AgentHandle, run_id: RunId, scope_id: ScopeId) -> Self {
        Self {
            agent: agent.clone(),
            run_id,
            scope_id,
        }
    }

    fn binding(&self, tool: &McpToolRef, args_canonical: &[u8]) -> ExecutionBinding {
        let target = tool.target();
        ExecutionBinding {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind: ActionKind::Mcp,
            args_digest: ArgsDigest::builder(ActionKind::Mcp, &target)
                .part("schema", tool.schema_digest.as_bytes())
                .part("args", args_canonical)
                .finish(),
            target,
        }
    }

    /// Propose one MCP tool call. Never performs it. Auto-allows only via an exact, digest-bound
    /// MCP grant of this run; otherwise queues an ask (high-impact targets offer no grant, per
    /// the baseline always-ask rules).
    pub fn propose_call(
        &self,
        tool: &McpToolRef,
        args_canonical: &[u8],
        reason: &str,
        origin: Origin,
    ) -> Result<ProposeResult, McpError> {
        if args_canonical.len() > MAX_CALL_ARGS_BYTES {
            return Err(McpError::ArgsTooLarge);
        }
        let binding = self.binding(tool, args_canonical);
        Ok(self.agent.propose_mcp(
            Proposal {
                run_id: binding.run_id,
                scope_id: binding.scope_id,
                kind: ActionKind::Mcp,
                target: binding.target,
                reason: reason.to_string(),
                args_digest: binding.args_digest,
                origin,
                declared_impact: Vec::new(),
            },
            McpPending {
                server: tool.server.clone(),
                tool: tool.tool.clone(),
                schema_digest: tool.schema_digest,
            },
        )?)
    }

    /// Consume a one-time approval for exactly this call. The binding is re-derived from the
    /// actual server, tool, schema digest and argument bytes; any substitution burns the token.
    /// Re-checks the run is still active right before returning the permit.
    pub fn call(
        &self,
        token: crate::ApprovalToken,
        tool: &McpToolRef,
        args_canonical: &[u8],
    ) -> Result<McpCallPermit, McpError> {
        if args_canonical.len() > MAX_CALL_ARGS_BYTES {
            return Err(McpError::ArgsTooLarge);
        }
        let guard = self.agent.consume(token, &self.binding(tool, args_canonical))?;
        guard.checkpoint()?;
        Ok(McpCallPermit {
            server: tool.server.clone(),
            tool: tool.tool.clone(),
            guard,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{Autonomy, RunScope};
    use crate::broker::{ConsentBroker, DenyReason, PollResult};
    use crate::digest::ArgsDigest;
    use crate::error::PolicyError;
    use crate::{ActionKind, Decision, UserDecision};

    fn digest_of(tag: u8) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Mcp, "schema")
            .part("v", &[tag])
            .finish()
    }

    struct Fx {
        b: crate::BrokerHandles,
        run: RunId,
        scope: ScopeId,
    }

    impl Fx {
        fn new(mcp_allowed: bool) -> Self {
            let b = ConsentBroker::new().unwrap();
            let run = RunId::new("run-1").unwrap();
            let scope = ScopeId::new("copy-1").unwrap();
            let mut rs = RunScope::new(run.clone(), scope.clone());
            if mcp_allowed {
                rs.allowed_kinds.insert(ActionKind::Mcp);
            }
            b.runs.register_run(rs).unwrap();
            Self { b, run, scope }
        }
        fn route(&self) -> McpRoute {
            McpRoute::new(&self.b.agent, self.run.clone(), self.scope.clone())
        }
        fn tool(&self) -> McpToolRef {
            McpToolRef::new("docs", "search", digest_of(1)).unwrap()
        }
        fn ask_and_decide(&self, d: UserDecision) -> crate::ApprovalToken {
            let route = self.route();
            let ProposeResult::Pending(id) = route
                .propose_call(&self.tool(), b"{}", "find docs", Origin::Model)
                .unwrap()
            else {
                panic!("expected ask");
            };
            self.b.ui.decide(&id, d).unwrap();
            let PollResult::Approved { token, .. } = self.b.agent.poll(&id).unwrap() else {
                panic!("expected approval");
            };
            token
        }
    }

    #[test]
    fn generic_propose_keeps_mcp_and_desktop_denied() {
        // The silent-pass path stays closed even when the scope lists the kinds and every
        // other enforcement is attached (A4 invariant).
        let fx = Fx::new(true);
        fx.b
            .runs
            .register_run({
                let run = RunId::new("run-desktop").unwrap();
                let scope = ScopeId::new("copy-desktop").unwrap();
                let mut rs = RunScope::new(run, scope);
                rs.allowed_kinds.insert(ActionKind::Desktop);
                rs
            })
            .unwrap();
        let p = |kind: ActionKind| Proposal {
            run_id: fx.run.clone(),
            scope_id: fx.scope.clone(),
            kind,
            target: "mcp://docs/search".into(),
            reason: "r".into(),
            args_digest: digest_of(1),
            origin: Origin::Model,
            declared_impact: Vec::new(),
        };
        assert!(matches!(
            fx.b.agent.propose(p(ActionKind::Mcp)).unwrap(),
            ProposeResult::Denied(DenyReason::NoEnforcement)
        ));
        let pd = Proposal {
            run_id: RunId::new("run-desktop").unwrap(),
            scope_id: ScopeId::new("copy-desktop").unwrap(),
            ..p(ActionKind::Desktop)
        };
        assert!(matches!(
            fx.b.agent.propose(pd).unwrap(),
            ProposeResult::Denied(DenyReason::NoEnforcement)
        ));
    }

    #[test]
    fn route_denies_when_scope_lacks_mcp_kind() {
        let fx = Fx::new(false);
        assert!(matches!(
            fx.route()
                .propose_call(&fx.tool(), b"{}", "r", Origin::Model)
                .unwrap(),
            ProposeResult::Denied(DenyReason::KindNotInScope)
        ));
    }

    #[test]
    fn allow_once_yields_exactly_one_call() {
        let fx = Fx::new(true);
        let token = fx.ask_and_decide(UserDecision::AllowOnce);
        let permit = fx.route().call(token, &fx.tool(), b"{}").unwrap();
        assert_eq!((permit.server(), permit.tool()), ("docs", "search"));
        permit.complete_ok(128);
        // Nothing was granted: the next identical call asks again.
        assert!(matches!(
            fx.route()
                .propose_call(&fx.tool(), b"{}", "r", Origin::Model)
                .unwrap(),
            ProposeResult::Pending(_)
        ));
    }

    #[test]
    fn substituted_args_or_schema_burn_the_token() {
        let fx = Fx::new(true);
        let token = fx.ask_and_decide(UserDecision::AllowOnce);
        let changed_schema = McpToolRef::new("docs", "search", digest_of(2)).unwrap();
        assert!(matches!(
            fx.route().call(token, &changed_schema, b"{}"),
            Err(McpError::Consume(ConsumeError::BindingMismatch))
        ));
        let token = fx.ask_and_decide(UserDecision::AllowOnce);
        assert!(matches!(
            fx.route().call(token, &fx.tool(), b"{\"q\":1}"),
            Err(McpError::Consume(ConsumeError::BindingMismatch))
        ));
    }

    #[test]
    fn allow_for_run_creates_digest_bound_mcp_grant() {
        let fx = Fx::new(true);
        fx.ask_and_decide(UserDecision::AllowForRun);
        let grants = fx.b.ui.mcp_grants(&fx.run).unwrap();
        assert_eq!(grants.len(), 1);
        assert_eq!((grants[0].server.as_str(), grants[0].tool.as_str()), ("docs", "search"));
        assert_eq!(grants[0].schema_digest, digest_of(1).to_hex());

        // Same server + tool + schema now auto-allows with a fresh per-call token.
        let ProposeResult::Approved { token, basis, .. } = fx
            .route()
            .propose_call(&fx.tool(), b"{\"q\":\"x\"}", "r", Origin::Model)
            .unwrap()
        else {
            panic!("expected grant auto-allow");
        };
        assert_eq!(basis, Decision::AllowForRun);
        fx.route().call(token, &fx.tool(), b"{\"q\":\"x\"}").unwrap().complete_ok(1);

        // A changed schema digest does not match the grant and asks again.
        let changed = McpToolRef::new("docs", "search", digest_of(2)).unwrap();
        assert!(matches!(
            fx.route().propose_call(&changed, b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Pending(_)
        ));
        // A different tool of the same server asks again too.
        let other = McpToolRef::new("docs", "delete", digest_of(1)).unwrap();
        assert!(matches!(
            fx.route().propose_call(&other, b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Pending(_)
        ));
    }

    #[test]
    fn grant_types_are_separated_in_both_directions() {
        let fx = Fx::new(true);
        // Folder grant on a write target: never covers an MCP call.
        fx.b.agent.attach_file_enforcement(&fx.run, &fx.scope).unwrap();
        let write = Proposal {
            run_id: fx.run.clone(),
            scope_id: fx.scope.clone(),
            kind: ActionKind::Write,
            target: "a.txt".into(),
            reason: "r".into(),
            args_digest: digest_of(3),
            origin: Origin::Model,
            declared_impact: Vec::new(),
        };
        let ProposeResult::Pending(id) = fx.b.agent.propose(write).unwrap() else {
            panic!("expected write ask");
        };
        fx.b.ui.decide(&id, UserDecision::AllowForRun).unwrap();
        assert!(matches!(
            fx.route().propose_call(&fx.tool(), b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Pending(_)
        ));

        // MCP grant: never covers a file write, not even with a matching target string.
        fx.ask_and_decide(UserDecision::AllowForRun);
        let write_same_string = Proposal {
            run_id: fx.run.clone(),
            scope_id: fx.scope.clone(),
            kind: ActionKind::Write,
            target: "mcp://docs/search".into(),
            reason: "r".into(),
            args_digest: digest_of(3),
            origin: Origin::Model,
            declared_impact: Vec::new(),
        };
        assert!(matches!(
            fx.b.agent.propose(write_same_string).unwrap(),
            ProposeResult::Pending(_)
        ));

        // Separate listing: the folder grant list shows the write grant only.
        let folder_grants = fx.b.ui.grants(&fx.run).unwrap();
        assert_eq!(folder_grants.len(), 1);
        assert_eq!(folder_grants[0].kind, ActionKind::Write);
        assert_eq!(fx.b.ui.mcp_grants(&fx.run).unwrap().len(), 1);

        // Revoking folder grants leaves the MCP grant live, and vice versa.
        assert_eq!(fx.b.ui.revoke_all_grants(&fx.run).unwrap(), 1);
        assert!(matches!(
            fx.route().propose_call(&fx.tool(), b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Approved { .. }
        ));
        assert_eq!(fx.b.ui.revoke_all_mcp_grants(&fx.run).unwrap(), 1);
        assert!(matches!(
            fx.route().propose_call(&fx.tool(), b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Pending(_)
        ));
    }

    #[test]
    fn revoked_mcp_grant_kills_its_unused_tokens() {
        let fx = Fx::new(true);
        fx.ask_and_decide(UserDecision::AllowForRun);
        let ProposeResult::Approved { token, .. } = fx
            .route()
            .propose_call(&fx.tool(), b"{}", "r", Origin::Model)
            .unwrap()
        else {
            panic!("expected grant auto-allow");
        };
        assert_eq!(fx.b.ui.revoke_all_mcp_grants(&fx.run).unwrap(), 1);
        assert!(matches!(
            fx.route().call(token, &fx.tool(), b"{}"),
            Err(McpError::Consume(ConsumeError::Revoked))
        ));
    }

    #[test]
    fn high_impact_tool_offers_no_grant() {
        let fx = Fx::new(true);
        let send = McpToolRef::new("mail", "send_email", digest_of(1)).unwrap();
        let ProposeResult::Pending(id) = fx
            .route()
            .propose_call(&send, b"{}", "send the report", Origin::Model)
            .unwrap()
        else {
            panic!("expected ask");
        };
        let view = fx.b.ui.pending().unwrap().pop().unwrap();
        assert_eq!(view.offered, vec![UserDecision::Deny, UserDecision::AllowOnce]);
        assert_eq!(
            fx.b.ui.decide(&id, UserDecision::AllowForRun),
            Err(PolicyError::DecisionNotOffered)
        );
        fx.b.ui.decide(&id, UserDecision::Deny).unwrap();
        assert!(fx.b.ui.mcp_grants(&fx.run).unwrap().is_empty());
    }

    #[test]
    fn no_autonomy_level_auto_allows_mcp() {
        let b = ConsentBroker::new().unwrap();
        let run = RunId::new("run-9").unwrap();
        let scope = ScopeId::new("copy-9").unwrap();
        let mut rs = RunScope::new(run.clone(), scope.clone());
        rs.allowed_kinds.insert(ActionKind::Mcp);
        rs.autonomy = Autonomy::AllowWritesInCopy;
        b.runs.register_run(rs).unwrap();
        let route = McpRoute::new(&b.agent, run, scope);
        let tool = McpToolRef::new("docs", "search", digest_of(1)).unwrap();
        assert!(matches!(
            route.propose_call(&tool, b"{}", "r", Origin::Model).unwrap(),
            ProposeResult::Pending(_)
        ));
    }

    #[test]
    fn ending_the_run_drops_mcp_grants() {
        let fx = Fx::new(true);
        fx.ask_and_decide(UserDecision::AllowForRun);
        let report = fx.b.runs.finish_run(&fx.run, std::time::Duration::from_millis(10)).unwrap();
        assert_eq!(report.dropped_grants, 1);
    }

    #[test]
    fn tool_ref_validation_is_fail_closed() {
        assert!(McpToolRef::new("", "t", digest_of(1)).is_err());
        assert!(McpToolRef::new("a/b", "t", digest_of(1)).is_err());
        assert!(McpToolRef::new("a\nb", "t", digest_of(1)).is_err());
        assert!(McpToolRef::new(" srv", "t", digest_of(1)).is_err());
        assert!(McpToolRef::new("srv", "", digest_of(1)).is_err());
        assert!(McpToolRef::new("srv", &"x".repeat(200), digest_of(1)).is_err());
        assert!(McpToolRef::new("srv", "read file", digest_of(1)).is_ok());
    }
}
