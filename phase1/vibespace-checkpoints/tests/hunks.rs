use somnia_vibespace_checkpoints::*;
#[test]
fn partial_hunks_and_overlap_rejection() {
    let old = "a\n1\n2\n3\n4\n5\n6\n7\n8\nz\n";
    let new = "A\n1\n2\n3\n4\n5\n6\n7\n8\nZ\n";
    let h = text_hunks(old, new);
    assert_eq!(h.len(), 2);
    let result = apply_text_hunks(old, new, &[h[0].id.clone()]).unwrap();
    assert!(result.starts_with("A\n"));
    assert!(result.ends_with("z\n"));
    assert!(apply_text_hunks(old, new, &[h[0].id.clone(), h[0].id.clone()]).is_err());
    assert!(apply_text_hunks(old, new, &["forged".into()]).is_err());
    assert_eq!(
        apply_text_hunks(
            old,
            new,
            &h.iter().map(|h| h.id.clone()).collect::<Vec<_>>()
        )
        .unwrap(),
        new
    );
}
mod common;
use common::*;
#[test]
fn explicit_partial_apply_is_checkpointed_and_whole_path_stays_compatible() {
    let e = env();
    let old = "a\n1\n2\n3\n4\n5\n6\n7\n8\nz\n";
    let new = old.replace("a\n", "A\n").replace("z\n", "Z\n");
    write(&e.project.join("a.txt"), old);
    let baseline = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&baseline).unwrap();
    write(&copy.root_dir("proj").join("a.txt"), &new);
    let review = review(&e.vault, &baseline, &copy);
    let h = text_hunks(old, &new);
    let selection = HunkSelection {
        path: "proj/a.txt".into(),
        hunk_ids: vec![h[0].id.clone()],
    };
    assert!(apply(
        &e.vault,
        &baseline,
        &copy,
        &review,
        Selection::Hunks {
            paths: vec!["proj/a.txt".into()],
            hunks: vec![selection.clone()]
        }
    )
    .is_err());
    let report = apply(
        &e.vault,
        &baseline,
        &copy,
        &review,
        Selection::Hunks {
            paths: vec![],
            hunks: vec![selection],
        },
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(e.project.join("a.txt")).unwrap(),
        old.replacen("a\n", "A\n", 1)
    );
    e.vault
        .restore(&report.preapply_checkpoint, &RestoreOptions::default())
        .unwrap();
    apply(
        &e.vault,
        &baseline,
        &copy,
        &review,
        Selection::Paths(vec!["proj/a.txt".into()]),
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(e.project.join("a.txt")).unwrap(),
        new
    );
}

#[test]
fn hunk_crash_recovers_and_stale_copy_never_lands() {
    let e = env();
    let baseline = e
        .vault
        .checkpoint(&scope(&e.project), RunMetadata::default())
        .unwrap();
    let copy = e.vault.isolated_copy(&baseline).unwrap();
    let old = "alpha\nbeta\ngamma\n";
    let new = "alpha\nBETA\ngamma\n";
    write(&copy.root_dir("proj").join("a.txt"), new);
    let r = review(&e.vault, &baseline, &copy);
    let ids = text_hunks(old, new).iter().map(|h| h.id.clone()).collect();
    let sel = Selection::Hunks {
        paths: vec![],
        hunks: vec![HunkSelection {
            path: "proj/a.txt".into(),
            hunk_ids: ids,
        }],
    };
    assert!(apply_inject(
        &e.vault,
        &baseline,
        &copy,
        &r,
        sel.clone(),
        Inject::CrashBeforeOp(1)
    )
    .is_err());
    assert_eq!(
        std::fs::read_to_string(e.project.join("a.txt")).unwrap(),
        new
    );
    assert!(e.vault.recover().unwrap().failed.is_empty());
    assert_eq!(
        std::fs::read_to_string(e.project.join("a.txt")).unwrap(),
        old
    );
    write(&copy.root_dir("proj").join("a.txt"), "unreviewed");
    assert!(apply(&e.vault, &baseline, &copy, &r, sel).is_err());
    assert_eq!(
        std::fs::read_to_string(e.project.join("a.txt")).unwrap(),
        old
    );
}
