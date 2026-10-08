//! CONTRACT-E: variants and combine against real temporary repositories.
//! CI runs this via `cargo test --no-default-features --locked`.
use somnia_desktop::git::variants::*;
use somnia_desktop::git::{status, trust_repo, GitRepoState, TrustStore};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git").args(args).current_dir(dir).env("LC_ALL", "C").output().expect("git runs");
    assert!(out.status.success(), "git {:?} failed: {}", args, String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn repo() -> (TempDir, PathBuf, TrustStore, TempDir) {
    let dir = TempDir::new().unwrap();
    let root = dir.path().canonicalize().unwrap();
    git(&root, &["init", "-q", "-b", "main", "."]);
    git(&root, &["config", "user.name", "Somnia Test"]);
    git(&root, &["config", "user.email", "somnia@test.invalid"]);
    git(&root, &["config", "core.autocrlf", "false"]);
    git(&root, &["config", "core.longpaths", "true"]);
    fs::write(root.join("index.html"), "<h1>a</h1>\n<p>b</p>\n<p>c</p>\n").unwrap();
    fs::write(root.join("logo.bin"), [0u8, 1, 2, 3]).unwrap();
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-qm", "initial"]);
    let tdir = TempDir::new().unwrap();
    let mut store = TrustStore::load(&tdir.path().join("trust.json")).unwrap();
    trust_repo(&root, &mut store).unwrap();
    (dir, root, store, tdir)
}

fn commit_file(root: &Path, name: &str, content: &[u8], msg: &str) {
    fs::write(root.join(name), content).unwrap();
    git(root, &["add", "-A"]);
    git(root, &["commit", "-qm", msg]);
}

fn token(root: &Path) -> String {
    status(root).unwrap().state_token
}

fn create(root: &Path, store: &TrustStore, name: &str, open: bool) -> GitVariant {
    variant_create(
        root,
        &GitVariantCreateRequest { name: name.into(), from: None, open, state_token: None },
        store,
    )
    .unwrap()
}

fn code(e: &somnia_desktop::git::GitError) -> (String, String) {
    let v: serde_json::Value = serde_json::from_str(&e.to_json()).unwrap();
    (v["code"].as_str().unwrap().to_string(), v["detail"].as_str().unwrap_or("").to_string())
}

/// main and `other` diverge: both edit index.html line 2 differently, other also adds a file.
fn diverged(root: &Path, store: &TrustStore) {
    create(root, store, "other", true);
    commit_file(root, "index.html", b"<h1>a</h1>\n<p>THEIRS</p>\n<p>c</p>\n", "theirs edit");
    commit_file(root, "extra.txt", b"extra\n", "theirs add");
    git(root, &["checkout", "-q", "main"]);
    commit_file(root, "index.html", b"<h1>a</h1>\n<p>YOURS</p>\n<p>c</p>\n", "yours edit");
}

#[test]
fn create_open_list_rename() {
    let (_d, root, store, _t) = repo();
    let v = create(&root, &store, "redesign", true);
    assert!(v.current && v.name == "redesign");
    assert_eq!(git(&root, &["branch", "--show-current"]).trim(), "redesign");
    // Dirty work is carried along when starting from the current version.
    fs::write(root.join("new.txt"), "x").unwrap();
    let v2 = create(&root, &store, "second", true);
    assert!(v2.current);
    assert!(root.join("new.txt").exists());
    let list = variant_list(&root).unwrap();
    assert_eq!(list.len(), 3);
    assert!(list[0].current && list[0].name == "second");
    let r = variant_rename(&root, &GitVariantRenameRequest { from: "redesign".into(), to: "relaunch".into() }).unwrap();
    assert_eq!(r.name, "relaunch");
    let clash = variant_rename(&root, &GitVariantRenameRequest { from: "relaunch".into(), to: "main".into() }).unwrap_err();
    assert_eq!(code(&clash).1, "variant-exists");
    let dup = variant_create(&root, &GitVariantCreateRequest { name: "main".into(), from: None, open: false, state_token: None }, &store).unwrap_err();
    assert_eq!(code(&dup).1, "variant-exists");
}

#[test]
fn bad_names_are_rejected() {
    let (_d, root, store, _t) = repo();
    for bad in ["", "-x", "a b..c", "@{-1}", "HEAD", "has~tilde", "x.lock", "trail/"] {
        let e = variant_create(&root, &GitVariantCreateRequest { name: bad.into(), from: None, open: false, state_token: None }, &store).unwrap_err();
        assert_eq!(code(&e).1, "invalid-variant-name", "{bad}");
    }
}

#[test]
fn open_refuses_dirty_files_and_stale_token() {
    let (_d, root, store, _t) = repo();
    create(&root, &store, "other", false);
    fs::write(root.join("index.html"), "edited\n").unwrap();
    let e = variant_open(&root, &GitVariantOpenRequest { name: "other".into(), state_token: token(&root) }, &store).unwrap_err();
    assert_eq!(code(&e).1, "dirty-worktree");
    assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(), "edited\n");
    let stale = variant_open(&root, &GitVariantOpenRequest { name: "other".into(), state_token: "nope".into() }, &store).unwrap_err();
    assert_eq!(code(&stale).0, "state-changed");
    git(&root, &["checkout", "--", "index.html"]);
    let st = variant_open(&root, &GitVariantOpenRequest { name: "other".into(), state_token: token(&root) }, &store).unwrap();
    match st {
        GitRepoState::Ready { repo } => assert_eq!(repo.branch.as_deref(), Some("other")),
        _ => panic!("expected ready"),
    }
}

