//! Adversarial composed integration review of the native runtime.
//!
//! These tests compose the REAL runtime: `Runtime` + real `GooseBackend`
//! state machine + deterministic in-process `ModelTransport` + real SQLite
//! store + real checkpoint vault + real consent broker. No mocked loop.
//!
//! Tests named `blocker_*` are EXPECTED TO FAIL (red) against the reviewed
//! HEAD. Each one reproduces a concrete finding; the failure message carries
//! the diagnosis. They are normal assertions, not `#[ignore]` camouflage.
//! Everything else is an invariant the runtime must keep holding (green).
//!
//! Linux run evidence only; Windows is compile-only until native runtime
//! evidence exists (`enable_files` stays off there by design).

use async_trait::async_trait;
use somnia_vibespace_core::{runtime::Runtime, wire::*};
use somnia_vibespace_storage as db;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
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
    space: SpaceSummary,
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
                name: "review".into(),
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
        space,
        studio,
    }
}

/// Writes hello.txt = "after" in the isolated copy after consent, then finishes.
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
            usage: engine::Usage {
                input_tokens: 2,
                output_tokens: 3,
                ..Default::default()
            },
        })
    }
}

/// Edits hello.txt and creates second.txt (two sequential consents), then finishes.
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

/// Never answers; the run stays in inference until cancelled.
struct Waiting;
#[async_trait]
impl engine::ModelTransport for Waiting {
    async fn complete(&self, _: engine::ModelInput) -> Result<engine::ModelReply, engine::Failure> {
        std::future::pending().await
    }
}

