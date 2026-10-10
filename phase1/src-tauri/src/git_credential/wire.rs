//! Wire format shared by the host (lease server) and the helper binary.
//!
//! Std + serde only: the helper binary includes this file by path and must stay tiny and free of
//! Tauri. Two layers:
//! 1. git's credential protocol on the helper's stdin/stdout (`key=value` lines),
//! 2. one JSON line each way over the private lease endpoint (Unix socket / named pipe).
//! The nonce proves the caller was started by the job that holds the lease; the token travels only
//! in the response line and in the helper's stdout back to git.
#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use std::fmt;

pub const ENV_ENDPOINT: &str = "SOMNIA_GIT_LEASE_ENDPOINT";
pub const ENV_NONCE: &str = "SOMNIA_GIT_LEASE_NONCE";
pub const MAX_LINE: usize = 4096;
pub const MAX_GIT_INPUT: usize = 8192;

/// What git tells a helper (`credential` protocol, subset). Everything optional is untrusted input.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Query {
    pub protocol: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
}

/// Parses git's `key=value` lines up to the first blank line or EOF. NUL, over-long input and lines
/// without `=` are rejected; unknown keys are ignored (git adds new ones over time).
pub fn parse_git_query(input: &str) -> Result<Query, ()> {
    if input.len() > MAX_GIT_INPUT || input.contains('\0') {
        return Err(());
    }
    let mut q = Query::default();
    for line in input.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.is_empty() {
            break;
        }
        let (k, v) = line.split_once('=').ok_or(())?;
        match k {
            "protocol" => q.protocol = Some(v.to_owned()),
            "host" => q.host = Some(v.to_owned()),
            "path" => q.path = Some(v.to_owned()),
            _ => {}
        }
    }
    Ok(q)
}

/// Lower-cases and strips one trailing `.git` and leading `/`: the comparison key for a repo path.
pub fn path_key(path: &str) -> String {
    let p = path.trim_start_matches('/');
    let p = p.strip_suffix(".git").unwrap_or(p);
    p.to_ascii_lowercase()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Op {
    Get,
    Erase,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Request {
    pub v: u8,
    pub nonce: String,
    pub op: Op,
    pub protocol: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
}
impl fmt::Debug for Request {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Request").field("op", &self.op).field("host", &self.host).field("path", &self.path).finish_non_exhaustive()
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Response {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// Machine-readable refusal reason (no secrets, no paths).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}
impl fmt::Debug for Response {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Response").field("ok", &self.ok).field("code", &self.code).finish_non_exhaustive()
    }
}
impl Response {
    pub fn refuse(code: &str) -> Self {
        Self { ok: false, username: None, password: None, code: Some(code.to_owned()) }
    }
    pub fn ack() -> Self {
        Self { ok: true, username: None, password: None, code: None }
    }
}

pub fn request_line(nonce: &str, op: Op, q: &Query) -> String {
    let r = Request { v: 1, nonce: nonce.to_owned(), op, protocol: q.protocol.clone(), host: q.host.clone(), path: q.path.clone() };
    let mut s = serde_json::to_string(&r).unwrap_or_default();
    s.push('\n');
    s
}

/// What the helper prints for git. `quit=1` stops git from asking any further helper.
pub fn render_git_response(username: &str, password: &str) -> String {
    format!("username={username}\npassword={password}\nquit=1\n")
}

/// Constant-time equality for nonces (no early exit on the first differing byte).
pub fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = (a.len() ^ b.len()) as u8;
    for i in 0..a.len().max(b.len()) {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}