#[test]
fn untrusted_repo_cannot_switch() {
    let (_d, root, _store, t) = repo();
    let empty = TrustStore::load(&t.path().join("none.json")).unwrap();
    let e = variant_open(&root, &GitVariantOpenRequest { name: "main".into(), state_token: "x".into() }, &empty).unwrap_err();
    assert_eq!(code(&e).0, "blocked");
    assert_eq!(code(&e).1, "untrusted-repo");
}

#[test]
fn delete_protects_current_unmerged_and_keeps_backup() {
    let (_d, root, store, _t) = repo();
    let v = create(&root, &store, "work", true);
    commit_file(&root, "w.txt", b"w\n", "work only");
    git(&root, &["checkout", "-q", "main"]);
    let list = variant_list(&root).unwrap();
    let work = list.iter().find(|x| x.name == "work").unwrap().clone();
    assert!(!work.merged && work.ahead == 1);
    let cur = variant_delete(&root, &GitVariantDeleteRequest { name: "main".into(), expect_tip: v.tip.clone(), confirm_unmerged: true }).unwrap_err();
    assert_eq!(code(&cur).1, "is-current");
    let unm = variant_delete(&root, &GitVariantDeleteRequest { name: "work".into(), expect_tip: work.tip.clone(), confirm_unmerged: false }).unwrap_err();
    assert_eq!(code(&unm).1, "unmerged-variant");
    let stale = variant_delete(&root, &GitVariantDeleteRequest { name: "work".into(), expect_tip: "0".repeat(40), confirm_unmerged: true }).unwrap_err();
    assert_eq!(code(&stale).0, "state-changed");
    let done = variant_delete(&root, &GitVariantDeleteRequest { name: "work".into(), expect_tip: work.tip.clone(), confirm_unmerged: true }).unwrap();
    let backup = done.backup_ref.expect("backup ref");
    assert_eq!(git(&root, &["rev-parse", &backup]).trim(), work.tip);
    assert!(git(&root, &["branch", "--list", "work"]).trim().is_empty());
}

#[test]
fn delete_merged_variant_needs_no_confirmation() {
    let (_d, root, store, _t) = repo();
    let v = create(&root, &store, "same", false);
    let done = variant_delete(&root, &GitVariantDeleteRequest { name: "same".into(), expect_tip: v.tip, confirm_unmerged: false }).unwrap();
    assert!(done.backup_ref.is_none());
}

