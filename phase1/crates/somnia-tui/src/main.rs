use crossterm::event::{self, Event as CEvent, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::backend::{CrosstermBackend, TestBackend};
use ratatui::Terminal;
use serde_json::Value;
use somnia_tui::app::*;
use somnia_tui::brand::*;
use somnia_tui::protocol::*;
use somnia_tui::snapshot::exit_snapshot;
use somnia_tui::source::*;
use somnia_tui::ui::*;
use std::io::{stdout, IsTerminal};
use std::time::Duration;

const USAGE: &str = "somnia-tui: run + watch + approve\n\nUSAGE:\n  somnia-tui [--light] [--no-color] -- <headless core command...>\n  somnia-tui --demo\n  somnia-tui --replay FILE.ndjson\n  somnia-tui --capture DIR     write demo screenshots (ansi + txt) and exit\n  somnia-tui --version\n\nThe core command must speak NDJSON protocol v1 on stdio. Exit codes: 0 done, 1 failed, 2 needs input.\n";

fn mode() -> ColorMode {
    detect_color_mode(
        std::env::var_os("NO_COLOR").is_some(),
        &std::env::var("COLORTERM").unwrap_or_default(),
        &std::env::var("TERM").unwrap_or_default(),
        stdout().is_terminal(),
    )
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut cm = mode();
    let mut light = false;
    let mut core_argv: Vec<String> = vec![];
    let mut demo = false;
    let mut replay: Option<String> = None;
    let mut capture: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--version" | "-V" => {
                // Splash on a human terminal; plain version line for pipes/machines.
                if stdout().is_terminal() { print!("{}", ansi(&SPLASH, cm)); }
                println!("somnia-tui {}", env!("CARGO_PKG_VERSION"));
                return;
            }
            "--help" | "-h" => { print!("{USAGE}"); return; }
            "--light" => light = true,
            "--no-color" => cm = ColorMode::Mono,
            "--demo" => demo = true,
            "--replay" => { i += 1; replay = args.get(i).cloned(); }
            "--capture" => { i += 1; capture = args.get(i).cloned(); }
            "--" => { core_argv = args[i + 1..].to_vec(); break; }
            other => { eprintln!("unknown argument: {other}\n{USAGE}"); std::process::exit(64); }
        }
        i += 1;
    }
    if let Some(dir) = capture { capture_screens(&dir, light); return; }
    let mut core = if demo {
        Core::replay(demo_script(), Duration::from_millis(450))
    } else if let Some(p) = replay {
        let txt = std::fs::read_to_string(&p).unwrap_or_else(|e| { eprintln!("cannot read {p}: {e}"); std::process::exit(66) });
        Core::replay(txt.lines().map(String::from).collect(), Duration::from_millis(300))
    } else if !core_argv.is_empty() {
        Core::spawn(&core_argv).unwrap_or_else(|e| { eprintln!("cannot start core: {e}"); std::process::exit(69) })
    } else {
        eprint!("{USAGE}");
        std::process::exit(64);
    };
    let th = if cm == ColorMode::Mono { Theme::mono() } else if light { Theme::light() } else { Theme::dark() };
    let mut app = App::new();
    let res = run(&mut app, &mut core, cm, &th, demo);
    print!("{}", exit_snapshot(&app, cm));
    if let Err(e) = res { eprintln!("terminal error: {e}"); std::process::exit(1); }
    std::process::exit(app.exit_code());
}

