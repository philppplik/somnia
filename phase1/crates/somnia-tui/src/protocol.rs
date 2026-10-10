//! Headless-core event contract, protocol v1 (NDJSON, one JSON object per line).
//!
//! The headless core (`somnia run --json`, the other half of this work package)
//! writes `Event`s to stdout and reads `Command`s from stdin. The TUI depends
//! only on this contract, never on the core's code. Tokens never appear in any
//! field. Unknown event types are ignored (forward compatible).
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Hunk {
    pub id: String,
    pub header: String,
    /// Diff lines with their leading '+', '-' or ' ' marker.
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    SessionStarted {
        task_id: String,
        prompt: String,
        #[serde(default)]
        branch: String,
        #[serde(default)]
        base_sha: String,
        #[serde(default)]
        model: String,
    },
    TextDelta { text: String },
    ToolCall {
        id: String,
        name: String,
        #[serde(default)]
        summary: String,
    },
    ToolResult {
        id: String,
        /// "ok" | "error"
        status: String,
        #[serde(default)]
        summary: String,
    },
    DiffProposed {
        review_id: String,
        file: String,
        content_hash: String,
        hunks: Vec<Hunk>,
    },
    /// Unsaved-buffer guard (or another C2 guard) blocks an agent operation.
    GuardBlocked { reason: String },
    Status {
        #[serde(default)]
        cost_usd: f64,
        #[serde(default)]
        tokens: u64,
        #[serde(default)]
        branch: String,
        #[serde(default)]
        state: String,
    },
    NeedsInput { question: String },
    Done {
        /// "done" | "failed" | "needs_input"
        status: String,
        #[serde(default)]
        result_sha: String,
        #[serde(default)]
        summary: String,
    },
}

/// Commands the TUI writes to the core's stdin.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    ReviewDecision {
        review_id: String,
        /// Must equal the hash of what the user saw.
        content_hash: String,
        accepted_hunks: Vec<String>,
        rejected_hunks: Vec<String>,
    },
    Cancel,
}

pub fn encode_command(c: &Command) -> String {
    let mut v = serde_json::to_value(c).unwrap();
    v["v"] = PROTOCOL_VERSION.into();
    format!("{}\n", v)
}

/// Parse one NDJSON line. `Ok(None)` for blank lines or unknown event types.
pub fn parse_line(line: &str) -> Result<Option<Event>, String> {
    let line = line.trim();
    if line.is_empty() {
        return Ok(None);
    }
    let v: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    if let Some(ver) = v.get("v").and_then(|x| x.as_u64()) {
        if ver as u32 != PROTOCOL_VERSION {
            return Err(format!("protocol version {ver} not supported (expected {PROTOCOL_VERSION})"));
        }
    }
    match serde_json::from_value::<Event>(v) {
        Ok(e) => Ok(Some(e)),
        Err(e) if e.to_string().contains("unknown variant") => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Canonical review hash: sha256(file \0 (hunk.id \0 lines.join("\n") \0)*), hex.
pub fn review_hash(file: &str, hunks: &[Hunk]) -> String {
    let mut h = Sha256::new();
    h.update(file.as_bytes());
    h.update([0]);
    for hk in hunks {
        h.update(hk.id.as_bytes());
        h.update([0]);
        h.update(hk.lines.join("\n").as_bytes());
        h.update([0]);
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Strip terminal control sequences from untrusted text (model or tool output)
/// so it can never move the cursor, change the title or inject escapes.
pub fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| *c == '\n' || *c == '\t' || !c.is_control())
        .collect()
}
