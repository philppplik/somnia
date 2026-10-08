//! Integration tests for the Git backend against real temporary repositories.
//! CI runs this via `cargo test --no-default-features --locked`.
use somnia_desktop::git::{
    commit, detect, diff_file, init, log, restore_as_new_version, status, trust_repo, DiffBase,
    DiffTarget, GitCommitRequest, GitLogRequest, GitRepoState, GitRestoreRequest, TrustStore,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("LC_ALL", "C")
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).into_owned()
}

/// A repo with identity configured locally and one initial commit.
fn repo_with_commit() -> (TempDir, PathBuf) {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap();
    git(&root, &["init", "-q", "-b", "main", "."]);
    git(&root, &["config", "user.name", "Somnia Test"]);
    git(&root, &["config", "user.email", "somnia@test.invalid"]);
    fs::write(root.join("index.html"), "v1\n").unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "initial"]);
    (dir, root)
}

fn empty_repo() -> (TempDir, PathBuf) {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap();
    git(&root, &["init", "-q", "-b", "main", "."]);
    git(&root, &["config", "user.name", "Somnia Test"]);
    git(&root, &["config", "user.email", "somnia@test.invalid"]);
    (dir, root)
}

fn trust_store() -> (TempDir, TrustStore) {
    let dir = TempDir::new().unwrap();
    let store = TrustStore::load(&dir.path().join("trust.json")).unwrap();
    (dir, store)
}

fn trusted_store(root: &Path) -> (TempDir, TrustStore) {
    let (dir, mut store) = trust_store();
    trust_repo(root, &mut store).unwrap();
    (dir, store)
}

fn commit_req(paths: &[&str], subject: &str, state_token: &str) -> GitCommitRequest {
    GitCommitRequest {
        paths: paths.iter().map(|s| s.to_string()).collect(),
        subject: subject.to_string(),
        body: None,
        state_token: state_token.to_string(),
    }
}

#[test]
fn detect_no_repo_and_init_flow() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap();
    match detect(&root, None) {
        GitRepoState::NoRepo { .. } => {}
        other => panic!("expected no-repo, got {other:?}"),
    }
    let (_t, store) = trust_store();
    // A fresh repo is not trusted yet, so commit-side detect reports it.
    match init(&root, Some(&store)).unwrap() {
        GitRepoState::Blocked { reason, repo } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::UntrustedRepo));
            let repo = repo.expect("repo info is attached");
            assert!(repo.unborn);
            assert_eq!(repo.branch.as_deref(), Some("main"));
            assert_eq!(repo.head, None);
            assert!(!repo.detached);
            assert!(!repo.git_version.is_empty());
        }
        other => panic!("expected blocked/untrusted, got {other:?}"),
    }
    // trusted now: ready, and init is idempotent
    let (_t2, store) = trusted_store(&root);
    match init(&root, Some(&store)).unwrap() {
        GitRepoState::Ready { repo } => assert!(repo.unborn),
        other => panic!("expected ready, got {other:?}"),
    }
    // init adds nothing
    assert!(fs::read_dir(&root).unwrap().all(|e| e.unwrap().file_name() == ".git"));
}

#[test]
fn detect_untrusted_repo_blocks_commit_side() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trust_store();
    match detect(&root, Some(&store)) {
        GitRepoState::Blocked { reason, repo } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::UntrustedRepo));
            assert!(repo.is_some());
        }
        other => panic!("expected blocked/untrusted, got {other:?}"),
    }
    // reads never check trust
    assert!(status(&root).is_ok());
    // after trust, ready
    let (_t2, store) = trusted_store(&root);
    match detect(&root, Some(&store)) {
        GitRepoState::Ready { .. } => {}
        other => panic!("expected ready after trust, got {other:?}"),
    }
}

