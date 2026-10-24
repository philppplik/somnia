//! Unix only: these tests exercise the Unix-socket transport. The Windows named-pipe transport is not built yet.
#![cfg(unix)]
use serde_json::Value;
use std::path::Path;
#[cfg(unix)]
use std::path::PathBuf;
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
        #[cfg(unix)]
        std::fs::set_permissions(e.rt.path(), std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
        // An empty global git config keeps the tests hermetic; /dev/null does not exist on Windows.
        #[cfg(windows)]
        std::fs::write(e.null_gitconfig(), "").unwrap();
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
    fn null_gitconfig(&self) -> String {
        #[cfg(unix)]
        return "/dev/null".to_string();
        #[cfg(windows)]
        return self.rt.path().join("gitconfig-null").to_string_lossy().into_owned();
    }
    fn git(&self, a: &[&str]) -> String {
        let o = Command::new("git").current_dir(self.root()).args(a)
            .env("GIT_CONFIG_GLOBAL", self.null_gitconfig()).env("GIT_CONFIG_NOSYSTEM", "1").output().unwrap();
        assert!(o.status.success(), "git {a:?}: {}", String::from_utf8_lossy(&o.stderr));
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn somnia(&self, args: &[&str], envs: &[(&str, &str)]) -> Output {
        let mut c = Command::new(bin());
        c.current_dir(self.root()).args(args)
            .env("SOMNIA_ENGINE_CMD", engine_cmd())
            .env("XDG_RUNTIME_DIR", self.rt.path())
            .env("GIT_CONFIG_GLOBAL", self.null_gitconfig()).env("GIT_CONFIG_NOSYSTEM", "1")
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
    use fs2::FileExt;
    f.try_lock_exclusive().expect("test holds the workspace lock");
}

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

#[cfg(unix)]
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

// Windows counterpart: cancel over the named pipe. Pipe privacy (current-user DACL, SID-scoped
// name, peer-process check) is covered in tests/transport_windows.rs.
#[cfg(windows)]
#[test]
fn detached_run_can_be_cancelled_over_named_pipe() {
    let e = Env::new(true);
    let (_, d) = e.json(&["run", "slow one", "--json", "--detach"], &[]);
    let tid = d["task_id"].as_str().unwrap().to_string();
    // Same bounded retry as the Unix test: discovery is written before the listener is live.
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

#[test]
fn engine_tool_model_and_usage_events_are_logged_live_and_recorded() {
    let e = Env::new(true);
    let (code, v) = e.json(&["run", "tooly page", "--json", "--yes"], &[]);
    assert_eq!(code, 0, "{v}");
    assert_eq!(v["producer"]["provider"], "fake");
    assert_eq!(v["producer"]["model"], "fake-1");
    // Final totals from `done` (1234 tokens, 0.02) win over the streamed ones.
    assert_eq!(v["usage"]["tokens"], 1234);
    let tid = v["task_id"].as_str().unwrap();
    let log = std::fs::read_to_string(e.root().join(format!(".somnia/sessions/{tid}.events.ndjson"))).unwrap();
    let evs: Vec<Value> = log.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
    let names: Vec<&str> = evs.iter().map(|x| x["event"].as_str().unwrap()).collect();
    assert_eq!(names, ["status", "plan", "model", "tool-call", "tool-result", "usage", "tool-call", "tool-result", "usage", "progress", "result"], "{names:?}");
    let tr: Vec<&Value> = evs.iter().filter(|x| x["event"] == "tool-result").collect();
    assert_eq!(tr[0]["status"], "ok");
    assert_eq!(tr[1]["status"], "error", "anything but ok is an error");
    let usage: Vec<&Value> = evs.iter().filter(|x| x["event"] == "usage").collect();
    assert!(usage[0]["cost"].is_null(), "unknown cost stays null, never zero");
    assert_eq!(usage[1]["tokens"], 250);
    // seq is gapless even though an unknown engine event was ignored.
    let seqs: Vec<u64> = evs.iter().map(|x| x["seq"].as_u64().unwrap()).collect();
    assert_eq!(seqs, (1..=seqs.len() as u64).collect::<Vec<_>>());
}

#[test]
fn typed_engine_failure_keeps_its_code_and_maps_to_a_stable_kind() {
    let e = Env::new(true);
    let (code, v) = e.json(&["run", "authfail", "--json"], &[]);
    assert_eq!(code, 1, "{v}");
    assert_eq!(v["status"], "failed");
    assert_eq!(v["error"]["kind"], "auth");
    assert_eq!(v["error"]["details"]["engine_code"], "auth");
    assert_eq!(v["error"]["details"]["retryable"], false);
}

#[test]
fn cancel_reaches_the_engine_as_a_cancel_op_before_it_is_killed() {
    let e = Env::new(true);
    let marker = tempfile::tempdir().unwrap();
    let envs = [("FAKE_ENGINE_MARKER", marker.path().to_str().unwrap())];
    let (_, d) = e.json(&["run", "slow one", "--json", "--detach"], &envs);
    let tid = d["task_id"].as_str().unwrap().to_string();
    // Let the engine start (it emits a plan first), then cancel.
    std::thread::sleep(std::time::Duration::from_millis(800));
    for _ in 0..50 {
        let (code, c) = e.json(&["cancel", &tid, "--json"], &envs);
        if code == 0 && c["acknowledged"] == Value::Bool(true) { break; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    wait_status(&e, &tid, "cancelled");
    assert!(marker.path().join("cancel-seen").exists(), "engine never received the cancel op");
}

fn real_engine() -> Option<PathBuf> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("sidecar/engine.mjs");
    if p.is_file() { Some(p) } else { eprintln!("SKIP: sidecar/engine.mjs not built (run `npm run build:cli-engine` in phase1)"); None }
}

/// Minimal scripted Ollama on loopback: one response body (NDJSON) per request, in order; the last repeats.
fn fake_ollama(bodies: Vec<String>) -> (u16, std::thread::JoinHandle<()>, std::sync::Arc<std::sync::atomic::AtomicBool>) {
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, Ordering};
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    l.set_nonblocking(true).unwrap();
    let stop = std::sync::Arc::new(AtomicBool::new(false));
    let s2 = stop.clone();
    let h = std::thread::spawn(move || {
        let mut n = 0usize;
        while !s2.load(Ordering::SeqCst) {
            let Ok((mut c, _)) = l.accept() else { std::thread::sleep(std::time::Duration::from_millis(10)); continue };
            c.set_nonblocking(false).unwrap();
            c.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut buf = vec![0u8; 1 << 20];
            let mut got = 0;
            // Read headers + body (Content-Length) so the client is not reset mid-write.
            loop {
                let k = c.read(&mut buf[got..]).unwrap_or(0);
                if k == 0 { break; }
                got += k;
                let text = String::from_utf8_lossy(&buf[..got]).to_string();
                if let Some(i) = text.find("\r\n\r\n") {
                    let cl = text[..i].lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0))).unwrap_or(0);
                    if got >= i + 4 + cl { break; }
                }
            }
            let body = bodies.get(n).or(bodies.last()).unwrap().clone();
            n += 1;
            let _ = write!(c, "HTTP/1.1 200 OK\r\ncontent-type: application/x-ndjson\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}", body.len(), body);
        }
    });
    (port, h, stop)
}

