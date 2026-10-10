//! Immutable historical reads. Host adapters may execute these under a shared GitJob read lease.
//! No working-tree/index writes, hooks, external diff or textconv execution.
use super::*;

/// Minimal adapter to the shared job engine. Called once per command so cancellation and
/// generation checks remain the engine's responsibility. No raw command endpoint is exposed.
pub trait RefReadExecutor {
    fn execute(&self, args: &[&OsStr], stdin: Option<&[u8]>) -> GResult<RefReadOutput>;
}
pub struct RefReadOutput {
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub truncated: bool,
}
struct LegacyRead<'a>(&'a Path);
impl RefReadExecutor for LegacyRead<'_> {
    fn execute(&self, args: &[&OsStr], stdin: Option<&[u8]>) -> GResult<RefReadOutput> {
        let out = run_git(self.0, args, Mode::Read, READ_TIMEOUT, stdin, &[])?;
        Ok(RefReadOutput {
            code: out.code,
            stdout: out.stdout,
            truncated: out.capped,
        })
    }
}
fn read(
    exec: &dyn RefReadExecutor,
    args: &[&OsStr],
    stdin: Option<&[u8]>,
) -> GResult<RefReadOutput> {
    let out = exec.execute(args, stdin)?;
    if out.code != Some(0) {
        return Err(GitError::new(
            GitErrorCode::Unknown,
            "Historical Git read failed",
        ));
    }
    if out.truncated {
        return Err(GitError::new(
            GitErrorCode::TooLarge,
            "Historical Git output exceeds its read limit",
        ));
    }
    Ok(out)
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRefsRequest {
    /// null explicitly means an empty tree (including unborn repositories). Empty strings are invalid.
    pub base: Option<String>,
    pub target: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRefChange {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: GitChangeKind,
    pub before_blob: Option<String>,
    pub after_blob: Option<String>,
    pub before_bytes: Option<u64>,
    pub after_bytes: Option<u64>,
    pub binary: bool,
    pub too_large: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRefsDiff {
    pub base_sha: Option<String>,
    pub target_sha: Option<String>,
    pub base_tree: String,
    pub target_tree: String,
    /// Paths are repository-relative, limited to the opened project subtree.
    pub files: Vec<GitRefChange>,
    /// Complete patch or absent when bounded output is exceeded. Never a silently partial patch.
    pub patch: Option<String>,
    pub truncated: bool,
    pub too_large: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSafetyPoint {
    pub reference: String,
    pub sha: String,
    pub time: i64,
    /// Legacy refs have unknown scope/operation, never guessed from the current project.
    pub scope: Option<Vec<String>>,
    pub source_operation: Option<String>,
    pub subject: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSafetyList {
    pub points: Vec<GitSafetyPoint>,
    pub truncated: bool,
}

fn resolve(
    exec: &dyn RefReadExecutor,
    value: &Option<String>,
) -> GResult<(Option<String>, String)> {
    match value {
        None => {
            // Compute the empty tree for this repository's object format (SHA-1 or SHA-256).
            let out = read(
                exec,
                &[
                    OsStr::new("hash-object"),
                    OsStr::new("-t"),
                    OsStr::new("tree"),
                    OsStr::new("--stdin"),
                ],
                Some(b""),
            )?;
            if out.code != Some(0) {
                return Err(GitError::new(
                    GitErrorCode::Unknown,
                    "Could not resolve empty tree",
                ));
            }
            Ok((None, String::from_utf8_lossy(&out.stdout).trim().into()))
        }
        Some(rev) => {
            if rev.is_empty()
                || rev.len() > 1024
                || rev.starts_with('-')
                || rev.chars().any(char::is_control)
            {
                return Err(GitError::new(
                    GitErrorCode::PathRejected,
                    "Invalid version reference",
                ));
            }
            let spec = format!("{rev}^{{commit}}");
            let out = read(
                exec,
                &[
                    OsStr::new("rev-parse"),
                    OsStr::new("--verify"),
                    OsStr::new("--end-of-options"),
                    OsStr::new(&spec),
                ],
                None,
            )?;
            let sha = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let tree = read(
                exec,
                &[
                    OsStr::new("rev-parse"),
                    OsStr::new(&format!("{sha}^{{tree}}")),
                ],
                None,
            )?;
            Ok((
                Some(sha),
                String::from_utf8_lossy(&tree.stdout).trim().into(),
            ))
        }
    }
}
fn blob_info(
    exec: &dyn RefReadExecutor,
    oid: &str,
    mode: &str,
) -> GResult<(Option<String>, Option<u64>, bool)> {
    if oid.bytes().all(|b| b == b'0') {
        return Ok((None, None, false));
    }
    // Gitlinks refer to commits, not blobs. Do not follow submodule contents.
    if mode == "160000" {
        return Ok((Some(oid.into()), None, true));
    }
    let size = read(
        exec,
        &[OsStr::new("cat-file"), OsStr::new("-s"), OsStr::new(oid)],
        None,
    )?;
    let size: u64 = String::from_utf8_lossy(&size.stdout)
        .trim()
        .parse()
        .map_err(|_| GitError::new(GitErrorCode::Unknown, "Invalid blob size"))?;
    // Avoid reading giant blobs only for classification; explicitly tooLarge instead.
    let binary = if size <= MAX_DIFF_SIDE as u64 {
        let out = read(
            exec,
            &[OsStr::new("cat-file"), OsStr::new("blob"), OsStr::new(oid)],
            None,
        )?;
        out.stdout.iter().take(8000).any(|b| *b == 0)
    } else {
        false
    };
    Ok((Some(oid.into()), Some(size), binary))
}
fn path_utf8(raw: &[u8]) -> GResult<String> {
    String::from_utf8(raw.to_vec())
        .map_err(|_| GitError::new(GitErrorCode::PathRejected, "Git path is not UTF-8"))
}

pub fn diff_refs(project_root: &Path, req: &GitDiffRefsRequest) -> GResult<GitRefsDiff> {
    let ctx = probe(project_root)?;
    diff_refs_with(&LegacyRead(&ctx.root), &ctx.prefix, req)
}
/// Shared engine entry. Executor must belong to a Read GitJob in this repository.
pub fn diff_refs_with(
    exec: &dyn RefReadExecutor,
    project_prefix: &str,
    req: &GitDiffRefsRequest,
) -> GResult<GitRefsDiff> {
    let (base_sha, base_tree) = resolve(exec, &req.base)?;
    let (target_sha, target_tree) = resolve(exec, &req.target)?;
    let scope = if project_prefix.is_empty() {
        "."
    } else {
        project_prefix
    };
    let raw = read(
        exec,
        &[
            OsStr::new("diff"),
            OsStr::new("--no-ext-diff"),
            OsStr::new("--no-textconv"),
            OsStr::new("--raw"),
            OsStr::new("-z"),
            OsStr::new("--no-abbrev"),
            OsStr::new("--find-renames"),
            OsStr::new(&base_tree),
            OsStr::new(&target_tree),
            OsStr::new("--"),
            OsStr::new(&format!(":(literal){scope}")),
        ],
        None,
    )?;
    if raw.truncated {
        return Err(GitError::new(
            GitErrorCode::TooLarge,
            "Changed file list exceeds read limit",
        ));
    }
    let records: Vec<_> = raw
        .stdout
        .split(|b| *b == 0)
        .filter(|s| !s.is_empty())
        .collect();
    let mut files = Vec::new();
    let mut i = 0;
    let mut truncated = false;
    while i < records.len() {
        if files.len() == MAX_CHANGES {
            truncated = true;
            break;
        }
        let header = path_utf8(records[i])?;
        i += 1;
        let parts: Vec<_> = header.trim_start_matches(':').split_whitespace().collect();
        if parts.len() != 5 {
            return Err(GitError::new(
                GitErrorCode::Unknown,
                "Invalid raw diff record",
            ));
        }
        let old = path_utf8(
            records
                .get(i)
                .ok_or_else(|| GitError::new(GitErrorCode::Unknown, "Missing diff path"))?,
        )?;
        i += 1;
        let renamed = parts[4].starts_with('R') || parts[4].starts_with('C');
        let path = if renamed {
            let p = path_utf8(
                records
                    .get(i)
                    .ok_or_else(|| GitError::new(GitErrorCode::Unknown, "Missing rename path"))?,
            )?;
            i += 1;
            p
        } else {
            old.clone()
        };
        let kind = match parts[4].as_bytes()[0] {
            b'A' => GitChangeKind::Added,
            b'D' => GitChangeKind::Deleted,
            b'R' => GitChangeKind::Renamed,
            b'C' => GitChangeKind::Copied,
            b'T' => GitChangeKind::Typechange,
            _ => GitChangeKind::Modified,
        };
        let (before_blob, before_bytes, before_binary) = blob_info(exec, parts[2], parts[0])?;
        let (after_blob, after_bytes, after_binary) = blob_info(exec, parts[3], parts[1])?;
        let too_large = before_bytes.unwrap_or(0) > MAX_DIFF_SIDE as u64
            || after_bytes.unwrap_or(0) > MAX_DIFF_SIDE as u64;
        files.push(GitRefChange {
            path,
            old_path: renamed.then_some(old),
            kind,
            before_blob,
            after_blob,
            before_bytes,
            after_bytes,
            binary: before_binary || after_binary,
            too_large,
        });
    }
    let patch = read(
        exec,
        &[
            OsStr::new("diff"),
            OsStr::new("--no-ext-diff"),
            OsStr::new("--no-textconv"),
            OsStr::new("--no-color"),
            OsStr::new("--find-renames"),
            OsStr::new("--patch"),
            OsStr::new(&base_tree),
            OsStr::new(&target_tree),
            OsStr::new("--"),
            OsStr::new(&format!(":(literal){scope}")),
        ],
        None,
    )?;
    let too_large =
        patch.truncated || patch.stdout.len() > MAX_UNIFIED || files.iter().any(|f| f.too_large);
    let patch = if too_large || truncated {
        None
    } else {
        Some(String::from_utf8_lossy(&patch.stdout).into_owned())
    };
    Ok(GitRefsDiff {
        base_sha,
        target_sha,
        base_tree,
        target_tree,
        files,
        patch,
        truncated,
        too_large,
    })
}

/// Reads loose and packed safety refs, not an in-memory list. No restore/reset is performed.
pub fn safety_list(project_root: &Path) -> GResult<GitSafetyList> {
    let ctx = probe(project_root)?;
    safety_list_with(&LegacyRead(&ctx.root))
}
/// Shared engine entry. Reads immutable ref targets under a Read GitJob.
pub fn safety_list_with(exec: &dyn RefReadExecutor) -> GResult<GitSafetyList> {
    let refs = read(
        exec,
        &[
            OsStr::new("for-each-ref"),
            OsStr::new("--sort=-committerdate"),
            OsStr::new("--count=501"),
            OsStr::new(
                "--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(subject)%00",
            ),
            OsStr::new("refs/somnia/safety/"),
        ],
        None,
    )?;
    if refs.truncated {
        return Err(GitError::new(
            GitErrorCode::TooLarge,
            "Safety list exceeds read limit",
        ));
    }
    let mut points = Vec::new();
    for line in refs.stdout.split(|b| *b == b'\n').filter(|l| !l.is_empty()) {
        let f: Vec<_> = line.split(|b| *b == 0).collect();
        if f.len() < 5 {
            continue;
        }
        let reference = path_utf8(f[0])?;
        let sha = path_utf8(f[1])?;
        // Skip non-commit/corrupt refs without presenting an unsafe recovery target.
        let resolved = resolve(exec, &Some(sha.clone()));
        if resolved.is_err() {
            continue;
        }
        let msg = read(
            exec,
            &[
                OsStr::new("show"),
                OsStr::new("-s"),
                OsStr::new("--format=%B"),
                OsStr::new(&sha),
            ],
            None,
        )?;
        let body = String::from_utf8_lossy(&msg.stdout);
        let scope = body
            .lines()
            .find_map(|l| l.strip_prefix("Somnia-Safety-Scope: "))
            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok());
        let source_operation = body
            .lines()
            .find_map(|l| l.strip_prefix("Somnia-Safety-Operation: "))
            .map(str::to_owned);
        points.push(GitSafetyPoint {
            reference,
            sha,
            time: String::from_utf8_lossy(f[2]).parse().unwrap_or(0),
            scope,
            source_operation,
            subject: path_utf8(f[3])?,
        });
    }
    let truncated = points.len() > 500;
    points.truncate(500);
    Ok(GitSafetyList { points, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn git(d: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(args)
            .current_dir(d)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().into()
    }
    fn repo() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        git(d.path(), &["init", "-q"]);
        git(d.path(), &["config", "user.name", "Test"]);
        git(d.path(), &["config", "user.email", "test@example.invalid"]);
        d
    }
    fn commit(d: &Path) -> String {
        git(d, &["add", "-A"]);
        git(d, &["commit", "-qm", "version"]);
        git(d, &["rev-parse", "HEAD"])
    }
    #[test]
    fn rename_binary_added_deleted_and_resolved_refs() {
        let d = repo();
        let p = d.path();
        std::fs::write(p.join("old file.txt"), "unchanged\n").unwrap();
        std::fs::write(p.join("removed.txt"), "removed\n").unwrap();
        let a = commit(p);
        std::fs::rename(p.join("old file.txt"), p.join("new\nfile.txt")).unwrap();
        std::fs::remove_file(p.join("removed.txt")).unwrap();
        std::fs::write(p.join("binary.bin"), [0, 1, 2, 3]).unwrap();
        std::fs::write(p.join("added.txt"), "new\n").unwrap();
        let b = commit(p);
        let out = diff_refs(
            p,
            &GitDiffRefsRequest {
                base: Some(a.clone()),
                target: Some("HEAD".into()),
            },
        )
        .unwrap();
        assert_eq!(out.base_sha, Some(a));
        assert_eq!(out.target_sha, Some(b));
        assert_eq!(out.files.len(), 4);
        let rename = out
            .files
            .iter()
            .find(|f| f.path == "new\nfile.txt")
            .unwrap();
        assert_eq!(rename.kind, GitChangeKind::Renamed);
        assert_eq!(rename.old_path.as_deref(), Some("old file.txt"));
        assert_eq!(rename.before_blob, rename.after_blob);
        assert!(
            out.files
                .iter()
                .find(|f| f.path == "binary.bin")
                .unwrap()
                .binary
        );
        assert!(out
            .files
            .iter()
            .find(|f| f.path == "removed.txt")
            .unwrap()
            .after_blob
            .is_none());
        assert!(out.patch.unwrap().contains("Binary files"));
    }
    #[test]
    fn explicit_empty_tree_unborn_equal_and_invalid_refs() {
        let d = repo();
        let p = d.path();
        let empty = diff_refs(
            p,
            &GitDiffRefsRequest {
                base: None,
                target: None,
            },
        )
        .unwrap();
        assert!(empty.files.is_empty());
        assert_eq!(empty.patch.as_deref(), Some(""));
        std::fs::write(p.join("a"), "x").unwrap();
        let sha = commit(p);
        let initial = diff_refs(
            p,
            &GitDiffRefsRequest {
                base: None,
                target: Some(sha.clone()),
            },
        )
        .unwrap();
        assert_eq!(initial.files.len(), 1);
        assert!(initial.files[0].before_blob.is_none());
        let equal = diff_refs(
            p,
            &GitDiffRefsRequest {
                base: Some(sha.clone()),
                target: Some(sha),
            },
        )
        .unwrap();
        assert!(equal.files.is_empty());
        for r in ["", "--help", "missing-ref", "HEAD\n"] {
            assert!(diff_refs(
                p,
                &GitDiffRefsRequest {
                    base: Some(r.into()),
                    target: None
                }
            )
            .is_err());
        }
    }
    #[test]
    fn packed_legacy_and_scoped_safety_survive_restart_without_mutation() {
        let d = repo();
        let p = d.path();
        std::fs::write(p.join("a"), "x").unwrap();
        let a = commit(p);
        git(p, &["update-ref", "refs/somnia/safety/old", &a]);
        let info = ready_info(p, None).unwrap();
        let (one, _) = safety_copy(p, &info, &["a".into()]).unwrap();
        let (two, _) = safety_copy(p, &info, &["a".into()]).unwrap();
        assert_ne!(one, two);
        git(p, &["pack-refs", "--all"]);
        let index_before = std::fs::read(p.join(".git/index")).unwrap();
        let out = safety_list(p).unwrap();
        assert_eq!(out.points.len(), 3);
        assert!(out
            .points
            .iter()
            .find(|s| s.reference.ends_with("/old"))
            .unwrap()
            .scope
            .is_none());
        let new = out.points.iter().find(|s| s.reference == one).unwrap();
        assert_eq!(new.scope, Some(vec!["a".into()]));
        assert_eq!(new.source_operation.as_deref(), Some("other"));
        assert_eq!(safety_list(p).unwrap().points.len(), 3);
        assert_eq!(git(p, &["rev-parse", "HEAD"]), a);
        assert_eq!(std::fs::read(p.join(".git/index")).unwrap(), index_before);
    }
    #[test]
    fn project_prefix_and_external_diff_are_safe() {
        let d = repo();
        let p = d.path();
        std::fs::create_dir(p.join("site")).unwrap();
        std::fs::write(p.join("site/a.txt"), "old").unwrap();
        std::fs::write(p.join("outside.txt"), "old").unwrap();
        let a = commit(p);
        std::fs::write(p.join("site/a.txt"), "new").unwrap();
        std::fs::write(p.join("outside.txt"), "new").unwrap();
        let b = commit(p);
        git(p, &["config", "diff.external", "not-a-real-command"]);
        let out = diff_refs(
            &p.join("site"),
            &GitDiffRefsRequest {
                base: Some(a),
                target: Some(b),
            },
        )
        .unwrap();
        assert_eq!(out.files.len(), 1);
        assert_eq!(out.files[0].path, "site/a.txt");
        assert!(out.patch.is_some());
    }
    #[test]
    fn large_blob_omits_patch_and_marks_limit() {
        let d = repo();
        let p = d.path();
        std::fs::write(p.join("huge"), vec![b'x'; MAX_DIFF_SIDE + 1]).unwrap();
        let a = commit(p);
        let out = diff_refs(
            p,
            &GitDiffRefsRequest {
                base: None,
                target: Some(a),
            },
        )
        .unwrap();
        assert!(out.too_large);
        assert!(out.files[0].too_large);
        assert!(out.patch.is_none());
    }
    #[test]
    fn linked_worktree_read_uses_common_refs() {
        let d = repo();
        let p = d.path();
        std::fs::write(p.join("a"), "x").unwrap();
        let a = commit(p);
        git(p, &["update-ref", "refs/somnia/safety/test", &a]);
        let target = d.path().join("../linked-read-test");
        git(
            p,
            &["worktree", "add", "--detach", target.to_str().unwrap(), &a],
        );
        assert_eq!(safety_list(&target).unwrap().points.len(), 1);
        assert!(diff_refs(
            &target,
            &GitDiffRefsRequest {
                base: Some(a.clone()),
                target: Some(a)
            }
        )
        .unwrap()
        .files
        .is_empty());
        git(p, &["worktree", "remove", target.to_str().unwrap()]);
    }
}

/// Bridge to S1's stable job API. Every command rechecks generation, buffers and cancellation.
impl RefReadExecutor for super::jobs::JobExecution {
    fn execute(&self, args: &[&OsStr], stdin: Option<&[u8]>) -> GResult<RefReadOutput> {
        let mut command = super::command::GitCommand::new(args)
            .timeout(READ_TIMEOUT)
            .output_limit(MAX_STDOUT);
        if let Some(bytes) = stdin {
            command = command.stdin(bytes.to_vec());
        }
        let out = self.run(&command).map_err(|e| {
            use super::jobs::GitJobErrorCode as J;
            let code = match e.code {
                J::GitMissing => GitErrorCode::GitMissing,
                J::Cancelled => GitErrorCode::Cancelled,
                J::Timeout => GitErrorCode::Timeout,
                J::StalePlan => GitErrorCode::StateChanged,
                J::Io => GitErrorCode::Io,
                J::DirtyState | J::EditorStateUnknown | J::AiReviewPending => GitErrorCode::Blocked,
                _ => GitErrorCode::Unknown,
            };
            GitError::new(code, e.message)
        })?;
        Ok(RefReadOutput {
            code: out.code,
            stdout: out.stdout,
            truncated: out.truncated,
        })
    }
}

/// Host-neutral typed result around S1 jobs. Agent origin is guarded by S1, including reads.
pub(super) async fn read_job<T: Send + 'static>(
    runner: &super::jobs::GitJobRunner,
    context: super::context::RepoContext,
    origin: super::jobs::JobOrigin,
    action: &str,
    operation: impl FnOnce(&super::jobs::JobExecution) -> GResult<T> + Send + 'static,
) -> Result<T, super::jobs::GitJobError> {
    use super::jobs::*;
    let (send, receive) = tokio::sync::oneshot::channel();
    let handle = runner.submit(
        context,
        GitJobRequest::new(action, JobScope::Read, origin),
        move |job| {
            let value = operation(job).map_err(|e| {
                GitJobError::new(match e.code {
                    GitErrorCode::Cancelled => GitJobErrorCode::Cancelled,
                    GitErrorCode::Timeout => GitJobErrorCode::Timeout,
                    GitErrorCode::StateChanged => GitJobErrorCode::StalePlan,
                    GitErrorCode::TooLarge => GitJobErrorCode::TooLarge,
                    GitErrorCode::PathRejected => GitJobErrorCode::Unsupported,
                    _ => GitJobErrorCode::Transport,
                })
            })?;
            job.guard()?;
            send.send(value)
                .map_err(|_| GitJobError::new(GitJobErrorCode::Cancelled))?;
            Ok(GitJobResult::default())
        },
    );
    match handle.wait().await {
        GitJobOutcome::Success(_) => receive
            .await
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io)),
        GitJobOutcome::Failed(e)
        | GitJobOutcome::NeedsInput(e)
        | GitJobOutcome::StalePlan(e)
        | GitJobOutcome::Uncertain(e) => Err(e),
    }
}
pub async fn diff_refs_job(
    runner: &super::jobs::GitJobRunner,
    context: super::context::RepoContext,
    origin: super::jobs::JobOrigin,
    req: GitDiffRefsRequest,
) -> Result<GitRefsDiff, super::jobs::GitJobError> {
    read_job(runner, context, origin, "git_diff_refs", move |job| {
        diff_refs_with(job, &job.context.project_prefix, &req)
    })
    .await
}
pub async fn safety_list_job(
    runner: &super::jobs::GitJobRunner,
    context: super::context::RepoContext,
    origin: super::jobs::JobOrigin,
) -> Result<GitSafetyList, super::jobs::GitJobError> {
    read_job(runner, context, origin, "git_safety_list", |job| {
        safety_list_with(job)
    })
    .await
}

#[cfg(test)]
mod job_tests {
    use super::*;
    use crate::git::{context::*, jobs::*};
    #[tokio::test]
    async fn shared_read_jobs_bind_sha_and_block_unknown_dirty_agent_state() {
        let dir = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(dir.path())
            .status()
            .unwrap()
            .success());
        let locks = tempfile::tempdir().unwrap();
        let runner = GitJobRunner::new(locks.path().join("jobs")).unwrap();
        let ctx = RepoContext::discover(dir.path(), WorkspaceState::default()).unwrap();
        let err = diff_refs_job(
            &runner,
            ctx.clone(),
            JobOrigin::Agent,
            GitDiffRefsRequest {
                base: None,
                target: None,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code, GitJobErrorCode::EditorStateUnknown);
        let mut ws = WorkspaceState {
            editor_state_known: true,
            generation: 1,
            ..Default::default()
        };
        runner.update_workspace(&ctx.root, ws.clone()).unwrap();
        let ready = RepoContext::discover(dir.path(), ws.clone()).unwrap();
        let out = diff_refs_job(
            &runner,
            ready.clone(),
            JobOrigin::Agent,
            GitDiffRefsRequest {
                base: None,
                target: None,
            },
        )
        .await
        .unwrap();
        assert!(out.files.is_empty());
        assert_eq!(out.base_tree, out.target_tree);
        ws.generation = 2;
        ws.dirty_buffers.push("unsaved.html".into());
        runner.update_workspace(&ctx.root, ws.clone()).unwrap();
        let dirty = RepoContext::discover(dir.path(), ws).unwrap();
        assert_eq!(
            safety_list_job(&runner, dirty, JobOrigin::Agent)
                .await
                .unwrap_err()
                .code,
            GitJobErrorCode::DirtyState
        );
        assert_eq!(
            safety_list_job(&runner, ready, JobOrigin::Human)
                .await
                .unwrap_err()
                .code,
            GitJobErrorCode::StalePlan
        );
    }
    #[test]
    fn invalidation_keeps_editor_buffers_and_ai_holds() {
        let dir = tempfile::tempdir().unwrap();
        let runner = GitJobRunner::new(dir.path().join("locks")).unwrap();
        let ws = WorkspaceState {
            generation: 4,
            editor_state_known: true,
            editor_leases: vec!["editor".into()],
            dirty_buffers: vec!["a".into()],
            ai_holds: vec!["review".into()],
        };
        runner.update_workspace(dir.path(), ws.clone()).unwrap();
        assert_eq!(
            crate::git::invalidation::advance_workspace_generation(&runner, dir.path()).unwrap(),
            5
        );
        let live = runner.workspace(dir.path()).unwrap();
        assert_eq!(live.dirty_buffers, ws.dirty_buffers);
        assert_eq!(live.editor_leases, ws.editor_leases);
        assert_eq!(live.ai_holds, ws.ai_holds);
        assert!(live.editor_state_known);
    }
}