#[test]
fn status_kinds_and_state_token() {
    let (_d, root) = repo_with_commit();
    fs::write(root.join("index.html"), "v2\n").unwrap(); // modified, unstaged
    fs::write(root.join("new file ü.txt"), "new\n").unwrap(); // untracked, unicode + space
    fs::write(root.join("gone.txt"), "x").unwrap();
    git(&root, &["add", "gone.txt"]);
    git(&root, &["commit", "-qm", "add gone"]);
    fs::remove_file(root.join("gone.txt")).unwrap(); // deleted, unstaged
    fs::write(root.join("staged.txt"), "s").unwrap();
    git(&root, &["add", "staged.txt"]); // added, staged
    let st = status(&root).unwrap();
    let by_path = |p: &str| st.changes.iter().find(|c| c.path == p).unwrap_or_else(|| panic!("{p}"));
    assert_eq!(by_path("index.html").kind, somnia_desktop::git::GitChangeKind::Modified);
    assert!(by_path("index.html").unstaged);
    assert!(!by_path("index.html").staged);
    assert_eq!(by_path("new file ü.txt").kind, somnia_desktop::git::GitChangeKind::Untracked);
    assert_eq!(by_path("gone.txt").kind, somnia_desktop::git::GitChangeKind::Deleted);
    assert_eq!(by_path("staged.txt").kind, somnia_desktop::git::GitChangeKind::Added);
    assert!(by_path("staged.txt").staged);
    assert!(!st.truncated);
    assert_eq!(st.staged_outside_prefix, 0);
    // token is stable while nothing changes
    let again = status(&root).unwrap();
    assert_eq!(st.state_token, again.state_token);
}

#[test]
fn status_rename_detection() {
    let (_d, root) = repo_with_commit();
    git(&root, &["mv", "index.html", "renamed.html"]);
    let status = status(&root).unwrap();
    let change = status.changes.iter().find(|c| c.path == "renamed.html").unwrap();
    assert_eq!(change.kind, somnia_desktop::git::GitChangeKind::Renamed);
    assert_eq!(change.old_path.as_deref(), Some("index.html"));
    assert!(change.staged);
}

#[test]
fn commit_exact_selection_only() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    fs::write(root.join("a.txt"), "a\n").unwrap();
    fs::write(root.join("b.txt"), "b\n").unwrap();
    fs::write(root.join("index.html"), "v2\n").unwrap();
    let token = status(&root).unwrap().state_token;
    let version = commit(&root, &commit_req(&["a.txt"], "add a", &token), &store).unwrap();
    assert_eq!(version.changed_files, 1);
    assert_eq!(version.subject, "add a");
    assert_eq!(version.author_name, "Somnia Test");
    assert!(version.time > 0);
    assert_eq!(version.parents.len(), 1);
    // b.txt and index.html were not committed
    let names = git(&root, &["show", "--name-only", "--format=", "HEAD"]);
    assert!(names.contains("a.txt"));
    assert!(!names.contains("b.txt"));
    assert!(!names.contains("index.html"));
    let after = status(&root).unwrap();
    assert!(after.changes.iter().any(|c| c.path == "b.txt"));
    assert!(after.changes.iter().any(|c| c.path == "index.html"));
    assert!(!after.changes.iter().any(|c| c.path == "a.txt"));
}

#[test]
fn commit_preserves_pre_staged_outside_selection() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    fs::write(root.join("keep-staged.txt"), "k\n").unwrap();
    git(&root, &["add", "keep-staged.txt"]); // staged outside the UI selection
    fs::write(root.join("chosen.txt"), "c\n").unwrap();
    let token = status(&root).unwrap().state_token;
    commit(&root, &commit_req(&["chosen.txt"], "chosen only", &token), &store).unwrap();
    let names = git(&root, &["show", "--name-only", "--format=", "HEAD"]);
    assert!(!names.contains("keep-staged.txt"));
    // still staged for later
    let staged = git(&root, &["diff", "--cached", "--name-only"]);
    assert!(staged.contains("keep-staged.txt"));
}

#[test]
fn commit_state_token_mismatch_rejected() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    fs::write(root.join("a.txt"), "a\n").unwrap();
    let token = status(&root).unwrap().state_token;
    fs::write(root.join("a.txt"), "changed under review\n").unwrap();
    let err = commit(&root, &commit_req(&["a.txt"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::StateChanged));
}

