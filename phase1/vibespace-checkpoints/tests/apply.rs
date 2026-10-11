mod common;
use common::*;
use somnia_vibespace_checkpoints::*;
use std::fs;

struct Setup {
    e: Env,
    cp: CheckpointId,
    copy: IsolatedCopy,
}

fn setup() -> Setup {
    let e = env();
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&cp).unwrap();
    Setup { e, cp, copy }
}

fn agent_edits(s: &Setup) {
    let w = s.copy.root_dir("proj");
    write(&w.join("a.txt"), "alpha\nBETA\ngamma\n");
    write(&w.join("src/lib.rs"), "pub fn x() {}\n");
    write(&w.join("data/blob.bin"), [9u8, 8, 7, 0, 0, 1]);
    fs::remove_file(w.join("keep.txt")).unwrap();
}

#[test]
fn apply_all_with_add_modify_delete_and_backup() {
    let s = setup();
    let before = tree(&s.e.project);
    agent_edits(&s);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    assert_eq!(r.changes.len(), 4);
    let rep = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
    assert_eq!(rep.applied.len(), 4);
    let after = tree(&s.e.project);
    assert_eq!(after["a.txt"], b"alpha\nBETA\ngamma\n");
    assert_eq!(after["src/lib.rs"], b"pub fn x() {}\n");
    assert_eq!(after["data/blob.bin"], [9u8, 8, 7, 0, 0, 1]);
    assert!(!after.contains_key("keep.txt"));
    assert_eq!(after["src/main.rs"], before["src/main.rs"]);
    // no stage or journal leftovers
    assert!(after.keys().all(|k| !k.contains(".somnia-stage")));
    assert!(e_pending(&s).is_empty());
    // pre-apply checkpoint holds the old state; restore (default) brings back changed + deleted files
    let pre = s.e.vault.load_checkpoint(&rep.preapply_checkpoint).unwrap();
    assert_eq!(pre.record.meta.extra["kind"], "pre-apply");
    assert!(pre.manifest.entries.contains_key("proj/keep.txt"));
    let rr =
        s.e.vault
            .restore(&rep.preapply_checkpoint, &RestoreOptions::default())
            .unwrap();
    assert_eq!(
        rr.restored.len(),
        3,
        "a.txt, blob.bin, keep.txt (src/lib.rs is extra and kept)"
    );
    let mut expect = before.clone();
    expect.insert("src/lib.rs".into(), b"pub fn x() {}\n".to_vec());
    assert_eq!(tree(&s.e.project), expect);
    // remove_extra removes it
    s.e.vault
        .restore(
            &rep.preapply_checkpoint,
            &RestoreOptions {
                remove_extra: true,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(tree(&s.e.project), before);
}

fn e_pending(s: &Setup) -> Vec<String> {
    fs::read_dir(s.e.vault.root().join("journals"))
        .unwrap()
        .map(|x| x.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn only_selected_paths_are_applied() {
    let s = setup();
    agent_edits(&s);
    let before = tree(&s.e.project);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let rep = apply(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::Paths(vec!["proj/a.txt".into(), "proj/keep.txt".into()]),
    )
    .unwrap();
    assert_eq!(rep.applied, vec!["proj/a.txt", "proj/keep.txt"]);
    let after = tree(&s.e.project);
    assert_eq!(after["a.txt"], b"alpha\nBETA\ngamma\n");
    assert!(!after.contains_key("keep.txt"));
    assert!(!after.contains_key("src/lib.rs"));
    assert_eq!(after["data/blob.bin"], before["data/blob.bin"]);
    // the rest can be applied later from the same review
    let rep2 = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
    assert_eq!(rep2.applied, vec!["proj/data/blob.bin", "proj/src/lib.rs"]);
    assert_eq!(rep2.already_applied, vec!["proj/a.txt", "proj/keep.txt"]);
}

#[test]
fn conflicting_user_edit_is_refused_and_preserved() {
    let s = setup();
    agent_edits(&s);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    // user edits two files after the baseline: one the agent also changed, one it deleted
    write(&s.e.project.join("a.txt"), "user was here\n");
    write(&s.e.project.join("keep.txt"), "user edit\n");
    let before = tree(&s.e.project);
    let err = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap_err();
    let c = conflicts(err);
    let paths: Vec<_> = c
        .iter()
        .map(|c| (c.path.as_str(), c.kind.clone()))
        .collect();
    assert_eq!(
        paths,
        vec![
            ("proj/a.txt", ConflictKind::ModifiedSinceBaseline),
            ("proj/keep.txt", ConflictKind::ModifiedSinceBaseline)
        ]
    );
    assert_eq!(
        tree(&s.e.project),
        before,
        "refused apply writes nothing, not even the non-conflicting files"
    );
    // selecting only non-conflicting files works and still preserves the user's edits
    let ok = apply(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::Paths(vec!["proj/src/lib.rs".into()]),
    )
    .unwrap();
    assert_eq!(ok.applied.len(), 1);
    assert_eq!(
        fs::read(s.e.project.join("a.txt")).unwrap(),
        b"user was here\n"
    );
    assert_eq!(
        fs::read(s.e.project.join("keep.txt")).unwrap(),
        b"user edit\n"
    );
}

#[test]
fn added_file_conflicts_with_existing_and_user_deletion() {
    let s = setup();
    write(&s.copy.root_dir("proj").join("new.txt"), "agent\n");
    fs::remove_file(s.copy.root_dir("proj").join("keep.txt")).unwrap();
    write(
        &s.copy.root_dir("proj").join("src/main.rs"),
        "fn main() { 1 }\n",
    );
    let r = review(&s.e.vault, &s.cp, &s.copy);
    write(&s.e.project.join("new.txt"), "user created first\n");
    fs::remove_file(s.e.project.join("src/main.rs")).unwrap();
    let c = conflicts(apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap_err());
    let k: Vec<_> = c
        .iter()
        .map(|c| (c.path.as_str(), c.kind.clone()))
        .collect();
    assert_eq!(
        k,
        vec![
            ("proj/new.txt", ConflictKind::AlreadyExists),
            ("proj/src/main.rs", ConflictKind::DeletedSinceBaseline)
        ]
    );
    assert_eq!(
        fs::read(s.e.project.join("new.txt")).unwrap(),
        b"user created first\n"
    );
    assert!(!s.e.project.join("src/main.rs").exists());
    assert!(s.e.project.join("keep.txt").exists());
}

#[test]
fn wrong_baseline_and_stale_review() {
    let s = setup();
    agent_edits(&s);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let other =
        s.e.vault
            .checkpoint(
                &scope(&s.e.project),
                RunMetadata {
                    label: Some("other".into()),
                    ..Default::default()
                },
            )
            .unwrap();
    let res = s.e.vault.explicit_apply(&ApplyRequest {
        expected_baseline: other,
        copy: &s.copy,
        review: &r,
        selection: Selection::All,
        options: ApplyOptions::default(),
    });
    assert!(matches!(res, Err(Error::BaselineMismatch { .. })));
    // agent keeps editing after review: apply refuses that path, originals untouched
    let before = tree(&s.e.project);
    write(
        &s.copy.root_dir("proj").join("a.txt"),
        "sneaky change after review\n",
    );
    let res = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All);
    assert!(matches!(res, Err(Error::StaleReview(p)) if p == "proj/a.txt"));
    assert_eq!(tree(&s.e.project), before);
}

#[cfg(unix)]
#[test]
fn symlinked_parent_swapped_in_after_baseline_is_refused() {
    use std::os::unix::fs::symlink;
    let s = setup();
    write(&s.copy.root_dir("proj").join("src/extra.rs"), "x");
    let r = review(&s.e.vault, &s.cp, &s.copy);
    // user replaces src/ with a symlink to somewhere else
    let outside = s.e.tmp.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::rename(s.e.project.join("src"), s.e.tmp.join("moved-src")).unwrap();
    symlink(&outside, s.e.project.join("src")).unwrap();
    let res = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All);
    assert!(res.is_err());
    assert!(
        fs::read_dir(&outside).unwrap().next().is_none(),
        "nothing written through the symlink"
    );
}

#[cfg(unix)]
#[test]
fn symlink_at_target_path_is_not_replaced() {
    use std::os::unix::fs::symlink;
    let s = setup();
    write(&s.copy.root_dir("proj").join("new.txt"), "agent\n");
    let r = review(&s.e.vault, &s.cp, &s.copy);
    // scope that skips symlinks: a link appears where the agent wants to add a file
    let outside = s.e.tmp.join("victim.txt");
    write(&outside, "victim");
    symlink(&outside, s.e.project.join("new.txt")).unwrap();
    let mut sc = scope(&s.e.project);
    sc.symlinks = SymlinkPolicy::Skip;
    let cp2 = s.e.vault.checkpoint(&sc, RunMetadata::default());
    // baseline was taken with Reject; apply uses the baseline scope, so the symlink is an error
    assert!(cp2.is_ok());
    let res = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All);
    assert!(res.is_err());
    assert_eq!(fs::read(&outside).unwrap(), b"victim");
    assert!(
        fs::symlink_metadata(s.e.project.join("new.txt"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[test]
fn injected_failure_rolls_back_everything() {
    for inject in [
        Inject::FailBeforeOp(2),
        Inject::FailAfterOp(0),
        Inject::FailAfterOp(3),
        Inject::FailBeforeOp(4),
    ] {
        let s = setup();
        agent_edits(&s);
        write(&s.copy.root_dir("proj").join("deep/er/new.txt"), "n");
        let before = tree(&s.e.project);
        let dirs_before = dir_list(&s.e.project);
        let r = review(&s.e.vault, &s.cp, &s.copy);
        let err = apply_inject(&s.e.vault, &s.cp, &s.copy, &r, Selection::All, inject).unwrap_err();
        match err {
            Error::ApplyFailed { rollback, .. } => assert!(
                rollback.failures.is_empty() && rollback.preserved.is_empty(),
                "{rollback:?}"
            ),
            o => panic!("{o}"),
        }
        assert_eq!(tree(&s.e.project), before, "{inject:?}");
        assert_eq!(
            dir_list(&s.e.project),
            dirs_before,
            "created dirs removed on rollback {inject:?}"
        );
        assert!(e_pending(&s).is_empty());
        // and a retry succeeds
        apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
        assert_eq!(fs::read(s.e.project.join("deep/er/new.txt")).unwrap(), b"n");
    }
}

fn dir_list(p: &std::path::Path) -> Vec<String> {
    fn rec(base: &std::path::Path, d: &std::path::Path, out: &mut Vec<String>) {
        for e in fs::read_dir(d).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                out.push(p.strip_prefix(base).unwrap().to_string_lossy().into_owned());
                rec(base, &p, out);
            }
        }
    }
    let mut v = vec![];
    rec(p, p, &mut v);
    v.sort();
    v
}

#[test]
fn crash_mid_apply_is_recovered() {
    let s = setup();
    agent_edits(&s);
    let before = tree(&s.e.project);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let err = apply_inject(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::All,
        Inject::CrashBeforeOp(2),
    )
    .unwrap_err();
    assert!(matches!(err, Error::InjectedCrash));
    assert_ne!(
        tree(&s.e.project),
        before,
        "partially applied, like a killed process"
    );
    // everything mutating is blocked until recovery
    assert!(matches!(
        s.e.vault
            .checkpoint(&scope(&s.e.project), RunMetadata::default()),
        Err(Error::PendingRecovery(_))
    ));
    assert!(matches!(
        apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All),
        Err(Error::PendingRecovery(_))
    ));
    // a fresh process (new Vault handle) recovers
    let v2 = Vault::open(s.e.vault.root()).unwrap();
    let rep = v2.recover().unwrap();
    assert_eq!(rep.resolved.len(), 1);
    assert!(rep.failed.is_empty());
    assert_eq!(tree(&s.e.project), before);
    assert!(v2.recover().unwrap().resolved.is_empty());
    apply(&v2, &s.cp, &s.copy, &r, Selection::All).unwrap();
}

#[test]
fn recovery_preserves_files_the_user_changed_after_the_crash() {
    let s = setup();
    agent_edits(&s);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let _ = apply_inject(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::All,
        Inject::CrashBeforeOp(3),
    )
    .unwrap_err();
    // ops are ordered: delete keep.txt first, then writes sorted by key; a.txt was written already
    assert_eq!(
        fs::read(s.e.project.join("a.txt")).unwrap(),
        b"alpha\nBETA\ngamma\n"
    );
    write(&s.e.project.join("a.txt"), "user kept editing\n");
    let rep = s.e.vault.recover().unwrap();
    let (_, rb) = &rep.rollbacks[0];
    assert_eq!(rb.preserved, vec!["proj/a.txt"]);
    assert_eq!(
        fs::read(s.e.project.join("a.txt")).unwrap(),
        b"user kept editing\n"
    );
    assert!(
        s.e.project.join("keep.txt").exists(),
        "deleted file brought back"
    );
}

#[test]
fn concurrent_user_edit_during_apply_is_not_clobbered() {
    // simulate the race by editing the original between plan and write through a crash/recover cycle:
    // after a crash the user modifies a not-yet-applied file; a later apply must still conflict.
    let s = setup();
    agent_edits(&s);
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let _ = apply_inject(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::All,
        Inject::CrashBeforeOp(1),
    )
    .unwrap_err();
    s.e.vault.recover().unwrap();
    write(&s.e.project.join("data/blob.bin"), "user bytes");
    let c = conflicts(apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap_err());
    assert_eq!(c.len(), 1);
    assert_eq!(
        fs::read(s.e.project.join("data/blob.bin")).unwrap(),
        b"user bytes"
    );
}

#[test]
fn deletion_through_apply_keeps_backup_and_never_deletes_dirs_or_others() {
    let s = setup();
    fs::remove_file(s.copy.root_dir("proj").join("src/main.rs")).unwrap();
    write(&s.e.project.join("src/untracked.txt"), "user file");
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let rep = apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
    assert!(!s.e.project.join("src/main.rs").exists());
    assert!(s.e.project.join("src/untracked.txt").exists());
    s.e.vault
        .restore(&rep.preapply_checkpoint, &RestoreOptions::default())
        .unwrap();
    assert_eq!(
        fs::read(s.e.project.join("src/main.rs")).unwrap(),
        b"fn main() {}\n"
    );
    // discard of the isolated copy afterwards leaves the project alone
    let before = tree(&s.e.project);
    s.e.vault.discard(&s.copy).unwrap();
    assert_eq!(tree(&s.e.project), before);
}

#[cfg(unix)]
#[test]
fn exec_bit_and_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let s = setup();
    let keep = s.e.project.join("keep.txt");
    fs::set_permissions(&keep, fs::Permissions::from_mode(0o600)).unwrap();
    let cp =
        s.e.vault
            .checkpoint(&scope(&s.e.project), RunMetadata::default())
            .unwrap();
    let copy = s.e.vault.isolated_copy(&cp).unwrap();
    let w = copy.root_dir("proj");
    write(&w.join("keep.txt"), "changed\n");
    fs::set_permissions(w.join("src/main.rs"), fs::Permissions::from_mode(0o755)).unwrap();
    let r = review(&s.e.vault, &cp, &copy);
    apply(&s.e.vault, &cp, &copy, &r, Selection::All).unwrap();
    assert_eq!(
        fs::metadata(&keep).unwrap().permissions().mode() & 0o777,
        0o600,
        "replaced file keeps its mode"
    );
    assert_ne!(
        fs::metadata(s.e.project.join("src/main.rs"))
            .unwrap()
            .permissions()
            .mode()
            & 0o111,
        0
    );
}

#[test]
fn case_only_rename_on_apply() {
    let s = setup();
    let w = s.copy.root_dir("proj");
    fs::rename(w.join("keep.txt"), w.join("Keep.txt")).unwrap();
    let r = review(&s.e.vault, &s.cp, &s.copy);
    // Only the add selected: result tree would hold keep.txt and Keep.txt
    let res = apply(
        &s.e.vault,
        &s.cp,
        &s.copy,
        &r,
        Selection::Paths(vec!["proj/Keep.txt".into()]),
    );
    assert!(matches!(res, Err(Error::CaseCollision { .. })), "{res:?}");
    // both selected: delete first, then add
    apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
    let names: Vec<_> = fs::read_dir(&s.e.project)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(names.contains(&"Keep.txt".to_string()) && !names.contains(&"keep.txt".to_string()));
}

#[test]
fn corrupt_store_is_detected() {
    let s = setup();
    let c = s.e.vault.load_checkpoint(&s.cp).unwrap();
    let blob = c.manifest.entries["proj/data/blob.bin"].digest;
    let path = s.e.vault.store().object_path(&blob);
    let mut perm = fs::metadata(&path).unwrap().permissions();
    assert!(perm.readonly(), "objects are stored read-only");
    #[allow(clippy::permissions_set_readonly_false)]
    perm.set_readonly(false);
    fs::set_permissions(&path, perm).unwrap();
    let mut b = fs::read(&path).unwrap();
    b[10] ^= 1;
    fs::write(&path, &b).unwrap();
    assert!(matches!(
        s.e.vault.store().get_bytes(&blob),
        Err(Error::CorruptObject { .. })
    ));
    assert!(matches!(
        s.e.vault.store().verify(&blob),
        Err(Error::CorruptObject { .. })
    ));
    let bad = s.e.vault.verify_store().unwrap();
    assert_eq!(bad.len(), 1);
    assert_eq!(bad[0].digest, Some(blob));
    // materializing and restoring refuse corrupt content, leaving no partial copy behind
    let n_before = fs::read_dir(s.e.vault.root().join("isolated"))
        .unwrap()
        .count();
    assert!(matches!(
        s.e.vault.isolated_copy(&s.cp),
        Err(Error::CorruptObject { .. })
    ));
    assert_eq!(
        fs::read_dir(s.e.vault.root().join("isolated"))
            .unwrap()
            .count(),
        n_before
    );
    write(&s.e.project.join("data/blob.bin"), "changed");
    assert!(matches!(
        s.e.vault.restore(&s.cp, &RestoreOptions::default()),
        Err(Error::CorruptObject { .. })
    ));
    assert_eq!(
        fs::read(s.e.project.join("data/blob.bin")).unwrap(),
        b"changed"
    );
    // re-checkpointing the same content does not silently "heal" the corrupt object
    fs::write(
        s.e.project.join("data/blob.bin"),
        (0..=255u8).collect::<Vec<_>>(),
    )
    .unwrap();
    assert!(matches!(
        s.e.vault
            .checkpoint(&scope(&s.e.project), RunMetadata::default()),
        Err(Error::CorruptObject { .. })
    ));
    // missing object
    fs::remove_file(&path).unwrap();
    assert!(matches!(
        s.e.vault.store().get_bytes(&blob),
        Err(Error::MissingObject(_))
    ));
    // corrupt checkpoint record / truncated manifest
    let mpath = s.e.vault.store().object_path(&c.record.manifest);
    let mut p = fs::metadata(&mpath).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    p.set_readonly(false);
    fs::set_permissions(&mpath, p).unwrap();
    fs::write(&mpath, b"{").unwrap();
    assert!(matches!(
        s.e.vault.load_checkpoint(&s.cp),
        Err(Error::CorruptObject { .. })
    ));
}

#[test]
fn restore_without_changes_is_a_noop_and_empty_review_is_refused() {
    let s = setup();
    let rr =
        s.e.vault
            .restore(&s.cp, &RestoreOptions::default())
            .unwrap();
    assert!(rr.restored.is_empty() && rr.removed.is_empty());
    let r = review(&s.e.vault, &s.cp, &s.copy);
    assert!(r.changes.is_empty());
    assert!(matches!(
        apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All),
        Err(Error::EmptySelection)
    ));
}

#[test]
fn vault_lock_blocks_concurrent_mutation() {
    let s = setup();
    write(&s.copy.root_dir("proj").join("a.txt"), "x");
    let r = review(&s.e.vault, &s.cp, &s.copy);
    let held = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(s.e.vault.root().join("lock"))
        .unwrap();
    held.try_lock().unwrap();
    assert!(matches!(
        apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All),
        Err(Error::Locked)
    ));
    assert!(matches!(
        s.e.vault.restore(&s.cp, &RestoreOptions::default()),
        Err(Error::Locked)
    ));
    assert!(matches!(s.e.vault.recover(), Err(Error::Locked)));
    drop(held);
    apply(&s.e.vault, &s.cp, &s.copy, &r, Selection::All).unwrap();
}
