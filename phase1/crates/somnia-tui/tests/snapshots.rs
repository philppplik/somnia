//! Golden screen snapshots rendered with ratatui's TestBackend (plain text, mono theme), plus non-TTY checks.
//! Regenerate goldens with `UPDATE_SNAPSHOTS=1 cargo test --test snapshots` and review the diff.
use ratatui::{backend::TestBackend, Terminal};
use somnia_tui::app::*;
use somnia_tui::brand::ColorMode;
use somnia_tui::plain::{event_lines, run_plain};
use somnia_tui::protocol::*;
use somnia_tui::source::{demo_finish, demo_script, Core};
use somnia_tui::ui::{buffer_text, render, Theme};
use std::path::PathBuf;

fn feed(app: &mut App, lines: &[String]) {
    for l in lines {
        if let Some(e) = parse_line(l).unwrap() { app.apply_raw(e); }
    }
}

fn screen(app: &App, w: u16, h: u16) -> String {
    let mut t = Terminal::new(TestBackend::new(w, h)).unwrap();
    t.draw(|f| render(f, app, ColorMode::Mono, &Theme::mono())).unwrap();
    buffer_text(t.backend().buffer())
}

fn check(name: &str, got: &str) {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots").join(format!("{name}.txt"));
    if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
        std::fs::write(&p, got).unwrap();
        return;
    }
    let want = std::fs::read_to_string(&p).unwrap_or_else(|_| panic!("missing snapshot {}; run with UPDATE_SNAPSHOTS=1", p.display()));
    assert_eq!(got, want, "snapshot {name} changed (UPDATE_SNAPSHOTS=1 to accept)");
}

fn ev(v: serde_json::Value) -> String { v.to_string() }

#[test]
fn snapshot_running_and_stream() {
    let mut app = App::new();
    let s = demo_script();
    feed(&mut app, &s[..6]);
    app.spinner = 0;
    check("running", &screen(&app, 100, 24));
}

#[test]
fn snapshot_review_pending_and_decided() {
    let mut app = App::new();
    feed(&mut app, &demo_script());
    assert!(app.review.is_some());
    check("review-pending", &screen(&app, 100, 28));
    app.on_key('j', false, false, false, false, false);
    app.on_key('A', false, false, false, false, false);
    check("review-decided", &screen(&app, 100, 28));
}

#[test]
fn snapshot_guard_blocked_and_hash_mismatch() {
    let mut app = App::new();
    feed(&mut app, &demo_script());
    let mut g = app.clone();
    g.apply(Event::GuardBlocked { reason: "index.html has unsaved changes in the Somnia desktop editor".into() });
    check("guard-blocked", &screen(&g, 100, 28));
    let mut bad = App::new();
    let mut lines = demo_script();
    let last = lines.len() - 1;
    lines[last] = lines[last].replace("Welcome", "Welcome").replacen("\"content_hash\":\"", "\"content_hash\":\"00", 1);
    feed(&mut bad, &lines);
    assert!(!bad.review.as_ref().unwrap().hash_ok);
    check("hash-mismatch", &screen(&bad, 100, 28));
}

#[test]
fn snapshot_needs_input_done_failed() {
    let mut app = App::new();
    feed(&mut app, &[
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-1","prompt":"Fix the nav","branch":"somnia/task/t-1","base_sha":"8d552f36aa","model":"local"})),
        ev(serde_json::json!({"v":1,"type":"needs_input","question":"Which page should I change?"})),
    ]);
    check("needs-input", &screen(&app, 90, 18));
    let mut done = App::new();
    feed(&mut done, &demo_script());
    done.on_key('A', false, false, false, false, false);
    done.on_key(' ', false, true, false, false, false);
    feed(&mut done, &demo_finish());
    check("done", &screen(&done, 100, 24));
    let mut failed = App::new();
    feed(&mut failed, &[
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-2","prompt":"Break things"})),
        ev(serde_json::json!({"v":1,"type":"done","status":"failed","summary":"engine exited with status 3"})),
    ]);
    check("failed", &screen(&failed, 90, 16));
}

#[test]
fn snapshot_tiny_terminal_does_not_panic_and_has_no_escapes() {
    let mut app = App::new();
    feed(&mut app, &demo_script());
    for (w, h) in [(1, 1), (10, 3), (40, 8), (60, 12)] {
        let s = screen(&app, w, h);
        assert!(!s.contains('\x1b'));
    }
}

#[test]
fn plain_lines_are_ansi_free_even_for_hostile_text() {
    let evs = [
        Event::TextDelta { text: "hello \x1b[31mred\x1b[0m\x07 world\nsecond".into() },
        Event::ToolCall { id: "1".into(), name: "read\x1b]0;x\x07".into(), summary: "a\nb".into() },
        Event::NeedsInput { question: "q\x1b[2J".into() },
    ];
    for e in evs {
        for l in event_lines(&e) {
            assert!(!l.chars().any(|c| c.is_control()), "control char in {l:?}");
        }
    }
}

#[test]
fn plain_run_over_demo_lists_review_leaves_it_pending_and_exits_2() {
    let mut core = Core::replay(demo_script(), std::time::Duration::from_millis(1));
    let mut out: Vec<u8> = vec![];
    let code = run_plain(&mut core, &mut out);
    let text = String::from_utf8(out).unwrap();
    assert!(!text.contains('\x1b'), "{text}");
    assert!(text.contains("review needed: index.html (2 hunks)"), "{text}");
    assert!(text.contains("review left pending"), "{text}");
    assert_eq!(code, 2);
}