#[test]
fn commit_requires_trust_and_reports_hook_identity_failures() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trust_store(); // not trusted
    fs::write(root.join("a.txt"), "a\n").unwrap();
    let token = status(&root).unwrap().state_token;
    let err = commit(&root, &commit_req(&["a.txt"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::Blocked));
    assert_eq!(err.detail.as_deref(), Some("untrusted-repo"));

    let (_t2, store) = trusted_store(&root);
    // hook decline
    let hook = root.join(".git/hooks/pre-commit");
    fs::write(&hook, "#!/bin/sh\necho nope >&2\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let token = status(&root).unwrap().state_token;
    let err = commit(&root, &commit_req(&["a.txt"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::HookFailed), "{err:?}");
    fs::remove_file(&hook).unwrap();

    // identity missing (empty local identity overrides any machine-global config)
    git(&root, &["config", "user.name", ""]);
    git(&root, &["config", "user.email", ""]);
    let token = status(&root).unwrap().state_token;
    let err = commit(&root, &commit_req(&["a.txt"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::IdentityMissing), "{err:?}");
}

#[test]
fn commit_nothing_and_path_rejection() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    let token = status(&root).unwrap().state_token;
    let err = commit(&root, &commit_req(&["index.html"], "no change", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::NothingToCommit));
    let err = commit(&root, &commit_req(&["../escape"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::PathRejected));
    let err = commit(&root, &commit_req(&["/abs/path"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::PathRejected));
    let err = commit(&root, &commit_req(&["a\\b"], "x", &token), &store).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::PathRejected));
}

#[test]
fn commit_crlf_and_binary_roundtrip() {
    let (_d, root) = repo_with_commit();
    git(&root, &["config", "core.autocrlf", "false"]);
    let (_t, store) = trusted_store(&root);
    fs::write(root.join("crlf.txt"), "line1\r\nline2\r\n").unwrap();
    let mut bin = b"PK\x03\x04".to_vec();
    bin.extend(0u8..=255);
    fs::write(root.join("bin.dat"), &bin).unwrap();
    let token = status(&root).unwrap().state_token;
    let status_before = status(&root).unwrap();
    assert!(status_before.changes.iter().find(|c| c.path == "bin.dat").unwrap().binary);
    commit(&root, &commit_req(&["crlf.txt", "bin.dat"], "bytes", &token), &store).unwrap();
    let blob = git(&root, &["show", "HEAD:crlf.txt"]);
    assert_eq!(blob, "line1\r\nline2\r\n");
    let out = Command::new("git").args(["show", "HEAD:bin.dat"]).current_dir(&root).output().unwrap();
    assert_eq!(out.stdout, bin);
}

#[cfg(unix)]
#[test]
fn commit_unicode_spaces_and_newline_paths() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    let dir = root.join("ümlaut ordner");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("datei name.txt"), "unicode\n").unwrap();
    fs::write(root.join("line\nbreak.txt"), "newline in name\n").unwrap();
    let status = status(&root).unwrap();
    assert!(status.changes.iter().any(|c| c.path == "ümlaut ordner/datei name.txt"));
    assert!(status.changes.iter().any(|c| c.path == "line\nbreak.txt"));
    let version = commit(
        &root,
        &commit_req(&["ümlaut ordner/datei name.txt", "line\nbreak.txt"], "names", &status.state_token),
        &store,
    )
    .unwrap();
    assert_eq!(version.changed_files, 2);
}

#[test]
fn commit_deep_windows_style_paths() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    // Deep nesting with long segment names (Windows MAX_PATH territory).
    let segment = "ein-sehr-langer-ordnername-mit-umlauten-äöü-und-leerzeichen";
    let mut deep = PathBuf::from(&root);
    let mut rel = String::new();
    for _ in 0..6 {
        rel.push_str(segment);
        rel.push('/');
        deep.push(segment);
    }
    fs::create_dir_all(&deep).unwrap();
    rel.push_str("datei.html");
    fs::write(deep.join("datei.html"), "deep\n").unwrap();
    let status = status(&root).unwrap();
    assert!(status.changes.iter().any(|c| c.path == rel), "{}", rel);
    let version = commit(&root, &commit_req(&[&rel], "deep", &status.state_token), &store).unwrap();
    assert_eq!(version.changed_files, 1);
}

