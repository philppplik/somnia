#![allow(dead_code)]
use somnia_vibespace_checkpoints::*;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static N: AtomicU64 = AtomicU64::new(0);

/// Temp directory removed on drop (no external dev-dependency).
pub struct TestDir(pub PathBuf);

impl TestDir {
    pub fn new() -> TestDir {
        let n = N.fetch_add(1, Ordering::Relaxed);
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let p = std::env::temp_dir().join(format!("vsck-{}-{t:x}-{n}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        TestDir(fs::canonicalize(p).unwrap())
    }
    pub fn path(&self) -> &Path {
        &self.0
    }
    pub fn join(&self, s: &str) -> PathBuf {
        self.0.join(s)
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn write(p: &Path, bytes: impl AsRef<[u8]>) {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).unwrap();
    }
    fs::write(p, bytes).unwrap();
}

pub struct Env {
    pub tmp: TestDir,
    pub project: PathBuf,
    pub vault: Vault,
}

/// project/ with a few files, and a vault next to it.
pub fn env() -> Env {
    let tmp = TestDir::new();
    let project = tmp.join("project");
    write(&project.join("a.txt"), "alpha\nbeta\ngamma\n");
    write(&project.join("src/main.rs"), "fn main() {}\n");
    write(
        &project.join("data/blob.bin"),
        (0..=255u8).collect::<Vec<_>>(),
    );
    write(&project.join("keep.txt"), "keep me\n");
    let vault = Vault::open(tmp.join("vault")).unwrap();
    Env {
        tmp,
        project,
        vault,
    }
}

pub fn scope(p: &Path) -> Scope {
    Scope::single("proj", p)
}

/// Every regular file under dir -> bytes (relative, `/` separated). Includes dotfiles.
pub fn tree(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn rec(base: &Path, d: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for e in fs::read_dir(d).unwrap() {
            let e = e.unwrap();
            let p = e.path();
            let ft = fs::symlink_metadata(&p).unwrap().file_type();
            if ft.is_dir() {
                rec(base, &p, out);
            } else if ft.is_file() {
                let rel = p
                    .strip_prefix(base)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                out.insert(rel, fs::read(&p).unwrap());
            }
        }
    }
    let mut m = BTreeMap::new();
    rec(dir, dir, &mut m);
    m
}

pub fn review(v: &Vault, cp: &CheckpointId, c: &IsolatedCopy) -> Review {
    v.review_changes(cp, c).unwrap()
}

pub fn apply(
    v: &Vault,
    cp: &CheckpointId,
    c: &IsolatedCopy,
    r: &Review,
    sel: Selection,
) -> Result<ApplyReport> {
    v.explicit_apply(&ApplyRequest {
        expected_baseline: *cp,
        copy: c,
        review: r,
        selection: sel,
        options: ApplyOptions::default(),
    })
}

pub fn apply_inject(
    v: &Vault,
    cp: &CheckpointId,
    c: &IsolatedCopy,
    r: &Review,
    sel: Selection,
    i: Inject,
) -> Result<ApplyReport> {
    v.explicit_apply(&ApplyRequest {
        expected_baseline: *cp,
        copy: c,
        review: r,
        selection: sel,
        options: ApplyOptions { inject: Some(i) },
    })
}

pub fn conflicts(e: Error) -> Vec<Conflict> {
    match e {
        Error::Conflicts(c) => c,
        Error::ApplyFailed { cause, .. } => conflicts(*cause),
        other => panic!("expected conflicts, got {other}"),
    }
}
