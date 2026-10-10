//! Linked-worktree lifecycle. Hosts must supply live editor guard state; disk
//! status cannot stand in for unsaved buffers. No network, shell or credentials.
use super::*;
use fs2::FileExt;
use std::fs::{File, OpenOptions};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepoContext {
    pub repo_id: String,
    pub worktree_id: String,
    pub root: String,
    pub git_dir: String,
    pub common_dir: String,
    pub project_prefix: String,
}

pub(super) fn identity(path: &Path) -> String {
    let mut h = Sha256::new();
    h.update(path.as_os_str().as_encoded_bytes());
    format!("{:x}", h.finalize())
}

pub fn repo_context(project_root: &Path) -> GResult<RepoContext> {
    let p = probe(&canonical_project_root(project_root))?;
    Ok(RepoContext {
        repo_id: identity(&p.common_dir),
        worktree_id: identity(&p.git_dir),
        root: p.root.to_string_lossy().into_owned(),
        git_dir: p.git_dir.to_string_lossy().into_owned(),
        common_dir: p.common_dir.to_string_lossy().into_owned(),
        project_prefix: p.prefix,
    })
}

/// OS advisory lock shared by all Somnia processes/checkouts of this repository.
/// Git's own index/ref locks still arbitrate against non-Somnia Git clients.
/// Nonblocking: return needs-input/blocked rather than deadlock or stale takeover.
pub struct RepoWriteLock(File);
impl Drop for RepoWriteLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.0);
    }
}
pub fn lock_repo(project_root: &Path) -> GResult<RepoWriteLock> {
    let p = probe(&canonical_project_root(project_root))?;
    let lock_path = p.common_dir.join("somnia-write.lock");
    if std::fs::symlink_metadata(&lock_path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Repository lock must not be a symlink",
        ));
    }
    let mut opts = OpenOptions::new();
    opts.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let file = opts
        .open(lock_path)
        .map_err(|_| GitError::new(GitErrorCode::Io, "Could not open repository lock"))?;
    file.try_lock_exclusive().map_err(|_| {
        GitError::detail(
            GitErrorCode::Blocked,
            "Another repository operation is running",
            "repo-locked",
        )
    })?;
    Ok(RepoWriteLock(file))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceGuard {
    /// False/missing live editor state is never interpreted as a clean workspace.
    pub known: bool,
    pub unsaved_buffers: bool,
    pub pending_ai_review: bool,
}
fn guard(g: &WorkspaceGuard) -> GResult<()> {
    if !g.known || g.unsaved_buffers || g.pending_ai_review {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Resolve the workspace editor state before this action",
            "workspace-review-required",
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitWorktreeRequest {
    pub destination: String,
    pub branch: String,
    pub base: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitWorktreePlan {
    pub context: RepoContext,
    pub destination: String,
    pub branch: String,
    pub base_sha: String,
    pub state_token: String,
    pub plan_id: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub root: String,
    pub context: Option<RepoContext>,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub detached: bool,
    pub bare: bool,
    pub locked: bool,
    pub prunable: bool,
    /// None means missing/unreadable, never clean.
    pub dirty: Option<bool>,
    pub state_token: Option<String>,
}

fn destination(project_root: &Path, value: &str) -> GResult<PathBuf> {
    // Older supported Git emits raw newline paths in porcelain without -z.
    // Reject control characters before creation so read-back cannot be ambiguous.
    if value.chars().any(|c| c.is_control()) {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Worktree paths cannot contain control characters",
        ));
    }
    let raw = PathBuf::from(value);
    if !raw.is_absolute()
        || raw
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Worktree destination must be an absolute path without traversal",
        ));
    }
    if std::fs::symlink_metadata(&raw).is_ok() {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Worktree destination already exists",
        ));
    }
    let parent = raw
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .ok_or_else(|| {
            GitError::new(
                GitErrorCode::PathRejected,
                "Worktree parent directory must exist",
            )
        })?;
    let name = raw
        .file_name()
        .ok_or_else(|| GitError::new(GitErrorCode::PathRejected, "Invalid worktree destination"))?;
    let dest = parent.join(name);
    let p = probe(&canonical_project_root(project_root))?;
    if dest.starts_with(&p.root) || dest.starts_with(&p.common_dir) {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Worktrees must be outside the source checkout and Git directory",
        ));
    }
    // Do not create a nested checkout inside ANY other registered worktree.
    for w in list_raw(project_root)? {
        let root = PathBuf::from(w.root);
        if dest.starts_with(canonical_project_root(&root)) {
            return Err(GitError::new(
                GitErrorCode::PathRejected,
                "Worktrees must not be nested",
            ));
        }
    }
    Ok(dest)
}

