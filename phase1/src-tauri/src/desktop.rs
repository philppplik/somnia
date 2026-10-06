use crate::drop_grant::DropGrant;
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
    drop_grant: Option<DropGrant>,
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut backend = state.lock().map_err(|e| AppError::Io(e.to_string()))?;
        f(&mut backend)
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    if let Err(error) = &result {
        crate::applog::write("warn", "rust.service", &error.to_string(), None);
    }
    result
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
                || name
                    .chars()
                    .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c));
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
/// Open exactly the path delivered by the OS, never a path supplied by the renderer.
#[tauri::command]
async fn open_dropped_project(
    window: WebviewWindow,
    state: State<'_, Shared>,
    token: String,
) -> Result<ProjectReply> {
    gate(&window)?;
    let recovery_base = window
        .app_handle()
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("recovery-v1");
    work(state.inner().clone(), move |backend| {
        let paths = DropGrant::consume(&mut backend.drop_grant, &token)?;
        if paths.len() != 1 {
            return Err(AppError::Denied(
                "Drop one folder or one file to open in place".into(),
            ));
        }
        if backend.projects.len() >= 4 {
            return Err(AppError::Limit);
        }
        let path = &paths[0];
        let project = if path.is_dir() {
            Project::open(path, &recovery_base)?
        } else {
            Project::open_file(path, &recovery_base)?
        };
        let reply = ProjectReply {
            project_id: project.id.clone(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        };
        backend.projects.insert(project.id.clone(), project);
        Ok(reply)
    })
    .await
}
#[derive(Serialize)]
struct DroppedTextFile {
    name: String,
    text: String,
    /// Set for PNG, JPEG and PDF files: the raw bytes, standard base64. `text` is empty then.
    #[serde(skip_serializing_if = "Option::is_none")]
    base64: Option<String>,
}
const MEDIA_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "pdf"];
const MAX_MEDIA_BYTES: usize = 25_000_000;
const MAX_MEDIA_TOTAL: usize = 60_000_000;
/// Standard base64 with padding. Small and dependency free, used only for dropped media files.
fn base64_encode(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        out.push(T[(b[0] >> 2) as usize] as char);
        out.push(T[(((b[0] & 3) << 4) | (b[1] >> 4)) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[(((b[1] & 15) << 2) | (b[2] >> 6)) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(b[2] & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
/// Multiple dropped files retain the existing import-as-copies behavior. Reads are bounded.
#[tauri::command]
async fn read_dropped_files(
    window: WebviewWindow,
    state: State<'_, Shared>,
    token: String,
) -> Result<Vec<DroppedTextFile>> {
    gate(&window)?;
    work(state.inner().clone(), move |backend| {
        use std::io::Read;
        let paths = DropGrant::consume(&mut backend.drop_grant, &token)?;
        if paths.iter().any(|p| !p.is_file()) {
            return Err(AppError::Denied(
                "Drop one folder alone, or text files without folders".into(),
            ));
        }
        let mut files = Vec::new();
        let mut total = 0;
        let mut media_total = 0;
        for path in paths {
            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_lowercase();
            if MEDIA_EXTENSIONS.contains(&ext.as_str()) {
                let mut bytes = Vec::new();
                std::fs::File::open(&path)?
                    .take(MAX_MEDIA_BYTES as u64 + 1)
                    .read_to_end(&mut bytes)?;
                if bytes.len() > MAX_MEDIA_BYTES {
                    return Err(AppError::Limit);
                }
                media_total += bytes.len();
                if media_total > MAX_MEDIA_TOTAL {
                    return Err(AppError::Limit);
                }
                files.push(DroppedTextFile {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    text: String::new(),
                    base64: Some(base64_encode(&bytes)),
                });
                continue;
            }
            if !["html", "htm", "css", "js", "json", "svg", "txt", "md"].contains(&ext.as_str()) {
                continue;
            }
            let mut bytes = Vec::new();
            std::fs::File::open(&path)?
                .take(2_000_001)
                .read_to_end(&mut bytes)?;
            if bytes.len() > 2_000_000 {
                return Err(AppError::Limit);
            }
            total += bytes.len();
            if total > 8_000_000 {
                return Err(AppError::Limit);
            }
            files.push(DroppedTextFile {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                text: crate::service::decode_text(bytes),
                base64: None,
            });
        }
        Ok(files)
    })
    .await
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DropReply {
    token: String,
    count: usize,
    /// True when every dropped path is a PNG, JPEG or PDF file (media, not a project).
    media: bool,
}
/// True when the app runs from a Microsoft Store (MSIX) package. Such installs are updated by the Store, so the GitHub updater stays off.
#[tauri::command]
fn is_store_package() -> bool {
    std::env::current_exe()
        .map(|p| {
            p.to_string_lossy()
                .to_lowercase()
                .contains("\\windowsapps\\")
        })
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
/// Media (PNG, JPEG, PDF) inside the open project folder, as standard base64. Read only, max 25 MB per file.
#[tauri::command]
async fn read_media(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    path: String,
) -> Result<String> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        let bytes = project(b, &project_id)?.read_media(&path)?;
        Ok(base64_encode(&bytes))
    })
    .await
}
#[tauri::command]
async fn hold_autosave(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    paths: Vec<String>,
) -> Result<()> {
    gate(&window)?;
    work(state.inner().clone(), move |b| {
        project(b, &project_id)?.hold_autosave(&paths)
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
    let result = std::process::Command::new("xdg-open")
        .arg(url.as_str())
        .spawn();
    result.map(|_| ()).map_err(|e| AppError::Io(e.to_string()))
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

#[tauri::command]
async fn collab_lan_start(
    window: WebviewWindow,
    host: tauri::State<'_, crate::lan_host::LanHost>,
    lan: bool,
    port: u16,
    room_id: Option<String>,
) -> std::result::Result<crate::lan_host::LanHostInfo, String> {
    gate(&window).map_err(|e| e.to_string())?;
    host.start_room(lan, port, room_id).await
}
#[tauri::command]
async fn collab_lan_stop(
    window: WebviewWindow,
    host: tauri::State<'_, crate::lan_host::LanHost>,
) -> std::result::Result<(), String> {
    gate(&window).map_err(|e| e.to_string())?;
    host.stop().await
}
#[tauri::command]
async fn collab_lan_status(
    window: WebviewWindow,
    host: tauri::State<'_, crate::lan_host::LanHost>,
) -> std::result::Result<crate::lan_host::LanHostInfo, String> {
    gate(&window).map_err(|e| e.to_string())?;
    Ok(host.status().await)
}

#[tauri::command]
fn log_write(
    window: WebviewWindow,
    level: String,
    source: String,
    message: String,
    context: Option<serde_json::Value>,
) -> std::result::Result<(), String> {
    gate(&window).map_err(|e| e.to_string())?;
    crate::applog::write(&level, &source, &message, context.as_ref());
    Ok(())
}
#[tauri::command]
fn log_tail(window: WebviewWindow, lines: Option<usize>) -> std::result::Result<String, String> {
    gate(&window).map_err(|e| e.to_string())?;
    Ok(crate::applog::global()
        .map(|l| l.tail(lines.unwrap_or(200).min(2000)))
        .unwrap_or_default())
}
#[tauri::command]
fn log_dir(window: WebviewWindow) -> std::result::Result<String, String> {
    gate(&window).map_err(|e| e.to_string())?;
    Ok(crate::applog::global()
        .map(|l| l.dir().display().to_string())
        .unwrap_or_default())
}
/// Never expose transparent UI on unsupported compositors. Linux remains solid.
#[tauri::command]
fn set_window_background(window: WebviewWindow, glass: bool, dark: bool) -> std::result::Result<bool, String> {
    gate(&window).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        if !glass {
            // Clearing an effect on unsupported Windows is harmless to our opaque CSS.
            let _ = window_vibrancy::clear_acrylic(&window);
            return Ok(false);
        }
        let tint = if dark { (18, 18, 24, 125) } else { (248, 249, 251, 125) };
        // Tauri's set_effects discards compositor errors internally. Call the same
        // underlying library directly so failure can keep the frontend opaque.
        if window_vibrancy::apply_acrylic(&window, Some(tint)).is_err() {
            let _ = window_vibrancy::clear_acrylic(&window);
            return Ok(false);
        }
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};
        // Repeated theme changes must not stack vibrancy subviews.
        let _ = window_vibrancy::clear_vibrancy(&window);
        if !glass { return Ok(false); }
        let _ = dark; // CSS supplies the current theme tint.
        Ok(window_vibrancy::apply_vibrancy(&window,
            NSVisualEffectMaterial::UnderWindowBackground,
            Some(NSVisualEffectState::Active), Some(5.0)).is_ok())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (glass, dark);
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared = Shared::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared.clone())
        .manage(crate::lan_host::LanHost::default())
        .setup(move |app| {
            if let Ok(dir) = app.path().app_data_dir() {
                crate::applog::init(dir.join("logs"));
            }
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
            if window.label() == "main" {
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                    event
                {
                    let shared = window.state::<Shared>();
                    if let Ok(mut backend) = shared.lock() {
                        let grant = DropGrant::new(paths.clone());
                        let reply = DropReply {
                            token: grant.token().to_owned(),
                            count: paths.len(),
                            media: paths.iter().all(|p| {
                                p.extension()
                                    .map(|e| e.to_string_lossy().to_ascii_lowercase())
                                    .is_some_and(|e| MEDIA_EXTENSIONS.contains(&e.as_str()))
                            }),
                        };
                        backend.drop_grant = Some(grant);
                        let _ = window.emit("somnia://os-drop", reply);
                    };
                }
            }
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
            set_window_background,
            collab_lan_start,
            collab_lan_stop,
            collab_lan_status,
            choose_project,
            choose_file,
            open_dropped_project,
            read_dropped_files,
            is_store_package,
            list_files,
            read_file,
            read_media,
            hold_autosave,
            stage_edit,
            save_file,
            delete_file,
            open_external,
            recovery_list,
            recovery_read,
            recovery_restore,
            recovery_discard,
            close_project,
            log_write,
            log_tail,
            log_dir
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            crate::applog::write("error", "rust.startup", &error.to_string(), None);
            panic!("Unable to start Somnia: {error}");
        });
}

#[cfg(test)]
mod media_tests {
    use super::base64_encode;
    #[test]
    fn base64_matches_rfc4648_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }
}