#[test]
fn diff_file_sides_and_binary() {
    let (_d, root) = repo_with_commit();
    fs::write(root.join("index.html"), "v2\n").unwrap();
    let diff = diff_file(&root, "index.html", DiffBase::Head, DiffTarget::Worktree).unwrap();
    assert_eq!(diff.before.as_deref(), Some("v1\n"));
    assert_eq!(diff.after.as_deref(), Some("v2\n"));
    assert!(!diff.binary);
    assert!(diff.unified.unwrap().contains("+v2"));
    // staged side
    git(&root, &["add", "index.html"]);
    let diff = diff_file(&root, "index.html", DiffBase::Head, DiffTarget::Index).unwrap();
    assert_eq!(diff.after.as_deref(), Some("v2\n"));
    // binary: no text sides
    let mut bin = vec![0u8, 1, 2, 0, 3];
    bin.extend(std::iter::repeat(7u8).take(100));
    fs::write(root.join("blob.bin"), &bin).unwrap();
    let diff = diff_file(&root, "blob.bin", DiffBase::Head, DiffTarget::Worktree).unwrap();
    assert!(diff.binary);
    assert!(diff.before.is_none() && diff.after.is_none());
}

#[test]
fn diff_untracked_gets_synthesized_unified() {
    let (_d, root) = repo_with_commit();
    fs::write(root.join("fresh.txt"), "hello\n").unwrap();
    let diff = diff_file(&root, "fresh.txt", DiffBase::Head, DiffTarget::Worktree).unwrap();
    assert!(diff.before.is_none());
    assert_eq!(diff.after.as_deref(), Some("hello\n"));
    assert!(diff.unified.unwrap().contains("+hello"));
}

#[test]
fn diff_too_large_flags() {
    let (_d, root) = repo_with_commit();
    let big = "x".repeat(2 * 1024 * 1024);
    fs::write(root.join("big.txt"), &big).unwrap();
    let diff = diff_file(&root, "big.txt", DiffBase::Head, DiffTarget::Worktree).unwrap();
    assert!(diff.too_large);
    assert_eq!(diff.after.unwrap().len(), 1024 * 1024);
}

#[test]
fn diff_rejects_bad_paths() {
    let (_d, root) = repo_with_commit();
    assert!(diff_file(&root, "../x", DiffBase::Head, DiffTarget::Worktree).is_err());
    assert!(diff_file(&root, "missing.txt", DiffBase::Head, DiffTarget::Worktree).is_err());
}

#[test]
fn log_lists_versions_project_scoped_with_pagination() {
    let (_d, root) = repo_with_commit();
    for i in 2..=4 {
        fs::write(root.join("index.html"), format!("v{i}\n")).unwrap();
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-qm", &format!("version {i}")]);
    }
    let page = log(&root, &GitLogRequest { limit: 2, before: None }).unwrap();
    assert_eq!(page.len(), 2);
    assert_eq!(page[0].subject, "version 4");
    assert_eq!(page[1].subject, "version 3");
    assert_eq!(page[0].changed_files, 1);
    let older = log(&root, &GitLogRequest { limit: 10, before: Some(page[1].sha.clone()) }).unwrap();
    assert_eq!(older.len(), 2);
    assert_eq!(older[0].subject, "version 2");
    assert_eq!(older[1].subject, "initial");
    // before the root commit: empty
    let none = log(&root, &GitLogRequest { limit: 10, before: Some(older[1].sha.clone()) }).unwrap();
    assert!(none.is_empty());
}

