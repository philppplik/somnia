mod common;
use common::*;
use somnia_vibespace_checkpoints::*;
use std::fs;

#[test]
fn original_untouched_during_isolated_edits() {
    let e = env();
    let before = tree(&e.project);
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&cp).unwrap();
    let work = copy.root_dir("proj");
    write(&work.join("a.txt"), "changed\n");
    write(&work.join("new/file.txt"), "new\n");
    fs::remove_file(work.join("keep.txt")).unwrap();
    assert_eq!(
        tree(&e.project),
        before,
        "agent edits must not reach the original"
    );
    assert!(!copy.dir.starts_with(&e.project));
    // diff works and sees all three kinds
    let cs = e.vault.diff(&cp, &copy).unwrap();
    let kinds: Vec<_> = cs
        .changes
        .iter()
        .map(|c| (c.path.as_str(), c.kind))
        .collect();
    assert_eq!(
        kinds,
        vec![
            ("proj/a.txt", ChangeKind::Modified),
            ("proj/keep.txt", ChangeKind::Deleted),
            ("proj/new/file.txt", ChangeKind::Added)
        ]
    );
    assert_eq!(tree(&e.project), before);
}

#[test]
fn binary_roundtrip_is_exact() {
    let e = env();
    let mut big = Vec::new();
    let mut x = 0x1234_5678u32;
    for _ in 0..3_000_000 {
        x = x.wrapping_mul(1664525).wrapping_add(1013904223);
        big.push((x >> 24) as u8);
    }
    write(&e.project.join("big.dat"), &big);
    write(&e.project.join("empty"), b"");
    write(&e.project.join("crlf.txt"), b"a\r\nb\r\n\r\n");
    write(
        &e.project.join("latin1.txt"),
        [0xE9u8, 0xFF, 0xFE, 0x00, 0x80],
    );
    write(&e.project.join("unicodé ✓/файл.txt"), "ok");
    let before = tree(&e.project);
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&cp).unwrap();
    assert_eq!(tree(&copy.root_dir("proj")), before);
    // restore into a wrecked project is also byte exact
    for f in before.keys() {
        write(&e.project.join(f), b"wrecked");
    }
    e.vault.restore(&cp, &RestoreOptions::default()).unwrap();
    assert_eq!(tree(&e.project), before);
    assert!(e.vault.verify_store().unwrap().is_empty());
}

#[test]
fn checkpoint_is_idempotent_and_dedups() {
    let e = env();
    write(&e.project.join("copy1.txt"), "same bytes");
    write(&e.project.join("copy2.txt"), "same bytes");
    let count = || {
        fn n(d: &std::path::Path) -> usize {
            fs::read_dir(d)
                .unwrap()
                .map(|x| {
                    let p = x.unwrap().path();
                    if p.is_dir() { n(&p) } else { 1 }
                })
                .sum()
        }
        n(&e.vault.root().join("objects"))
    };
    let a = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let objects = count();
    let b = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    assert_eq!(a, b);
    assert_eq!(count(), objects, "no new objects for unchanged content");
    let cp = e.vault.load_checkpoint(&a).unwrap();
    let d1 = &cp.manifest.entries["proj/copy1.txt"].digest;
    assert_eq!(d1, &cp.manifest.entries["proj/copy2.txt"].digest);
    // different run metadata is a different checkpoint over the same objects
    let mut meta = RunMetadata {
        run_id: Some("run-1".into()),
        ..Default::default()
    };
    meta.extra.insert("studio".into(), "code".into());
    let c = e
        .vault
        .checkpoint(&scope(&e.project), meta.clone())
        .unwrap();
    assert_ne!(a, c);
    assert_eq!(e.vault.load_checkpoint(&c).unwrap().record.meta, meta);
    // content change gives a new id
    write(&e.project.join("keep.txt"), "different");
    assert_ne!(
        a,
        e.vault
            .checkpoint(&scope(&e.project), RunMetadata::default())
            .unwrap()
    );
}

