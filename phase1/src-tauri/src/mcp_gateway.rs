//! Loopback HTTP gateway that lets an external MCP client talk to
//! Somnia's in-app MCP server (phase1/src/lib/agent/studioMcpServer.ts). See docs/MCP-SERVER.md.
//!
//! Rules: bind 127.0.0.1 only; random per-session bearer token compared in constant time; POST to
//! `/mcp` only; bodies capped at 256 KiB; one request per connection; the actual JSON-RPC handling
//! is delegated to a `Forward` function (the Tauri side sends it to the WebView and awaits the
//! answer). A new token is created every time the gateway starts, so turning the switch off and on
//! rotates it. Notifications (empty answer) are returned as 202 with no body.
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

pub const MAX_BODY: usize = 256 * 1024;
const MAX_HEAD: usize = 16 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(30);

/// Takes one JSON-RPC message, returns the response text or None for notifications.
pub type Forward = Arc<dyn Fn(String) -> Pin<Box<dyn Future<Output = Option<String>> + Send>> + Send + Sync>;

pub struct Gateway {
    pub addr: SocketAddr,
    pub token: String,
    stop: Option<oneshot::Sender<()>>,
}

impl Gateway {
    pub fn stop(mut self) { if let Some(s) = self.stop.take() { let _ = s.send(()); } }
}
impl Drop for Gateway {
    fn drop(&mut self) { if let Some(s) = self.stop.take() { let _ = s.send(()); } }
}

pub fn new_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// Constant-time equality for equal-length secrets; unequal length returns false immediately.
pub fn token_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() { return false; }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub async fn start(forward: Forward) -> Result<Gateway, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| format!("Could not open the local port: {e}"))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let token = new_token();
    let (tx, mut rx) = oneshot::channel::<()>();
    let t = token.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut rx => break,
                accepted = listener.accept() => {
                    let Ok((sock, peer)) = accepted else { continue };
                    if !peer.ip().is_loopback() { continue; }
                    let (f, t) = (forward.clone(), t.clone());
                    tokio::spawn(async move { let _ = tokio::time::timeout(IO_TIMEOUT, serve(sock, &t, f)).await; });
                }
            }
        }
    });
    Ok(Gateway { addr, token, stop: Some(tx) })
}

async fn reply(sock: &mut TcpStream, status: &str, body: &str) {
    let msg = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}", body.len());
    let _ = sock.write_all(msg.as_bytes()).await;
    let _ = sock.shutdown().await;
}

/// Parsed request head: method, path, authorization value, content-length.
pub(crate) fn parse_head(head: &str) -> Option<(String, String, Option<String>, Option<usize>)> {
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split(' ');
    let (method, path) = (first.next()?.to_string(), first.next()?.to_string());
    let (mut auth, mut len) = (None, None);
    for l in lines {
        let Some((k, v)) = l.split_once(':') else { continue };
        match k.trim().to_ascii_lowercase().as_str() {
            "authorization" => auth = Some(v.trim().to_string()),
            "content-length" => len = v.trim().parse().ok(),
            _ => {}
        }
    }
    Some((method, path, auth, len))
}