/// Records every system prompt (recalled memory is embedded there), then behaves
/// like WriteThenDone.
struct RecordRecall {
    calls: AtomicUsize,
    systems: Arc<Mutex<Vec<String>>>,
}
#[async_trait]
impl engine::ModelTransport for RecordRecall {
    async fn complete(
        &self,
        input: engine::ModelInput,
    ) -> Result<engine::ModelReply, engine::Failure> {
        self.systems
            .lock()
            .unwrap()
            .push(input.messages[0].content.clone());
        let n = self.calls.fetch_add(1, Ordering::SeqCst);
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

/// Approves every pending consent until the run reaches a terminal state.
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

async fn wait_for(
    rt: &Arc<Runtime>,
    id: &str,
    pred: impl Fn(&SnapshotReply) -> bool,
    what: &str,
) -> SnapshotReply {
    for _ in 0..400 {
        let snapshot = rt.snapshot(id).unwrap();
        if pred(&snapshot) {
            return snapshot;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("run {id} never reached condition: {what}");
}

fn add_memory(rt: &Arc<Runtime>, space: &str, content: &str) -> db::MemoryItem {
    rt.store
        .add_memory(db::NewMemory {
            schema_version: 1,
            space_id: space.into(),
            kind: db::MemoryKind::Note,
            title: None,
            content: content.into(),
            source: db::MemorySource::User,
            source_ref: None,
            consent: db::MemoryConsent::UserExplicit,
        })
        .unwrap()
}

// ---------------------------------------------------------------- crash / restart

/// A process dying mid-run must not wedge the studio: restart recovery marks the
/// active run crashed, the studio can start again, and nothing was applied.
#[tokio::test]
async fn crash_restart_marks_active_run_crashed_and_unblocks_studio() {
    let data = tempfile::tempdir().unwrap();
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "ownership_crash_child", "--nocapture"])
        .env("SOMNIA_CRASH_TEST_DATA", data.path())
        .output()
        .unwrap();
    assert!(output.status.success());
    let (studio, id): (StudioSummary, String) =
        serde_json::from_slice(&std::fs::read(data.path().join("fixture.json")).unwrap()).unwrap();
    assert!(Runtime::open(data.path(), true).is_err());
    let rt2 = Runtime::open_owned(
        data.path(),
        true,
        somnia_vibespace_core::ownership::OwnerKind::Gui,
        true,
    )
    .unwrap();
    let crashed = rt2.snapshot(&id).unwrap();
    assert_eq!(crashed.snapshot.execution_state, ExecutionState::Crashed);
    assert_eq!(
        crashed.snapshot.failure.as_ref().unwrap().code,
        "interrupted_run"
    );
    assert!(!crashed.snapshot.capabilities.stop);
    assert!(!crashed.snapshot.capabilities.steer);
    assert!(!crashed.snapshot.capabilities.apply);
    assert!(crashed.snapshot.capabilities.restore);
    assert!(rt2.store.get_run(&id).unwrap().interrupted);
    let studio = rt2
        .list_studios()
        .unwrap()
        .into_iter()
        .find(|s| s.studio_id == studio.studio_id)
        .unwrap();
    assert!(studio.can_start, "crashed run must not block the studio");

    // A fresh run after the crash completes normally; the original stayed intact.
    let done = drive(
        &rt2,
        &rt2.start(
            start_request(&studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id
        .clone(),
    )
    .await;
    assert_eq!(done.snapshot.execution_state, ExecutionState::Done);
    assert_eq!(
        std::fs::read_to_string(
            data.path()
                .with_extension("project")
                .as_path()
                .join("hello.txt")
        )
        .unwrap(),
        "before"
    );
}

/// A crash while a consent is pending: the pending request belongs to the dead
/// process; after restart the run is crashed with no dangling consent and the
/// original is untouched.
#[tokio::test]
async fn crash_with_pending_consent_leaves_no_dangling_effect_path() {
    let data = tempfile::tempdir().unwrap();
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "ownership_crash_child", "--nocapture"])
        .env("SOMNIA_CRASH_TEST_DATA", data.path())
        .env("SOMNIA_CRASH_TEST_CONSENT", "1")
        .output()
        .unwrap();
    assert!(output.status.success());
    let (studio, id): (StudioSummary, String) =
        serde_json::from_slice(&std::fs::read(data.path().join("fixture.json")).unwrap()).unwrap();
    let rt2 = Runtime::open_owned(
        data.path(),
        true,
        somnia_vibespace_core::ownership::OwnerKind::Gui,
        true,
    )
    .unwrap();
    let crashed = rt2.snapshot(&id).unwrap();
    assert_eq!(crashed.snapshot.execution_state, ExecutionState::Crashed);
    assert!(
        crashed.snapshot.pending_consents.is_empty(),
        "a crashed run must not offer consent decisions"
    );
    assert!(
        rt2.list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == studio.studio_id)
            .unwrap()
            .can_start
    );
    assert_eq!(
        std::fs::read_to_string(
            data.path()
                .with_extension("project")
                .as_path()
                .join("hello.txt")
        )
        .unwrap(),
        "before"
    );
}

/// BLOCKER (coordinator edge a): a run persisted as `pending` but never claimed
/// (crash between `start_run` and `claim_run`, or a claim failure) is invisible
/// to `Recovery::AllActive`, which only covers claimed/running. It stays pending
/// forever, counts as "active" in `studio_summary`, and blocks `can_start`
/// permanently with no user-facing way to clear it.
#[tokio::test]
async fn blocker_pending_run_is_unrecoverable_and_wedges_studio() {
    let f = setup();
    // Simulate a crash between persist and claim: the store row exists, no claim.
    let orphan = f.rt.store.create_run(&f.studio.studio_id).unwrap();
    assert_eq!(orphan.execution, db::ExecutionState::Pending);

    // Restart: single-process recovery.
    drop(f.rt); // A restart cannot coexist with the previous runtime owner.
    let rt2 = Runtime::open(f.data.path(), true).unwrap();
    let run = rt2.store.get_run(&orphan.id).unwrap();
    let studio = rt2
        .list_studios()
        .unwrap()
        .into_iter()
        .find(|s| s.studio_id == f.studio.studio_id)
        .unwrap();
    let start_again = rt2
        .start(
            start_request(&studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await;
    assert!(
        run.execution.is_terminal() && studio.can_start && start_again.is_ok(),
        "BLOCKER(a): orphaned pending run survives Recovery::AllActive \
         (state={:?}), studio can_start={} forever, start()={:?}",
        run.execution,
        studio.can_start,
        start_again.as_ref().err().map(|e| e.to_string())
    );
}

// ---------------------------------------------------------------- stop / handles

/// After a stop fully settles, the run is inactive: no handle, no second stop,
/// no steering, and the project is byte-identical.
#[tokio::test]
async fn stopped_run_leaves_no_active_handle_or_effect_path() {
    let f = setup();
    let started =
        f.rt.start(start_request(&f.studio), Arc::new(Waiting), local_config())
            .await
            .unwrap();
    let id = started.snapshot.run_id;
    f.rt.stop(&id).await.unwrap();
    let stopped = wait_for(
        &f.rt,
        &id,
        |s| s.snapshot.execution_state == ExecutionState::Stopped && !s.snapshot.capabilities.stop,
        "stopped with handle released",
    )
    .await;
    assert!(!stopped.snapshot.capabilities.steer);
    assert!(
        f.rt.stop(&id).await.is_err(),
        "second stop must report inactive"
    );
    assert!(f.rt.steer(&id, "late".into()).await.is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}

// ------------------------------------------------------- events / projection

/// Terminal runs reject further persisted events; the broadcast stream is a
/// monotonic run-scoped sequence whose last event equals the full read; time
/// projection fields are populated after completion.
#[tokio::test]
async fn terminal_event_and_projection_consistency() {
    let f = setup();
    let mut rx = f.rt.subscribe();
    let started =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap();
    let id = started.snapshot.run_id;
    let done = drive(&f.rt, &id).await;
    assert_eq!(done.snapshot.execution_state, ExecutionState::Done);
    assert!(done.snapshot.started_at_utc.is_some());
    assert!(done.snapshot.finished_at_utc.is_some());

    // Late persisted events are rejected on a terminal run.
    assert!(f
        .rt
        .store
        .append_event(
            &id,
            "agent.message",
            &serde_json::json!({"text":"late"}),
            None
        )
        .is_err());

    // The stream carries only this run's snapshots in non-decreasing sequence,
    // ending exactly at the full-read sequence.
    let mut events = vec![];
    while let Ok(event) = rx.try_recv() {
        events.push(event);
    }
    assert!(!events.is_empty());
    assert!(events
        .iter()
        .all(|e| e.run_id == id && e.kind == "run_snapshot"));
    assert!(events.windows(2).all(|w| w[0].sequence <= w[1].sequence));
    assert_eq!(events.last().unwrap().sequence, done.sequence);
    assert_eq!(
        events.last().unwrap().payload["executionState"],
        serde_json::json!("done")
    );

    // Transcript and usage projections are derived from the persisted log.
    let log = f.rt.store.list_events(&id, 0, 500).unwrap();
    let messages = log.iter().filter(|e| e.kind == "agent.message").count();
    assert_eq!(done.snapshot.messages.len(), messages);
    assert_eq!(done.snapshot.usage.unwrap().input_tokens, 4);
}

// --------------------------------------------------------- scope containment

/// The project scope may never overlap the private vault directory (in either
/// direction); rejected selections persist nothing.
#[tokio::test]
async fn root_vault_overlap_is_rejected_in_both_directions() {
    let f = setup();
    let before = f.rt.list_spaces().unwrap().len();
    let vault = f.data.path().join("artifacts");
    for folder in [
        f.data.path().to_path_buf(),            // vault inside selection
        f.data.path().parent().unwrap().into(), // selection inside parent of vault
        vault.clone(),                          // selection IS the vault
    ] {
        let grant = f.rt.grant_native_folder("main", &folder).unwrap();
        assert!(
            f.rt.create_space(
                "main",
                CreateSpace {
                    name: "evil".into(),
                    folder_grant_id: grant
                }
            )
            .is_err(),
            "scope {} must be rejected",
            folder.display()
        );
    }
    assert_eq!(f.rt.list_spaces().unwrap().len(), before);
}

/// Memory, runs and checkpoints are scoped: nothing from space A is readable,
/// searchable, deletable or restorable through space B; a consent request of one
/// run cannot be decided under another run's id.
#[tokio::test]
async fn cross_space_and_cross_run_access_is_denied() {
    let f = setup();
    // Second space with its own project.
    let project_b = tempfile::tempdir().unwrap();
    std::fs::write(project_b.path().join("hello.txt"), "B-before").unwrap();
    let grant_b = f.rt.grant_native_folder("main", project_b.path()).unwrap();
    let space_b =
        f.rt.create_space(
            "main",
            CreateSpace {
                name: "b".into(),
                folder_grant_id: grant_b,
            },
        )
        .unwrap();
    let studio_b =
        f.rt.create_studio(CreateStudio {
            space_id: space_b.space_id.clone(),
            goal: "edit b".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: MODEL.into(),
                locality: ModelLocality::Local,
            },
        })
        .unwrap();

    // Run A waits at its consent prompt while we probe cross-run decisions.
    let started_a =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap();
    let run_a = started_a.snapshot.run_id.clone();
    let pending_a = wait_for(
        &f.rt,
        &run_a,
        |s| !s.snapshot.pending_consents.is_empty(),
        "pending consent A",
    )
    .await;
    let request_a = pending_a.snapshot.pending_consents[0].request_id.clone();

    // Run B completes.
    let done_b = drive(
        &f.rt,
        &f.rt
            .start(
                start_request(&studio_b),
                Arc::new(WriteThenDone(AtomicUsize::new(0))),
                local_config(),
            )
            .await
            .unwrap()
            .snapshot
            .run_id
            .clone(),
    )
    .await;
    let run_b = done_b.snapshot.run_id.clone();

    // Consent of A under run B's identity.
    assert!(f
        .rt
        .decide(ConsentDecision {
            run_id: run_b.clone(),
            request_id: request_a.clone(),
            choice: ConsentChoice::AllowOnce,
        })
        .is_err());

    // Memory isolation.
    let item = add_memory(&f.rt, &f.space.space_id, "alpha-only-marker");
    assert!(f
        .rt
        .store
        .get_memory(&space_b.space_id, &item.id)
        .unwrap()
        .is_none());
    assert!(f
        .rt
        .store
        .search_memory(
            &space_b.space_id,
            "alpha-only-marker",
            &db::SearchOptions::default()
        )
        .unwrap()
        .hits
        .is_empty());
    assert!(!f
        .rt
        .store
        .delete_memory(&space_b.space_id, &item.id)
        .unwrap());
    assert!(f
        .rt
        .store
        .get_memory(&f.space.space_id, &item.id)
        .unwrap()
        .is_some());

    // Run listing isolation.
    assert!(f
        .rt
        .store
        .list_runs(&space_b.space_id, None, 500)
        .unwrap()
        .iter()
        .all(|r| r.id != run_a));

    // Checkpoint of run A is not restorable through run B.
    let checkpoint_a = f.rt.snapshot(&run_a).unwrap().snapshot.checkpoints[0]
        .checkpoint_id
        .clone();
    assert!(f.rt.restore(&run_b, &checkpoint_a).is_err());
    assert_eq!(
        std::fs::read_to_string(project_b.path().join("hello.txt")).unwrap(),
        "B-before"
    );

    // Finishing A under its own identity still works.
    f.rt.decide(ConsentDecision {
        run_id: run_a.clone(),
        request_id: request_a,
        choice: ConsentChoice::AllowOnce,
    })
    .unwrap();
    let done_a = drive(&f.rt, &run_a).await;
    assert_eq!(done_a.snapshot.execution_state, ExecutionState::Done);
}

// -------------------------------------------------------------- memory recall

/// Recall into the model is bounded (32 items / 16 KiB at the runtime boundary),
/// pending-review items are never recalled, and deletion takes effect on the
/// next run.
#[tokio::test]
async fn memory_recall_is_bounded_and_deletion_effective() {
    let f = setup();
    for i in 0..40 {
        add_memory(
            &f.rt,
            &f.space.space_id,
            &format!("ITEM-{i:02}-{}", "x".repeat(1000)),
        );
    }
    let doomed = add_memory(&f.rt, &f.space.space_id, "delete-me-marker");
    rt_pending_memory(&f);

    let systems = Arc::new(Mutex::new(vec![]));
    let run1 =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(RecordRecall {
                calls: AtomicUsize::new(0),
                systems: systems.clone(),
            }),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    drive(&f.rt, &run1).await;
    let system1 = systems.lock().unwrap()[0].clone();
    let recalled: Vec<&str> = system1.lines().filter(|l| l.starts_with("ITEM-")).collect();
    assert!(recalled.len() <= 32, "recall item bound");
    assert!(
        recalled.iter().map(|l| l.len()).sum::<usize>() <= 16384,
        "recall byte bound"
    );
    assert!(system1.contains("delete-me-marker"));
    assert!(
        !system1.contains("pending-review-marker"),
        "pending-review memory must never reach the model"
    );

    // Deletion is effective for the next run in a fresh studio.
    assert!(f
        .rt
        .store
        .delete_memory(&f.space.space_id, &doomed.id)
        .unwrap());
    let studio2 =
        f.rt.create_studio(CreateStudio {
            space_id: f.space.space_id.clone(),
            goal: "again".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: MODEL.into(),
                locality: ModelLocality::Local,
            },
        })
        .unwrap();
    let systems2 = Arc::new(Mutex::new(vec![]));
    let run2 =
        f.rt.start(
            start_request(&studio2),
            Arc::new(RecordRecall {
                calls: AtomicUsize::new(0),
                systems: systems2.clone(),
            }),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    drive(&f.rt, &run2).await;
    assert!(!systems2.lock().unwrap()[0].contains("delete-me-marker"));
}

fn rt_pending_memory(f: &Fixture) {
    f.rt.store
        .add_memory(db::NewMemory {
            schema_version: 1,
            space_id: f.space.space_id.clone(),
            kind: db::MemoryKind::Note,
            title: None,
            content: "pending-review-marker".into(),
            source: db::MemorySource::Agent,
            source_ref: None,
            consent: db::MemoryConsent::PendingReview,
        })
        .unwrap();
}

// ------------------------------------------------- review / apply interleaving

/// Partial apply, then a concurrent user edit to the REMAINING file: the
/// revision must move, the old revision must be rejected, the conflicted apply
/// must not clobber the user edit, and after the user reverts, the remainder
/// applies cleanly.
#[tokio::test]
async fn partial_apply_with_concurrent_edit_binds_current_project_state() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(TwoEdits(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let review = done.snapshot.review.clone().unwrap();
    assert_eq!(review.files.len(), 2);

    f.rt.apply(&run, &review.revision, vec!["project/hello.txt".into()])
        .unwrap();
    let partial = f.rt.snapshot(&run).unwrap();
    let remaining = partial.snapshot.review.clone().unwrap();
    assert_eq!(remaining.files.len(), 1);

    // User creates a diverging second.txt in the original project.
    std::fs::write(f.project.path().join("second.txt"), "user version").unwrap();
    let conflicted = f.rt.snapshot(&run).unwrap();
    let creview = conflicted.snapshot.review.clone().unwrap();
    assert_eq!(creview.conflicts, vec!["project/second.txt"]);
    assert_ne!(creview.revision, remaining.revision);
    assert!(f
        .rt
        .apply(&run, &remaining.revision, vec!["project/second.txt".into()])
        .is_err());
    assert!(f
        .rt
        .apply(&run, &creview.revision, vec!["project/second.txt".into()])
        .is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("second.txt")).unwrap(),
        "user version"
    );

    // User reverts; the remainder applies with the then-current revision.
    std::fs::remove_file(f.project.path().join("second.txt")).unwrap();
    let clean = f.rt.snapshot(&run).unwrap();
    let creview = clean.snapshot.review.clone().unwrap();
    assert!(creview.conflicts.is_empty());
    f.rt.apply(&run, &creview.revision, vec!["project/second.txt".into()])
        .unwrap();
    let applied = f.rt.snapshot(&run).unwrap();
    assert_eq!(applied.snapshot.review_state, ReviewState::Applied);
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("second.txt")).unwrap(),
        "after"
    );
}

/// Discard removes the isolated copy from disk, is revision-checked, and ends
/// the review for good; the studio frees up.
#[tokio::test]
async fn discard_is_revision_checked_and_removes_isolated_copy() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    let isolated = isolated_dir(&f, &run);

