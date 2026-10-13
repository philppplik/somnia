//! Debounced invalidation hints only. Never grants write authority or validates reviewed content.
use super::*;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInvalidation {
    pub project_id: String,
    pub generation: u64,
    pub watcher_failed: bool,
}
#[derive(Default)]
struct Pending {
    first: Option<Instant>,
    last: Option<Instant>,
    failed: bool,
}
/// Host owns this object for exactly one open project. Watches both checkout and common Git dir.
pub struct GitStatusWatcher {
    _watcher: RecommendedWatcher,
    pending: Arc<Mutex<Pending>>,
    generation: u64,
}
impl GitStatusWatcher {
    pub fn new(project_root: &Path) -> GResult<Self> {
        let ctx = probe(project_root)?;
        let pending = Arc::new(Mutex::new(Pending::default()));
        let state = pending.clone();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                // Reads may emit Access events. Ignoring them avoids refresh feedback loops.
                if event
                    .as_ref()
                    .is_ok_and(|e| matches!(e.kind, notify::EventKind::Access(_)))
                {
                    return;
                }
                if let Ok(mut p) = state.lock() {
                    let now = Instant::now();
                    p.first.get_or_insert(now);
                    p.last = Some(now);
                    p.failed |= event.is_err();
                }
            })
            .map_err(|e| {
                GitError::detail(
                    GitErrorCode::Io,
                    "Could not start Git watcher",
                    e.to_string(),
                )
            })?;
        watcher
            .watch(&ctx.root, RecursiveMode::Recursive)
            .map_err(|e| {
                GitError::detail(GitErrorCode::Io, "Could not watch checkout", e.to_string())
            })?;
        // Normal .git is already covered; linked worktrees keep common refs elsewhere.
        if !ctx.common_dir.starts_with(&ctx.root) {
            watcher
                .watch(&ctx.common_dir, RecursiveMode::Recursive)
                .map_err(|e| {
                    GitError::detail(
                        GitErrorCode::Io,
                        "Could not watch shared Git directory",
                        e.to_string(),
                    )
                })?;
        }
        if !ctx.git_dir.starts_with(&ctx.root) && !same_dir(&ctx.git_dir, &ctx.common_dir) {
            watcher
                .watch(&ctx.git_dir, RecursiveMode::Recursive)
                .map_err(|e| {
                    GitError::detail(
                        GitErrorCode::Io,
                        "Could not watch worktree Git directory",
                        e.to_string(),
                    )
                })?;
        }
        Ok(Self {
            _watcher: watcher,
            pending,
            generation: 0,
        })
    }
    /// Debounce 200ms quiet, but continuous changes emit at least once per second.
    pub fn drain(&mut self, project_id: &str) -> Option<GitInvalidation> {
        let mut p = self.pending.lock().ok()?;
        if p.last?.elapsed() < Duration::from_millis(200)
            && p.first?.elapsed() < Duration::from_secs(1)
        {
            return None;
        }
        self.generation = self.generation.saturating_add(1);
        let failed = p.failed;
        *p = Pending::default();
        Some(GitInvalidation {
            project_id: project_id.into(),
            generation: self.generation,
            watcher_failed: failed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn debounce_coalesces_and_generation_never_grants_a_review() {
        let d = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(d.path())
            .status()
            .unwrap()
            .success());
        let mut w = GitStatusWatcher::new(d.path()).unwrap();
        let old = Instant::now() - Duration::from_secs(2);
        *w.pending.lock().unwrap() = Pending {
            first: Some(old),
            last: Some(old),
            failed: true,
        };
        let event = w.drain("p").unwrap();
        assert_eq!(event.generation, 1);
        assert!(event.watcher_failed);
        assert!(w.drain("p").is_none());
        let now = Instant::now();
        *w.pending.lock().unwrap() = Pending {
            first: Some(now),
            last: Some(now),
            failed: false,
        };
        assert!(w.drain("p").is_none());
    }
    #[test]
    fn disk_and_git_ref_writes_invalidate() {
        let d = tempfile::tempdir().unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(d.path())
            .status()
            .unwrap()
            .success());
        let mut w = GitStatusWatcher::new(d.path()).unwrap();
        std::fs::write(d.path().join("new.txt"), "change").unwrap();
        let wait = |w: &mut GitStatusWatcher| {
            for _ in 0..60 {
                std::thread::sleep(Duration::from_millis(50));
                if let Some(e) = w.drain("p") {
                    return e;
                }
            }
            panic!("watch event missing");
        };
        assert!(wait(&mut w).generation >= 1);
        std::fs::write(d.path().join(".git/HEAD"), "ref: refs/heads/other\n").unwrap();
        assert!(wait(&mut w).generation >= 2);
    }
}

/// Preserves all authoritative editor fields. Generation changes are invalidation, not approval.
pub fn advance_workspace_generation(
    runner: &super::jobs::GitJobRunner,
    root: &Path,
) -> Result<u64, super::jobs::GitJobError> {
    runner.invalidate_workspace(root)
}
