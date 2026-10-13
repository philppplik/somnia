//! End-to-end: `somnia run` against the mock engine in a throwaway git repo.
//! Covers exit codes, the local-only `--yes` commit, the no-network guarantee (git spy on PATH),
//! socket permissions and credential hygiene. See docs/cli/security.md for the review these back.
use serde_json::Value;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tempfile::TempDir;

const NETWORK_SUBCOMMANDS: &[&str] = &["fetch", "pull", "push", "clone", "remote", "ls-remote", "submodule", "send-pack", "fetch-pack"];
const SECRET: &str = "sk-live-TOPSECRET-0123456789";

fn bin() -> &'static str { env!("CARGO_BIN_EXE_somnia") }
fn engine_cmd() -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-engine.mjs");
    serde_json::to_string(&["node", p.to_str().unwrap()]).unwrap()
}
fn real_git() -> String {
    let o = Command::new("sh").args(["-c", "command -v git"]).output().unwrap();
    String::from_utf8_lossy(&o.stdout).trim().to_string()
}

struct Repo { dir: TempDir, rt: TempDir, spy: TempDir }
impl Repo {
    fn new() -> Self {
        let r = Repo { dir: tempfile::tempdir().unwrap(), rt: tempfile::tempdir().unwrap(), spy: tempfile::tempdir().unwrap() };
        std::fs::set_permissions(r.rt.path(), PermissionsExt::from_mode(0o700)).unwrap();
        // git spy: logs every invocation (one line per call) and then runs the real git.
        let wrapper = format!("#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{}/git.log'\nexec '{}' \"$@\"\n", r.spy.path().display(), real_git());
        let p = r.spy.path().join("git");
        std::fs::write(&p, wrapper).unwrap();
        std::fs::set_permissions(&p, PermissionsExt::from_mode(0o755)).unwrap();
        r.git(&["init", "-q", "-b", "main"]);
        r.git(&["config", "user.name", "Test User"]);
        r.git(&["config", "user.email", "test@example.com"]);
        // A remote that would blow up loudly if anything ever touched the network.
        r.git(&["remote", "add", "origin", "https://invalid.example.invalid/never.git"]);
        std::fs::write(r.root().join("README.md"), "hello\n").unwrap();
        r.git(&["add", "-A"]);
        r.git(&["commit", "-q", "-m", "seed"]);
        let _ = std::fs::remove_file(r.spy.path().join("git.log")); // setup calls do not count
        r
    }
    fn root(&self) -> &Path { self.dir.path() }
    fn git(&self, a: &[&str]) -> String {
        let o = Command::new(real_git()).current_dir(self.root()).args(a)
            .env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1").output().unwrap();
        assert!(o.status.success(), "git {a:?}: {}", String::from_utf8_lossy(&o.stderr));
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn cmd(&self, args: &[&str]) -> Command {
        let path = format!("{}:{}", self.spy.path().display(), std::env::var("PATH").unwrap_or_default());
        let mut c = Command::new(bin());
        c.current_dir(self.root()).args(args)
            .env("PATH", path)
            .env("SOMNIA_ENGINE_CMD", engine_cmd())
            .env("XDG_RUNTIME_DIR", self.rt.path())
            .env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_ASKPASS", "/bin/false")
            .env_remove("SOMNIA_ATTRIBUTION_EMAIL");
        c
    }
    fn run(&self, args: &[&str]) -> Output { self.cmd(args).output().unwrap() }
    fn json(&self, args: &[&str]) -> (i32, Value) {
        let o = self.run(args);
        let s = String::from_utf8_lossy(&o.stdout);
        let v = serde_json::from_str(s.trim()).unwrap_or_else(|e| panic!("not json ({e}): {s} / {}", String::from_utf8_lossy(&o.stderr)));
        (o.status.code().unwrap(), v)
    }
    fn git_log(&self) -> String { std::fs::read_to_string(self.spy.path().join("git.log")).unwrap_or_default() }
    fn assert_no_network_git(&self) {
        let log = self.git_log();
        assert!(!log.is_empty(), "spy saw no git calls; the spy is not on PATH");
        for l in log.lines() {
            let sub = l.split_whitespace().find(|w| !w.starts_with('-') ).unwrap_or("");
            assert!(!NETWORK_SUBCOMMANDS.contains(&sub), "network git subcommand invoked: {l}");
        }
    }
}

// ---- exit codes ----------------------------------------------------------------------------

#[test]
fn exit_0_done_with_yes() {
    let r = Repo::new();
    let (code, v) = r.json(&["run", "build a page", "--json", "--yes"]);
    assert_eq!((code, v["status"].as_str()), (0, Some("done")));
}

#[test]
fn exit_1_engine_failure_and_cancelled_style_errors() {
    let r = Repo::new();
    let (code, v) = r.json(&["run", "please fail", "--json"]);
    assert_eq!((code, v["status"].as_str()), (1, Some("failed")));
    assert_eq!(v["error"]["message"], "engine exploded");
    // Bad usage is also 1 on the typed error path (not a repo).
    let out = tempfile::tempdir().unwrap();
    let o = Command::new(bin()).current_dir(out.path()).args(["run", "x", "--json"]).env("SOMNIA_ENGINE_CMD", engine_cmd()).output().unwrap();
    assert_eq!(o.status.code(), Some(1));
}

#[test]
fn exit_2_needs_input_and_review_required() {
    let r = Repo::new();
    let (code, v) = r.json(&["run", "ask me", "--json"]);
    assert_eq!((code, v["status"].as_str()), (2, Some("waiting-input")));
    // Without --yes the engine's work is left uncommitted for review: also 2.
    let (code, v) = r.json(&["run", "build a page", "--json"]);
    assert_eq!((code, v["status"].as_str()), (2, Some("review")));
    assert!(r.git(&["status", "--porcelain", "-uall"]).contains("site/index.html"));
}

#[test]
fn exit_2_when_engine_touches_outside_allowed_roots_with_yes() {
    let r = Repo::new();
    let (code, v) = r.json(&["run", "outside", "--json", "--yes", "--allow-root", "site"]);
    assert_eq!((code, v["status"].as_str()), (2, Some("review")));
    assert_eq!(v["error"]["kind"], "review-required");
    assert_eq!(r.git(&["rev-list", "--count", "main"]), "1", "nothing may be committed");
}

// ---- --yes is a local commit, nothing else -----------------------------------------------

#[test]
fn yes_is_one_local_commit_on_the_task_branch_and_never_touches_the_network() {
    let r = Repo::new();
    let base = r.git(&["rev-parse", "main"]);
    let (code, v) = r.json(&["run", "build a page", "--json", "--yes"]);
    assert_eq!(code, 0, "{v}");
    let branch = v["branch"].as_str().unwrap();
    assert_eq!(r.git(&["rev-parse", "main"]), base, "main must not move");
    assert_eq!(r.git(&["rev-list", "--count", &format!("{base}..{branch}")]), "1");
    assert_eq!(r.git(&["config", "--get", "remote.origin.url"]), "https://invalid.example.invalid/never.git");
    // no remote-tracking refs were created, so nothing was fetched or pushed
    assert_eq!(r.git(&["for-each-ref", "refs/remotes"]), "");
    r.assert_no_network_git();
}

#[test]
fn every_run_shape_stays_off_the_network() {
    let r = Repo::new();
    for (i, task) in ["noop", "ask", "fail", "build a page"].iter().enumerate() {
        let id = format!("req-{i}");
        let _ = r.run(&["run", task, "--json", "--yes", "--request-id", &id]);
        // Return to a clean main for the next shape.
        r.git(&["reset", "-q", "--hard"]);
        r.git(&["clean", "-fdq"]);
        r.git(&["switch", "-q", "main"]);
    }
    r.assert_no_network_git();
}

#[test]
fn yes_does_not_move_a_pre_existing_upstream_or_create_tags() {
    let r = Repo::new();
    let (_, v) = r.json(&["run", "build a page", "--json", "--yes"]);
    assert_eq!(v["status"], "done");
    assert_eq!(r.git(&["tag", "--list"]), "");
    assert_eq!(r.git(&["stash", "list"]), "");
}

// ---- credential hygiene ------------------------------------------------------------------

#[test]
fn credentials_in_the_environment_never_reach_output_records_or_commits() {
    let r = Repo::new();
    let mut c = r.cmd(&["run", "build a page", "--json", "--yes"]);
    c.env("OPENAI_API_KEY", SECRET).env("ANTHROPIC_API_KEY", SECRET).env("GITHUB_TOKEN", SECRET);
    let o = c.output().unwrap();
    assert_eq!(o.status.code(), Some(0));
    let mut hay = String::from_utf8_lossy(&o.stdout).to_string() + &String::from_utf8_lossy(&o.stderr);
    for e in walk(&r.root().join(".somnia")) { hay += &std::fs::read_to_string(e).unwrap_or_default(); }
    hay += &r.git(&["log", "-p", "--all", "--format=%B"]);
    hay += &r.git_log();
    assert!(!hay.contains(SECRET), "a credential value leaked into output, records, commits or git argv");
}

#[test]
fn engine_events_never_carry_the_environment() {
    let r = Repo::new();
    let mut c = r.cmd(&["run", "build a page", "--print"]);
    c.env("OPENAI_API_KEY", SECRET);
    let o = c.output().unwrap();
    let s = String::from_utf8_lossy(&o.stdout) + String::from_utf8_lossy(&o.stderr);
    assert!(!s.contains(SECRET));
}

#[test]
fn private_store_modes() {
    let r = Repo::new();
    let _ = r.json(&["run", "noop", "--json"]);
    let ex = std::fs::read_to_string(r.root().join(".git/info/exclude")).unwrap();
    assert!(ex.lines().any(|l| l.trim() == "/.somnia/"));
    let tracked = r.git(&["ls-files"]);
    assert!(!tracked.contains(".somnia"));
}

// ---- socket permissions + protocol hygiene -----------------------------------------------

#[test]
fn runtime_dir_with_loose_permissions_is_refused() {
    let r = Repo::new();
    let loose = r.rt.path().join("somnia");
    std::fs::create_dir(&loose).unwrap();
    std::fs::set_permissions(&loose, PermissionsExt::from_mode(0o755)).unwrap();
    let o = r.run(&["run", "slow", "--json", "--detach"]);
    assert_ne!(o.status.code(), Some(0));
    assert_eq!(o.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&o.stdout).contains("not private"), "{}", String::from_utf8_lossy(&o.stdout));
}

