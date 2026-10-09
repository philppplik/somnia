//! DRAFT (unverified, needs CI): MCP client over HTTP ("Streamable HTTP" POST, JSON or SSE reply).
//! Independent of rmcp so it does not depend on rmcp's transport features. Desktop only (reqwest).
//!
//! Rules: https only, except http to loopback; no redirects; 20 s connect / 60 s total timeout;
//! replies capped at 1 MiB; the optional bearer token comes from the vault entry named in the
//! server config and is never logged; results use the same 64 KiB text cap as stdio servers.
//! A reply may be `application/json` or `text/event-stream`; for SSE the whole (capped) body is
//! read and the `data:` event carrying our request id is used. Server-initiated requests are ignored.
use crate::mcp_host::{McpToolInfo, MAX_RESULT_BYTES};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Map, Value};
use std::time::Duration;

const MAX_REPLY: usize = 1024 * 1024;
const PROTOCOL: &str = "2025-06-18";

pub fn validate_url(url: &str) -> Result<reqwest::Url, String> {
    let u = reqwest::Url::parse(url).map_err(|_| "Server URL is not valid.".to_string())?;
    let loopback = matches!(u.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]"));
    match u.scheme() {
        "https" => {}
        "http" if loopback => {}
        _ => return Err("Server URL must use https (http is allowed for localhost only).".into()),
    }
    if !u.username().is_empty() || u.password().is_some() { return Err("Server URL must not contain credentials.".into()); }
    Ok(u)
}

/// Pick the JSON-RPC message with `id` out of a text/event-stream body.
pub fn sse_pick(body: &str, id: u64) -> Option<Value> {
    let mut data = String::new();
    let mut found = None;
    for line in body.lines().chain(std::iter::once("")) {
        if let Some(d) = line.strip_prefix("data:") { data.push_str(d.trim_start()); continue; }
        if line.is_empty() && !data.is_empty() {
            if let Ok(v) = serde_json::from_str::<Value>(&data) { if v.get("id").and_then(Value::as_u64) == Some(id) { found = Some(v); } }
            data.clear();
        }
    }
    found
}

pub struct HttpMcpClient {
    http: reqwest::Client,
    url: reqwest::Url,
    token: Option<String>,
    session: Option<String>,
    next_id: u64,
}

impl HttpMcpClient {
    pub fn new(url: &str, token: Option<String>) -> Result<Self, String> {
        let url = validate_url(url)?;
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(60))
            .build().map_err(|_| "Could not create the HTTP client.".to_string())?;
        Ok(Self { http, url, token, session: None, next_id: 0 })
    }

    async fn rpc(&mut self, method: &str, params: Value, notify: bool) -> Result<Value, String> {
        let mut msg = json!({"jsonrpc": "2.0", "method": method, "params": params});
        let id = if notify { None } else { self.next_id += 1; Some(self.next_id) };
        if let Some(id) = id { msg["id"] = json!(id); }
        let mut req = self.http.post(self.url.clone()).header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json, text/event-stream").header("MCP-Protocol-Version", PROTOCOL).json(&msg);
        if let Some(t) = &self.token { req = req.header(AUTHORIZATION, format!("Bearer {t}")); }
        if let Some(s) = &self.session { req = req.header("Mcp-Session-Id", s); }
        let resp = req.send().await.map_err(|_| "Could not reach the server.".to_string())?;
        if !resp.status().is_success() { return Err(format!("Server answered HTTP {}.", resp.status().as_u16())); }
        if let Some(s) = resp.headers().get("Mcp-Session-Id").and_then(|v| v.to_str().ok()) { self.session = Some(s.to_string()); }
        let sse = resp.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).is_some_and(|c| c.starts_with("text/event-stream"));
        if notify { return Ok(Value::Null); }
        let bytes = resp.bytes().await.map_err(|_| "Reply was interrupted.".to_string())?;
        if bytes.len() > MAX_REPLY { return Err("Reply is too large.".into()); }
        let text = String::from_utf8_lossy(&bytes);
        let v: Value = if sse { sse_pick(&text, id.unwrap_or(0)).ok_or("No answer in the event stream.")? } else { serde_json::from_str(&text).map_err(|_| "Reply is not JSON.".to_string())? };
        if let Some(e) = v.get("error") { return Err(e.get("message").and_then(Value::as_str).unwrap_or("Server error.").chars().take(300).collect()); }
        Ok(v.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn initialize(&mut self) -> Result<(), String> {
        self.rpc("initialize", json!({"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "somnia", "version": env!("CARGO_PKG_VERSION")}}), false).await?;
        self.rpc("notifications/initialized", json!({}), true).await.map(|_| ())
    }

    pub async fn tools(&mut self, server: &str) -> Result<Vec<McpToolInfo>, String> {
        let r = self.rpc("tools/list", json!({}), false).await?;
        Ok(r.get("tools").and_then(Value::as_array).map(|a| a.iter().take(200).filter_map(|t| Some(McpToolInfo {
            server: server.to_string(),
            name: t.get("name")?.as_str()?.to_string(),
            description: t.get("description").and_then(Value::as_str).unwrap_or("").chars().take(2000).collect(),
            input_schema: t.get("inputSchema").cloned().unwrap_or_else(|| json!({"type": "object"})),
        })).collect()).unwrap_or_default())
    }

    pub async fn call(&mut self, tool: &str, args: Map<String, Value>) -> Result<String, String> {
        let r = self.rpc("tools/call", json!({"name": tool, "arguments": args}), false).await?;
        let mut out = String::new();
        for b in r.get("content").and_then(Value::as_array).into_iter().flatten() {
            match (b.get("type").and_then(Value::as_str), b.get("text").and_then(Value::as_str)) {
                (Some("text"), Some(t)) => { out.push_str(t); out.push('\n'); }
                (ty, _) => out.push_str(&format!("[{} content omitted]\n", ty.unwrap_or("non-text"))),
            }
            if out.len() > MAX_RESULT_BYTES * 2 { break; }
        }
        let mut out = out.trim_end().to_string();
        if out.len() > MAX_RESULT_BYTES { let mut e = MAX_RESULT_BYTES; while !out.is_char_boundary(e) { e -= 1; } out.truncate(e); out.push_str("\n[truncated]"); }
        if r.get("isError").and_then(Value::as_bool) == Some(true) { Err(out) } else { Ok(out) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_rules() {
        assert!(validate_url("https://example.com/mcp").is_ok());
        assert!(validate_url("http://127.0.0.1:8080/mcp").is_ok());
        assert!(validate_url("http://localhost/mcp").is_ok());
        for bad in ["http://example.com/mcp", "ftp://x/y", "https://user:pw@example.com/", "nonsense"] { assert!(validate_url(bad).is_err(), "{bad}"); }
    }

    #[test]
    fn sse_picks_the_answer_for_our_id() {
        let body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":3,\n data: \"result\":{\"ok\":true}}\n\n";
        assert!(sse_pick(body, 2).is_none());
        let body2 = "data: {\"jsonrpc\":\"2.0\",\"id\":3,\"result\":{\"ok\":true}}\n\n";
        assert_eq!(sse_pick(body2, 3).unwrap()["result"]["ok"], true);
    }
}
