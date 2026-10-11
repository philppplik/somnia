//! Independent adversarial review of the artifact-operation journal
//! (coordinator repairs 99f5f5f + e3680f0): pre-write intent + Undo,
//! durable vault receipts, metadata-only reconcile on open/apply/discard/restore.
//!
//! `blocker_*` tests are EXPECTED TO FAIL (red) against the reviewed HEAD.
//! Everything else pins an invariant of the repair (green).

use async_trait::async_trait;
use somnia_vibespace_checkpoints as cp;
use somnia_vibespace_core::{runtime::Runtime, wire::*};
use somnia_vibespace_storage as db;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use vibespace_engine as engine;

const MODEL: &str = "qwen3.5:9b";

fn local_config() -> engine::ModelConfig {
    engine::ModelConfig::Local {
        endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(),
        model: MODEL.into(),
    }
}

fn start_request(studio: &StudioSummary) -> StartRun {
    StartRun {
        studio_id: studio.studio_id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        retry_of_run_id: None,
    }
}

struct Fixture {
    data: tempfile::TempDir,
    project: tempfile::TempDir,
    rt: Arc<Runtime>,
    studio: StudioSummary,
}

fn setup() -> Fixture {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    std::fs::write(project.path().join("hello.txt"), "before").unwrap();
    let rt = Runtime::open(data.path(), true).unwrap();
    let grant = rt.grant_native_folder("main", project.path()).unwrap();
    let space = rt
        .create_space(
            "main",
            CreateSpace {
                name: "journal".into(),
                folder_grant_id: grant,
            },
        )
        .unwrap();
    let studio = rt
        .create_studio(CreateStudio {
            space_id: space.space_id.clone(),
            goal: "edit hello".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: MODEL.into(),
                locality: ModelLocality::Local,
            },
        })
        .unwrap();
    Fixture {
        data,
        project,
        rt,
        studio,
    }
}

struct WriteThenDone(AtomicUsize);
#[async_trait]
impl engine::ModelTransport for WriteThenDone {
    async fn complete(&self, _: engine::ModelInput) -> Result<engine::ModelReply, engine::Failure> {
        let n = self.0.fetch_add(1, Ordering::SeqCst);
        Ok(engine::ModelReply {
            message: "m".into(),
            tool: if n == 0 {
                Some(engine::ToolProposal {
                    call_id: "w1".into(),
                    name: "write_file".into(),
                    arguments: serde_json::json!({"path":"hello.txt","content":"after"}),
                })
            } else {
                None
            },
            usage: Default::default(),
        })
    }
}

struct TwoEdits(AtomicUsize);
#[async_trait]
impl engine::ModelTransport for TwoEdits {
    async fn complete(&self, _: engine::ModelInput) -> Result<engine::ModelReply, engine::Failure> {
        let n = self.0.fetch_add(1, Ordering::SeqCst);
        Ok(engine::ModelReply {
            message: "m".into(),
            tool: if n < 2 {
                Some(engine::ToolProposal {
                    call_id: format!("w{n}"),
                    name: "write_file".into(),
                    arguments: serde_json::json!({"path":if n==0{"hello.txt"}else{"second.txt"},"content":"after"}),
                })
            } else {
                None
            },
            usage: Default::default(),
        })
    }
}

