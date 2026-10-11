mod common;
use common::*;
use serde_json::json;
use somnia_vibespace_storage::*;
use std::sync::Arc;

#[test]
fn sequences_are_monotonic_and_paged() {
    let store = mem_store();
    let (_s, _st, run) = setup(&store);
    for i in 0..20 {
        let e = store.append_event(&run.id, "message", &json!({"i": i}), None).unwrap();
        assert_eq!(e.sequence, i + 2); // #1 is run.created
    }
    let all = store.list_events(&run.id, 0, 500).unwrap();
    assert_eq!(all.len(), 21);
    assert!(all.windows(2).all(|w| w[1].sequence == w[0].sequence + 1));
    let page = store.list_events(&run.id, 10, 5).unwrap();
    assert_eq!(page.iter().map(|e| e.sequence).collect::<Vec<_>>(), vec![11, 12, 13, 14, 15]);
    assert_eq!(store.get_run(&run.id).unwrap().last_sequence, 21);
    // sequences are per run
    let (_s2, _st2, run2) = setup(&store);
    assert_eq!(store.append_event(&run2.id, "message", &json!({}), None).unwrap().sequence, 2);
}

#[test]
fn payloads_are_redacted_bounded_and_kinds_validated() {
    let store = mem_store();
    let (_s, _st, run) = setup(&store);
    let e = store
        .append_event(
            &run.id,
            "tool.call",
            &json!({"apiKey": "k-123", "headers": {"Authorization": "Bearer abcdefghijklmnop"}, "note": "ok", "inputTokens": 12}),
            None,
        )
        .unwrap();
    assert_eq!(e.payload["apiKey"], "[redacted]");
    assert_eq!(e.payload["headers"]["Authorization"], "[redacted]");
    assert_eq!(e.payload["note"], "ok");
    assert_eq!(e.payload["inputTokens"], 12);
    assert!(!e.truncated);
    let stored = store.list_events(&run.id, 1, 10).unwrap();
    assert_eq!(stored[0].payload["apiKey"], "[redacted]");

    let big = store.append_event(&run.id, "output", &json!({"text": "z".repeat(100_000)}), None).unwrap();
    assert!(big.truncated);
    assert_eq!(big.payload["truncated"], true);
    assert!(big.payload.to_string().len() < 2_000);

    assert!(store.append_event(&run.id, "Bad Kind", &json!({}), None).is_err());
    assert!(store.append_event(&run.id, "", &json!({}), None).is_err());
    assert!(store.append_event(&run.id, "run.state_changed", &json!({}), None).is_err(), "reserved prefix");
    // wire envelope has exactly the contract fields
    let w = serde_json::to_value(e.wire()).unwrap();
    let mut keys: Vec<_> = w.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, vec!["kind", "payload", "protocolVersion", "runId", "sequence", "timestampUtc"]);
    assert_eq!(w["protocolVersion"], 1);
}

#[test]
fn failed_transition_changes_nothing_and_writes_no_event() {
    let store = mem_store();
    let (_s, _st, run) = setup(&store);
    let before = store.list_events(&run.id, 0, 100).unwrap().len();
    // invalid: pending -> done
    assert!(store.transition_run(&run.id, TransitionRequest::execution(ExecutionState::Done)).is_err());
    // invalid review on non-terminal run
    assert!(store.transition_run(&run.id, TransitionRequest::review(ReviewState::Ready)).is_err());
    // combined request where the review half is invalid must roll back the execution half too
    let mut both = TransitionRequest::execution(ExecutionState::Stopped);
    both.review = Some(ReviewState::Applied);
    assert!(store.transition_run(&run.id, both).is_err());
    // stale expected state
    let mut stale = TransitionRequest::execution(ExecutionState::Stopped);
    stale.expected_execution = Some(ExecutionState::Running);
    assert!(matches!(store.transition_run(&run.id, stale), Err(Error::Conflict(_))));
    let after = store.get_run(&run.id).unwrap();
    assert_eq!(after.execution, ExecutionState::Pending);
    assert_eq!(after.review, ReviewState::None);
    assert_eq!(after.last_sequence as usize, before);
    assert_eq!(store.list_events(&run.id, 0, 100).unwrap().len(), before);
}

