mod common;
use common::*;
use serde_json::json;
use somnia_vibespace_storage::*;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

#[test]
fn restart_marks_interrupted_runs_visibly_and_never_resumes_them() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("r.db");
    let (space_id, running_id, claimed_id, pending_id, done_id);
    {
        let store = Store::open(&path, opts_none()).unwrap();
        let (space, studio, r1) = setup(&store);
        space_id = space.id.clone();
        running_id = claim_and_run(&store, &r1.id).id;
        store.append_event(&running_id, "tool.call", &json!({"name": "write_file"}), None).unwrap();
        let r2 = store.create_run(&studio.id).unwrap();
        claimed_id = store.claim_run(&r2.id, "i", 60_000).unwrap().run.id;
        pending_id = store.create_run(&studio.id).unwrap().id;
        let r4 = store.create_run(&studio.id).unwrap();
        claim_and_run(&store, &r4.id);
        store.transition_run(&r4.id, TransitionRequest::execution(ExecutionState::Done)).unwrap();
        done_id = r4.id;
        // simulated crash: handle dropped with runs still claimed/running
    }
    let store = Store::open(&path, StoreOptions::default()).unwrap(); // default = AllActive recovery
    let report = store.startup_recovery();
    assert_eq!(report.recovered.len(), 2);
    for id in [&running_id, &claimed_id] {
        let run = store.get_run(id).unwrap();
        assert_eq!(run.execution, ExecutionState::Crashed);
        assert!(run.interrupted);
        assert_eq!(run.interrupted_reason.as_deref(), Some("process_restart"));
        assert!(run.finished_at.is_some());
        let last = store.list_events(id, 0, 100).unwrap().pop().unwrap();
        assert_eq!(last.kind, "run.interrupted");
        assert_eq!(last.payload["effectsReplayed"], false);
        assert_eq!(last.sequence, run.last_sequence);
    }
    assert_eq!(store.get_run(&pending_id).unwrap().execution, ExecutionState::Pending);
    assert_eq!(store.get_run(&done_id).unwrap().execution, ExecutionState::Done);
    assert!(!store.get_run(&done_id).unwrap().interrupted);

    // visible in the attention list
    let attention = store.list_attention_runs(&space_id, 10).unwrap();
    let ids: Vec<_> = attention.iter().map(|r| r.id.clone()).collect();
    assert!(ids.contains(&running_id) && ids.contains(&claimed_id) && !ids.contains(&done_id));

    // a crashed run cannot be resumed or re-claimed
    assert!(store.transition_run(&running_id, TransitionRequest::execution(ExecutionState::Running)).is_err());
    assert!(store.transition_run(&running_id, TransitionRequest::execution(ExecutionState::Pending)).is_err());
    assert!(store.claim_run(&running_id, "again", 1000).is_err());
    assert!(store.append_event(&running_id, "tool.call", &json!({}), Some(1)).is_err());

    // a second restart finds nothing new and writes no extra events
    let seq = store.get_run(&running_id).unwrap().last_sequence;
    drop(store);
    let store2 = Store::open(&path, StoreOptions::default()).unwrap();
    assert!(store2.startup_recovery().recovered.is_empty());
    assert_eq!(store2.get_run(&running_id).unwrap().last_sequence, seq);
    assert!(store2.get_run(&running_id).unwrap().interrupted, "interrupted flag is durable");
}

#[test]
fn expired_lease_recovery_only_touches_expired_runs() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("l.db");
    let now = Arc::new(AtomicI64::new(1_800_000_000_000));
    let clock_now = now.clone();
    let opts = StoreOptions {
        recovery: Recovery::None,
        clock: Some(Arc::new(move || clock_now.load(Ordering::SeqCst))),
        ..StoreOptions::default()
    };
    let store = Store::open(&path, opts).unwrap();
    let (_s, studio, short) = setup(&store);
    let long = store.create_run(&studio.id).unwrap();
    store.claim_run(&short.id, "a", 1_000).unwrap();
    store.claim_run(&long.id, "b", 600_000).unwrap();
    now.store(1_800_000_010_000, Ordering::SeqCst); // +10s
    let report = store.recover_interrupted(RecoveryMode::ExpiredLeases).unwrap();
    assert_eq!(report.recovered.len(), 1);
    assert_eq!(report.recovered[0].run_id, short.id);
    assert_eq!(report.recovered[0].reason, "lease_expired");
    assert_eq!(store.get_run(&short.id).unwrap().execution, ExecutionState::Crashed);
    assert_eq!(store.get_run(&long.id).unwrap().execution, ExecutionState::Claimed);
    // heartbeat extends a lease
    store.heartbeat(&long.id, 1, 600_000).unwrap();
    now.store(1_800_000_000_000 + 500_000, Ordering::SeqCst);
    assert!(store.recover_interrupted(RecoveryMode::ExpiredLeases).unwrap().recovered.is_empty());
    now.store(1_800_000_000_000 + 10_000 + 600_001, Ordering::SeqCst);
    assert_eq!(store.recover_interrupted(RecoveryMode::ExpiredLeases).unwrap().recovered.len(), 1);
    // timestamps come from the injected clock
    assert!(store.get_run(&short.id).unwrap().finished_at.unwrap().starts_with("2027-"));
}