async fn drive(rt: &Arc<Runtime>, id: &str) -> SnapshotReply {
    for _ in 0..600 {
        let snapshot = rt.snapshot(id).unwrap();
        for consent in &snapshot.snapshot.pending_consents {
            rt.decide(ConsentDecision {
                run_id: id.into(),
                request_id: consent.request_id.clone(),
                choice: ConsentChoice::AllowOnce,
            })
            .unwrap();
        }
        if matches!(
            snapshot.snapshot.execution_state,
            ExecutionState::Done
                | ExecutionState::Failed
                | ExecutionState::Stopped
                | ExecutionState::Crashed
        ) {
            return snapshot;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("run {id} never reached a terminal state");
}

async fn completed_run(f: &Fixture, edits_two: bool) -> (String, String) {
    let transport: Arc<dyn engine::ModelTransport> = if edits_two {
        Arc::new(TwoEdits(AtomicUsize::new(0)))
    } else {
        Arc::new(WriteThenDone(AtomicUsize::new(0)))
    };
    let run =
        f.rt.start(start_request(&f.studio), transport, local_config())
            .await
            .unwrap()
            .snapshot
            .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    (run, revision)
}

fn prepared_ids(f: &Fixture, run: &str) -> (cp::Digest, String) {
    let events = f.rt.store.list_events(run, 0, 500).unwrap();
    let prepared = events.iter().find(|e| e.kind == "core.prepared").unwrap();
    (
        cp::Digest::from_hex(prepared.payload["baseline"].as_str().unwrap()).unwrap(),
        prepared.payload["isolatedId"].as_str().unwrap().into(),
    )
}

/// Simulates a crash after originals commit but before DB completion, using a
/// real SQLite trigger on the finish write. Returns with one `prepared`
/// artifact operation and a durable committed vault receipt left behind.
fn inject_postcommit_failure(f: &Fixture, run: &str, revision: &str) {
    let conn = rusqlite::Connection::open(f.data.path().join("vibespace.sqlite")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_apply_finish BEFORE UPDATE ON artifact_operations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'injected postcommit DB failure'); END;").unwrap();
    assert!(f
        .rt
        .apply(run, revision, vec!["project/hello.txt".into()])
        .is_err());
    assert_eq!(f.rt.store.pending_artifact_applies().unwrap().len(), 1);
    conn.execute_batch("DROP TRIGGER fail_apply_finish")
        .unwrap();
    drop(conn);
}

/// BLOCKER (new, crash window + reconcile ordering): when an apply committed
/// its originals (durable receipt exists) but the DB completion never landed,
/// reconcile must finish the metadata. It does - UNLESS the review projection
/// is also broken (isolated copy deleted while the process was down). Then
/// `reconcile_applies` propagates the projection error, `Runtime::open` fails,
/// and EVERY later open/apply/discard/restore fails the same way: the whole
/// data directory is permanently unopenable because one run's isolated copy is
/// missing. Reconcile must not let a projection read veto journal completion
/// (the receipt already proves the commit; completeness can degrade to
/// "files unknown, review stays ready").
#[tokio::test]
async fn blocker_committed_apply_with_deleted_copy_makes_open_fail_forever() {
    let f = setup();
    let (run, revision) = completed_run(&f, false).await;
    inject_postcommit_failure(&f, &run, &revision);
    let (_, isolated) = prepared_ids(&f, &run);
    std::fs::remove_dir_all(
        f.data
            .path()
            .join("artifacts")
            .join("isolated")
            .join(&isolated),
    )
    .unwrap();

    let reopened = Runtime::open(f.data.path(), true);
    assert!(
        reopened.is_ok(),
        "BLOCKER: committed op + broken projection wedges Runtime::open forever: {:?}",
        reopened.err().map(|e| e.to_string())
    );
    let rt2 = reopened.unwrap();
    assert!(rt2.store.pending_artifact_applies().unwrap().is_empty());
    let unavailable = rt2.snapshot(&run).unwrap().snapshot;
    assert_eq!(unavailable.review_state, ReviewState::Ready);
    assert!(!unavailable.capabilities.apply);
    let review = unavailable.review.unwrap();
    assert!(review.revision.ends_with(":unavailable"));
    rt2.discard(&run, &review.revision).unwrap();
    assert!(
        rt2.list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap()
            .can_start
    );
}

/// Same wedge through a different, non-adversarial trigger: the user deletes
/// the (to them broken) project folder while the process is down. The current
/// checkpoint inside `review_projection` fails, reconcile propagates, open
/// fails permanently - even for spaces/studios unrelated to that project.
#[tokio::test]
async fn blocker_committed_apply_with_deleted_project_makes_open_fail_forever() {
    let f = setup();
    let (run, revision) = completed_run(&f, false).await;
    inject_postcommit_failure(&f, &run, &revision);
    std::fs::remove_dir_all(f.project.path()).unwrap();

    let reopened = Runtime::open(f.data.path(), true);
    assert!(
        reopened.is_ok(),
        "BLOCKER: committed op + missing project root wedges Runtime::open forever: {:?}",
        reopened.err().map(|e| e.to_string())
    );
}

/// Crash window 1: intent + Undo persisted, then the process dies BEFORE the
/// first originals write (injected at the vault boundary). Restart must roll
/// back the prepared vault journal, abort the operation (metadata only), keep
/// the review ready, and allow a safe retry with the same revision.
#[tokio::test]
async fn crash_between_intent_and_first_write_aborts_and_allows_retry() {
    let f = setup();
    let (run, revision) = completed_run(&f, false).await;
    let (baseline, isolated) = prepared_ids(&f, &run);
    let review_revision = f.rt.store.get_run(&run).unwrap().review_revision;

    // Simulated crashed process: a second vault handle performs exactly the
    // runtime's apply steps and dies between intent persistence and op 0.
    let vault = cp::Vault::open(f.data.path().join("artifacts")).unwrap();
    let copy = vault.open_isolated(&isolated).unwrap();
    let review = vault.review_changes(&baseline, &copy).unwrap();
    let crashed = vault.explicit_apply_before_commit(
        &cp::ApplyRequest {
            expected_baseline: baseline,
            copy: &copy,
            review: &review,
            selection: cp::Selection::Paths(vec!["project/hello.txt".into()]),
            options: cp::ApplyOptions {
                inject: Some(cp::Inject::CrashBeforeOp(0)),
            },
        },
        |operation, preapply| {
            f.rt.store
                .begin_artifact_apply(
                    operation,
                    &run,
                    review_revision,
                    &format!("sha256:{}", preapply.to_hex()),
                )
                .map_err(|e| cp::Error::CorruptRecord(e.to_string()))
        },
    );
    assert!(matches!(crashed, Err(cp::Error::InjectedCrash)));
    assert_eq!(f.rt.store.pending_artifact_applies().unwrap().len(), 1);
    drop(vault);

    // Restart: journal rolled back, op aborted, originals untouched, no replay.
    let rt2 = Runtime::open(f.data.path(), true).unwrap();
    assert!(rt2.store.pending_artifact_applies().unwrap().is_empty());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert_eq!(
        rt2.store.get_run(&run).unwrap().review,
        db::ReviewState::Ready
    );

    // Retry with the same revision now succeeds.
    rt2.apply(&run, &revision, vec!["project/hello.txt".into()])
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "after"
    );
    assert_eq!(
        rt2.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied
    );
}

/// Crash window 2: process dies MID-PLAN (first file written, second not).
/// Recovery must roll the partial write back (never overwrite later user
/// state), abort the op, and allow a full retry.
#[tokio::test]
async fn crash_mid_plan_rolls_back_partial_original_writes() {
    let f = setup();
    let (run, revision) = completed_run(&f, true).await;
    let (baseline, isolated) = prepared_ids(&f, &run);
    let review_revision = f.rt.store.get_run(&run).unwrap().review_revision;

    let vault = cp::Vault::open(f.data.path().join("artifacts")).unwrap();
    let copy = vault.open_isolated(&isolated).unwrap();
    let review = vault.review_changes(&baseline, &copy).unwrap();
    let crashed = vault.explicit_apply_before_commit(
        &cp::ApplyRequest {
            expected_baseline: baseline,
            copy: &copy,
            review: &review,
            selection: cp::Selection::Paths(vec![
                "project/hello.txt".into(),
                "project/second.txt".into(),
            ]),
            options: cp::ApplyOptions {
                inject: Some(cp::Inject::CrashBeforeOp(1)),
            },
        },
        |operation, preapply| {
            f.rt.store
                .begin_artifact_apply(
                    operation,
                    &run,
                    review_revision,
                    &format!("sha256:{}", preapply.to_hex()),
                )
                .map_err(|e| cp::Error::CorruptRecord(e.to_string()))
        },
    );
    assert!(matches!(crashed, Err(cp::Error::InjectedCrash)));

    let rt2 = Runtime::open(f.data.path(), true).unwrap();
    assert!(rt2.store.pending_artifact_applies().unwrap().is_empty());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before",
        "partial original write must be rolled back"
    );
    assert!(!f.project.path().join("second.txt").exists());
    assert_eq!(
        rt2.store.get_run(&run).unwrap().review,
        db::ReviewState::Ready
    );

    rt2.apply(
        &run,
        &revision,
        vec!["project/hello.txt".into(), "project/second.txt".into()],
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("second.txt")).unwrap(),
        "after"
    );
    assert_eq!(
        rt2.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied
    );
}

