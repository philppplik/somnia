mod common;
use common::*;
use somnia_vibespace_storage::*;

fn run_in_state(store: &Store, state: ExecutionState) -> Run {
    let (_s, _st, run) = setup(store);
    match state {
        ExecutionState::Pending => run,
        ExecutionState::Claimed => store.claim_run(&run.id, "i", 60_000).unwrap().run,
        ExecutionState::Running => claim_and_run(store, &run.id),
        ExecutionState::Done
        | ExecutionState::Failed
        | ExecutionState::Crashed
        | ExecutionState::Stopped => {
            claim_and_run(store, &run.id);
            store
                .transition_run(&run.id, TransitionRequest::execution(state))
                .unwrap()
                .run
        }
        ExecutionState::Paused => unreachable!(),
    }
}

fn expected_ok(from: ExecutionState, to: ExecutionState) -> bool {
    use ExecutionState::*;
    matches!(
        (from, to),
        (Pending, Stopped)
            | (Claimed, Running)
            | (Claimed, Pending)
            | (Claimed, Stopped)
            | (Claimed, Failed)
            | (Claimed, Crashed)
            | (Running, Stopped)
            | (Running, Done)
            | (Running, Failed)
            | (Running, Crashed)
    )
}

#[test]
fn execution_transition_matrix() {
    let store = mem_store();
    let sources = [
        ExecutionState::Pending,
        ExecutionState::Claimed,
        ExecutionState::Running,
        ExecutionState::Done,
        ExecutionState::Failed,
        ExecutionState::Stopped,
        ExecutionState::Crashed,
    ];
    for from in sources {
        for to in ExecutionState::ALL {
            if *to == ExecutionState::Claimed || *to == ExecutionState::Paused {
                continue; // claim has its own API; paused is disabled by default (tested below)
            }
            let run = run_in_state(&store, from);
            assert_eq!(run.execution, from);
            let before = run.last_sequence;
            let res = store.transition_run(&run.id, TransitionRequest::execution(*to));
            if expected_ok(from, *to) {
                let out = res.unwrap_or_else(|e| panic!("{from:?}->{to:?} should be allowed: {e}"));
                assert_eq!(out.run.execution, *to);
                assert_eq!(out.run.last_sequence, before + 1);
            } else {
                assert!(
                    matches!(res, Err(Error::InvalidTransition { .. })),
                    "{from:?}->{to:?} must be rejected"
                );
                let after = store.get_run(&run.id).unwrap();
                assert_eq!(after.execution, from);
                assert_eq!(after.last_sequence, before);
            }
        }
    }
}

#[test]
fn claim_requires_pending_and_paused_is_gated() {
    let store = mem_store();
    let run = run_in_state(&store, ExecutionState::Running);
    assert!(matches!(
        store.claim_run(&run.id, "x", 1000),
        Err(Error::InvalidTransition { .. })
    ));
    assert!(matches!(
        store.transition_run(
            &run.id,
            TransitionRequest::execution(ExecutionState::Paused)
        ),
        Err(Error::Unsupported(_))
    ));
    assert!(matches!(
        store.transition_run(
            &run.id,
            TransitionRequest::execution(ExecutionState::Claimed)
        ),
        Err(Error::InvalidInput(_))
    ));
    assert!(store
        .transition_run(&run.id, TransitionRequest::default())
        .is_err());
    assert!(store.claim_run(&run.id, "x", 0).is_err());

    let paused_store = Store::open_in_memory(StoreOptions {
        enable_paused: true,
        ..opts_none()
    })
    .unwrap();
    assert!(paused_store.capabilities().pause_resume);
    let r = run_in_state(&paused_store, ExecutionState::Running);
    let p = paused_store
        .transition_run(&r.id, TransitionRequest::execution(ExecutionState::Paused))
        .unwrap();
    assert_eq!(p.run.execution, ExecutionState::Paused);
    let back = paused_store
        .transition_run(&r.id, TransitionRequest::execution(ExecutionState::Running))
        .unwrap();
    assert_eq!(back.run.execution, ExecutionState::Running);
}

#[test]
fn review_is_a_separate_axis_with_revisions() {
    let store = mem_store();
    let run = run_in_state(&store, ExecutionState::Running);
    // not reviewable while running
    assert!(store
        .transition_run(&run.id, TransitionRequest::review(ReviewState::Ready))
        .is_err());
    // done + ready in a single atomic request
    let mut req = TransitionRequest::execution(ExecutionState::Done);
    req.review = Some(ReviewState::Ready);
    let out = store.transition_run(&run.id, req).unwrap();
    assert_eq!(out.run.execution, ExecutionState::Done);
    assert_eq!(out.run.review, ReviewState::Ready);
    assert_eq!(out.run.review_revision, 1);
    assert_eq!(out.event.payload["review"]["to"], "ready");

    // stale revision rejected, state unchanged
    let mut stale = TransitionRequest::review(ReviewState::Applied);
    stale.expected_review_revision = Some(0);
    assert!(matches!(
        store.transition_run(&run.id, stale),
        Err(Error::Conflict(_))
    ));
    assert_eq!(store.get_run(&run.id).unwrap().review, ReviewState::Ready);

    // conflict -> ready -> applied
    store
        .transition_run(&run.id, TransitionRequest::review(ReviewState::Conflict))
        .unwrap();
    store
        .transition_run(&run.id, TransitionRequest::review(ReviewState::Ready))
        .unwrap();
    let mut ok = TransitionRequest::review(ReviewState::Applied);
    ok.expected_review_revision = Some(3);
    let applied = store.transition_run(&run.id, ok).unwrap();
    assert_eq!(applied.run.review, ReviewState::Applied);
    assert_eq!(
        applied.run.execution,
        ExecutionState::Done,
        "execution state untouched by review"
    );
    // applied is terminal
    for to in [
        ReviewState::Discarded,
        ReviewState::Ready,
        ReviewState::None,
    ] {
        assert!(matches!(
            store.transition_run(&run.id, TransitionRequest::review(to)),
            Err(Error::InvalidTransition { .. })
        ));
    }
    // an attention listing shows ready/conflict/crashed runs only
    let space_id = store.get_run(&run.id).unwrap().space_id;
    assert!(store.list_attention_runs(&space_id, 10).unwrap().is_empty());
}

#[test]
fn state_checks_are_also_enforced_by_the_database() {
    // The CHECK constraints reject unknown states even if code were bypassed.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.db");
    let store = Store::open(&path, opts_none()).unwrap();
    let (_s, _st, run) = setup(&store);
    let raw = rusqlite::Connection::open(&path).unwrap();
    let bad = raw.execute(
        "UPDATE runs SET execution_state='weird' WHERE id=?1",
        rusqlite::params![run.id],
    );
    assert!(bad.is_err());
    let upd = raw.execute(
        "UPDATE run_events SET kind='x' WHERE run_id=?1",
        rusqlite::params![run.id],
    );
    assert!(upd.is_err(), "run_events are append-only");
}
