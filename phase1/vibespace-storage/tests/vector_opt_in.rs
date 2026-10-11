mod common;
use common::*;
use somnia_vibespace_storage::*;

/// Deterministic fake: 4 concept dims. "car"/"automobile"/"vehicle" share dim 0, etc.
struct Fake;
impl Embedder for Fake {
    fn model_id(&self) -> &str {
        "fake-e5"
    }
    fn dims(&self) -> usize {
        4
    }
    fn embed(&self, texts: &[String], _k: EmbedKind) -> Result<Vec<Vec<f32>>> {
        Ok(texts
            .iter()
            .map(|t| {
                let t = t.to_lowercase();
                let has = |ws: &[&str]| if ws.iter().any(|w| t.contains(w)) { 1.0 } else { 0.0 };
                vec![has(&["car", "automobile", "vehicle"]), has(&["cook", "recipe"]), has(&["tax", "invoice"]), 0.05]
            })
            .collect())
    }
}

fn raw_tables(path: &std::path::Path) -> Vec<String> {
    let c = rusqlite::Connection::open(path).unwrap();
    let mut st = c.prepare("SELECT name FROM sqlite_master WHERE (name LIKE '%embed%' OR name LIKE '%vec%') AND name NOT LIKE 'sqlite_autoindex%'").unwrap();
    st.query_map([], |r| r.get::<_, String>(0)).unwrap().map(|r| r.unwrap()).collect()
}

fn seed(store: &Store) -> Space {
    let s = store.create_space(NewSpace::personal("A")).unwrap();
    store.add_memory(new_memory(&s.id, Some("Garage"), "my automobile needs new tyres")).unwrap();
    store.add_memory(new_memory(&s.id, Some("Dinner"), "recipe for lentil soup")).unwrap();
    store.add_memory(new_memory(&s.id, None, "invoice due friday")).unwrap();
    s
}

#[test]
fn default_is_off_no_tables_no_download_fts_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v.db");
    {
        let store = Store::open(&path, opts_none()).unwrap();
        let s = seed(&store);
        let st = store.vector_status(&s.id).unwrap();
        assert!(!st.enabled);
        assert_eq!(st.indexed, 0);
        let plain = store.search_memory(&s.id, "recipe", &SearchOptions::default()).unwrap();
        let h = store.search_memory_hybrid(&s.id, "recipe", &SearchOptions::default(), Some(&Fake)).unwrap();
        assert_eq!(h.mode, HybridMode::Fts5);
        assert_eq!(h.vector_fallback_reason.as_deref(), Some("vector_not_opted_in"));
        assert_eq!(h.hits.iter().map(|x| x.item.id.clone()).collect::<Vec<_>>(), plain.hits.iter().map(|x| x.item.id.clone()).collect::<Vec<_>>());
        assert!(h.hits.iter().all(|x| !x.from_vector));
        // The query that only vectors can answer finds nothing without opt-in.
        assert!(store.search_memory_hybrid(&s.id, "car", &SearchOptions::default(), Some(&Fake)).unwrap().hits.is_empty());
        assert!(matches!(store.vector_index_pending(&s.id, &Fake, 10), Err(Error::Conflict(_))));
        assert_eq!(store.capabilities().vector.status, "opt_in");
    }
    assert!(raw_tables(&path).iter().all(|n| n == "memory_vector_settings"), "{:?}", raw_tables(&path));
    let c = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(c.query_row("SELECT count(*) FROM memory_vector_settings", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
}

#[test]
fn enable_needs_explicit_acknowledgement_and_creates_nothing_otherwise() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v.db");
    let store = Store::open(&path, opts_none()).unwrap();
    let s = seed(&store);
    let r = store.vector_enable(VectorOptIn { space_id: s.id.clone(), model_id: "fake-e5".into(), dims: 4, acknowledged: false });
    assert!(matches!(r, Err(Error::InvalidInput(_))));
    assert!(!store.vector_status(&s.id).unwrap().enabled);
    assert!(raw_tables(&path).iter().all(|n| n == "memory_vector_settings"));
}

