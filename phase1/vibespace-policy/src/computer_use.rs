//! Preparatory desktop proposal route, not an OS adapter. Generic Desktop stays denied.
//! Host code must enforce foreground ownership, geometry freshness and cancellation before
//! executing a permit. No raw capture data can be returned through this module.
use crate::broker::{AgentHandle, EffectOutcome, ExecutionBinding, ExecutionGuard, ProposeResult};
use crate::trust::{RuntimePermission, RuntimePermissions};
use crate::{
    ActionKind, ApprovalToken, ArgsDigest, ConsumeError, Origin, PolicyError, Proposal, RunId,
    ScopeId,
};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};

/// Report preparation availability. It never claims an OS backend is installed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ComputerUseSupport {
    /// Linux proposal preparation with explicit host gate; no execution adapter.
    PreparationOnly,
    /// Feature/platform/host gate absent. Fail closed.
    Unavailable,
}
/// Compile-time and explicit host gate. Windows and macOS never pass.
pub fn platform_support(host_platform_gate: bool) -> ComputerUseSupport {
    if cfg!(all(target_os = "linux", feature = "computer-use-linux")) && host_platform_gate {
        ComputerUseSupport::PreparationOnly
    } else {
        ComputerUseSupport::Unavailable
    }
}

/// Input actions. No persistent key-down state, hooks, clipboard or arbitrary OS commands.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ComputerAction {
    /// Move in the host's approved foreground surface.
    MouseMove {
        /// X coordinate.
        x: u32,
        /// Y coordinate.
        y: u32,
    },
    /// Click at an explicit coordinate, never at the unspecified current pointer.
    MouseClick {
        /// X coordinate.
        x: u32,
        /// Y coordinate.
        y: u32,
        /// Button.
        button: MouseButton,
    },
    /// Press and release a single key; no raw scan codes.
    KeyPress {
        /// Key.
        key: Key,
    },
    /// Type exact text, always individually approved. Never audited as content.
    TypeText {
        /// Text up to 4096 UTF-8 bytes.
        text: String,
    },
    /// Capture the approved foreground surface to a private review artifact only.
    ScreenCapture,
}
/// Supported mouse buttons.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    /// Primary.
    Left,
    /// Secondary.
    Right,
}
/// No modifiers or held-key state in this preparation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Key {
    /// Enter.
    Enter,
    /// Escape.
    Escape,
    /// Tab.
    Tab,
    /// Backspace.
    Backspace,
    /// Up.
    ArrowUp,
    /// Down.
    ArrowDown,
    /// Left.
    ArrowLeft,
    /// Right.
    ArrowRight,
}
impl ComputerAction {
    fn name(&self) -> &'static str {
        match self {
            Self::MouseMove { .. } => "mouse_move",
            Self::MouseClick { .. } => "mouse_click",
            Self::KeyPress { .. } => "key_press",
            Self::TypeText { .. } => "type_text",
            Self::ScreenCapture => "screen_capture",
        }
    }
    fn validate(&self) -> Result<(), ComputerUseError> {
        match self {
            Self::MouseMove { x, y } | Self::MouseClick { x, y, .. }
                if *x > 65535 || *y > 65535 =>
            {
                Err(ComputerUseError::InvalidAction)
            }
            Self::TypeText { text }
                if text.is_empty() || text.len() > 4096 || text.contains('\0') =>
            {
                Err(ComputerUseError::InvalidAction)
            }
            _ => Ok(()),
        }
    }
}
/// Fixed errors, never text or captured content.
#[derive(Debug, PartialEq, Eq)]
pub enum ComputerUseError {
    /// No available platform gate or explicit runtime permission.
    Unavailable,
    /// No live session grant or a different session's grant.
    SessionNotGranted,
    /// Invalid bounded input.
    InvalidAction,
    /// Invalid artifact descriptor.
    InvalidArtifact,
    /// Broker failure.
    Policy(PolicyError),
    /// Token validation failure.
    Consume(ConsumeError),
}
impl From<PolicyError> for ComputerUseError {
    fn from(e: PolicyError) -> Self {
        Self::Policy(e)
    }
}
impl From<ConsumeError> for ComputerUseError {
    fn from(e: ConsumeError) -> Self {
        Self::Consume(e)
    }
}