/// Broken projection degrades to an explicitly unavailable review: apply
/// capability off, epoch-bound discard reachable with either the unavailable
/// revision or a same-epoch one, wrong epoch rejected.
#[tokio::test]
async fn broken_projection_exposes_unavailable_review_and_epoch_bound_discard() {
    let f = setup();
    let (run, _) = completed_run(&f, false).await;
    let (_, isolated) = prepared_ids(&f, &run);
    std::fs::remove_dir_all(
        f.data
            .path()
            .join("artifacts")
            .join("isolated")
            .join(&isolated),
    )
    .unwrap();

    let broken = f.rt.snapshot(&run).unwrap();
    let review = broken.snapshot.review.clone().unwrap();
    assert!(review.revision.ends_with(":unavailable"));
    assert!(review.files.is_empty());
    assert_eq!(
        broken.snapshot.failure.as_ref().unwrap().code,
        "artifact_review_failed"
    );
    assert!(!broken.snapshot.capabilities.apply);
    assert!(f
        .rt
        .apply(&run, &review.revision, vec!["project/hello.txt".into()])
        .is_err());
    assert!(f.rt.discard(&run, "999:wrong-epoch").is_err());
    f.rt.discard(&run, &review.revision).unwrap();
    assert_eq!(
        f.rt.store.get_run(&run).unwrap().review,
        db::ReviewState::Discarded
    );
}

