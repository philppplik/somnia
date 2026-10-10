//! Shared queue, locks, progress and secret-free outcomes for all native hosts.
use super::command::{GitCommand, GitCommandOutput};
use super::context::{RepoContext, WorkspaceState};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

#[derive(Clone, Default)]
pub struct Cancellation(Arc<AtomicBool>);
impl Cancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GitJobErrorCode {
    GitMissing,
    NotARepo,
    IdentityMissing,
    Signing,
    AuthReconnect,
    Sso,
    Permission,
    Protection,
    DirtyState,
    EditorStateUnknown,
    AiReviewPending,
    Divergence,
    Transport,
    Cancelled,
    Timeout,
    StalePlan,
    Io,
    TooLarge,
    Unsupported,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitJobError {
    pub code: GitJobErrorCode,
    pub message: String,
}
impl GitJobError {
    pub fn new(code: GitJobErrorCode) -> Self {
        let message = match code {
            GitJobErrorCode::GitMissing => "System Git is missing",
            GitJobErrorCode::NotARepo => "Not a Git repository",
            GitJobErrorCode::IdentityMissing => "Configure your Git identity",
            GitJobErrorCode::Signing => "Git signing failed",
            GitJobErrorCode::AuthReconnect => "Reconnect the selected account",
            GitJobErrorCode::Sso => "Organization SSO approval is needed",
            GitJobErrorCode::Permission => "Repository permission or scope is missing",
            GitJobErrorCode::Protection => "Repository protection denied the operation",
            GitJobErrorCode::DirtyState => "Save editor buffers before agent Git operations",
            GitJobErrorCode::EditorStateUnknown => "Authoritative editor state is unavailable",
            GitJobErrorCode::AiReviewPending => "Finish pending AI review first",
            GitJobErrorCode::Divergence => "Local and remote history diverged",
            GitJobErrorCode::Transport => "Git command failed",
            GitJobErrorCode::Cancelled => "Git job cancelled",
            GitJobErrorCode::Timeout => "Git job deadline expired",
            GitJobErrorCode::StalePlan => "Workspace changed; review again",
            GitJobErrorCode::Io => "Git service I/O failed",
            GitJobErrorCode::TooLarge => "Git output exceeded its bound",
            GitJobErrorCode::Unsupported => "Unsupported Git command",
        };
        Self {
            code,
            message: message.into(),
        }
    }
}
impl std::fmt::Display for GitJobError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for GitJobError {}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum JobScope {
    Read,
    CheckoutWrite,
    SharedWrite,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum JobOrigin {
    Human,
    Agent,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobRequest {
    pub request_id: String,
    pub action: String,
    pub scope: JobScope,
    pub origin: JobOrigin,
    pub account_id: Option<String>,
    pub auth_route: Option<String>,
    pub plan_id: Option<String>,
}
impl GitJobRequest {
    pub fn new(action: impl Into<String>, scope: JobScope, origin: JobOrigin) -> Self {
        Self {
            request_id: uuid::Uuid::new_v4().to_string(),
            action: action.into(),
            scope,
            origin,
            account_id: None,
            auth_route: None,
            plan_id: None,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitJobResult {
    pub shas: Vec<String>,
    pub destinations: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "outcome", content = "result", rename_all = "kebab-case")]
pub enum GitJobOutcome {
    Success(GitJobResult),
    Failed(GitJobError),
    NeedsInput(GitJobError),
    StalePlan(GitJobError),
    Uncertain(GitJobError),
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum JobPhase {
    Queued,
    WaitingForLock,
    Running,
    CommandStarted,
    CommandFinished,
    Finished,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobProgress {
    pub request_id: String,
    pub sequence: u64,
    pub phase: JobPhase,
}
struct Progress {
    request_id: String,
    sequence: AtomicU64,
    events: Mutex<Vec<GitJobProgress>>,
}
impl Progress {
    fn emit(&self, phase: JobPhase) {
        let mut events = self.events.lock().unwrap();
        let sequence = self.sequence.fetch_add(1, Ordering::SeqCst);
        // Bound retained progress even when an operation executes thousands of commands.
        if events.len() >= 1024 {
            events.remove(0);
        }
        events.push(GitJobProgress {
            request_id: self.request_id.clone(),
            sequence,
            phase,
        });
    }
}
struct Ticket {
    id: u64,
    repo: String,
    checkout: String,
    scope: JobScope,
}
fn conflicts(a: &Ticket, b: &Ticket) -> bool {
    a.repo == b.repo
        && (a.scope == JobScope::SharedWrite
            || b.scope == JobScope::SharedWrite
            || (a.checkout == b.checkout
                && (a.scope != JobScope::Read || b.scope != JobScope::Read)))
}
struct Inner {
    directory: PathBuf,
    workspaces: Mutex<HashMap<PathBuf, WorkspaceState>>,
    queue: Mutex<Vec<Ticket>>,
    next_ticket: AtomicU64,
}
#[derive(Clone)]
pub struct GitJobRunner {
    inner: Arc<Inner>,
}
impl GitJobRunner {
    pub fn new(lock_directory: PathBuf) -> Result<Self, GitJobError> {
        std::fs::create_dir_all(&lock_directory)
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&lock_directory, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        }
        let directory = lock_directory
            .canonicalize()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        Ok(Self {
            inner: Arc::new(Inner {
                directory,
                workspaces: Mutex::new(HashMap::new()),
                queue: Mutex::new(Vec::new()),
                next_ticket: AtomicU64::new(0),
            }),
        })
    }
    pub fn update_workspace(&self, root: &Path, state: WorkspaceState) -> Result<(), GitJobError> {
        let root = root
            .canonicalize()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        let mut workspaces = self.inner.workspaces.lock().unwrap();
        if workspaces
            .get(&root)
            .is_some_and(|old| old.generation > state.generation)
        {
            return Err(GitJobError::new(GitJobErrorCode::StalePlan));
        }
        workspaces.insert(root, state);
        Ok(())
    }
    /// Atomic watcher hint: preserves every editor field even if an editor update races it.
    /// This is invalidation only, never clean-state assertion or write permission.
    pub fn invalidate_workspace(&self, root: &Path) -> Result<u64, GitJobError> {
        let root = root
            .canonicalize()
            .map_err(|_| GitJobError::new(GitJobErrorCode::Io))?;
        let mut workspaces = self.inner.workspaces.lock().unwrap();
        let state = workspaces.entry(root).or_default();
        state.generation = state.generation.saturating_add(1);
        Ok(state.generation)
    }
    pub fn workspace(&self, root: &Path) -> Option<WorkspaceState> {
        let root = root.canonicalize().ok()?;
        self.inner.workspaces.lock().unwrap().get(&root).cloned()
    }
    pub fn submit<F>(
        &self,
        context: RepoContext,
        request: GitJobRequest,
        operation: F,
    ) -> GitJobHandle
    where
        F: FnOnce(&JobExecution) -> Result<GitJobResult, GitJobError> + Send + 'static,
    {
        // Supplied context seeds standalone state only. Never overwrite newer desktop state.
        self.inner
            .workspaces
            .lock()
            .unwrap()
            .entry(context.root.clone())
            .or_insert_with(|| context.workspace.clone());
        let cancel = Cancellation::default();
        let progress = Arc::new(Progress {
            request_id: request.request_id.clone(),
            sequence: AtomicU64::new(0),
            events: Mutex::new(Vec::new()),
        });
        progress.emit(JobPhase::Queued);
        let mut queue = self.inner.queue.lock().unwrap();
        let id = self.inner.next_ticket.fetch_add(1, Ordering::SeqCst);
        queue.push(Ticket {
            id,
            repo: context.repo_id.clone(),
            checkout: context.checkout_id.clone(),
            scope: request.scope,
        });
        drop(queue);
        let inner = self.inner.clone();
        let worker_cancel = cancel.clone();
        let worker_progress = progress.clone();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        // A dedicated blocking thread works in both Tokio desktop and standalone callers.
        std::thread::spawn(move || {
            let execution = JobExecution {
                context,
                request,
                inner: inner.clone(),
                cancel: worker_cancel,
                progress: worker_progress,
                publication_started: AtomicBool::new(false),
            };
            let removal = QueueRemoval { inner, id };
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                execution.validate_context()?;
                execution.guard()?;
                execution.progress.emit(JobPhase::WaitingForLock);
                loop {
                    if execution.cancel.is_cancelled() {
                        return Err(GitJobError::new(GitJobErrorCode::Cancelled));
                    }
                    let queue = execution.inner.queue.lock().unwrap();
                    let index = queue.iter().position(|t| t.id == id).expect("live ticket");
                    let blocked = queue[..index].iter().any(|t| conflicts(t, &queue[index]));
                    drop(queue);
                    if !blocked {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                let _locks = execution.locks()?;
                execution.validate_context()?;
                let live = RepoContext::discover_cancellable(
                    &execution.context.root,
                    execution.context.workspace.clone(),
                    &execution.cancel,
                )?;
                if live.head != execution.context.head || live.branch != execution.context.branch {
                    return Err(GitJobError::new(GitJobErrorCode::StalePlan));
                }
                execution.guard()?;
                execution.progress.emit(JobPhase::Running);
                let value = operation(&execution)?;
                execution.guard()?;
                Ok(value)
            }))
            .unwrap_or_else(|_| Err(GitJobError::new(GitJobErrorCode::Io)));
            let outcome = match result {
                Ok(result) => GitJobOutcome::Success(result),
                Err(error)
                    if execution.publication_started.load(Ordering::SeqCst)
                        && matches!(
                            error.code,
                            GitJobErrorCode::Cancelled
                                | GitJobErrorCode::Timeout
                                | GitJobErrorCode::Io
                                | GitJobErrorCode::Transport
                                | GitJobErrorCode::StalePlan
                                | GitJobErrorCode::DirtyState
                                | GitJobErrorCode::EditorStateUnknown
                                | GitJobErrorCode::AiReviewPending
                        ) =>
                {
                    GitJobOutcome::Uncertain(error)
                }
                Err(error) if error.code == GitJobErrorCode::StalePlan => {
                    GitJobOutcome::StalePlan(error)
                }
                Err(error)
                    if matches!(
                        error.code,
                        GitJobErrorCode::EditorStateUnknown
                            | GitJobErrorCode::DirtyState
                            | GitJobErrorCode::AiReviewPending
                            | GitJobErrorCode::IdentityMissing
                            | GitJobErrorCode::AuthReconnect
                            | GitJobErrorCode::Sso
                            | GitJobErrorCode::Permission
                    ) =>
                {
                    GitJobOutcome::NeedsInput(error)
                }
                Err(error) => GitJobOutcome::Failed(error),
            };
            execution.progress.emit(JobPhase::Finished);
            drop(removal);
            let _ = sender.send(outcome);
        });
        GitJobHandle {
            cancel,
            progress,
            receiver,
        }
    }
}
struct QueueRemoval {
    inner: Arc<Inner>,
    id: u64,
}
impl Drop for QueueRemoval {
    fn drop(&mut self) {
        self.inner.queue.lock().unwrap().retain(|t| t.id != self.id);
    }
}
pub struct GitJobHandle {
    cancel: Cancellation,
    progress: Arc<Progress>,
    receiver: tokio::sync::oneshot::Receiver<GitJobOutcome>,
}
impl GitJobHandle {
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    pub fn progress(&self) -> Vec<GitJobProgress> {
        self.progress.events.lock().unwrap().clone()
    }
    pub async fn wait(self) -> GitJobOutcome {
        self.receiver
            .await
            .unwrap_or_else(|_| GitJobOutcome::Failed(GitJobError::new(GitJobErrorCode::Io)))
    }
}
pub struct JobExecution {
    pub context: RepoContext,
    pub request: GitJobRequest,
    inner: Arc<Inner>,
    cancel: Cancellation,
    progress: Arc<Progress>,
    publication_started: AtomicBool,
}
impl JobExecution {
    pub fn cancellation(&self) -> Cancellation {
        self.cancel.clone()
    }
    fn validate_context(&self) -> Result<(), GitJobError> {
        let live = RepoContext::discover_cancellable(
            &self.context.root,
            self.context.workspace.clone(),
            &self.cancel,
        )?;
        if live.root != self.context.root
            || live.common_git_dir != self.context.common_git_dir
            || live.git_dir != self.context.git_dir
            || live.repo_id != self.context.repo_id
            || live.checkout_id != self.context.checkout_id
        {
            return Err(GitJobError::new(GitJobErrorCode::NotARepo));
        }
        Ok(())
    }
    pub fn guard(&self) -> Result<(), GitJobError> {
        if self.cancel.is_cancelled() {
            return Err(GitJobError::new(GitJobErrorCode::Cancelled));
        }
        let workspaces = self.inner.workspaces.lock().unwrap();
        let state = workspaces
            .get(&self.context.root)
            .ok_or_else(|| GitJobError::new(GitJobErrorCode::EditorStateUnknown))?;
        if state.generation != self.context.workspace.generation {
            return Err(GitJobError::new(GitJobErrorCode::StalePlan));
        }
        if self.request.origin == JobOrigin::Agent {
            if !state.editor_state_known {
                return Err(GitJobError::new(GitJobErrorCode::EditorStateUnknown));
            }
            if !state.dirty_buffers.is_empty() {
                return Err(GitJobError::new(GitJobErrorCode::DirtyState));
            }
            if !state.ai_holds.is_empty() {
                return Err(GitJobError::new(GitJobErrorCode::AiReviewPending));
            }
        }
        Ok(())
    }
    pub fn run(&self, command: &GitCommand) -> Result<GitCommandOutput, GitJobError> {
        self.guard()?;
        if command.is_write && self.request.scope == JobScope::Read {
            return Err(GitJobError::new(GitJobErrorCode::Unsupported));
        }
        self.progress.emit(JobPhase::CommandStarted);
        if command.may_publish {
            self.publication_started.store(true, Ordering::SeqCst);
        }
        let result = command.run(&self.context.root, &self.cancel);
        self.progress.emit(JobPhase::CommandFinished);
        result
    }
    pub fn checked(&self, command: &GitCommand) -> Result<GitCommandOutput, GitJobError> {
        self.guard()?;
        if command.is_write && self.request.scope == JobScope::Read {
            return Err(GitJobError::new(GitJobErrorCode::Unsupported));
        }
        self.progress.emit(JobPhase::CommandStarted);
        if command.may_publish {
            self.publication_started.store(true, Ordering::SeqCst);
        }
        let result = command.checked(&self.context.root, &self.cancel);
        self.progress.emit(JobPhase::CommandFinished);
        result
    }
    fn locks(&self) -> Result<Locks, GitJobError> {
        let open = |name: String| -> Result<File, GitJobError> {
            OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(self.inner.directory.join(name))
                .map_err(|_| GitJobError::new(GitJobErrorCode::Io))
        };
        let common = open(format!("repo-{}.lock", self.context.repo_id))?;
        let checkout = open(format!("checkout-{}.lock", self.context.checkout_id))?;
        self.acquire(&common, self.request.scope == JobScope::SharedWrite)?;
        if let Err(error) = self.acquire(&checkout, self.request.scope != JobScope::Read) {
            let _ = FileExt::unlock(&common);
            return Err(error);
        }
        Ok(Locks { common, checkout })
    }
    fn acquire(&self, file: &File, exclusive: bool) -> Result<(), GitJobError> {
        loop {
            self.guard()?;
            let result = if exclusive {
                FileExt::try_lock_exclusive(file)
            } else {
                FileExt::try_lock_shared(file)
            };
            match result {
                Ok(()) => return Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(_) => return Err(GitJobError::new(GitJobErrorCode::Io)),
            }
        }
    }
}
struct Locks {
    common: File,
    checkout: File,
}
impl Drop for Locks {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.checkout);
        let _ = FileExt::unlock(&self.common);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::sync::atomic::AtomicUsize;
    fn clean() -> WorkspaceState {
        WorkspaceState {
            editor_state_known: true,
            ..Default::default()
        }
    }
    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .arg(dir.path())
            .status()
            .unwrap()
            .success());
        dir
    }
    fn runner() -> (tempfile::TempDir, GitJobRunner) {
        let dir = tempfile::tempdir().unwrap();
        let runner = GitJobRunner::new(dir.path().join("locks")).unwrap();
        (dir, runner)
    }
    fn request(scope: JobScope) -> GitJobRequest {
        GitJobRequest::new("test", scope, JobOrigin::Agent)
    }
    #[test]
    fn discovers_unborn_and_nested_roots() {
        let repo = repo();
        std::fs::create_dir(repo.path().join("nested")).unwrap();
        let context = RepoContext::discover(&repo.path().join("nested"), clean()).unwrap();
        assert!(context.head.is_none());
        assert!(context.branch.is_some());
        assert_eq!(context.project_prefix, "nested");
        assert_eq!(context.root, repo.path().canonicalize().unwrap());
    }
    fn committed_repo() -> tempfile::TempDir {
        let dir = repo();
        assert!(Command::new("git")
            .current_dir(dir.path())
            .args([
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@localhost",
                "commit",
                "--allow-empty",
                "-qm",
                "base"
            ])
            .status()
            .unwrap()
            .success());
        dir
    }
    #[tokio::test]
    async fn linked_worktrees_share_repo_identity_and_allow_parallel_checkout_jobs() {
        let repo = committed_repo();
        let linked_parent = tempfile::tempdir().unwrap();
        let linked = linked_parent.path().join("linked");
        assert!(Command::new("git")
            .current_dir(repo.path())
            .args(["worktree", "add", "-qb", "linked-test"])
            .arg(&linked)
            .status()
            .unwrap()
            .success());
        let primary = RepoContext::discover(repo.path(), clean()).unwrap();
        let secondary = RepoContext::discover(&linked, clean()).unwrap();
        assert_eq!(primary.repo_id, secondary.repo_id);
        assert_ne!(primary.checkout_id, secondary.checkout_id);
        assert_ne!(secondary.git_dir, secondary.common_git_dir);
        let (_dir, runner) = runner();
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let first = runner.submit(primary, request(JobScope::CheckoutWrite), move |_| {
            entered_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(3)).unwrap();
            Ok(GitJobResult::default())
        });
        entered_rx.recv_timeout(Duration::from_secs(3)).unwrap();
        let second = runner.submit(secondary, request(JobScope::CheckoutWrite), move |_| {
            release_tx.send(()).unwrap();
            Ok(GitJobResult::default())
        });
        assert!(matches!(second.wait().await, GitJobOutcome::Success(_)));
        assert!(matches!(first.wait().await, GitJobOutcome::Success(_)));
    }
    #[tokio::test]
    async fn branch_head_change_invalidates_queued_review() {
        let repo = committed_repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        assert!(Command::new("git")
            .current_dir(repo.path())
            .args(["checkout", "-qb", "other"])
            .status()
            .unwrap()
            .success());
        assert!(matches!(
            runner
                .submit(context, request(JobScope::Read), |_| panic!())
                .wait()
                .await,
            GitJobOutcome::StalePlan(_)
        ));
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn timed_out_remote_write_is_uncertain_but_remote_read_is_failed() {
        let repo = repo();
        let (_dir, runner) = runner();
        assert!(Command::new("git")
            .current_dir(repo.path())
            .args(["config", "alias.slow", "!sleep 10"])
            .status()
            .unwrap()
            .success());
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        for publish in [true, false] {
            let job = runner.submit(context.clone(), request(JobScope::SharedWrite), move |e| {
                e.checked(
                    &GitCommand::new(["slow"])
                        .network(publish)
                        .timeout(Duration::from_millis(40)),
                )?;
                Ok(GitJobResult::default())
            });
            let outcome = job.wait().await;
            if publish {
                assert!(
                    matches!(outcome, GitJobOutcome::Uncertain(e) if e.code == GitJobErrorCode::Timeout)
                );
            } else {
                assert!(
                    matches!(outcome, GitJobOutcome::Failed(e) if e.code == GitJobErrorCode::Timeout)
                );
            }
        }
    }
    #[tokio::test]
    async fn regressing_workspace_generation_is_rejected() {
        let repo = repo();
        let (_dir, runner) = runner();
        runner
            .update_workspace(
                repo.path(),
                WorkspaceState {
                    generation: 3,
                    ..clean()
                },
            )
            .unwrap();
        assert_eq!(
            runner
                .update_workspace(repo.path(), clean())
                .err()
                .unwrap()
                .code,
            GitJobErrorCode::StalePlan
        );
    }
    #[test]
    fn tracks_disk_dirty_state_separately_from_editor_buffers() {
        let repo = repo();
        std::fs::write(repo.path().join("untracked"), "disk content").unwrap();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        assert!(context.dirty.untracked);
        assert!(!context.dirty.staged);
        assert!(context.workspace.dirty_buffers.is_empty());
        assert!(Command::new("git")
            .current_dir(repo.path())
            .args(["add", "untracked"])
            .status()
            .unwrap()
            .success());
        std::fs::write(repo.path().join("untracked"), "new disk content").unwrap();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        assert!(context.dirty.staged);
        assert!(context.dirty.unstaged);
        assert!(!context.dirty.untracked);
    }
    #[tokio::test]
    async fn agent_blocks_unsaved_unknown_and_ai_holds() {
        for (state, code) in [
            (
                WorkspaceState::default(),
                GitJobErrorCode::EditorStateUnknown,
            ),
            (
                WorkspaceState {
                    dirty_buffers: vec!["draft".into()],
                    ..clean()
                },
                GitJobErrorCode::DirtyState,
            ),
            (
                WorkspaceState {
                    ai_holds: vec!["review".into()],
                    ..clean()
                },
                GitJobErrorCode::AiReviewPending,
            ),
        ] {
            let repo = repo();
            let (_dir, runner) = runner();
            let context = RepoContext::discover(repo.path(), state).unwrap();
            let handle = runner.submit(context, request(JobScope::Read), |_| {
                panic!("must not execute")
            });
            assert!(matches!(handle.wait().await, GitJobOutcome::NeedsInput(e) if e.code == code));
        }
    }
    #[tokio::test]
    async fn stale_generation_and_forged_context_rejected() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        runner
            .update_workspace(
                repo.path(),
                WorkspaceState {
                    generation: 1,
                    ..clean()
                },
            )
            .unwrap();
        assert!(matches!(
            runner
                .submit(context.clone(), request(JobScope::Read), |_| panic!())
                .wait()
                .await,
            GitJobOutcome::StalePlan(_)
        ));
        let mut forged = context;
        forged.repo_id = "wrong".into();
        assert!(
            matches!(runner.submit(forged, request(JobScope::Read), |_| panic!()).wait().await, GitJobOutcome::Failed(e) if e.code == GitJobErrorCode::NotARepo)
        );
    }
    #[tokio::test]
    async fn writes_are_fifo_and_cancelled_queue_does_not_run() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let order = Arc::new(Mutex::new(Vec::new()));
        let one_order = order.clone();
        let one = runner.submit(
            context.clone(),
            request(JobScope::CheckoutWrite),
            move |_| {
                std::thread::sleep(Duration::from_millis(70));
                one_order.lock().unwrap().push(1);
                Ok(GitJobResult::default())
            },
        );
        let cancelled = runner.submit(context.clone(), request(JobScope::CheckoutWrite), |_| {
            panic!("cancelled job ran")
        });
        cancelled.cancel();
        let two_order = order.clone();
        let two = runner.submit(context, request(JobScope::CheckoutWrite), move |_| {
            two_order.lock().unwrap().push(2);
            Ok(GitJobResult::default())
        });
        assert!(matches!(one.wait().await, GitJobOutcome::Success(_)));
        assert!(
            matches!(cancelled.wait().await, GitJobOutcome::Failed(e) if e.code == GitJobErrorCode::Cancelled)
        );
        assert!(matches!(two.wait().await, GitJobOutcome::Success(_)));
        assert_eq!(*order.lock().unwrap(), vec![1, 2]);
    }
    #[tokio::test]
    async fn progress_is_ordered_and_raw_commands_are_not_logged() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let job = runner.submit(context, request(JobScope::Read), |execution| {
            let out = execution.checked(&GitCommand::new(["status", "--porcelain"]))?;
            assert_eq!(out.code, Some(0));
            Ok(GitJobResult::default())
        });
        let started = std::time::Instant::now();
        loop {
            if job.progress().iter().any(|e| e.phase == JobPhase::Finished) {
                break;
            }
            assert!(started.elapsed() < Duration::from_secs(5));
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let events = job.progress();
        for pair in events.windows(2) {
            assert!(pair[0].sequence < pair[1].sequence);
        }
        assert!(events.iter().any(|e| e.phase == JobPhase::CommandStarted));
        assert!(matches!(job.wait().await, GitJobOutcome::Success(_)));
    }
    #[tokio::test]
    async fn cross_runner_file_locks_exclude_writes() {
        let repo = repo();
        let (dir, runner1) = runner();
        let runner2 = GitJobRunner::new(dir.path().join("locks")).unwrap();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let active = Arc::new(AtomicUsize::new(0));
        let overlap = Arc::new(AtomicBool::new(false));
        let operation = |a: Arc<AtomicUsize>, o: Arc<AtomicBool>| {
            move |_: &JobExecution| {
                if a.fetch_add(1, Ordering::SeqCst) != 0 {
                    o.store(true, Ordering::SeqCst);
                }
                std::thread::sleep(Duration::from_millis(50));
                a.fetch_sub(1, Ordering::SeqCst);
                Ok(GitJobResult::default())
            }
        };
        let first = runner1.submit(
            context.clone(),
            request(JobScope::SharedWrite),
            operation(active.clone(), overlap.clone()),
        );
        let second = runner2.submit(
            context,
            request(JobScope::CheckoutWrite),
            operation(active, overlap.clone()),
        );
        assert!(matches!(first.wait().await, GitJobOutcome::Success(_)));
        assert!(matches!(second.wait().await, GitJobOutcome::Success(_)));
        assert!(!overlap.load(Ordering::SeqCst));
    }
    #[tokio::test]
    async fn read_scope_cannot_execute_write() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let job = runner.submit(context, request(JobScope::Read), |e| {
            e.checked(&GitCommand::new(["config", "user.name", "must-not-write"]).write())?;
            Ok(GitJobResult::default())
        });
        assert!(
            matches!(job.wait().await, GitJobOutcome::Failed(e) if e.code == GitJobErrorCode::Unsupported)
        );
    }
    #[tokio::test]
    async fn panic_releases_queue_and_locks() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let broken = runner.submit(context.clone(), request(JobScope::SharedWrite), |_| {
            panic!("operation failed")
        });
        assert!(matches!(broken.wait().await, GitJobOutcome::Failed(_)));
        let next = runner.submit(context, request(JobScope::SharedWrite), |_| {
            Ok(GitJobResult::default())
        });
        assert!(matches!(next.wait().await, GitJobOutcome::Success(_)));
    }
    #[tokio::test]
    async fn editor_changes_before_next_command_block_agent() {
        let repo = repo();
        let (_dir, runner) = runner();
        let context = RepoContext::discover(repo.path(), clean()).unwrap();
        let owner = runner.clone();
        let job = runner.submit(context, request(JobScope::CheckoutWrite), move |e| {
            owner.update_workspace(
                &e.context.root,
                WorkspaceState {
                    dirty_buffers: vec!["unsaved".into()],
                    ..clean()
                },
            )?;
            e.checked(&GitCommand::new(["status", "--porcelain"]))?;
            Ok(GitJobResult::default())
        });
        assert!(
            matches!(job.wait().await, GitJobOutcome::NeedsInput(e) if e.code == GitJobErrorCode::DirtyState)
        );
    }
}
