mod common;
use common::*;
use somnia_vibespace_storage::*;

#[test]
fn data_survives_restart_and_defaults_are_set() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vs.db");
    let (space_id, studio_id, run_id, mem_id);
    {
        let store = Store::open(&path, opts_none()).unwrap();
        let (space, studio, run) = setup(&store);
        assert_eq!(space.autonomy, Autonomy::AskForWrites);
        assert_eq!(run.execution, ExecutionState::Pending);
        assert_eq!(run.review, ReviewState::None);
        store
            .append_event(
                &run.id,
                "message",
                &serde_json::json!({"text": "hello"}),
                None,
            )
            .unwrap();
        store
            .add_checkpoint(NewCheckpoint {
                schema_version: 1,
                space_id: space.id.clone(),
                run_id: run.id.clone(),
                kind: CheckpointKind::Baseline,
                label: "checkpoint 0".into(),
                content_ref: format!("sha256:{}", "ab".repeat(32)),
            })
            .unwrap();
        let m = store
            .add_memory(new_memory(&space.id, Some("Style"), "prefer tabs"))
            .unwrap();
        space_id = space.id;
        studio_id = studio.id;
        run_id = run.id;
        mem_id = m.id;
    }
    let store = Store::open(&path, opts_none()).unwrap();
    assert_eq!(store.get_space(&space_id).unwrap().name, "Project");
    assert_eq!(store.get_studio(&studio_id).unwrap().goal, "Refactor");
    assert_eq!(
        store.get_studio(&studio_id).unwrap().model.locality,
        ModelLocality::Local
    );
    let events = store.list_events(&run_id, 0, 100).unwrap();
    assert_eq!(
        events.iter().map(|e| e.sequence).collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(events[0].kind, "run.created");
    assert_eq!(
        store
            .list_checkpoints(&space_id, Some(&run_id), 10)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        store
            .get_memory(&space_id, &mem_id)
            .unwrap()
            .unwrap()
            .content,
        "prefer tabs"
    );
    assert!(store
        .get_space(&space_id)
        .unwrap()
        .created_at
        .ends_with('Z'));
    let ids = [&space_id, &studio_id, &run_id];
    for id in ids {
        assert_eq!(id.len(), 36);
        assert_eq!(id.as_bytes()[14], b'4'); // UUID v4
    }
}

#[test]
fn space_validation() {
    let store = mem_store();
    assert!(store.create_space(NewSpace::project("", "g")).is_err());
    assert!(store.create_space(NewSpace::project("x\0y", "g")).is_err());
    assert!(store
        .create_space(NewSpace::project(&"n".repeat(201), "g"))
        .is_err());
    let mut s = NewSpace::project("ok", "g");
    s.scope.folder_grant_id = None;
    assert!(matches!(store.create_space(s), Err(Error::InvalidInput(_))));
    let mut p = NewSpace::personal("p");
    p.scope.folder_grant_id = Some("g".into());
    assert!(store.create_space(p).is_err());
    let mut v = NewSpace::personal("p");
    v.schema_version = 2;
    assert!(matches!(
        store.create_space(v),
        Err(Error::UnsupportedDtoVersion { found: 2 })
    ));
    // studio for an unknown space
    let r = store.create_studio(NewStudio {
        schema_version: 1,
        space_id: "nope".into(),
        goal: "g".into(),
        model: model(),
    });
    assert!(matches!(r, Err(Error::NotFound { .. })));
}

#[test]
fn capabilities_are_explicit_about_vector_and_pause() {
    let store = mem_store();
    let caps = store.capabilities();
    assert!(caps.fts5);
    assert_eq!(caps.search_mode, SearchMode::Fts5);
    assert_eq!(caps.vector.status, "unavailable");
    assert!(!caps.pause_resume);
    assert_eq!(caps.db_schema_version, SCHEMA_VERSION);
    let degraded = Store::open_in_memory(StoreOptions {
        disable_fts: true,
        ..opts_none()
    })
    .unwrap();
    assert!(!degraded.capabilities().fts5);
    assert_eq!(
        degraded.capabilities().search_mode,
        SearchMode::LikeFallback
    );
}

