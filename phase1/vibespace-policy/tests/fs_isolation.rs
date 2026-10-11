//! File-layer tests through the public API only: symlinks, traversal, special files, limits.

use std::sync::Arc;
use vibespace_policy::*;

#[allow(dead_code)]
struct Env {
    _tmp: tempfile::TempDir,
    root: std::path::PathBuf,
    outside: std::path::PathBuf,
    b: BrokerHandles,
    fx: FileExecutor,
}

fn env_limits(limits: FileLimits) -> Env {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("copy");
    let outside = tmp.path().join("outside");
    std::fs::create_dir_all(&outside).unwrap();
    IsolatedRoot::initialize(&root).unwrap();
    let b = ConsentBroker::with(PolicyConfig::default(), Arc::new(SystemClock)).unwrap();
    let (run, scope) = (
        RunId::new("run-1").unwrap(),
        ScopeId::new("copy-1").unwrap(),
    );
    let mut rs = RunScope::new(run.clone(), scope.clone());
    rs.autonomy = Autonomy::AllowWritesInCopy; // so only the file layer stands in the way
    b.runs.register_run(rs).unwrap();
    let fx = FileExecutor::attach(
        &b.agent,
        run,
        scope,
        IsolatedRoot::open(&root).unwrap(),
        limits,
    )
    .unwrap();
    Env {
        _tmp: tmp,
        root,
        outside,
        b,
        fx,
    }
}

fn env() -> Env {
    env_limits(FileLimits::default())
}

impl Env {
    fn token(&self, r: ProposeResult) -> ApprovalToken {
        match r {
            ProposeResult::Approved { token, .. } => token,
            ProposeResult::Pending(id) => {
                self.b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
                match self.b.agent.poll(&id).unwrap() {
                    PollResult::Approved { token, .. } => token,
                    o => panic!("{o:?}"),
                }
            }
            ProposeResult::Denied(r) => panic!("denied {r:?}"),
        }
    }
    fn read(&self, rel: &str) -> Result<Vec<u8>, ExecError> {
        let t = self.token(self.fx.propose_read(rel, "t", Origin::Model).unwrap());
        self.fx.read(t, rel)
    }
    fn write(&self, rel: &str, data: &[u8]) -> Result<WriteReceipt, ExecError> {
        let t = self.token(
            self.fx
                .propose_write(rel, data, "t", Origin::Model)
                .unwrap(),
        );
        self.fx.write(t, rel, data)
    }
    fn delete(&self, rel: &str) -> Result<(), ExecError> {
        let t = self.token(self.fx.propose_delete(rel, "t", Origin::Model).unwrap());
        self.fx.delete(t, rel)
    }
}

fn is_fs(e: ExecError, f: impl Fn(&FsError) -> bool) -> bool {
    matches!(e, ExecError::Fs(ref x) if f(x))
}

#[test]
fn basic_read_write_delete_roundtrip_and_parents() {
    let e = env();
    e.write("dir/sub/a.txt", b"hello").unwrap();
    assert_eq!(e.read("dir/sub/a.txt").unwrap(), b"hello");
    assert_eq!(e.read("dir//sub/./a.txt").unwrap(), b"hello", "normalised");
    e.write("dir/sub/a.txt", b"changed").unwrap();
    assert_eq!(
        std::fs::read(e.root.join("dir/sub/a.txt")).unwrap(),
        b"changed"
    );
    e.delete("dir/sub/a.txt").unwrap();
    assert!(!e.root.join("dir/sub/a.txt").exists());
    assert!(is_fs(e.read("dir/sub/a.txt").unwrap_err(), |x| matches!(
        x,
        FsError::NotFound
    )));
}

#[cfg(unix)]
#[test]
fn symlinked_file_cannot_be_read_written_or_deleted() {
    use std::os::unix::fs::symlink;
    let e = env();
    std::fs::write(e.outside.join("secret.txt"), b"OUTSIDE").unwrap();
    symlink(e.outside.join("secret.txt"), e.root.join("link.txt")).unwrap();
    assert!(is_fs(e.read("link.txt").unwrap_err(), |x| matches!(
        x,
        FsError::Symlink
    )));
    assert!(is_fs(
        e.write("link.txt", b"PWNED").unwrap_err(),
        |x| matches!(x, FsError::Symlink)
    ));
    assert!(is_fs(e.delete("link.txt").unwrap_err(), |x| matches!(
        x,
        FsError::Symlink
    )));
    assert_eq!(
        std::fs::read(e.outside.join("secret.txt")).unwrap(),
        b"OUTSIDE"
    );
    assert!(
        std::fs::symlink_metadata(e.root.join("link.txt"))
            .unwrap()
            .file_type()
            .is_symlink(),
        "link untouched"
    );
}