#[test]
fn successful_transition_updates_state_and_event_together() {
    let store = mem_store();
    let (_s, _st, run) = setup(&store);
    let claimed = store.claim_run(&run.id, "inst", 60_000).unwrap();
    assert_eq!(claimed.run.execution, ExecutionState::Claimed);
    assert_eq!(claimed.run.fencing_token, 1);
    assert_eq!(claimed.event.kind, "run.state_changed");
    let running = store.transition_run(&run.id, TransitionRequest::execution(ExecutionState::Running)).unwrap();
    assert!(running.run.started_at.is_some());
    assert_eq!(running.event.sequence, running.run.last_sequence);
    let mut done = TransitionRequest::execution(ExecutionState::Done);
    done.result = Some(json!({"summary": "ok", "token": "abc"}));
    let done = store.transition_run(&run.id, done).unwrap();
    assert!(done.run.finished_at.is_some());
    assert_eq!(done.run.result.as_ref().unwrap()["summary"], "ok");
    assert_eq!(done.run.result.as_ref().unwrap()["token"], "[redacted]");
    assert_eq!(done.event.payload["execution"]["from"], "running");
    assert_eq!(done.event.payload["execution"]["to"], "done");
    // terminal runs reject further agent events
    assert!(matches!(store.append_event(&run.id, "message", &json!({}), None), Err(Error::Conflict(_))));
}

#[test]
fn fencing_token_blocks_stale_workers() {
    let store = mem_store();
    let (_s, _st, run) = setup(&store);
    store.claim_run(&run.id, "a", 60_000).unwrap();
    assert!(matches!(store.append_event(&run.id, "message", &json!({}), Some(99)), Err(Error::FencingMismatch)));
    assert!(store.append_event(&run.id, "message", &json!({}), Some(1)).is_ok());
    let mut req = TransitionRequest::execution(ExecutionState::Running);
    req.fencing_token = Some(7);
    assert!(matches!(store.transition_run(&run.id, req), Err(Error::FencingMismatch)));
    assert!(matches!(store.heartbeat(&run.id, 7, 1000), Err(Error::FencingMismatch)));
    assert!(store.heartbeat(&run.id, 1, 1000).is_ok());
    // release and re-claim gives a new token
    store.transition_run(&run.id, TransitionRequest::execution(ExecutionState::Pending)).unwrap();
    assert_eq!(store.claim_run(&run.id, "b", 1000).unwrap().run.fencing_token, 2);
}

#[test]
fn concurrent_writers_on_separate_handles_get_unique_contiguous_sequences() {
    let dir = tempfile::tempdir().unwrap();
    let path = Arc::new(dir.path().join("c.db"));
    let run_id = {
        let store = Store::open(&*path, opts_none()).unwrap();
        setup(&store).2.id
    };
    let threads = 8;
    let per = 25;
    let mut handles = vec![];
    for t in 0..threads {
        let path = path.clone();
        let run_id = run_id.clone();
        handles.push(std::thread::spawn(move || {
            let store = Store::open(&*path, opts_none()).unwrap();
            let mut seqs = vec![];
            for i in 0..per {
                let e = store.append_event(&run_id, "message", &json!({"t": t, "i": i}), None).unwrap();
                seqs.push(e.sequence);
            }
            seqs
        }));
    }
    let mut all: Vec<i64> = vec![];
    for h in handles {
        let seqs = h.join().unwrap();
        assert!(seqs.windows(2).all(|w| w[1] > w[0]), "per-writer order is monotonic");
        all.extend(seqs);
    }
    all.sort();
    let expected: Vec<i64> = (2..(2 + threads * per) as i64).collect();
    assert_eq!(all, expected);
    let store = Store::open(&*path, opts_none()).unwrap();
    let events = store.list_events(&run_id, 0, 500).unwrap();
    assert_eq!(events.len(), 1 + (threads * per) as usize);
    assert!(events.windows(2).all(|w| w[1].sequence == w[0].sequence + 1));
}

#[test]
fn concurrent_claims_have_exactly_one_winner() {
    let dir = tempfile::tempdir().unwrap();
    let path = Arc::new(dir.path().join("claim.db"));
    let run_id = {
        let store = Store::open(&*path, opts_none()).unwrap();
        setup(&store).2.id
    };
    let mut handles = vec![];
    for t in 0..6 {
        let path = path.clone();
        let run_id = run_id.clone();
        handles.push(std::thread::spawn(move || {
            let store = Store::open(&*path, opts_none()).unwrap();
            store.claim_run(&run_id, &format!("inst-{t}"), 60_000).is_ok()
        }));
    }
    let winners = handles.into_iter().map(|h| h.join().unwrap()).filter(|w| *w).count();
    assert_eq!(winners, 1);
    let store = Store::open(&*path, opts_none()).unwrap();
    assert_eq!(store.get_run(&run_id).unwrap().fencing_token, 1);
}
