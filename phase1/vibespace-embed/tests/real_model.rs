//! Manual smoke test (downloads ~487 MB): `cargo test --features fastembed -- --ignored real_model`.
#![cfg(feature = "fastembed")]
use somnia_vibespace_embed::embedder::E5Embedder;
use somnia_vibespace_embed::*;
use somnia_vibespace_storage::{EmbedKind, Embedder};
use std::sync::atomic::AtomicBool;

fn cos(a: &[f32], b: &[f32]) -> f32 {
    let d: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    d / (na * nb)
}

#[test]
#[ignore]
fn real_model_downloads_and_ranks_multilingual() {
    let spec = e5_small();
    let dir = std::env::var("E5_DIR").unwrap_or_else(|_| "/tmp/e5-models".into());
    let store = ModelStore::new(dir);
    if store.status(&spec) != ModelStatus::Ready {
        let c = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
        store.download(&spec, model::HF_BASE, c, &AtomicBool::new(false), &mut |_| {}).unwrap();
    }
    let e = E5Embedder::load(&store, &spec).unwrap();
    let q = e.embed(&["Auto kaufen".to_string()], EmbedKind::Query).unwrap().remove(0);
    let p = e.embed(&["I want to buy a new car next month".to_string(), "recipe for lentil soup".to_string()], EmbedKind::Passage).unwrap();
    assert_eq!(q.len(), 384);
    assert!(cos(&q, &p[0]) > cos(&q, &p[1]), "{} vs {}", cos(&q, &p[0]), cos(&q, &p[1]));
}
