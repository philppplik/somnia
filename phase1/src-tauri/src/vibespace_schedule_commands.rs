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

// ---- A3 integration binding (installed by the integrator, not the builder) ----
use somnia_vibespace_core::{runtime::Runtime, wire as w};
use somnia_vibespace_sched::{Config, Dispatch, OwnershipPort, RunOutcome, RunPort};
use std::sync::Arc;
use std::time::Duration;

fn sched_err(code: &str) -> somnia_vibespace_sched::Error {
    somnia_vibespace_sched::Error::Invalid(code.into())
}

/// Proof by construction: the Arc keeps the Runtime alive, and the A1 ownership
/// guard is the last Runtime field to drop, so a live Runtime means this process
/// still holds the kernel-exclusive owner lock for the whole data directory.
struct RuntimeOwnershipPort {
    _runtime: Arc<Runtime>,
}
impl OwnershipPort for RuntimeOwnershipPort {
    fn ensure_owner(&self) -> somnia_vibespace_sched::Result<()> {
        Ok(())
    }
}

/// Runs the async runtime surface from the sync port traits. A fresh std thread is
/// never a tokio worker, so entering the async runtime here is legal from every
/// caller context (sync command, tick driver) without blocking a runtime worker.
fn block_on_runtime<F, T>(f: F) -> somnia_vibespace_sched::Result<T>
where
    F: std::future::Future<Output = somnia_vibespace_sched::Result<T>> + Send + 'static,
    T: Send + 'static,
{
    std::thread::spawn(move || tauri::async_runtime::block_on(f))
        .join()
        .map_err(|_| sched_err("schedule_runtime_thread"))?
}

struct RuntimeRunPort {
    app: tauri::AppHandle,
    runtime: Arc<Runtime>,
}
impl RunPort for RuntimeRunPort {
    /// Idempotent by request_id (core get_run_by_request), always a fresh isolated
    /// copy (core checkpoint vault), model pinned to the saved Studio config.
    fn start(&self, request: &Dispatch) -> somnia_vibespace_sched::Result<String> {
        let runtime = self.runtime.clone();
        let app = self.app.clone();
        let dispatch = request.clone();
        block_on_runtime(async move {
            let studios = runtime
                .list_studios()
                .map_err(|_| sched_err("schedule_studio_lookup"))?;
            let studio = studios
                .into_iter()
                .find(|s| s.studio_id == dispatch.studio_id)
                .ok_or_else(|| sched_err("schedule_studio_missing"))?;
            let configured = {
                let state = app.state::<crate::vibespace_commands::VibeSpaceState>();
                state.models(&app).map_err(|_| sched_err("schedule_models"))?
            };
            if !configured.contains(&studio.model) {
                return Err(sched_err("schedule_model_not_configured"));
            }
            let reference = studio.model;
            // Same trusted native resolution as the interactive start command:
            // only the saved Studio model, credentials from the native store.
            let (transport, config) = crate::vibespace_commands::resolve(&reference)
                .map_err(|_| sched_err("schedule_model_resolve"))?;
            let reply = runtime
                .start(
                    w::StartRun {
                        studio_id: dispatch.studio_id,
                        request_id: dispatch.request_id,
                        retry_of_run_id: None,
                    },
                    transport,
                    config,
                )
                .await
                .map_err(|_| sched_err("schedule_run_start"))?;
            Ok(reply.snapshot.run_id)
        })
    }
    fn state(&self, run_id: &str) -> somnia_vibespace_sched::Result<RunOutcome> {
        let runtime = self.runtime.clone();
        let id = run_id.to_string();
        block_on_runtime(async move {
            let reply = runtime.snapshot(&id).map_err(|_| sched_err("schedule_snapshot"))?;
            let s = &reply.snapshot;
            if !s.pending_consents.is_empty() {
                return Ok(RunOutcome::NeedsYou);
            }
            Ok(match s.execution_state {
                w::ExecutionState::Pending
                | w::ExecutionState::Claimed
                | w::ExecutionState::Running
                | w::ExecutionState::Paused => RunOutcome::Running,
                w::ExecutionState::Done => match s.review_state {
                    w::ReviewState::Ready | w::ReviewState::Conflict => RunOutcome::Ready,
                    _ => RunOutcome::Done,
                },
                w::ExecutionState::Stopped => RunOutcome::Done,
                w::ExecutionState::Failed => RunOutcome::Failed,
                w::ExecutionState::Crashed => RunOutcome::Crashed,
            })
        })
    }
    fn stop(&self, run_id: &str) -> somnia_vibespace_sched::Result<()> {
        let runtime = self.runtime.clone();
        let id = run_id.to_string();
        block_on_runtime(async move {
            runtime.stop(&id).await.map_err(|_| sched_err("schedule_stop"))
        })
    }
}

fn spawn_driver(app: tauri::AppHandle, interval_ms: i64) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(interval_ms.clamp(1_000, 60_000) as u64));
        let ticked = (|| -> Option<()> {
            let runtime = app
                .state::<crate::vibespace_commands::VibeSpaceState>()
                .runtime(&app)
                .ok()?;
            let port = RuntimeRunPort { app: app.clone(), runtime };
            let sched_state = app.state::<VibeScheduleState>();
            let mut slot = sched_state.0.lock().ok()?;
            let manager = slot.as_mut()?;
            // Fail-closed: a failed tick is retried next cycle, never compensated.
            manager.tick("gui", now(), &port).ok()?;
            Some(())
        })();
        if ticked.is_none() {
            // Runtime gone (sticky open failure) or state poisoned/unbound: stop
            // driving. A rebind after app restart spawns a fresh driver.
            break;
        }
    });
}

/// Called once from the shared runtime-open path, after the A1 owner lock exists.
/// Same database file, same ownership domain; never a second runtime.
pub(crate) fn bind(app: &tauri::AppHandle, runtime: Arc<Runtime>) -> Result<(), String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vibespace")
        .join("vibespace.sqlite");
    let owner: Arc<dyn OwnershipPort> =
        Arc::new(RuntimeOwnershipPort { _runtime: runtime.clone() });
    let manager = somnia_vibespace_sched::Manager::open(&data, owner, Config::default())
        .map_err(|e| e.to_string())?;
    let interval = manager.heartbeat_interval_ms();
    let state = app.state::<VibeScheduleState>();
    state.install(manager)?;
    // App-open tick: due work is not delayed by one interval.
    {
        let port = RuntimeRunPort { app: app.clone(), runtime };
        let mut slot = state.0.lock().map_err(|_| "scheduler state unavailable")?;
        if let Some(manager) = slot.as_mut() {
            let _ = manager.tick("gui", now(), &port);
        }
    }
    spawn_driver(app.clone(), interval);
    Ok(())
}