#[test]
fn plain_run_done_exits_0_and_failed_exits_1() {
    let mut core = Core::replay(vec![
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t","prompt":"p"})),
        ev(serde_json::json!({"v":1,"type":"done","status":"done","result_sha":"abc","summary":"ok"})),
    ], std::time::Duration::from_millis(1));
    let mut out = vec![];
    assert_eq!(run_plain(&mut core, &mut out), 0);
    let mut core = Core::replay(vec![ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t","prompt":"p"}))], std::time::Duration::from_millis(1));
    let mut out = vec![];
    assert_eq!(run_plain(&mut core, &mut out), 1);
    assert!(String::from_utf8(out).unwrap().contains("core closed before finishing"));
}

#[test]
fn binary_without_tty_prints_plain_text_only() {
    // Cargo runs tests without a controlling terminal on stdout, so the binary must pick plain mode.
    let o = std::process::Command::new(env!("CARGO_BIN_EXE_somnia-tui"))
        .arg("--demo").stdin(std::process::Stdio::null()).output().unwrap();
    let out = String::from_utf8_lossy(&o.stdout);
    assert!(!out.contains('\x1b'), "ANSI leaked into non-tty output: {out:?}");
    assert!(out.contains("review needed"));
    assert_eq!(o.status.code(), Some(2));
}

fn asking_app(can_answer: bool) -> App {
    let mut app = App::new();
    let caps: Vec<&str> = if can_answer { vec!["answer"] } else { vec![] };
    feed(&mut app, &[
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-1","prompt":"Fix the nav","branch":"somnia/task/t-1","base_sha":"8d552f36aa","model":"local","capabilities":caps})),
        ev(serde_json::json!({"v":1,"type":"needs_input","question":"Which page should I change?"})),
    ]);
    app
}

#[test]
fn answer_flow_types_edits_and_sends() {
    let mut app = asking_app(true);
    assert!(app.answering());
    for c in "pricx".chars() { assert!(app.on_text(c)); }
    assert_eq!(app.on_key_ex(' ', false, false, false, false, false, true), Action::None); // backspace
    for c in "ing page".chars() { assert!(app.on_text(c)); }
    check("answering", &screen(&app, 90, 18));
    // Empty or whitespace-only answers are never sent.
    let mut empty = asking_app(true);
    empty.on_text(' ');
    assert_eq!(empty.on_key_ex(' ', false, true, false, false, false, false), Action::None);
    // Esc clears the draft, Enter sends the trimmed text and resumes the run.
    let mut esc = asking_app(true);
    esc.on_text('x');
    esc.on_key_ex(' ', false, false, true, false, false, false);
    assert_eq!(esc.answer, "");
    match app.on_key_ex(' ', false, true, false, false, false, false) {
        Action::Send(Command::Answer { text }) => assert_eq!(text, "pricing page"),
        a => panic!("{a:?}"),
    }
    assert_eq!(app.state, RunState::Running);
    assert!(!app.awaiting_answer && app.question.is_none());
    assert!(matches!(app.entries.last(), Some(Entry::Notice(n)) if n.contains("pricing page")));
}

#[test]
fn legacy_core_or_finished_run_never_enters_answer_mode() {
    let legacy = asking_app(false);
    assert!(!legacy.answering());
    let mut l = legacy.clone();
    assert!(!l.on_text('x'), "typing must not be swallowed without the capability");
    // q still cancels like before.
    assert_eq!(l.on_key('q', false, false, false, false, false), Action::Send(Command::Cancel));
    let mut app = asking_app(true);
    feed(&mut app, &[ev(serde_json::json!({"v":1,"type":"done","status":"needs_input","summary":"agent needs input"}))]);
    assert!(!app.answering(), "done ends the question");
    assert_eq!(app.exit_code(), 2);
}

#[test]
fn ctrl_c_cancels_while_answering() {
    let mut app = asking_app(true);
    assert_eq!(app.on_key('c', true, false, false, false, false), Action::Send(Command::Cancel));
}

#[test]
fn new_commands_encode_as_v1_ndjson() {
    let h = encode_command(&Command::Hello { capabilities: vec!["answer".into()] });
    assert_eq!(h, "{\"capabilities\":[\"answer\"],\"type\":\"hello\",\"v\":1}\n");
    let a = encode_command(&Command::Answer { text: "a \"b\"\nc".into() });
    let v: serde_json::Value = serde_json::from_str(a.trim()).unwrap();
    assert_eq!((v["type"].as_str(), v["v"].as_u64(), v["text"].as_str()), (Some("answer"), Some(1), Some("a \"b\"\nc")));
    assert_eq!(a.matches('\n').count(), 1, "one frame, one line");
}

#[test]
fn reannounced_session_without_capabilities_keeps_answer_mode() {
    let mut app = App::new();
    feed(&mut app, &[
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-1","prompt":"p","capabilities":["answer"]})),
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-1","prompt":"p","model":"m"})),
        ev(serde_json::json!({"v":1,"type":"needs_input","question":"q?"})),
    ]);
    assert!(app.answering());
}
