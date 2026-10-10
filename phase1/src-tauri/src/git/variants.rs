//! CONTRACT-E: Variants (branches) and Combine (merge). See docs/git/CONTRACT.md.
//!
//! - Same runner, env whitelist, timeouts and trust gate as the core (`super`).
//! - No network, no force, no `--no-verify`, no `-X ours/theirs`, no automatic
//!   conflict resolution. Every conflicted file needs an explicit choice.
//! - Combine runs a real `git merge --no-ff --no-commit`, so merge state lives
//!   in git (MERGE_HEAD) and survives an app restart. `combine_abort` always works.
//! - A safety copy is taken before a combine starts; a deleted unmerged variant
//!   keeps its tip on `refs/somnia/variant-backup/*`.
use super::*;
use std::collections::BTreeMap;

const MAX_NAME: usize = 100;
const MAX_RESOLVED_BYTES: usize = 4 * 1024 * 1024;
const MAX_PREVIEW_COMMITS: u32 = 20;
const MAX_PREVIEW_FILES: usize = 500;

// ---------------------------------------------------------------- types (mirror src/lib/git/types.ts)

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariant {
    pub name: String,
    pub current: bool,
    pub tip: String,
    pub subject: String,
    pub time: i64,
    /// Versions this variant has that the current one lacks.
    pub ahead: u32,
    /// Versions the current variant has that this one lacks.
    pub behind: u32,
    /// True when everything in this variant is already in the current one.
    pub merged: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariantCreateRequest {
    pub name: String,
    /// Variant name or version sha to start from. Default: the current version.
    #[serde(default)]
    pub from: Option<String>,
    /// Switch to the new variant right away.
    #[serde(default)]
    pub open: bool,
    /// Required when `open` and `from` is not the current version.
    #[serde(default)]
    pub state_token: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariantOpenRequest {
    pub name: String,
    pub state_token: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariantRenameRequest {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariantDeleteRequest {
    pub name: String,
    /// Tip the user reviewed; a different tip means `state-changed`.
    pub expect_tip: String,
    /// Must be true to delete a variant with versions that exist nowhere else.
    #[serde(default)]
    pub confirm_unmerged: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVariantDeleteResult {
    pub name: String,
    pub deleted_tip: String,
    /// Hidden ref that keeps the deleted versions reachable. None when everything was merged.
    pub backup_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombinePreviewRequest {
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombineFile {
    pub path: String,
    /// added | modified | deleted | typechange
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombinePreview {
    pub name: String,
    pub tip: String,
    pub current: String,
    pub up_to_date: bool,
    pub fast_forward: bool,
    pub commits: Vec<GitVersion>,
    pub files: Vec<GitCombineFile>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombineStartRequest {
    pub name: String,
    pub expect_tip: String,
    pub state_token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflict {
    pub path: String,
    /// both-modified | both-added | deleted-by-yours | deleted-by-theirs | other
    pub kind: String,
    pub binary: bool,
    pub too_large: bool,
    pub base: Option<String>,
    pub yours: Option<String>,
    pub theirs: Option<String>,
    /// File on disk right now (with git's conflict markers).
    pub working: Option<String>,
    pub yours_bytes: Option<u64>,
    pub theirs_bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombineSession {
    pub name: String,
    pub yours_tip: String,
    pub theirs_tip: String,
    /// True when the current variant simply moved forward; nothing left to do.
    pub fast_forwarded: bool,
    /// True while merge state exists and `combine_finish` or `combine_abort` is needed.
    pub merging: bool,
    pub conflicts: Vec<GitConflict>,
    pub safety_copy: Option<GitVersion>,
    /// Set when `fast_forwarded`.
    pub version: Option<GitVersion>,
    pub proposed_message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitResolveChoice {
    Yours,
    Theirs,
    Content,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictResolution {
    pub path: String,
    pub choice: GitResolveChoice,
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombineResolveRequest {
    pub resolutions: Vec<GitConflictResolution>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCombineFinishRequest {
    #[serde(default)]
    pub message: Option<String>,
}

// ---------------------------------------------------------------- small helpers

fn blocked(msg: &str, detail: &str) -> GitError {
    GitError::detail(GitErrorCode::Blocked, msg, detail)
}

fn os<'a>(args: &'a [&'a str]) -> Vec<&'a OsStr> {
    args.iter().map(|a| OsStr::new(*a)).collect()
}

fn read(root: &Path, args: &[&str]) -> GResult<GitOutput> {
    git_ok(root, &os(args), READ_TIMEOUT)
}

fn read_raw(root: &Path, args: &[&str]) -> GResult<GitOutput> {
    run_git(root, &os(args), Mode::Read, READ_TIMEOUT, None, &[])
}

fn write(root: &Path, args: &[&str]) -> GResult<GitOutput> {
    git_write(root, &os(args), None, &[])
}

/// Write-mode call that returns the raw output; callers decide what a non-zero exit means.
/// Literal pathspecs: a file named `*.html` must not glob.
fn write_raw(root: &Path, args: &[&str], stdin: Option<&[u8]>) -> GResult<GitOutput> {
    run_git(root, &os(args), Mode::Write, READ_TIMEOUT, stdin, &[("GIT_LITERAL_PATHSPECS", OsStr::new("1"))])
}

fn variant_ref(name: &str) -> String {
    format!("refs/heads/{name}")
}

fn variant_exists(root: &Path, name: &str) -> GResult<bool> {
    let r = variant_ref(name);
    Ok(read_raw(root, &["show-ref", "--verify", "--quiet", &r])?.code == Some(0))
}

fn validate_name(root: &Path, name: &str) -> GResult<String> {
    let n = name.trim();
    let bad = n.is_empty()
        || n.chars().count() > MAX_NAME
        || n.starts_with('-')
        || n.starts_with('@')
        || n == "HEAD"
        || n.chars().any(|c| c.is_control());
    if bad {
        return Err(blocked("This variant name is not allowed", "invalid-variant-name"));
    }
    let out = read_raw(root, &["check-ref-format", "--branch", n])?;
    if out.code != Some(0) {
        return Err(blocked("This variant name is not allowed", "invalid-variant-name"));
    }
    Ok(n.to_string())
}

/// The whole repository (not just the project subtree) must be clean before a switch or combine.
fn ensure_clean(root: &Path) -> GResult<()> {
    let out = read(root, &["status", "--porcelain=v1", "-z", "--untracked-files=normal"])?;
    if out.stdout.iter().any(|b| *b != 0) {
        return Err(blocked("There are unsaved changes in the project files", "dirty-worktree"));
    }
    Ok(())
}

fn is_ancestor(root: &Path, ancestor: &str, descendant: &str) -> GResult<bool> {
    let out = read_raw(root, &["merge-base", "--is-ancestor", ancestor, descendant])?;
    match out.code {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(GitError::detail(GitErrorCode::Unknown, "Could not compare variants", out.stderr)),
    }
}

fn sanitize_ref_part(name: &str) -> String {
    let s: String =
        name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect();
    s.chars().take(60).collect()
}

fn has_conflict_markers(text: &str) -> bool {
    text.lines().any(|l| {
        l == "<<<<<<<" || l.starts_with("<<<<<<< ") || l == ">>>>>>>" || l.starts_with(">>>>>>> ")
    })
}

fn project_path(prefix: &str, repo_path: &str) -> Option<String> {
    strip_prefix(prefix, repo_path).map(|s| s.to_string())
}

// ---------------------------------------------------------------- list

fn list_in(root: &Path, current: Option<&str>, head: Option<&str>) -> GResult<Vec<GitVariant>> {
    let out = read(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(objectname)%1f%(committerdate:unix)%1f%(subject)",
            "refs/heads",
        ],
    )?;
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut list = Vec::new();
    for line in text.lines() {
        let f: Vec<&str> = line.splitn(4, '\u{1f}').collect();
        if f.len() != 4 {
            continue;
        }
        let Some(name) = f[0].strip_prefix("refs/heads/") else { continue };
        let (mut ahead, mut behind) = (0u32, 0u32);
        if let Some(h) = head {
            let range = format!("{h}...{}", f[1]);
            let c = read(root, &["rev-list", "--left-right", "--count", &range])?;
            let s = String::from_utf8_lossy(&c.stdout).into_owned();
            let mut it = s.split_whitespace();
            behind = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
            ahead = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        }
        list.push(GitVariant {
            name: name.to_string(),
            current: current == Some(name),
            tip: f[1].to_string(),
            subject: f[3].to_string(),
            time: f[2].trim().parse().unwrap_or(0),
            ahead,
            behind,
            merged: ahead == 0,
        });
    }
    list.sort_by(|a, b| b.current.cmp(&a.current).then(b.time.cmp(&a.time)).then(a.name.cmp(&b.name)));
    Ok(list)
}

/// Contract command `git_variant_list`.
pub fn variant_list(project_root: &Path) -> GResult<Vec<GitVariant>> {
    let info = ready_info(project_root, None)?;
    if info.unborn {
        return Ok(Vec::new());
    }
    list_in(Path::new(&info.root), info.branch.as_deref(), info.head.as_deref())
}

fn find_variant(root: &Path, info: &GitRepoInfo, name: &str) -> GResult<GitVariant> {
    list_in(root, info.branch.as_deref(), info.head.as_deref())?
        .into_iter()
        .find(|v| v.name == name)
        .ok_or_else(|| blocked("That variant does not exist", "variant-missing"))
}

// ---------------------------------------------------------------- create / open / rename / delete

/// Contract command `git_variant_create`.
pub fn variant_create(project_root: &Path, req: &GitVariantCreateRequest, trust: &TrustStore) -> GResult<GitVariant> {
    let collected = collect(project_root, if req.open { Some(trust) } else { None })?;
    let info = &collected.info;
    let root = PathBuf::from(&info.root);
    if info.unborn {
        return Err(blocked("Save a first version before starting a variant", "unborn"));
    }
    let head = info.head.clone().unwrap_or_default();
    let name = validate_name(&root, &req.name)?;
    if variant_exists(&root, &name)? {
        return Err(blocked("A variant with this name already exists", "variant-exists"));
    }
    let start = match req.from.as_deref() {
        None => head.clone(),
        Some(f) => {
            let spec = if variant_exists(&root, f)? { variant_ref(f) } else { f.to_string() };
            rev_parse_commit(&root, &spec)?
        }
    };
    if req.open && start != head {
        let token = compute_state_token(info, &collected.changes);
        if req.state_token.as_deref() != Some(token.as_str()) {
            return Err(GitError::new(GitErrorCode::StateChanged, "The files changed since the review; please look again"));
        }
        ensure_clean(&root)?;
    }
    write(&root, &["branch", &name, &start])?;
    if req.open {
        // Same version as HEAD: the switch carries uncommitted work along unchanged.
        let out = write_raw(&root, &["checkout", &name, "--"], None)?;
        if out.code != Some(0) {
            let _ = write_raw(&root, &["branch", "-D", &name], None);
            return Err(GitError::detail(GitErrorCode::Unknown, "Could not switch to the new variant", out.stderr));
        }
    }
    let fresh = ready_info(project_root, Some(trust)).or_else(|_| ready_info(project_root, None))?;
    find_variant(&root, &fresh, &name)
}

/// Contract command `git_variant_open`: switch the project to another variant.
pub fn variant_open(project_root: &Path, req: &GitVariantOpenRequest, trust: &TrustStore) -> GResult<GitRepoState> {
    let collected = collect(project_root, Some(trust))?;
    let info = &collected.info;
    let root = PathBuf::from(&info.root);
    if info.unborn {
        return Err(blocked("Save a first version before using variants", "unborn"));
    }
    let token = compute_state_token(info, &collected.changes);
    if token != req.state_token {
        return Err(GitError::new(GitErrorCode::StateChanged, "The files changed since the review; please look again"));
    }
    let name = validate_name(&root, &req.name)?;
    if !variant_exists(&root, &name)? {
        return Err(blocked("That variant does not exist", "variant-missing"));
    }
    if info.branch.as_deref() == Some(name.as_str()) {
        return Ok(detect(project_root, Some(trust)));
    }
    ensure_clean(&root)?;
    if info.detached {
        // Do not strand versions made on a detached head.
        let head = info.head.clone().unwrap_or_default();
        let refname = format!("refs/somnia/variant-backup/{}-detached", unix_now());
        write(&root, &["update-ref", &refname, &head])?;
    }
    let out = write_raw(&root, &["checkout", &name, "--"], None)?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "Could not switch variants", out.stderr));
    }
    Ok(detect(project_root, Some(trust)))
}

/// Contract command `git_variant_rename`. Never overwrites an existing variant.
pub fn variant_rename(project_root: &Path, req: &GitVariantRenameRequest) -> GResult<GitVariant> {
    let info = ready_info(project_root, None)?;
    let root = PathBuf::from(&info.root);
    let from = validate_name(&root, &req.from)?;
    let to = validate_name(&root, &req.to)?;
    if !variant_exists(&root, &from)? {
        return Err(blocked("That variant does not exist", "variant-missing"));
    }
    if from == to {
        return find_variant(&root, &info, &from);
    }
    if variant_exists(&root, &to)? {
        return Err(blocked("A variant with this name already exists", "variant-exists"));
    }
    write(&root, &["branch", "-m", &from, &to])?;
    let fresh = ready_info(project_root, None)?;
    find_variant(&root, &fresh, &to)
}

/// Contract command `git_variant_delete`. Refuses the open variant. A variant with
/// versions that exist nowhere else needs `confirm_unmerged` and keeps a hidden backup ref.
pub fn variant_delete(project_root: &Path, req: &GitVariantDeleteRequest) -> GResult<GitVariantDeleteResult> {
    let info = ready_info(project_root, None)?;
    let root = PathBuf::from(&info.root);
    let name = validate_name(&root, &req.name)?;
    if !variant_exists(&root, &name)? {
        return Err(blocked("That variant does not exist", "variant-missing"));
    }
    if info.branch.as_deref() == Some(name.as_str()) {
        return Err(blocked("The open variant cannot be deleted", "is-current"));
    }
    let tip = rev_parse_commit(&root, &variant_ref(&name))?;
    if tip != req.expect_tip {
        return Err(GitError::new(GitErrorCode::StateChanged, "The variant changed since the review; please look again"));
    }
    let merged = match info.head.as_deref() {
        Some(h) => is_ancestor(&root, &tip, h)?,
        None => false,
    };
    let mut backup = None;
    if !merged {
        if !req.confirm_unmerged {
            return Err(blocked("This variant has versions that exist nowhere else", "unmerged-variant"));
        }
        let refname = format!("refs/somnia/variant-backup/{}-{}", unix_now(), sanitize_ref_part(&name));
        write(&root, &["update-ref", &refname, &tip])?;
        backup = Some(refname);
    }
    write(&root, &["branch", "-D", &name])?;
    Ok(GitVariantDeleteResult { name, deleted_tip: tip, backup_ref: backup })
}

// ---------------------------------------------------------------- combine: preview

fn parse_name_status_z(bytes: &[u8], prefix: &str) -> Vec<GitCombineFile> {
    let mut parts = bytes.split(|b| *b == 0).filter(|p| !p.is_empty());
    let mut out = Vec::new();
    while let (Some(st), Some(path)) = (parts.next(), parts.next()) {
        let kind = match st.first() {
            Some(b'A') => "added",
            Some(b'D') => "deleted",
            Some(b'T') => "typechange",
            _ => "modified",
        };
        let repo_path = String::from_utf8_lossy(path).into_owned();
        if let Some(p) = project_path(prefix, &repo_path) {
            out.push(GitCombineFile { path: p, kind: kind.to_string() });
        }
    }
    out
}

/// Contract command `git_combine_preview`. Read only: nothing is merged.
pub fn combine_preview(project_root: &Path, req: &GitCombinePreviewRequest) -> GResult<GitCombinePreview> {
    let info = ready_info(project_root, None)?;
    let root = PathBuf::from(&info.root);
    let Some(current) = info.branch.clone() else {
        return Err(blocked("Open a variant before combining", "detached-head"));
    };
    let head = info.head.clone().ok_or_else(|| blocked("Save a first version before combining", "unborn"))?;
    let name = validate_name(&root, &req.name)?;
    if name == current {
        return Err(blocked("Choose a different variant to combine", "same-variant"));
    }
    if !variant_exists(&root, &name)? {
        return Err(blocked("That variant does not exist", "variant-missing"));
    }
    let tip = rev_parse_commit(&root, &variant_ref(&name))?;
    let up_to_date = is_ancestor(&root, &tip, &head)?;
    let fast_forward = !up_to_date && is_ancestor(&root, &head, &tip)?;
    if !up_to_date {
        let base = read_raw(&root, &["merge-base", &head, &tip])?;
        if base.code != Some(0) {
            return Err(blocked("These variants share no common history", "unrelated-histories"));
        }
    }
    let mut commits = Vec::new();
    let mut files = Vec::new();
    let mut truncated = false;
    if !up_to_date {
        let range = format!("{head}..{tip}");
        let max = format!("--max-count={MAX_PREVIEW_COMMITS}");
        let list = read(&root, &["rev-list", &max, &range])?;
        for sha in String::from_utf8_lossy(&list.stdout).lines() {
            commits.push(version_record(&root, sha.trim())?);
        }
        let triple = format!("{head}...{tip}");
        let diff = read(&root, &["diff", "--name-status", "-z", "--no-renames", &triple])?;
        files = parse_name_status_z(&diff.stdout, &info.project_prefix);
        if files.len() > MAX_PREVIEW_FILES {
            files.truncate(MAX_PREVIEW_FILES);
            truncated = true;
        }
    }
    Ok(GitCombinePreview { name, tip, current, up_to_date, fast_forward, commits, files, truncated })
}

// ---------------------------------------------------------------- combine: session

/// Probe that tolerates a running merge (the generic detect() reports it as blocked).
fn merge_ctx(project_root: &Path, trust: Option<&TrustStore>) -> GResult<RepoProbe> {
    let canonical = canonical_project_root(project_root);
    let p = probe(&canonical)?;
    match blocked_reason(&p) {
        None | Some(GitBlockReason::MergeInProgress) => {}
        Some(reason) => return Err(blocked("The repository state blocks this action", block_reason_name(&reason))),
    }
    if let Some(store) = trust {
        if !store.is_trusted(&p.root.to_string_lossy()) {
            return Err(blocked("This project folder is not trusted yet", "untrusted-repo"));
        }
    }
    Ok(p)
}

fn merge_head(p: &RepoProbe) -> Option<String> {
    std::fs::read_to_string(p.git_dir.join("MERGE_HEAD"))
        .ok()
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
        .filter(|s| !s.is_empty())
}

fn read_conflicts(root: &Path, prefix: &str) -> GResult<Vec<GitConflict>> {
    let out = read(root, &["ls-files", "-u", "-z"])?;
    let mut by_path: BTreeMap<String, [bool; 3]> = BTreeMap::new();
    for rec in out.stdout.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        let text = String::from_utf8_lossy(rec).into_owned();
        let Some((meta, path)) = text.split_once('\t') else { continue };
        let stage: usize = meta.split_whitespace().nth(2).and_then(|s| s.parse().ok()).unwrap_or(0);
        if (1..=3).contains(&stage) {
            by_path.entry(path.to_string()).or_insert([false; 3])[stage - 1] = true;
        }
    }
    let mut conflicts = Vec::new();
    for (repo_path, stages) in by_path {
        let Some(path) = project_path(prefix, &repo_path) else {
            return Err(blocked("A conflict touches files outside this project", "conflict-outside-project"));
        };
        let kind = match (stages[0], stages[1], stages[2]) {
            (true, true, true) => "both-modified",
            (false, true, true) => "both-added",
            (true, false, true) => "deleted-by-yours",
            (true, true, false) => "deleted-by-theirs",
            _ => "other",
        };
        let blob = |n: u8| -> Option<Vec<u8>> { show_blob(root, &format!(":{n}:{repo_path}")) };
        let (b, y, t) = (blob(1), blob(2), blob(3));
        let binary = [&b, &y, &t].iter().any(|s| s.as_deref().map(sniff_binary).unwrap_or(false));
        let yours_bytes = y.as_ref().map(|v| v.len() as u64);
        let theirs_bytes = t.as_ref().map(|v| v.len() as u64);
        let mut too_large = false;
        let mut text_of = |v: Option<Vec<u8>>| -> Option<String> {
            if binary {
                return None;
            }
            v.map(|bytes| {
                let (s, big) = cut_side(bytes);
                too_large |= big;
                s
            })
        };
        let base = text_of(b);
        let yours = text_of(y);
        let theirs = text_of(t);
        let working = if binary { None } else { text_of(read_worktree(root, &repo_path)) };
        conflicts.push(GitConflict {
            path,
            kind: kind.to_string(),
            binary,
            too_large,
            base,
            yours,
            theirs,
            working,
            yours_bytes,
            theirs_bytes,
        });
    }
    Ok(conflicts)
}

fn name_for_sha(root: &Path, sha: &str) -> String {
    let out = read_raw(root, &["for-each-ref", "--points-at", sha, "--format=%(refname)", "refs/heads"]);
    out.ok()
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .and_then(|l| l.strip_prefix("refs/heads/"))
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| sha.chars().take(7).collect())
}

fn current_branch(root: &Path) -> String {
    read_raw(root, &["symbolic-ref", "--short", "-q", "HEAD"])
        .ok()
        .filter(|o| o.code == Some(0))
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "this variant".to_string())
}

fn session_from_state(root: &Path, p: &RepoProbe) -> GResult<Option<GitCombineSession>> {
    let Some(theirs) = merge_head(p) else { return Ok(None) };
    let yours = rev_parse_commit(root, "HEAD")?;
    let name = name_for_sha(root, &theirs);
    let proposed = format!("Combined variant {name} into {}", current_branch(root));
    Ok(Some(GitCombineSession {
        name,
        yours_tip: yours,
        theirs_tip: theirs,
        fast_forwarded: false,
        merging: true,
        conflicts: read_conflicts(root, &p.prefix)?,
        safety_copy: None,
        version: None,
        proposed_message: proposed,
    }))
}

/// Contract command `git_combine_status`: the running combine, if any (resume after restart).
pub fn combine_status(project_root: &Path) -> GResult<Option<GitCombineSession>> {
    let p = merge_ctx(project_root, None)?;
    session_from_state(&p.root.clone(), &p)
}

fn abort_quietly(root: &Path) {
    let _ = write_raw(root, &["merge", "--abort"], None);
}

/// Contract command `git_combine_start`. Requires a clean, reviewed project. Takes a safety
/// copy, then merges without committing. Conflicts are returned, never resolved.
pub fn combine_start(project_root: &Path, req: &GitCombineStartRequest, trust: &TrustStore) -> GResult<GitCombineSession> {
    let collected = collect(project_root, Some(trust))?;
    let info = &collected.info;
    let root = PathBuf::from(&info.root);
    let Some(current) = info.branch.clone() else {
        return Err(blocked("Open a variant before combining", "detached-head"));
    };
    let head = info.head.clone().ok_or_else(|| blocked("Save a first version before combining", "unborn"))?;
    let token = compute_state_token(info, &collected.changes);
    if token != req.state_token {
        return Err(GitError::new(GitErrorCode::StateChanged, "The files changed since the review; please look again"));
    }
    let name = validate_name(&root, &req.name)?;
    if name == current {
        return Err(blocked("Choose a different variant to combine", "same-variant"));
    }
    if !variant_exists(&root, &name)? {
        return Err(blocked("That variant does not exist", "variant-missing"));
    }
    let tip = rev_parse_commit(&root, &variant_ref(&name))?;
    if tip != req.expect_tip {
        return Err(GitError::new(GitErrorCode::StateChanged, "The variant changed since the review; please look again"));
    }
    ensure_clean(&root)?;
    if is_ancestor(&root, &tip, &head)? {
        return Err(blocked("Nothing to combine: this variant is already included", "up-to-date"));
    }
    let fast_forward = is_ancestor(&root, &head, &tip)?;
    if !fast_forward && read_raw(&root, &["merge-base", &head, &tip])?.code != Some(0) {
        return Err(blocked("These variants share no common history", "unrelated-histories"));
    }
    let scope = vec![if info.project_prefix.is_empty() { ".".to_string() } else { info.project_prefix.clone() }];
    let (_refname, safety) = safety_copy_for(&root, info, &scope, "combine")?;
    let proposed = format!("Combined variant {name} into {current}");
    let target = variant_ref(&name);

    if fast_forward {
        let out = write_raw(&root, &["merge", "--ff-only", &target], None)?;
        if out.code != Some(0) {
            return Err(GitError::detail(GitErrorCode::Unknown, "Could not move the variant forward", out.stderr));
        }
        let version = version_record(&root, "HEAD")?;
        return Ok(GitCombineSession {
            name,
            yours_tip: head,
            theirs_tip: tip,
            fast_forwarded: true,
            merging: false,
            conflicts: Vec::new(),
            safety_copy: Some(safety),
            version: Some(version),
            proposed_message: proposed,
        });
    }

    let out = write_raw(&root, &["merge", "--no-ff", "--no-commit", "--no-edit", &target], None)?;
    let p = merge_ctx(project_root, Some(trust))?;
    let state = if merge_head(&p).is_some() { session_from_state(&root, &p) } else { Ok(None) };
    match state {
        Ok(Some(mut session)) => {
            // Exit code 1 with unmerged files is the normal conflict case; 0 is a clean merge.
            if out.code != Some(0) && session.conflicts.is_empty() {
                abort_quietly(&root);
                return Err(GitError::detail(GitErrorCode::Unknown, "The combine failed", out.stderr));
            }
            session.safety_copy = Some(safety);
            session.proposed_message = proposed;
            Ok(session)
        }
        Ok(None) => Err(GitError::detail(GitErrorCode::Unknown, "The combine failed", out.stderr)),
        Err(e) => {
            abort_quietly(&root);
            Err(e)
        }
    }
}

// ---------------------------------------------------------------- combine: resolve / finish / abort

/// Contract command `git_combine_resolve`: applies explicit choices for named files only.
/// Validates everything before touching anything.
pub fn combine_resolve(project_root: &Path, req: &GitCombineResolveRequest, trust: &TrustStore) -> GResult<GitCombineSession> {
    let p = merge_ctx(project_root, Some(trust))?;
    let root = p.root.clone();
    if merge_head(&p).is_none() {
        return Err(blocked("No combine is running", "no-merge"));
    }
    let open = read_conflicts(&root, &p.prefix)?;
    let by_path: BTreeMap<&str, &GitConflict> = open.iter().map(|c| (c.path.as_str(), c)).collect();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut plan: Vec<(String, String, &GitConflictResolution, &GitConflict)> = Vec::new();
    for r in &req.resolutions {
        let rel = validate_api_path(&r.path)?;
        let rel_str = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
        let Some(conflict) = by_path.get(rel_str.as_str()) else {
            return Err(blocked("That file is not a conflict", "not-a-conflict"));
        };
        if !seen.insert(rel_str.clone()) {
            return Err(blocked("A file was resolved twice", "duplicate-resolution"));
        }
        if r.choice == GitResolveChoice::Content {
            let Some(content) = r.content.as_deref() else {
                return Err(blocked("The result is missing", "content-missing"));
            };
            if conflict.binary {
                return Err(blocked("Binary files need a side to be chosen", "binary-needs-choice"));
            }
            if content.contains('\0') || content.len() > MAX_RESOLVED_BYTES {
                return Err(blocked("The result is not valid text", "content-invalid"));
            }
            if has_conflict_markers(content) {
                return Err(blocked("The result still contains conflict markers", "conflict-markers"));
            }
        }
        plan.push((rel_str.clone(), to_repo_relative(&p.prefix, &rel_str), r, conflict));
    }
    for (_proj, repo_path, r, conflict) in &plan {
        match r.choice {
            GitResolveChoice::Content => {
                let target = root.join(repo_path);
                if let Some(dir) = target.parent() {
                    std::fs::create_dir_all(dir).map_err(|_| GitError::new(GitErrorCode::Io, "Could not write the result"))?;
                }
                std::fs::write(&target, r.content.as_deref().unwrap_or("").as_bytes())
                    .map_err(|_| GitError::new(GitErrorCode::Io, "Could not write the result"))?;
                write_raw_ok(&root, &["add", "--", repo_path])?;
            }
            GitResolveChoice::Yours | GitResolveChoice::Theirs => {
                let (side, flag) = if r.choice == GitResolveChoice::Yours {
                    (&conflict.yours, "--ours")
                } else {
                    (&conflict.theirs, "--theirs")
                };
                let present = if conflict.binary {
                    if r.choice == GitResolveChoice::Yours { conflict.yours_bytes.is_some() } else { conflict.theirs_bytes.is_some() }
                } else {
                    side.is_some()
                };
                if present {
                    write_raw_ok(&root, &["checkout", flag, "--", repo_path])?;
                    write_raw_ok(&root, &["add", "--", repo_path])?;
                } else {
                    // That side deleted the file: accept the deletion.
                    let rm = write_raw(&root, &["rm", "-q", "-f", "--", repo_path], None)?;
                    if rm.code != Some(0) {
                        write_raw_ok(&root, &["update-index", "--force-remove", "--", repo_path])?;
                    }
                }
            }
        }
    }
    session_from_state(&root, &p)?.ok_or_else(|| blocked("No combine is running", "no-merge"))
}

fn write_raw_ok(root: &Path, args: &[&str]) -> GResult<()> {
    let out = write_raw(root, args, None)?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "A git write failed", out.stderr));
    }
    Ok(())
}

/// Contract command `git_combine_finish`: commits the merge once nothing is conflicted.
pub fn combine_finish(project_root: &Path, req: &GitCombineFinishRequest, trust: &TrustStore) -> GResult<GitVersion> {
    let p = merge_ctx(project_root, Some(trust))?;
    let root = p.root.clone();
    if merge_head(&p).is_none() {
        return Err(blocked("No combine is running", "no-merge"));
    }
    if !read(&root, &["ls-files", "-u", "-z"])?.stdout.is_empty() {
        return Err(blocked("Some files still need a decision", "unresolved-conflicts"));
    }
    let subject = match req.message.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        Some(m) => m.to_string(),
        None => {
            let theirs = merge_head(&p).unwrap_or_default();
            format!("Combined variant {} into {}", name_for_sha(&root, &theirs), current_branch(&root))
        }
    };
    let message = validate_message(&subject, None)?;
    let out = run_git(&root, &os(&["commit", "-F", "-"]), Mode::Write, READ_TIMEOUT, Some(message.as_bytes()), &[])?;
    if out.code != Some(0) {
        return Err(map_commit_error(&root, &out));
    }
    version_record(&root, "HEAD")
}

/// Contract command `git_combine_abort`: back to the state before the combine started.
pub fn combine_abort(project_root: &Path, trust: Option<&TrustStore>) -> GResult<GitRepoState> {
    let p = merge_ctx(project_root, None)?;
    if merge_head(&p).is_none() {
        return Err(blocked("No combine is running", "no-merge"));
    }
    let out = write_raw(&p.root, &["merge", "--abort"], None)?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "Could not cancel the combine", out.stderr));
    }
    Ok(detect(project_root, trust))
}
