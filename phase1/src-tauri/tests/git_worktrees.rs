//! Real system Git split-directory lifecycle and cross-checkout lock tests.
use somnia_desktop::git::{self, worktrees::*, GitErrorCode, GitRepoState, TrustStore};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tempfile::TempDir;
fn run(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}
struct Fixture {
    _dir: TempDir,
    root: PathBuf,
    outside: PathBuf,
    trust: TrustStore,
}
impl Fixture {
    fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("repo");
        fs::create_dir(&root).unwrap();
        run(&root, &["init", "-q", "-b", "main"]);
        run(&root, &["config", "user.name", "Worktree Test"]);
        run(&root, &["config", "user.email", "worktree@test.invalid"]);
        fs::write(root.join("file.txt"), "base\n").unwrap();
        run(&root, &["add", "."]);
        run(&root, &["commit", "-qm", "base"]);
        let mut trust = TrustStore::load(&dir.path().join("trust.json")).unwrap();
        git::trust_repo(&root, &mut trust).unwrap();
        let outside = dir.path().to_path_buf();
        Self {
            _dir: dir,
            root,
            outside,
            trust,
        }
    }
    fn req(&self, name: &str) -> GitWorktreeRequest {
        GitWorktreeRequest {
            destination: self.outside.join(name).to_string_lossy().into_owned(),
            branch: format!("somnia/task/{name}"),
            base: "HEAD".into(),
        }
    }
    fn add(&mut self, name: &str) -> GitWorktree {
        let plan = git_worktree_plan(&self.root, &self.req(name), &clean(), &self.trust).unwrap();
        let wt = git_worktree_add(&self.root, &plan, &clean(), &self.trust).unwrap();
        git::trust_repo(Path::new(&wt.root), &mut self.trust).unwrap();
        wt
    }
    fn remove_req(&self, w: &GitWorktree, force: bool) -> GitWorktreeRemoveRequest {
        let current = git_worktree_list(&self.root)
            .unwrap()
            .into_iter()
            .find(|x| x.root == w.root)
            .unwrap();
        GitWorktreeRemoveRequest {
            worktree_id: current.context.unwrap().worktree_id,
            state_token: current.state_token.unwrap(),
            force,
        }
    }
}
fn clean() -> WorkspaceGuard {
    WorkspaceGuard {
        known: true,
        unsaved_buffers: false,
        pending_ai_review: false,
    }
}
#[test]
fn multiple_worktrees_have_common_identity_and_private_indexes() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let b = f.add("b");
    let main = repo_context(&f.root).unwrap();
    let ac = a.context.unwrap();
    let bc = b.context.unwrap();
    assert_eq!(main.repo_id, ac.repo_id);
    assert_eq!(ac.repo_id, bc.repo_id);
    assert_ne!(main.worktree_id, ac.worktree_id);
    assert_ne!(ac.worktree_id, bc.worktree_id);
    assert!(Path::new(&a.root).join(".git").is_file());
    fs::write(Path::new(&a.root).join("file.txt"), "a\n").unwrap();
    let list = git_worktree_list(&f.root).unwrap();
    assert_eq!(list.len(), 3);
    assert_eq!(
        list.iter().find(|w| w.root == a.root).unwrap().dirty,
        Some(true)
    );
    assert_eq!(
        list.iter().find(|w| w.root == b.root).unwrap().dirty,
        Some(false)
    );
    assert!(matches!(
        git::detect(Path::new(&a.root), Some(&f.trust)),
        GitRepoState::Ready { .. }
    ));
}
#[test]
fn guards_fail_closed_for_plan_add_and_remove() {
    let mut f = Fixture::new();
    for g in [
        WorkspaceGuard {
            known: false,
            ..clean()
        },
        WorkspaceGuard {
            unsaved_buffers: true,
            ..clean()
        },
        WorkspaceGuard {
            pending_ai_review: true,
            ..clean()
        },
    ] {
        assert_eq!(
            git_worktree_plan(&f.root, &f.req("a"), &g, &f.trust)
                .unwrap_err()
                .code,
            GitErrorCode::Blocked
        );
    }
    let p = git_worktree_plan(&f.root, &f.req("a"), &clean(), &f.trust).unwrap();
    assert!(git_worktree_add(
        &f.root,
        &p,
        &WorkspaceGuard {
            unsaved_buffers: true,
            ..clean()
        },
        &f.trust
    )
    .is_err());
    let a = f.add("a");
    assert!(git_worktree_remove(
        &f.root,
        &f.remove_req(&a, false),
        &WorkspaceGuard {
            known: false,
            ..clean()
        },
        &f.trust
    )
    .is_err());
}
#[test]
fn destination_and_branch_collisions_are_rejected() {
    let mut f = Fixture::new();
    let a = f.add("a");
    for path in [
        f.root.join("nested"),
        Path::new(&a.root).join("nested"),
        f.outside.join("repo"),
        PathBuf::from("relative"),
        f.outside.join("no-parent").join("x"),
    ] {
        let mut req = f.req("b");
        req.destination = path.to_string_lossy().into_owned();
        assert!(git_worktree_plan(&f.root, &req, &clean(), &f.trust).is_err());
    }
    let mut req = f.req("b");
    req.branch = "main".into();
    assert!(git_worktree_plan(&f.root, &req, &clean(), &f.trust).is_err());
    req.branch = "../bad".into();
    assert!(git_worktree_plan(&f.root, &req, &clean(), &f.trust).is_err());
}
#[test]
fn changed_source_and_tampered_plan_do_not_create() {
    let f = Fixture::new();
    let p = git_worktree_plan(&f.root, &f.req("a"), &clean(), &f.trust).unwrap();
    let mut wrong = p.clone();
    wrong.branch = "tampered".into();
    assert!(git_worktree_add(&f.root, &wrong, &clean(), &f.trust).is_err());
    fs::write(f.root.join("file.txt"), "changed\n").unwrap();
    assert!(git_worktree_add(&f.root, &p, &clean(), &f.trust).is_err());
    assert!(!Path::new(&p.destination).exists());
}
#[test]
fn trust_does_not_leak_from_primary_checkout() {
    let f = Fixture::new();
    let p = git_worktree_plan(&f.root, &f.req("a"), &clean(), &f.trust).unwrap();
    let a = git_worktree_add(&f.root, &p, &clean(), &f.trust).unwrap();
    assert!(matches!(
        git::detect(Path::new(&a.root), Some(&f.trust)),
        GitRepoState::Blocked { .. }
    ));
}
#[test]
fn dirty_remove_requires_force_and_preserves_recovery_content() {
    let mut f = Fixture::new();
    let a = f.add("a");
    fs::write(Path::new(&a.root).join("file.txt"), "dirty\n").unwrap();
    fs::write(Path::new(&a.root).join("new.txt"), "untracked\n").unwrap();
    let req = f.remove_req(&a, false);
    assert_eq!(
        git_worktree_remove(&f.root, &req, &clean(), &f.trust)
            .unwrap_err()
            .detail
            .as_deref(),
        Some("dirty-worktree")
    );
    let out = git_worktree_remove(
        &f.root,
        &GitWorktreeRemoveRequest { force: true, ..req },
        &clean(),
        &f.trust,
    )
    .unwrap();
    assert!(!Path::new(&a.root).exists());
    assert_eq!(
        run(&f.root, &["show", &format!("{}:file.txt", out.safety_ref)]),
        "dirty\n"
    );
    assert_eq!(
        run(&f.root, &["show", &format!("{}:new.txt", out.safety_ref)]),
        "untracked\n"
    );
}
#[test]
fn remove_rejects_stale_token_locked_worktree_and_ignored_data() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let req = f.remove_req(&a, true);
    fs::write(Path::new(&a.root).join("file.txt"), "new\n").unwrap();
    assert_eq!(
        git_worktree_remove(&f.root, &req, &clean(), &f.trust)
            .unwrap_err()
            .code,
        GitErrorCode::StateChanged
    );
    run(&f.root, &["worktree", "lock", &a.root]);
    assert!(git_worktree_remove(&f.root, &f.remove_req(&a, true), &clean(), &f.trust).is_err());
    run(&f.root, &["worktree", "unlock", &a.root]);
    fs::write(Path::new(&a.root).join(".gitignore"), "private.dat\n").unwrap();
    fs::write(Path::new(&a.root).join("private.dat"), "do not lose\n").unwrap();
    assert_eq!(
        git_worktree_remove(&f.root, &f.remove_req(&a, true), &clean(), &f.trust)
            .unwrap_err()
            .detail
            .as_deref(),
        Some("ignored-files")
    );
    assert!(Path::new(&a.root).join("private.dat").exists());
}
#[test]
fn active_primary_and_foreign_worktrees_cannot_be_removed() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let list = git_worktree_list(&f.root).unwrap();
    let main = list
        .iter()
        .find(|w| w.root == f.root.to_string_lossy())
        .unwrap();
    assert!(git_worktree_remove(&f.root, &f.remove_req(main, false), &clean(), &f.trust).is_err());
    assert!(git_worktree_remove(
        Path::new(&a.root),
        &f.remove_req(&a, false),
        &clean(),
        &f.trust
    )
    .is_err());
    let other = Fixture::new();
    let req = GitWorktreeRemoveRequest {
        worktree_id: repo_context(&other.root).unwrap().worktree_id,
        state_token: String::new(),
        force: true,
    };
    assert!(git_worktree_remove(&f.root, &req, &clean(), &f.trust).is_err());
}
#[test]
fn common_lock_serializes_checkouts_and_releases_without_deleting_file() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let held = lock_repo(&f.root).unwrap();
    assert!(lock_repo(Path::new(&a.root)).is_err());
    let status = git::status(Path::new(&a.root)).unwrap();
    let req = git::GitCommitRequest {
        paths: vec!["file.txt".into()],
        subject: "x".into(),
        body: None,
        state_token: status.state_token,
    };
    assert_eq!(
        git::commit(Path::new(&a.root), &req, &f.trust)
            .unwrap_err()
            .detail
            .as_deref(),
        Some("repo-locked")
    );
    drop(held);
    assert!(lock_repo(Path::new(&a.root)).is_ok());
}
#[test]
fn worktree_metadata_index_locks_and_restart_are_local() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let ctx = a.context.unwrap();
    fs::write(Path::new(&ctx.git_dir).join("index.lock"), "").unwrap();
    assert!(matches!(
        git::detect(Path::new(&a.root), None),
        GitRepoState::Blocked { .. }
    ));
    assert!(matches!(
        git::detect(&f.root, None),
        GitRepoState::Ready { .. }
    ));
    fs::remove_file(Path::new(&ctx.git_dir).join("index.lock")).unwrap();
    f.trust.save().unwrap();
    assert_eq!(repo_context(Path::new(&a.root)).unwrap(), ctx);
    assert_eq!(git_worktree_list(&f.root).unwrap().len(), 2);
}
#[test]
fn linked_worktree_commit_and_remove_keep_primary_index_clean() {
    let mut f = Fixture::new();
    let a = f.add("a");
    fs::write(Path::new(&a.root).join("file.txt"), "task\n").unwrap();
    let s = git::status(Path::new(&a.root)).unwrap();
    git::commit(
        Path::new(&a.root),
        &git::GitCommitRequest {
            paths: vec!["file.txt".into()],
            subject: "task".into(),
            body: None,
            state_token: s.state_token,
        },
        &f.trust,
    )
    .unwrap();
    assert!(git::status(&f.root).unwrap().changes.is_empty());
    assert_eq!(
        fs::read_to_string(f.root.join("file.txt")).unwrap(),
        "base\n"
    );
    git_worktree_remove(&f.root, &f.remove_req(&a, false), &clean(), &f.trust).unwrap();
}
#[test]
fn missing_worktree_is_listed_unknown_not_pruned() {
    let mut f = Fixture::new();
    let a = f.add("a");
    fs::remove_dir_all(&a.root).unwrap();
    let list = git_worktree_list(&f.root).unwrap();
    let missing = list.iter().find(|w| w.root == a.root).unwrap();
    assert_eq!(missing.dirty, None);
    assert!(missing.prunable);
    assert!(missing.context.is_none());
}
#[test]
fn porcelain_paths_with_quotes_unicode_and_spaces_roundtrip() {
    let mut f = Fixture::new();
    let mut req = f.req("quoted");
    req.destination = f
        .outside
        .join("space \" café")
        .to_string_lossy()
        .into_owned();
    let plan = git_worktree_plan(&f.root, &req, &clean(), &f.trust).unwrap();
    let a = git_worktree_add(&f.root, &plan, &clean(), &f.trust).unwrap();
    assert_eq!(a.root, req.destination);
    git::trust_repo(Path::new(&a.root), &mut f.trust).unwrap();
    git_worktree_remove(&f.root, &f.remove_req(&a, false), &clean(), &f.trust).unwrap();
}
#[cfg(unix)]
#[test]
fn control_character_destinations_rejected_before_creation() {
    let f = Fixture::new();
    let mut req = f.req("newline");
    req.destination = f.outside.join("line\nbreak").to_string_lossy().into_owned();
    assert!(git_worktree_plan(&f.root, &req, &clean(), &f.trust).is_err());
    assert!(!Path::new(&req.destination).exists());
}

