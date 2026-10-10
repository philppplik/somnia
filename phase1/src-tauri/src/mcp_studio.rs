//! Wiring between the loopback MCP gateway (mcp_gateway) and the WebView. The gateway hands each
//! accepted JSON-RPC message to a forward function; here that function emits a `somnia://studio-mcp`
//! event to the editor window and awaits the matching `studio_mcp_respond` call. The protocol layer
//! itself lives in phase1/src/lib/agent/studioMcpServer.ts. See docs/MCP-SERVER.md.
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};
use tokio::sync::{oneshot, Mutex};

use crate::mcp_gateway::{self, Gateway};

/// Slightly below the gateway's 30 s IO timeout so a stuck WebView still gets an HTTP answer.
const FORWARD_TIMEOUT: Duration = Duration::from_secs(25);
const ERR_WINDOW: &str = r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"Somnia window is not available"}}"#;
const ERR_TIMEOUT: &str = r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"Somnia did not answer in time"}}"#;

#[derive(Default)]
pub struct StudioMcp {
    gateway: Mutex<Option<Gateway>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Option<String>>>>>,
    seq: Arc<AtomicU64>,
}

#[derive(serde::Serialize, Clone)]
pub struct StudioMcpInfo {
    pub running: bool,
    pub port: u16,
    /// Only set while running; shown in Settings so the user can paste it into the client config.
    pub token: String,
}

#[derive(serde::Serialize, Clone)]
struct ForwardPayload {
    id: u64,
    message: String,
}

impl StudioMcp {
    pub async fn start(&self, window: &WebviewWindow) -> Result<StudioMcpInfo, String> {
        let mut guard = self.gateway.lock().await;
        if let Some(g) = guard.as_ref() {
            return Ok(StudioMcpInfo { running: true, port: g.addr.port(), token: g.token.clone() });
        }
        let pending = self.pending.clone();
        let seq = self.seq.clone();
        let win = window.clone();
        let forward: mcp_gateway::Forward = Arc::new(move |message: String| {
            let pending = pending.clone();
            let seq = seq.clone();
            let win = win.clone();
            Box::pin(async move {
                let id = seq.fetch_add(1, Ordering::Relaxed) + 1;
                let (tx, rx) = oneshot::channel();
                pending.lock().await.insert(id, tx);
                if win.emit("somnia://studio-mcp", ForwardPayload { id, message }).is_err() {
                    pending.lock().await.remove(&id);
                    return Some(ERR_WINDOW.to_string());
                }
                match tokio::time::timeout(FORWARD_TIMEOUT, rx).await {
                    Ok(Ok(resp)) => resp,
                    _ => {
                        pending.lock().await.remove(&id);
                        Some(ERR_TIMEOUT.to_string())
                    }
                }
            })
        });
        let g = mcp_gateway::start(forward).await?;
        let info = StudioMcpInfo { running: true, port: g.addr.port(), token: g.token.clone() };
        *guard = Some(g);
        Ok(info)
    }

    pub async fn stop(&self) {
        // Dropping the gateway closes the listener; pending forwards resolve as timed out.
        self.gateway.lock().await.take();
        self.pending.lock().await.clear();
    }

    pub async fn status(&self) -> StudioMcpInfo {
        match self.gateway.lock().await.as_ref() {
            Some(g) => StudioMcpInfo { running: true, port: g.addr.port(), token: g.token.clone() },
            None => StudioMcpInfo { running: false, port: 0, token: String::new() },
        }
    }

    /// The WebView answered a forwarded message. Unknown or stale ids are ignored.
    pub async fn respond(&self, id: u64, response: Option<String>) {
        if let Some(tx) = self.pending.lock().await.remove(&id) {
            let _ = tx.send(response);
        }
    }
}
