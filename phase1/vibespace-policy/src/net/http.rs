//! Minimal HTTP/1.x head parsing for the proxy. Buffers are hard-capped; anything malformed
//! is refused without detail.

use std::io::Read;
use std::net::TcpStream;

pub struct Head {
    pub is_connect: bool,
    /// Raw first line.
    pub request_line: String,
    /// Full header block without the terminating CRLFCRLF (CONNECT) or the re-issued head
    /// (plain HTTP).
    pub headers: Vec<(String, String)>,
    /// Bytes already read past the header (request body prefix, capped callers).
    pub body: Vec<u8>,
}

impl Head {
    /// `host:port` from CONNECT authority or the absolute-URI/Host header. Ports other than
    /// the configured set are refused by the caller.
    pub fn target_host_port(&self) -> Option<(String, u16)> {
        if self.is_connect {
            let authority = self.request_line.split_whitespace().nth(1)?;
            return split_host_port(authority, 443);
        }
        // Absolute-URI form: METHOD http://host[:port]/path HTTP/1.1
        let target = self.request_line.split_whitespace().nth(1)?;
        if let Some(rest) = target.strip_prefix("http://") {
            let authority = rest.split('/').next()?;
            if authority.contains('@') {
                return None;
            }
            return split_host_port(authority, 80);
        }
        // Origin-form with Host header.
        let host = self
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("host"))
            .map(|(_, v)| v.trim())?;
        split_host_port(host, 80)
    }

    /// Re-issue as an origin-form request (plain HTTP forwarding). Hop-by-hop proxy headers
    /// are dropped; the body bytes read so far are appended by the caller.
    pub fn origin_form(&self) -> String {
        let mut parts = self.request_line.split_whitespace();
        let method = parts.next().unwrap_or("GET");
        let target = parts.next().unwrap_or("/");
        let version = parts.next().unwrap_or("HTTP/1.1");
        let path = match target.strip_prefix("http://") {
            Some(rest) => match rest.find('/') {
                Some(i) => &rest[i..],
                None => "/",
            },
            None => target,
        };
        let mut out = format!("{method} {path} {version}\r\n");
        for (k, v) in &self.headers {
            if k.eq_ignore_ascii_case("proxy-connection")
                || k.eq_ignore_ascii_case("proxy-authorization")
                || k.eq_ignore_ascii_case("connection")
            {
                continue;
            }
            out.push_str(k);
            out.push_str(": ");
            out.push_str(v);
            out.push_str("\r\n");
        }
        out
    }
}

fn split_host_port(authority: &str, default_port: u16) -> Option<(String, u16)> {
    let authority = authority.trim();
    if authority.is_empty() || authority.len() > 512 {
        return None;
    }
    match authority.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => {
            let port: u16 = p.parse().ok()?;
            Some((h.to_ascii_lowercase(), port))
        }
        Some((h, _)) => Some((h.trim_matches(&['[', ']'][..]).to_ascii_lowercase(), default_port)),
        None => Some((authority.to_ascii_lowercase(), default_port)),
    }
}

/// Read one header block (up to `cap` bytes). Over-cap or malformed input fails.
pub fn read_head(stream: &mut TcpStream, cap: usize) -> std::io::Result<Head> {
    let mut buf = Vec::with_capacity(4096);
    let mut byte = [0u8; 1];
    let mut end = None;
    while buf.len() < cap {
        match stream.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                buf.push(byte[0]);
                if buf.len() >= 4 && &buf[buf.len() - 4..] == b"\r\n\r\n" {
                    end = Some(buf.len() - 4);
                    break;
                }
            }
            Err(e) => return Err(e),
        }
    }
    let end = end.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "head"))?;
    let text = String::from_utf8_lossy(&buf[..end]).into_owned();
    let body = buf[end + 4..].to_vec();
    let mut lines = text.split("\r\n");
    let request_line = lines.next().unwrap_or("").to_string();
    if request_line.is_empty() || request_line.len() > 2048 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "line"));
    }
    let is_connect = request_line
        .split_whitespace()
        .next()
        .map(|m| m.eq_ignore_ascii_case("connect"))
        .unwrap_or(false);
    let mut headers = Vec::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    if headers.len() > 64 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "count"));
    }
    Ok(Head {
        is_connect,
        request_line,
        headers,
        body,
    })
}