#[test]
fn same_size_same_timestamp_content_change_invalidates_review() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let path = Path::new(&a.root).join("file.txt");
    fs::write(&path, "first\n").unwrap();
    let stamp = fs::metadata(&path).unwrap().modified().unwrap();
    let req = f.remove_req(&a, true);
    fs::write(&path, "other\n").unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(stamp))
        .unwrap();
    assert_eq!(
        git_worktree_remove(&f.root, &req, &clean(), &f.trust)
            .unwrap_err()
            .code,
        GitErrorCode::StateChanged
    );
}
#[cfg(unix)]
#[test]
fn symlink_source_paths_have_same_identity_and_index_scope() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let link = f.outside.join("alias");
    std::os::unix::fs::symlink(&a.root, &link).unwrap();
    assert_eq!(
        repo_context(&link).unwrap(),
        repo_context(Path::new(&a.root)).unwrap()
    );
    let held = lock_repo(&link).unwrap();
    assert!(lock_repo(&f.root).is_err());
    drop(held);
}
#[test]
fn removal_from_linked_checkout_cannot_remove_primary() {
    let mut f = Fixture::new();
    let a = f.add("a");
    let main = git_worktree_list(&f.root)
        .unwrap()
        .into_iter()
        .find(|w| {
            w.context.as_ref().unwrap().worktree_id == repo_context(&f.root).unwrap().worktree_id
        })
        .unwrap();
    assert!(git_worktree_remove(
        Path::new(&a.root),
        &f.remove_req(&main, true),
        &clean(),
        &f.trust
    )
    .is_err());
}