    assert!(f.rt.discard(&run, "0:stale").is_err());
    f.rt.discard(&run, &revision).unwrap();
    assert!(!isolated.exists(), "discard must remove the isolated copy");
    let discarded = f.rt.snapshot(&run).unwrap();
    assert_eq!(discarded.snapshot.review_state, ReviewState::Discarded);
    assert!(f
        .rt
        .apply(&run, &revision, vec!["project/hello.txt".into()])
        .is_err());
    assert!(
        f.rt.list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap()
            .can_start
    );
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}

fn isolated_dir(f: &Fixture, run: &str) -> std::path::PathBuf {
    let events = f.rt.store.list_events(run, 0, 500).unwrap();
    let prepared = events.iter().find(|e| e.kind == "core.prepared").unwrap();
    let isolated_id = prepared.payload["isolatedId"].as_str().unwrap();
    f.data
        .path()
        .join("artifacts")
        .join("isolated")
        .join(isolated_id)
}

/// The review binds the LIVE isolated bytes: when the copy content changes
/// after the user loaded a revision, the old revision is rejected and the
/// fresh projection honestly shows the new bytes. Nothing reaches the original.
#[tokio::test]
async fn stale_revision_after_copy_content_change_is_rejected() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    std::fs::write(
        isolated_dir(&f, &run).join("project").join("hello.txt"),
        "forged",
    )
    .unwrap();

    let changed = f.rt.snapshot(&run).unwrap();
    let review = changed.snapshot.review.clone().unwrap();
    assert_ne!(review.revision, revision);
    assert_eq!(review.files[0].after_text.as_deref(), Some("forged"));
    assert!(f
        .rt
        .apply(&run, &revision, vec!["project/hello.txt".into()])
        .is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}

