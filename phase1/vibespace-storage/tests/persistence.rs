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
        store.append_event(&run.id, "message", &serde_json::json!({"text": "hello"}), None).unwrap();
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
        let m = store.add_memory(new_memory(&space.id, Some("Style"), "prefer tabs")).unwrap();
        space_id = space.id;
        studio_id = studio.id;
        run_id = run.id;
        mem_id = m.id;
    }
    let store = Store::open(&path, opts_none()).unwrap();
    assert_eq!(store.get_space(&space_id).unwrap().name, "Project");
    assert_eq!(store.get_studio(&studio_id).unwrap().goal, "Refactor");
    assert_eq!(store.get_studio(&studio_id).unwrap().model.locality, ModelLocality::Local);
    let events = store.list_events(&run_id, 0, 100).unwrap();
    assert_eq!(events.iter().map(|e| e.sequence).collect::<Vec<_>>(), vec![1, 2, 3]);
    assert_eq!(events[0].kind, "run.created");
    assert_eq!(store.list_checkpoints(&space_id, Some(&run_id), 10).unwrap().len(), 1);
    assert_eq!(store.get_memory(&space_id, &mem_id).unwrap().unwrap().content, "prefer tabs");
    assert!(store.get_space(&space_id).unwrap().created_at.ends_with('Z'));
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
    assert!(store.create_space(NewSpace::project(&"n".repeat(201), "g")).is_err());
    let mut s = NewSpace::project("ok", "g");
    s.scope.folder_grant_id = None;
    assert!(matches!(store.create_space(s), Err(Error::InvalidInput(_))));
    let mut p = NewSpace::personal("p");
    p.scope.folder_grant_id = Some("g".into());
    assert!(store.create_space(p).is_err());
    let mut v = NewSpace::personal("p");
    v.schema_version = 2;
    assert!(matches!(store.create_space(v), Err(Error::UnsupportedDtoVersion { found: 2 })));
    // studio for an unknown space
    let r = store.create_studio(NewStudio { schema_version: 1, space_id: "nope".into(), goal: "g".into(), model: model() });
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
    let degraded = Store::open_in_memory(StoreOptions { disable_fts: true, ..opts_none() }).unwrap();
    assert!(!degraded.capabilities().fts5);
    assert_eq!(degraded.capabilities().search_mode, SearchMode::LikeFallback);
}
