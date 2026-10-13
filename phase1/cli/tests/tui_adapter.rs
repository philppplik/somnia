//! Roundtrip: the real TUI protocol module (somnia_tui::protocol) against the real `somnia` binary in --tui-stdio mode.
use somnia_tui::protocol::{encode_command, parse_line, review_hash, Command as TuiCmd, Event, Hunk};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use tempfile::TempDir;

fn engine_cmd() -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-engine.mjs");
    serde_json::to_string(&["node", p.to_str().unwrap()]).unwrap()
}

struct Repo { dir: TempDir, rt: TempDir }
impl Repo {
    fn new() -> Self {
        let r = Repo { dir: tempfile::tempdir().unwrap(), rt: tempfile::tempdir().unwrap() };
        std::fs::set_permissions(r.rt.path(), std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
        r.git(&["init", "-q", "-b", "main"]);
        r.git(&["config", "user.name", "T"]);
        r.git(&["config", "user.email", "t@example.com"]);
        std::fs::create_dir_all(r.dir.path().join("site")).unwrap();
        let big: String = (1..=60).map(|i| format!("line {i}\n")).collect();
        std::fs::write(r.dir.path().join("site/big.txt"), big).unwrap();
        std::fs::write(r.dir.path().join("README.md"), "hello\n").unwrap();
        r.git(&["add", "-A"]);
        r.git(&["-c", "user.name=Seed", "-c", "user.email=s@example.com", "commit", "-q", "-m", "seed"]);
        r
    }
    fn p(&self) -> &Path { self.dir.path() }
    fn git(&self, a: &[&str]) -> String {
        let o = Command::new("git").current_dir(self.p()).args(a).env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1").output().unwrap();
        assert!(o.status.success(), "git {a:?}: {}", String::from_utf8_lossy(&o.stderr));
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    }
    fn read(&self, f: &str) -> String { std::fs::read_to_string(self.p().join(f)).unwrap() }
    fn start(&self, prompt: &str, extra: &[&str]) -> Session {
        let mut c = Command::new(env!("CARGO_BIN_EXE_somnia"));
        c.current_dir(self.p()).args(["run", prompt, "--tui-stdio"]).args(extra)
            .env("SOMNIA_ENGINE_CMD", engine_cmd()).env("XDG_RUNTIME_DIR", self.rt.path())
            .env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        let mut child = c.spawn().unwrap();
        let stdin = child.stdin.take().unwrap();
        let out = BufReader::new(child.stdout.take().unwrap());
        Session { child, stdin: Some(stdin), out, raw: vec![] }
    }
}

struct Session { child: Child, stdin: Option<ChildStdin>, out: BufReader<ChildStdout>, raw: Vec<String> }
impl Session {
    fn next(&mut self) -> Option<Event> {
        loop {
            let mut l = String::new();
            if self.out.read_line(&mut l).ok()? == 0 { return None; }
            self.raw.push(l.clone());
            // Every line must be a valid v1 frame the real TUI parser accepts.
            let v: serde_json::Value = serde_json::from_str(&l).unwrap_or_else(|e| panic!("non-json stdout line {l:?}: {e}"));
            assert_eq!(v["v"], 1, "{l}");
            if let Some(e) = parse_line(&l).unwrap() { return Some(e); }
        }
    }
    fn until<F: Fn(&Event) -> bool>(&mut self, f: F) -> Event {
        loop {
            let e = self.next().expect("stream ended before expected event");
            if f(&e) { return e; }
        }
    }
    fn send(&mut self, c: &TuiCmd) {
        let s = self.stdin.as_mut().unwrap();
        s.write_all(encode_command(c).as_bytes()).unwrap();
        s.flush().unwrap();
    }
    fn send_raw(&mut self, l: &str) {
        let s = self.stdin.as_mut().unwrap();
        writeln!(s, "{l}").unwrap();
        s.flush().unwrap();
    }
    fn finish(mut self) -> (Vec<Event>, i32) {
        self.stdin.take();
        let mut rest = vec![];
        while let Some(e) = self.next() { rest.push(e); }
        (rest, self.child.wait().unwrap().code().unwrap())
    }
}

fn proposed(s: &mut Session) -> (String, String, String, Vec<Hunk>) {
    match s.until(|e| matches!(e, Event::DiffProposed { .. })) {
        Event::DiffProposed { review_id, file, content_hash, hunks } => (review_id, file, content_hash, hunks),
        _ => unreachable!(),
    }
}
fn guard_reason(e: Event) -> String { if let Event::GuardBlocked { reason } = e { reason } else { panic!("{e:?}") } }
fn is_done(e: &Event) -> bool { matches!(e, Event::Done { .. }) }

#[test]
fn roundtrip_accept_one_reject_one_hunk() {
    let r = Repo::new();
    let base = r.git(&["rev-parse", "HEAD"]);
    let mut s = r.start("multihunk edit", &[]);
    match s.next().unwrap() {
        Event::SessionStarted { prompt, branch, base_sha, .. } => {
            assert_eq!(prompt, "multihunk edit");
            assert!(branch.starts_with("somnia/task/"));
            assert_eq!(base_sha, base);
        }
        e => panic!("first event must be session_started, got {e:?}"),
    }
    let (rid, file, hash, hunks) = proposed(&mut s);
    assert_eq!(file, "site/big.txt");
    assert_eq!(hunks.len(), 2, "{hunks:?}");
    assert!(hunks[0].lines.contains(&"+line 2 EDITED".to_string()));
    // The core's hash must equal the TUI's own formula over what it received.
    assert_eq!(hash, review_hash(&file, &hunks));
    s.send(&TuiCmd::ReviewDecision { review_id: rid, content_hash: hash, accepted_hunks: vec![hunks[0].id.clone()], rejected_hunks: vec![hunks[1].id.clone()] });
    let done = s.until(is_done);
    match done { Event::Done { status, .. } => assert_eq!(status, "done"), _ => unreachable!() }
    let (_, code) = s.finish();
    assert_eq!(code, 0);
    let t = r.read("site/big.txt");
    assert!(t.contains("line 2 EDITED"), "accepted hunk kept");
    assert!(t.contains("line 40\n") && !t.contains("line 40 EDITED"), "rejected hunk reverted");
    assert_eq!(r.git(&["rev-parse", "HEAD"]), base, "adapter never commits without --yes");
}

#[test]
fn hash_mismatch_blocks_then_correct_hash_applies() {
    let r = Repo::new();
    let mut s = r.start("multihunk edit", &[]);
    let (rid, file, hash, hunks) = proposed(&mut s);
    let all: Vec<String> = hunks.iter().map(|h| h.id.clone()).collect();
    let bad = format!("{}0", &hash[..hash.len() - 1]);
    s.send(&TuiCmd::ReviewDecision { review_id: rid.clone(), content_hash: bad, accepted_hunks: vec![], rejected_hunks: all.clone() });
    let why = guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. })));
    assert!(why.contains("hash mismatch") && why.contains(&file), "{why}");
    assert!(r.read("site/big.txt").contains("line 40 EDITED"), "blocked decision must not touch the worktree");
    // Still pending and still approvable with the real hash.
    s.send(&TuiCmd::ReviewDecision { review_id: rid, content_hash: hash, accepted_hunks: vec![], rejected_hunks: all });
    s.until(is_done);
    assert!(!r.read("site/big.txt").contains("EDITED"), "everything rejected -> original content");
    assert_eq!(r.read("site/big.txt").lines().count(), 60);
}

