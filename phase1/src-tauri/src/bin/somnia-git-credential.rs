//! Private git credential helper. Not a general-purpose helper: it answers only for the lease of the
//! Somnia job that started git, over a private endpoint, and prints nothing else anywhere.
//! git calls it as `<helper> get|store|erase` with the credential query on stdin.
//! Failure is silent and generic (exit 1): git then simply has no credential, and the host reports
//! the typed reason. No token, path or lease detail is ever written to stderr.
#[path = "../git_credential/wire.rs"]
mod wire;

use std::io::{BufRead, BufReader, Read, Write};

fn fail() -> ! {
    eprintln!("somnia credential helper: unavailable");
    std::process::exit(1);
}

#[cfg(unix)]
fn connect(endpoint: &str) -> std::io::Result<impl Read + Write> {
    std::os::unix::net::UnixStream::connect(endpoint).and_then(|s| {
        s.set_read_timeout(Some(std::time::Duration::from_secs(10)))?;
        s.set_write_timeout(Some(std::time::Duration::from_secs(10)))?;
        Ok(s)
    })
}
#[cfg(windows)]
fn connect(endpoint: &str) -> std::io::Result<impl Read + Write> {
    std::fs::OpenOptions::new().read(true).write(true).open(endpoint)
}

fn main() {
    let op = match std::env::args().nth(1).as_deref() {
        Some("get") => wire::Op::Get,
        Some("erase") => wire::Op::Erase,
        // `store` (and anything else) is a no-op: the host owns token storage.
        _ => return,
    };
    let (Ok(endpoint), Ok(nonce)) = (std::env::var(wire::ENV_ENDPOINT), std::env::var(wire::ENV_NONCE)) else { fail() };
    let mut input = String::new();
    if std::io::stdin().take(wire::MAX_GIT_INPUT as u64 + 1).read_to_string(&mut input).is_err() {
        fail();
    }
    let Ok(query) = wire::parse_git_query(&input) else { fail() };
    let Ok(mut conn) = connect(&endpoint) else { fail() };
    if conn.write_all(wire::request_line(&nonce, op, &query).as_bytes()).is_err() || conn.flush().is_err() {
        fail();
    }
    let mut line = String::new();
    let mut reader = BufReader::new(conn.take(wire::MAX_LINE as u64));
    if reader.read_line(&mut line).is_err() {
        fail();
    }
    let Ok(resp) = serde_json::from_str::<wire::Response>(line.trim_end()) else { fail() };
    if !resp.ok {
        fail();
    }
    if op == wire::Op::Get {
        let (Some(u), Some(p)) = (resp.username.as_deref(), resp.password.as_deref()) else { fail() };
        if u.contains(['\n', '\0']) || p.contains(['\n', '\0']) {
            fail();
        }
        let mut out = std::io::stdout().lock();
        if out.write_all(wire::render_git_response(u, p).as_bytes()).is_err() || out.flush().is_err() {
            fail();
        }
    }
}
