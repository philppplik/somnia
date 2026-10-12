//! Persistent session events: one JSON object per line, append-only.

use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Append-only JSONL event log. Never records approval tokens, argv or agent stderr.
pub struct EventLog {
    path: PathBuf,
    inner: Mutex<(File, u64)>,
}

impl EventLog {
    /// Open (creating) the log; the sequence continues after existing events.
    pub fn open(path: &Path) -> std::io::Result<Self> {
        let existing = read_events(path).len() as u64;
        let f = OpenOptions::new().create(true).append(true).open(path)?;
        Ok(Self {
            path: path.to_path_buf(),
            inner: Mutex::new((f, existing)),
        })
    }

    /// Append one event. Failures are swallowed: logging must not change agent behaviour.
    pub fn append(&self, kind: &str, data: Value) {
        if let Ok(mut g) = self.inner.lock() {
            g.1 += 1;
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let line = json!({"seq": g.1, "ts": secs, "kind": kind, "data": data});
            let _ = writeln!(g.0, "{line}");
            let _ = g.0.flush();
        }
    }

    /// Path of the log file.
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Read every parseable event (corrupt lines are skipped).
pub fn read_events(path: &Path) -> Vec<Value> {
    let Ok(f) = File::open(path) else { return Vec::new() };
    BufReader::new(f)
        .lines()
        .map_while(Result::ok)
        .filter_map(|l| serde_json::from_str(&l).ok())
        .collect()
}

/// Newest ACP session id recorded in the log (for resume).
pub fn last_session_id(path: &Path) -> Option<String> {
    read_events(path)
        .into_iter()
        .rev()
        .find(|e| e["kind"] == "session_ready")
        .and_then(|e| e["data"]["sessionId"].as_str().map(String::from))
}