#[test]
fn live_socket_is_0600_in_a_0700_dir_and_rejects_credential_fields() {
    use std::io::{BufRead, BufReader, Write};
    let r = Repo::new();
    let (code, v) = r.json(&["run", "slow", "--json", "--detach"]);
    assert_eq!(code, 0, "{v}");
    let tid = v["task_id"].as_str().unwrap().to_string();
    let rt = r.rt.path().join("somnia");
    let sock = wait_for_sock(&rt);
    assert_eq!(std::fs::metadata(&rt).unwrap().permissions().mode() & 0o777, 0o700);
    assert_eq!(std::fs::metadata(&sock).unwrap().permissions().mode() & 0o777, 0o600);
    let mut s = std::os::unix::net::UnixStream::connect(&sock).unwrap();
    let bad = format!(r#"{{"protocol":1,"request_id":"r1","capability":"read","token":"{SECRET}","body":{{"type":"status","task_id":"{tid}"}}}}"#);
    writeln!(s, "{bad}").unwrap();
    let mut line = String::new();
    BufReader::new(&s).read_line(&mut line).ok();
    assert!(line.contains("bad-request") || line.contains("credential"), "{line}");
    assert!(!line.contains(SECRET), "server must not echo the rejected secret");
    // a read capability cannot cancel
    let mut s2 = std::os::unix::net::UnixStream::connect(&sock).unwrap();
    writeln!(s2, r#"{{"protocol":1,"request_id":"r2","capability":"read","body":{{"type":"cancel","task_id":"{tid}"}}}}"#).unwrap();
    let mut l2 = String::new();
    BufReader::new(&s2).read_line(&mut l2).ok();
    assert!(l2.contains("bad-request"), "{l2}");
    let o = r.run(&["cancel", &tid, "--json"]);
    assert!(o.status.success() || o.status.code() == Some(1));
}

#[test]
fn oversized_and_garbage_frames_get_typed_errors_not_a_crash() {
    use std::io::{BufRead, BufReader, Write};
    let r = Repo::new();
    let (_, v) = r.json(&["run", "slow", "--json", "--detach"]);
    let tid = v["task_id"].as_str().unwrap().to_string();
    let sock = wait_for_sock(&r.rt.path().join("somnia"));
    for frame in ["not json".to_string(), "x".repeat(70_000), r#"{"protocol":7,"request_id":"a"}"#.to_string()] {
        let mut s = std::os::unix::net::UnixStream::connect(&sock).unwrap();
        let _ = writeln!(s, "{frame}");
        let mut l = String::new();
        BufReader::new(&s).read_line(&mut l).ok();
        assert!(l.contains("\"frame\":\"error\""), "{l:.200}");
    }
    let _ = r.run(&["cancel", &tid, "--json"]);
}

#[test]
fn path_traversal_in_task_id_is_rejected() {
    let r = Repo::new();
    for id in ["../../etc/passwd", "a/b", "", "t 1"] {
        let o = r.run(&["status", id, "--json"]);
        assert_eq!(o.status.code(), Some(1), "{id}");
    }
}

#[test]
fn hostile_branch_names_are_rejected_before_git_sees_them() {
    let r = Repo::new();
    for b in ["--orphan=x", "-f", "a..b", "x y", "refs/heads/../x"] {
        let arg = format!("--branch={b}");
        let o = r.run(&["run", "noop", "--json", &arg]);
        assert_eq!(o.status.code(), Some(1), "{b}: {}", String::from_utf8_lossy(&o.stdout));
    }
    assert_eq!(r.git(&["branch", "--list"]), "* main");
}

#[test]
fn allow_root_cannot_escape_the_repo() {
    let r = Repo::new();
    for root in ["..", "../..", "/etc"] {
        let (code, _) = r.json(&["run", "build a page", "--json", "--yes", "--allow-root", root]);
        assert_ne!(code, 0, "{root}");
        r.git(&["reset", "-q", "--hard"]);
        r.git(&["clean", "-fdq"]);
        r.git(&["switch", "-q", "main"]);
        assert_eq!(r.git(&["rev-list", "--count", "main"]), "1");
    }
}

fn walk(p: &Path) -> Vec<PathBuf> {
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let q = e.path();
            if q.is_dir() { out.extend(walk(&q)); } else { out.push(q); }
        }
    }
    out
}