/// When the isolated copy becomes unreadable (here: deleted), the projection
/// degrades to artifact_review_failed and apply is blocked; the original is
/// preserved.
#[tokio::test]
async fn deleted_isolated_copy_blocks_apply_and_preserves_original() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    std::fs::remove_dir_all(isolated_dir(&f, &run)).unwrap();

    let broken = f.rt.snapshot(&run).unwrap();
    assert!(broken.snapshot.review.as_ref().unwrap().files.is_empty());
    assert_eq!(
        broken.snapshot.failure.as_ref().unwrap().code,
        "artifact_review_failed"
    );
    assert!(!broken.snapshot.capabilities.apply);
    assert!(f
        .rt
        .apply(&run, &revision, vec!["project/hello.txt".into()])
        .is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}

/// BLOCKER (new): once `review_projection` errors (isolated copy lost or
/// unreadable), the run is wedged. BOTH apply and discard route through
/// `review_projection`, so there is no path to clear `review=ready` - even
/// though discarding needs no review at all (it only deletes the copy, which
/// is already gone here). The studio never frees up (`can_start=false`
/// forever) and the runtime exposes no delete/abort for the run.
#[tokio::test]
async fn blocker_broken_review_projection_cannot_be_discarded_wedges_studio() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    std::fs::remove_dir_all(isolated_dir(&f, &run)).unwrap();

    let discard = f.rt.discard(&run, &revision);
    let can_start =
        f.rt.list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap()
            .can_start;
    assert!(
        discard.is_ok() && can_start,
        "BLOCKER: broken review projection wedges run in review=ready with no          discard/abort path: discard={:?}, can_start={can_start}",
        discard.as_ref().err().map(|e| e.to_string())
    );
}