fn sidecar_env(engine: &Path, port: u16) -> Vec<(String, String)> {
    vec![
        ("SOMNIA_ENGINE_CMD".into(), serde_json::to_string(&["node", engine.to_str().unwrap()]).unwrap()),
        ("SOMNIA_ENGINE_PROVIDER".into(), "ollama".into()),
        ("SOMNIA_ENGINE_MODEL".into(), "test-model".into()),
        ("SOMNIA_ENGINE_OLLAMA_URL".into(), format!("http://127.0.0.1:{port}")),
    ]
}

#[test]
fn real_sidecar_edits_files_through_tools_and_is_committed_with_yes() {
    let Some(engine) = real_engine() else { return };
    let e = Env::new(true);
    let call = |name: &str, args: Value| serde_json::json!({"message":{"content":"","tool_calls":[{"function":{"name":name,"arguments":args}}]},"done":true,"prompt_eval_count":10,"eval_count":5}).to_string() + "\n";
    let fin = serde_json::json!({"message":{"content":"Created the page."},"done":true,"done_reason":"stop","prompt_eval_count":3,"eval_count":4}).to_string() + "\n";
    let (port, h, stop) = fake_ollama(vec![call("write_file", serde_json::json!({"path":"site/index.html","content":"<h1>hi</h1>\n"})), fin]);
    let env = sidecar_env(&engine, port);
    let envs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes", "--allow-root", "site"], &envs);
    stop.store(true, std::sync::atomic::Ordering::SeqCst);
    h.join().unwrap();
    assert_eq!(code, 0, "{v}");
    assert_eq!(v["status"], "done");
    assert_eq!(v["producer"]["provider"], "ollama");
    assert_eq!(v["producer"]["model"], "test-model");
    assert_eq!(v["usage"]["tokens"], 22);
    assert_eq!(std::fs::read_to_string(e.root().join("site/index.html")).unwrap(), "<h1>hi</h1>\n");
    assert_eq!(v["unreviewed_checkpoint"], true);
    let tid = v["task_id"].as_str().unwrap();
    let log = std::fs::read_to_string(e.root().join(format!(".somnia/sessions/{tid}.events.ndjson"))).unwrap();
    assert!(log.contains("\"event\":\"tool-call\"") && log.contains("\"name\":\"write_file\"") && log.contains("\"event\":\"tool-result\""), "{log}");
    assert!(!log.contains("<h1>hi</h1>"), "file content must not be copied into the event log");
}