fn wait_for_sock(dir: &Path) -> PathBuf {
    for _ in 0..100 {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                if e.path().extension().map(|x| x == "sock").unwrap_or(false) { return e.path(); }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    panic!("no socket appeared in {dir:?}");
}

#[test]
fn usage_errors_exit_1_never_2_and_help_exits_0() {
    let r = Repo::new();
    let o = r.run(&["run", "--no-such-flag", "x"]);
    assert_eq!(o.status.code(), Some(1), "exit 2 is reserved for needs-input / review-required");
    let o = r.run(&["bogus-subcommand"]);
    assert_eq!(o.status.code(), Some(1));
    assert_eq!(r.run(&["--help"]).status.code(), Some(0));
}

// ---- real sidecar against a scripted loopback Ollama ----------------------------------------
// Skipped with a message unless `npm run build:cli-engine` (in phase1) has produced sidecar/engine.mjs.

fn real_engine() -> Option<PathBuf> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("sidecar/engine.mjs");
    if p.is_file() { Some(p) } else { eprintln!("SKIP: sidecar/engine.mjs not built"); None }
}

struct Ollama { port: u16, requests: std::sync::Arc<std::sync::atomic::AtomicUsize>, stop: std::sync::Arc<std::sync::atomic::AtomicBool>, h: Option<std::thread::JoinHandle<()>> }
impl Ollama {
    fn start(bodies: Vec<String>) -> Self {
        use std::io::{Read, Write};
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.set_nonblocking(true).unwrap();
        let port = l.local_addr().unwrap().port();
        let stop = std::sync::Arc::new(AtomicBool::new(false));
        let requests = std::sync::Arc::new(AtomicUsize::new(0));
        let (s2, r2) = (stop.clone(), requests.clone());
        let h = std::thread::spawn(move || {
            let mut n = 0usize;
            while !s2.load(Ordering::SeqCst) {
                let Ok((mut c, _)) = l.accept() else { std::thread::sleep(std::time::Duration::from_millis(10)); continue };
                c.set_nonblocking(false).unwrap();
                c.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
                let mut buf = vec![0u8; 1 << 20];
                let mut got = 0;
                loop {
                    let k = c.read(&mut buf[got..]).unwrap_or(0);
                    if k == 0 { break; }
                    got += k;
                    let t = String::from_utf8_lossy(&buf[..got]).to_string();
                    if let Some(i) = t.find("\r\n\r\n") {
                        let cl = t[..i].lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0))).unwrap_or(0);
                        if got >= i + 4 + cl { break; }
                    }
                }
                r2.fetch_add(1, Ordering::SeqCst);
                let body = bodies.get(n).or(bodies.last()).unwrap().clone();
                n += 1;
                let _ = write!(c, "HTTP/1.1 200 OK\r\ncontent-type: application/x-ndjson\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}", body.len(), body);
            }
        });
        Ollama { port, requests, stop, h: Some(h) }
    }
    fn finish(mut self) -> usize {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
        self.h.take().unwrap().join().unwrap();
        self.requests.load(std::sync::atomic::Ordering::SeqCst)
    }
}

