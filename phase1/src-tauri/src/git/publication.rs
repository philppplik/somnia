//! Publication service seam: the native side of the renderer contract in
//! `src/lib/git/publication/types.ts` (review boundary: docs/git/PUBLICATION-REVIEW.md,
//! host integration: docs/git/PUBLICATION-HOST.md).
//!
//! This module is the wire and exactness layer between the remote transport library
//! (`git::remote`: plan/apply/fetch against GitHub) and the review dialog. It owns:
//!
//! - Wire types matching the TypeScript contract field for field. The renderer never
//!   sends a plan object back: apply carries only `{planId, contentHash, confirmed: true}`.
//! - The native registry of reviewed plans (single-use, expiring). What the person
//!   reviewed is reconstructed from native state, never trusted from the renderer.
//! - Exact-content checks: the registry binds the reviewed tree hash, and the transport's
//!   `push_apply` recomputes the whole plan from live state (a fresh remote observation
//!   included) and refuses with `stale-plan` on any drift.
//! - The typed outcome vocabulary the controller understands, mapped from native results
//!   without leaking transport detail (`denied-SSO` keeps its exact casing).
//!
//! No credentials cross this seam in either direction: there is no field for them, and a
//! test asserts the wire JSON never carries token-shaped material. SSH and Git Credential
//! Manager are separate transport work and fail closed here; only `github-https` runs.

use super::remote::push::{PushOutcome, PushPlan, PushPlanRequest, PushResult};
use super::remote::{RemoteError, RemoteErrorCode, RResult};
use super::{run_git, GitOutput, Mode, READ_TIMEOUT};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::Path;
use std::time::{Duration, Instant};

/// Untracked/excluded listings are informational for the review and capped.
pub const MAX_LISTED_PATHS: usize = 200;
/// A reviewed plan stays applicable for this long; then it is `stale-plan`.
const REGISTRY_TTL: Duration = Duration::from_secs(15 * 60);
/// Bounded host memory: older reviewed plans are evicted beyond this many entries.
const REGISTRY_CAP: usize = 8;

// ---------------------------------------------------------------- inbound wire

/// Authentication route the person picked. Only `github-https` has a native transport;
/// `ssh` and `gcm` deserialize (the UI offers them) but [`check_target`] rejects them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuthRoute {
    GithubHttps,
    Ssh,
    Gcm,
}

/// `git_push_plan` request, exactly `PublicationTarget` in types.ts.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationTarget {
    pub remote: String,
    pub source_branch: String,
    pub target_branch: String,
    pub account_id: String,
    pub auth_route: AuthRoute,
}

/// `git_push_apply` request. The plan itself is never accepted from the renderer.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationApply {
    pub plan_id: String,
    pub content_hash: String,
    pub confirmed: bool,
}

/// `git_fetch` request: reconcile this remote (read-only tracking-refs update).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationFetch {
    pub remote: String,
}

fn clean_field(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && !s.chars().any(|c| c.is_control() || c.is_whitespace())
}

/// Fail-closed input checks before any git or network work. The transport re-validates
/// everything against live git state; these checks keep nonsense off the wire early.
pub fn check_target(target: &PublicationTarget) -> RResult<()> {
    if target.auth_route != AuthRoute::GithubHttps {
        return Err(RemoteError::new(
            RemoteErrorCode::UrlRejected,
            "Only GitHub over HTTPS is supported here. SSH and Git Credential Manager are separate transport work.",
        ));
    }
    if !clean_field(&target.remote, 64)
        || !clean_field(&target.source_branch, 200)
        || !clean_field(&target.target_branch, 200)
    {
        return Err(RemoteError::new(
            RemoteErrorCode::Blocked,
            "Remote and branch names must be plain names without spaces",
        ));
    }
    let id = &target.account_id;
    let login_ok = !id.is_empty() && id.len() <= 39 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !login_ok {
        return Err(RemoteError::new(
            RemoteErrorCode::AuthRequired,
            "Select the connected GitHub account (its login)",
        ));
    }
    Ok(())
}

/// The remote name for a reconcile fetch: plain and present. Existence is checked live.
pub fn check_fetch(request: &PublicationFetch) -> RResult<()> {
    if !clean_field(&request.remote, 64) {
        return Err(RemoteError::new(RemoteErrorCode::NoRemote, "That remote name is not valid"));
    }
    Ok(())
}

