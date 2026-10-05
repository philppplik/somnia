use crate::service::{AppError, Project, ReadReply, RecoveryRecord, Result, Revision, StateEvent};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct Backend {
    projects: BTreeMap<String, Project>,
}
type Shared = Arc<Mutex<Backend>>;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectReply {
    project_id: String,
    name: String,
}
fn gate(window: &WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        return Err(AppError::Denied(
            "Only the trusted editor window may access projects".into(),
        ));
    }
    Ok(())
}
async fn work<T: Send + 'static>(
    state: Shared,
    f: impl FnOnce(&mut Backend) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut backend = state.lock().map_err(|e| AppError::Io(e.to_string()))?;
        f(&mut backend)
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}
fn project<'a>(backend: &'a mut Backend, id: &str) -> Result<&'a mut Project> {
    backend.projects.get_mut(id).ok_or(AppError::UnknownProject)
}
fn emit(window: &WebviewWindow, event: &StateEvent) {
    let _ = window.emit("somnia://file-state", event);
}

#[tauri::command]
async fn choose_project(
    window: WebviewWindow,
    state: State<'_, Shared>,
    create_subfolder: Option<String>,
) -> Result<Option<ProjectReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let selected =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|e| AppError::Invalid(e.to_string()))?;
    // Save flow "new folder": create exactly one validated sub folder inside the chosen folder and use it as the project root.
    let path = match create_subfolder {
        Some(name) => {
            let bad = name.is_empty()
                || name.len() > 100
                || name == "."
                || name == ".."
                || name.ends_with('.')
                || name.ends_with(' ')
                || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c));
            if bad {
                return Err(AppError::Denied("Folder name is not allowed".into()));
            }
            let target = path.join(&name);
            std::fs::create_dir_all(&target)?;
            target
        }
        None => path,
    };
    let recovery_base = window
        .app_handle()
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("recovery-v1");
    work(state.inner().clone(), move |backend| {
        if backend.projects.len() >= 4 {
            return Err(AppError::Limit);
        }
        let project = Project::open(&path, &recovery_base)?;
        let reply = ProjectReply {
            project_id: project.id.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        };
        backend.projects.insert(project.id.clone(), project);
        Ok(Some(reply))
    })
    .await
}
/// True when the app runs from a Microsoft Store (MSIX) package. Such installs are updated by the Store, so the GitHub updater stays off.
#[tauri::command]
fn is_store_package() -> bool {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_lowercase().contains("\\windowsapps\\"))
        .unwrap_or(false)
}

#[tauri::command]
async fn choose_file(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> Result<Option<ProjectReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let selected =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_file())
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|e| AppError::Invalid(e.to_string()))?;
    let recovery_base = window
        .app_handle()
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("recovery-v1");
    work(state.inner().clone(), move |backend| {
        if backend.projects.len() >= 4 {
            return Err(AppError::Limit);
        }
        let project = Project::open_file(&path, &recovery_base)?;
        let reply = ProjectReply {
            project_id: project.id.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        };
        backend.projects.insert(project.id.clone(), project);
        Ok(Some(reply))
    })
    .await
}
#[tauri::command]
async fn list_files(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
) -> Result<Vec<String>> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.list_files()
    })
    .await
}
#[tauri::command]
async fn read_file(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
) -> Result<ReadReply> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.read(&path)
    })
    .await
}
#[tauri::command]
async fn stage_edit(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
    content: String,
    client_revision: u64,
) -> Result<StateEvent> {
    gate(&window)?;
    let event = work(state.inner().clone(), move |b| {
        project(b, &project_id)?.stage(&path, content, client_revision)
    })
    .await?;
    emit(&window, &event);
    Ok(event)
}
#[tauri::command]
async fn save_file(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
    expected_revision: Revision,
) -> Result<StateEvent> {
    gate(&window)?;
    let event = work(state.inner().clone(), move |b| {
        project(b, &project_id)?.save(&path, &expected_revision)
    })
    .await?;
    emit(&window, &event);
    Ok(event)
}
#[tauri::command]
async fn delete_file(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
    expected_revision: Revision,
) -> Result<()> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.delete(&path, &expected_revision)
    })
    .await
}
#[tauri::command]
async fn open_external(window: WebviewWindow, url: String) -> Result<()> {
    gate(&window)?;
    // Only the project's own GitHub pages; no shell is involved, the URL is a single argument.
    const ALLOWED: &str = "https://github.com/philppplik/somnia";
    let boundary = matches!(
        url.as_bytes().get(ALLOWED.len()),
        None | Some(b'/') | Some(b'?') | Some(b'#')
    );
    if !(url.starts_with(ALLOWED)
        && boundary
        && url.len() < 300
        && url.chars().all(|c| c.is_ascii_graphic()))
    {
        return Err(AppError::Denied(
            "Only the Somnia GitHub page can be opened".into(),
        ));
    }
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url.as_str()).spawn();
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(url.as_str()).spawn();
    result
        .map(|_| ())
        .map_err(|e| AppError::Io(e.to_string()))
}
#[tauri::command]
async fn recovery_list(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
) -> Result<Vec<RecoveryRecord>> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.recovery_list()
    })
    .await
}
#[tauri::command]
async fn recovery_read(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
) -> Result<RecoveryRecord> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.recovery_read(&path)
    })
    .await
}
#[tauri::command]
async fn recovery_restore(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
    client_revision: u64,
) -> Result<StateEvent> {
    gate(&window)?;
    let event = work(state.inner().clone(), move |b| {
        project(b, &project_id)?.recovery_restore(&path, client_revision)
    })
    .await?;
    emit(&window, &event);
    Ok(event)
}
#[tauri::command]
async fn recovery_discard(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
) -> Result<()> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.recovery_discard(&path)
    })
    .await
}
#[tauri::command]
async fn close_project(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    keep_recovery: bool,
) -> Result<()> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        if project(b, &project_id)?.has_dirty() && !keep_recovery {
            return Err(AppError::Dirty);
        }
        b.projects
            .remove(&project_id)
            .ok_or(AppError::UnknownProject)?;
        Ok(())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared = Shared::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(250));
                let Some(window) = app_handle.get_webview_window("main") else {
                    break;
                };
                let events = match shared.lock() {
                    Ok(mut backend) => backend
                        .projects
                        .values_mut()
                        .flat_map(Project::tick)
                        .collect::<Vec<_>>(),
                    Err(_) => break,
                };
                for event in events {
                    emit(&window, &event);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let shared = window.state::<Shared>();
                // Keep the app open while unsaved edits are in flight. UI must present
                // Save / Keep recovery / Cancel, then call close_project before close.
                let blocked = shared
                    .try_lock()
                    .map(|b| b.projects.values().any(Project::has_dirty))
                    .unwrap_or(true);
                if blocked {
                    api.prevent_close();
                    let _ = window.emit("somnia://close-blocked", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            choose_project,
            choose_file,
            is_store_package,
            list_files,
            read_file,
            stage_edit,
            save_file,
            delete_file,
            open_external,
            recovery_list,
            recovery_read,
            recovery_restore,
            recovery_discard,
            close_project
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Somnia");
}