fn validate_branch(root: &Path, name: &str) -> GResult<()> {
    if name.starts_with('-') || name.len() > 200 || name.contains('\0') {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Invalid worktree branch",
        ));
    }
    let checked = run_git(
        root,
        &[
            OsStr::new("check-ref-format"),
            OsStr::new(&format!("refs/heads/{name}")),
        ],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )?;
    if checked.code != Some(0) {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Invalid worktree branch",
        ));
    }
    let exists = run_git(
        root,
        &[
            OsStr::new("show-ref"),
            OsStr::new("--verify"),
            OsStr::new("--quiet"),
            OsStr::new(&format!("refs/heads/{name}")),
        ],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )?;
    if exists.code != Some(1) {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Worktree branch already exists or cannot be checked",
            "branch-collision",
        ));
    }
    Ok(())
}

fn disk_state(root: &Path) -> GResult<(bool, String)> {
    let info = ready_info(root, None)?;
    // Include ignored data: force removal would delete it too.
    let out = git_ok(
        root,
        &[
            OsStr::new("status"),
            OsStr::new("--porcelain=v2"),
            OsStr::new("-z"),
            OsStr::new("--untracked-files=all"),
            OsStr::new("--ignored=matching"),
        ],
        READ_TIMEOUT,
    )?;
    let (_, changes) = parse_status_v2(&out.stdout);
    Ok((!changes.is_empty(), compute_state_token(&info, &changes)))
}
fn plan_id(plan: &GitWorktreePlan) -> String {
    let mut h = Sha256::new();
    for field in [
        &plan.context.repo_id,
        &plan.context.worktree_id,
        &plan.destination,
        &plan.branch,
        &plan.base_sha,
        &plan.state_token,
    ] {
        h.update(field.as_bytes());
        h.update(b"\0");
    }
    format!("{:x}", h.finalize())
}

pub fn git_worktree_plan(
    root: &Path,
    req: &GitWorktreeRequest,
    workspace: &WorkspaceGuard,
    trust: &TrustStore,
) -> GResult<GitWorktreePlan> {
    guard(workspace)?;
    let info = ready_info(root, Some(trust))?;
    let context = repo_context(root)?;
    let dest = destination(root, &req.destination)?;
    validate_branch(Path::new(&info.root), &req.branch)?;
    let base_sha = rev_parse_commit(Path::new(&info.root), &req.base)?;
    let (dirty, state_token) = disk_state(Path::new(&info.root))?;
    if dirty && !status(Path::new(&info.root))?.changes.is_empty() {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Save a clean source checkout before starting a worktree",
            "dirty-worktree",
        ));
    }
    let mut plan = GitWorktreePlan {
        context,
        destination: dest.to_string_lossy().into_owned(),
        branch: req.branch.clone(),
        base_sha,
        state_token,
        plan_id: String::new(),
    };
    plan.plan_id = plan_id(&plan);
    Ok(plan)
}

pub fn git_worktree_add(
    root: &Path,
    plan: &GitWorktreePlan,
    workspace: &WorkspaceGuard,
    trust: &TrustStore,
) -> GResult<GitWorktree> {
    let _lock = lock_repo(root)?;
    let current = git_worktree_plan(
        root,
        &GitWorktreeRequest {
            destination: plan.destination.clone(),
            branch: plan.branch.clone(),
            base: plan.base_sha.clone(),
        },
        workspace,
        trust,
    )?;
    if current.context != plan.context
        || current.plan_id != plan.plan_id
        || plan_id(plan) != plan.plan_id
    {
        return Err(GitError::new(
            GitErrorCode::StateChanged,
            "Worktree plan changed; review it again",
        ));
    }
    let safety_ref = format!("refs/somnia/safety/worktree-add/{}", uuid::Uuid::new_v4());
    git_write(
        root,
        &[
            OsStr::new("update-ref"),
            OsStr::new(&safety_ref),
            OsStr::new(&plan.base_sha),
        ],
        None,
        &[],
    )?;
    git_write(
        root,
        &[
            OsStr::new("worktree"),
            OsStr::new("add"),
            OsStr::new("-b"),
            OsStr::new(&plan.branch),
            OsStr::new("--"),
            OsStr::new(&plan.destination),
            OsStr::new(&plan.base_sha),
        ],
        None,
        &[],
    )?;
    // Trust is deliberately NOT inherited. Register via trust_repo after host approval.
    git_worktree_list(root)?
        .into_iter()
        .find(|w| w.root == plan.destination)
        .ok_or_else(|| {
            GitError::new(
                GitErrorCode::Unknown,
                "Worktree created but read-back failed; preserve and reconcile it",
            )
        })
}

