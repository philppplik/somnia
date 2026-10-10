//! Structured application log: one JSON object per line, rotating files in the app data folder.
//! Std-only on purpose so it works before the UI exists and inside a panic hook.
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_BYTES: u64 = 1_000_000;
pub const KEEP: usize = 3;
const MAX_MESSAGE: usize = 4000;
const MAX_TAIL_BYTES: u64 = 512 * 1024;
const LEVELS: [&str; 4] = ["debug", "info", "warn", "error"];

pub struct Logger {
    dir: PathBuf,
    max_bytes: u64,
    keep: usize,
    lock: Mutex<()>,
}

static GLOBAL: OnceLock<Logger> = OnceLock::new();

/// Masks API keys, tokens and passwords. Applied to every message and context value before it is written.
pub fn redact(input: &str) -> String {
    const PREFIXES: [&str; 8] = ["sk-", "ghp_", "gho_", "ghs_", "github_pat_", "xox", "AIza", "glpat-"];
    const KEYS: [&str; 9] = ["key", "token", "secret", "password", "passwd", "authorization", "credential", "bearer", "cookie"];
    let is_sep = |c: char| c.is_whitespace() || matches!(c, '"' | '\'' | ',' | ';' | '&' | '(' | ')' | '<' | '>' | '{' | '}' | '[' | ']');
    let mut out = String::with_capacity(input.len());
    let mut mask_next = false;
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String, mask_next: &mut bool| {
        if word.is_empty() {
            return;
        }
        let w = std::mem::take(word);
        let lower = w.to_ascii_lowercase();
        let secret_value = *mask_next && w.len() >= 6;
        let prefixed = PREFIXES.iter().any(|p| w.starts_with(p)) && w.len() >= 12;
        // key=value / key:value where the key looks sensitive (also inside URLs: ?api_key=...).
        let split = sensitive_split(&w, &lower, &KEYS);
        let kv = split.is_some();
        *mask_next = (lower == "bearer" || lower == "authorization:" || lower == "authorization")
            || (split.is_none() && lower.ends_with([':', '=']) && KEYS.iter().any(|k| lower.contains(k)));
        if secret_value || prefixed {
            out.push_str("[redacted]");
        } else if kv {
            let i = split.unwrap_or(0);
            out.push_str(&w[..=i]);
            out.push_str("[redacted]");
        } else {
            out.push_str(&w);
        }
    };
    for c in input.chars() {
        if is_sep(c) {
            flush(&mut word, &mut out, &mut mask_next);
            out.push(c);
        } else {
            word.push(c);
        }
    }
    flush(&mut word, &mut out, &mut mask_next);
    out
}

/// Index of the separator after a sensitive key (`api_key=`, `token:`), if the word has a non-empty value after it.
fn sensitive_split(w: &str, lower: &str, keys: &[&str]) -> Option<usize> {
    for (i, c) in w.char_indices() {
        if (c == '=' || c == ':') && i + 1 < w.len() && !w[i + 1..].starts_with("//") {
            let mut key: Vec<char> = lower[..i].chars().rev().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
            key.reverse();
            let key: String = key.into_iter().collect();
            if keys.iter().any(|k| key.contains(k)) {
                return Some(i);
            }
        }
    }
    None
}