// ---------------------------------------------------------------- outbound wire

/// The account the plan binds. `id` is the GitHub login: the only account handle the
/// person can know and type, and the transport already matched it against the connected
/// account. There is no numeric id anywhere in the app to compare against.
#[derive(Clone, Debug, Serialize)]
pub struct PublicationAccount {
    pub id: String,
    pub login: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoVisibility {
    Private,
    Public,
    Internal,
}

#[derive(Clone, Debug, Serialize)]
pub struct PublicationRepository {
    pub name: String,
    pub visibility: RepoVisibility,
}

#[derive(Clone, Debug, Serialize)]
pub struct PublicationCommit {
    pub sha: String,
    pub subject: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InitiatedBy {
    Human,
    Agent,
}

#[derive(Clone, Debug, Serialize)]
pub struct PublicationGrant {
    pub id: String,
    pub label: String,
}

/// `git_push_plan` reply, exactly `PublicationPlan` in types.ts.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicationPlan {
    pub plan_id: String,
    pub content_hash: String,
    pub head: String,
    pub remote_tip: Option<String>,
    pub account: PublicationAccount,
    pub auth_route: AuthRoute,
    pub repository: PublicationRepository,
    pub effective_remote_url: String,
    pub destination_validated: bool,
    pub source_branch: String,
    pub target_branch: String,
    pub commits: Vec<PublicationCommit>,
    pub untracked: Vec<String>,
    pub excluded: Vec<String>,
    pub unsaved_buffers: usize,
    pub initiated_by: InitiatedBy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grant: Option<PublicationGrant>,
}

/// `git_push_apply` reply, exactly the `PublicationOutcome` union in types.ts.
/// Typed failures resolve (the controller revokes its single-use approval); only
/// gate/transport failures reject the invoke.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind")]
pub enum PublicationOutcome {
    #[serde(rename = "published", rename_all = "camelCase")]
    Published { sha: String, remote: String, target_branch: String },
    #[serde(rename = "stale-plan")]
    StalePlan,
    #[serde(rename = "denied-protection")]
    DeniedProtection,
    #[serde(rename = "denied-SSO")]
    DeniedSso,
    #[serde(rename = "needs-auth")]
    NeedsAuth,
    #[serde(rename = "needs-workflow-scope")]
    NeedsWorkflowScope,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "uncertain-reconcile")]
    UncertainReconcile,
}

// ---------------------------------------------------------------- mapping

/// Maps a freshly computed native plan to the review view. `destination_validated` is
/// only ever produced here, after the transport resolved pushurl/insteadOf/pushInsteadOf,
/// rejected multiple URLs and rewrites, and validated the canonical HTTPS URL. `commits`
/// deliberately drops author/time: the contract shows sha and subject only.
pub fn plan_view(
    plan: &PushPlan,
    target: &PublicationTarget,
    visibility: RepoVisibility,
    untracked: Vec<String>,
    excluded: Vec<String>,
    unsaved_buffers: usize,
) -> PublicationPlan {
    PublicationPlan {
        plan_id: plan.plan_id.clone(),
        content_hash: plan.local_tree.clone(),
        head: plan.local_sha.clone(),
        remote_tip: plan.remote_tip.clone(),
        account: PublicationAccount { id: plan.account.clone(), login: plan.account.clone() },
        auth_route: target.auth_route,
        repository: PublicationRepository { name: plan.repo.clone(), visibility },
        effective_remote_url: plan.remote_url.clone(),
        destination_validated: true,
        source_branch: target.source_branch.clone(),
        target_branch: target.target_branch.clone(),
        commits: plan
            .commits
            .iter()
            .map(|c| PublicationCommit { sha: c.sha.clone(), subject: c.subject.clone() })
            .collect(),
        untracked,
        excluded,
        unsaved_buffers,
        initiated_by: InitiatedBy::Human,
        grant: None,
    }
}

fn short_ref(full: &str) -> String {
    full.strip_prefix("refs/heads/").unwrap_or(full).to_string()
}

fn rejected_outcome(reason: RemoteErrorCode) -> PublicationOutcome {
    use RemoteErrorCode as C;
    match reason {
        C::ProtectedBranch => PublicationOutcome::DeniedProtection,
        C::SsoRequired => PublicationOutcome::DeniedSso,
        C::AuthRequired => PublicationOutcome::NeedsAuth,
        C::WorkflowScopeMissing => PublicationOutcome::NeedsWorkflowScope,
        _ => PublicationOutcome::Failed,
    }
}