/// Restore persists its own labeled Undo before writes and the restore
/// operation never touches the review axis.
#[tokio::test]
async fn restore_persists_labeled_undo_and_keeps_review_axis() {
    let f = setup();
    let (run, revision) = completed_run(&f, false).await;
    f.rt.apply(&run, &revision, vec!["project/hello.txt".into()])
        .unwrap();
    let undo =
        f.rt.snapshot(&run)
            .unwrap()
            .snapshot
            .checkpoints
            .into_iter()
            .find(|c| c.label == "Before Apply (Undo)")
            .unwrap();
    f.rt.restore(&run, &undo.checkpoint_id).unwrap();
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
    let checkpoints = f.rt.snapshot(&run).unwrap().snapshot.checkpoints;
    assert!(
        checkpoints
            .iter()
            .any(|c| c.label == "Before Restore (Undo)"),
        "restore must persist its own labeled Undo: {:?}",
        checkpoints
            .iter()
            .map(|c| c.label.clone())
            .collect::<Vec<_>>()
    );
    assert_eq!(
        f.rt.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied,
        "restore must not rewrite the review axis"
    );
    assert!(f.rt.store.pending_artifact_applies().unwrap().is_empty());
}

#[tokio::test]
async fn artifact_operation_kind_and_id_are_checked_before_persistence() {
    let f = setup();
    let (run, _) = completed_run(&f, false).await;
    let revision = f.rt.store.get_run(&run).unwrap().review_revision;
    let reference = format!("sha256:{}", "a".repeat(64));
    for id in [
        "restore-forged",
        "../apply-escape",
        "apply/bad",
        "arbitrary",
    ] {
        assert!(f
            .rt
            .store
            .begin_artifact_apply(id, &run, revision, &reference)
            .is_err());
    }
    assert!(f.rt.store.pending_artifact_operations().unwrap().is_empty());
    f.rt.store
        .begin_artifact_operation(
            "restore-native-test",
            &run,
            revision,
            &reference,
            db::ArtifactOperationKind::Restore,
        )
        .unwrap();
    assert_eq!(
        f.rt.store.pending_artifact_operations().unwrap()[0].2,
        db::ArtifactOperationKind::Restore
    );
    f.rt.store
        .finish_artifact_apply("restore-native-test", true, false)
        .unwrap();
    assert_eq!(
        f.rt.store.get_run(&run).unwrap().review,
        db::ReviewState::Ready
    );
    assert_eq!(f.rt.store.get_run(&run).unwrap().review_revision, revision);
}

/// Restore with a crash between the durable vault commit and the journal
/// finish must reconcile on reopen without touching the review axis: open
/// succeeds, the pending restore operation completes, the review state and
/// revision stay exactly as the completed apply left them.
#[tokio::test]
async fn crash_after_restore_commit_reconciles_without_review_axis_change() {
    let f = setup();
    let (run, _) = completed_run(&f, false).await;
    f.rt.apply(
        &run,
        &f.rt
            .snapshot(&run)
            .unwrap()
            .snapshot
            .review
            .unwrap()
            .revision,
        vec!["project/hello.txt".into()],
    )
    .unwrap();
    let undo =
        f.rt.snapshot(&run)
            .unwrap()
            .snapshot
            .checkpoints
            .into_iter()
            .find(|c| c.label == "Before Apply (Undo)")
            .unwrap();
    let revision_before = f.rt.store.get_run(&run).unwrap().review_revision;

    let conn = rusqlite::Connection::open(f.data.path().join("vibespace.sqlite")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_restore_finish BEFORE UPDATE ON artifact_operations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'injected postcommit DB failure'); END;").unwrap();
    assert!(f.rt.restore(&run, &undo.checkpoint_id).is_err());
    let pending = f.rt.store.pending_artifact_operations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].2, db::ArtifactOperationKind::Restore);
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before",
        "vault restore committed bytes before the injected journal failure"
    );
    conn.execute_batch("DROP TRIGGER fail_restore_finish")
        .unwrap();
    drop(conn);

    let reopened = Runtime::open(f.data.path(), true);
    assert!(
        reopened.is_ok(),
        "open must reconcile a committed restore: {:?}",
        reopened.err()
    );
    let rt2 = reopened.unwrap();
    assert!(rt2.store.pending_artifact_operations().unwrap().is_empty());
    let restored = rt2.store.get_run(&run).unwrap();
    assert_eq!(restored.review, db::ReviewState::Applied);
    assert_eq!(
        restored.review_revision, revision_before,
        "restore reconcile must not bump the review revision"
    );
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}
