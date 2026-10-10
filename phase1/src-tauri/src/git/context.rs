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
}

pub(crate) fn identity(path: &Path) -> String {
    let mut hash = Sha256::new();
    // Canonical paths cannot contain surrogate encodings on Unix.
    #[cfg(unix)] {
        use std::os::unix::ffi::OsStrExt;
        hash.update(path.as_os_str().as_bytes());
    }
    #[cfg(not(unix))] hash.update(path.to_string_lossy().as_bytes());
    format!("{:x}", hash.finalize())
}

impl RepoContext {
    pub fn discover(project: &Path, workspace: WorkspaceState) -> Result<Self, GitJobError> {
        let project = project.canonicalize().map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        let cancel = Cancellation::default();
        let read = |args: &[&str]| -> Result<String, GitJobError> {
            let out = GitCommand::new(args.iter().copied()).checked(&project, &cancel)?;
            if out.truncated { return Err(GitJobError::new(GitJobErrorCode::TooLarge)); }
            let text = String::from_utf8(out.stdout).map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
            // Strip Git's single line ending, not whitespace in a legitimate path.
            Ok(text.strip_suffix('\n').unwrap_or(&text).trim_end_matches('\r').to_owned())
        };
        let canonical = |s: String| -> Result<PathBuf, GitJobError> {
            PathBuf::from(s).canonicalize().map_err(|_| GitJobError::new(GitJobErrorCode::Io))
        };
        let root = canonical(read(&["rev-parse", "--show-toplevel"] )?)?;
        let common_git_dir = canonical(read(&["rev-parse", "--path-format=absolute", "--git-common-dir"] )?)?;
        let git_dir = canonical(read(&["rev-parse", "--absolute-git-dir"] )?)?;
        let optional = |args: &[&str]| -> Result<Option<String>, GitJobError> {
            let out = GitCommand::new(args.iter().copied()).run(&project, &cancel)?;
            if out.code == Some(0) {
                Ok(Some(String::from_utf8(out.stdout).map_err(|_| GitJobError::new(GitJobErrorCode::Io))?.trim().to_owned()))
            } else if out.code == Some(1) || out.code == Some(128) { Ok(None) }
            else { Err(GitJobError::new(GitJobErrorCode::Transport)) }
        };
        let project_prefix = project.strip_prefix(&root).map_err(|_| GitJobError::new(GitJobErrorCode::NotARepo))?
            .to_string_lossy().replace('\\', "/");
        Ok(Self {
            repo_id: identity(&common_git_dir), checkout_id: identity(&root), root, common_git_dir, git_dir,
            task_id: None, branch: optional(&["symbolic-ref", "--quiet", "--short", "HEAD"] )?,
            head: optional(&["rev-parse", "--verify", "HEAD"] )?, project_prefix, workspace,
        })
    }
}
