//! Desktop/Board contract adapter. Read-only, immutable object IDs, project-relative paths.
use super::{ref_reads::*, *};
#[derive(Clone, Debug, Deserialize)]
pub struct DiffRequest {
    pub from: String,
    pub to: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct RefSide {
    pub r#ref: String,
    pub sha: String,
    pub tree: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub kind: GitChangeKind,
    pub binary: bool,
    pub size_bytes: u64,
    pub before_blob: Option<String>,
    pub after_blob: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
    pub patch_truncated: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct DiffResult {
    pub from: RefSide,
    pub to: RefSide,
    pub files: Vec<RefFile>,
    pub truncated: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct SafetyEntry {
    pub r#ref: String,
    pub sha: String,
    pub time: i64,
    pub scope: Vec<String>,
    pub operation: String,
    pub subject: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub path: String,
    pub blob: String,
    pub size_bytes: u64,
    pub binary: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct RefTree {
    pub side: RefSide,
    pub entries: Vec<TreeEntry>,
    pub truncated: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobRead {
    pub blob: String,
    pub binary: bool,
    pub too_large: bool,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

fn read(exec: &dyn RefReadExecutor, args: &[&OsStr]) -> GResult<RefReadOutput> {
    let out = exec.execute(args, None)?;
    if out.code != Some(0) {
        return Err(GitError::new(
            GitErrorCode::Unknown,
            "Git object read failed",
        ));
    }
    if out.truncated {
        return Err(GitError::new(
            GitErrorCode::TooLarge,
            "Git object output exceeded its limit",
        ));
    }
    Ok(out)
}
fn utf8(bytes: Vec<u8>) -> GResult<String> {
    String::from_utf8(bytes)
        .map_err(|_| GitError::new(GitErrorCode::PathRejected, "Git path is not UTF-8"))
}
fn safe_ref(value: &str) -> GResult<()> {
    if value.is_empty()
        || value.len() > 200
        || value.starts_with('-')
        || value.contains("..")
        || value.contains("@{")
        || value
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || "~^:?*[\\".contains(c))
    {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Invalid version reference",
        ));
    }
    Ok(())
}
fn side(exec: &dyn RefReadExecutor, name: &str, prefix: &str) -> GResult<RefSide> {
    safe_ref(name)?;
    let commit_spec = format!("{name}^{{commit}}");
    let sha = utf8(
        read(
            exec,
            &[
                OsStr::new("rev-parse"),
                OsStr::new("--verify"),
                OsStr::new("--end-of-options"),
                OsStr::new(&commit_spec),
            ],
        )?
        .stdout,
    )?
    .trim()
    .to_owned();
    let tree_spec = if prefix.is_empty() {
        format!("{sha}^{{tree}}")
    } else {
        format!("{sha}:{prefix}")
    };
    let tree = utf8(
        read(
            exec,
            &[
                OsStr::new("rev-parse"),
                OsStr::new("--verify"),
                OsStr::new(&tree_spec),
            ],
        )?
        .stdout,
    )?
    .trim()
    .to_owned();
    let kind = read(
        exec,
        &[OsStr::new("cat-file"), OsStr::new("-t"), OsStr::new(&tree)],
    )?;
    if kind.stdout != b"tree\n" {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Project scope is not a tree",
        ));
    }
    Ok(RefSide {
        r#ref: name.into(),
        sha,
        tree,
    })
}
fn relative(path: &str, prefix: &str) -> GResult<String> {
    strip_prefix(prefix, path)
        .map(str::to_owned)
        .ok_or_else(|| GitError::new(GitErrorCode::PathRejected, "Diff path is outside project"))
}
pub fn diff(
    exec: &dyn RefReadExecutor,
    prefix: &str,
    request: &DiffRequest,
) -> GResult<DiffResult> {
    let from = side(exec, &request.from, prefix)?;
    let to = side(exec, &request.to, prefix)?;
    let native = diff_refs_with(
        exec,
        prefix,
        &GitDiffRefsRequest {
            base: Some(from.sha.clone()),
            target: Some(to.sha.clone()),
        },
    )?;
    let mut files = Vec::new();
    let mut patch_budget = MAX_UNIFIED;
    for f in native.files {
        let mut patch = None;
        let mut patch_truncated = f.too_large;
        if !f.binary && !f.too_large && patch_budget > 0 {
            let pathspec = format!(":(literal){}", f.path);
            let mut args: Vec<std::ffi::OsString> = vec![
                "diff".into(),
                "--no-ext-diff".into(),
                "--no-textconv".into(),
                "--no-color".into(),
                "--find-renames".into(),
                "--patch".into(),
                from.sha.clone().into(),
                to.sha.clone().into(),
                "--".into(),
                pathspec.into(),
            ];
            if let Some(old) = &f.old_path {
                args.push(format!(":(literal){old}").into());
            }
            let refs: Vec<_> = args.iter().map(|s| s.as_os_str()).collect();
            let output = exec.execute(&refs, None)?;
            if output.code != Some(0) {
                return Err(GitError::new(
                    GitErrorCode::Unknown,
                    "File patch read failed",
                ));
            }
            if output.truncated || output.stdout.len() > patch_budget {
                patch_truncated = true;
            } else {
                patch_budget -= output.stdout.len();
                patch = Some(String::from_utf8_lossy(&output.stdout).into_owned());
            }
        } else if !f.binary {
            patch_truncated = true;
        }
        files.push(RefFile {
            path: relative(&f.path, prefix)?,
            old_path: f
                .old_path
                .as_deref()
                .map(|p| relative(p, prefix))
                .transpose()?,
            kind: f.kind,
            binary: f.binary,
            size_bytes: f.before_bytes.unwrap_or(0).max(f.after_bytes.unwrap_or(0)),
            before_blob: f.before_blob,
            after_blob: f.after_blob,
            patch,
            patch_truncated,
        });
    }
    Ok(DiffResult {
        from,
        to,
        files,
        truncated: native.truncated,
    })
}
pub fn safety(exec: &dyn RefReadExecutor) -> GResult<Vec<SafetyEntry>> {
    let list = safety_list_with(exec)?;
    if list.truncated {
        return Err(GitError::new(
            GitErrorCode::TooLarge,
            "Safety browser exceeds 500 entries",
        ));
    }
    Ok(list
        .points
        .into_iter()
        .map(|s| SafetyEntry {
            r#ref: s.reference,
            sha: s.sha,
            time: s.time,
            scope: s.scope.unwrap_or_default(),
            operation: match s.source_operation.as_deref() {
                Some("restore") | Some("combine") | Some("variant-delete") => {
                    s.source_operation.unwrap()
                }
                _ => "other".into(),
            },
            subject: s.subject,
        })
        .collect())
}
pub fn read_blob(exec: &dyn RefReadExecutor, blob: &str) -> GResult<BlobRead> {
    if !matches!(blob.len(), 40 | 64)
        || !blob
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(GitError::new(GitErrorCode::PathRejected, "Invalid blob id"));
    }
    if read(
        exec,
        &[OsStr::new("cat-file"), OsStr::new("-t"), OsStr::new(blob)],
    )?
    .stdout
        != b"blob\n"
    {
        return Err(GitError::new(
            GitErrorCode::PathRejected,
            "Object is not a blob",
        ));
    }
    let size_bytes = utf8(
        read(
            exec,
            &[OsStr::new("cat-file"), OsStr::new("-s"), OsStr::new(blob)],
        )?
        .stdout,
    )?
    .trim()
    .parse::<u64>()
    .map_err(|_| GitError::new(GitErrorCode::Unknown, "Invalid blob size"))?;
    if size_bytes > MAX_DIFF_SIDE as u64 {
        return Ok(BlobRead {
            blob: blob.into(),
            binary: false,
            too_large: true,
            size_bytes,
            text: None,
        });
    }
    let bytes = read(
        exec,
        &[OsStr::new("cat-file"), OsStr::new("blob"), OsStr::new(blob)],
    )?
    .stdout;
    let binary = bytes.iter().take(8000).any(|b| *b == 0) || std::str::from_utf8(&bytes).is_err();
    Ok(BlobRead {
        blob: blob.into(),
        binary,
        too_large: false,
        size_bytes,
        text: (!binary).then(|| String::from_utf8(bytes).expect("UTF-8 checked")),
    })
}
pub fn tree(exec: &dyn RefReadExecutor, prefix: &str, name: &str) -> GResult<RefTree> {
    let side = side(exec, name, prefix)?;
    let output = read(
        exec,
        &[
            OsStr::new("ls-tree"),
            OsStr::new("-r"),
            OsStr::new("-z"),
            OsStr::new("-l"),
            OsStr::new(&side.tree),
        ],
    )?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for record in output.stdout.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        if entries.len() == MAX_CHANGES {
            truncated = true;
            break;
        }
        let separator = record
            .iter()
            .position(|b| *b == b'\t')
            .ok_or_else(|| GitError::new(GitErrorCode::Unknown, "Invalid tree record"))?;
        let meta = utf8(record[..separator].to_vec())?;
        let fields: Vec<_> = meta.split_whitespace().collect();
        if fields.len() != 4 {
            return Err(GitError::new(
                GitErrorCode::Unknown,
                "Invalid tree metadata",
            ));
        }
        if fields[1] != "blob" {
            truncated = true;
            continue;
        } // submodules aren't complete snapshots
        let path = utf8(record[separator + 1..].to_vec())?;
        let size_bytes = fields[3]
            .parse::<u64>()
            .map_err(|_| GitError::new(GitErrorCode::Unknown, "Invalid tree size"))?;
        // Only read bounded blobs; giant entries cause the snapshot layer to report incomplete.
        let binary = if size_bytes <= MAX_DIFF_SIDE as u64 {
            read_blob(exec, fields[2])?.binary
        } else {
            false
        };
        entries.push(TreeEntry {
            path,
            blob: fields[2].into(),
            size_bytes,
            binary,
        });
    }
    Ok(RefTree {
        side,
        entries,
        truncated,
    })
}