/// Separate grant type, held only by host code. Not serializable or constructible by agents.
/// Grants session participation, NEVER input/capture or screenshot disclosure.
pub struct ComputerUseSessionGrant {
    binding: ExecutionBinding,
    revoked: Arc<AtomicBool>,
    epoch: u64,
    current_epoch: Arc<AtomicU64>,
}
impl ComputerUseSessionGrant {
    /// Revoke immediately; outstanding permits check the same revocation flag.
    pub fn revoke(&self) {
        self.revoked.store(true, Ordering::SeqCst);
    }
}
impl Drop for ComputerUseSessionGrant {
    fn drop(&mut self) {
        self.revoke();
    }
}

/// Run-scoped route pinned to external agent instance, ACP session and foreground surface.
/// All names are validated IDs. Human display names belong to the UI, not target authority.
pub struct ComputerUseRoute {
    agent: AgentHandle,
    run: RunId,
    scope: ScopeId,
    target: String,
    epoch: Arc<AtomicU64>,
}
impl ComputerUseRoute {
    /// Attach a preparation route only with explicit ComputerUse permission and platform gate.
    /// The host must register Desktop in the run's allowed kinds; this does not change them.
    pub fn attach(
        agent: &AgentHandle,
        run: RunId,
        scope: ScopeId,
        agent_instance: &str,
        session: &str,
        surface: &str,
        host_platform_gate: bool,
        permissions: &RuntimePermissions,
    ) -> Result<Self, ComputerUseError> {
        if platform_support(host_platform_gate) != ComputerUseSupport::PreparationOnly
            || !permissions.permits(RuntimePermission::ComputerUse)
        {
            return Err(ComputerUseError::Unavailable);
        }
        for id in [agent_instance, session, surface] {
            ScopeId::new(id)?;
        }
        let target = format!("computer-use://{agent_instance}/{session}/{surface}");
        // Keep target below the broker's default cap even at maximum ID lengths.
        if target.len() > 240 {
            return Err(ComputerUseError::InvalidAction);
        }
        Ok(Self {
            agent: agent.clone(),
            run,
            scope,
            target,
            epoch: Arc::new(AtomicU64::new(0)),
        })
    }
    fn binding(&self, action: Option<&ComputerAction>) -> ExecutionBinding {
        let name = action.map_or("session_start", ComputerAction::name);
        let target = format!("{}/{name}", self.target);
        // Serialize only typed, ordered structs/enums. Never arbitrary agent JSON.
        let bytes = action
            .map(|a| serde_json::to_vec(a).expect("typed action serializes"))
            .unwrap_or_default();
        ExecutionBinding {
            run_id: self.run.clone(),
            scope_id: self.scope.clone(),
            kind: ActionKind::Desktop,
            args_digest: ArgsDigest::builder(ActionKind::Desktop, &target)
                .part("action", &bytes)
                .part(
                    "session_epoch",
                    &action
                        .map_or(0, |_| self.epoch.load(Ordering::SeqCst))
                        .to_be_bytes(),
                )
                .finish(),
            target,
        }
    }
    fn propose(
        &self,
        binding: ExecutionBinding,
        reason: &str,
    ) -> Result<ProposeResult, ComputerUseError> {
        Ok(self.agent.propose_computer_use(Proposal {
            run_id: binding.run_id,
            scope_id: binding.scope_id,
            kind: ActionKind::Desktop,
            target: binding.target,
            args_digest: binding.args_digest,
            reason: reason.to_string(),
            origin: Origin::Model,
            declared_impact: vec![],
        })?)
    }
    /// Always ask for a new session, including restarting the same ACP session ID.
    pub fn propose_session_start(&self, reason: &str) -> Result<ProposeResult, ComputerUseError> {
        self.propose(self.binding(None), reason)
    }
    /// Consume exactly the session-start token. No action is performed.
    pub fn start_session(
        &self,
        token: ApprovalToken,
    ) -> Result<ComputerUseSessionGrant, ComputerUseError> {
        let binding = self.binding(None);
        let guard = self.agent.consume(token, &binding)?;
        guard.checkpoint()?;
        guard.complete(EffectOutcome::Ok { bytes: 0 });
        let epoch = self.epoch.fetch_add(1, Ordering::SeqCst) + 1;
        Ok(ComputerUseSessionGrant {
            binding,
            revoked: Arc::new(AtomicBool::new(false)),
            epoch,
            current_epoch: self.epoch.clone(),
        })
    }
    fn check_grant(&self, grant: &ComputerUseSessionGrant) -> Result<(), ComputerUseError> {
        if !Arc::ptr_eq(&grant.current_epoch, &self.epoch)
            || grant.binding != self.binding(None)
            || grant.revoked.load(Ordering::SeqCst)
            || grant.epoch != self.epoch.load(Ordering::SeqCst)
        {
            return Err(ComputerUseError::SessionNotGranted);
        }
        if !self.agent.computer_use_run_active(&self.run, &self.scope)? {
            return Err(ComputerUseError::SessionNotGranted);
        }
        Ok(())
    }
    /// Every input or capture gets a separate always-ask broker request. No effect here.
    pub fn propose_action(
        &self,
        grant: &ComputerUseSessionGrant,
        action: &ComputerAction,
        reason: &str,
    ) -> Result<ProposeResult, ComputerUseError> {
        self.check_grant(grant)?;
        action.validate()?;
        self.propose(self.binding(Some(action)), reason)
    }
    /// Consume the exact action token and retain a live revocation check for the host adapter.
    /// A permit is not an executed action; this package includes no OS adapter.
    pub fn prepare_action(
        &self,
        grant: &ComputerUseSessionGrant,
        token: ApprovalToken,
        action: &ComputerAction,
    ) -> Result<ComputerUsePermit, ComputerUseError> {
        self.check_grant(grant)?;
        action.validate()?;
        let guard = self.agent.consume(token, &self.binding(Some(action)))?;
        let permit = ComputerUsePermit {
            guard,
            revoked: grant.revoked.clone(),
            capture: matches!(action, ComputerAction::ScreenCapture),
            epoch: grant.epoch,
            current_epoch: grant.current_epoch.clone(),
        };
        permit.checkpoint()?;
        Ok(permit)
    }
}
/// Host-only exact-action permit, with no raw captured content channel.
pub struct ComputerUsePermit {
    guard: ExecutionGuard,
    revoked: Arc<AtomicBool>,
    capture: bool,
    epoch: u64,
    current_epoch: Arc<AtomicU64>,
}
impl ComputerUsePermit {
    /// Immediately before the host effect; no implementation can undo an already executed input.
    pub fn checkpoint(&self) -> Result<(), ComputerUseError> {
        if self.revoked.load(Ordering::SeqCst)
            || self.epoch != self.current_epoch.load(Ordering::SeqCst)
        {
            return Err(ComputerUseError::SessionNotGranted);
        }
        Ok(self.guard.checkpoint()?)
    }
    /// Complete input. Captures must use the artifact route instead.
    pub fn complete_input(self) -> Result<(), ComputerUseError> {
        self.checkpoint()?;
        if self.capture {
            return Err(ComputerUseError::InvalidAction);
        }
        self.guard.complete(EffectOutcome::Ok { bytes: 0 });
        Ok(())
    }
    /// Host records capture as a private artifact reference, never bytes or a network URL.
    /// The result cannot be serialized/sent to ACP until explicitly reviewed by host UI.
    pub fn captured_artifact(
        self,
        artifact_id: &str,
        digest: ArgsDigest,
        bytes: u64,
    ) -> Result<PendingScreenArtifact, ComputerUseError> {
        self.checkpoint()?;
        if !self.capture || bytes == 0 || bytes > 16 * 1024 * 1024 {
            return Err(ComputerUseError::InvalidArtifact);
        }
        ScopeId::new(artifact_id).map_err(|_| ComputerUseError::InvalidArtifact)?;
        self.guard.complete(EffectOutcome::Ok { bytes });
        Ok(PendingScreenArtifact {
            id: artifact_id.to_string(),
            digest,
        })
    }
    /// Host adapter failed. Use fixed classes, not OS or content text.
    pub fn fail(self) {
        self.guard.complete(EffectOutcome::Failed {
            class: "computer_use_adapter",
        });
    }
}
/// A private capture awaiting human review. No serialization or access to raw bytes.
pub struct PendingScreenArtifact {
    id: String,
    digest: ArgsDigest,
}
impl PendingScreenArtifact {
    /// Private artifact id for host review lookup only.
    pub fn id(&self) -> &str {
        &self.id
    }
    /// Digest to verify when loading the private artifact for review.
    pub fn digest(&self) -> ArgsDigest {
        self.digest
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    use crate::{Autonomy, ConsentBroker, PollResult, RunScope, UserDecision};
    #[test]
    fn platform_and_permission_are_restricted() {
        assert_eq!(platform_support(false), ComputerUseSupport::Unavailable);
        assert!(!RuntimePermissions::restricted().permits(RuntimePermission::ComputerUse));
        if !cfg!(all(target_os = "linux", feature = "computer-use-linux")) {
            assert_eq!(platform_support(true), ComputerUseSupport::Unavailable);
        }
    }
    #[test]
    fn bounded_actions_and_strict_wire() {
        assert_eq!(
            ComputerAction::MouseMove { x: 65536, y: 0 }.validate(),
            Err(ComputerUseError::InvalidAction)
        );
        assert_eq!(
            ComputerAction::TypeText {
                text: "x".repeat(4097)
            }
            .validate(),
            Err(ComputerUseError::InvalidAction)
        );
        assert!(serde_json::from_str::<ComputerAction>(
            r#"{"type":"key_press","key":"enter","shell":"bad"}"#
        )
        .is_err());
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    fn fixture() -> (crate::BrokerHandles, ComputerUseRoute) {
        let b = ConsentBroker::new().unwrap();
        let run = RunId::new("r").unwrap();
        let scope = ScopeId::new("s").unwrap();
        let mut rs = RunScope::new(run.clone(), scope.clone());
        rs.allowed_kinds.insert(ActionKind::Desktop);
        rs.autonomy = Autonomy::AllowWritesInCopy;
        b.runs.register_run(rs).unwrap();
        let mut permissions = RuntimePermissions::restricted();
        permissions.grant(RuntimePermission::ComputerUse);
        let route = ComputerUseRoute::attach(
            &b.agent,
            run,
            scope,
            "codex-1",
            "acp-1",
            "foreground-1",
            true,
            &permissions,
        )
        .unwrap();
        (b, route)
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    fn approve(b: &crate::BrokerHandles, p: ProposeResult) -> ApprovalToken {
        let ProposeResult::Pending(id) = p else {
            panic!("must ask")
        };
        let pending = b.ui.pending().unwrap();
        let view = pending.iter().find(|v| v.request_id == id).unwrap();
        assert_eq!(view.origin, Origin::Model);
        assert!(!view.offered.contains(&UserDecision::AllowForRun));
        assert_eq!(
            b.ui.decide(&id, UserDecision::AllowForRun),
            Err(PolicyError::DecisionNotOffered)
        );
        b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
        let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
            panic!()
        };
        token
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    #[test]
    fn all_actions_map_to_exact_always_ask_model_proposals() {
        let (b, r) = fixture();
        let g = r
            .start_session(approve(
                &b,
                r.propose_session_start("start external agent").unwrap(),
            ))
            .unwrap();
        for action in [
            ComputerAction::MouseMove { x: 1, y: 2 },
            ComputerAction::MouseClick {
                x: 1,
                y: 2,
                button: MouseButton::Left,
            },
            ComputerAction::KeyPress { key: Key::Enter },
            ComputerAction::TypeText {
                text: "private text".into(),
            },
            ComputerAction::ScreenCapture,
        ] {
            let tok = approve(&b, r.propose_action(&g, &action, "exact action").unwrap());
            let replay = tok.dup();
            let permit = r.prepare_action(&g, tok, &action).unwrap();
            if matches!(action, ComputerAction::ScreenCapture) {
                let artifact = permit
                    .captured_artifact("screen-1", r.binding(Some(&action)).args_digest, 100)
                    .unwrap();
                assert_eq!(artifact.id(), "screen-1");
            } else {
                permit.complete_input().unwrap();
            }
            assert!(matches!(
                r.prepare_action(&g, replay, &action),
                Err(ComputerUseError::Consume(ConsumeError::AlreadyUsed))
            ));
        }
        assert!(b.ui.grants(&r.run).unwrap().is_empty());
        assert!(b.ui.mcp_grants(&r.run).unwrap().is_empty());
        // Every restart asks even after granting the session.
        assert!(matches!(
            r.propose_session_start("restart").unwrap(),
            ProposeResult::Pending(_)
        ));
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    #[test]
    fn substitution_revocation_and_cancel_fail_closed() {
        let (b, r) = fixture();
        let g = r
            .start_session(approve(&b, r.propose_session_start("start").unwrap()))
            .unwrap();
        let action = ComputerAction::KeyPress { key: Key::Enter };
        let tok = approve(&b, r.propose_action(&g, &action, "press").unwrap());
        assert!(matches!(
            r.prepare_action(&g, tok, &ComputerAction::KeyPress { key: Key::Escape }),
            Err(ComputerUseError::Consume(ConsumeError::BindingMismatch))
        ));
        let tok = approve(&b, r.propose_action(&g, &action, "press").unwrap());
        let permit = r.prepare_action(&g, tok, &action).unwrap();
        g.revoke();
        assert_eq!(
            permit.checkpoint(),
            Err(ComputerUseError::SessionNotGranted)
        );
        drop(permit);
        assert!(matches!(
            r.propose_action(&g, &action, "again"),
            Err(ComputerUseError::SessionNotGranted)
        ));
        let g = r
            .start_session(approve(&b, r.propose_session_start("restart").unwrap()))
            .unwrap();
        b.runs
            .cancel_run(&r.run, std::time::Duration::ZERO)
            .unwrap();
        assert!(matches!(
            r.propose_action(&g, &action, "cancelled"),
            Err(ComputerUseError::SessionNotGranted)
        ));
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    #[test]
    fn generic_desktop_stays_denied_and_capture_is_not_input() {
        let (b, r) = fixture();
        let binding = r.binding(None);
        assert!(matches!(
            b.agent
                .propose(Proposal {
                    run_id: binding.run_id,
                    scope_id: binding.scope_id,
                    kind: ActionKind::Desktop,
                    target: binding.target,
                    reason: "generic".into(),
                    args_digest: binding.args_digest,
                    origin: Origin::Model,
                    declared_impact: vec![]
                })
                .unwrap(),
            ProposeResult::Denied(crate::DenyReason::NoEnforcement)
        ));
        let g = r
            .start_session(approve(&b, r.propose_session_start("start").unwrap()))
            .unwrap();
        let action = ComputerAction::ScreenCapture;
        let tok = approve(&b, r.propose_action(&g, &action, "capture").unwrap());
        assert_eq!(
            r.prepare_action(&g, tok, &action).unwrap().complete_input(),
            Err(ComputerUseError::InvalidAction)
        );
    }
    #[cfg(all(target_os = "linux", feature = "computer-use-linux"))]
    #[test]
    fn restart_epoch_invalidates_old_grants_permits_and_tokens() {
        let (b, r) = fixture();
        let g = r
            .start_session(approve(&b, r.propose_session_start("start").unwrap()))
            .unwrap();
        let action = ComputerAction::KeyPress { key: Key::Enter };
        let old_tok = approve(&b, r.propose_action(&g, &action, "old").unwrap());
        let permit_tok = approve(&b, r.propose_action(&g, &action, "in flight").unwrap());
        let permit = r.prepare_action(&g, permit_tok, &action).unwrap();
        let fresh = r
            .start_session(approve(&b, r.propose_session_start("restart").unwrap()))
            .unwrap();
        assert_eq!(
            permit.checkpoint(),
            Err(ComputerUseError::SessionNotGranted)
        );
        assert!(matches!(
            r.propose_action(&g, &action, "old session"),
            Err(ComputerUseError::SessionNotGranted)
        ));
        assert!(matches!(
            r.prepare_action(&fresh, old_tok, &action),
            Err(ComputerUseError::Consume(ConsumeError::BindingMismatch))
        ));
        // An independently attached route cannot borrow this route's host-only grant.
        let mut permissions = RuntimePermissions::restricted();
        permissions.grant(RuntimePermission::ComputerUse);
        let other = ComputerUseRoute::attach(
            &b.agent,
            r.run.clone(),
            r.scope.clone(),
            "codex-1",
            "acp-1",
            "foreground-1",
            true,
            &permissions,
        )
        .unwrap();
        assert!(matches!(
            other.propose_action(&fresh, &action, "wrong route"),
            Err(ComputerUseError::SessionNotGranted)
        ));
    }
}