#[cfg(unix)]
#[test]
fn symlinked_directory_cannot_be_traversed_or_created_through() {
    use std::os::unix::fs::symlink;
    let e = env();
    std::fs::write(e.outside.join("secret.txt"), b"OUTSIDE").unwrap();
    symlink(&e.outside, e.root.join("out")).unwrap();
    assert!(e.read("out/secret.txt").is_err());
    assert!(e.write("out/new.txt", b"PWNED").is_err());
    assert!(e.write("out/deeper/new.txt", b"PWNED").is_err());
    assert!(e.delete("out/secret.txt").is_err());
    assert!(!e.outside.join("new.txt").exists());
    assert!(!e.outside.join("deeper").exists());
    assert_eq!(
        std::fs::read(e.outside.join("secret.txt")).unwrap(),
        b"OUTSIDE"
    );
    // Relative symlink that points up and out.
    symlink("../outside", e.root.join("up")).unwrap();
    assert!(e.read("up/secret.txt").is_err());
}

#[cfg(unix)]
#[test]
fn dangling_symlink_at_target_is_not_followed_on_write() {
    use std::os::unix::fs::symlink;
    let e = env();
    symlink(e.outside.join("not-yet.txt"), e.root.join("dangling.txt")).unwrap();
    assert!(e.write("dangling.txt", b"PWNED").is_err());
    assert!(!e.outside.join("not-yet.txt").exists());
}

#[cfg(unix)]
#[test]
fn fifo_and_special_files_rejected_without_blocking() {
    let e = env();
    let p = e.root.join("pipe");
    let c = std::ffi::CString::new(p.to_str().unwrap()).unwrap();
    assert_eq!(unsafe_mkfifo(&c), 0);
    assert!(is_fs(e.read("pipe").unwrap_err(), |x| matches!(
        x,
        FsError::NotRegular
    )));
    assert!(is_fs(e.write("pipe", b"x").unwrap_err(), |x| matches!(
        x,
        FsError::NotRegular
    )));
    assert!(is_fs(e.delete("pipe").unwrap_err(), |x| matches!(
        x,
        FsError::NotRegular
    )));
    std::fs::create_dir(e.root.join("adir")).unwrap();
    assert!(is_fs(e.read("adir").unwrap_err(), |x| matches!(
        x,
        FsError::NotRegular
    )));
    assert!(is_fs(e.delete("adir").unwrap_err(), |x| matches!(
        x,
        FsError::NotRegular
    )));
}

#[cfg(unix)]
fn unsafe_mkfifo(c: &std::ffi::CStr) -> i32 {
    // Test-only helper; libc is a unix dependency of the crate.
    extern "C" {
        fn mkfifo(path: *const std::ffi::c_char, mode: u32) -> i32;
    }
    unsafe { mkfifo(c.as_ptr(), 0o600) }
}

#[cfg(all(unix, not(feature = "cap-layer")))]
#[test]
fn hardlink_to_outside_file_rejected() {
    let e = env();
    std::fs::write(e.outside.join("secret.txt"), b"OUTSIDE").unwrap();
    std::fs::hard_link(e.outside.join("secret.txt"), e.root.join("hl.txt")).unwrap();
    assert!(is_fs(e.read("hl.txt").unwrap_err(), |x| matches!(
        x,
        FsError::HardLink
    )));
    assert!(is_fs(
        e.write("hl.txt", b"PWNED").unwrap_err(),
        |x| matches!(x, FsError::HardLink)
    ));
    assert_eq!(
        std::fs::read(e.outside.join("secret.txt")).unwrap(),
        b"OUTSIDE"
    );
}