// ------------------------------------------- apply / DB failure interleaving

/// BLOCKER (coordinator edge b): when the DB write AFTER `explicit_apply`
/// fails, the originals are already committed but the run keeps `review=ready`
/// with no PreApply checkpoint recorded and no reconcile path. Retrying apply
/// fails again (the same reserve event budget is exhausted), and the studio is
/// wedged: `can_start=false` forever while the original file already contains
/// the agent's edit. The runtime needs a reconcile/operation journal; a blind
/// retry must never be the answer.
#[tokio::test]
async fn blocker_apply_db_failure_after_commit_leaves_no_reconcile_path() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    assert_eq!(done.snapshot.review_state, ReviewState::Ready);

    // Exhaust the persisted event budget (cap + reserve) so the very next
    // reserve event - the one inside apply's post-commit checkpoint write -
    // fails. This is the reachable deterministic DB failure for this interleave.
    let mut padded = 0u64;
    loop {
        let pad = f.rt.store.add_checkpoint(db::NewCheckpoint {
            schema_version: 1,
            space_id: f.space.space_id.clone(),
            run_id: run.clone(),
            kind: db::CheckpointKind::Manual,
            label: format!("pad-{padded}"),
            content_ref: format!("sha256:{padded:064x}"),
        });
        if pad.is_err() {
            break;
        }
        padded += 1;
        assert!(padded < 20000, "event cap never reached");
    }

    let before_apply = f.rt.snapshot(&run).unwrap();
    let revision = before_apply.snapshot.review.clone().unwrap().revision;
    let first =
        f.rt.apply(&run, &revision, vec!["project/hello.txt".into()]);
    // Manual checkpoints cannot consume lifecycle/commit reserve. Apply must
    // remain able to persist intent, Undo and completion BEFORE touching originals.
    assert!(
        first.is_ok(),
        "manual history exhausted lifecycle reserve: {:?}",
        first.err()
    );
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "after"
    );
    assert_eq!(
        f.rt.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied
    );
    assert!(f
        .rt
        .snapshot(&run)
        .unwrap()
        .snapshot
        .checkpoints
        .iter()
        .any(|c| c.label == "Before Apply (Undo)"));
    assert!(
        f.rt.list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap()
            .can_start
    );
}

