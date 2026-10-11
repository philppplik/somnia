mod common;
use common::*;
use somnia_vibespace_checkpoints::*;
use std::fs;

fn cp(e: &Env, s: &Scope) -> Result<CheckpointId> {
    e.vault.checkpoint(s, RunMetadata::default())
}

#[cfg(unix)]
#[test]
fn symlinks_are_rejected_or_skipped_never_followed() {
    use std::os::unix::fs::symlink;
    let e = env();
    let outside = e.tmp.join("outside");
    write(&outside.join("secret.txt"), "top secret");
    symlink(&outside, e.project.join("escape")).unwrap();
    assert!(matches!(cp(&e, &scope(&e.project)), Err(Error::Symlink(p)) if p == "proj/escape"));
    // file symlink too
    fs::remove_file(e.project.join("escape")).unwrap();
    symlink(outside.join("secret.txt"), e.project.join("link.txt")).unwrap();
    assert!(matches!(cp(&e, &scope(&e.project)), Err(Error::Symlink(_))));
    // dangling
    fs::remove_file(e.project.join("link.txt")).unwrap();
    symlink("/nonexistent/x", e.project.join("dangling")).unwrap();
    assert!(matches!(cp(&e, &scope(&e.project)), Err(Error::Symlink(_))));
    // skip policy: skipped, content of target never captured, link itself untouched
    let mut s = scope(&e.project);
    s.symlinks = SymlinkPolicy::Skip;
    symlink(&outside, e.project.join("escape")).unwrap();
    let id = cp(&e, &s).unwrap();
    let c = e.vault.load_checkpoint(&id).unwrap();
    assert!(
        c.manifest
            .entries
            .keys()
            .all(|k| !k.contains("secret") && !k.contains("escape"))
    );
    assert!(
        fs::symlink_metadata(e.project.join("escape"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[cfg(unix)]
#[test]
fn symlink_planted_in_isolated_copy_is_an_error() {
    use std::os::unix::fs::symlink;
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    symlink("/etc/passwd", copy.root_dir("proj").join("evil")).unwrap();
    assert!(matches!(e.vault.diff(&id, &copy), Err(Error::Symlink(_))));
    assert!(matches!(
        e.vault.review_changes(&id, &copy),
        Err(Error::Symlink(_))
    ));
}

#[cfg(unix)]
#[test]
fn special_files_rejected() {
    let e = env();
    let sock = e.project.join("s.sock");
    let _l = std::os::unix::net::UnixListener::bind(&sock).unwrap();
    assert!(matches!(cp(&e, &scope(&e.project)), Err(Error::SpecialFile(p)) if p == "proj/s.sock"));
}

#[test]
fn overlapping_roots_and_vault_overlap() {
    let e = env();
    let s = Scope::new(vec![
        ScopeRoot {
            name: "a".into(),
            path: e.project.clone(),
        },
        ScopeRoot {
            name: "b".into(),
            path: e.project.join("src"),
        },
    ]);
    assert!(matches!(cp(&e, &s), Err(Error::OverlappingRoots { .. })));
    let s = Scope::new(vec![
        ScopeRoot {
            name: "a".into(),
            path: e.project.clone(),
        },
        ScopeRoot {
            name: "b".into(),
            path: e.project.join("src/.."),
        },
    ]);
    assert!(
        matches!(cp(&e, &s), Err(Error::OverlappingRoots { .. })),
        "equal after canonicalization"
    );
    // a vault inside the project (or containing it) is refused
    let inner = Vault::open(e.project.join(".vault")).unwrap();
    assert!(matches!(
        inner.checkpoint(&scope(&e.project), RunMetadata::default()),
        Err(Error::ScopeOverlapsVault(_))
    ));
    let s = Scope::single("v", e.vault.root());
    assert!(matches!(cp(&e, &s), Err(Error::ScopeOverlapsVault(_))));
    // duplicate names (case-insensitive) and bad names
    let other = e.tmp.join("other");
    fs::create_dir_all(&other).unwrap();
    let s = Scope::new(vec![
        ScopeRoot {
            name: "Proj".into(),
            path: e.project.clone(),
        },
        ScopeRoot {
            name: "proj".into(),
            path: other.clone(),
        },
    ]);
    assert!(matches!(cp(&e, &s), Err(Error::InvalidScope(_))));
    for bad in ["", "..", "a/b", ".hidden", "a b"] {
        assert!(cp(&e, &Scope::single(bad, &e.project)).is_err(), "{bad:?}");
    }
    assert!(cp(&e, &Scope::single("x", e.tmp.join("missing"))).is_err());
}

#[test]
fn case_collisions_rejected() {
    let e = env();
    write(&e.project.join("Readme.md"), "1");
    write(&e.project.join("README.md"), "2");
    // some filesystems (macOS default) cannot even hold both; then nothing to test
    if fs::read_dir(&e.project)
        .unwrap()
        .filter(|x| {
            x.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                == "readme.md"
        })
        .count()
        == 2
    {
        assert!(matches!(
            cp(&e, &scope(&e.project)),
            Err(Error::CaseCollision { .. })
        ));
    }
    // directory-level collision
    fs::remove_file(e.project.join("README.md")).ok();
    fs::remove_file(e.project.join("Readme.md")).ok();
    write(&e.project.join("Dir/a"), "1");
    write(&e.project.join("dir/b"), "2");
    if fs::read_dir(&e.project)
        .unwrap()
        .filter(|x| {
            x.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                == "dir"
        })
        .count()
        == 2
    {
        assert!(matches!(
            cp(&e, &scope(&e.project)),
            Err(Error::CaseCollision { .. })
        ));
    }
}

#[test]
fn case_collision_created_by_agent_in_isolated_copy() {
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    let w = copy.root_dir("proj");
    write(&w.join("Case.txt"), "1");
    write(&w.join("case.txt"), "2");
    if fs::read_dir(&w)
        .unwrap()
        .filter(|x| {
            x.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                == "case.txt"
        })
        .count()
        == 2
    {
        assert!(matches!(
            e.vault.diff(&id, &copy),
            Err(Error::CaseCollision { .. })
        ));
    }
}

#[test]
fn windows_unportable_names_rejected_by_default() {
    let e = env();
    write(&e.project.join("aux.txt"), "x");
    assert!(matches!(
        cp(&e, &scope(&e.project)),
        Err(Error::InvalidPath { .. })
    ));
    let mut s = scope(&e.project);
    s.portable_names = false;
    assert!(cp(&e, &s).is_ok());
    fs::remove_file(e.project.join("aux.txt")).unwrap();
    #[cfg(unix)]
    {
        write(&e.project.join("a:b"), "x");
        assert!(cp(&e, &scope(&e.project)).is_err());
    }
}

#[test]
fn quota_overflow() {
    let e = env();
    let mut s = scope(&e.project);
    s.limits.max_files = 2;
    assert!(matches!(
        cp(&e, &s),
        Err(Error::QuotaExceeded {
            what: "file count",
            ..
        })
    ));
    let mut s = scope(&e.project);
    s.limits.max_file_bytes = 100;
    assert!(
        matches!(cp(&e, &s), Err(Error::QuotaExceeded { what: "file bytes", path: Some(p), .. }) if p == "proj/data/blob.bin")
    );
    let mut s = scope(&e.project);
    s.limits.max_total_bytes = 100;
    assert!(matches!(
        cp(&e, &s),
        Err(Error::QuotaExceeded {
            what: "total bytes",
            ..
        })
    ));
    // an agent blowing the quota inside the isolated copy is caught at diff time
    let mut s = scope(&e.project);
    s.limits.max_file_bytes = 1000;
    let id = cp(&e, &s).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    write(&copy.root_dir("proj").join("huge.bin"), vec![7u8; 5000]);
    assert!(matches!(
        e.vault.diff(&id, &copy),
        Err(Error::QuotaExceeded { .. })
    ));
}

#[test]
fn hostile_manifest_in_store_is_rejected() {
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let good = e.vault.load_checkpoint(&id).unwrap();
    let d = e.vault.store().put_bytes(b"x").unwrap();
    for key in [
        "proj/../../etc/passwd",
        "/abs",
        "proj/a\\b",
        "noroot",
        "other/x",
    ] {
        let m = format!(
            r#"{{"format":1,"entries":{{"{}":{{"digest":"{d}","size":1,"exec":false}}}}}}"#,
            key.replace('\\', "\\\\")
        );
        let md = e.vault.store().put_bytes(m.as_bytes()).unwrap();
        let mut rec = good.record.clone();
        rec.manifest = md;
        let rid = e
            .vault
            .store()
            .put_bytes(&serde_json::to_vec(&rec).unwrap())
            .unwrap();
        assert!(e.vault.load_checkpoint(&rid).is_err(), "{key}");
        assert!(e.vault.isolated_copy(&rid).is_err(), "{key}");
    }
    // nothing escaped
    assert!(!e.tmp.join("etc").exists());
}

#[test]
fn selection_paths_are_validated() {
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    write(&copy.root_dir("proj").join("a.txt"), "z");
    let r = review(&e.vault, &id, &copy);
    for bad in ["proj/../../x", "/etc/passwd", "proj/keep.txt", "proj/nope"] {
        let res = apply(&e.vault, &id, &copy, &r, Selection::Paths(vec![bad.into()]));
        assert!(matches!(res, Err(Error::UnknownSelection(_))), "{bad}");
    }
    assert!(matches!(
        apply(&e.vault, &id, &copy, &r, Selection::Paths(vec![])),
        Err(Error::EmptySelection)
    ));
}

#[test]
fn marker_is_written_readonly_never_captured_and_tamper_blocks_apply() {
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    let m = copy.root_dir("proj").join(MARKER_NAME);
    assert!(m.is_file());
    assert!(fs::metadata(&m).unwrap().permissions().readonly());
    // marker and a planted .git are not changes
    write(&copy.root_dir("proj").join(".git/HEAD"), "x");
    write(
        &copy.root_dir("proj").join("sub/.vibespace-isolated"),
        "nested",
    );
    write(&copy.root_dir("proj").join("a.txt"), "edited\n");
    let r = review(&e.vault, &id, &copy);
    assert_eq!(r.changes.len(), 1);
    assert!(r.skipped.iter().any(|s| s.path == "proj/.git"));
    assert!(
        !r.skipped
            .iter()
            .any(|s| s.reason.contains("missing or modified"))
    );
    assert!(apply(&e.vault, &id, &copy, &r, Selection::All).is_ok());
    // a marker in the original project is never captured either
    write(&e.project.join(MARKER_NAME), "from original");
    let id2 = cp(&e, &scope(&e.project)).unwrap();
    let c = e.vault.load_checkpoint(&id2).unwrap();
    assert!(c.manifest.entries.keys().all(|k| !k.contains(MARKER_NAME)));
    // tampering: agent replaces or deletes the marker
    let copy2 = e.vault.isolated_copy(&id2).unwrap();
    let m2 = copy2.root_dir("proj").join(MARKER_NAME);
    write(&copy2.root_dir("proj").join("a.txt"), "again\n");
    let r2 = review(&e.vault, &id2, &copy2);
    #[allow(clippy::permissions_set_readonly_false)]
    {
        let mut p = fs::metadata(&m2).unwrap().permissions();
        p.set_readonly(false);
        fs::set_permissions(&m2, p).unwrap();
    }
    fs::write(&m2, "forged").unwrap();
    let cs = e.vault.diff(&id2, &copy2).unwrap();
    assert!(
        cs.skipped
            .iter()
            .any(|s| s.path == "proj/.vibespace-isolated"
                && s.reason.contains("missing or modified"))
    );
    assert!(cs.changes.iter().all(|c| !c.path.contains(MARKER_NAME)));
    let before = tree(&e.project);
    assert!(matches!(
        apply(&e.vault, &id2, &copy2, &r2, Selection::All),
        Err(Error::IsolatedTampered(_))
    ));
    // forged handle without markers cannot bypass: the vault's own record decides
    let mut forged = copy2.clone();
    forged.markers.clear();
    assert!(matches!(
        apply(&e.vault, &id2, &forged, &r2, Selection::All),
        Err(Error::IsolatedTampered(_))
    ));
    fs::remove_file(&m2).unwrap();
    assert!(matches!(
        apply(&e.vault, &id2, &copy2, &r2, Selection::All),
        Err(Error::IsolatedTampered(_))
    ));
    assert_eq!(tree(&e.project), before);
}

#[test]
fn marker_policies() {
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let c = e
        .vault
        .isolated_copy_with(
            &id,
            &IsolatedCopyOptions {
                marker: MarkerPolicy::Bytes(b"POLICY-V1".to_vec()),
            },
        )
        .unwrap();
    assert_eq!(
        fs::read(c.root_dir("proj").join(MARKER_NAME)).unwrap(),
        b"POLICY-V1"
    );
    let c = e
        .vault
        .isolated_copy_with(
            &id,
            &IsolatedCopyOptions {
                marker: MarkerPolicy::None,
            },
        )
        .unwrap();
    assert!(!c.root_dir("proj").join(MARKER_NAME).exists());
    assert!(c.markers.is_empty());
    // caller-created marker is excluded from review, nothing to verify
    write(&c.root_dir("proj").join(MARKER_NAME), "caller");
    assert!(e.vault.diff(&id, &c).unwrap().changes.is_empty());
    let reopened = e.vault.open_isolated(&c.id).unwrap();
    assert_eq!(reopened, c);
}

#[cfg(unix)]
#[test]
fn isolated_files_are_byte_copies_not_links() {
    use std::os::unix::fs::MetadataExt;
    let e = env();
    let id = cp(&e, &scope(&e.project)).unwrap();
    let copy = e.vault.isolated_copy(&id).unwrap();
    let cpv = e.vault.load_checkpoint(&id).unwrap();
    for (key, entry) in &cpv.manifest.entries {
        let rel = key.strip_prefix("proj/").unwrap();
        let c = fs::symlink_metadata(copy.root_dir("proj").join(rel)).unwrap();
        let o = fs::metadata(e.project.join(rel)).unwrap();
        let obj = fs::metadata(e.vault.store().object_path(&entry.digest)).unwrap();
        assert!(c.file_type().is_file());
        assert_eq!(c.nlink(), 1, "{key}");
        assert!(
            (c.dev(), c.ino()) != (o.dev(), o.ino()),
            "{key} shares an inode with the original"
        );
        assert!(
            (c.dev(), c.ino()) != (obj.dev(), obj.ino()),
            "{key} shares an inode with a store object"
        );
    }
    // writing through the copy leaves originals and objects intact
    let a = copy.root_dir("proj").join("a.txt");
    fs::write(&a, "overwritten in place").unwrap();
    assert_eq!(
        fs::read(e.project.join("a.txt")).unwrap(),
        b"alpha\nbeta\ngamma\n"
    );
    assert!(e.vault.verify_store().unwrap().is_empty());
}
