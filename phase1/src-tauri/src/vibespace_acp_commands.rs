//! Native-only ACP bridge commands (Welle-B A2). Thin adapters over [`crate::vibespace_acp`]:
//! main window only (same gate as the Vibe Space commands), no second Runtime, no consent path
//! of their own. The renderer is told about changes through one private event channel and
//! re-reads with `vibespace_acp_state`.
use crate::app_command_error::AppCommandError;
use crate::vibespace_acp::{AcpBridge, AcpLaunch, BridgeError, LaunchReply, Notify, StateReply};
use crate::vibespace_commands::{gate, VibeSpaceState};
use serde::Deserialize;
use somnia_vibespace_core::wire as w;
use std::sync::Arc;
use tauri::{Emitter, Manager, State, Webview, WebviewWindow};

const ACP_CHANNEL: &str = "somnia://vibespace-acp";
type Result<T> = std::result::Result<T, AppCommandError>;

#[derive(Default)]
pub struct AcpState {
    bridge: Arc<AcpBridge>,
}

fn map(e: BridgeError) -> AppCommandError {
    // Existing registry id; the specific bridge cause is the fixed code, never raw errors.
    let expected = !matches!(e.0, "vibespace_acp_failed");
    AppCommandError::new(
        "SOM-FS-004",
        e.0,
        "The external agent action could not be completed. Check the agent panel for details.",
        expected,
    )
}
fn join_failed<E>(_: E) -> AppCommandError {
    AppCommandError::new("SOM-FS-004", "vibespace_acp_failed", "The external agent action could not be completed.", false)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionKey {
    pub session_key: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenSession {
    pub session_key: String,
    #[serde(default)]
    pub resume: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Prompt {
    pub session_key: String,
    pub text: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecideAcp {
    pub session_key: String,
    pub request_id: String,
    pub choice: w::ConsentChoice,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelAcp {
    pub session_key: String,
    #[serde(default)]
    pub grace_ms: u64,
    #[serde(default)]
    pub close: bool,
}

#[tauri::command]
pub async fn vibespace_acp_launch(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    acp: State<'_, AcpState>,
    request: AcpLaunch,
) -> Result<LaunchReply> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_acp_launch", Some(&label), async {
        gate(&window, &webview)?;
        let app = window.app_handle().clone();
        let runtime = state.runtime(&app)?;
        let data = app.path().app_data_dir().map_err(join_failed)?.join("vibespace");
        let bridge = acp.bridge.clone();
        let notify_app = app.clone();
        let notify: Notify = Arc::new(move |key, reason| {
            // emit_to is not an app broadcast: agent output stays in the main window.
            let _ = notify_app.emit_to(
                tauri::EventTarget::webview_window("main"),
                ACP_CHANNEL,
                serde_json::json!({"sessionKey": key, "reason": reason}),
            );
        });
        // The capability probe spawns a sandbox: keep it off the async executor.
        tauri::async_runtime::spawn_blocking(move || bridge.launch(&runtime, &data, request, notify))
            .await
            .map_err(join_failed)?
            .map_err(map)
    })
    .await
}

#[tauri::command]
pub async fn vibespace_acp_session(
    window: WebviewWindow,
    webview: Webview,
    acp: State<'_, AcpState>,
    request: OpenSession,
) -> Result<String> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_acp_session", Some(&label), async {
        gate(&window, &webview)?;
        let bridge = acp.bridge.clone();
        tauri::async_runtime::spawn_blocking(move || bridge.open_session(&request.session_key, request.resume))
            .await
            .map_err(join_failed)?
            .map_err(map)
    })
    .await
}

#[tauri::command]
pub async fn vibespace_acp_prompt(
    window: WebviewWindow,
    webview: Webview,
    acp: State<'_, AcpState>,
    request: Prompt,
) -> Result<String> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_acp_prompt", Some(&label), async {
        gate(&window, &webview)?;
        let bridge = acp.bridge.clone();
        tauri::async_runtime::spawn_blocking(move || bridge.prompt(&request.session_key, &request.text))
            .await
            .map_err(join_failed)?
            .map_err(map)
    })
    .await
}

#[tauri::command]
pub fn vibespace_acp_decide_consent(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    acp: State<'_, AcpState>,
    request: DecideAcp,
) -> Result<()> {
    crate::cmd::cmd("vibespace_acp_decide_consent", Some(window.label()), || {
        gate(&window, &webview)?;
        let runtime = state.runtime(window.app_handle())?;
        acp.bridge
            .decide(&runtime, &request.session_key, &request.request_id, request.choice)
            .map_err(map)
    })
}

#[tauri::command]
pub async fn vibespace_acp_cancel(
    window: WebviewWindow,
    webview: Webview,
    acp: State<'_, AcpState>,
    request: CancelAcp,
) -> Result<()> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_acp_cancel", Some(&label), async {
        gate(&window, &webview)?;
        let bridge = acp.bridge.clone();
        tauri::async_runtime::spawn_blocking(move || bridge.cancel(&request.session_key, request.grace_ms, request.close))
            .await
            .map_err(join_failed)?
            .map_err(map)
    })
    .await
}

#[tauri::command]
pub fn vibespace_acp_state(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    acp: State<'_, AcpState>,
    request: SessionKey,
) -> Result<StateReply> {
    crate::cmd::cmd("vibespace_acp_state", Some(window.label()), || {
        gate(&window, &webview)?;
        let runtime = state.runtime(window.app_handle())?;
        acp.bridge.state(&runtime, &request.session_key).map_err(map)
    })
}
