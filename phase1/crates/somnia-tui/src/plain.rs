//! Plain (non-TTY) mode: no raw mode, no alternate screen, no ANSI. One line of text per event, safe for pipes,
//! CI logs and files. Review needs a human with a terminal, so a proposed diff is listed and left pending: the
//! run is cancelled and exits with code 2 (needs input); nothing is ever approved implicitly.
use crate::app::{App, RunState};
use crate::protocol::*;
use crate::snapshot::exit_snapshot;
use crate::brand::ColorMode;
use crate::source::{Core, Msg};
use std::io::Write;
use std::time::Duration;

/// Render one event as plain text lines (already sanitized, never contains control characters except none).
pub fn event_lines(ev: &Event) -> Vec<String> {
    let s = |x: &str| sanitize(x).replace('\n', " ");
    match ev {
        Event::SessionStarted { task_id, prompt, branch, base_sha, model } => {
            let mut v = vec![format!("session {} started", s(task_id)), format!("task: {}", s(prompt))];
            if !branch.is_empty() { v.push(format!("branch: {}", s(branch))); }
            if !base_sha.is_empty() { v.push(format!("base: {}", s(base_sha).chars().take(8).collect::<String>())); }
            if !model.is_empty() { v.push(format!("model: {}", s(model))); }
            v
        }
        Event::TextDelta { text } => sanitize(text).split('\n').filter(|l| !l.is_empty()).map(String::from).collect(),
        Event::ToolCall { name, summary, .. } => vec![format!("> {} {}", s(name), s(summary)).trim_end().to_string()],
        Event::ToolResult { status, summary, .. } => vec![format!("  {} {}", if status == "ok" { "ok" } else { "error" }, s(summary)).trim_end().to_string()],
        Event::DiffProposed { file, hunks, .. } => {
            let mut v = vec![format!("review needed: {} ({} hunks)", s(file), hunks.len())];
            for h in hunks {
                v.push(format!("  {} {}", s(&h.id), s(&h.header)));
                for l in &h.lines { v.push(format!("    {}", s(l))); }
            }
            v
        }
        Event::GuardBlocked { reason } => vec![format!("blocked: {}", s(reason))],
        Event::Status { cost_usd, tokens, branch, state } => {
            let mut parts = vec![];
            if !state.is_empty() { parts.push(format!("state {}", s(state))); }
            if *tokens > 0 || *cost_usd > 0.0 { parts.push(format!("${cost_usd:.4}, {tokens} tokens")); }
            if !branch.is_empty() { parts.push(format!("branch {}", s(branch))); }
            if parts.is_empty() { vec![] } else { vec![format!("status: {}", parts.join(" | "))] }
        }
        Event::NeedsInput { question } => vec![format!("needs input: {}", s(question))],
        Event::Done { status, summary, .. } => {
            let mut l = format!("done: {}", s(status));
            if !summary.is_empty() { l.push_str(&format!(" - {}", s(summary))); }
            vec![l]
        }
    }
}

/// Drive a core to completion without a terminal. Returns the process exit code.
pub fn run_plain<W: Write>(core: &mut Core, out: &mut W) -> i32 {
    let mut app = App::new();
    let mut cancelled = false;
    loop {
        match core.rx.recv_timeout(Duration::from_secs(60)) {
            Ok(Msg::Ev(e)) => {
                for l in event_lines(&e) { let _ = writeln!(out, "{l}"); }
                let is_review = matches!(e, Event::DiffProposed { .. });
                app.apply_raw(e);
                if is_review && !cancelled {
                    let _ = writeln!(out, "no terminal: review left pending, cancelling (run `somnia-tui` in a terminal to decide)");
                    core.send(&Command::Cancel);
                    cancelled = true;
                }
            }
            Ok(Msg::BadLine(e)) => { let _ = writeln!(out, "protocol error: {}", sanitize(&e)); app.protocol_error = Some(e); }
            Ok(Msg::Closed) | Err(_) => break,
        }
        let _ = out.flush();
    }
    if !app.finished() && !matches!(app.state, RunState::NeedsInput | RunState::WaitingReview) {
        let _ = writeln!(out, "core closed before finishing");
        app.state = RunState::Failed;
    }
    let _ = write!(out, "{}", exit_snapshot(&app, ColorMode::Mono));
    app.exit_code()
}
