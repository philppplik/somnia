//! Canonical repository identity and authoritative editor state.
use super::command::GitCommand;
use super::jobs::{Cancellation, GitJobError, GitJobErrorCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub generation: u64,
    pub editor_state_known: bool,
    pub editor_leases: Vec<String>,
    pub dirty_buffers: Vec<String>,
    pub ai_holds: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoDirtyState {
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub conflicted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoContext {
    pub repo_id: String,
    pub checkout_id: String,
    pub root: PathBuf,
    pub common_git_dir: PathBuf,
    pub git_dir: PathBuf,
    pub task_id: Option<String>,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub project_prefix: String,
    pub workspace: WorkspaceState,
    pub dirty: RepoDirtyState,
}

pub(crate) fn identity(path: &Path) -> String {
    let mut hash = Sha256::new();
    // Canonical paths cannot contain surrogate encodings on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hash.update(path.as_os_str().as_bytes());
    }
    #[cfg(not(unix))]
    hash.update(path.to_string_lossy().as_bytes());
    format!("{:x}", hash.finalize())
}

impl RepoContext {
    pub fn discover(project: &Path, workspace: WorkspaceState) -> Result<Self, GitJobError> {
        Self::discover_cancellable(project, workspace, &Cancellation::default())
    }
    pub(crate) fn discover_cancellable(
        project: &Path,
        workspace: WorkspaceState,
        cancel: &Cancellation,
    ) -> Result<Self, GitJobError> {
        let project = project
            .canonicalize()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        let read = |args: &[&str]| -> Result<String, GitJobError> {
            let out = GitCommand::new(args.iter().copied()).checked(&project, cancel)?;
            if out.truncated {
                return Err(GitJobError::new(GitJobErrorCode::TooLarge));
            }
            let text =
                String::from_utf8(out.stdout).map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
            // Strip Git's single line ending, not whitespace in a legitimate path.
            Ok(text
                .strip_suffix('\n')
                .unwrap_or(&text)
                .trim_end_matches('\r')
                .to_owned())
        };
        let canonical = |s: String| -> Result<PathBuf, GitJobError> {
            PathBuf::from(s)
                .canonicalize()
                .map_err(|_| GitJobError::new(GitJobErrorCode::Io))
        };
        let root = canonical(read(&["rev-parse", "--show-toplevel"])?)?;
        let common_git_dir = canonical(read(&[
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
        ])?)?;
        let git_dir = canonical(read(&["rev-parse", "--absolute-git-dir"])?)?;
        let optional = |args: &[&str]| -> Result<Option<String>, GitJobError> {
            let out = GitCommand::new(args.iter().copied()).run(&project, cancel)?;
            if out.code == Some(0) {
                Ok(Some(
                    String::from_utf8(out.stdout)
                        .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?
                        .trim()
                        .to_owned(),
                ))
            } else if out.code == Some(1) || out.code == Some(128) {
                Ok(None)
            } else {
                Err(GitJobError::new(GitJobErrorCode::Transport))
            }
        };
        let project_prefix = project
            .strip_prefix(&root)
            .map_err(|_| GitJobError::new(GitJobErrorCode::NotARepo))?
            .to_string_lossy()
            .replace('\\', "/");
        let status =
            GitCommand::new(["status", "--porcelain=v1", "-z", "--untracked-files=normal"])
                .checked(&root, cancel)?;
        if status.truncated {
            return Err(GitJobError::new(GitJobErrorCode::TooLarge));
        }
        let mut dirty = RepoDirtyState::default();
        let mut entries = status.stdout.split(|byte| *byte == 0);
        while let Some(entry) = entries.next() {
            if entry.is_empty() {
                continue;
            }
            if entry.len() < 3 {
                return Err(GitJobError::new(GitJobErrorCode::Io));
            }
            let x = entry[0];
            let y = entry[1];
            if x == b'?' && y == b'?' {
                dirty.untracked = true;
                continue;
            }
            dirty.staged |= x != b' ';
            dirty.unstaged |= y != b' ';
            dirty.conflicted |=
                x == b'U' || y == b'U' || (x == b'A' && y == b'A') || (x == b'D' && y == b'D');
            if x == b'R' || x == b'C' || y == b'R' || y == b'C' {
                let _ = entries.next();
            }
        }
        Ok(Self {
            repo_id: identity(&common_git_dir),
            checkout_id: identity(&root),
            root,
            common_git_dir,
            git_dir,
            task_id: None,
            branch: optional(&["symbolic-ref", "--quiet", "--short", "HEAD"])?,
            head: optional(&["rev-parse", "--verify", "HEAD"])?,
            project_prefix,
            workspace,
            dirty,
        })
    }
}
