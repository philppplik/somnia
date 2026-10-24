//! Views for the pending-consent queue. Serialises to camelCase JSON; enum values are
//! snake_case, matching `docs/vibespace/wire-contract.md` (`allow_once`, `allow_for_run`, `deny`).

use crate::action::{ActionKind, HighImpact, Origin, ProposalId, RunId, ScopeId, UserDecision};
use crate::broker::ExecutionBinding;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// One pending consent request as the UI sees it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingView {
    /// Request id (`requestId` on the decision command).
    pub request_id: ProposalId,
    /// Run id.
    pub run_id: RunId,
    /// Scope id.
    pub scope_id: ScopeId,
    /// Label of the run.
    pub run_label: String,
    /// Action.
    pub kind: ActionKind,
    /// Target, sanitised (no URL credentials or query).
    pub target: String,
    /// The agent's reason. Untrusted text, sanitised and truncated; render as plain text only.
    pub reason: String,
    /// Short digest of the arguments the approval will be bound to.
    pub args_digest: String,
    /// Always-ask categories that apply.
    pub impact: Vec<HighImpact>,
    /// Who caused it (informational).
    pub origin: Origin,
    /// Decisions the UI may offer. Always-ask requests never offer `allow_for_run`.
    pub offered: Vec<UserDecision>,
    /// Creation time (UTC ms).
    pub created_at_ms: u64,
    /// Expiry (UTC ms).
    pub expires_at_ms: u64,
    /// False for scheduled/unattended runs: the request waits for the user ("needs you").
    pub attended: bool,
}

impl PendingView {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn from_parts(
        id: ProposalId,
        b: &ExecutionBinding,
        shown_target: &str,
        reason: &str,
        origin: &Origin,
        impact: &BTreeSet<HighImpact>,
        offered: &[UserDecision],
        created: u64,
        expires: u64,
        label: String,
        attended: bool,
    ) -> Self {
        let origin = match origin {
            Origin::Skill { name, trust } => Origin::Skill {
                name: crate::sanitize::sanitize_text(name, 80),
                trust: *trust,
            },
            Origin::Extension { name } => Origin::Extension {
                name: crate::sanitize::sanitize_text(name, 80),
            },
            Origin::ExternalAgent { name } => Origin::ExternalAgent {
                name: crate::sanitize::sanitize_text(name, 80),
            },
            o => o.clone(),
        };
        Self {
            request_id: id,
            run_id: b.run_id.clone(),
            scope_id: b.scope_id.clone(),
            run_label: label,
            kind: b.kind,
            target: shown_target.to_string(),
            reason: reason.to_string(),
            args_digest: b.args_digest.short(),
            impact: impact.iter().copied().collect(),
            origin,
            offered: offered.to_vec(),
            created_at_ms: created,
            expires_at_ms: expires,
            attended,
        }
    }
}

/// Wire shape of the decision command. Carries nothing that could change target, arguments,
/// scope or autonomy; unknown fields are rejected.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConsentDecisionWire {
    /// Run id.
    pub run_id: String,
    /// Request id.
    pub request_id: String,
    /// Choice.
    pub choice: UserDecision,
}
