//! A3 bridge. Runtime ownership/dispatch binding is installed by integration.
//! Never opens a second runtime or substitutes a permissive ownership port.
use crate::app_command_error::AppCommandError;
use somnia_vibespace_sched::{Manager as Scheduler, Preview, ReturnCard, Schedule, ScheduleSpec};
use std::sync::Mutex;
use tauri::{State, Webview, WebviewWindow};
#[derive(Default)]
pub struct VibeScheduleState(pub Mutex<Option<Scheduler>>);
impl VibeScheduleState {
    /// Integrator calls this only after acquiring the shared A1 Runtime owner.
    pub fn install(&self, scheduler: Scheduler) -> Result<(), String> {
        let mut slot = self.0.lock().map_err(|_| "scheduler state unavailable")?;
        if slot.is_some() {
            return Err("scheduler already bound".into());
        }
        *slot = Some(scheduler);
        Ok(())
    }
}
fn error(code: &str) -> AppCommandError {
    let message = if code == "schedule_owner_unbound" {
        "Scheduling is unavailable until the native runtime owner is connected. No schedule was saved."
    } else {
        "Scheduling could not complete this action. Check the rule and native runtime state."
    };
    AppCommandError::new("SOM-FS-004", code, message, true)
}
fn gate(window: &WebviewWindow, webview: &Webview) -> Result<(), AppCommandError> {
    let url = webview.url().map_err(|_| error("schedule_main_only"))?;
    let origin = matches!(
        (url.scheme(), url.host_str(), url.port()),
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None)
    ) || (cfg!(debug_assertions)
        && matches!(
            (url.scheme(), url.host_str(), url.port()),
            ("http", Some("127.0.0.1"), Some(1420))
        ));
    if window.label() != "main"
        || webview.label() != "main"
        || webview.window().label() != window.label()
        || !origin
    {
        return Err(error("schedule_main_only"));
    }
    Ok(())
}
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
#[tauri::command]
pub fn vibespace_schedule_preview(
    window: WebviewWindow,
    webview: Webview,
    request: ScheduleSpec,
) -> Result<Preview, AppCommandError> {
    gate(&window, &webview)?;
    somnia_vibespace_sched::preview(&request, now()).map_err(|_| error("schedule_invalid"))
}
#[tauri::command]
pub fn vibespace_schedule_create(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeScheduleState>,
    request: ScheduleSpec,
) -> Result<Schedule, AppCommandError> {
    gate(&window, &webview)?;
    state
        .inner()
        .0
        .lock()
        .map_err(|_| error("schedule_state"))?
        .as_mut()
        .ok_or_else(|| error("schedule_owner_unbound"))?
        .create(request, now())
        .map_err(|_| error("schedule_create_failed"))
}
#[tauri::command]
pub fn vibespace_schedule_list(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeScheduleState>,
) -> Result<Vec<Schedule>, AppCommandError> {
    gate(&window, &webview)?;
    state
        .inner()
        .0
        .lock()
        .map_err(|_| error("schedule_state"))?
        .as_ref()
        .ok_or_else(|| error("schedule_owner_unbound"))?
        .list()
        .map_err(|_| error("schedule_list_failed"))
}
#[tauri::command]
pub fn vibespace_schedule_set_enabled(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeScheduleState>,
    schedule_id: String,
    enabled: bool,
) -> Result<(), AppCommandError> {
    gate(&window, &webview)?;
    state
        .inner()
        .0
        .lock()
        .map_err(|_| error("schedule_state"))?
        .as_mut()
        .ok_or_else(|| error("schedule_owner_unbound"))?
        .set_enabled(&schedule_id, enabled, now())
        .map_err(|_| error("schedule_update_failed"))
}
#[tauri::command]
pub fn vibespace_schedule_return_card(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeScheduleState>,
    since_seq: i64,
) -> Result<ReturnCard, AppCommandError> {
    gate(&window, &webview)?;
    if since_seq < 0 {
        return Err(error("schedule_invalid_cursor"));
    }
    state
        .inner()
        .0
        .lock()
        .map_err(|_| error("schedule_state"))?
        .as_ref()
        .ok_or_else(|| error("schedule_owner_unbound"))?
        .return_card(since_seq)
        .map_err(|_| error("schedule_return_card_failed"))
}