fn run(app: &mut App, core: &mut Core, cm: ColorMode, th: &Theme, demo: bool) -> std::io::Result<()> {
    enable_raw_mode()?;
    execute!(stdout(), EnterAlternateScreen)?;
    let mut term = Terminal::new(CrosstermBackend::new(stdout()))?;
    let mut closed = false;
    let mut finish_queued = false;
    let r = (|| -> std::io::Result<()> {
        loop {
            while let Ok(m) = core.rx.try_recv() {
                match m {
                    Msg::Ev(e) => app.apply_raw(e),
                    Msg::BadLine(e) => app.protocol_error = Some(e),
                    Msg::Closed => closed = true,
                }
            }
            if closed && !app.finished() && app.review.is_none() && app.state != RunState::NeedsInput && !demo {
                app.state = RunState::Failed;
                app.protocol_error.get_or_insert("core closed before finishing".into());
            }
            app.spinner = app.spinner.wrapping_add(1);
            term.draw(|f| render(f, app, cm, th))?;
            if event::poll(Duration::from_millis(120))? {
                if let CEvent::Key(k) = event::read()? {
                    if k.kind != KeyEventKind::Press { continue; }
                    let ctrl = k.modifiers.contains(KeyModifiers::CONTROL);
                    let (mut ch, mut enter, mut esc, mut up, mut down) = (' ', false, false, false, false);
                    match k.code {
                        KeyCode::Char(c) => ch = c,
                        KeyCode::Enter => enter = true,
                        KeyCode::Esc => esc = true,
                        KeyCode::Up => up = true,
                        KeyCode::Down => down = true,
                        _ => {}
                    }
                    let was_review = app.review.is_some();
                    match app.on_key(ch, ctrl, enter, esc, up, down) {
                        Action::Quit => return Ok(()),
                        Action::Send(c) => {
                            let cancel = c == Command::Cancel;
                            core.send(&c);
                            if cancel && (demo || closed) { return Ok(()); }
                            if was_review && demo && !finish_queued && !cancel {
                                finish_queued = true;
                                *core = Core::replay(demo_finish(), Duration::from_millis(400));
                                closed = false;
                            }
                        }
                        Action::None => {}
                    }
                }
            }
            if app.finished() && closed && !event::poll(Duration::from_millis(0))? && !demo { }
        }
    })();
    disable_raw_mode()?;
    execute!(stdout(), LeaveAlternateScreen)?;
    r
}

fn capture_screens(dir: &str, light: bool) {
    std::fs::create_dir_all(dir).unwrap();
    let th = if light { Theme::light() } else { Theme::dark() };
    let cm = ColorMode::TrueColor;
    let suffix = if light { "light" } else { "dark" };
    let save = |name: &str, app: &App, w: u16, h: u16| {
        let mut t = Terminal::new(TestBackend::new(w, h)).unwrap();
        t.draw(|f| render(f, app, cm, &th)).unwrap();
        let buf = t.backend().buffer().clone();
        std::fs::write(format!("{dir}/{name}-{suffix}.txt"), buffer_text(&buf)).unwrap();
        std::fs::write(format!("{dir}/{name}-{suffix}.ansi"), buffer_ansi(&buf)).unwrap();
    };
    // splash
    {
        let mut t = Terminal::new(TestBackend::new(70, 11)).unwrap();
        t.draw(|f| {
            let mut l = vec![ratatui::text::Line::raw("")];
            l.extend(splash_lines(cm));
            l.push(ratatui::text::Line::raw(""));
            l.push(ratatui::text::Line::styled("   design studio · agent CLI · local-first", ratatui::style::Style::default().fg(th.dim)));
            f.render_widget(ratatui::widgets::Paragraph::new(l), f.area());
        }).unwrap();
        let b = t.backend().buffer().clone();
        std::fs::write(format!("{dir}/splash-{suffix}.txt"), buffer_text(&b)).unwrap();
        std::fs::write(format!("{dir}/splash-{suffix}.ansi"), buffer_ansi(&b)).unwrap();
    }
    let script = demo_script();
    let mut app = App::new();
    for (n, l) in script.iter().enumerate() {
        if let Some(e) = parse_line(l).unwrap() { app.apply_raw(e); }
        if n == 6 { save("running", &app, 100, 28); }
    }
    save("review", &app, 100, 28);
    // blocked by unsaved-buffer guard
    let mut b = app.clone();
    b.apply(Event::GuardBlocked { reason: "index.html has unsaved changes in the Somnia desktop editor".into() });
    save("guard-blocked", &b, 100, 28);
    // decide + submit
    app.on_key('A', false, false, false, false, false);
    save("review-decided", &app, 100, 28);
    let act = app.on_key(' ', false, true, false, false, false);
    assert!(matches!(act, Action::Send(_)));
    for l in demo_finish() { if let Some(e) = parse_line(&l).unwrap() { app.apply_raw(e); } }
    save("done", &app, 100, 28);
    std::fs::write(format!("{dir}/exit-snapshot-{suffix}.ansi"), exit_snapshot(&app, cm)).unwrap();
    let plain = exit_snapshot(&app, ColorMode::Mono);
    std::fs::write(format!("{dir}/exit-snapshot-{suffix}.txt"), plain).unwrap();
    let _: Value = Value::Null;
}
