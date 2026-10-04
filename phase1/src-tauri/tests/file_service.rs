use somnia_desktop::service::{validate_path, AppError, FileState, Project, Revision};
use std::{fs, thread, time::Duration};
use tempfile::TempDir;
fn setup() -> (TempDir, TempDir, Project) {
    let root = TempDir::new().unwrap();
    let recovery = TempDir::new().unwrap();
    fs::write(root.path().join("index.html"), "original").unwrap();
    let project = Project::open(root.path(), recovery.path()).unwrap();
    (root, recovery, project)
}
#[test]
fn saves_exact_bytes_and_removes_journal() {
    let (root, _recovery, mut p) = setup();
    let initial = p.read("index.html").unwrap();
    p.stage("index.html", "<!doctype html>\nUTF-8: Grüße ☾\n".into(), 1)
        .unwrap();
    assert_eq!(p.recovery_list().unwrap().len(), 1);
    let saved = p.save("index.html", &initial.revision).unwrap();
    assert_eq!(saved.state, FileState::Saved);
    assert_eq!(saved.client_revision, 1);
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "<!doctype html>\nUTF-8: Grüße ☾\n"
    );
    assert!(p.recovery_list().unwrap().is_empty());
    assert!(fs::read_dir(root.path()).unwrap().all(|e| !e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".somnia-write-")));
}
#[test]
fn external_change_blocks_save_and_preserves_both_versions() {
    let (root, _recovery, mut p) = setup();
    let base = p.read("index.html").unwrap().revision;
    p.stage("index.html", "my edits".into(), 1).unwrap();
    fs::write(root.path().join("index.html"), "external").unwrap();
    assert!(matches!(
        p.save("index.html", &base),
        Err(AppError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "external"
    );
    assert_eq!(p.recovery_read("index.html").unwrap().content, "my edits");
    assert_eq!(
        p.read("index.html").unwrap().status.state,
        FileState::Conflict
    );
}
#[test]
fn reviewed_merge_uses_new_disk_revision() {
    let (root, _recovery, mut p) = setup();
    p.read("index.html").unwrap();
    p.stage("index.html", "mine".into(), 1).unwrap();
    fs::write(root.path().join("index.html"), "theirs").unwrap();
    let external = p.read("index.html").unwrap();
    p.stage("index.html", "merged".into(), 2).unwrap();
    assert_eq!(
        p.save("index.html", &external.revision).unwrap().state,
        FileState::Saved
    );
}
#[test]
fn deletion_is_a_conflict_not_an_implicit_recreate() {
    let (root, _recovery, mut p) = setup();
    let base = p.read("index.html").unwrap().revision;
    p.stage("index.html", "mine".into(), 1).unwrap();
    fs::remove_file(root.path().join("index.html")).unwrap();
    assert!(matches!(
        p.save("index.html", &base),
        Err(AppError::Conflict)
    ));
    assert!(!root.path().join("index.html").exists());
}
#[test]
fn creates_new_file_with_explicit_missing_revision() {
    let (root, _recovery, mut p) = setup();
    p.stage("new.html", "new".into(), 1).unwrap();
    p.save(
        "new.html",
        &Revision {
            exists: false,
            hash: None,
        },
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(root.path().join("new.html")).unwrap(),
        "new"
    );
}
#[test]
fn restart_discovers_recovery_without_auto_overwriting_disk() {
    let (root, recovery, mut p) = setup();
    p.stage("index.html", "unsaved".into(), 1).unwrap();
    drop(p);
    let mut reopened = Project::open(root.path(), recovery.path()).unwrap();
    let recovered = reopened.recovery_read("index.html").unwrap();
    assert_eq!(recovered.client_revision, 1);
    assert_eq!(recovered.content, "unsaved");
    thread::sleep(Duration::from_millis(1100));
    reopened.tick();
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "original"
    );
    reopened.recovery_restore("index.html", 2).unwrap();
    thread::sleep(Duration::from_millis(1100));
    reopened.tick();
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "unsaved"
    );
}
#[test]
fn restore_external_changes_requires_merge() {
    let (root, recovery, mut p) = setup();
    p.stage("index.html", "recovery".into(), 1).unwrap();
    drop(p);
    fs::write(root.path().join("index.html"), "external while closed").unwrap();
    let mut p = Project::open(root.path(), recovery.path()).unwrap();
    assert_eq!(
        p.recovery_restore("index.html", 2).unwrap().state,
        FileState::Conflict
    );
    thread::sleep(Duration::from_millis(1100));
    p.tick();
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "external while closed"
    );
}
#[test]
fn rejects_out_of_order_edits() {
    let (_root, _recovery, mut p) = setup();
    p.stage("index.html", "new".into(), 5).unwrap();
    assert!(matches!(
        p.stage("index.html", "old".into(), 4),
        Err(AppError::StaleRevision)
    ));
    assert_eq!(p.recovery_read("index.html").unwrap().content, "new");
}
#[test]
fn denies_escaping_and_reserved_paths() {
    for path in [
        "",
        "/etc/passwd",
        "../index.html",
        "a/../../b",
        "C:/foo",
        "\\\\server\\share",
        ".git/config",
        ".somnia/config.json",
        "node_modules/a",
        "a//b",
        "./a",
        "a/./b",
        "CON.txt",
        "x/NUL",
        "LPT1",
        "a.",
        "a ",
    ] {
        assert!(validate_path(path).is_err(), "accepted {path}");
    }
}
#[test]
fn exclusive_lock_prevents_second_process_session() {
    let (root, recovery, p) = setup();
    assert!(matches!(
        Project::open(root.path(), recovery.path()),
        Err(AppError::Locked)
    ));
    drop(p);
    assert!(Project::open(root.path(), recovery.path()).is_ok());
}
#[test]
fn dirty_recovery_cannot_be_discarded() {
    let (_root, _recovery, mut p) = setup();
    p.stage("index.html", "new".into(), 1).unwrap();
    assert!(matches!(
        p.recovery_discard("index.html"),
        Err(AppError::Dirty)
    ));
}
#[test]
fn autosave_runs_off_ui_and_returns_matching_revision() {
    let (root, _recovery, mut p) = setup();
    p.stage("index.html", "auto".into(), 17).unwrap();
    assert!(p.tick().is_empty());
    thread::sleep(Duration::from_millis(1100));
    let events = p.tick();
    assert!(events
        .iter()
        .any(|e| e.state == FileState::Saved && e.client_revision == 17));
    assert_eq!(
        fs::read_to_string(root.path().join("index.html")).unwrap(),
        "auto"
    );
}
#[test]
fn explorer_skips_reserved_directories() {
    let (root, _recovery, p) = setup();
    fs::create_dir(root.path().join("node_modules")).unwrap();
    fs::write(root.path().join("node_modules/secret"), "secret").unwrap();
    assert_eq!(p.list_files().unwrap(), ["index.html"]);
}
#[cfg(unix)]
#[test]
fn symlink_escape_is_denied_for_reads_and_writes() {
    let (root, _recovery, mut p) = setup();
    let outside = TempDir::new().unwrap();
    fs::write(outside.path().join("secret"), "private").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
    assert!(p.read("escape/secret").is_err());
    assert!(p.stage("escape/secret", "bad".into(), 1).is_err());
    assert_eq!(
        fs::read_to_string(outside.path().join("secret")).unwrap(),
        "private"
    );
}
#[cfg(unix)]
#[test]
fn preserves_original_unix_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let (root, _recovery, mut p) = setup();
    fs::set_permissions(
        root.path().join("index.html"),
        fs::Permissions::from_mode(0o640),
    )
    .unwrap();
    let base = p.read("index.html").unwrap().revision;
    p.stage("index.html", "new".into(), 1).unwrap();
    p.save("index.html", &base).unwrap();
    assert_eq!(
        fs::metadata(root.path().join("index.html"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o640
    );
}
#[test]
fn failed_save_stays_error_and_preserves_recovery() {
    let (root, _recovery, mut p) = setup();
    fs::create_dir(root.path().join("folder")).unwrap();
    p.stage("folder/new.html", "recover me".into(), 1).unwrap();
    fs::remove_dir(root.path().join("folder")).unwrap();
    assert!(p
        .save(
            "folder/new.html",
            &Revision {
                exists: false,
                hash: None
            }
        )
        .is_err());
    assert!(p.has_dirty());
    assert_eq!(
        p.recovery_read("folder/new.html").unwrap().content,
        "recover me"
    );
    assert_eq!(
        p.read("folder/new.html").unwrap().status.state,
        FileState::Error
    );
}
#[test]
fn oversized_stage_is_rejected_before_journaling() {
    let (_root, _recovery, mut p) = setup();
    assert!(matches!(
        p.stage("index.html", "x".repeat(8 * 1024 * 1024 + 1), 1),
        Err(AppError::Limit)
    ));
    assert!(!p.has_dirty());
    assert!(p.recovery_list().unwrap().is_empty());
}
#[test]
fn external_clean_change_emits_revision_without_self_echo() {
    let (root, _recovery, mut p) = setup();
    let base = p.read("index.html").unwrap().revision;
    p.stage("index.html", "self".into(), 1).unwrap();
    p.save("index.html", &base).unwrap();
    thread::sleep(Duration::from_millis(2100));
    assert!(p.tick().is_empty());
    fs::write(root.path().join("index.html"), "external").unwrap();
    thread::sleep(Duration::from_millis(2100));
    assert!(p
        .tick()
        .iter()
        .any(|e| e.state == FileState::Saved && e.disk_revision != base));
}
#[test]
fn creates_new_file_in_new_folder_and_deletes_with_revision_check() {
    let (root, _recovery, mut p) = setup();
    let missing = p.read("pages/about.html").unwrap().revision;
    assert!(!missing.exists);
    p.stage("pages/about.html", "<h1>About</h1>".into(), 1).unwrap();
    let saved = p.save("pages/about.html", &missing).unwrap();
    assert_eq!(saved.state, FileState::Saved);
    assert_eq!(
        fs::read_to_string(root.path().join("pages/about.html")).unwrap(),
        "<h1>About</h1>"
    );
    // A stale revision must not delete anything.
    assert!(matches!(
        p.delete("pages/about.html", &missing),
        Err(AppError::Conflict)
    ));
    assert!(root.path().join("pages/about.html").exists());
    let current = p.read("pages/about.html").unwrap().revision;
    p.delete("pages/about.html", &current).unwrap();
    assert!(!root.path().join("pages/about.html").exists());
    assert!(root.path().join("index.html").exists());
    // Deleting an already missing file with the matching (missing) revision is a no-op.
    let gone = p.read("pages/about.html").unwrap().revision;
    p.delete("pages/about.html", &gone).unwrap();
    assert!(p.delete("../escape.html", &gone).is_err());
}