/// Maps a native apply result to the typed vocabulary. `published` requires the verified
/// remote read-back; a success report without verification is uncertain, never presumed
/// published. `not-published` (remote proven unchanged) is a safe `failed`: nothing
/// arrived on GitHub and the person can review again.
pub fn outcome_view(result: &PushResult, remote: &str) -> PublicationOutcome {
    match &result.outcome {
        PushOutcome::Published { verified: true, .. } => PublicationOutcome::Published {
            sha: result.local_sha.clone(),
            remote: remote.to_string(),
            target_branch: short_ref(&result.target_ref),
        },
        PushOutcome::Published { verified: false, .. } => PublicationOutcome::UncertainReconcile,
        PushOutcome::Rejected { reason, .. } => rejected_outcome(*reason),
        PushOutcome::NotPublished { .. } => PublicationOutcome::Failed,
        PushOutcome::Uncertain { .. } => PublicationOutcome::UncertainReconcile,
    }
}

/// Maps an apply-time transport error (stale plan, blocked publish, missing authority).
/// Only typed classes reach the renderer; anything else is a plain `failed`.
pub fn error_outcome(e: &RemoteError) -> PublicationOutcome {
    use RemoteErrorCode as C;
    match e.code {
        C::StalePlan => PublicationOutcome::StalePlan,
        C::ProtectedBranch => PublicationOutcome::DeniedProtection,
        C::SsoRequired => PublicationOutcome::DeniedSso,
        C::AuthRequired => PublicationOutcome::NeedsAuth,
        C::WorkflowScopeMissing => PublicationOutcome::NeedsWorkflowScope,
        _ => PublicationOutcome::Failed,
    }
}

// ---------------------------------------------------------------- reviewed-plan registry

/// A plan the person reviewed, held natively until its single-use apply. Binds the exact
/// plan inputs and the reviewed tree (exact-content check); the transport re-derives
/// everything else live, including a fresh remote observation.
#[derive(Debug)]
pub struct ReviewedPublication {
    pub request: PushPlanRequest,
    pub content_hash: String,
    created: Instant,
}

#[derive(Debug)]
pub enum Take {
    Ready(ReviewedPublication),
    /// Unknown, expired or content-mismatched plan: the apply surfaces `stale-plan`.
    Stale,
}

/// Host state, one per app. Bounded and expiring; plans are consumed by apply.
#[derive(Default)]
pub struct PublicationRegistry {
    entries: BTreeMap<String, ReviewedPublication>,
}

impl PublicationRegistry {
    pub fn put(&mut self, request: PushPlanRequest, plan_id: &str, content_hash: &str) {
        self.expire();
        if !self.entries.contains_key(plan_id) && self.entries.len() >= REGISTRY_CAP {
            let oldest = self.entries.iter().max_by_key(|(_, p)| p.created.elapsed()).map(|(k, _)| k.clone());
            if let Some(oldest) = oldest {
                self.entries.remove(&oldest);
            }
        }
        self.entries.insert(
            plan_id.to_string(),
            ReviewedPublication { request, content_hash: content_hash.to_string(), created: Instant::now() },
        );
    }

    /// Single-use: a taken plan is gone whatever the apply outcome is. No re-apply, ever.
    pub fn take(&mut self, plan_id: &str, content_hash: &str) -> Take {
        self.expire();
        match self.entries.remove(plan_id) {
            Some(p) if p.created.elapsed() <= REGISTRY_TTL && p.content_hash == content_hash => Take::Ready(p),
            _ => Take::Stale,
        }
    }

    fn expire(&mut self) {
        self.entries.retain(|_, p| p.created.elapsed() <= REGISTRY_TTL);
    }
}

// ---------------------------------------------------------------- local listings

fn gr(root: &Path, args: &[&str]) -> RResult<GitOutput> {
    let argv: Vec<&OsStr> = args.iter().map(OsStr::new).collect();
    Ok(run_git(root, &argv, Mode::Read, READ_TIMEOUT, None, &[])?)
}