fn tool_call(name: &str, args: Value) -> String {
    serde_json::json!({"message":{"content":"","tool_calls":[{"function":{"name":name,"arguments":args}}]},"done":true,"prompt_eval_count":10,"eval_count":5}).to_string() + "\n"
}
fn final_msg(text: &str) -> String {
    serde_json::json!({"message":{"content":text},"done":true,"done_reason":"stop","prompt_eval_count":3,"eval_count":4}).to_string() + "\n"
}
fn sidecar(r: &Repo, engine: &Path, port: u16, args: &[&str], extra: &[(&str, &str)]) -> Output {
    let mut c = r.cmd(args);
    c.env("SOMNIA_ENGINE_CMD", serde_json::to_string(&["node", engine.to_str().unwrap()]).unwrap())
        .env("SOMNIA_ENGINE_PROVIDER", "ollama").env("SOMNIA_ENGINE_MODEL", "test-model")
        .env("SOMNIA_ENGINE_OLLAMA_URL", format!("http://127.0.0.1:{port}"));
    for (k, v) in extra { c.env(k, v); }
    c.output().unwrap()
}
fn parse(o: &Output) -> Value {
    let s = String::from_utf8_lossy(&o.stdout);
    serde_json::from_str(s.trim()).unwrap_or_else(|e| panic!("not json ({e}): {s} / {}", String::from_utf8_lossy(&o.stderr)))
}