#[test]
fn worktree_changed_after_proposal_is_not_approvable() {
    let r = Repo::new();
    let mut s = r.start("multihunk edit", &[]);
    let (rid, _f, hash, hunks) = proposed(&mut s);
    let mut t = r.read("site/big.txt");
    t.push_str("sneaky\n");
    std::fs::write(r.p().join("site/big.txt"), t).unwrap();
    s.send(&TuiCmd::ReviewDecision { review_id: rid, content_hash: hash, accepted_hunks: hunks.iter().map(|h| h.id.clone()).collect(), rejected_hunks: vec![] });
    let why = guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. })));
    assert!(why.contains("changed since"), "{why}");
}

#[test]
fn incomplete_unknown_and_bad_frames_are_blocked() {
    let r = Repo::new();
    let mut s = r.start("multihunk edit", &[]);
    let (rid, _f, hash, hunks) = proposed(&mut s);
    // Missing hunk h2.
    s.send(&TuiCmd::ReviewDecision { review_id: rid.clone(), content_hash: hash.clone(), accepted_hunks: vec![hunks[0].id.clone()], rejected_hunks: vec![] });
    assert!(guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. }))).contains("every proposed hunk"));
    // Unknown review id.
    s.send(&TuiCmd::ReviewDecision { review_id: "nope".into(), content_hash: hash.clone(), accepted_hunks: vec![], rejected_hunks: vec![] });
    assert!(guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. }))).contains("unknown review_id"));
    // Credential-like field and wrong protocol version.
    s.send_raw(r#"{"v":1,"type":"cancelx","token":"abc"}"#);
    assert!(guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. }))).contains("credential"));
    s.send_raw(r#"{"v":2,"type":"cancel"}"#);
    assert!(guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. }))).contains("not supported"));
    // Accept everything: still works afterwards.
    s.send(&TuiCmd::ReviewDecision { review_id: rid, content_hash: hash, accepted_hunks: hunks.iter().map(|h| h.id.clone()).collect(), rejected_hunks: vec![] });
    s.until(is_done);
    assert!(r.read("site/big.txt").contains("line 40 EDITED"));
}