// ------------------------------------------------- preparation failure paths

/// A project root that becomes unusable between scope binding and start fails
/// the run cleanly (persisted Failed + preparation_failed), leaves no broker
/// registration, no handle, and the studio immediately startable again.
#[tokio::test]
async fn preparation_failure_persists_failed_run_without_leaks() {
    let f = setup();
    std::fs::remove_dir_all(f.project.path()).unwrap();
    std::fs::write(f.project.path(), "not a directory anymore").unwrap();

    let err =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap_err();
    let _ = err;
    let runs = f.rt.store.list_runs(&f.space.space_id, None, 500).unwrap();
    assert_eq!(runs.len(), 1);
    let failed = f.rt.snapshot(&runs[0].id).unwrap();
    assert_eq!(failed.snapshot.execution_state, ExecutionState::Failed);
    assert_eq!(
        failed.snapshot.failure.as_ref().unwrap().code,
        "preparation_failed"
    );
    assert!(failed.snapshot.pending_consents.is_empty());
    assert!(!failed.snapshot.capabilities.stop);
    assert!(!failed.snapshot.capabilities.steer);
    let studio =
        f.rt.list_studios()
            .unwrap()
            .into_iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap();
    assert!(studio.can_start, "failed preparation must free the studio");

    // Repair the folder: a fresh run succeeds.
    std::fs::remove_file(f.project.path()).unwrap();
    std::fs::create_dir(f.project.path()).unwrap();
    std::fs::write(f.project.path().join("hello.txt"), "before").unwrap();
    let done = drive(
        &f.rt,
        &f.rt
            .start(
                start_request(&studio),
                Arc::new(WriteThenDone(AtomicUsize::new(0))),
                local_config(),
            )
            .await
            .unwrap()
            .snapshot
            .run_id
            .clone(),
    )
    .await;
    assert_eq!(done.snapshot.execution_state, ExecutionState::Done);
}