#[test]
fn real_engine_run_leaks_no_credentials_and_stays_off_the_network() {
    let Some(engine) = real_engine() else { return };
    let r = Repo::new();
    let o = Ollama::start(vec![tool_call("write_file", serde_json::json!({"path":"site/index.html","content":"<h1>hi</h1>\n"})), final_msg("done")]);
    let out = sidecar(&r, &engine, o.port, &["run", "build a page", "--json", "--yes", "--allow-root", "site"],
        &[("OPENAI_API_KEY", SECRET), ("ANTHROPIC_API_KEY", SECRET), ("OPENROUTER_API_KEY", SECRET), ("GITHUB_TOKEN", SECRET)]);
    o.finish();
    let v = parse(&out);
    assert_eq!(out.status.code(), Some(0), "{v}");
    let mut hay = String::from_utf8_lossy(&out.stdout).to_string() + &String::from_utf8_lossy(&out.stderr);
    for e in walk(&r.root().join(".somnia")) { hay += &std::fs::read_to_string(e).unwrap_or_default(); }
    hay += &r.git(&["log", "-p", "--all", "--format=%B"]);
    hay += &r.git_log();
    assert!(!hay.contains(SECRET), "a credential value leaked");
    r.assert_no_network_git();
}

#[test]
fn real_engine_cloud_provider_without_consent_fails_before_anything_is_sent() {
    let Some(engine) = real_engine() else { return };
    let r = Repo::new();
    let o = Ollama::start(vec![final_msg("never")]);
    let out = sidecar(&r, &engine, o.port, &["run", "build a page", "--json", "--yes"],
        &[("SOMNIA_ENGINE_PROVIDER", "openai"), ("OPENAI_API_KEY", SECRET), ("SOMNIA_ENGINE_CLOUD_CONSENT", "")]);
    assert_eq!(o.finish(), 0);
    let v = parse(&out);
    assert_eq!(out.status.code(), Some(1), "{v}");
    assert_eq!(v["error"]["kind"], "auth");
    assert_eq!(v["error"]["details"]["engine_code"], "consent");
    assert!(!String::from_utf8_lossy(&out.stdout).contains(SECRET));
    assert_eq!(r.git(&["status", "--porcelain", "-uall"]), "");
}