#[test]
fn size_limits_enforced_on_read_and_write() {
    let e = env_limits(FileLimits {
        max_read_bytes: 8,
        max_write_bytes: 8,
        ..Default::default()
    });
    e.write("ok.txt", b"12345678").unwrap();
    // Write over limit: refused at proposal, nothing created.
    assert!(is_fs(
        e.fx.propose_write("big.txt", b"123456789", "t", Origin::Model)
            .unwrap_err(),
        |x| matches!(x, FsError::TooLarge)
    ));
    assert!(!e.root.join("big.txt").exists());
    // File grown outside the executor beyond the read limit.
    std::fs::write(e.root.join("grown.txt"), b"123456789").unwrap();
    assert!(is_fs(e.read("grown.txt").unwrap_err(), |x| matches!(
        x,
        FsError::TooLarge
    )));
    assert_eq!(e.read("ok.txt").unwrap().len(), 8);
}

#[test]
fn protected_paths_cannot_be_touched() {
    let e = env();
    std::fs::create_dir_all(e.root.join(".git/hooks")).unwrap();
    for p in [
        ".git/hooks/pre-commit",
        ".git/config",
        "x/.Git/y",
        ".vibespace-isolated",
        ".vs-tmp-abc",
    ] {
        assert!(
            e.fx.propose_write(p, b"x", "t", Origin::Model).is_err(),
            "{p}"
        );
        assert!(e.fx.propose_read(p, "t", Origin::Model).is_err(), "{p}");
    }
    assert!(!e.root.join(".git/hooks/pre-commit").exists());
}

#[test]
fn root_must_be_a_marked_isolated_directory() {
    let tmp = tempfile::tempdir().unwrap();
    // No marker.
    assert!(matches!(
        IsolatedRoot::open(tmp.path()),
        Err(FsError::BadRoot(_))
    ));
    // Relative.
    assert!(matches!(
        IsolatedRoot::open(std::path::Path::new("relative/dir")),
        Err(FsError::BadRoot(_))
    ));
    // Filesystem root.
    assert!(matches!(
        IsolatedRoot::open(std::path::Path::new("/")),
        Err(FsError::BadRoot(_))
    ));
    // Marker present -> ok.
    IsolatedRoot::initialize(&tmp.path().join("c")).unwrap();
    assert!(IsolatedRoot::open(&tmp.path().join("c")).is_ok());
}

#[cfg(unix)]
#[test]
fn symlink_swap_after_attach_cannot_redirect_the_root() {
    use std::os::unix::fs::symlink;
    let e = env();
    e.write("a.txt", b"inside").unwrap();
    // Attacker renames the real root away and puts a symlink to the outside directory in its
    // place. The executor holds the original directory handle, so it keeps using the real one.
    let moved = e.root.with_file_name("copy-moved");
    std::fs::rename(&e.root, &moved).unwrap();
    symlink(&e.outside, &e.root).unwrap();
    e.write("b.txt", b"still inside").unwrap();
    assert!(moved.join("b.txt").exists());
    assert!(!e.outside.join("b.txt").exists());
    assert_eq!(e.read("a.txt").unwrap(), b"inside");
}

#[test]
fn failed_effect_is_audited_without_content() {
    let e = env();
    std::fs::create_dir(e.root.join("d")).unwrap();
    let _ = e.write("d", b"TOPSECRET").unwrap_err();
    let json = serde_json::to_string(&e.b.ui.audit(100).unwrap()).unwrap();
    assert!(json.contains("effect_failed"));
    assert!(!json.contains("TOPSECRET"));
}

// ---- Windows (cap-std layer). Compile-checked here; must run on Windows CI. ----------------

