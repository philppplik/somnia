//! Rendering. Uses a small token palette mirroring the app's design tokens
//! (dark surface #0F1115 / light surface #F8F9FB); terminal default fg/bg are
//! kept in mono mode.
use crate::app::*;
use crate::brand::*;
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

pub struct Theme {
    pub fg: Color,
    pub dim: Color,
    pub ok: Color,
    pub err: Color,
    pub warn: Color,
    pub add: Color,
    pub del: Color,
    pub accent: Color,
    pub border: Color,
}

impl Theme {
    pub fn dark() -> Self {
        Theme { fg: Color::Rgb(0xE6, 0xE8, 0xEE), dim: Color::Rgb(0x8A, 0x90, 0x9E), ok: Color::Rgb(0x3F, 0xB9, 0x50), err: Color::Rgb(0xFF, 0x5C, 0x6C), warn: Color::Rgb(0xE3, 0xB3, 0x41), add: Color::Rgb(0x3F, 0xB9, 0x50), del: Color::Rgb(0xFF, 0x5C, 0x6C), accent: Color::Rgb(0x6A, 0x7B, 0xFF), border: Color::Rgb(0x3A, 0x3F, 0x4B) }
    }
    pub fn light() -> Self {
        Theme { fg: Color::Rgb(0x1A, 0x1D, 0x24), dim: Color::Rgb(0x5F, 0x66, 0x75), ok: Color::Rgb(0x1A, 0x7F, 0x37), err: Color::Rgb(0xCF, 0x22, 0x2E), warn: Color::Rgb(0x9A, 0x67, 0x00), add: Color::Rgb(0x1A, 0x7F, 0x37), del: Color::Rgb(0xCF, 0x22, 0x2E), accent: Color::Rgb(0x00, 0x2A, 0xFF), border: Color::Rgb(0xC9, 0xCE, 0xD8) }
    }
    /// No-color: everything default, emphasis via modifiers only.
    pub fn mono() -> Self {
        let d = Color::Reset;
        Theme { fg: d, dim: d, ok: d, err: d, warn: d, add: d, del: d, accent: d, border: d }
    }
}

pub fn render(f: &mut Frame, app: &App, mode: ColorMode, th: &Theme) {
    let area = f.area();
    let review_h = if app.review.is_some() { (area.height / 2).max(8) } else { 0 };
    let chunks = Layout::vertical([
        Constraint::Length(4),
        Constraint::Min(3),
        Constraint::Length(review_h),
        Constraint::Length(1),
    ])
    .split(area);
    header(f, chunks[0], app, mode, th);
    stream(f, chunks[1], app, th);
    if let Some(r) = &app.review {
        review(f, chunks[2], r, app, th);
    }
    footer(f, chunks[3], app, th);
}

fn header(f: &mut Frame, area: Rect, app: &App, mode: ColorMode, th: &Theme) {
    let cols = Layout::horizontal([Constraint::Length(36), Constraint::Min(10)]).split(area);
    let mut logo = compact_lines(mode);
    logo.push(Line::raw(""));
    f.render_widget(Paragraph::new(logo), cols[0]);
    let dim = Style::default().fg(th.dim);
    let info = vec![
        Line::from(vec![Span::styled("task  ", dim), Span::styled(trunc(&app.prompt, cols[1].width as usize - 8), Style::default().fg(th.fg).add_modifier(Modifier::BOLD))]),
        Line::from(vec![Span::styled("model ", dim), Span::styled(app.model.clone(), Style::default().fg(th.fg))]),
        Line::from(vec![Span::styled("base  ", dim), Span::styled(app.base_sha.chars().take(8).collect::<String>(), Style::default().fg(th.fg))]),
    ];
    f.render_widget(Paragraph::new(info), cols[1]);
}

fn tail(s: &str, n: usize) -> String {
    let c: Vec<char> = s.chars().collect();
    if c.len() <= n { s.to_string() } else { format!("…{}", c[c.len() - (n - 1)..].iter().collect::<String>()) }
}

fn trunc(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n.saturating_sub(1)).collect::<String>()) }
}

fn stream(f: &mut Frame, area: Rect, app: &App, th: &Theme) {
    let mut lines: Vec<Line> = vec![];
    for e in &app.entries {
        match e {
            Entry::Text(t) => {
                for l in t.trim_end_matches('\n').split('\n') {
                    lines.push(Line::styled(l.to_string(), Style::default().fg(th.fg)));
                }
            }
            Entry::Tool { name, summary, status, .. } => {
                let (icon, col) = match status {
                    ToolStatus::Running => (SPIN[app.spinner % SPIN.len()], th.accent),
                    ToolStatus::Ok => ("✓", th.ok),
                    ToolStatus::Error => ("✗", th.err),
                };
                lines.push(Line::from(vec![
                    Span::styled(format!(" {icon} "), Style::default().fg(col)),
                    Span::styled(name.clone(), Style::default().fg(th.accent).add_modifier(Modifier::BOLD)),
                    Span::styled(format!("  {summary}"), Style::default().fg(th.dim)),
                ]));
            }
            Entry::Notice(n) => lines.push(Line::styled(n.clone(), Style::default().fg(th.warn))),
        }
    }
    if let Some(g) = &app.guard {
        lines.push(Line::styled(format!(" ! Blocked: {g}"), Style::default().fg(th.err).add_modifier(Modifier::BOLD)));
    }
    if let Some(q) = &app.question {
        lines.push(Line::styled(format!(" ? Needs input: {q}"), Style::default().fg(th.warn).add_modifier(Modifier::BOLD)));
    }
    if let Some(e) = &app.protocol_error {
        lines.push(Line::styled(format!(" ! {e}"), Style::default().fg(th.err)));
    }
    let block = Block::default().borders(Borders::TOP).border_style(Style::default().fg(th.border));
    let inner_h = area.height.saturating_sub(1) as usize;
    let wrapped_est: usize = lines.len();
    let max_scroll = wrapped_est.saturating_sub(inner_h);
    let scroll = max_scroll.saturating_sub(app.scroll_up.min(max_scroll)) as u16;
    f.render_widget(Paragraph::new(lines).block(block).wrap(Wrap { trim: false }).scroll((scroll, 0)), area);
}

