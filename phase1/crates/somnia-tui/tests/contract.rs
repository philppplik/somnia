use somnia_tui::app::*;
use somnia_tui::brand::*;
use somnia_tui::protocol::*;
use somnia_tui::snapshot::exit_snapshot;
use somnia_tui::source::*;
use somnia_tui::ui::*;
use ratatui::{backend::TestBackend, Terminal};

fn feed(app: &mut App, lines: Vec<String>) {
    for l in lines {
        if let Some(e) = parse_line(&l).unwrap() { app.apply_raw(e); }
    }
}
fn key(app: &mut App, c: char) -> Action { app.on_key(c, false, false, false, false, false) }
fn enter(app: &mut App) -> Action { app.on_key(' ', false, true, false, false, false) }

#[test]
fn gradient_hits_brand_stops() {
    assert_eq!(gradient_at(0.0), (0x00, 0x2A, 0xFF));
    assert_eq!(gradient_at(0.5), (0xEE, 0x00, 0xFF));
    assert_eq!(gradient_at(1.0), (0xFF, 0x00, 0x1E));
}

#[test]
fn color_detection_and_mono_fallback() {
    assert_eq!(detect_color_mode(false, "truecolor", "xterm", true), ColorMode::TrueColor);
    assert_eq!(detect_color_mode(false, "", "xterm-256color", true), ColorMode::Ansi256);
    assert_eq!(detect_color_mode(true, "truecolor", "xterm", true), ColorMode::Mono);
    assert_eq!(detect_color_mode(false, "truecolor", "xterm", false), ColorMode::Mono);
    assert_eq!(detect_color_mode(false, "", "dumb", true), ColorMode::Mono);
    assert!(!ansi(&SPLASH, ColorMode::Mono).contains('\x1b'));
    assert!(ansi(&SPLASH, ColorMode::TrueColor).contains("38;2;0;42;255"));
}

#[test]
fn wordmarks_are_rectangular() {
    for rows in [&SPLASH[..], &COMPACT[..]] {
        let w = rows[0].chars().count();
        assert!(rows.iter().all(|r| r.chars().count() == w), "ragged wordmark");
    }
}

