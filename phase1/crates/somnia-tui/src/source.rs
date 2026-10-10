//! Event sources: a child headless-core process (NDJSON over stdio) or a
//! scripted demo/replay. No secrets are passed via argv or env by the TUI.
use crate::protocol::*;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command as Proc, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use std::time::Duration;

pub enum Msg {
    Ev(Event),
    BadLine(String),
    Closed,
}

pub struct Core {
    pub rx: Receiver<Msg>,
    stdin: Option<ChildStdin>,
    child: Option<Child>,
}

impl Core {
    pub fn spawn(argv: &[String]) -> std::io::Result<Core> {
        let mut child = Proc::new(&argv[0])
            .args(&argv[1..])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let out = child.stdout.take().unwrap();
        let stdin = child.stdin.take();
        let (tx, rx) = channel();
        thread::spawn(move || {
            for line in BufReader::new(out).lines() {
                match line {
                    Ok(l) => match parse_line(&l) {
                        Ok(Some(e)) => { let _ = tx.send(Msg::Ev(e)); }
                        Ok(None) => {}
                        Err(e) => { let _ = tx.send(Msg::BadLine(e)); }
                    },
                    Err(_) => break,
                }
            }
            let _ = tx.send(Msg::Closed);
        });
        Ok(Core { rx, stdin, child: Some(child) })
    }

    /// Replay an NDJSON file with a delay between events (also used by demo).
    pub fn replay(lines: Vec<String>, delay: Duration) -> Core {
        let (tx, rx) = channel();
        spawn_replay(tx, lines, delay);
        Core { rx, stdin: None, child: None }
    }

    pub fn send(&mut self, c: &Command) {
        if let Some(s) = self.stdin.as_mut() {
            let _ = s.write_all(encode_command(c).as_bytes());
            let _ = s.flush();
        }
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        if let Some(c) = self.child.as_mut() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

fn spawn_replay(tx: Sender<Msg>, lines: Vec<String>, delay: Duration) {
    thread::spawn(move || {
        for l in lines {
            thread::sleep(delay);
            match parse_line(&l) {
                Ok(Some(e)) => { let _ = tx.send(Msg::Ev(e)); }
                Ok(None) => {}
                Err(e) => { let _ = tx.send(Msg::BadLine(e)); }
            }
        }
        let _ = tx.send(Msg::Closed);
    });
}

/// Built-in demo script. Shows streaming, tool calls and a hash-bound review.
pub fn demo_script() -> Vec<String> {
    let hunks = vec![
        Hunk { id: "h1".into(), header: "@@ -12,4 +12,6 @@ hero".into(), lines: vec![
            " <section class=\"hero\">".into(),
            "-  <h1>Welcome</h1>".into(),
            "+  <h1>Design in the open</h1>".into(),
            "+  <p class=\"lede\">Local-first. Real code.</p>".into(),
            " </section>".into()] },
        Hunk { id: "h2".into(), header: "@@ -40,3 +42,3 @@ cta".into(), lines: vec![
            "-  <a class=\"btn\">Sign up</a>".into(),
            "+  <a class=\"btn btn-primary\">Download Somnia</a>".into()] },
    ];
    let hash = review_hash("index.html", &hunks);
    let ev = |v: serde_json::Value| v.to_string();
    vec![
        ev(serde_json::json!({"v":1,"type":"session_started","task_id":"t-20261010-0042","prompt":"Rewrite the hero copy and make the CTA primary","branch":"somnia/task/t-20261010-0042","base_sha":"7dc7b652ece9ab62629078a887c915ff3c700b79","model":"claude-sonnet (BYOK)"})),
        ev(serde_json::json!({"v":1,"type":"text_delta","text":"I'll read the landing page first, "})),
        ev(serde_json::json!({"v":1,"type":"text_delta","text":"then tighten the hero copy.\n"})),
        ev(serde_json::json!({"v":1,"type":"tool_call","id":"c1","name":"read_file","summary":"index.html"})),
        ev(serde_json::json!({"v":1,"type":"tool_result","id":"c1","status":"ok","summary":"index.html (212 lines)"})),
        ev(serde_json::json!({"v":1,"type":"status","cost_usd":0.0031,"tokens":2140,"branch":"somnia/task/t-20261010-0042"})),
        ev(serde_json::json!({"v":1,"type":"tool_call","id":"c2","name":"search","summary":"\"btn\" in *.css"})),
        ev(serde_json::json!({"v":1,"type":"tool_result","id":"c2","status":"ok","summary":"3 matches"})),
        ev(serde_json::json!({"v":1,"type":"text_delta","text":"Proposing two changes: the headline and the CTA.\n"})),
        ev(serde_json::json!({"v":1,"type":"tool_call","id":"c3","name":"propose_edit","summary":"index.html (2 hunks)"})),
        ev(serde_json::json!({"v":1,"type":"status","cost_usd":0.0094,"tokens":5870})),
        ev(serde_json::json!({"v":1,"type":"diff_proposed","review_id":"rv-1","file":"index.html","content_hash":hash,"hunks":hunks})),
    ]
}

pub fn demo_finish() -> Vec<String> {
    let ev = |v: serde_json::Value| v.to_string();
    vec![
        ev(serde_json::json!({"v":1,"type":"tool_result","id":"c3","status":"ok","summary":"index.html (2 hunks applied)"})),
        ev(serde_json::json!({"v":1,"type":"status","cost_usd":0.0121,"tokens":7032})),
        ev(serde_json::json!({"v":1,"type":"done","status":"done","result_sha":"b3a91c04e2f7d5aa1c0d9e8f77a6b5c4d3e2f1a0","summary":"Hero copy rewritten, CTA made primary."})),
    ]
}