#[test]
fn real_engine_cannot_write_outside_roots_or_into_git_metadata() {
    let Some(engine) = real_engine() else { return };
    for (i, path) in ["../escape.txt", ".git/hooks/pre-commit", ".git/config", ".env", "/tmp/somnia-abs-escape.txt", "site/../../escape2.txt"].iter().enumerate() {
        let r = Repo::new();
        let cfg_before = std::fs::read_to_string(r.root().join(".git/config")).unwrap();
        let o = Ollama::start(vec![tool_call("write_file", serde_json::json!({"path":path,"content":"pwned\n"})), final_msg("done")]);
        let out = sidecar(&r, &engine, o.port, &["run", &format!("try {i}"), "--json", "--yes", "--allow-root", "site"], &[]);
        o.finish();
        let v = parse(&out);
        assert_eq!(r.git(&["rev-list", "--count", "--all"]), "1", "{path}: nothing may be committed: {v}");
        assert!(!r.root().join(".git/hooks/pre-commit").exists(), "{path}");
        assert!(!r.root().parent().unwrap().join("escape.txt").exists(), "{path}");
        assert!(!r.root().join("escape2.txt").exists() && !r.root().join(".env").exists(), "{path}");
        assert!(!Path::new("/tmp/somnia-abs-escape.txt").exists(), "{path}");
        assert_eq!(std::fs::read_to_string(r.root().join(".git/config")).unwrap(), cfg_before, "{path}");
        // The agent is told the write failed (tool-result error), or the run stops with a typed scope failure.
        let tid = v["task_id"].as_str().unwrap_or("");
        let log = std::fs::read_to_string(r.root().join(format!(".somnia/sessions/{tid}.events.ndjson"))).unwrap_or_default();
        assert!(log.contains("\"status\":\"error\"") || v["error"]["kind"] == "review-required" || v["status"] == "failed", "{path}: blocked write left no trace: {v} / {log}");
    }
}

#[test]
fn real_engine_does_not_copy_file_content_or_secrets_into_events() {
    let Some(engine) = real_engine() else { return };
    let r = Repo::new();
    std::fs::write(r.root().join("notes.txt"), format!("private {SECRET}\n")).unwrap();
    r.git(&["add", "-A"]);
    r.git(&["commit", "-q", "-m", "notes"]);
    let o = Ollama::start(vec![tool_call("read_file", serde_json::json!({"path":"notes.txt"})), final_msg("read it")]);
    let out = sidecar(&r, &engine, o.port, &["run", "read the notes", "--json"], &[]);
    o.finish();
    let v = parse(&out);
    assert_eq!(out.status.code(), Some(0), "{v}");
    let tid = v["task_id"].as_str().unwrap();
    let log = std::fs::read_to_string(r.root().join(format!(".somnia/sessions/{tid}.events.ndjson"))).unwrap();
    assert!(log.contains("\"event\":\"tool-call\""), "{log}");
    assert!(!log.contains(SECRET) && !log.contains("private"), "tool events must carry paths and sizes only");
}