fn list_raw(root: &Path) -> GResult<Vec<GitWorktree>> {
    let out = run_git(
        root,
        &[
            OsStr::new("worktree"),
            OsStr::new("list"),
            OsStr::new("--porcelain"),
            OsStr::new("-z"),
        ],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )?;
    let fields: String;
    if out.code == Some(0) {
        fields = String::from_utf8(out.stdout).map_err(|_| {
            GitError::new(GitErrorCode::PathRejected, "Worktree paths must be UTF-8")
        })?;
    } else if out.stderr.contains("unknown switch") {
        // Git before 2.36 has no -z. Refuse ambiguous control-character output.
        let old = git_ok(
            root,
            &[
                OsStr::new("-c"),
                OsStr::new("core.quotePath=true"),
                OsStr::new("worktree"),
                OsStr::new("list"),
                OsStr::new("--porcelain"),
            ],
            READ_TIMEOUT,
        )?;
        let text = std::str::from_utf8(&old.stdout).map_err(|_| {
            GitError::new(GitErrorCode::PathRejected, "Worktree paths must be UTF-8")
        })?;
        let mut decoded = Vec::new();
        for line in text.lines() {
            if let Some(path) = line.strip_prefix("worktree ") {
                decoded.push(format!("worktree {}", path.to_string()));
            } else if line.is_empty()
                || line.starts_with("HEAD ")
                || line.starts_with("branch ")
                || line == "detached"
                || line == "bare"
                || line == "locked"
                || line.starts_with("locked ")
                || line == "prunable"
                || line.starts_with("prunable ")
            {
                decoded.push(line.to_string());
            } else {
                return Err(GitError::new(
                    GitErrorCode::PathRejected,
                    "Ambiguous legacy Git worktree listing; use Git 2.36 or later",
                ));
            }
        }
        fields = decoded.join("\0");
    } else {
        return Err(GitError::detail(
            GitErrorCode::Unknown,
            "Could not list worktrees",
            out.stderr,
        ));
    }
    let text = &fields;
    let mut result = Vec::new();
    let mut item: Option<GitWorktree> = None;
    for field in text.split('\0') {
        if let Some(path) = field.strip_prefix("worktree ") {
            if let Some(w) = item.take() {
                result.push(w);
            }
            item = Some(GitWorktree {
                root: path.to_string(),
                context: None,
                head: None,
                branch: None,
                detached: false,
                bare: false,
                locked: false,
                prunable: false,
                dirty: None,
                state_token: None,
            });
        } else if let Some(w) = &mut item {
            if let Some(sha) = field.strip_prefix("HEAD ") {
                w.head = Some(sha.to_string());
            } else if let Some(branch) = field.strip_prefix("branch refs/heads/") {
                w.branch = Some(branch.to_string());
            } else if field == "detached" {
                w.detached = true;
            } else if field == "bare" {
                w.bare = true;
            } else if field == "locked" || field.starts_with("locked ") {
                w.locked = true;
            } else if field == "prunable" || field.starts_with("prunable ") {
                w.prunable = true;
            }
        }
    }
    if let Some(w) = item {
        result.push(w);
    }
    Ok(result)
}
pub fn git_worktree_list(root: &Path) -> GResult<Vec<GitWorktree>> {
    let context = repo_context(root)?;
    let mut list = list_raw(root)?;
    for w in &mut list {
        if w.bare {
            continue;
        }
        if let Ok(c) = repo_context(Path::new(&w.root)) {
            if c.repo_id != context.repo_id {
                continue;
            }
            if let Ok((dirty, token)) = disk_state(Path::new(&w.root)) {
                w.dirty = Some(dirty);
                w.state_token = Some(token);
            }
            w.context = Some(c);
        }
    }
    Ok(list)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitWorktreeRemoveRequest {
    pub worktree_id: String,
    pub state_token: String,
    pub force: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeRemoveResult {
    pub removed_root: String,
    pub safety_ref: String,
}

pub fn git_worktree_remove(
    root: &Path,
    req: &GitWorktreeRemoveRequest,
    workspace: &WorkspaceGuard,
    trust: &TrustStore,
) -> GResult<GitWorktreeRemoveResult> {
    guard(workspace)?;
    let _lock = lock_repo(root)?;
    ready_info(root, Some(trust))?;
    let source = repo_context(root)?;
    let target = git_worktree_list(root)?
        .into_iter()
        .find(|w| {
            w.context.as_ref().map(|c| c.worktree_id.as_str()) == Some(req.worktree_id.as_str())
        })
        .ok_or_else(|| {
            GitError::new(
                GitErrorCode::PathRejected,
                "Worktree does not belong to this repository or is unavailable",
            )
        })?;
    let ctx = target.context.as_ref().unwrap();
    if ctx.worktree_id == source.worktree_id
        || same_dir(Path::new(&ctx.git_dir), Path::new(&ctx.common_dir))
    {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Cannot remove the active or primary checkout",
        ));
    }
    if target.locked || target.prunable || target.dirty.is_none() {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Worktree is locked or unavailable; preserve it for recovery",
            "worktree-unavailable",
        ));
    }
    ready_info(Path::new(&target.root), Some(trust))?;
    if target.state_token.as_deref() != Some(&req.state_token) {
        return Err(GitError::new(
            GitErrorCode::StateChanged,
            "Worktree changed since removal review",
        ));
    }
    if target.dirty == Some(true) && !req.force {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Worktree has uncommitted or ignored files",
            "dirty-worktree",
        ));
    }
    let head = target
        .head
        .as_deref()
        .ok_or_else(|| GitError::new(GitErrorCode::Blocked, "Worktree has no recovery version"))?;
    let safety_ref = format!(
        "refs/somnia/safety/worktree-remove/{}",
        uuid::Uuid::new_v4()
    );
    // Ignored data has no Git recovery route. Never discard it, even under force.
    let ignored = git_ok(
        Path::new(&target.root),
        &[
            OsStr::new("ls-files"),
            OsStr::new("--others"),
            OsStr::new("--ignored"),
            OsStr::new("--exclude-standard"),
            OsStr::new("-z"),
        ],
        READ_TIMEOUT,
    )?;
    if !ignored.stdout.is_empty() {
        return Err(GitError::detail(
            GitErrorCode::Blocked,
            "Move ignored files out of the worktree before removal",
            "ignored-files",
        ));
    }
    let recovery_sha = if target.dirty == Some(true) {
        let info = ready_info(Path::new(&target.root), Some(trust))?;
        safety_copy(Path::new(&target.root), &info, &[".".into()])?
            .1
            .sha
    } else {
        head.to_string()
    };
    git_write(
        root,
        &[
            OsStr::new("update-ref"),
            OsStr::new(&safety_ref),
            OsStr::new(&recovery_sha),
        ],
        None,
        &[],
    )?;
    // Hooks/external tools may have changed disk while the recovery snapshot ran.
    // Keep the snapshot and checkout intact rather than delete an unreviewed result.
    let (_, after_snapshot_token) = disk_state(Path::new(&target.root))?;
    if after_snapshot_token != req.state_token {
        return Err(GitError::new(
            GitErrorCode::StateChanged,
            "Worktree changed during recovery snapshot; preserve and review it again",
        ));
    }
    let mut args = vec![OsStr::new("worktree"), OsStr::new("remove")];
    if req.force {
        args.push(OsStr::new("--force"));
    }
    args.extend([OsStr::new("--"), OsStr::new(&target.root)]);
    git_write(root, &args, None, &[])?;
    if list_raw(root)?.iter().any(|w| w.root == target.root) {
        return Err(GitError::new(
            GitErrorCode::Unknown,
            "Removal read-back failed; reconcile before retry",
        ));
    }
    Ok(GitWorktreeRemoveResult {
        removed_root: target.root,
        safety_ref,
    })
}