async fn serve(mut sock: TcpStream, token: &str, forward: Forward) {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") { break i; }
        if buf.len() > MAX_HEAD { return reply(&mut sock, "431 Request Header Fields Too Large", "{}").await; }
        match sock.read(&mut tmp).await { Ok(0) | Err(_) => return, Ok(n) => buf.extend_from_slice(&tmp[..n]) }
    };
    let Ok(head) = std::str::from_utf8(&buf[..head_end]) else { return reply(&mut sock, "400 Bad Request", "{}").await };
    let Some((method, path, auth, len)) = parse_head(head) else { return reply(&mut sock, "400 Bad Request", "{}").await };
    let authorized = auth.as_deref().and_then(|a| a.strip_prefix("Bearer ")).map(|t| token_eq(t, token)).unwrap_or(false);
    if !authorized { return reply(&mut sock, "401 Unauthorized", r#"{"error":"missing or wrong token"}"#).await; }
    if path != "/mcp" { return reply(&mut sock, "404 Not Found", "{}").await; }
    if method != "POST" { return reply(&mut sock, "405 Method Not Allowed", "{}").await; }
    let Some(len) = len else { return reply(&mut sock, "411 Length Required", "{}").await };
    if len > MAX_BODY { return reply(&mut sock, "413 Payload Too Large", "{}").await; }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        match sock.read(&mut tmp).await { Ok(0) | Err(_) => return, Ok(n) => body.extend_from_slice(&tmp[..n]) }
    }
    body.truncate(len);
    let Ok(text) = String::from_utf8(body) else { return reply(&mut sock, "400 Bad Request", "{}").await };
    match forward(text).await {
        Some(out) => reply(&mut sock, "200 OK", &out).await,
        None => reply(&mut sock, "202 Accepted", "").await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn post(addr: SocketAddr, auth: Option<&str>, path: &str, body: &str) -> String {
        let mut s = TcpStream::connect(addr).await.unwrap();
        let a = auth.map(|t| format!("Authorization: Bearer {t}\r\n")).unwrap_or_default();
        // The server may answer and close before reading a large body, so write/read errors are tolerated.
        let _ = s.write_all(format!("POST {path} HTTP/1.1\r\nHost: x\r\n{a}Content-Length: {}\r\n\r\n{body}", body.len()).as_bytes()).await;
        let mut out = Vec::new();
        let _ = s.read_to_end(&mut out).await;
        String::from_utf8_lossy(&out).into_owned()
    }
    fn echo() -> Forward {
        Arc::new(|m: String| Box::pin(async move { if m.contains("notifications/") { None } else { Some(format!("{{\"echo\":{m}}}")) } }))
    }

    #[test]
    fn token_helpers() {
        assert_eq!(new_token().len(), 64);
        assert_ne!(new_token(), new_token());
        assert!(token_eq("abc", "abc") && !token_eq("abc", "abd") && !token_eq("abc", "ab"));
        let (m, p, a, l) = parse_head("POST /mcp HTTP/1.1\r\nHost: x\r\nauthorization: Bearer t\r\nContent-Length: 5").unwrap();
        assert_eq!((m.as_str(), p.as_str(), a.as_deref(), l), ("POST", "/mcp", Some("Bearer t"), Some(5)));
    }

    #[tokio::test]
    async fn gateway_enforces_token_path_method_and_size() {
        let g = start(echo()).await.unwrap();
        assert!(g.addr.ip().is_loopback());
        assert!(post(g.addr, None, "/mcp", "{}").await.starts_with("HTTP/1.1 401"));
        assert!(post(g.addr, Some("wrong"), "/mcp", "{}").await.starts_with("HTTP/1.1 401"));
        assert!(post(g.addr, Some(&g.token), "/other", "{}").await.starts_with("HTTP/1.1 404"));
        let ok = post(g.addr, Some(&g.token), "/mcp", r#"{"id":1}"#).await;
        assert!(ok.starts_with("HTTP/1.1 200") && ok.ends_with(r#"{"echo":{"id":1}}"#), "{ok}");
        assert!(post(g.addr, Some(&g.token), "/mcp", r#"{"method":"notifications/initialized"}"#).await.starts_with("HTTP/1.1 202"));
        // Declare the oversized length without sending an unread body. This avoids Windows
        // TCP resets discarding the 413 response and makes the guard deterministic in CI.
        let too_large = raw(g.addr, &format!("POST /mcp HTTP/1.1\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n", g.token, MAX_BODY + 1)).await;
        assert!(too_large.starts_with("HTTP/1.1 413"), "{too_large}");
        let addr = g.addr;
        g.stop();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(TcpStream::connect(addr).await.is_err());
    }

    async fn raw(addr: SocketAddr, request: &str) -> String {
        let mut socket = TcpStream::connect(addr).await.unwrap();
        socket.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        tokio::time::timeout(Duration::from_secs(2), socket.read_to_string(&mut response))
            .await.unwrap().unwrap();
        response
    }

    #[tokio::test]
    async fn gateway_rejects_method_missing_length_and_invalid_utf8_without_forwarding() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let forward: Forward = Arc::new(move |_| {
            count.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Some("{}".to_string()) })
        });
        let gateway = start(forward).await.unwrap();
        let head = format!("Host: localhost\r\nAuthorization: Bearer {}\r\n", gateway.token);
        let response = raw(gateway.addr, &format!("GET /mcp HTTP/1.1\r\n{head}Content-Length: 0\r\n\r\n")).await;
        assert!(response.starts_with("HTTP/1.1 405"), "{response}");
        let response = raw(gateway.addr, &format!("POST /mcp HTTP/1.1\r\n{head}\r\n")).await;
        assert!(response.starts_with("HTTP/1.1 411"), "{response}");
        let mut socket = TcpStream::connect(gateway.addr).await.unwrap();
        let mut request = format!("POST /mcp HTTP/1.1\r\n{head}Content-Length: 1\r\n\r\n").into_bytes();
        request.push(0xff);
        socket.write_all(&request).await.unwrap();
        let mut response = String::new();
        tokio::time::timeout(Duration::from_secs(2), socket.read_to_string(&mut response)).await.unwrap().unwrap();
        assert!(response.starts_with("HTTP/1.1 400"), "{response}");
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn gateway_waits_for_fragmented_body_and_preserves_rpc_bytes() {
        let gateway = start(Arc::new(|message| Box::pin(async move { Some(message) }))).await.unwrap();
        let body = r#"{"jsonrpc":"2.0","id":42,"method":"tools/list"}"#;
        let mut socket = TcpStream::connect(gateway.addr).await.unwrap();
        socket.write_all(format!("POST /mcp HTTP/1.1\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n", gateway.token, body.len()).as_bytes()).await.unwrap();
        for chunk in body.as_bytes().chunks(7) { socket.write_all(chunk).await.unwrap(); }
        let mut response = String::new();
        tokio::time::timeout(Duration::from_secs(2), socket.read_to_string(&mut response)).await.unwrap().unwrap();
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert_eq!(response.split_once("\r\n\r\n").unwrap().1, body);
    }

    #[tokio::test]
    async fn gateway_restart_rotates_token_and_drop_closes_listener() {
        let old = start(echo()).await.unwrap();
        let old_token = old.token.clone();
        let old_addr = old.addr;
        drop(old);
        // A refused connect takes about 2 s on Windows (SYN retries), so allow several attempts.
        tokio::time::timeout(Duration::from_secs(15), async {
            while TcpStream::connect(old_addr).await.is_ok() { tokio::task::yield_now().await; }
        }).await.unwrap();
        let new = start(echo()).await.unwrap();
        assert_ne!(old_token, new.token);
        assert!(post(new.addr, Some(&old_token), "/mcp", "{}").await.starts_with("HTTP/1.1 401"));
        assert!(post(new.addr, Some(&new.token), "/mcp", "{}").await.starts_with("HTTP/1.1 200"));
    }

}
