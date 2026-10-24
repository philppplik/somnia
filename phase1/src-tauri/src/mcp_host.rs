//! MCP client host (Rust side). Servers run here, never in the WebView.
//!
//! Safety rules enforced in this module:
//! - a server is a user-approved absolute executable path plus an argument array; no shell;
//! - the child process gets a cleared environment with only a few neutral variables plus
//!   the explicit `env` entries from the approved config;
//! - tool results are capped and every call has a timeout;
//! - nothing starts on its own: the caller starts a server after the user enabled it;
//! - there is NO direct process spawn here: a stdio server starts only through
//!   `McpBroker::spawn_stdio` (broker consent + sandbox) and is attached as a transport. The
//!   child-process transport of rmcp is not compiled in, so a direct path cannot come back by accident.
use crate::mcp_broker::{Choice, McpBroker, StopGuard};
use rmcp::model::{CallToolRequestParams, ContentBlock};
use rmcp::service::RunningService;
use rmcp::transport::IntoTransport;
use rmcp::{RoleClient, ServiceExt};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use vibespace_policy as policy;
use std::path::Path;
use std::time::Duration;
use tokio::sync::Mutex;

pub const MAX_RESULT_BYTES: usize = 64 * 1024;
pub const CALL_TIMEOUT: Duration = Duration::from_secs(60);
pub const START_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_TOOLS: usize = 200;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct McpServerConfig {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct McpToolInfo {
    pub server: String,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    /// Hex digest of name + description + schema: what an `AllowForRun` MCP grant is bound to.
    #[serde(default)]
    pub schema_digest: String,
}

/// Digest pinning one exact tool definition. A changed description or schema changes it.
pub fn tool_schema_digest(name: &str, description: &str, schema: &Value) -> policy::ArgsDigest {
    policy::ArgsDigest::builder(policy::ActionKind::Mcp, "tool-definition")
        .part("name", name.as_bytes())
        .part("description", description.as_bytes())
        .part("schema", schema.to_string().as_bytes())
        .finish()
}

impl McpToolInfo {
    pub fn new(server: &str, name: String, description: String, input_schema: Value) -> Self {
        let schema_digest = tool_schema_digest(&name, &description, &input_schema).to_hex();
        Self { server: server.to_string(), name, description, input_schema, schema_digest }
    }
}

pub fn validate_config(cfg: &McpServerConfig) -> Result<(), String> {
    if cfg.id.is_empty() || cfg.id.len() > 32 || !cfg.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Server id must be 1-32 characters: a-z, 0-9, hyphen.".into());
    }
    let p = Path::new(&cfg.command);
    if !p.is_absolute() || !p.is_file() {
        return Err("Server command must be an absolute path to an existing file.".into());
    }
    if cfg.args.len() > 32 || cfg.args.iter().any(|a| a.len() > 2048 || a.contains('\0')) {
        return Err("Too many or invalid arguments.".into());
    }
    if cfg.env.len() > 16 || cfg.env.iter().any(|(k, v)| k.is_empty() || k.contains(['=', '\0']) || v.contains('\0') || v.len() > 4096) {
        return Err("Invalid environment entries.".into());
    }
    Ok(())
}

fn cap(mut s: String) -> String {
    if s.len() > MAX_RESULT_BYTES {
        let mut end = MAX_RESULT_BYTES;
        while !s.is_char_boundary(end) { end -= 1; }
        s.truncate(end);
        s.push_str("\n[truncated]");
    }
    s
}

/// Approved server list on disk (app config dir). Saving a server is the user's approval to run it.
pub fn load_servers(path: &Path) -> Result<Vec<McpServerConfig>, String> {
    match std::fs::read_to_string(path) {
        Ok(t) => serde_json::from_str(&t).map_err(|_| "MCP server list is corrupt.".to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err("Could not read MCP server list.".into()),
    }
}
pub fn save_servers(path: &Path, list: &[McpServerConfig]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(list).map_err(|_| "Could not encode MCP server list.".to_string())?;
    let tmp = path.with_extension("json.tmp");
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|_| "Could not create config directory.".to_string())?; }
    std::fs::write(&tmp, text).map_err(|_| "Could not write MCP server list.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| "Could not replace MCP server list.".to_string())
}
pub fn upsert_server(list: &mut Vec<McpServerConfig>, cfg: McpServerConfig) -> Result<(), String> {
    validate_config(&cfg)?;
    if list.iter().all(|c| c.id != cfg.id) && list.len() >= 16 { return Err("At most 16 MCP servers.".into()); }
    list.retain(|c| c.id != cfg.id);
    list.push(cfg);
    list.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(())
}

type Client = RunningService<RoleClient, ()>;

struct Entry {
    client: Client,
    /// Kills the sandboxed process tree when the entry is dropped (None for in-memory transports).
    _guard: Option<StopGuard>,
}

