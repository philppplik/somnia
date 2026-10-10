//! `somnia run --tui-stdio`: thin adapter between the headless core and the TUI contract (protocol v1, NDJSON,
//! `"v":1`). Core events are mapped onto the TUI schema; TUI commands arrive on stdin.
//!
//! Mapping:
//!   status/plan/progress  -> status / text_delta
//!   needs-input           -> needs_input
//!   review-required       -> guard_blocked (+ done "needs_input")
//!   uncommitted work (L0) -> diff_proposed per file; review_decision is verified before anything is applied
//!   result                -> done
//! Review rules: content_hash (S12 formula, see `review`) must equal the proposed hash AND the current worktree
//! hash; every hunk must be named once. Anything else => guard_blocked and the review stays pending (not approvable).
//! Stdout carries protocol frames only. Tokens/credentials are never fields (requests are scanned).
use crate::engine::TaskEngine;
use crate::error::{ErrorKind, Result};
use crate::gitops;
use crate::protocol::{scan_for_secrets, EventFrame, RunEvent};
use crate::record::Status;
use crate::review::{self, FileReview, Verdict};
use crate::runner::{self, RunSpec};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::sync::Arc;

pub const TUI_PROTOCOL: u32 = 1;

#[derive(Debug)]
pub enum Inbound {
    Decision { review_id: String, content_hash: String, accepted: Vec<String>, rejected: Vec<String> },
    Cancel,
    Invalid(String),
    Eof,
}

pub fn parse_command(line: &str) -> Option<Inbound> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    if line.len() > 1024 * 1024 {
        return Some(Inbound::Invalid("frame too large".into()));
    }
    let v: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return Some(Inbound::Invalid(format!("invalid json: {e}"))),
    };
    if scan_for_secrets(&v).is_err() {
        return Some(Inbound::Invalid("credential-like field rejected; tokens are never protocol fields".into()));
    }
    if let Some(ver) = v.get("v").and_then(|x| x.as_u64()) {
        if ver as u32 != TUI_PROTOCOL {
            return Some(Inbound::Invalid(format!("protocol version {ver} not supported (expected {TUI_PROTOCOL})")));
        }
    }
    let strs = |k: &str| -> Option<Vec<String>> { v.get(k)?.as_array()?.iter().map(|x| x.as_str().map(String::from)).collect() };
    match v.get("type").and_then(|t| t.as_str()) {
        Some("cancel") => Some(Inbound::Cancel),
        Some("review_decision") => {
            let (Some(id), Some(h), Some(a), Some(r)) = (v.get("review_id").and_then(|x| x.as_str()), v.get("content_hash").and_then(|x| x.as_str()), strs("accepted_hunks"), strs("rejected_hunks")) else {
                return Some(Inbound::Invalid("malformed review_decision".into()));
            };
            Some(Inbound::Decision { review_id: id.into(), content_hash: h.into(), accepted: a, rejected: r })
        }
        _ => Some(Inbound::Invalid("unknown command".into())),
    }
}

struct Out<W: Write>(W);
impl<W: Write> Out<W> {
    fn send(&mut self, mut v: Value) {
        v["v"] = TUI_PROTOCOL.into();
        let _ = writeln!(self.0, "{v}");
        let _ = self.0.flush();
    }
    fn guard(&mut self, reason: &str) {
        self.send(json!({"type":"guard_blocked","reason":reason}));
    }
    fn done(&mut self, status: &str, sha: &str, summary: &str) {
        self.send(json!({"type":"done","status":status,"result_sha":sha,"summary":summary}));
    }
}

fn map_frame<W: Write>(out: &mut Out<W>, f: &EventFrame, branch: &str) {
    match &f.event {
        RunEvent::Status { status } => {
            let s = serde_json::to_value(status).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
            out.send(json!({"type":"status","state":s,"branch":branch}));
        }
        RunEvent::Plan { text } => out.send(json!({"type":"text_delta","text":format!("Plan: {text}\n")})),
        RunEvent::Progress { text } => out.send(json!({"type":"text_delta","text":format!("{text}\n")})),
        RunEvent::NeedsInput { reason } => out.send(json!({"type":"needs_input","question":reason})),
        RunEvent::Result { .. } => {} // reported as `done` after review handling
    }
}

fn spawn_stdin<R: BufRead + Send + 'static>(input: R, cancel: Arc<AtomicBool>) -> Receiver<Inbound> {
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        for l in input.lines().map_while(|l| l.ok()) {
            if let Some(m) = parse_command(&l) {
                if matches!(m, Inbound::Cancel) {
                    cancel.store(true, Ordering::SeqCst);
                }
                if tx.send(m).is_err() {
                    return;
                }
            }
        }
        let _ = tx.send(Inbound::Eof);
    });
    rx
}