#[test]
fn rejecting_a_new_file_removes_it() {
    let r = Repo::new();
    let mut s = r.start("build a page", &[]);
    let (rid, file, hash, hunks) = proposed(&mut s);
    assert_eq!(file, "site/index.html");
    assert_eq!(hunks.len(), 1);
    s.send(&TuiCmd::ReviewDecision { review_id: rid, content_hash: hash, accepted_hunks: vec![], rejected_hunks: vec![hunks[0].id.clone()] });
    s.until(is_done);
    assert!(!r.p().join("site/index.html").exists());
    assert_eq!(r.git(&["status", "--porcelain"]), "", "index and worktree clean after full rejection");
}

#[test]
fn cancel_during_review_ends_needs_input_without_applying() {
    let r = Repo::new();
    let mut s = r.start("multihunk edit", &[]);
    proposed(&mut s);
    s.send(&TuiCmd::Cancel);
    match s.until(is_done) { Event::Done { status, summary, .. } => { assert_eq!(status, "needs_input"); assert!(summary.contains("uncommitted")); } _ => unreachable!() }
    let (_, code) = s.finish();
    assert_eq!(code, 2);
    assert!(r.read("site/big.txt").contains("line 40 EDITED"));
}

#[test]
fn needs_input_failure_and_yes_map_to_done_statuses() {
    let r = Repo::new();
    let mut s = r.start("ask me", &[]);
    match s.until(|e| matches!(e, Event::NeedsInput { .. })) { Event::NeedsInput { question } => assert_eq!(question, "which page?"), _ => unreachable!() }
    match s.until(is_done) { Event::Done { status, .. } => assert_eq!(status, "needs_input"), _ => unreachable!() }
    assert_eq!(s.finish().1, 2);

    let r = Repo::new();
    let mut s = r.start("please fail", &[]);
    match s.until(is_done) { Event::Done { status, summary, .. } => { assert_eq!(status, "failed"); assert!(summary.contains("engine exploded")); } _ => unreachable!() }
    assert_eq!(s.finish().1, 1);

    let r = Repo::new();
    let mut s = r.start("build a page", &["--yes"]);
    match s.until(is_done) { Event::Done { status, result_sha, .. } => { assert_eq!(status, "done"); assert_eq!(result_sha, r.git(&["rev-parse", "HEAD"])); } _ => unreachable!() }
    assert_eq!(s.finish().1, 0);
}

#[test]
fn review_required_guard_maps_to_guard_blocked() {
    let r = Repo::new();
    let mut s = r.start("outside the roots", &["--yes", "--allow-root", "site"]);
    let why = guard_reason(s.until(|e| matches!(e, Event::GuardBlocked { .. })));
    assert!(why.contains("outside the allowed roots"), "{why}");
    match s.until(is_done) { Event::Done { status, .. } => assert_eq!(status, "needs_input"), _ => unreachable!() }
    assert_eq!(s.finish().1, 2);
    assert!(r.git(&["branch", "--list", "somnia/*"]).contains("somnia/task/"));
}

#[test]
fn stdout_carries_only_protocol_frames_on_preflight_failure() {
    let r = Repo::new();
    std::fs::write(r.p().join("README.md"), "dirty\n").unwrap();
    let mut s = r.start("build a page", &[]);
    match s.until(is_done) { Event::Done { status, .. } => assert_eq!(status, "failed"), _ => unreachable!() }
    let (_, code) = s.finish();
    assert_eq!(code, 1);
}
