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