fn redact_value(v: &Value) -> Value {
    match v {
        Value::String(s) => Value::String(redact(s)),
        Value::Array(a) => Value::Array(a.iter().map(redact_value).collect()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, x)| {
                    let kl = k.to_ascii_lowercase();
                    let sensitive = ["key", "token", "secret", "password", "passwd", "authorization", "credential", "cookie"].iter().any(|s| kl.contains(s));
                    (k.clone(), if sensitive { Value::String("[redacted]".into()) } else { redact_value(x) })
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

/// RFC 3339 UTC timestamp from the system clock (no chrono dependency).
pub fn timestamp() -> String {
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format_ts(d.as_secs() as i64, d.subsec_millis())
}
pub fn format_ts(secs: i64, millis: u32) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Howard Hinnant's civil-from-days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_owned();
    }
    let mut t: String = s.chars().take(max).collect();
    t.push_str("...[truncated]");
    t
}

impl Logger {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self::with_limits(dir, MAX_BYTES, KEEP)
    }
    pub fn with_limits(dir: impl Into<PathBuf>, max_bytes: u64, keep: usize) -> Self {
        let dir = dir.into();
        let _ = fs::create_dir_all(&dir);
        Self { dir, max_bytes, keep: keep.max(1), lock: Mutex::new(()) }
    }
    pub fn dir(&self) -> &Path {
        &self.dir
    }
    fn file(&self, n: usize) -> PathBuf {
        self.dir.join(if n == 0 { "somnia.log".to_owned() } else { format!("somnia.{n}.log") })
    }
    fn rotate(&self) {
        let _ = fs::remove_file(self.file(self.keep));
        for n in (0..self.keep).rev() {
            let from = self.file(n);
            if from.exists() {
                let _ = fs::rename(&from, self.file(n + 1));
            }
        }
    }
    /// Never panics and never returns an error to the caller: logging must not break the app.
    pub fn write(&self, level: &str, source: &str, message: &str, context: Option<&Value>) {
        self.write_entry(level, source, message, context, &[]);
    }
    fn write_entry(&self, level: &str, source: &str, message: &str, context: Option<&Value>, extra: &[(&str, Value)]) {
        let level = if LEVELS.contains(&level) { level } else { "info" };
        let mut entry = json!({
            "ts": timestamp(),
            "level": level,
            "source": truncate(&redact(source), 80),
            "message": truncate(&redact(message), MAX_MESSAGE),
            "context": context.map(|c| truncate(&redact_value(c).to_string(), MAX_MESSAGE)).and_then(|s| serde_json::from_str::<Value>(&s).ok()),
        });
        if let Some(map) = entry.as_object_mut() {
            for (k, v) in extra {
                map.insert((*k).to_owned(), redact_value(v));
            }
        }
        let line = format!("{entry}\n");
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let path = self.file(0);
        if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) + line.len() as u64 > self.max_bytes {
            self.rotate();
        }
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(line.as_bytes());
        }
    }
    /// Writes ONE typed event line (`id`, `expected`, `incident_id`). Returns the incident id for
    /// unexpected warn/error events; expected events and info/debug never get one.
    pub fn event(&self, spec: &EventSpec<'_>) -> Option<IncidentId> {
        let incident = spec.needs_incident().then(IncidentId::new);
        let mut extra: Vec<(&str, Value)> = vec![("id", json!(spec.id)), ("expected", json!(spec.expected))];
        if let Some(i) = &incident {
            extra.push(("incident_id", json!(i.as_str())));
        }
        if let Some(c) = spec.corr {
            extra.push(("corr", json!(c)));
        }
        self.write_entry(spec.level, spec.source, spec.message, spec.context, &extra);
        incident
    }
    /// Last `max_lines` entries across the current and previous files, oldest first.
    pub fn tail(&self, max_lines: usize) -> String {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut lines: Vec<String> = Vec::new();
        for n in 0..=self.keep {
            if lines.len() >= max_lines {
                break;
            }
            let Ok(mut f) = File::open(self.file(n)) else { continue };
            let len = f.metadata().map(|m| m.len()).unwrap_or(0);
            let start = len.saturating_sub(MAX_TAIL_BYTES);
            let mut text = String::new();
            if f.seek(SeekFrom::Start(start)).is_err() || f.read_to_string(&mut text).is_err() {
                // Seek can land inside a multi-byte char; fall back to lossy.
                let mut bytes = Vec::new();
                let _ = f.seek(SeekFrom::Start(start)).and_then(|_| f.read_to_end(&mut bytes));
                text = String::from_utf8_lossy(&bytes).into_owned();
            }
            let mut file_lines: Vec<&str> = text.lines().collect();
            if start > 0 && !file_lines.is_empty() {
                file_lines.remove(0); // first line may be cut off
            }
            let need = max_lines - lines.len();
            let take: Vec<String> = file_lines.iter().rev().take(need).rev().map(|s| (*s).to_owned()).collect();
            lines.splice(0..0, take);
        }
        lines.join("\n")
    }
}

/// Opaque incident identifier (26-char Crockford base32, ULID layout: 48-bit ms time + 80 random bits).
/// Minted per unexpected warn/error event, never derived from a request id.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct IncidentId(String);

impl IncidentId {
    pub fn new() -> Self {
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        Self::from_parts(ms, *uuid::Uuid::new_v4().as_bytes())
    }
    /// Deterministic constructor for tests: `random` supplies the low 80 bits (first 10 bytes used).
    pub fn from_parts(ms: u64, random: [u8; 16]) -> Self {
        const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        let mut value: u128 = u128::from(ms & 0xFFFF_FFFF_FFFF) << 80;
        let mut low: u128 = 0;
        for b in &random[..10] {
            low = (low << 8) | u128::from(*b);
        }
        value |= low;
        let mut out = [0u8; 26];
        for (i, slot) in out.iter_mut().enumerate() {
            let shift = 5 * (25 - i);
            *slot = ALPHABET[((value >> shift) & 0x1F) as usize];
        }
        Self(String::from_utf8_lossy(&out).into_owned())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn into_string(self) -> String {
        self.0
    }
}
impl Default for IncidentId {
    fn default() -> Self {
        Self::new()
    }
}

/// One typed event. `id` is a registry id such as `SOM-FS-006` (validated by the generated registry in CI, not here).
pub struct EventSpec<'a> {
    pub id: &'a str,
    pub level: &'a str,
    pub source: &'a str,
    pub message: &'a str,
    pub context: Option<&'a Value>,
    pub expected: bool,
    pub corr: Option<&'a str>,
}
impl EventSpec<'_> {
    fn needs_incident(&self) -> bool {
        !self.expected && matches!(self.level, "warn" | "error")
    }
}