fn list_z(out: &GitOutput) -> RResult<Vec<String>> {
    if out.code != Some(0) {
        return Err(RemoteError::detail(RemoteErrorCode::Unknown, "Could not list local files", out.stderr.clone()));
    }
    let mut paths: Vec<String> = out
        .stdout
        .split(|b| *b == 0)
        .filter(|s| !s.is_empty())
        .take(MAX_LISTED_PATHS + 1)
        .map(|s| String::from_utf8_lossy(s).into_owned())
        .collect();
    paths.truncate(MAX_LISTED_PATHS);
    Ok(paths)
}

/// Untracked, not ignored working-tree paths. Informational: they are not published.
pub fn local_untracked(root: &Path) -> RResult<Vec<String>> {
    list_z(&gr(root, &["ls-files", "--others", "--exclude-standard", "-z"])?)
}

/// Ignored working-tree paths (`.gitignore` et al). Informational: excluded files can
/// never be published while they are excluded, and the review says so.
pub fn local_excluded(root: &Path) -> RResult<Vec<String>> {
    list_z(&gr(root, &["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])?)
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use crate::git::remote::push::{PlanCommit, PushRelation, PushStatus};
    use super::*;

    fn target() -> PublicationTarget {
        PublicationTarget {
            remote: "origin".into(),
            source_branch: "feature/hero".into(),
            target_branch: "main".into(),
            account_id: "philppplik".into(),
            auth_route: AuthRoute::GithubHttps,
        }
    }

    fn native_plan() -> PushPlan {
        PushPlan {
            plan_id: "plan-1".into(),
            status: PushStatus::Ready,
            relation: PushRelation::FastForward,
            blocked_code: None,
            blocked_message: None,
            remote: "origin".into(),
            remote_url: "https://github.com/philppplik/demo.git".into(),
            repo: "philppplik/demo".into(),
            account: "philppplik".into(),
            local_ref: "refs/heads/feature/hero".into(),
            local_sha: "a".repeat(40),
            local_tree: "tree-1".into(),
            target_ref: "refs/heads/main".into(),
            remote_tip: Some("b".repeat(40)),
            commits: vec![PlanCommit { sha: "a".repeat(40), author: "P".into(), time: 1, subject: "Fix hero".into() }],
            commits_total: 1,
            files: vec![],
            files_total: 0,
            touches_workflows: false,
            large_files: vec![],
            uncommitted_files: 0,
            set_upstream: false,
            warnings: vec![],
            summary: "Publish 1 new version".into(),
            recovery: "revert".into(),
        }
    }

    fn view() -> PublicationPlan {
        plan_view(&native_plan(), &target(), RepoVisibility::Private, vec!["draft.txt".into()], vec![".env".into()], 0)
    }

    #[test]
    fn plan_wire_matches_the_ts_contract() {
        let v = serde_json::to_value(view()).unwrap();
        let expected = serde_json::json!({
            "planId": "plan-1",
            "contentHash": "tree-1",
            "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "remoteTip": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "account": {"id": "philppplik", "login": "philppplik"},
            "authRoute": "github-https",
            "repository": {"name": "philppplik/demo", "visibility": "private"},
            "effectiveRemoteUrl": "https://github.com/philppplik/demo.git",
            "destinationValidated": true,
            "sourceBranch": "feature/hero",
            "targetBranch": "main",
            "commits": [{"sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "subject": "Fix hero"}],
            "untracked": ["draft.txt"],
            "excluded": [".env"],
            "unsavedBuffers": 0,
            "initiatedBy": "human"
        });
        assert_eq!(v, expected, "wire drift against src/lib/git/publication/types.ts");
    }

    #[test]
    fn outcome_kinds_match_the_ts_union_exactly() {
        let cases: Vec<(PublicationOutcome, serde_json::Value)> = vec![
            (
                PublicationOutcome::Published { sha: "s".into(), remote: "origin".into(), target_branch: "main".into() },
                serde_json::json!({"kind":"published","sha":"s","remote":"origin","targetBranch":"main"}),
            ),
            (PublicationOutcome::StalePlan, serde_json::json!({"kind":"stale-plan"})),
            (PublicationOutcome::DeniedProtection, serde_json::json!({"kind":"denied-protection"})),
            (PublicationOutcome::DeniedSso, serde_json::json!({"kind":"denied-SSO"})),
            (PublicationOutcome::NeedsAuth, serde_json::json!({"kind":"needs-auth"})),
            (PublicationOutcome::NeedsWorkflowScope, serde_json::json!({"kind":"needs-workflow-scope"})),
            (PublicationOutcome::Failed, serde_json::json!({"kind":"failed"})),
            (PublicationOutcome::UncertainReconcile, serde_json::json!({"kind":"uncertain-reconcile"})),
        ];
        for (outcome, json) in cases {
            assert_eq!(serde_json::to_value(&outcome).unwrap(), json);
        }
    }

    #[test]
    fn inbound_wire_rejects_unknown_fields_and_parses_the_contract() {
        let apply: PublicationApply =
            serde_json::from_str(r#"{"planId":"p1","contentHash":"tree1","confirmed":true}"#).unwrap();
        assert!(apply.confirmed && apply.plan_id == "p1" && apply.content_hash == "tree1");
        assert!(
            serde_json::from_str::<PublicationApply>(r#"{"planId":"p1","contentHash":"tree1","confirmed":true,"token":"x"}"#).is_err(),
            "unknown fields never ride along"
        );
        assert!(serde_json::from_str::<PublicationApply>(r#"{"plan_id":"p1","content_hash":"tree1","confirmed":true}"#).is_err());
        let t: PublicationTarget = serde_json::from_str(
            r#"{"remote":"origin","sourceBranch":"a","targetBranch":"b","accountId":"me","authRoute":"github-https"}"#,
        )
        .unwrap();
        assert_eq!(t.auth_route, AuthRoute::GithubHttps);
        let ssh: PublicationTarget = serde_json::from_str(
            r#"{"remote":"origin","sourceBranch":"a","targetBranch":"b","accountId":"me","authRoute":"ssh"}"#,
        )
        .unwrap();
        assert_eq!(ssh.auth_route, AuthRoute::Ssh);
        assert!(serde_json::from_str::<PublicationFetch>(r#"{"remote":"origin","helper":"x"}"#).is_err());
    }

    #[test]
    fn ssh_and_gcm_fail_closed() {
        for route in [AuthRoute::Ssh, AuthRoute::Gcm] {
            let mut t = target();
            t.auth_route = route;
            let e = check_target(&t).err().expect("rejected");
            assert_eq!(e.code, RemoteErrorCode::UrlRejected);
        }
        assert!(check_target(&target()).is_ok());
        let mut bad = target();
        bad.account_id = "not a login".into();
        assert_eq!(check_target(&bad).err().unwrap().code, RemoteErrorCode::AuthRequired);
        let mut blank = target();
        blank.source_branch = String::new();
        assert_eq!(check_target(&blank).err().unwrap().code, RemoteErrorCode::Blocked);
        assert!(check_fetch(&PublicationFetch { remote: "origin".into() }).is_ok());
        assert_eq!(
            check_fetch(&PublicationFetch { remote: "up stream".into() }).err().unwrap().code,
            RemoteErrorCode::NoRemote
        );
    }

    #[test]
    fn wire_json_never_carries_credential_material() {
        let mut blob = serde_json::to_string(&view()).unwrap();
        for outcome in [
            outcome_view(
                &PushResult {
                    outcome: PushOutcome::Uncertain { reason: RemoteErrorCode::Offline, message: "m".into() },
                    job_outcome: crate::git::remote::JobOutcome::Uncertain,
                    local_sha: String::new(),
                    target_ref: String::new(),
                    remote_url: String::new(),
                    remote_tip_before: None,
                    remote_tip_after: None,
                    warnings: vec![],
                    recovery: String::new(),
                },
                "origin",
            ),
            PublicationOutcome::NeedsAuth,
        ] {
            blob.push_str(&serde_json::to_string(&outcome).unwrap());
        }
        let low = blob.to_ascii_lowercase();
        for needle in ["token", "password", "secret", "authorization", "bearer", "credential"] {
            assert!(!low.contains(needle), "wire carries {needle}: {blob}");
        }
    }

    fn push_result(outcome: PushOutcome) -> PushResult {
        PushResult {
            outcome,
            job_outcome: crate::git::remote::JobOutcome::Failed,
            local_sha: "a".repeat(40),
            target_ref: "refs/heads/main".into(),
            remote_url: "https://github.com/philppplik/demo.git".into(),
            remote_tip_before: None,
            remote_tip_after: None,
            warnings: vec![],
            recovery: String::new(),
        }
    }

    #[test]
    fn unverified_success_is_uncertain_never_published() {
        let mut result = push_result(PushOutcome::Published { verified: false, reconciled: false });
        assert_eq!(outcome_view(&result, "origin"), PublicationOutcome::UncertainReconcile);
        result.outcome = PushOutcome::Published { verified: true, reconciled: false };
        assert_eq!(
            outcome_view(&result, "origin"),
            PublicationOutcome::Published { sha: "a".repeat(40), remote: "origin".into(), target_branch: "main".into() }
        );
    }

    #[test]
    fn rejected_reasons_and_errors_map_to_typed_outcomes() {
        use RemoteErrorCode as C;
        let cases: Vec<(C, PublicationOutcome)> = vec![
            (C::ProtectedBranch, PublicationOutcome::DeniedProtection),
            (C::SsoRequired, PublicationOutcome::DeniedSso),
            (C::AuthRequired, PublicationOutcome::NeedsAuth),
            (C::WorkflowScopeMissing, PublicationOutcome::NeedsWorkflowScope),
            (C::NonFastForward, PublicationOutcome::Failed),
            (C::PermissionDenied, PublicationOutcome::Failed),
        ];
        for (reason, want) in cases {
            let result = push_result(PushOutcome::Rejected { reason, message: String::new() });
            assert_eq!(outcome_view(&result, "origin"), want, "rejected {reason:?}");
        }
        let not_published = push_result(PushOutcome::NotPublished { reason: C::Cancelled, message: String::new() });
        assert_eq!(outcome_view(&not_published, "origin"), PublicationOutcome::Failed);
        let uncertain = push_result(PushOutcome::Uncertain { reason: C::Offline, message: String::new() });
        assert_eq!(outcome_view(&uncertain, "origin"), PublicationOutcome::UncertainReconcile);

        let err_cases: Vec<(C, PublicationOutcome)> = vec![
            (C::StalePlan, PublicationOutcome::StalePlan),
            (C::ProtectedBranch, PublicationOutcome::DeniedProtection),
            (C::SsoRequired, PublicationOutcome::DeniedSso),
            (C::AuthRequired, PublicationOutcome::NeedsAuth),
            (C::WorkflowScopeMissing, PublicationOutcome::NeedsWorkflowScope),
            (C::NonFastForward, PublicationOutcome::Failed),
            (C::ReviewRequired, PublicationOutcome::Failed),
            (C::Io, PublicationOutcome::Failed),
        ];
        for (code, want) in err_cases {
            assert_eq!(error_outcome(&RemoteError::new(code, "x")), want, "error {code:?}");
        }
    }

    fn plan_request() -> PushPlanRequest {
        PushPlanRequest {
            project_root: "/repo".into(),
            remote: Some("origin".into()),
            local_branch: "feature/hero".into(),
            target_branch: Some("main".into()),
            set_upstream: false,
        }
    }

    #[test]
    fn registry_is_single_use_and_binds_the_reviewed_tree() {
        let mut r = PublicationRegistry::default();
        r.put(plan_request(), "p1", "tree-1");
        assert!(matches!(r.take("p1", "wrong-tree"), Take::Stale), "content mismatch is stale");
        r.put(plan_request(), "p1", "tree-1");
        let first = r.take("p1", "tree-1");
        assert!(matches!(first, Take::Ready(_)), "exact plan applies once");
        if let Take::Ready(p) = first {
            assert_eq!(p.request.local_branch, "feature/hero");
            assert_eq!(p.content_hash, "tree-1");
        }
        assert!(matches!(r.take("p1", "tree-1"), Take::Stale), "no re-apply, ever");
        assert!(matches!(r.take("never-seen", "tree-1"), Take::Stale));
    }

    #[test]
    fn registry_is_bounded() {
        let mut r = PublicationRegistry::default();
        for i in 0..(super::REGISTRY_CAP + 4) {
            r.put(plan_request(), &format!("p{i}"), "tree");
        }
        let mut ready = 0;
        for i in 0..(super::REGISTRY_CAP + 4) {
            if matches!(r.take(&format!("p{i}"), "tree"), Take::Ready(_)) {
                ready += 1;
            }
        }
        assert_eq!(ready, super::REGISTRY_CAP, "only the newest plans survive");
    }
}