/// A consent decision is one-shot and run-bound: replaying the same request id
/// or deciding an unknown request fails, and only the audited decision unblocks
/// the effect.
#[tokio::test]
async fn consent_decision_is_one_shot_and_replay_safe() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let pending = wait_for(
        &f.rt,
        &run,
        |s| !s.snapshot.pending_consents.is_empty(),
        "pending consent",
    )
    .await;
    let request_id = pending.snapshot.pending_consents[0].request_id.clone();

    assert!(f
        .rt
        .decide(ConsentDecision {
            run_id: run.clone(),
            request_id: "00000000-0000-0000-0000-000000000000".into(),
            choice: ConsentChoice::AllowOnce,
        })
        .is_err());
    f.rt.decide(ConsentDecision {
        run_id: run.clone(),
        request_id: request_id.clone(),
        choice: ConsentChoice::AllowOnce,
    })
    .unwrap();
    assert!(
        f.rt.decide(ConsentDecision {
            run_id: run.clone(),
            request_id,
            choice: ConsentChoice::AllowOnce,
        })
        .is_err(),
        "replaying a consumed consent request must fail"
    );
    let done = drive(&f.rt, &run).await;
    assert_eq!(done.snapshot.execution_state, ExecutionState::Done);
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before",
        "edits stay isolated until apply"
    );
}

/// Real SQLite write failure after originals commit leaves a pending durable
/// intent AND Undo, then startup completes only metadata, never replays effects.
#[tokio::test]
async fn apply_postcommit_db_failure_reconciles_on_restart_without_replay() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    let conn = rusqlite::Connection::open(f.data.path().join("vibespace.sqlite")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_apply_finish BEFORE UPDATE ON artifact_operations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'injected postcommit DB failure'); END;").unwrap();
    assert!(f
        .rt
        .apply(&run, &revision, vec!["project/hello.txt".into()])
        .is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "after"
    );
    assert_eq!(f.rt.store.pending_artifact_applies().unwrap().len(), 1);
    let undo =
        f.rt.snapshot(&run)
            .unwrap()
            .snapshot
            .checkpoints
            .into_iter()
            .find(|c| c.label == "Before Apply (Undo)")
            .unwrap();
    // A later user edit is not overwritten by startup reconciliation.
    std::fs::write(f.project.path().join("user-file.txt"), "user remains").unwrap();
    conn.execute_batch("DROP TRIGGER fail_apply_finish")
        .unwrap();
    drop(conn);
    drop(f.rt); // Release the previous owner before recovery.
    let reopened = Runtime::open(f.data.path(), true).unwrap();
    assert!(reopened
        .store
        .pending_artifact_applies()
        .unwrap()
        .is_empty());
    assert_eq!(
        reopened.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied
    );
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("user-file.txt")).unwrap(),
        "user remains"
    );
    assert!(
        reopened
            .list_studios()
            .unwrap()
            .iter()
            .find(|s| s.studio_id == f.studio.studio_id)
            .unwrap()
            .can_start
    );
    reopened.restore(&run, &undo.checkpoint_id).unwrap();
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
}

/// Failure to persist intent is before first original write, not a misleading
/// postcommit error; a retry after storage repair uses a fresh review.
#[tokio::test]
async fn apply_precommit_db_failure_preserves_originals_and_allows_safe_retry() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    let revision = done.snapshot.review.unwrap().revision;
    let conn = rusqlite::Connection::open(f.data.path().join("vibespace.sqlite")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_apply_begin BEFORE INSERT ON artifact_operations BEGIN SELECT RAISE(ABORT,'injected precommit DB failure'); END;").unwrap();
    assert!(f
        .rt
        .apply(&run, &revision, vec!["project/hello.txt".into()])
        .is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert!(f.rt.store.pending_artifact_applies().unwrap().is_empty());
    assert!(!f
        .rt
        .snapshot(&run)
        .unwrap()
        .snapshot
        .checkpoints
        .iter()
        .any(|c| c.label == "Before Apply (Undo)"));
    conn.execute_batch("DROP TRIGGER fail_apply_begin").unwrap();
    drop(conn);
    f.rt.apply(&run, &revision, vec!["project/hello.txt".into()])
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "after"
    );
}