#[test]
fn opt_in_indexes_and_finds_what_fts_cannot_then_opt_out_purges() {
    let store = mem_store();
    let s = seed(&store);
    let other = store.create_space(NewSpace::personal("B")).unwrap();
    store.add_memory(new_memory(&other.id, None, "vehicle insurance")).unwrap();
    let st = store
        .vector_enable(VectorOptIn { space_id: s.id.clone(), model_id: "fake-e5".into(), dims: 4, acknowledged: true })
        .unwrap();
    assert!(st.enabled && st.indexed == 0 && st.total == 3);
    assert_eq!(store.vector_index_pending(&s.id, &Fake, 100).unwrap(), 3);
    assert_eq!(store.vector_index_pending(&s.id, &Fake, 100).unwrap(), 0);
    assert_eq!(store.vector_status(&s.id).unwrap().indexed, 3);
    // Space B is not opted in: untouched.
    assert!(!store.vector_status(&other.id).unwrap().enabled);

    let h = store.search_memory_hybrid(&s.id, "car", &SearchOptions::default(), Some(&Fake)).unwrap();
    assert_eq!(h.mode, HybridMode::Hybrid);
    assert_eq!(h.hits[0].item.title.as_deref(), Some("Garage"));
    assert!(h.hits[0].from_vector && !h.hits[0].from_fts);
    // Never leaks space B's "vehicle insurance".
    assert!(h.hits.iter().all(|x| x.item.space_id == s.id));

    // Wrong model -> plain FTS, with a reason.
    struct Other;
    impl Embedder for Other {
        fn model_id(&self) -> &str { "other" }
        fn dims(&self) -> usize { 4 }
        fn embed(&self, t: &[String], _: EmbedKind) -> Result<Vec<Vec<f32>>> { Ok(vec![vec![0.0; 4]; t.len()]) }
    }
    let m = store.search_memory_hybrid(&s.id, "recipe", &SearchOptions::default(), Some(&Other)).unwrap();
    assert_eq!(m.mode, HybridMode::Fts5);
    assert_eq!(m.vector_fallback_reason.as_deref(), Some("embedder_model_mismatch"));
    assert!(matches!(store.vector_index_pending(&s.id, &Other, 5), Err(Error::Conflict(_))));

    // Deleting an item removes its vector.
    let id = h.hits[0].item.id.clone();
    assert!(store.delete_memory(&s.id, &id).unwrap());
    assert_eq!(store.vector_status(&s.id).unwrap().indexed, 2);

    // Opt out purges vectors, keeps items and FTS.
    let off = store.vector_disable(&s.id).unwrap();
    assert!(!off.enabled && off.indexed == 0 && off.total == 2);
    let after = store.search_memory_hybrid(&s.id, "recipe", &SearchOptions::default(), Some(&Fake)).unwrap();
    assert_eq!(after.mode, HybridMode::Fts5);
    assert_eq!(after.hits.len(), 1);
}

#[test]
fn new_items_are_indexed_later_and_pending_review_is_hidden() {
    let store = mem_store();
    let s = seed(&store);
    store.vector_enable(VectorOptIn { space_id: s.id.clone(), model_id: "fake-e5".into(), dims: 4, acknowledged: true }).unwrap();
    store.vector_index_pending(&s.id, &Fake, 100).unwrap();
    let mut n = new_memory(&s.id, Some("Draft"), "agent thinks the car is red");
    n.source = MemorySource::Agent;
    n.consent = MemoryConsent::PendingReview;
    let item = store.add_memory(n).unwrap();
    assert_eq!(store.vector_index_pending(&s.id, &Fake, 100).unwrap(), 1);
    let hidden = store.search_memory_hybrid(&s.id, "car", &SearchOptions::default(), Some(&Fake)).unwrap();
    assert!(hidden.hits.iter().all(|h| h.item.id != item.id));
    assert!(store.review_memory(&s.id, &item.id, true).unwrap());
    let shown = store.search_memory_hybrid(&s.id, "car", &SearchOptions::default(), Some(&Fake)).unwrap();
    assert!(shown.hits.iter().any(|h| h.item.id == item.id));
}

#[test]
fn delete_all_memory_is_scoped_and_removes_vectors() {
    let store = mem_store();
    let s = seed(&store);
    let o = store.create_space(NewSpace::personal("B")).unwrap();
    store.add_memory(new_memory(&o.id, None, "keep me")).unwrap();
    store.vector_enable(VectorOptIn { space_id: s.id.clone(), model_id: "fake-e5".into(), dims: 4, acknowledged: true }).unwrap();
    store.vector_index_pending(&s.id, &Fake, 100).unwrap();
    assert_eq!(store.delete_all_memory(&s.id).unwrap(), 3);
    assert_eq!(store.vector_status(&s.id).unwrap().indexed, 0);
    assert_eq!(store.list_memory(&o.id, &MemoryListOptions { include_pending: true, limit: 10, offset: 0 }).unwrap().len(), 1);
}

#[test]
fn rejecting_a_pending_item_deletes_it() {
    let store = mem_store();
    let s = store.create_space(NewSpace::personal("A")).unwrap();
    let mut n = new_memory(&s.id, None, "maybe");
    n.consent = MemoryConsent::PendingReview;
    let it = store.add_memory(n).unwrap();
    assert!(store.review_memory(&s.id, &it.id, false).unwrap());
    assert!(store.get_memory(&s.id, &it.id).unwrap().is_none());
    // user_explicit items cannot be "reviewed" away.
    let k = store.add_memory(new_memory(&s.id, None, "mine")).unwrap();
    assert!(!store.review_memory(&s.id, &k.id, false).unwrap());
}