#[test]
fn start_run_is_idempotent_and_retry_creates_a_new_run() {
    let store = mem_store();
    let (_s, studio, first) = setup(&store);
    let rid = "3f2b8c1e-6a4d-4f57-9a0e-1c2d3e4f5a6b".to_string();
    let req = StartRunRequest {
        schema_version: 1,
        studio_id: studio.id.clone(),
        request_id: rid.clone(),
        retry_of_run_id: None,
    };
    let a = store.start_run(req.clone()).unwrap();
    assert!(a.created);
    let b = store.start_run(req.clone()).unwrap(); // ambiguous transport retry
    assert!(!b.created);
    assert_eq!(a.run.id, b.run.id);
    assert_eq!(
        store.list_events(&a.run.id, 0, 10).unwrap().len(),
        1,
        "replay writes nothing"
    );
    assert_eq!(
        store
            .get_run_by_request(&rid.to_uppercase())
            .unwrap()
            .unwrap()
            .id,
        a.run.id
    );
    assert!(store
        .get_run_by_request("00000000-0000-4000-8000-000000000000")
        .unwrap()
        .is_none());
    // same request id, different parameters
    let mut other = req.clone();
    other.retry_of_run_id = Some(first.id.clone());
    assert!(matches!(store.start_run(other), Err(Error::Conflict(_))));
    // bad request id
    let mut bad = req.clone();
    bad.request_id = "not-a-uuid".into();
    assert!(store.start_run(bad).is_err());

    // retry: only failed/stopped/crashed runs of the same studio
    let retry = |rid: &str, of: &str| StartRunRequest {
        schema_version: 1,
        studio_id: studio.id.clone(),
        request_id: rid.into(),
        retry_of_run_id: Some(of.into()),
    };
    assert!(matches!(
        store.start_run(retry("11111111-1111-4111-8111-111111111111", &a.run.id)),
        Err(Error::Conflict(_))
    ));
    store
        .transition_run(
            &a.run.id,
            TransitionRequest::execution(ExecutionState::Stopped),
        )
        .unwrap();
    let r = store
        .start_run(retry("22222222-2222-4222-8222-222222222222", &a.run.id))
        .unwrap();
    assert!(r.created);
    assert_ne!(r.run.id, a.run.id);
    assert_eq!(r.run.retry_of_run_id.as_deref(), Some(a.run.id.as_str()));
    assert_eq!(r.run.execution, ExecutionState::Pending);
    assert_eq!(
        store.get_run(&a.run.id).unwrap().execution,
        ExecutionState::Stopped,
        "old history untouched"
    );
    // retry of a run from another studio is rejected
    let (_s2, _st2, foreign) = setup(&store);
    store
        .transition_run(
            &foreign.id,
            TransitionRequest::execution(ExecutionState::Stopped),
        )
        .unwrap();
    assert!(store
        .start_run(retry("33333333-3333-4333-8333-333333333333", &foreign.id))
        .is_err());
    // unknown studio
    let none = StartRunRequest {
        schema_version: 1,
        studio_id: "x".into(),
        request_id: "44444444-4444-4444-8444-444444444444".into(),
        retry_of_run_id: None,
    };
    assert!(matches!(store.start_run(none), Err(Error::NotFound { .. })));
}

#[test]
fn concurrent_start_with_same_request_id_creates_one_run() {
    let dir = tempfile::tempdir().unwrap();
    let path = std::sync::Arc::new(dir.path().join("s.db"));
    let studio_id = {
        let store = Store::open(&*path, opts_none()).unwrap();
        setup(&store).1.id
    };
    let hs: Vec<_> = (0..6)
        .map(|_| {
            let path = path.clone();
            let studio_id = studio_id.clone();
            std::thread::spawn(move || {
                let store = Store::open(&*path, opts_none()).unwrap();
                let req = StartRunRequest {
                    schema_version: 1,
                    studio_id,
                    request_id: "55555555-5555-4555-8555-555555555555".into(),
                    retry_of_run_id: None,
                };
                let o = store.start_run(req).unwrap();
                (o.run.id, o.created)
            })
        })
        .collect();
    let res: Vec<_> = hs.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(res.iter().filter(|r| r.1).count(), 1);
    assert!(res.iter().all(|r| r.0 == res[0].0));
}