/// Symlink creation needs Developer Mode or elevation on Windows; skip (loudly) without it.
#[cfg(windows)]
#[test]
fn windows_symlinks_and_junctions_cannot_be_followed() {
    use std::os::windows::fs::{symlink_dir, symlink_file};
    let e = env();
    std::fs::write(e.outside.join("secret.txt"), b"OUTSIDE").unwrap();

    // Junction (no privilege needed).
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(e.root.join("junc"))
        .arg(&e.outside)
        .output()
        .expect("mklink");
    assert!(
        status.status.success(),
        "junction creation failed: {status:?}"
    );
    assert!(e.read("junc/secret.txt").is_err());
    assert!(e.write("junc/new.txt", b"PWNED").is_err());
    assert!(e.delete("junc/secret.txt").is_err());
    assert!(!e.outside.join("new.txt").exists());
    assert_eq!(
        std::fs::read(e.outside.join("secret.txt")).unwrap(),
        b"OUTSIDE"
    );

    // Directory and file symlinks (may be unavailable).
    if symlink_dir(&e.outside, e.root.join("dlink")).is_ok() {
        assert!(e.read("dlink/secret.txt").is_err());
        assert!(e.write("dlink/new.txt", b"PWNED").is_err());
        assert!(!e.outside.join("new.txt").exists());
    } else {
        eprintln!("SKIPPED: symlink_dir needs Developer Mode or elevation");
    }
    if symlink_file(e.outside.join("secret.txt"), e.root.join("flink.txt")).is_ok() {
        assert!(e.read("flink.txt").is_err());
        assert!(e.write("flink.txt", b"PWNED").is_err());
        assert!(e.delete("flink.txt").is_err());
        assert_eq!(
            std::fs::read(e.outside.join("secret.txt")).unwrap(),
            b"OUTSIDE"
        );
    } else {
        eprintln!("SKIPPED: symlink_file needs Developer Mode or elevation");
    }
}

#[cfg(windows)]
#[test]
fn windows_reserved_and_stream_names_refused() {
    let e = env();
    for p in [
        "file.txt:stream",
        "NUL",
        "aux.txt",
        "dir\\x",
        "trailing.",
        "trailing ",
    ] {
        assert!(
            e.fx.propose_write(p, b"x", "t", Origin::Model).is_err(),
            "{p}"
        );
    }
}

/// GHSA-hp8f-xmx4-4qrg trigger shapes through the actual broker-bound executor.
/// Removing a caller slash is insufficient: indirect symlink targets can carry it.
#[cfg(unix)]
#[test]
fn advisory_trailing_slash_and_indirect_symlink_targets_cannot_escape() {
    use std::os::unix::fs::symlink;
    let e=env();
    std::fs::write(e.outside.join("secret.txt"),b"OUTSIDE").unwrap();
    symlink("../outside",e.root.join("evil")).unwrap();
    symlink("evil/",e.root.join("indirect")).unwrap();
    symlink("../outside/",e.root.join("x")).unwrap();
    symlink("x/",e.root.join("indirect_x")).unwrap();
    symlink("/",e.root.join("root_link")).unwrap();
    for rel in ["evil/secret.txt","evil//secret.txt","indirect/secret.txt","indirect_x/secret.txt","root_link/etc/passwd","root_link//etc/passwd"] {
        assert!(e.read(rel).is_err(),"read escaped through {rel}");
        assert!(e.write(rel,b"PWNED").is_err(),"write escaped through {rel}");
        assert!(e.delete(rel).is_err(),"delete escaped through {rel}");
    }
    for rel in ["evil/","indirect/","indirect_x/","root_link/"] {
        assert!(e.read(rel).is_err(),"trailing slash read escaped {rel}");
        assert!(e.write(rel,b"PWNED").is_err(),"trailing slash write escaped {rel}");
    }
    assert_eq!(std::fs::read(e.outside.join("secret.txt")).unwrap(),b"OUTSIDE");
    assert!(std::fs::symlink_metadata(e.root.join("evil")).unwrap().is_symlink());
}

#[cfg(windows)]
#[test]
fn advisory_trailing_slash_junction_paths_cannot_escape() {
    let e=env();std::fs::write(e.outside.join("secret.txt"),b"OUTSIDE").unwrap();
    let status=std::process::Command::new("cmd").args(["/C","mklink","/J"]).arg(e.root.join("evil")).arg(&e.outside).output().expect("mklink");
    assert!(status.status.success(),"junction creation failed: {status:?}");
    for rel in ["evil/secret.txt","evil//secret.txt","evil\\secret.txt","evil\\\\secret.txt"] {
        assert!(e.read(rel).is_err());assert!(e.write(rel,b"PWNED").is_err());assert!(e.delete(rel).is_err());
    }
    for rel in ["evil/","evil\\"] {assert!(e.read(rel).is_err());assert!(e.write(rel,b"PWNED").is_err());}
    assert_eq!(std::fs::read(e.outside.join("secret.txt")).unwrap(),b"OUTSIDE");
}