#[test]
fn combine_fast_forward() {
    let (_d, root, store, _t) = repo();
    create(&root, &store, "ahead", true);
    commit_file(&root, "n.txt", b"n\n", "ahead commit");
    git(&root, &["checkout", "-q", "main"]);
    let pre = combine_preview(&root, &GitCombinePreviewRequest { name: "ahead".into() }).unwrap();
    assert!(pre.fast_forward && !pre.up_to_date && pre.commits.len() == 1);
    assert_eq!(pre.files.len(), 1);
    let s = combine_start(&root, &GitCombineStartRequest { name: "ahead".into(), expect_tip: pre.tip.clone(), state_token: token(&root) }, &store).unwrap();
    assert!(s.fast_forwarded && !s.merging && s.safety_copy.is_some());
    assert!(root.join("n.txt").exists());
    let again = combine_preview(&root, &GitCombinePreviewRequest { name: "ahead".into() }).unwrap();
    assert!(again.up_to_date);
}

#[test]
fn combine_conflict_requires_explicit_resolution_then_finishes() {
    let (_d, root, store, _t) = repo();
    diverged(&root, &store);
    let pre = combine_preview(&root, &GitCombinePreviewRequest { name: "other".into() }).unwrap();
    assert!(!pre.fast_forward && pre.files.len() == 2);
    let s = combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: pre.tip.clone(), state_token: token(&root) }, &store).unwrap();
    assert!(s.merging && s.conflicts.len() == 1);
    let c = &s.conflicts[0];
    assert_eq!(c.path, "index.html");
    assert_eq!(c.kind, "both-modified");
    assert!(c.yours.as_deref().unwrap().contains("YOURS"));
    assert!(c.theirs.as_deref().unwrap().contains("THEIRS"));
    assert!(c.base.as_deref().unwrap().contains("<p>b</p>"));
    assert!(c.working.as_deref().unwrap().contains("<<<<<<<"));
    // Finishing without a decision is refused.
    let e = combine_finish(&root, &GitCombineFinishRequest { message: None }, &store).unwrap_err();
    assert_eq!(code(&e).1, "unresolved-conflicts");
    // Markers in the result are refused, nothing is written.
    let bad = combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "index.html".into(), choice: GitResolveChoice::Content, content: Some("<<<<<<< x\nfoo\n".into()) }] }, &store).unwrap_err();
    assert_eq!(code(&bad).1, "conflict-markers");
    // Unknown path refused.
    let unk = combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "extra.txt".into(), choice: GitResolveChoice::Yours, content: None }] }, &store).unwrap_err();
    assert_eq!(code(&unk).1, "not-a-conflict");
    // Status resumes the same session.
    assert_eq!(combine_status(&root).unwrap().unwrap().conflicts.len(), 1);
    let merged = "<h1>a</h1>\n<p>YOURS and THEIRS</p>\n<p>c</p>\n";
    let after = combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "index.html".into(), choice: GitResolveChoice::Content, content: Some(merged.into()) }] }, &store).unwrap();
    assert!(after.conflicts.is_empty());
    let v = combine_finish(&root, &GitCombineFinishRequest { message: None }, &store).unwrap();
    assert_eq!(v.parents.len(), 2);
    assert!(v.subject.starts_with("Combined variant other into main"));
    assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(), merged);
    assert!(root.join("extra.txt").exists());
    assert!(combine_status(&root).unwrap().is_none());
    assert!(git(&root, &["for-each-ref", "refs/somnia/safety"]).contains("refs/somnia/safety/"));
}

