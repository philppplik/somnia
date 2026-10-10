use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tempfile::TempDir;

fn bin() -> &'static str { env!("CARGO_BIN_EXE_somnia") }
fn engine_cmd() -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-engine.mjs");
    serde_json::to_string(&["node", p.to_str().unwrap()]).unwrap()
}

struct Env { dir: TempDir, rt: TempDir }
impl Env {
    fn new(identity: bool) -> Self {
        let e = Env { dir: tempfile::tempdir().unwrap(), rt: tempfile::tempdir().unwrap() };
        std::fs::set_permissions(e.rt.path(), std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
        e.git(&["init", "-q", "-b", "main"]);
        if identity {
            e.git(&["config", "user.name", "Test User"]);
            e.git(&["config", "user.email", "test@example.com"]);
        }
        std::fs::write(e.root().join("README.md"), "hello\n").unwrap();
        e.git(&["add", "-A"]);
        e.git(&["-c", "user.name=Seed", "-c", "user.email=seed@example.com", "commit", "-q", "-m", "seed"]);
        e
    }
    fn root(&self) -> &Path { self.dir.path() }
    fn git(&self, a: &[&str]) -> String {
        let o = Command::new("git").current_dir(self.root()).args(a)
            .env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1").output().unwrap();
        assert!(o.status.success(), "git {a:?}: {}", String::from_utf8_lossy(&o.stderr));
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn somnia(&self, args: &[&str], envs: &[(&str, &str)]) -> Output {
        let mut c = Command::new(bin());
        c.current_dir(self.root()).args(args)
            .env("SOMNIA_ENGINE_CMD", engine_cmd())
            .env("XDG_RUNTIME_DIR", self.rt.path())
            .env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1")
            .env_remove("SOMNIA_ATTRIBUTION_EMAIL");
        for (k, v) in envs { c.env(k, v); }
        c.output().unwrap()
    }
    fn json(&self, args: &[&str], envs: &[(&str, &str)]) -> (i32, Value) {
        let o = self.somnia(args, envs);
        let s = String::from_utf8_lossy(&o.stdout);
        let v: Value = serde_json::from_str(s.trim()).unwrap_or_else(|e| panic!("not json ({e}): {s} / {}", String::from_utf8_lossy(&o.stderr)));
        (o.status.code().unwrap(), v)
    }
    fn branches(&self) -> String { self.git(&["branch", "--list", "somnia/*"]) }
}

#[test]
fn yes_commits_locally_with_unreviewed_checkpoint_and_stable_schema() {
    let e = Env::new(true);
    let base = e.git(&["rev-parse", "HEAD"]);
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes", "--studio", "code"], &[]);
    assert_eq!(code, 0, "{v}");
    let mut keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, ["base_sha","branch","error","overrides","plan","producer","prompt","result_sha","schema","status","task_id","unreviewed_checkpoint","usage","verification"]);
    assert_eq!(v["schema"], "somnia.run/1");
    assert_eq!(v["status"], "done");
    assert_eq!(v["base_sha"], base.as_str());
    assert_eq!(v["unreviewed_checkpoint"], true);
    assert_eq!(v["usage"]["tokens"], 1234);
    assert_eq!(v["overrides"]["studio"], "code");
    assert_eq!(v["plan"], "write notes");
    let tid = v["task_id"].as_str().unwrap();
    assert_eq!(v["branch"], format!("somnia/task/{tid}"));
    assert_eq!(e.git(&["rev-parse", "HEAD"]), v["result_sha"].as_str().unwrap());
    assert_eq!(e.git(&["rev-list", "--count", &format!("{base}..HEAD")]), "1");
    let msg = e.git(&["log", "-1", "--format=%B"]);
    assert!(!msg.contains("Co-authored-by"), "attribution is opt-in");
    assert_eq!(e.git(&["status", "--porcelain"]), "", ".somnia must stay private/untracked-invisible");
    assert_eq!(e.git(&["rev-parse", &format!("refs/somnia/safety/{tid}")]), base);
    assert!(e.root().join(format!(".somnia/sessions/{tid}.json")).exists());
}

#[test]
fn without_yes_leaves_work_uncommitted_and_exits_2() {
    let e = Env::new(true);
    let base = e.git(&["rev-parse", "HEAD"]);
    let (code, v) = e.json(&["run", "build a page", "--json"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["status"], "review");
    assert_eq!(e.git(&["rev-parse", "HEAD"]), base);
    assert!(e.git(&["status", "--porcelain"]).contains("site/"));
}

#[test]
fn attribution_is_opt_in_and_needs_identity() {
    let e = Env::new(true);
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes", "--attribution"], &[]);
    assert_eq!(code, 1);
    assert_eq!(v["schema"], "somnia.error/1");
    assert_eq!(v["error"]["kind"], "bad-request");
    assert_eq!(e.branches(), "", "blocked before any branch was created");
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes", "--attribution"], &[("SOMNIA_ATTRIBUTION_EMAIL", "bot@example.invalid")]);
    assert_eq!(code, 0, "{v}");
    let msg = e.git(&["log", "-1", "--format=%B"]);
    assert!(msg.contains("Co-authored-by: Somnia Agent <bot@example.invalid>"));
    assert!(msg.contains(&format!("X-Somnia-Session: {}", v["task_id"].as_str().unwrap())));
    assert_eq!(e.git(&["log", "-1", "--format=%an <%ae>"]), "Test User <test@example.com>", "human stays author");
}

#[test]
fn identity_missing_is_typed_and_nothing_is_written() {
    let e = Env::new(false);
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes"], &[]);
    assert_eq!(code, 1);
    assert_eq!(v["error"]["kind"], "identity-missing");
    assert_eq!(e.branches(), "");
}

#[test]
fn gui_unsaved_buffer_and_ai_hold_block_with_review_required() {
    let e = Env::new(true);
    std::fs::create_dir_all(e.root().join(".somnia")).unwrap();
    let st = e.root().join(".somnia/gui-state.json");
    std::fs::write(&st, r#"{"schema":1,"unsavedBuffers":[{"path":"site/index.html"}]}"#).unwrap();
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["error"]["kind"], "review-required");
    assert_eq!(v["error"]["details"]["unsaved_buffers"][0], "site/index.html");
    assert_eq!(e.branches(), "");
    // outside the allowed roots: not a blocker
    let (_, v) = e.json(&["run", "build a page", "--json", "--allow-root", "docs"], &[]);
    assert!(v["error"].is_null(), "buffer outside allowed roots must not block: {v}");
    e.git(&["clean", "-fdq"]);
    e.git(&["switch", "-q", "main"]);
    // AI hold blocks
    std::fs::write(&st, r#"{"schema":1,"aiHolds":[{"id":"hold-1"}]}"#).unwrap();
    let (code, v) = e.json(&["run", "again", "--json"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["error"]["details"]["ai_holds"][0], "hold-1");
    // unreadable state fails closed
    std::fs::write(&st, "{not json").unwrap();
    let (code, v) = e.json(&["run", "again", "--json"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["error"]["kind"], "review-required");
}

#[test]
fn dirty_tree_engine_failure_and_needs_input() {
    let e = Env::new(true);
    std::fs::write(e.root().join("README.md"), "changed\n").unwrap();
    let (code, v) = e.json(&["run", "x", "--json"], &[]);
    assert_eq!((code, v["error"]["kind"].as_str().unwrap()), (1, "dirty-worktree"));
    e.git(&["checkout", "--", "README.md"]);
    let (code, v) = e.json(&["run", "please fail", "--json"], &[]);
    assert_eq!(code, 1);
    assert_eq!(v["status"], "failed");
    assert_eq!(v["error"]["message"], "engine exploded");
    e.git(&["switch", "-q", "main"]);
    let (code, v) = e.json(&["run", "ask me", "--json"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["status"], "waiting-input");
}

#[test]
fn engine_changes_outside_allowed_roots_are_not_committed() {
    let e = Env::new(true);
    let base = e.git(&["rev-parse", "HEAD"]);
    let (code, v) = e.json(&["run", "outside please", "--json", "--yes", "--allow-root", "site"], &[]);
    assert_eq!(code, 2, "{v}");
    assert_eq!(v["error"]["kind"], "review-required");
    assert_eq!(e.git(&["rev-parse", "HEAD"]), base);
}

#[test]
fn noop_run_is_done_with_no_commit() {
    let e = Env::new(true);
    let base = e.git(&["rev-parse", "HEAD"]);
    let (code, v) = e.json(&["run", "noop", "--json", "--yes"], &[]);
    assert_eq!(code, 0);
    assert_eq!(v["result_sha"], base.as_str());
    assert_eq!(v["unreviewed_checkpoint"], false);
}

#[test]
fn request_id_prevents_duplicate_runs() {
    let e = Env::new(true);
    let (c1, a) = e.json(&["run", "build a page", "--json", "--yes", "--request-id", "req-1"], &[]);
    let (c2, b) = e.json(&["run", "build a page", "--json", "--yes", "--request-id", "req-1"], &[]);
    assert_eq!((c1, c2), (0, 0));
    assert_eq!(a["task_id"], b["task_id"]);
    assert_eq!(e.branches().lines().count(), 1);
}

#[test]
fn failed_preflight_releases_request_id() {
    let e = Env::new(false);
    let (c, _) = e.json(&["run", "x", "--json", "--yes", "--request-id", "req-2"], &[]);
    assert_eq!(c, 1);
    e.git(&["config", "user.name", "T"]);
    e.git(&["config", "user.email", "t@example.com"]);
    let (c, v) = e.json(&["run", "x", "--json", "--yes", "--request-id", "req-2"], &[]);
    assert_eq!(c, 0, "{v}");
}

#[test]
fn workspace_has_one_owner() {
    let e = Env::new(true);
    std::fs::create_dir_all(e.root().join(".somnia")).unwrap();
    let f = std::fs::File::create(e.root().join(".somnia/workspace.lock")).unwrap();
    fs2_lock(&f);
    let (code, v) = e.json(&["run", "x", "--json"], &[]);
    assert_eq!(code, 1);
    assert_eq!(v["error"]["kind"], "workspace-busy");
}
fn fs2_lock(f: &std::fs::File) {
    use std::os::unix::io::AsRawFd;
    assert_eq!(unsafe { libc_flock(f.as_raw_fd(), 2 | 4) }, 0);
}
extern "C" { #[link_name = "flock"] fn libc_flock(fd: i32, op: i32) -> i32; }

fn wait_status(e: &Env, tid: &str, want: &str) -> Value {
    for _ in 0..100 {
        let (_, v) = e.json(&["status", tid, "--json"], &[]);
        if v["status"] == want { return v; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    panic!("status never became {want}");
}

#[test]
fn detach_attach_status_roundtrip_over_socket() {
    let e = Env::new(true);
    let (code, d) = e.json(&["run", "build a page", "--json", "--yes", "--detach"], &[]);
    assert_eq!(code, 0, "{d}");
    let tid = d["task_id"].as_str().unwrap().to_string();
    let (code, v) = e.json(&["attach", &tid, "--json"], &[]);
    assert_eq!(code, 0, "{v}");
    assert_eq!(v["status"], "done");
    assert_eq!(v["task_id"], tid.as_str());
    // human-readable attach replays events after the run finished
    let o = e.somnia(&["attach", &tid], &[]);
    let s = String::from_utf8_lossy(&o.stdout);
    assert!(s.contains("[plan] write notes"), "{s}");
}

#[test]
fn detached_run_can_be_cancelled_and_socket_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let e = Env::new(true);
    let (_, d) = e.json(&["run", "slow one", "--json", "--detach"], &[]);
    let tid = d["task_id"].as_str().unwrap().to_string();
    let sock_dir = e.rt.path().join("somnia"); // XDG_RUNTIME_DIR/somnia
    let mode = std::fs::metadata(&sock_dir).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o700);
    let sock: PathBuf = std::fs::read_dir(&sock_dir).unwrap().next().unwrap().unwrap().path();
    assert_eq!(std::fs::metadata(&sock).unwrap().permissions().mode() & 0o777, 0o600);
    // The daemon registers its discovery file before the run loop is fully live; a cancel issued
    // immediately after detach can therefore still race the listener. Retry bounded instead of
    // depending on scheduling: the cancel must be acknowledged within 5 s.
    let mut acked = false;
    for _ in 0..50 {
        let (code, c) = e.json(&["cancel", &tid, "--json"], &[]);
        if code == 0 && c["acknowledged"] == Value::Bool(true) { acked = true; break; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(acked, "cancel was never acknowledged");
    wait_status(&e, &tid, "cancelled");
}

#[test]
fn detach_surfaces_blockers_synchronously() {
    let e = Env::new(true);
    std::fs::create_dir_all(e.root().join(".somnia")).unwrap();
    std::fs::write(e.root().join(".somnia/gui-state.json"), r#"{"unsavedBuffers":[{"path":"a.html"}]}"#).unwrap();
    let (code, v) = e.json(&["run", "x", "--json", "--detach"], &[]);
    assert_eq!(code, 2);
    assert_eq!(v["error"]["kind"], "review-required");
}

#[test]
fn not_a_repo_is_typed() {
    let d = tempfile::tempdir().unwrap();
    let o = Command::new(bin()).current_dir(d.path()).args(["run", "x", "--json"]).env("GIT_CEILING_DIRECTORIES", d.path().parent().unwrap()).output().unwrap();
    let v: Value = serde_json::from_slice(&o.stdout).unwrap();
    assert_eq!(v["error"]["kind"], "bad-request");
    assert_eq!(o.status.code(), Some(1));
}

#[test]
fn no_ansi_no_banner_in_json_mode() {
    let e = Env::new(true);
    let o = e.somnia(&["run", "build a page", "--json", "--yes"], &[]);
    let s = String::from_utf8_lossy(&o.stdout);
    assert!(!s.contains('\u{1b}'));
    assert_eq!(s.trim().lines().count(), 1);
    assert!(o.stderr.is_empty());
}
