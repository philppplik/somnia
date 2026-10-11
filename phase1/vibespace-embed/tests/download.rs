use sha2::{Digest, Sha256};
use somnia_vibespace_embed::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

fn hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

struct Server {
    base: String,
    hits: Arc<AtomicUsize>,
}
/// Serves `files` (repo_path -> bytes) for any `/<repo>/resolve/<rev>/<path>`.
fn serve(files: Vec<(String, Vec<u8>)>, slow: bool) -> Server {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
    let hits = Arc::new(AtomicUsize::new(0));
    let h = hits.clone();
    std::thread::spawn(move || {
        for s in l.incoming() {
            let Ok(mut s) = s else { break };
            h.fetch_add(1, Ordering::SeqCst);
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.split_whitespace().nth(1).unwrap_or("").to_string();
            let body = files.iter().find(|(p, _)| path.ends_with(p.as_str())).map(|x| x.1.clone());
            match body {
                Some(b) => {
                    let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", b.len());
                    for c in b.chunks(1000) {
                        if s.write_all(c).is_err() {
                            break;
                        }
                        if slow {
                            std::thread::sleep(std::time::Duration::from_millis(20));
                        }
                    }
                }
                None => {
                    let _ = write!(s, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                }
            }
        }
    });
    Server { base, hits }
}

fn spec_for(files: &[(String, Vec<u8>)]) -> ModelSpec {
    ModelSpec {
        id: "tiny".into(),
        dims: 4,
        repo: "o/tiny".into(),
        revision: "rev1".into(),
        license: "MIT".into(),
        files: files
            .iter()
            .map(|(p, b)| FileSpec { repo_path: p.clone(), local_name: p.rsplit('/').next().unwrap().into(), size: b.len() as u64, sha256: hex(b) })
            .collect(),
    }
}

fn fixture() -> Vec<(String, Vec<u8>)> {
    vec![("onnx/model.onnx".into(), vec![7u8; 5000]), ("tokenizer.json".into(), b"{}".to_vec())]
}

#[test]
fn pinned_e5_spec_is_sane_and_status_is_pure() {
    let s = e5_small();
    assert_eq!(s.dims, 384);
    assert!(s.total_bytes() > 480_000_000 && s.total_bytes() < 500_000_000);
    assert!(s.files.iter().all(|f| f.sha256.len() == 64));
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path().join("models"));
    assert_eq!(store.status(&s), ModelStatus::Missing);
    // status() created nothing.
    assert!(!d.path().join("models").exists());
}

#[test]
fn consent_must_name_the_exact_size() {
    let s = e5_small();
    assert!(DownloadConsent::acknowledge(&s, 0).is_err());
    assert!(DownloadConsent::acknowledge(&s, s.total_bytes() - 1).is_err());
    assert!(DownloadConsent::acknowledge(&s, s.total_bytes()).is_ok());
}

#[test]
fn downloads_verify_and_report_progress() {
    let f = fixture();
    let srv = serve(f.clone(), false);
    let spec = spec_for(&f);
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path());
    let consent = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
    let mut last = None;
    let mut calls = 0;
    store.download(&spec, &srv.base, consent, &AtomicBool::new(false), &mut |p| {
        calls += 1;
        last = Some(p.clone());
    }).unwrap();
    assert!(calls >= 2);
    let last = last.unwrap();
    assert_eq!((last.downloaded, last.total), (spec.total_bytes(), spec.total_bytes()));
    assert_eq!(store.status(&spec), ModelStatus::Ready);
    // no .part leftovers
    let leftovers: Vec<_> = std::fs::read_dir(store.model_dir(&spec)).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().ends_with(".part")).collect();
    assert!(leftovers.is_empty());
    store.remove(&spec).unwrap();
    assert_eq!(store.status(&spec), ModelStatus::Missing);
}

#[test]
fn tampered_bytes_are_rejected_and_nothing_is_installed() {
    let f = fixture();
    let mut evil = f.clone();
    evil[0].1[10] ^= 1; // same size, different content
    let srv = serve(evil, false);
    let spec = spec_for(&f);
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path());
    let consent = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
    let r = store.download(&spec, &srv.base, consent, &AtomicBool::new(false), &mut |_| {});
    assert!(matches!(r, Err(DownloadError::HashMismatch { .. })), "{r:?}");
    assert_eq!(store.status(&spec), ModelStatus::Missing);
    assert!(!store.model_dir(&spec).join("model.onnx").exists());
    assert!(!store.model_dir(&spec).join("model.onnx.part").exists());
}

#[test]
fn cancel_aborts_and_cleans_up() {
    let f = vec![("onnx/model.onnx".to_string(), vec![1u8; 200_000])];
    let srv = serve(f.clone(), true);
    let spec = spec_for(&f);
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path());
    let consent = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
    let cancel = AtomicBool::new(false);
    let r = store.download(&spec, &srv.base, consent, &cancel, &mut |p| {
        if p.downloaded > 20_000 {
            cancel.store(true, Ordering::SeqCst);
        }
    });
    assert!(matches!(r, Err(DownloadError::Cancelled)), "{r:?}");
    assert_eq!(store.status(&spec), ModelStatus::Missing);
    assert!(!store.model_dir(&spec).join("model.onnx.part").exists());
}

#[test]
fn http_errors_and_insecure_urls_fail_without_installing() {
    let f = fixture();
    let spec = spec_for(&f);
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path());
    let consent = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
    let r = store.download(&spec, "http://example.com", consent, &AtomicBool::new(false), &mut |_| {});
    assert!(matches!(r, Err(DownloadError::InsecureUrl(_))));
    assert!(!d.path().exists() || !store.model_dir(&spec).exists());
    let srv = serve(vec![], false);
    let r = store.download(&spec, &srv.base, consent, &AtomicBool::new(false), &mut |_| {});
    assert!(matches!(r, Err(DownloadError::Http(_))));
    assert_eq!(store.status(&spec), ModelStatus::Missing);
    assert_eq!(srv.hits.load(Ordering::SeqCst), 1);
}

#[test]
fn already_cancelled_makes_no_request() {
    let f = fixture();
    let srv = serve(f.clone(), false);
    let spec = spec_for(&f);
    let d = tempfile::tempdir().unwrap();
    let store = ModelStore::new(d.path());
    let consent = DownloadConsent::acknowledge(&spec, spec.total_bytes()).unwrap();
    let r = store.download(&spec, &srv.base, consent, &AtomicBool::new(true), &mut |_| {});
    assert!(matches!(r, Err(DownloadError::Cancelled)));
    assert_eq!(srv.hits.load(Ordering::SeqCst), 0);
}