#[test]
fn combine_choose_theirs_and_abort() {
    let (_d, root, store, _t) = repo();
    diverged(&root, &store);
    let pre = combine_preview(&root, &GitCombinePreviewRequest { name: "other".into() }).unwrap();
    let before = git(&root, &["rev-parse", "HEAD"]);
    let start = || combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: pre.tip.clone(), state_token: token(&root) }, &store).unwrap();
    start();
    let st = combine_abort(&root, Some(&store)).unwrap();
    assert!(matches!(st, GitRepoState::Ready { .. }));
    assert_eq!(git(&root, &["rev-parse", "HEAD"]), before);
    assert!(fs::read_to_string(root.join("index.html")).unwrap().contains("YOURS"));
    assert!(!root.join("extra.txt").exists());
    start();
    combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "index.html".into(), choice: GitResolveChoice::Theirs, content: None }] }, &store).unwrap();
    combine_finish(&root, &GitCombineFinishRequest { message: Some("Take their headline".into()) }, &store).unwrap();
    assert!(fs::read_to_string(root.join("index.html")).unwrap().contains("THEIRS"));
}

#[test]
fn combine_binary_conflict_needs_explicit_side() {
    let (_d, root, store, _t) = repo();
    create(&root, &store, "other", true);
    commit_file(&root, "logo.bin", &[0, 9, 9, 9], "their logo");
    git(&root, &["checkout", "-q", "main"]);
    commit_file(&root, "logo.bin", &[0, 7, 7, 7], "my logo");
    let tip = combine_preview(&root, &GitCombinePreviewRequest { name: "other".into() }).unwrap().tip;
    let s = combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: tip, state_token: token(&root) }, &store).unwrap();
    let c = &s.conflicts[0];
    assert!(c.binary && c.yours.is_none() && c.theirs.is_none() && c.yours_bytes == Some(4));
    let e = combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "logo.bin".into(), choice: GitResolveChoice::Content, content: Some("x".into()) }] }, &store).unwrap_err();
    assert_eq!(code(&e).1, "binary-needs-choice");
    combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "logo.bin".into(), choice: GitResolveChoice::Theirs, content: None }] }, &store).unwrap();
    combine_finish(&root, &GitCombineFinishRequest { message: None }, &store).unwrap();
    assert_eq!(fs::read(root.join("logo.bin")).unwrap(), vec![0, 9, 9, 9]);
}

#[test]
fn combine_delete_vs_modify_conflict_accepts_deletion_explicitly() {
    let (_d, root, store, _t) = repo();
    create(&root, &store, "other", true);
    git(&root, &["rm", "-q", "logo.bin"]);
    git(&root, &["commit", "-qm", "remove logo"]);
    git(&root, &["checkout", "-q", "main"]);
    commit_file(&root, "logo.bin", &[0, 5, 5], "edit logo");
    let tip = combine_preview(&root, &GitCombinePreviewRequest { name: "other".into() }).unwrap().tip;
    let s = combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: tip, state_token: token(&root) }, &store).unwrap();
    assert_eq!(s.conflicts[0].kind, "deleted-by-theirs");
    combine_resolve(&root, &GitCombineResolveRequest { resolutions: vec![GitConflictResolution { path: "logo.bin".into(), choice: GitResolveChoice::Theirs, content: None }] }, &store).unwrap();
    combine_finish(&root, &GitCombineFinishRequest { message: None }, &store).unwrap();
    assert!(!root.join("logo.bin").exists());
}

#[test]
fn combine_refuses_dirty_project_and_stale_tips() {
    let (_d, root, store, _t) = repo();
    diverged(&root, &store);
    let tip = combine_preview(&root, &GitCombinePreviewRequest { name: "other".into() }).unwrap().tip;
    fs::write(root.join("scratch.txt"), "s").unwrap();
    let e = combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: tip.clone(), state_token: token(&root) }, &store).unwrap_err();
    assert_eq!(code(&e).1, "dirty-worktree");
    fs::remove_file(root.join("scratch.txt")).unwrap();
    let stale = combine_start(&root, &GitCombineStartRequest { name: "other".into(), expect_tip: "0".repeat(40), state_token: token(&root) }, &store).unwrap_err();
    assert_eq!(code(&stale).0, "state-changed");
    let same = combine_preview(&root, &GitCombinePreviewRequest { name: "main".into() }).unwrap_err();
    assert_eq!(code(&same).1, "same-variant");
}