const SPIN: [&str; 4] = ["◐", "◓", "◑", "◒"];

fn review(f: &mut Frame, area: Rect, r: &Review, app: &App, th: &Theme) {
    let title = format!(" Review  {}  ({} hunks) ", r.file, r.hunks.len());
    let block = Block::default().borders(Borders::ALL).border_style(Style::default().fg(th.accent)).title(title);
    let inner = block.inner(area);
    f.render_widget(block, area);
    let mut lines: Vec<Line> = vec![];
    for (i, h) in r.hunks.iter().enumerate() {
        let sel = i == r.cursor;
        let (mark, col) = match r.decisions[i] {
            Decision::Pending => ("[ ]", th.dim),
            Decision::Accept => ("[✓]", th.ok),
            Decision::Reject => ("[✗]", th.err),
        };
        let mut st = Style::default().fg(th.fg).add_modifier(Modifier::BOLD);
        if sel { st = st.add_modifier(Modifier::REVERSED); }
        lines.push(Line::from(vec![Span::styled(format!("{mark} "), Style::default().fg(col)), Span::styled(format!("{} {}", h.id, h.header), st)]));
        if sel {
            for l in &h.lines {
                let c = match l.chars().next() { Some('+') => th.add, Some('-') => th.del, _ => th.dim };
                lines.push(Line::styled(format!("    {l}"), Style::default().fg(c)));
            }
        }
    }
    let mut foot = vec![];
    if app.guard.is_some() {
        foot.push(Line::styled("Approval blocked: unsaved changes in the desktop editor. Save or discard them first.", Style::default().fg(th.err).add_modifier(Modifier::BOLD)));
    } else if !r.hash_ok {
        foot.push(Line::styled("Approval blocked: content hash mismatch. The diff changed after review was prepared.", Style::default().fg(th.err).add_modifier(Modifier::BOLD)));
    } else if r.all_decided() {
        foot.push(Line::styled("All hunks decided. Press Enter to submit.", Style::default().fg(th.ok)));
    } else {
        foot.push(Line::styled("Decide every hunk, then Enter to submit.", Style::default().fg(th.dim)));
    }
    let parts = Layout::vertical([Constraint::Min(1), Constraint::Length(1)]).split(inner);
    f.render_widget(Paragraph::new(lines), parts[0]);
    f.render_widget(Paragraph::new(foot), parts[1]);
}

fn footer(f: &mut Frame, area: Rect, app: &App, th: &Theme) {
    let (label, col) = match app.state {
        RunState::Starting => ("starting", th.dim),
        RunState::Running => ("running", th.accent),
        RunState::WaitingReview => ("review", th.warn),
        RunState::NeedsInput => ("needs input", th.warn),
        RunState::Done => ("done", th.ok),
        RunState::Failed => ("failed", th.err),
    };
    let dim = Style::default().fg(th.dim);
    let hints = if app.review.is_some() { "j/k move  a/r decide  A/R all  ⏎ send" } else if app.finished() { "q quit" } else { "↑/↓ scroll  q cancel" };
    let line = Line::from(vec![
        Span::styled(format!(" {label} "), Style::default().fg(col).add_modifier(Modifier::BOLD | Modifier::REVERSED)),
        Span::styled(format!("  {} ", if app.task_id.is_empty() { "-" } else { &app.task_id }), dim),
        Span::styled(format!("│ ${:.4} · {} tok ", app.cost_usd, app.tokens), dim),
        Span::styled(format!("│ branch {} ", if app.branch.is_empty() { "-".to_string() } else { tail(&app.branch, 22) }), dim),
        Span::styled(format!("│ {hints}"), dim),
    ]);
    f.render_widget(Paragraph::new(line), area);
}

/// Plain-text rendering of a frame buffer (screenshots, tests).
pub fn buffer_text(buf: &ratatui::buffer::Buffer) -> String {
    let mut out = String::new();
    for y in 0..buf.area.height {
        let mut row = String::new();
        for x in 0..buf.area.width {
            row.push_str(buf[(x, y)].symbol());
        }
        out.push_str(row.trim_end());
        out.push('\n');
    }
    out
}

/// ANSI rendering of a frame buffer with truecolor fg, for pty-style captures.
pub fn buffer_ansi(buf: &ratatui::buffer::Buffer) -> String {
    let mut out = String::new();
    for y in 0..buf.area.height {
        for x in 0..buf.area.width {
            let c = &buf[(x, y)];
            match c.fg {
                Color::Rgb(r, g, b) => out.push_str(&format!("\x1b[38;2;{r};{g};{b}m")),
                Color::Indexed(i) => out.push_str(&format!("\x1b[38;5;{i}m")),
                _ => out.push_str("\x1b[39m"),
            }
            if c.modifier.contains(Modifier::REVERSED) { out.push_str("\x1b[7m") }
            if c.modifier.contains(Modifier::BOLD) { out.push_str("\x1b[1m") }
            out.push_str(c.symbol());
            out.push_str("\x1b[0m");
        }
        out.push('\n');
    }
    out
}
