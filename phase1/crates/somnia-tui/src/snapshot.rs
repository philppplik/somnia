//! Exit snapshot printed after leaving the alternate screen.
use crate::app::*;
use crate::brand::*;

pub fn exit_snapshot(app: &App, mode: ColorMode) -> String {
    let mut s = String::new();
    s.push('\n');
    s.push_str(&ansi(&COMPACT, mode));
    s.push('\n');
    let status = match app.state {
        RunState::Done => "done",
        RunState::Failed => "failed",
        RunState::NeedsInput | RunState::WaitingReview => "needs input",
        _ => "interrupted",
    };
    let line = |k: &str, v: &str| format!("  {:<8}{}\n", k, v);
    s.push_str(&line("task", &app.prompt));
    s.push_str(&line("status", status));
    s.push_str(&line("branch", &app.branch));
    if !app.result_sha.is_empty() {
        s.push_str(&line("result", &format!("{} (base {})", short(&app.result_sha), short(&app.base_sha))));
    }
    s.push_str(&line("cost", &format!("${:.4}, {} tokens", app.cost_usd, app.tokens)));
    if !app.changed_files.is_empty() {
        s.push_str(&line("files", &app.changed_files.join(", ")));
    }
    if !app.summary.is_empty() {
        s.push_str(&line("summary", &app.summary));
    }
    if !app.task_id.is_empty() {
        s.push_str(&format!("\n  Resume: somnia resume {}\n", app.task_id));
    }
    s.push('\n');
    s
}

fn short(s: &str) -> String {
    s.chars().take(8).collect()
}
