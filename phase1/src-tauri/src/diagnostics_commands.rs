//! Native diagnostics adapter. All caller windows are host verified, destinations never cross IPC.
use crate::{diagnostics_types::*, diagnostics_zip::SnapshotStore, incidents::IncidentStore};
use serde_json::Value;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
static TAIL_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
pub struct DiagnosticsState {
    pub incidents: Mutex<IncidentStore>,
    pub snapshots: Mutex<SnapshotStore>,
}
impl DiagnosticsState {
    pub fn new(dir: std::path::PathBuf) -> Result<Self> {
        Ok(Self {
            incidents: Mutex::new(IncidentStore::open(dir)?),
            snapshots: Mutex::new(SnapshotStore::default()),
        })
    }
}
fn gate(window: &WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        return Err(DiagnosticError::InvalidInput);
    }
    Ok(())
}
/// The integrator wraps these core calls in crate::cmd::cmd to issue AppCommandError exactly once.
pub fn collect(
    window: &WebviewWindow,
    state: &DiagnosticsState,
    selection: DiagnosticsSelection,
    renderer_entries: Vec<Value>,
) -> Result<DiagnosticSnapshot> {
    gate(window)?;
    if renderer_entries.len() > 500 {
        return Err(DiagnosticError::InvalidInput);
    }
    let tail = if TAIL_IN_FLIGHT
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
    {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        // At most one native-tail task, and a 500ms collection deadline.
        std::thread::spawn(move || {
            let tail = crate::applog::global().map(|l| l.tail(500));
            let _ = tx.send(tail);
            TAIL_IN_FLIGHT.store(false, Ordering::Release);
        });
        rx.recv_timeout(Duration::from_millis(500)).ok().flatten()
    } else {
        None
    };
    let native: Vec<Value> = tail
        .as_deref()
        .unwrap_or("")
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    let incidents = state
        .incidents
        .lock()
        .map_err(|_| DiagnosticError::StoreCorrupt)?;
    state
        .snapshots
        .lock()
        .map_err(|_| DiagnosticError::SnapshotUnavailable)?
        .build(
            window.label(),
            selection,
            &renderer_entries,
            &native,
            &incidents,
            tail.is_some(),
        )
}
/// Opens a native dialog without holding snapshot/store locks. Unknown IDs fail before the dialog.
pub async fn save(
    window: WebviewWindow,
    state: &DiagnosticsState,
    snapshot_id: String,
) -> Result<SaveOutcome> {
    gate(&window)?;
    state
        .snapshots
        .lock()
        .map_err(|_| DiagnosticError::SnapshotUnavailable)?
        .validate(window.label(), &snapshot_id)?;
    let app = window.app_handle().clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Diagnostics ZIP", &["zip"])
            .set_file_name("somnia-diagnostics.zip")
            .blocking_save_file()
    })
    .await
    .map_err(|_| DiagnosticError::ZipWriteFailed)?;
    let Some(selected) = selected else {
        return Ok(SaveOutcome::Cancelled);
    };
    let path = selected
        .into_path()
        .map_err(|_| DiagnosticError::ZipWriteFailed)?;
    state
        .snapshots
        .lock()
        .map_err(|_| DiagnosticError::SnapshotUnavailable)?
        .write_to_native_destination(window.label(), &snapshot_id, &path)
}
pub fn discard(window: &WebviewWindow, state: &DiagnosticsState, id: &str) -> Result<()> {
    gate(window)?;
    state
        .snapshots
        .lock()
        .map_err(|_| DiagnosticError::SnapshotUnavailable)?
        .discard(window.label(), id)
}
pub fn list(window: &WebviewWindow, state: &DiagnosticsState) -> Result<Vec<CrashMeta>> {
    gate(window)?;
    Ok(state
        .incidents
        .lock()
        .map_err(|_| DiagnosticError::StoreCorrupt)?
        .list())
}
pub fn mark(window: &WebviewWindow, state: &DiagnosticsState, ids: &[String]) -> Result<()> {
    gate(window)?;
    state
        .incidents
        .lock()
        .map_err(|_| DiagnosticError::StoreCorrupt)?
        .mark_reviewed(ids)
}
pub fn delete(window: &WebviewWindow, state: &DiagnosticsState, ids: &[String]) -> Result<()> {
    gate(window)?;
    state
        .incidents
        .lock()
        .map_err(|_| DiagnosticError::StoreCorrupt)?
        .delete(ids)
}
pub fn record(window: &WebviewWindow, state: &DiagnosticsState, entry: Value) -> Result<String> {
    gate(window)?;
    // Build/recovery cannot be asserted by an untrusted renderer event.
    let build = BuildIdentity {
        release: env!("CARGO_PKG_VERSION").into(),
        sha: "unknown".into(),
        channel: "unknown".into(),
        arch: std::env::consts::ARCH.into(),
        frontend_build: "unknown".into(),
    };
    state
        .incidents
        .lock()
        .map_err(|_| DiagnosticError::StoreCorrupt)?
        .record_frontend_fatal(entry, build)
}