pub async fn diff_job(
    runner: &jobs::GitJobRunner,
    context: context::RepoContext,
    origin: jobs::JobOrigin,
    request: DiffRequest,
) -> Result<DiffResult, jobs::GitJobError> {
    super::ref_reads::read_job(runner, context, origin, "git_diff_refs", move |job| {
        diff(job, &job.context.project_prefix, &request)
    })
    .await
}
pub async fn safety_job(
    runner: &jobs::GitJobRunner,
    context: context::RepoContext,
    origin: jobs::JobOrigin,
) -> Result<Vec<SafetyEntry>, jobs::GitJobError> {
    super::ref_reads::read_job(runner, context, origin, "git_safety_list", |job| {
        safety(job)
    })
    .await
}
pub async fn tree_job(
    runner: &jobs::GitJobRunner,
    context: context::RepoContext,
    origin: jobs::JobOrigin,
    name: String,
) -> Result<RefTree, jobs::GitJobError> {
    super::ref_reads::read_job(runner, context, origin, "git_ref_tree", move |job| {
        tree(job, &job.context.project_prefix, &name)
    })
    .await
}
pub async fn blob_job(
    runner: &jobs::GitJobRunner,
    context: context::RepoContext,
    origin: jobs::JobOrigin,
    blob: String,
) -> Result<BlobRead, jobs::GitJobError> {
    super::ref_reads::read_job(runner, context, origin, "git_read_blob", move |job| {
        read_blob(job, &blob)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Exec(PathBuf);
    impl RefReadExecutor for Exec {
        fn execute(&self, args: &[&OsStr], stdin: Option<&[u8]>) -> GResult<RefReadOutput> {
            let out = run_git(&self.0, args, Mode::Read, READ_TIMEOUT, stdin, &[])?;
            Ok(RefReadOutput {
                code: out.code,
                stdout: out.stdout,
                truncated: out.capped,
            })
        }
    }
    fn git(p: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(args)
            .current_dir(p)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().into()
    }
    #[test]
    fn s6_wire_shapes_scoped_tree_blob_and_bounded_patch() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        git(p, &["init", "-q"]);
        git(p, &["config", "user.name", "Test"]);
        git(p, &["config", "user.email", "test@example.invalid"]);
        std::fs::create_dir(p.join("site")).unwrap();
        std::fs::write(p.join("site/a.html"), "before\n").unwrap();
        std::fs::write(p.join("other.txt"), "outside").unwrap();
        git(p, &["add", "-A"]);
        git(p, &["commit", "-qm", "before"]);
        let a = git(p, &["rev-parse", "HEAD"]);
        std::fs::write(p.join("site/a.html"), "after\n").unwrap();
        std::fs::write(p.join("site/image.bin"), [0, 1, 2]).unwrap();
        git(p, &["add", "-A"]);
        git(p, &["commit", "-qm", "after"]);
        let exec = Exec(p.into());
        let request = DiffRequest {
            from: a,
            to: "HEAD".into(),
        };
        let result = diff(&exec, "site", &request).unwrap();
        assert_eq!(result.files.len(), 2);
        assert_eq!(result.files[0].path, "a.html");
        assert!(result.files[0].patch.as_ref().unwrap().contains("+after"));
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["from"]["ref"], request.from);
        assert!(json["files"][0]["beforeBlob"].is_string());
        assert!(json["files"][0]["patchTruncated"].is_boolean());
        let tree = tree(&exec, "site", "HEAD").unwrap();
        assert_eq!(tree.entries.len(), 2);
        assert_eq!(tree.side.tree, result.to.tree);
        let entry = tree.entries.iter().find(|e| e.path == "a.html").unwrap();
        let text = read_blob(&exec, &entry.blob).unwrap();
        assert_eq!(text.text.as_deref(), Some("after\n"));
        assert!(!text.binary);
        let image = tree.entries.iter().find(|e| e.path == "image.bin").unwrap();
        assert!(image.binary);
        assert!(read_blob(&exec, &image.blob).unwrap().text.is_none());
        assert!(read_blob(&exec, &result.to.sha).is_err());
        assert!(read_blob(&exec, "--help").is_err());
        git(
            p,
            &["update-ref", "refs/somnia/safety/legacy", &result.to.sha],
        );
        let safety = safety(&exec).unwrap();
        let json = serde_json::to_value(&safety).unwrap();
        assert!(json.is_array());
        assert_eq!(json[0]["operation"], "other");
        assert_eq!(json[0]["scope"], serde_json::json!([]));
        assert!(json[0]["ref"]
            .as_str()
            .unwrap()
            .starts_with("refs/somnia/safety/"));
    }
    #[test]
    fn empty_or_option_like_external_refs_are_rejected() {
        for name in ["", "--all", "a b", "HEAD~1", "a..b", "x\n"] {
            assert!(safe_ref(name).is_err());
        }
    }
}

#[cfg(test)]
mod parser_tests {
    use super::*;
    struct Capped;
    impl RefReadExecutor for Capped {
        fn execute(&self, _args: &[&OsStr], _stdin: Option<&[u8]>) -> GResult<RefReadOutput> {
            Ok(RefReadOutput {
                code: Some(0),
                stdout: b"partial".to_vec(),
                truncated: true,
            })
        }
    }
    #[test]
    fn public_null_refs_and_truncated_objects_cannot_be_accepted() {
        assert!(serde_json::from_str::<DiffRequest>(r#"{"from":null,"to":"HEAD"}"#).is_err());
        assert_eq!(
            read(&Capped, &[OsStr::new("cat-file")]).err().unwrap().code,
            GitErrorCode::TooLarge
        );
    }
}
