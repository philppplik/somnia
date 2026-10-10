//! Trusted-editor read/export bridge. Deliberately no renderer append command.
use crate::extension_activity::{ActivityFilter, ActivityPage, ActivityStore};
use std::sync::OnceLock;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
static STORE: OnceLock<ActivityStore> = OnceLock::new();
pub fn store(app: &tauri::AppHandle) -> Result<&'static ActivityStore, String> {
    if let Some(s) = STORE.get() {
        return Ok(s);
    }
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(STORE.get_or_init(|| ActivityStore::new(&path)))
}
fn gate(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the trusted editor can read extension history".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn extension_activity_query(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    filter: ActivityFilter,
    offset: usize,
    limit: usize,
) -> Result<ActivityPage, String> {
    gate(&window)?;
    tauri::async_runtime::spawn_blocking(move || store(&app)?.query(&filter, offset, limit))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn extension_activity_export(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    filter: ActivityFilter,
) -> Result<Option<String>, String> {
    gate(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let data = store(&app)?.export(&filter)?;
        let Some(selected) = app
            .dialog()
            .file()
            .set_file_name("somnia-extension-activity.jsonl")
            .add_filter("JSON Lines", &["jsonl"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        let parent = path.parent().ok_or("Invalid export path")?;
        // Atomic save: no incomplete export on interruption, no project mutation API.
        let tmp = parent.join(format!(".somnia-activity-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp)
                .map_err(|e| e.to_string())?;
            f.write_all(data.as_bytes())
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(tmp);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