impl From<DiagnosticError> for crate::app_command_error::AppCommandError {
    fn from(e: DiagnosticError) -> Self {
        let (code, message) = match e {
            DiagnosticError::SnapshotUnavailable => (
                "diagnostics_snapshot_unavailable",
                "This diagnostics snapshot is unavailable. Refresh the preview.",
            ),
            DiagnosticError::StoreCorrupt => (
                "incident_store_corrupt",
                "Some local incident records are unavailable.",
            ),
            DiagnosticError::ZipWriteFailed => (
                "diagnostics_zip_write_failed",
                "The diagnostics ZIP could not be saved.",
            ),
            DiagnosticError::InvalidInput => (
                "diagnostics_input_invalid",
                "The diagnostics request was rejected.",
            ),
        };
        Self::new(e.code(), code, message, false)
    }
}
type CommandResult<T> = std::result::Result<T, crate::app_command_error::AppCommandError>;
#[tauri::command]
pub fn build_diagnostic_zip(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    selection: DiagnosticsSelection,
    renderer_entries: Vec<Value>,
) -> CommandResult<DiagnosticSnapshot> {
    crate::cmd::cmd("build_diagnostic_zip", Some(window.label()), || {
        collect(&window, &state, selection, renderer_entries).map_err(Into::into)
    })
}
#[tauri::command]
pub async fn write_diagnostic_zip(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    snapshot_id: String,
) -> CommandResult<SaveOutcome> {
    let label = window.label().to_owned();
    crate::cmd::cmd_async("write_diagnostic_zip", Some(&label), async {
        save(window, &state, snapshot_id).await.map_err(Into::into)
    })
    .await
}
#[tauri::command]
pub fn discard_diagnostic_snapshot(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    snapshot_id: String,
) -> CommandResult<()> {
    crate::cmd::cmd("discard_diagnostic_snapshot", Some(window.label()), || {
        discard(&window, &state, &snapshot_id).map_err(Into::into)
    })
}
#[tauri::command]
pub fn list_crash_reports(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
) -> CommandResult<Vec<CrashMeta>> {
    crate::cmd::cmd("list_crash_reports", Some(window.label()), || {
        list(&window, &state).map_err(Into::into)
    })
}
#[tauri::command]
pub fn mark_crash_reports_reviewed(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    ids: Vec<String>,
) -> CommandResult<()> {
    crate::cmd::cmd("mark_crash_reports_reviewed", Some(window.label()), || {
        mark(&window, &state, &ids).map_err(Into::into)
    })
}
#[tauri::command]
pub fn delete_crash_reports(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    ids: Vec<String>,
) -> CommandResult<()> {
    crate::cmd::cmd("delete_crash_reports", Some(window.label()), || {
        delete(&window, &state, &ids).map_err(Into::into)
    })
}
#[tauri::command]
pub fn record_frontend_fatal(
    window: WebviewWindow,
    state: State<'_, DiagnosticsState>,
    entry: Value,
) -> CommandResult<String> {
    crate::cmd::cmd("record_frontend_fatal", Some(window.label()), || {
        record(&window, &state, entry).map_err(Into::into)
    })
}