#[test]
fn real_sidecar_misconfiguration_is_a_typed_failure_without_changes() {
    let Some(engine) = real_engine() else { return };
    let e = Env::new(true);
    let env = vec![("SOMNIA_ENGINE_CMD", serde_json::to_string(&["node", engine.to_str().unwrap()]).unwrap())];
    let envs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (code, v) = e.json(&["run", "build a page", "--json", "--yes"], &envs);
    assert_eq!(code, 1, "{v}");
    assert_eq!(v["error"]["kind"], "engine-unavailable");
    assert_eq!(v["error"]["details"]["engine_code"], "config");
    assert_eq!(e.git(&["status", "--porcelain"]), "");
}

#[test]
fn bare_flag_reaches_the_real_engine() {
    let Some(engine) = real_engine() else { return };
    let e = Env::new(true);
    std::fs::write(e.root().join("AGENTS.md"), "NOTES-MARKER").unwrap();
    e.git(&["add", "-A"]);
    e.git(&["-c", "user.name=Seed", "-c", "user.email=s@example.com", "commit", "-q", "-m", "notes"]);
    let fin = serde_json::json!({"message":{"content":"ok"},"done":true,"done_reason":"stop"}).to_string() + "\n";
    for (bare, want) in [(false, "project notes loaded"), (true, "bare run")] {
        let (port, h, stop) = fake_ollama(vec![fin.clone()]);
        let env = sidecar_env(&engine, port);
        let envs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
        let mut args = vec!["run", "look around", "--json"];
        if bare { args.push("--bare"); }
        let (code, v) = e.json(&args, &envs);
        stop.store(true, std::sync::atomic::Ordering::SeqCst);
        h.join().unwrap();
        assert_eq!(code, 0, "{v}");
        assert!(v["plan"].as_str().unwrap().contains(want), "{v}");
        e.git(&["switch", "-q", "main"]);
    }
}