#[test]
fn blocked_states_are_detected() {
    let (_d, root) = repo_with_commit();
    // index.lock
    fs::write(root.join(".git/index.lock"), "").unwrap();
    match detect(&root, None) {
        GitRepoState::Blocked { reason, .. } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::IndexLock))
        }
        other => panic!("expected index-lock, got {other:?}"),
    }
    let err = status(&root).unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::Blocked));
    fs::remove_file(root.join(".git/index.lock")).unwrap();
    // merge in progress
    fs::write(root.join(".git/MERGE_HEAD"), "0".repeat(40)).unwrap();
    match detect(&root, None) {
        GitRepoState::Blocked { reason, .. } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::MergeInProgress))
        }
        other => panic!("expected merge-in-progress, got {other:?}"),
    }
    fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();
    // cherry-pick
    fs::write(root.join(".git/CHERRY_PICK_HEAD"), "0".repeat(40)).unwrap();
    match detect(&root, None) {
        GitRepoState::Blocked { reason, .. } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::CherryPickInProgress))
        }
        other => panic!("expected cherry-pick-in-progress, got {other:?}"),
    }
    fs::remove_file(root.join(".git/CHERRY_PICK_HEAD")).unwrap();
    // detached
    git(&root, &["checkout", "-q", "--detach", "HEAD"]);
    match detect(&root, None) {
        GitRepoState::Ready { repo } => {
            assert!(repo.detached);
            assert_eq!(repo.branch, None);
        }
        other => panic!("expected ready/detached, got {other:?}"),
    }
    git(&root, &["checkout", "-q", "main"]);
}

#[test]
fn linked_worktree_is_unsupported() {
    let (_d, root) = repo_with_commit();
    let other = TempDir::new().unwrap();
    let wt = other.path().join("wt");
    git(&root, &["worktree", "add", "-q", wt.to_str().unwrap(), "--detach"]);
    match detect(wt.canonicalize().unwrap().as_path(), None) {
        GitRepoState::Blocked { reason, .. } => {
            assert!(matches!(reason, somnia_desktop::git::GitBlockReason::UnsupportedWorktree))
        }
        other => panic!("expected unsupported-worktree, got {other:?}"),
    }
}

#[test]
fn subfolder_project_is_scoped() {
    let (_d, root) = repo_with_commit();
    let project = root.join("site");
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("page.html"), "p1\n").unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "site"]);
    let (_t, store) = trusted_store(&project);
    let info = status(&project).unwrap().repo;
    assert_eq!(info.project_prefix, "site");
    assert_eq!(info.root, root.to_string_lossy());
    // staged outside the subtree: reported, never committed
    fs::write(root.join("outside.txt"), "o\n").unwrap();
    git(&root, &["add", "outside.txt"]);
    fs::write(project.join("page.html"), "p2\n").unwrap();
    let status = status(&project).unwrap();
    assert_eq!(status.staged_outside_prefix, 1);
    assert!(!status.changes.iter().any(|c| c.path.contains("outside")));
    commit(&project, &commit_req(&["page.html"], "page only", &status.state_token), &store).unwrap();
    let names = git(&root, &["show", "--name-only", "--format=", "HEAD"]);
    assert!(names.contains("site/page.html"));
    assert!(!names.contains("outside.txt"));
    let staged = git(&root, &["diff", "--cached", "--name-only"]);
    assert!(staged.contains("outside.txt"));
}