#[tokio::test]
async fn restore_postcommit_db_failure_keeps_undo_and_reconciles_without_replay() {
    let f = setup();
    let run =
        f.rt.start(
            start_request(&f.studio),
            Arc::new(WriteThenDone(AtomicUsize::new(0))),
            local_config(),
        )
        .await
        .unwrap()
        .snapshot
        .run_id;
    let done = drive(&f.rt, &run).await;
    f.rt.apply(
        &run,
        &done.snapshot.review.unwrap().revision,
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
    let conn = rusqlite::Connection::open(f.data.path().join("vibespace.sqlite")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_restore_finish BEFORE UPDATE ON artifact_operations WHEN NEW.id LIKE 'restore-%' AND NEW.state='committed' BEGIN SELECT RAISE(ABORT,'injected restore DB failure'); END;").unwrap();
    assert!(f.rt.restore(&run, &undo.checkpoint_id).is_err());
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert_eq!(f.rt.store.pending_artifact_applies().unwrap().len(), 1);
    conn.execute_batch("DROP TRIGGER fail_restore_finish")
        .unwrap();
    drop(conn);
    std::fs::write(f.project.path().join("hello.txt"), "later user edit").unwrap();
    drop(f.rt); // Release the previous owner before recovery.
    let reopened = Runtime::open(f.data.path(), true).unwrap();
    assert!(reopened
        .store
        .pending_artifact_applies()
        .unwrap()
        .is_empty());
    assert_eq!(
        reopened.store.get_run(&run).unwrap().review,
        db::ReviewState::Applied
    );
    assert_eq!(
        std::fs::read_to_string(f.project.path().join("hello.txt")).unwrap(),
        "later user edit"
    );
}

/// Collection history is bounded per space, but each listed Studio's latest
/// must be included even when another Studio fills the entire recent page.
#[tokio::test]
async fn collection_includes_studio_latest_outside_recent_space_history() {
    let f = setup();
    let old = f.rt.store.create_run(&f.studio.studio_id).unwrap();
    f.rt.store
        .transition_run(
            &old.id,
            db::TransitionRequest::execution(db::ExecutionState::Stopped),
        )
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(3)).await;
    let newer =
        f.rt.create_studio(CreateStudio {
            space_id: f.space.space_id.clone(),
            goal: "many newer runs".into(),
            model: f.studio.model.clone(),
        })
        .unwrap();
    for _ in 0..501 {
        let run = f.rt.store.create_run(&newer.studio_id).unwrap();
        f.rt.store
            .transition_run(
                &run.id,
                db::TransitionRequest::execution(db::ExecutionState::Stopped),
            )
            .unwrap();
    }
    assert!(!f
        .rt
        .store
        .list_runs(&f.space.space_id, None, 500)
        .unwrap()
        .iter()
        .any(|r| r.id == old.id));
    let collection = f.rt.list_snapshots().unwrap();
    for studio in f.rt.list_studios().unwrap() {
        if let Some(latest) = studio.latest_run_id {
            assert!(collection
                .iter()
                .any(|r| r.snapshot.run_id == latest && r.snapshot.studio_id == studio.studio_id));
        }
    }
}

#[tokio::test]
async fn ownership_crash_child() {
    let Some(data) = std::env::var_os("SOMNIA_CRASH_TEST_DATA") else {
        return;
    };
    let data = std::path::PathBuf::from(data);
    // Parent opens this same directory after our abrupt process exit.
    let rt = Runtime::open(&data, true).unwrap();
    // Project must not overlap private runtime data; bind an adjacent persistent scope.
    let project = data.with_extension("project");
    std::fs::create_dir(&project).unwrap();
    std::fs::write(project.join("hello.txt"), "before").unwrap();
    let grant = rt.grant_native_folder("main", &project).unwrap();
    let space = rt
        .create_space(
            "main",
            CreateSpace {
                name: "crash".into(),
                folder_grant_id: grant,
            },
        )
        .unwrap();
    let studio = rt
        .create_studio(CreateStudio {
            space_id: space.space_id,
            goal: "wait".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: MODEL.into(),
                locality: ModelLocality::Local,
            },
        })
        .unwrap();
    let pending = std::env::var_os("SOMNIA_CRASH_TEST_CONSENT").is_some();
    let transport: Arc<dyn engine::ModelTransport> = if pending {
        Arc::new(WriteThenDone(AtomicUsize::new(0)))
    } else {
        Arc::new(Waiting)
    };
    let run = rt
        .start(start_request(&studio), transport, local_config())
        .await
        .unwrap();
    if pending {
        wait_for(
            &rt,
            &run.snapshot.run_id,
            |s| !s.snapshot.pending_consents.is_empty(),
            "pending consent before crash",
        )
        .await;
    }

    std::fs::write(
        data.join("fixture.json"),
        serde_json::to_vec(&(studio, run.snapshot.run_id)).unwrap(),
    )
    .unwrap();
    std::process::exit(0); // No destructors: stale metadata and an actual released OS lock.
}
