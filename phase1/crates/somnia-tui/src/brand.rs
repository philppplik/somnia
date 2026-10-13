//! ASCII branding: hand-tuned block wordmark, truecolor brand gradient,
//! color-support detection with monochrome fallback.
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};

pub const STOPS: [(u8, u8, u8); 3] = [(0x00, 0x2A, 0xFF), (0xEE, 0x00, 0xFF), (0xFF, 0x00, 0x1E)];

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ColorMode {
    TrueColor,
    Ansi256,
    Mono,
}

pub fn detect_color_mode(no_color: bool, colorterm: &str, term: &str, is_tty: bool) -> ColorMode {
    if no_color || !is_tty || term == "dumb" {
        return ColorMode::Mono;
    }
    let ct = colorterm.to_ascii_lowercase();
    if ct.contains("truecolor") || ct.contains("24bit") {
        ColorMode::TrueColor
    } else if term.contains("256") {
        ColorMode::Ansi256
    } else {
        ColorMode::Mono
    }
}

pub fn gradient_at(t: f32) -> (u8, u8, u8) {
    let t = t.clamp(0.0, 1.0) * 2.0;
    let (i, f) = if t >= 2.0 { (1, 1.0) } else { (t as usize, t.fract()) };
    let (a, b) = (STOPS[i], STOPS[i + 1]);
    let l = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * f).round() as u8;
    (l(a.0, b.0), l(a.1, b.1), l(a.2, b.2))
}

fn to_256(r: u8, g: u8, b: u8) -> u8 {
    let c = |v: u8| ((v as u16 * 5 + 127) / 255) as u8;
    16 + 36 * c(r) + 6 * c(g) + c(b)
}

pub fn color_for(mode: ColorMode, t: f32) -> Option<Color> {
    let (r, g, b) = gradient_at(t);
    match mode {
        ColorMode::TrueColor => Some(Color::Rgb(r, g, b)),
        ColorMode::Ansi256 => Some(Color::Indexed(to_256(r, g, b))),
        ColorMode::Mono => None,
    }
}

/// Full splash wordmark, 5 rows. Hand-tuned, not FIGlet output.
pub const SPLASH: [&str; 5] = [
    "▄█████  ▄████▄  ██▄  ▄██  ██▄   ██  ██████   ▄████▄ ",
    "██      ██  ██  ███▄▄███  ███▄  ██    ██    ██    ██",
    "▀████▄  ██  ██  ██ ▀▀ ██  ██ ▀█▄██    ██    ████████",
    "    ██  ██  ██  ██    ██  ██   ▀██    ██    ██    ██",
    "█████▀  ▀████▀  ██    ██  ██    ▀█  ██████  ██    ██",
];

/// Compact 3-row wordmark for the in-TUI header.
pub const COMPACT: [&str; 3] = [
    "▄▀▀  █▀▀█  █▀▄▀█  █▄ █  ▀█▀  ▄▀▀▄",
    "▀▀▄  █  █  █ ▀ █  █ ▀█   █   █▀▀█",
    "▄▄▀  ▀▀▀▀  ▀   ▀  ▀  ▀  ▀▀▀  ▀  ▀",
];

pub fn gradient_line(row: &str, mode: ColorMode) -> Line<'static> {
    let chars: Vec<char> = row.chars().collect();
    let n = chars.len().max(2) - 1;
    let spans = chars
        .iter()
        .enumerate()
        .map(|(i, c)| match color_for(mode, i as f32 / n as f32) {
            Some(col) => Span::styled(c.to_string(), Style::default().fg(col)),
            None => Span::raw(c.to_string()),
        })
        .collect::<Vec<_>>();
    Line::from(spans)
}

pub fn splash_lines(mode: ColorMode) -> Vec<Line<'static>> {
    SPLASH.iter().map(|r| gradient_line(r, mode)).collect()
}

pub fn compact_lines(mode: ColorMode) -> Vec<Line<'static>> {
    COMPACT.iter().map(|r| gradient_line(r, mode)).collect()
}

/// Raw ANSI string (used by `--version` and the exit snapshot, outside the TUI).
pub fn ansi(rows: &[&str], mode: ColorMode) -> String {
    let mut out = String::new();
    for row in rows {
        let chars: Vec<char> = row.chars().collect();
        let n = chars.len().max(2) - 1;
        for (i, c) in chars.iter().enumerate() {
            match mode {
                ColorMode::TrueColor => {
                    let (r, g, b) = gradient_at(i as f32 / n as f32);
                    out.push_str(&format!("\x1b[38;2;{r};{g};{b}m{c}"));
                }
                ColorMode::Ansi256 => {
                    let (r, g, b) = gradient_at(i as f32 / n as f32);
                    out.push_str(&format!("\x1b[38;5;{}m{c}", to_256(r, g, b)));
                }
                ColorMode::Mono => out.push(*c),
            }
        }
        if mode != ColorMode::Mono {
            out.push_str("\x1b[0m");
        }
        out.push('\n');
    }
    out
}
