//! `git_push_plan` / `git_push_apply` / reconcile. Explicit refs, never force, never tags.
//! The plan observes the remote tip (network read). Apply recomputes everything, including
//! a fresh remote observation, and pushes the exact reviewed commit SHA.

use super::*;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushPlanRequest {
    pub project_root: String,
    #[serde(default)]
    pub remote: Option<String>,
    /// Local variant (branch) short name. Always explicit.
    pub local_branch: String,
    /// Target branch short name on GitHub. Defaults to `local_branch`.
    #[serde(default)]
    pub target_branch: Option<String>,
    /// After a verified publish, make the remote branch this variant's upstream.
    #[serde(default)]
    pub set_upstream: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PushStatus {
    Ready,
    /// Remote already has exactly this version.
    UpToDate,
    Blocked,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PushRelation {
    /// The branch does not exist on GitHub yet.
    Create,
    FastForward,
    UpToDate,
    /// Remote has versions this project lacks (or both diverged).
    NonFastForward,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushPlan {
    pub plan_id: String,
    pub status: PushStatus,
    pub relation: PushRelation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_code: Option<RemoteErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_message: Option<String>,
    pub remote: String,
    /// Validated effective push URL, token-free.
    pub remote_url: String,
    pub repo: String,
    pub account: String,
    pub local_ref: String,
    pub local_sha: String,
    pub local_tree: String,
    pub target_ref: String,
    /// Remote tip seen while planning. `None` = branch absent.
    pub remote_tip: Option<String>,
    pub commits: Vec<PlanCommit>,
    pub commits_total: usize,
    pub files: Vec<PlanFile>,
    pub files_total: usize,
    pub touches_workflows: bool,
    pub large_files: Vec<LargeFile>,
    pub uncommitted_files: usize,
    pub set_upstream: bool,
    pub warnings: Vec<String>,
    pub summary: String,
    pub recovery: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushApplyRequest {
    pub request: PushPlanRequest,
    pub plan_id: String,
    pub authority: Authority,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PushOutcome {
    /// The remote ref now equals the pushed commit. `reconciled`: found by checking after an interruption.
    #[serde(rename_all = "camelCase")]
    Published { verified: bool, reconciled: bool },
    /// GitHub refused. `reason` says why (protection, SSO, auth, permission, workflow scope, non-FF...).
    #[serde(rename_all = "camelCase")]
    Rejected { reason: RemoteErrorCode, message: String },
    /// Verified: the remote ref is unchanged.
    #[serde(rename_all = "camelCase")]
    NotPublished { reason: RemoteErrorCode, message: String },
    /// Interrupted and the remote could not be checked. Reconcile before retrying.
    #[serde(rename_all = "camelCase")]
    Uncertain { reason: RemoteErrorCode, message: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub outcome: PushOutcome,
    pub job_outcome: JobOutcome,
    pub local_sha: String,
    pub target_ref: String,
    pub remote_url: String,
    pub remote_tip_before: Option<String>,
    pub remote_tip_after: Option<String>,
    pub warnings: Vec<String>,
    pub recovery: String,
}

const WARN_FILE: u64 = 50 * 1024 * 1024;
const BLOCK_FILE: u64 = 100 * 1024 * 1024;
const MAX_OBJECTS: usize = 200_000;

struct Computed {
    plan: PushPlan,
    ctx: RepoCtx,
    remote: ParsedRemote,
    lease: Box<dyn CredentialLease>,
}

fn compute(env: &RemoteEnv, req: &PushPlanRequest) -> RResult<Computed> {
    let ctx = repo_ctx(env, Path::new(&req.project_root))?;
    let root = ctx.root.clone();
    valid_branch(&root, &req.local_branch)?;
    let target_branch = req.target_branch.clone().unwrap_or_else(|| req.local_branch.clone());
    valid_branch(&root, &target_branch)?;
    let local_ref = format!("refs/heads/{}", req.local_branch);
    let target_ref = format!("refs/heads/{target_branch}");
    let local_sha = sha_of(&root, &local_ref)?.ok_or_else(|| RemoteError::new(RemoteErrorCode::Blocked, "That variant has no versions to publish"))?;
    let local_tree = tree_of(&root, &local_sha)?;
    let name = resolve_remote(&root, Some(&req.local_branch), req.remote.as_deref())?;
    let remote = effective_remote(env, &root, &name, true)?;
    let lease = acquire_lease(env, &remote, LeasePurpose::Write)?;

    let tip = observe_remote_ref(env, &root, &remote, lease.as_ref(), &target_ref, true)?;
    let mut blocked: Option<(RemoteErrorCode, String)> = None;
    let mut warnings: Vec<String> = Vec::new();

    let relation = match &tip {
        None => PushRelation::Create,
        Some(t) if *t == local_sha => PushRelation::UpToDate,
        Some(t) => {
            let known = sha_of(&root, t)?.is_some();
            if !known {
                PushRelation::NonFastForward
            } else {
                let anc = gr(&root, &["merge-base", "--is-ancestor", t, &local_sha])?;
                if anc.code == Some(0) {
                    PushRelation::FastForward
                } else {
                    PushRelation::NonFastForward
                }
            }
        }
    };
    if relation == PushRelation::NonFastForward {
        blocked = Some((RemoteErrorCode::NonFastForward, friendly(RemoteErrorCode::NonFastForward).to_string()));
    }

    // Commits and files that would be published.
    let not_arg: Vec<String> = match (&tip, relation) {
        (Some(t), PushRelation::FastForward) => vec![t.clone()],
        _ => vec![],
    };
    let remotes_glob = format!("--remotes={name}");
    let (commits, commits_total, files, files_total, obj_paths, objects): (Vec<PlanCommit>, usize, Vec<PlanFile>, usize, Vec<(String, String)>, Vec<String>);
    if relation == PushRelation::UpToDate || relation == PushRelation::NonFastForward {
        commits = vec![];
        commits_total = 0;
        files = vec![];
        files_total = 0;
        obj_paths = vec![];
        objects = vec![];
    } else {
        let mut range: Vec<&str> = vec![&local_sha, "--not"];
        match not_arg.first() {
            Some(t) => range.push(t),
            None => range.push(&remotes_glob),
        }
        let (c, t) = plan_commits(&root, &range)?;
        commits = c;
        commits_total = t;
        // Files: against the remote tip, else the merge base with a known remote branch, else the empty tree.
        let base: String = match &tip {
            Some(t) => t.clone(),
            None => {
                let mut found = None;
                let refs = text(&gr_ok(&root, &["for-each-ref", "--format=%(refname)", "--count=20", &format!("refs/remotes/{name}/")])?);
                for r in refs.lines() {
                    let mb = gr(&root, &["merge-base", &local_sha, r])?;
                    if mb.code == Some(0) {
                        found = Some(text(&mb));
                        break;
                    }
                }
                found.unwrap_or_else(|| empty_tree().to_string())
            }
        };
        let all = changed_files(&root, &base, &local_sha)?;
        files_total = all.len();
        files = all.into_iter().take(MAX_PLAN_FILES).collect();
        // Objects for the workflow and size checks.
        let mut oargs = vec!["rev-list", "--objects", &local_sha as &str, "--not"];
        match not_arg.first() {
            Some(t) => oargs.push(t),
            None => oargs.push(&remotes_glob),
        }
        let ol = gr(&root, &oargs)?;
        let mut paths = Vec::new();
        let mut shas = Vec::new();
        if ol.code == Some(0) {
            for line in String::from_utf8_lossy(&ol.stdout).lines().take(MAX_OBJECTS + 1) {
                let (sha, path) = line.split_once(' ').unwrap_or((line, ""));
                shas.push(sha.to_string());
                if !path.is_empty() {
                    paths.push((sha.to_string(), path.to_string()));
                }
            }
        }
        if shas.len() > MAX_OBJECTS {
            warnings.push("This publish is very large. The file-size check was skipped.".into());
            shas.clear();
        } else if ol.code != Some(0) {
            warnings.push("The file-size check could not run.".into());
        }
        obj_paths = paths;
        objects = shas;
    }
    let touches_workflows = obj_paths.iter().any(|(_, p)| p.starts_with(".github/workflows/"));
    let mut large: Vec<LargeFile> = Vec::new();
    if !objects.is_empty() {
        let input = objects.join("\n") + "\n";
        let r = gr_stdin(&root, &["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], input.as_bytes())?;
        if r.code == Some(0) {
            let path_of: std::collections::HashMap<&str, &str> = obj_paths.iter().map(|(s, p)| (s.as_str(), p.as_str())).collect();
            for l in String::from_utf8_lossy(&r.stdout).lines() {
                let f: Vec<&str> = l.split(' ').collect();
                if f.len() == 3 && f[1] == "blob" {
                    if let Ok(sz) = f[2].parse::<u64>() {
                        if sz >= WARN_FILE {
                            large.push(LargeFile { path: path_of.get(f[0]).copied().unwrap_or("?").to_string(), bytes: sz });
                        }
                    }
                }
            }
        } else {
            warnings.push("The file-size check could not run.".into());
        }
    }
    if large.iter().any(|l| l.bytes >= BLOCK_FILE) && blocked.is_none() {
        blocked = Some((RemoteErrorCode::TooLarge, "A file is larger than 100 MB, which GitHub rejects. Remove it from the versions first.".into()));
    } else if !large.is_empty() {
        warnings.push("Some files are over 50 MB. GitHub warns about files this large.".into());
    }

    // Scopes.
    let scopes: Vec<String> = lease.scopes().to_vec();
    if scopes.is_empty() {
        if touches_workflows {
            warnings.push("These versions change GitHub Actions files. Whether this sign-in may do that is unknown until GitHub answers.".into());
        }
    } else if touches_workflows && !scopes.iter().any(|s| s == "workflow") && blocked.is_none() {
        blocked = Some((RemoteErrorCode::WorkflowScopeMissing, friendly(RemoteErrorCode::WorkflowScopeMissing).to_string()));
    }
    if !scopes.is_empty() && !scopes.iter().any(|s| s == "repo" || s == "public_repo") && blocked.is_none() {
        blocked = Some((RemoteErrorCode::PermissionDenied, "This GitHub sign-in has no permission to publish. Reconnect GitHub.".into()));
    }

    let uncommitted = if ctx.info.branch.as_deref() == Some(req.local_branch.as_str()) { local_change_paths(&root)?.len() } else { 0 };
    if uncommitted > 0 {
        warnings.push(format!("{uncommitted} changed file(s) are not saved as a version and will not be published."));
    }

    let status = if blocked.is_some() {
        PushStatus::Blocked
    } else if relation == PushRelation::UpToDate {
        PushStatus::UpToDate
    } else {
        PushStatus::Ready
    };
    let repo = remote.repo_path();
    let summary = match (status, relation) {
        (PushStatus::UpToDate, _) => format!("GitHub already has this version of {target_branch}."),
        (PushStatus::Blocked, _) => blocked.as_ref().map(|b| b.1.clone()).unwrap_or_default(),
        (_, PushRelation::Create) => format!("Publish {commits_total} version(s) as a new branch {target_branch} on {repo}."),
        _ => format!("Publish {commits_total} new version(s) to {target_branch} on {repo}. Nothing is overwritten or rewritten."),
    };
    let mut sc = scopes.clone();
    sc.sort();
    let ids = [
        root.to_string_lossy().to_string(),
        name.clone(),
        remote.canonical.clone(),
        lease.account_login().to_string(),
        local_ref.clone(),
        local_sha.clone(),
        local_tree.clone(),
        target_ref.clone(),
        tip.clone().unwrap_or_else(|| "none".into()),
        format!("{relation:?}"),
        touches_workflows.to_string(),
        sc.join(","),
        large.iter().filter(|l| l.bytes >= BLOCK_FILE).count().to_string(),
        req.set_upstream.to_string(),
    ];
    let id_refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
    let plan_id = plan_hash("push", &id_refs);
    let plan = PushPlan {
        plan_id,
        status,
        relation,
        blocked_code: blocked.as_ref().map(|b| b.0),
        blocked_message: blocked.as_ref().map(|b| b.1.clone()),
        remote: name,
        remote_url: remote.canonical.clone(),
        repo,
        account: lease.account_login().to_string(),
        local_ref,
        local_sha,
        local_tree,
        target_ref,
        remote_tip: tip,
        commits,
        commits_total,
        files,
        files_total,
        touches_workflows,
        large_files: large,
        uncommitted_files: uncommitted,
        set_upstream: req.set_upstream,
        warnings,
        summary,
        recovery: "A published version is reverted by publishing a new revert version. GitHub history is never rewritten.".into(),
    };
    Ok(Computed { plan, ctx, remote, lease })
}

/// `git_push_plan`: observes the remote tip (network read, cancellable). No write anywhere.
pub fn push_plan(env: &RemoteEnv, req: &PushPlanRequest) -> RResult<PushPlan> {
    compute(env, req).map(|c| c.plan)
}

fn job_outcome_for(o: &PushOutcome) -> JobOutcome {
    use RemoteErrorCode as C;
    match o {
        PushOutcome::Published { .. } => JobOutcome::Success,
        PushOutcome::Rejected { reason, .. } => match reason {
            C::AuthRequired | C::SsoRequired | C::WorkflowScopeMissing => JobOutcome::NeedsInput,
            _ => JobOutcome::Failed,
        },
        PushOutcome::NotPublished { .. } => JobOutcome::Failed,
        PushOutcome::Uncertain { .. } => JobOutcome::Uncertain,
    }
}

enum Recon {
    Published,
    Unchanged,
    Moved,
    Unknown(RemoteError),
}

fn reconcile_tip(env: &RemoteEnv, root: &Path, remote: &ParsedRemote, lease: &dyn CredentialLease, target_ref: &str, sha: &str, prior: &Option<String>) -> Recon {
    if lease.is_expired() {
        return Recon::Unknown(RemoteError::new(RemoteErrorCode::AuthRequired, friendly(RemoteErrorCode::AuthRequired)));
    }
    match observe_remote_ref(env, root, remote, lease, target_ref, false) {
        Ok(t) if t.as_deref() == Some(sha) => Recon::Published,
        Ok(t) if t == *prior => Recon::Unchanged,
        Ok(_) => Recon::Moved,
        Err(e) => Recon::Unknown(e),
    }
}

/// Porcelain: `<flag>\t<from>:<to>\t<summary>`; returns the flag of the line for `target_ref`.
fn porcelain_flag(stdout: &[u8], target_ref: &str) -> Option<(char, String)> {
    for line in String::from_utf8_lossy(stdout).lines() {
        let mut it = line.splitn(3, '\t');
        let (flag, refs, summary) = (it.next()?, it.next(), it.next().unwrap_or(""));
        if flag.chars().count() == 1 {
            if let Some(r) = refs {
                if r.ends_with(&format!(":{target_ref}")) {
                    return Some((flag.chars().next().unwrap(), summary.to_string()));
                }
            }
        }
    }
    None
}

/// `git_push_apply`: pushes the reviewed commit SHA to the reviewed ref, then verifies or reconciles.
pub fn push_apply(env: &RemoteEnv, req: &PushApplyRequest) -> RResult<PushResult> {
    let ctx0 = repo_ctx(env, Path::new(&req.request.project_root))?;
    let _lock = RepoLock::acquire(&ctx0.root)?;
    let c = compute(env, &req.request)?;
    let plan = &c.plan;
    if plan.plan_id != req.plan_id {
        return Err(RemoteError::detail(RemoteErrorCode::StalePlan, "Something changed since you reviewed this publish (your versions, GitHub, or the sign-in). Review it again", "plan-id-mismatch"));
    }
    check_authority(env, &req.authority, GrantAction::PushApply, &plan.plan_id)?;
    match plan.status {
        PushStatus::Ready => {}
        PushStatus::UpToDate => return Err(RemoteError::detail(RemoteErrorCode::Blocked, "GitHub already has this version", "nothing-to-apply")),
        PushStatus::Blocked => {
            let code = plan.blocked_code.unwrap_or(RemoteErrorCode::Blocked);
            return Err(RemoteError::new(code, plan.blocked_message.clone().unwrap_or_else(|| friendly(code).to_string())));
        }
    }
    let root = &c.ctx.root;
    let refspec = format!("{}:{}", plan.local_sha, plan.target_ref);
    let args: Vec<OsString> = ["push", "--porcelain", "--progress", "--no-follow-tags", "--recurse-submodules=no", "--", c.remote.canonical.as_str(), refspec.as_str()]
        .iter()
        .map(OsString::from)
        .collect();
    let out = net::run_net(root, env.policy, &args, Some(c.lease.as_ref()), env.net, PUSH_TIMEOUT, "Publishing")?;

    let mut warnings = plan.warnings.clone();
    let flag = porcelain_flag(&out.stdout, &plan.target_ref);
    let success_flag = matches!(flag, Some((' ', _)) | Some(('*', _)) | Some(('=', _)));
    let mk = |outcome: PushOutcome, after: Option<String>, warnings: Vec<String>| PushResult {
        job_outcome: job_outcome_for(&outcome),
        recovery: match &outcome {
            PushOutcome::Published { .. } => plan.recovery.clone(),
            PushOutcome::NotPublished { .. } | PushOutcome::Rejected { .. } => "Nothing changed on GitHub. Your versions are untouched.".into(),
            PushOutcome::Uncertain { .. } => "Check GitHub for updates, then publish again. Do not retry blindly.".into(),
        },
        outcome,
        local_sha: plan.local_sha.clone(),
        target_ref: plan.target_ref.clone(),
        remote_url: plan.remote_url.clone(),
        remote_tip_before: plan.remote_tip.clone(),
        remote_tip_after: after,
        warnings,
    };

    if out.code == Some(0) && success_flag && !out.cancelled && !out.timed_out {
        // Verify: the remote ref must equal what was pushed.
        let verified = matches!(observe_remote_ref(env, root, &c.remote, c.lease.as_ref(), &plan.target_ref, false), Ok(Some(ref t)) if *t == plan.local_sha);
        local_followup(root, plan, &mut warnings);
        let after = if verified { Some(plan.local_sha.clone()) } else { None };
        return Ok(mk(PushOutcome::Published { verified, reconciled: false }, after, warnings));
    }

    // Definitive refusals from GitHub: ref unchanged.
    let mut blob = out.stderr.clone();
    if let Some((_, summary)) = &flag {
        blob.push('\n');
        blob.push_str(summary);
    }
    let code = if out.cancelled {
        RemoteErrorCode::Cancelled
    } else if out.timed_out {
        RemoteErrorCode::Timeout
    } else {
        classify_transport(&blob)
    };
    use RemoteErrorCode as C;
    let definitive = matches!(code, C::AuthRequired | C::SsoRequired | C::PermissionDenied | C::ProtectedBranch | C::WorkflowScopeMissing | C::NonFastForward | C::NotFound | C::RemoteRejected);
    if definitive {
        let mut m = friendly(code).to_string();
        if code == C::RemoteRejected {
            m = "GitHub rejected the push.".into();
        }
        return Ok(mk(PushOutcome::Rejected { reason: code, message: m }, plan.remote_tip.clone(), warnings));
    }
    // Cancel, timeout, offline, anything unclear: ask the remote what happened.
    let reason_msg = friendly(code).to_string();
    match reconcile_tip(env, root, &c.remote, c.lease.as_ref(), &plan.target_ref, &plan.local_sha, &plan.remote_tip) {
        Recon::Published => {
            local_followup(root, plan, &mut warnings);
            warnings.push("The push was interrupted but GitHub has the version.".into());
            Ok(mk(PushOutcome::Published { verified: true, reconciled: true }, Some(plan.local_sha.clone()), warnings))
        }
        Recon::Unchanged => Ok(mk(PushOutcome::NotPublished { reason: code, message: reason_msg }, plan.remote_tip.clone(), warnings)),
        Recon::Moved => Ok(mk(
            PushOutcome::Uncertain { reason: code, message: "GitHub changed while publishing and it is unclear whether this version arrived. Check for updates first.".into() },
            None,
            warnings,
        )),
        Recon::Unknown(e) => Ok(mk(
            PushOutcome::Uncertain { reason: code, message: format!("It is unclear whether the version arrived ({}). Check for updates first.", e.message) },
            None,
            warnings,
        )),
    }
}

/// After a verified publish: refresh the remote-tracking ref and optionally set the upstream.
fn local_followup(root: &Path, plan: &PushPlan, warnings: &mut Vec<String>) {
    let Some(short) = plan.target_ref.strip_prefix("refs/heads/") else { return };
    let want = format!("+refs/heads/*:refs/remotes/{}/*", plan.remote);
    let covered = gr(root, &["config", "--local", "--get-all", &format!("remote.{}.fetch", plan.remote)])
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().any(|l| l.trim() == want))
        .unwrap_or(false);
    if !covered {
        return;
    }
    let tracking = format!("refs/remotes/{}/{short}", plan.remote);
    if gw(root, &["update-ref", &tracking, &plan.local_sha]).is_err() {
        warnings.push("Published, but the local record of GitHub could not be refreshed. Check for updates.".into());
        return;
    }
    if plan.set_upstream {
        let up = format!("{}/{short}", plan.remote);
        let branch = plan.local_ref.strip_prefix("refs/heads/").unwrap_or("");
        if gw(root, &["branch", &format!("--set-upstream-to={up}"), branch]).is_err() {
            warnings.push("Published, but the upstream could not be set.".into());
        }
    }
}

// ---------------------------------------------------------------- reconcile endpoint

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushReconcileRequest {
    pub request: PushPlanRequest,
    /// The commit that was being pushed (from the plan or result).
    pub expected_sha: String,
    /// Remote tip before the push (plan `remoteTip`), so "unchanged" can be proven.
    #[serde(default)]
    pub previous_remote_tip: Option<String>,
}

/// Resolves an `uncertain` outcome by reading the remote ref. Read-only.
pub fn push_reconcile(env: &RemoteEnv, req: &PushReconcileRequest) -> RResult<PushOutcome> {
    let ctx = repo_ctx(env, Path::new(&req.request.project_root))?;
    let target_branch = req.request.target_branch.clone().unwrap_or_else(|| req.request.local_branch.clone());
    valid_branch(&ctx.root, &target_branch)?;
    if req.expected_sha.len() < 40 || !req.expected_sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(RemoteError::new(RemoteErrorCode::Blocked, "That version id is not valid"));
    }
    let name = resolve_remote(&ctx.root, Some(&req.request.local_branch), req.request.remote.as_deref())?;
    let remote = effective_remote(env, &ctx.root, &name, true)?;
    let lease = acquire_lease(env, &remote, LeasePurpose::Read)?;
    let target_ref = format!("refs/heads/{target_branch}");
    Ok(match reconcile_tip(env, &ctx.root, &remote, lease.as_ref(), &target_ref, &req.expected_sha, &req.previous_remote_tip) {
        Recon::Published => PushOutcome::Published { verified: true, reconciled: true },
        Recon::Unchanged => PushOutcome::NotPublished { reason: RemoteErrorCode::Unknown, message: "GitHub does not have this version. Nothing changed there.".into() },
        Recon::Moved => PushOutcome::Uncertain { reason: RemoteErrorCode::Unknown, message: "GitHub has other changes on this branch. Check for updates first.".into() },
        Recon::Unknown(e) => PushOutcome::Uncertain { reason: e.code, message: e.message },
    })
}