#[test]
fn git_dir_is_never_captured_or_copied() {
    let e = env();
    write(&e.project.join(".git/config"), "[core]\n");
    write(&e.project.join(".git/objects/aa/bb"), "secret");
    write(&e.project.join("sub/.git"), "gitdir: ../../elsewhere");
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let c = e.vault.load_checkpoint(&cp).unwrap();
    assert!(c.manifest.entries.keys().all(|k| !k.contains(".git")));
    let copy = e.vault.isolated_copy(&cp).unwrap();
    assert!(!copy.root_dir("proj").join(".git").exists());
    assert!(!copy.root_dir("proj").join("sub/.git").exists());
    // an agent creating .git in the copy gets it ignored (and reported), never applied
    write(&copy.root_dir("proj").join(".git/HEAD"), "ref: x");
    let cs = e.vault.diff(&cp, &copy).unwrap();
    assert!(cs.changes.is_empty());
    assert!(cs.skipped.iter().any(|s| s.path == "proj/.git"));
}

#[test]
fn text_diff_and_binary_metadata() {
    let e = env();
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&cp).unwrap();
    let w = copy.root_dir("proj");
    write(&w.join("a.txt"), "alpha\nBETA\ngamma\n");
    write(&w.join("data/blob.bin"), [1u8, 2, 3, 0, 255]);
    write(&w.join("notes.md"), "héllo\n");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(w.join("keep.txt"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let r = review(&e.vault, &cp, &copy);
    let get = |p: &str| r.changes.iter().find(|c| c.change.path == p).unwrap();
    match &get("proj/a.txt").content {
        ContentDiff::Text {
            unified,
            added_lines,
            removed_lines,
        } => {
            assert_eq!((*added_lines, *removed_lines), (1, 1));
            assert!(unified.contains("-beta\n") && unified.contains("+BETA\n"));
        }
        o => panic!("{o:?}"),
    }
    assert!(matches!(
        &get("proj/data/blob.bin").content,
        ContentDiff::Binary {
            before_size: Some(256),
            after_size: Some(5),
            ..
        }
    ));
    assert!(matches!(
        &get("proj/notes.md").content,
        ContentDiff::Text { .. }
    ));
    #[cfg(unix)]
    assert!(matches!(
        &get("proj/keep.txt").content,
        ContentDiff::ModeOnly {
            before_exec: false,
            after_exec: true
        }
    ));
}

#[test]
fn discard_never_touches_original() {
    let e = env();
    let before = tree(&e.project);
    let cp = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&cp).unwrap();
    write(&copy.root_dir("proj").join("a.txt"), "x");
    assert!(e.vault.discard(&copy).unwrap());
    assert!(!copy.dir.exists());
    assert_eq!(tree(&e.project), before);
    assert!(
        !e.vault.discard(&copy).unwrap(),
        "second discard is a no-op"
    );
    assert!(e.vault.open_isolated(&copy.id).is_err());
    // forged handles cannot point discard anywhere else
    let forged = IsolatedCopy {
        id: "../../project".into(),
        dir: e.project.clone(),
        baseline: cp,
        roots: vec![],
    };
    assert!(e.vault.discard(&forged).is_err());
    let forged = IsolatedCopy {
        id: "iso-000000000000-1".into(),
        dir: e.project.clone(),
        baseline: cp,
        roots: vec![],
    };
    assert!(!e.vault.discard(&forged).unwrap());
    assert_eq!(tree(&e.project), before);
}

#[test]
fn two_roots_and_excludes() {
    let e = env();
    let other = e.tmp.join("other");
    write(&other.join("o.txt"), "o");
    write(&e.project.join("skipme/x.txt"), "x");
    let mut s = Scope::new(vec![
        ScopeRoot {
            name: "proj".into(),
            path: e.project.clone(),
        },
        ScopeRoot {
            name: "other".into(),
            path: other.clone(),
        },
    ]);
    s.exclude.push("proj/skipme".into());
    let cp = e.vault.checkpoint(&s, RunMetadata::default()).unwrap();
    let c = e.vault.load_checkpoint(&cp).unwrap();
    assert!(c.manifest.entries.contains_key("other/o.txt"));
    assert!(
        !c.manifest
            .entries
            .keys()
            .any(|k| k.starts_with("proj/skipme"))
    );
    let copy = e.vault.isolated_copy(&cp).unwrap();
    assert!(copy.root_dir("other").join("o.txt").exists());
}