#[test]
fn restore_as_new_version_never_deletes_without_safety_copy() {
    let (_d, root) = repo_with_commit(); // index.html = v1
    let v1 = git(&root, &["rev-parse", "HEAD"]).trim().to_string();
    fs::write(root.join("index.html"), "v2\n").unwrap();
    fs::write(root.join("added-later.txt"), "later\n").unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "v2"]);
    let (_t, store) = trusted_store(&root);
    // an untracked file the safety copy must capture
    fs::write(root.join("untracked.txt"), "keep me\n").unwrap();
    let token = status(&root).unwrap().state_token;

    let result = restore_as_new_version(
        &root,
        &GitRestoreRequest { sha: v1.clone(), state_token: token, paths: None },
        &store,
    )
    .unwrap();
    // worktree matches v1, the later file is gone, a new commit exists
    assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(), "v1\n");
    assert!(!root.join("added-later.txt").exists());
    assert_eq!(result.new_version.subject, format!("Restored version {}", &v1[..7]));
    assert!(result.safety_copy.is_some());
    // safety ref holds the pre-restore state, including the untracked file
    let refs = git(&root, &["for-each-ref", "--format=%(refname)", "refs/somnia/safety/"]);
    let safety_ref = refs.lines().next().expect("a safety ref exists").to_string();
    let safety = result.safety_copy.unwrap();
    let safety_commit = git(&root, &["rev-parse", &safety_ref]).trim().to_string();
    assert_eq!(safety_commit, safety.sha);
    let listing = git(&root, &["ls-tree", "-r", "--name-only", &safety_ref]);
    assert!(listing.contains("index.html"));
    assert!(listing.contains("added-later.txt"));
    assert!(listing.contains("untracked.txt"));
    let restored_blob = git(&root, &["show", &format!("{safety_ref}:index.html")]);
    assert_eq!(restored_blob, "v2\n");
    // nothing is lost: pre-restore commits are still reachable
    let all = git(&root, &["log", "--format=%s", "HEAD"]);
    assert!(all.contains("v2"));
}

#[test]
fn restore_state_mismatch_and_nothing() {
    let (_d, root) = repo_with_commit();
    let v1 = git(&root, &["rev-parse", "HEAD"]).trim().to_string();
    let (_t, store) = trusted_store(&root);
    let token = status(&root).unwrap().state_token;
    fs::write(root.join("index.html"), "v2\n").unwrap();
    let err = restore_as_new_version(
        &root,
        &GitRestoreRequest { sha: v1.clone(), state_token: token, paths: None },
        &store,
    )
    .unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::StateChanged));
    // restoring the current version: nothing to do
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "v2"]);
    let v2 = git(&root, &["rev-parse", "HEAD"]).trim().to_string();
    let token = status(&root).unwrap().state_token;
    let err = restore_as_new_version(
        &root,
        &GitRestoreRequest { sha: v2, state_token: token, paths: None },
        &store,
    )
    .unwrap_err();
    assert!(matches!(err.code, somnia_desktop::git::GitErrorCode::NothingToCommit));
}

#[test]
fn restore_partial_paths_only() {
    let (_d, root) = repo_with_commit();
    fs::write(root.join("other.txt"), "o1\n").unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "v1"]);
    let v1 = git(&root, &["rev-parse", "HEAD"]).trim().to_string();
    fs::write(root.join("index.html"), "v2\n").unwrap();
    fs::write(root.join("other.txt"), "o2\n").unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "v2"]);
    let (_t, store) = trusted_store(&root);
    let token = status(&root).unwrap().state_token;
    restore_as_new_version(
        &root,
        &GitRestoreRequest { sha: v1, state_token: token, paths: Some(vec!["index.html".to_string()]) },
        &store,
    )
    .unwrap();
    assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(), "v1\n");
    assert_eq!(fs::read_to_string(root.join("other.txt")).unwrap(), "o2\n");
}

#[test]
fn unborn_and_first_commit() {
    let (_d, root) = empty_repo();
    let (_t, store) = trusted_store(&root);
    assert!(log(&root, &GitLogRequest { limit: 10, before: None }).unwrap().is_empty());
    fs::write(root.join("first.txt"), "1\n").unwrap();
    let st = status(&root).unwrap();
    assert!(st.repo.unborn);
    let version = commit(&root, &commit_req(&["first.txt"], "first", &st.state_token), &store).unwrap();
    assert_eq!(version.parents.len(), 0);
    assert!(!status(&root).unwrap().repo.unborn);
}

#[test]
fn error_serializes_as_contract_json() {
    let (_d, root) = repo_with_commit();
    let (_t, store) = trusted_store(&root);
    fs::write(root.join("x.txt"), "x\n").unwrap();
    let token = status(&root).unwrap().state_token;
    let err = commit(&root, &commit_req(&["../bad"], "x", &token), &store).unwrap_err();
    let json: serde_json::Value = serde_json::from_str(&err.to_json()).unwrap();
    assert_eq!(json["code"], "path-rejected");
    assert!(json["message"].is_string());
}
