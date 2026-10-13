//! IPC server for a (detached) run, plus the event replay/tail shared with offline attach.
use crate::error::{CliError, ErrorKind, Result};
use crate::protocol::*;
use crate::record;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Discovery {
    pub protocol: u32,
    pub pid: u32,
    pub socket: String,
    pub task_id: String,
}

pub fn run_dir(root: &Path) -> PathBuf {
    root.join(".somnia").join("run")
}
pub fn discovery_path(root: &Path, task_id: &str) -> PathBuf {
    run_dir(root).join(format!("{task_id}.json"))
}
pub fn spec_path(root: &Path, task_id: &str) -> PathBuf {
    run_dir(root).join(format!("{task_id}.spec.json"))
}

/// Replays then tails the event log until the Result frame. `send` returns Err when the peer is gone.
pub fn stream_events(root: &Path, task_id: &str, pid: Option<u32>, send: &mut dyn FnMut(&EventFrame) -> std::io::Result<()>) -> Result<()> {
    let path = record::events_path(root, task_id);
    let mut done_lines = 0usize;
    let mut idle_after_dead = 0;
    loop {
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        let mut finished = false;
        // A partially written last line has no trailing newline; skip it until complete.
        let complete = if text.ends_with('\n') || text.is_empty() { lines.len() } else { lines.len().saturating_sub(1) };
        for l in &lines[done_lines.min(complete)..complete] {
            if let Ok(f) = serde_json::from_str::<EventFrame>(l) {
                if send(&f).is_err() {
                    return Ok(());
                }
                if matches!(f.event, RunEvent::Result { .. }) {
                    finished = true;
                }
            }
        }
        done_lines = complete;
        if finished {
            return Ok(());
        }
        if let Some(p) = pid {
            if !crate::transport::pid_alive(p) {
                idle_after_dead += 1;
                if idle_after_dead > 10 {
                    return Err(CliError::new(ErrorKind::UncertainOutcome, "run process is gone without a final result; check the session record"));
                }
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(unix)]
pub mod sock {
    use super::*;
    use crate::transport::{Listener, Stream};
    use std::io::{BufRead, BufReader, Read};

    fn write_frame(w: &mut dyn Write, f: &Frame) -> std::io::Result<()> {
        writeln!(w, "{}", serde_json::to_string(f).unwrap())?;
        w.flush()
    }

    fn handle(root: &Path, mut s: Stream, cancel: Arc<AtomicBool>, pid: u32) {
        let _ = s.set_read_timeout(Some(Duration::from_secs(10)));
        let mut line = String::new();
        let mut rd = BufReader::new((&s).take(MAX_FRAME_BYTES as u64 + 1));
        if rd.read_line(&mut line).is_err() {
            return;
        }
        let rid_guess = serde_json::from_str::<serde_json::Value>(&line).ok().and_then(|v| v["request_id"].as_str().map(String::from)).unwrap_or_default();
        let req = match parse_request(line.trim()) {
            Ok(r) => r,
            Err(e) => {
                let _ = write_frame(&mut s, &Frame::Error { request_id: rid_guess, error: e });
                return;
            }
        };
        let rid = req.request_id.clone();
        let out: Result<()> = (|| {
            match &req.body {
                RequestBody::Hello => {
                    write_frame(&mut s, &Frame::Hello { protocol: PROTOCOL_VERSION, request_id: rid.clone(), server: format!("somnia-cli/{}", env!("CARGO_PKG_VERSION")) })?;
                }
                RequestBody::Status { task_id } => {
                    let rec = record::load(root, task_id)?;
                    write_frame(&mut s, &Frame::Result { request_id: rid.clone(), summary: Box::new(rec.summary()) })?;
                }
                RequestBody::Cancel { task_id } => {
                    record::load(root, task_id)?;
                    cancel.store(true, Ordering::SeqCst);
                    write_frame(&mut s, &Frame::Ack { request_id: rid.clone() })?;
                }
                RequestBody::Attach { task_id } => {
                    record::load(root, task_id)?;
                    let _ = s.set_read_timeout(None);
                    let rid2 = rid.clone();
                    let mut w = s.try_clone()?;
                    stream_events(root, task_id, Some(pid), &mut |f| write_frame(&mut w, &Frame::Event { request_id: rid2.clone(), event: f.clone() }))?;
                }
            }
            Ok(())
        })();
        if let Err(e) = out {
            let _ = write_frame(&mut s, &Frame::Error { request_id: rid, error: e });
        }
    }

    /// Accept loop; stops when `stop` is set and a wake-up connection arrives.
    pub fn serve(root: PathBuf, listener: Listener, cancel: Arc<AtomicBool>, stop: Arc<AtomicBool>) {
        let pid = std::process::id();
        loop {
            match listener.accept_same_user() {
                Ok(Some(s)) => {
                    if stop.load(Ordering::SeqCst) {
                        return;
                    }
                    let (r, c) = (root.clone(), cancel.clone());
                    std::thread::spawn(move || handle(&r, s, c, pid));
                }
                Ok(None) => {} // foreign peer: dropped without a response
                Err(_) => return,
            }
        }
    }

    /// Client: send one request, read frames until `on_frame` returns false or EOF.
    pub fn request(socket: &Path, req: &Request, on_frame: &mut dyn FnMut(Frame) -> bool) -> Result<()> {
        let s = crate::transport::connect(socket)?;
        let mut w = s.try_clone()?;
        writeln!(w, "{}", serde_json::to_string(req)?)?;
        w.flush()?;
        for l in BufReader::new(s).lines() {
            let l = l?;
            let f: Frame = serde_json::from_str(&l)?;
            if !on_frame(f) {
                break;
            }
        }
        Ok(())
    }
}