/// Returns the process exit code (0 done, 1 failed/cancelled, 2 needs-input/review-required).
pub fn run<R: BufRead + Send + 'static, W: Write>(spec: &RunSpec, engine: &dyn TaskEngine, input: R, output: W) -> Result<i32> {
    let mut out = Out(output);
    let branch = spec.branch.clone().unwrap_or_else(|| format!("somnia/task/{}", spec.task_id));
    let base = gitops::head_sha(&spec.root).unwrap_or_default();
    let cancel = runner::cancel_flag();
    let rx = spawn_stdin(input, cancel.clone());
    out.send(json!({"type":"session_started","task_id":spec.task_id,"prompt":spec.prompt,"branch":branch,"base_sha":base,"model":""}));

    let rec = match runner::execute(spec, engine, &cancel, &mut |f| map_frame(&mut out, f, &branch)) {
        Ok(r) => r,
        Err(e) => {
            // Nothing started (preflight blocker).
            if e.kind == ErrorKind::ReviewRequired {
                out.guard(&e.message);
                out.done("needs_input", "", &e.message);
                return Ok(2);
            }
            out.done("failed", "", &e.message);
            return Err(e);
        }
    };
    match rec.status {
        Status::Review if rec.error.is_none() => review_loop(spec, &rec.task_id, &base, &branch, &rx, &cancel, &mut out),
        Status::Review => {
            let msg = rec.error.as_ref().map(|e| e.message.clone()).unwrap_or_default();
            out.guard(&msg);
            out.done("needs_input", "", &msg);
            Ok(2)
        }
        Status::WaitingInput => {
            out.done("needs_input", "", "agent needs input");
            Ok(2)
        }
        Status::Done => {
            out.done("done", rec.head_sha.as_deref().unwrap_or(""), "");
            Ok(0)
        }
        Status::Cancelled => {
            out.done("failed", "", "cancelled");
            Ok(1)
        }
        _ => {
            let msg = rec.error.as_ref().map(|e| e.message.clone()).unwrap_or_else(|| "run failed".into());
            out.done("failed", "", &msg);
            Ok(1)
        }
    }
}

fn review_loop<W: Write>(spec: &RunSpec, task_id: &str, base: &str, branch: &str, rx: &Receiver<Inbound>, cancel: &Arc<AtomicBool>, out: &mut Out<W>) -> Result<i32> {
    let paths = gitops::dirty_paths(&spec.root)?;
    let mut reviews: Vec<FileReview> = review::build_reviews(&spec.root, task_id, &paths)?;
    if reviews.is_empty() {
        out.done("done", base, "no reviewable changes");
        return Ok(0);
    }
    for r in &reviews {
        out.send(json!({"type":"diff_proposed","review_id":r.review_id,"file":r.file,"content_hash":r.content_hash,
            "hunks": r.hunks.iter().map(|h| json!({"id":h.id,"header":h.header,"lines":h.lines})).collect::<Vec<_>>()}));
    }
    let (mut acc, mut rej) = (0usize, 0usize);
    while reviews.iter().any(|r| !r.decided) {
        match rx.recv() {
            Ok(Inbound::Decision { review_id, content_hash, accepted, rejected }) => {
                let Some(r) = reviews.iter_mut().find(|r| r.review_id == review_id) else {
                    out.guard(&format!("unknown review_id {review_id}"));
                    continue;
                };
                match review::verify(&spec.root, r, &content_hash, &accepted, &rejected) {
                    Verdict::Blocked(why) => out.guard(&format!("{}: {why}", r.file)),
                    Verdict::Ok => match review::apply_rejections(&spec.root, r, &rejected) {
                        Ok(()) => {
                            r.decided = true;
                            acc += accepted.len();
                            rej += rejected.len();
                        }
                        Err(e) => out.guard(&format!("{}: {}", r.file, e.message)),
                    },
                }
            }
            Ok(Inbound::Invalid(why)) => out.guard(&why),
            Ok(Inbound::Cancel) | Ok(Inbound::Eof) | Err(_) => {
                let why = if cancel.load(Ordering::SeqCst) { "review cancelled" } else { "review input closed" };
                out.done("needs_input", base, &format!("{why}; changes remain uncommitted on {branch}"));
                return Ok(2);
            }
        }
    }
    out.done("done", base, &format!("reviewed: {acc} hunks accepted, {rej} rejected; accepted changes stay uncommitted on {branch}"));
    Ok(0)
}
