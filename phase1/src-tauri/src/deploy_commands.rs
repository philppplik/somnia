//! Tauri glue for live deployment. Thin on purpose: every rule lives in [`crate::deploy_guard`].
//!
//! Every command checks the trusted editor window, runs the blocking service off the async
//! runtime, and returns either a camelCase value or a stable `deploy:<code>` string. Parameters and
//! results never contain key material: targets are addressed by id, keys by slot inside Rust.
use crate::deploy_guard::{DeployError, DeployService, HostKeyInfo, Outcome, PlanView, TargetStatus};
use crate::deploy_runtime::{build_service, now_ms};
use crate::deploy_targets::Target;
use serde::Serialize;
use std::sync::{Arc, OnceLock};
use tauri::{Emitter, Manager};

static SERVICE: OnceLock<Arc<DeployService>> = OnceLock::new();
pub const PROGRESS_EVENT: &str = "deploy-progress";

fn gate(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("Only the trusted editor can publish".into()); }
    Ok(())
}
fn service(app: &tauri::AppHandle) -> Result<Arc<DeployService>, String> {
    if let Some(s) = SERVICE.get() { return Ok(s.clone()); }
    let dir = app.path().app_config_dir().map_err(|_| "deploy:storage".to_string())?;
    Ok(SERVICE.get_or_init(|| Arc::new(build_service(&dir))).clone())
}
fn code(e: DeployError) -> String { e.to_string() }
async fn blocking<T: Send + 'static>(app: &tauri::AppHandle, f: impl FnOnce(&DeployService) -> Result<T, DeployError> + Send + 'static) -> Result<T, String> {
    let svc = service(app)?;
    tauri::async_runtime::spawn_blocking(move || f(&svc).map_err(code)).await.map_err(|_| "deploy:engine-failed".to_string())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress { target_id: String, step: String }

#[tauri::command]
pub async fn deploy_targets_list(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<Vec<TargetStatus>, String> {
    gate(&window)?;
    blocking(&app, |s| s.targets_list()).await
}
#[tauri::command]
pub async fn deploy_target_save(window: tauri::WebviewWindow, app: tauri::AppHandle, target: Target) -> Result<(), String> {
    gate(&window)?;
    blocking(&app, move |s| s.target_save(target)).await
}
#[tauri::command]
pub async fn deploy_target_delete(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, delete_key: bool) -> Result<(), String> {
    gate(&window)?;
    blocking(&app, move |s| s.target_delete(&target_id, delete_key)).await
}
#[tauri::command]
pub async fn deploy_plan(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String) -> Result<PlanView, String> {
    gate(&window)?;
    blocking(&app, move |s| s.plan(&target_id)).await
}
#[tauri::command]
pub async fn deploy_plan_rollback(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, release_id: String) -> Result<PlanView, String> {
    gate(&window)?;
    blocking(&app, move |s| s.plan_rollback(&target_id, &release_id)).await
}
#[tauri::command]
pub async fn deploy_confirm_issue(window: tauri::WebviewWindow, app: tauri::AppHandle, plan_hash: String) -> Result<String, String> {
    gate(&window)?;
    blocking(&app, move |s| s.confirm_issue(&plan_hash, now_ms())).await
}
#[tauri::command]
pub async fn deploy_publish(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, plan_hash: String, token: String) -> Result<Outcome, String> {
    gate(&window)?;
    let win = window.clone();
    let id = target_id.clone();
    blocking(&app, move |s| {
        let progress = move |step: &str| { let _ = win.emit(PROGRESS_EVENT, Progress { target_id: id.clone(), step: step.to_string() }); };
        s.publish(&target_id, &plan_hash, &token, now_ms(), &progress)
    }).await
}
#[tauri::command]
pub async fn deploy_rollback(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, release_id: String, plan_hash: String, token: String) -> Result<Outcome, String> {
    gate(&window)?;
    let win = window.clone();
    let id = target_id.clone();
    blocking(&app, move |s| {
        let progress = move |step: &str| { let _ = win.emit(PROGRESS_EVENT, Progress { target_id: id.clone(), step: step.to_string() }); };
        s.rollback(&target_id, &release_id, &plan_hash, &token, now_ms(), &progress)
    }).await
}
#[tauri::command]
pub async fn deploy_hostkey_probe(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String) -> Result<HostKeyInfo, String> {
    gate(&window)?;
    blocking(&app, move |s| s.hostkey_probe(&target_id)).await
}
#[tauri::command]
pub async fn deploy_hostkey_trust(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, fingerprint: String) -> Result<(), String> {
    gate(&window)?;
    blocking(&app, move |s| s.hostkey_trust(&target_id, &fingerprint)).await
}
#[tauri::command]
pub async fn deploy_hostkey_replace(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String, old_fingerprint: String, new_fingerprint: String, acknowledged: bool) -> Result<(), String> {
    gate(&window)?;
    blocking(&app, move |s| s.hostkey_replace(&target_id, &old_fingerprint, &new_fingerprint, acknowledged)).await
}
#[tauri::command]
pub async fn deploy_key_create(window: tauri::WebviewWindow, app: tauri::AppHandle, target_id: String) -> Result<String, String> {
    gate(&window)?;
    blocking(&app, move |s| s.key_create(&target_id)).await
}
