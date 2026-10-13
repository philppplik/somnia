//! Integration tests for the publication seam against real temporary repositories.
//! CI runs this via `cargo test --no-default-features --locked`.
use somnia_desktop::git::publication::{local_excluded, local_untracked, MAX_LISTED_PATHS};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("LC_ALL", "C")
        .output()
        .expect("git runs");
    assert!(out.status.success(), "git {:?} failed: {}", args, String::from_utf8_lossy(&out.stderr));
}

fn repo() -> (TempDir, PathBuf) {
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

#[test]
fn untracked_and_excluded_are_listed_separately() {
    let (_t, root) = repo();
    fs::write(root.join("draft.txt"), "not a version yet\n").unwrap();
    fs::write(root.join(".gitignore"), ".env\nbuild/\n").unwrap();
    fs::write(root.join(".env"), "SECRET=1\n").unwrap();
    fs::create_dir_all(root.join("build")).unwrap();
    fs::write(root.join("build").join("out.js"), "x\n").unwrap();

    let untracked = local_untracked(&root).unwrap();
    assert!(untracked.contains(&"draft.txt".to_string()), "{untracked:?}");
    assert!(untracked.contains(&".gitignore".to_string()), "{untracked:?}");
    assert!(!untracked.iter().any(|p| p == ".env" || p.starts_with("build/")), "{untracked:?}");

    let excluded = local_excluded(&root).unwrap();
    assert!(excluded.contains(&".env".to_string()), "{excluded:?}");
    assert!(excluded.contains(&"build/out.js".to_string()), "{excluded:?}");
    assert!(!excluded.contains(&"draft.txt".to_string()), "{excluded:?}");

    // Committed files are in neither list.
    assert!(!untracked.contains(&"index.html".to_string()));
    assert!(!excluded.contains(&"index.html".to_string()));
}

#[test]
fn listings_are_capped() {
    let (_t, root) = repo();
    for i in 0..(MAX_LISTED_PATHS + 25) {
        fs::write(root.join(format!("f{i:04}.txt")), "x\n").unwrap();
    }
    let untracked = local_untracked(&root).unwrap();
    assert_eq!(untracked.len(), MAX_LISTED_PATHS);
}
