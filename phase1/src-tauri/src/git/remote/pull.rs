//! `git_pull_plan` / `git_pull_apply`. Fast-forward only. The plan reads local state (run a
//! fetch first); apply recomputes the plan and refuses on any change.

use super::*;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PullPlanRequest {
    pub project_root: String,
    #[serde(default)]
    pub remote: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PullStatus {
    /// Local branch already contains the remote tip.
    UpToDate,
    /// Apply will fast-forward.
    FastForward,
    /// Only local versions are new: nothing to pull, publish instead.
    LocalAhead,
    /// Both sides have new versions. No merge/rebase here; the user decides elsewhere.
    Diverged,
    /// Local changes (or conflicts) block the fast-forward. See `blocked_code`.
    Blocked,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullPlan {
    pub plan_id: String,
    pub status: PullStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_code: Option<RemoteErrorCode>,
    pub remote: String,
    /// Token-free canonical URL the fetched data came from.
    pub remote_url: String,
    pub branch: String,
    pub tracking_ref: String,
    pub head: String,
    pub target: String,
    pub target_tree: String,
    pub ahead: u32,
    pub behind: u32,
    pub commits: Vec<PlanCommit>,
    pub commits_total: usize,
    pub files: Vec<PlanFile>,
    pub files_total: usize,
    /// Local files (changed or untracked) that the incoming versions also touch.
    pub blocked_by_local_changes: Vec<String>,
    /// Unsaved editor buffers right now (informational; apply re-checks).
    pub unsaved_buffers: Vec<String>,
    /// What this plan does, in one sentence for the review screen.
    pub summary: String,
    /// Recovery route named in advance (R2-C4).
    pub recovery: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PullApplyRequest {
    pub request: PullPlanRequest,
    /// The id the reviewer saw. Apply recomputes and compares.
    pub plan_id: String,
    pub authority: Authority,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub remote: String,
    pub branch: String,
    pub old_head: String,
    pub new_head: String,
    pub files_changed: usize,
    pub safety_ref: String,
    pub unsaved_buffers_elsewhere: Vec<String>,
    pub recovery: String,
}

fn compute(env: &RemoteEnv, req: &PullPlanRequest) -> RResult<(PullPlan, RepoCtx)> {
    let ctx = repo_ctx(env, Path::new(&req.project_root))?;
    let root = ctx.root.clone();
    if ctx.info.unborn {
        return Err(RemoteError::new(RemoteErrorCode::Blocked, "This project has no versions yet"));
    }
    let branch = ctx.info.branch.clone().ok_or_else(|| RemoteError::new(RemoteErrorCode::Blocked, "Open a variant first. A detached state cannot be updated"))?;
    let head = ctx.info.head.clone().ok_or_else(|| RemoteError::new(RemoteErrorCode::Blocked, "This project has no versions yet"))?;
    let name = resolve_remote(&root, Some(&branch), req.remote.as_deref())?;
    let remote = effective_remote(env, &root, &name, false)?;
    // Tracking branch: configured upstream of this branch on this remote, else same name.
    let cfg_remote = config_get(&root, &format!("branch.{branch}.remote"))?;
    let short = match (cfg_remote.as_deref(), config_get(&root, &format!("branch.{branch}.merge"))?) {
        (Some(r), Some(m)) if r == name => m.strip_prefix("refs/heads/").map(str::to_string).unwrap_or_else(|| branch.clone()),
        _ => branch.clone(),
    };
    let tracking_ref = format!("refs/remotes/{name}/{short}");
    let target = sha_of(&root, &tracking_ref)?.ok_or_else(|| {
        RemoteError::detail(RemoteErrorCode::NoUpstream, "Nothing fetched for this variant yet. Check GitHub for updates first", tracking_ref.clone())
    })?;
    let target_tree = tree_of(&root, &target)?;
    let lr = text(&gr_ok(&root, &["rev-list", "--left-right", "--count", &format!("{head}...{target}")])?);
    let mut it = lr.split_whitespace();
    let ahead: u32 = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let behind: u32 = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);

    let mut status = match (ahead, behind) {
        (0, 0) => PullStatus::UpToDate,
        (_, 0) => PullStatus::LocalAhead,
        (0, _) => PullStatus::FastForward,
        _ => PullStatus::Diverged,
    };
    let (mut commits, mut commits_total, mut files, mut files_total) = (vec![], 0usize, vec![], 0usize);
    let mut blocked: Vec<String> = vec![];
    let mut blocked_code = None;
    if status == PullStatus::FastForward || status == PullStatus::Diverged {
        let range = format!("{head}..{target}");
        let (c, t) = plan_commits(&root, &[&range])?;
        commits = c;
        commits_total = t;
    }
    if status == PullStatus::FastForward {
        let all = changed_files(&root, &head, &target)?;
        let local: HashSet<String> = local_change_paths(&root)?.into_iter().collect();
        blocked = all.iter().filter(|f| local.contains(&f.path)).map(|f| f.path.clone()).collect();
        // A new incoming file under a local untracked directory name (or the reverse) also collides.
        for f in &all {
            let p = f.path.as_str();
            if local.iter().any(|l| p.starts_with(&format!("{l}/")) || l.starts_with(&format!("{p}/"))) && !blocked.contains(&f.path) {
                blocked.push(f.path.clone());
            }
        }
        blocked.sort();
        blocked.dedup();
        if !blocked.is_empty() {
            status = PullStatus::Blocked;
            blocked_code = Some(RemoteErrorCode::DirtyState);
        }
        files_total = all.len();
        files = all.into_iter().take(MAX_PLAN_FILES).collect();
    }
    if status == PullStatus::Diverged {
        blocked_code = Some(RemoteErrorCode::Diverged);
    }
    let unsaved: Vec<String> = env.buffers.unsaved_paths(&root);
    let summary = match status {
        PullStatus::UpToDate => "Already up to date.".to_string(),
        PullStatus::LocalAhead => format!("Nothing to bring in. This variant is {ahead} version(s) ahead of GitHub."),
        PullStatus::FastForward => format!("Bring in {behind} new version(s) from {} by moving this variant forward. No merge commit, nothing of yours is changed.", remote.repo_path()),
        PullStatus::Diverged => format!("GitHub has {behind} new version(s) and this variant has {ahead} the remote lacks. A plain update is not possible."),
        PullStatus::Blocked => format!("{} file(s) you changed locally would be overwritten. Save them as a version or set them aside first.", blocked.len()),
    };
    let ids = [
        root.to_string_lossy().to_string(),
        branch.clone(),
        name.clone(),
        remote.canonical.clone(),
        tracking_ref.clone(),
        head.clone(),
        target.clone(),
        target_tree.clone(),
        format!("{status:?}"),
        blocked.join("\u{1f}"),
    ];
    let id_refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
    let plan_id = plan_hash("pull", &id_refs);
    Ok((
        PullPlan {
            plan_id,
            status,
            blocked_code,
            remote: name,
            remote_url: remote.canonical,
            branch,
            tracking_ref,
            head: head.clone(),
            target,
            target_tree,
            ahead,
            behind,
            commits,
            commits_total,
            files,
            files_total,
            blocked_by_local_changes: blocked,
            unsaved_buffers: unsaved,
            summary,
            recovery: "Restore the safety version taken just before the update; it returns this variant to where it is now as a new version.".into(),
        },
        ctx,
    ))
}

/// `git_pull_plan`: local read, no network, no write.
pub fn pull_plan(env: &RemoteEnv, req: &PullPlanRequest) -> RResult<PullPlan> {
    compute(env, req).map(|(p, _)| p)
}

/// `git_pull_apply`: fast-forward to the reviewed target SHA, nothing else.
pub fn pull_apply(env: &RemoteEnv, req: &PullApplyRequest) -> RResult<PullResult> {
    let ctx0 = repo_ctx(env, Path::new(&req.request.project_root))?;
    let _lock = RepoLock::acquire(&ctx0.root)?;
    let (plan, ctx) = compute(env, &req.request)?;
    if plan.plan_id != req.plan_id {
        return Err(RemoteError::detail(RemoteErrorCode::StalePlan, "The project changed since you reviewed this update. Review it again", "plan-id-mismatch"));
    }
    check_authority(env, &req.authority, GrantAction::PullApply, &plan.plan_id)?;
    match plan.status {
        PullStatus::FastForward => {}
        PullStatus::Diverged => {
            return Err(RemoteError::new(RemoteErrorCode::Diverged, "Both sides have new versions. A plain update is not possible"));
        }
        PullStatus::Blocked => {
            return Err(RemoteError::detail(RemoteErrorCode::DirtyState, "Local changes would be overwritten", plan.blocked_by_local_changes.join(", ")));
        }
        PullStatus::UpToDate | PullStatus::LocalAhead => {
            return Err(RemoteError::detail(RemoteErrorCode::Blocked, "There is nothing to bring in", "nothing-to-apply"));
        }
    }
    // Unsaved buffers: blocker for agents and for any file the update would replace.
    let unsaved = env.buffers.unsaved_paths(&ctx.root);
    if !unsaved.is_empty() {
        let incoming: HashSet<String> = changed_files(&ctx.root, &plan.head, &plan.target)?.into_iter().map(|f| f.path).collect();
        let overlap: Vec<&String> = unsaved.iter().filter(|u| incoming.contains(*u)).collect();
        if is_agent(&req.authority) || !overlap.is_empty() {
            return Err(RemoteError::detail(
                RemoteErrorCode::UnsavedBuffers,
                "Unsaved changes in the editor block this update. Save or discard them first",
                unsaved.join(", "),
            ));
        }
    }
    // Safety ref before the operation (never overwritten).
    let stamp = super::super::unix_now();
    let mut safety_ref = format!("refs/somnia/safety/pre-pull-{stamp}");
    let mut n = 0;
    loop {
        let r = gr(&ctx.root, &["rev-parse", "--verify", "--quiet", &safety_ref])?;
        if r.code != Some(0) {
            break;
        }
        n += 1;
        safety_ref = format!("refs/somnia/safety/pre-pull-{stamp}-{n}");
    }
    gw(&ctx.root, &["update-ref", &safety_ref, &plan.head])?;

    let merged = gr_merge(&ctx.root, &plan.target);
    if let Err(e) = merged {
        return Err(e);
    }
    let new_head = sha_of(&ctx.root, "HEAD")?.unwrap_or_default();
    if new_head != plan.target {
        return Err(RemoteError::detail(RemoteErrorCode::Unknown, "The update did not end where it was reviewed", format!("{new_head} != {}", plan.target)));
    }
    Ok(PullResult {
        remote: plan.remote,
        branch: plan.branch,
        old_head: plan.head,
        new_head,
        files_changed: plan.files_total,
        safety_ref,
        unsaved_buffers_elsewhere: unsaved,
        recovery: plan.recovery,
    })
}

fn gr_merge(root: &Path, target: &str) -> RResult<()> {
    let os = ["merge", "--ff-only", "--no-edit", "--no-verify", target];
    let args: Vec<&OsStr> = os.iter().map(|a| OsStr::new(*a)).collect();
    let out = run_git(root, &args, Mode::Write, Duration::from_secs(120), None, &[])?;
    if out.code == Some(0) {
        return Ok(());
    }
    let s = out.stderr.to_lowercase();
    let code = if s.contains("would be overwritten") || s.contains("untracked working tree") {
        RemoteErrorCode::DirtyState
    } else if s.contains("not possible to fast-forward") {
        RemoteErrorCode::Diverged
    } else {
        RemoteErrorCode::Unknown
    };
    Err(RemoteError::detail(code, "The update could not be applied", out.stderr))
}