#[test]
fn unknown_events_ignored_bad_version_rejected() {
    assert_eq!(parse_line(r#"{"v":1,"type":"future_thing","x":1}"#).unwrap(), None);
    assert_eq!(parse_line("   ").unwrap(), None);
    assert!(parse_line(r#"{"v":2,"type":"text_delta","text":"x"}"#).is_err());
    assert!(parse_line("not json").is_err());
}

#[test]
fn streaming_tool_calls_and_status() {
    let mut app = App::new();
    feed(&mut app, demo_script()[..7].to_vec());
    assert_eq!(app.state, RunState::Running);
    assert!(app.entries.iter().any(|e| matches!(e, Entry::Tool { name, status: ToolStatus::Ok, .. } if name == "read_file")));
    assert!((app.cost_usd - 0.0031).abs() < 1e-9);
}

#[test]
fn terminal_escapes_in_untrusted_text_are_stripped() {
    let mut app = App::new();
    app.apply(Event::TextDelta { text: "hi\x1b]0;pwned\x07\x1b[2Jthere".into() });
    match &app.entries[0] { Entry::Text(t) => assert!(!t.contains('\x1b') && !t.contains('\x07')), _ => panic!() }
}

#[test]
fn review_roundtrip_binds_hash_and_encodes_decision() {
    let mut app = App::new();
    feed(&mut app, demo_script());
    assert_eq!(app.state, RunState::WaitingReview);
    assert!(app.review.as_ref().unwrap().hash_ok);
    // cannot submit with undecided hunks
    assert_eq!(enter(&mut app), Action::None);
    key(&mut app, 'a'); // h1 accept, cursor -> h2
    key(&mut app, 'r'); // h2 reject
    match enter(&mut app) {
        Action::Send(Command::ReviewDecision { review_id, content_hash, accepted_hunks, rejected_hunks }) => {
            assert_eq!(review_id, "rv-1");
            assert_eq!(accepted_hunks, vec!["h1"]);
            assert_eq!(rejected_hunks, vec!["h2"]);
            assert_eq!(content_hash.len(), 64);
            let line = encode_command(&Command::ReviewDecision { review_id, content_hash, accepted_hunks, rejected_hunks });
            assert!(line.contains(r#""v":1"#) && line.ends_with('\n'));
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(app.changed_files, vec!["index.html"]);
}

#[test]
fn tampered_hash_blocks_approval() {
    let mut app = App::new();
    let lines = demo_script();
    let last = lines.last().unwrap().replace("\"index.html\"", "\"index.html\"").replace("Design in the open", "Design in the closed");
    let mut v = lines[..lines.len() - 1].to_vec();
    v.push(last);
    feed(&mut app, v);
    assert!(!app.review.as_ref().unwrap().hash_ok);
    key(&mut app, 'A');
    assert_eq!(enter(&mut app), Action::None, "mismatching content hash must never be approvable");
}

#[test]
fn unsaved_buffer_guard_is_a_blocker() {
    let mut app = App::new();
    feed(&mut app, demo_script());
    app.apply(Event::GuardBlocked { reason: "index.html has unsaved changes".into() });
    key(&mut app, 'A');
    assert_eq!(enter(&mut app), Action::None);
    assert!(app.review.is_some());
}

#[test]
fn exit_codes_follow_c4() {
    let mut app = App::new();
    feed(&mut app, demo_script());
    assert_eq!(app.exit_code(), 2);
    app.state = RunState::Done; assert_eq!(app.exit_code(), 0);
    app.state = RunState::Failed; assert_eq!(app.exit_code(), 1);
}

#[test]
fn cancel_before_finish_quit_after() {
    let mut app = App::new();
    assert_eq!(app.on_key('c', true, false, false, false, false), Action::Send(Command::Cancel));
    app.state = RunState::Done;
    assert_eq!(app.on_key('q', false, false, false, false, false), Action::Quit);
}

#[test]
fn exit_snapshot_has_resume_command_and_no_ansi_in_mono() {
    let mut app = App::new();
    feed(&mut app, demo_script());
    app.on_key('A', false, false, false, false, false);
    enter(&mut app);
    feed(&mut app, demo_finish());
    let s = exit_snapshot(&app, ColorMode::Mono);
    assert!(s.contains("Resume: somnia resume t-20261010-0042"));
    assert!(s.contains("b3a91c04") && !s.contains('\x1b'));
}

#[test]
fn renders_at_small_and_large_sizes_without_panic() {
    let mut app = App::new();
    feed(&mut app, demo_script());
    for (w, h) in [(40, 12), (80, 24), (200, 60), (20, 6)] {
        let mut t = Terminal::new(TestBackend::new(w, h)).unwrap();
        t.draw(|f| render(f, &app, ColorMode::Mono, &Theme::mono())).unwrap();
    }
}

#[test]
fn spawned_core_speaks_ndjson_and_receives_decision() {
    let dir = std::env::temp_dir().join(format!("somnia-tui-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("received.txt");
    let script = format!(
        "printf '%s\\n' '{{\"v\":1,\"type\":\"session_started\",\"task_id\":\"t1\",\"prompt\":\"p\"}}'; read line; printf '%s' \"$line\" > {}; printf '%s\\n' '{{\"v\":1,\"type\":\"done\",\"status\":\"done\"}}'",
        out.display());
    let mut core = Core::spawn(&["sh".into(), "-c".into(), script]).unwrap();
    let m = core.rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
    assert!(matches!(m, Msg::Ev(Event::SessionStarted { .. })));
    core.send(&Command::Cancel);
    let m = core.rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
    assert!(matches!(m, Msg::Ev(Event::Done { .. })));
    assert!(std::fs::read_to_string(&out).unwrap().contains("\"type\":\"cancel\""));
}