/// Destination for typed events; `Global` is the app logger, `Logger` is used by tests.
pub trait EventSink {
    fn event(&self, spec: &EventSpec<'_>) -> Option<IncidentId>;
}
impl EventSink for Logger {
    fn event(&self, spec: &EventSpec<'_>) -> Option<IncidentId> {
        Logger::event(self, spec)
    }
}
pub struct Global;
impl EventSink for Global {
    fn event(&self, spec: &EventSpec<'_>) -> Option<IncidentId> {
        event(spec)
    }
}

/// Starts the global logger and routes Rust panics into it. Safe to call twice.
pub fn init(dir: impl Into<PathBuf>) {
    let first = GLOBAL.set(Logger::new(dir)).is_ok();
    if !first {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        write("error", "rust.panic", &payload, Some(&json!({ "at": place })));
        previous(info);
    }));
    write("info", "app", "Somnia service started", Some(&json!({ "version": env!("CARGO_PKG_VERSION") })));
}
pub fn global() -> Option<&'static Logger> {
    GLOBAL.get()
}
pub fn write(level: &str, source: &str, message: &str, context: Option<&Value>) {
    if let Some(l) = GLOBAL.get() {
        l.write(level, source, message, context);
    }
}
/// Typed event on the global logger. An unexpected warn/error still yields an incident id when the
/// logger is not initialised (early start, unit tests), so callers can always show one.
pub fn event(spec: &EventSpec<'_>) -> Option<IncidentId> {
    match GLOBAL.get() {
        Some(l) => l.event(spec),
        None => spec.needs_incident().then(IncidentId::new),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("somnia-applog-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }
    #[test]
    fn redacts_keys_tokens_and_bearer() {
        assert!(!redact("call failed with sk-or-v1-abcdef123456789").contains("abcdef"));
        assert!(!redact("Authorization: Bearer abc123secretvalue").contains("abc123secretvalue"));
        assert!(!redact("https://x.test/?api_key=hunter2hunter2&a=1").contains("hunter2"));
        assert!(redact("https://x.test/?api_key=hunter2hunter2&a=1").contains("a=1"));
        assert!(!redact("set-cookie: session=abc123def456ghi789").contains("abc123def456"));
        assert!(!redact("passwd: sup3rsecretvalue").contains("sup3rsecret"));
        assert!(!redact("token: ghp_abcdefghijklmnop1234").contains("abcdefghij"));
        assert_eq!(redact("plain message about index.html"), "plain message about index.html");
        assert_eq!(redact("https://github.com/x/y"), "https://github.com/x/y");
    }
    #[test]
    fn context_secret_fields_are_masked() {
        let d = dir("ctx");
        let l = Logger::new(&d);
        l.write("error", "t", "boom", Some(&json!({"apiKey": "sk-live-1234567890abcdef", "file": "a.html"})));
        let t = l.tail(10);
        assert!(!t.contains("1234567890abcdef"));
        assert!(t.contains("a.html") && t.contains("\"level\":\"error\""));
    }
    #[test]
    fn rotates_and_keeps_limited_files() {
        let d = dir("rot");
        let l = Logger::with_limits(&d, 400, 2);
        for i in 0..40 {
            l.write("info", "t", &format!("message number {i} with some padding text"), None);
        }
        assert!(d.join("somnia.log").exists() && d.join("somnia.1.log").exists());
        assert!(!d.join("somnia.3.log").exists());
        let t = l.tail(1000);
        assert!(t.contains("number 39"));
        assert_eq!(l.tail(2).lines().count(), 2);
    }
    #[test]
    fn timestamp_format_is_rfc3339() {
        assert_eq!(format_ts(0, 0), "1970-01-01T00:00:00.000Z");
        assert_eq!(format_ts(1_791_000_000, 5), "2026-10-03T04:00:00.005Z");
    }
    #[test]
    fn unknown_level_and_long_messages_are_bounded() {
        let d = dir("lim");
        let l = Logger::new(&d);
        l.write("weird", "t", &"x".repeat(20_000), None);
        let t = l.tail(1);
        assert!(t.contains("\"level\":\"info\"") && t.len() < 5000);
    }
}