#[derive(Default)]
pub struct McpHost {
    clients: Mutex<HashMap<String, Entry>>,
    /// Tool definitions as last listed, for the digest binding of tool calls.
    digests: std::sync::Mutex<HashMap<(String, String), policy::ArgsDigest>>,
}

impl McpHost {
    pub fn new() -> Self { Self::default() }

    /// Start an approved stdio server THROUGH THE BROKER: `propose_exec` consent, sandboxed
    /// session, then attach. Fails closed (stable error code) when consent is missing/denied or
    /// the platform cannot isolate. `choice` is the user's answer relayed from the trusted editor.
    pub async fn start_via_broker(&self, broker: Arc<McpBroker>, cfg: &McpServerConfig, choice: Option<Choice>) -> Result<(), String> {
        validate_config(cfg)?;
        let cfg2 = cfg.clone();
        let server = tokio::task::spawn_blocking(move || broker.spawn_stdio(&cfg2, choice))
            .await
            .map_err(|_| "mcp_spawn_failed".to_string())??;
        self.attach_guarded(&cfg.id, server.io, Some(server.guard)).await
    }

    /// Connect over any transport (used for tests and future HTTP).
    pub async fn attach<T, E, A>(&self, id: &str, transport: T) -> Result<(), String>
    where
        T: IntoTransport<RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        self.attach_guarded(id, transport, None).await
    }

    async fn attach_guarded<T, E, A>(&self, id: &str, transport: T, guard: Option<StopGuard>) -> Result<(), String>
    where
        T: IntoTransport<RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let client = tokio::time::timeout(START_TIMEOUT, ().serve(transport))
            .await
            .map_err(|_| "Server did not answer in time.".to_string())?
            .map_err(|e| format!("Server handshake failed: {e}"))?;
        if let Some(old) = self.clients.lock().await.insert(id.to_string(), Entry { client, _guard: guard }) {
            let _ = old.client.cancel().await;
        }
        Ok(())
    }

    pub async fn tools(&self, id: &str) -> Result<Vec<McpToolInfo>, String> {
        let g = self.clients.lock().await;
        let c = &g.get(id).ok_or("Server is not running.")?.client;
        let list = tokio::time::timeout(CALL_TIMEOUT, c.list_all_tools())
            .await
            .map_err(|_| "Tool listing timed out.".to_string())?
            .map_err(|e| format!("Tool listing failed: {e}"))?;
        let infos: Vec<McpToolInfo> = list.into_iter().take(MAX_TOOLS).map(|t| McpToolInfo::new(
            id,
            t.name.to_string(),
            t.description.map(|d| d.chars().take(2000).collect()).unwrap_or_default(),
            Value::Object((*t.input_schema).clone()),
        )).collect();
        self.remember_digests(id, &infos);
        Ok(infos)
    }

    pub(crate) fn remember_digests(&self, server: &str, tools: &[McpToolInfo]) {
        if let Ok(mut m) = self.digests.lock() {
            m.retain(|(s, _), _| s != server);
            for t in tools {
                if let Some(d) = policy::ArgsDigest::from_hex(&t.schema_digest) { m.insert((server.to_string(), t.name.clone()), d); }
            }
        }
    }

    /// Call one tool THROUGH THE BROKER: `McpRoute::propose_call` (digest-bound grant or the
    /// user's relayed answer), one-time token, then the call under the permit. The tool must
    /// have been listed (that is where its schema digest comes from).
    pub async fn call_via_broker(&self, broker: &McpBroker, id: &str, tool: &str, args: Map<String, Value>, choice: Option<Choice>) -> Result<String, String> {
        let digest = self.digests.lock().ok().and_then(|m| m.get(&(id.to_string(), tool.to_string())).copied()).ok_or("mcp_unknown_tool")?;
        let canonical = serde_json::to_vec(&Value::Object(args.clone())).map_err(|_| "mcp_invalid_arguments".to_string())?;
        let (permit, _) = broker.authorize_call(id, tool, digest, &canonical, choice)?;
        match self.call(id, tool, args).await {
            Ok(out) => { permit.complete_ok(out.len() as u64); Ok(out) }
            Err(err) => { permit.complete_failed("call_failed"); Err(err) }
        }
    }

    /// Call one tool. Output is text only, capped; errors reported by the server come back as Err.
    pub async fn call(&self, id: &str, tool: &str, args: Map<String, Value>) -> Result<String, String> {
        let g = self.clients.lock().await;
        let c = &g.get(id).ok_or("Server is not running.")?.client;
        let mut p = CallToolRequestParams::new(tool.to_string());
        p.arguments = Some(args);
        let r = tokio::time::timeout(CALL_TIMEOUT, c.call_tool(p))
            .await
            .map_err(|_| "Tool call timed out.".to_string())?
            .map_err(|e| format!("Tool call failed: {e}"))?;
        let mut out = String::new();
        for block in &r.content {
            match serde_json::to_value(block) {
                Ok(v) if v.get("type").and_then(Value::as_str) == Some("text") => {
                    if let Some(t) = v.get("text").and_then(Value::as_str) { out.push_str(t); out.push('\n'); }
                }
                Ok(v) => out.push_str(&format!("[{} content omitted]\n", v.get("type").and_then(Value::as_str).unwrap_or("non-text"))),
                Err(_) => out.push_str("[unreadable content omitted]\n"),
            }
            if out.len() > MAX_RESULT_BYTES * 2 { break; }
        }
        let _: Option<&ContentBlock> = None;
        let out = cap(out.trim_end().to_string());
        if r.is_error == Some(true) { Err(out) } else { Ok(out) }
    }

    pub async fn stop(&self, id: &str) {
        if let Some(c) = self.clients.lock().await.remove(id) { let _ = c.client.cancel().await; }
    }
    pub async fn running(&self) -> Vec<String> {
        let mut v: Vec<String> = self.clients.lock().await.keys().cloned().collect();
        v.sort();
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
    use rmcp::model::{ServerCapabilities, ServerConfig};
    use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler};

    #[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
    struct SumRequest { a: i32, b: i32 }
    #[derive(Clone)]
    struct Calc { tool_router: ToolRouter<Self> }
    #[tool_router]
    impl Calc {
        #[tool(description = "Add two numbers")]
        fn sum(&self, Parameters(SumRequest { a, b }): Parameters<SumRequest>) -> String { (a + b).to_string() }
        #[tool(description = "Very long output")]
        fn flood(&self) -> String { "x".repeat(200_000) }
    }
    #[tool_handler]
    impl ServerHandler for Calc {
        fn get_info(&self) -> ServerConfig { ServerConfig::new(ServerCapabilities::builder().enable_tools().build()) }
    }

    async fn host() -> McpHost {
        let (s, c) = tokio::io::duplex(8192);
        tokio::spawn(async move {
            let srv = Calc { tool_router: Calc::tool_router() }.serve(s).await.unwrap();
            let _ = srv.waiting().await;
        });
        let h = McpHost::new();
        h.attach("calc", c).await.unwrap();
        h
    }

    #[tokio::test]
    async fn lists_and_calls_tools() {
        let h = host().await;
        let tools = h.tools("calc").await.unwrap();
        assert!(tools.iter().any(|t| t.name == "sum" && t.input_schema["properties"]["a"].is_object()));
        let mut a = Map::new();
        a.insert("a".into(), 2.into());
        a.insert("b".into(), 3.into());
        assert_eq!(h.call("calc", "sum", a).await.unwrap(), "5");
        assert_eq!(h.running().await, vec!["calc".to_string()]);
        h.stop("calc").await;
        assert!(h.tools("calc").await.is_err());
    }

    #[tokio::test]
    async fn output_is_capped_and_bad_calls_fail() {
        let h = host().await;
        let out = h.call("calc", "flood", Map::new()).await.unwrap();
        assert!(out.len() <= MAX_RESULT_BYTES + 20 && out.ends_with("[truncated]"));
        assert!(h.call("calc", "nope", Map::new()).await.is_err());
        assert!(h.call("missing", "sum", Map::new()).await.is_err());
    }

    #[test]
    fn server_list_roundtrip_and_limits() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mcp-servers.json");
        assert!(load_servers(&path).unwrap().is_empty());
        let exe = std::env::current_exe().unwrap().to_string_lossy().to_string();
        let mut list = vec![];
        upsert_server(&mut list, McpServerConfig { id: "b".into(), command: exe.clone(), args: vec![], env: BTreeMap::new() }).unwrap();
        upsert_server(&mut list, McpServerConfig { id: "a".into(), command: exe.clone(), args: vec!["x".into()], env: BTreeMap::new() }).unwrap();
        upsert_server(&mut list, McpServerConfig { id: "b".into(), command: exe, args: vec!["y".into()], env: BTreeMap::new() }).unwrap();
        assert_eq!(list.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        save_servers(&path, &list).unwrap();
        assert_eq!(load_servers(&path).unwrap(), list);
        std::fs::write(&path, "nope").unwrap();
        assert!(load_servers(&path).is_err());
    }

    #[test]
    fn config_validation() {
        let ok = std::env::current_exe().unwrap().to_string_lossy().to_string();
        let base = McpServerConfig { id: "demo".into(), command: ok, args: vec![], env: BTreeMap::new() };
        assert!(validate_config(&base).is_ok());
        for bad in [
            McpServerConfig { id: "Bad Id".into(), ..base.clone() },
            McpServerConfig { command: "node".into(), ..base.clone() },
            McpServerConfig { command: "/definitely/not/here".into(), ..base.clone() },
            McpServerConfig { args: vec!["a\0".into()], ..base.clone() },
            McpServerConfig { env: [("A=B".to_string(), "x".to_string())].into(), ..base.clone() },
        ] { assert!(validate_config(&bad).is_err(), "{bad:?}"); }
    }
}
