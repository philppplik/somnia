//! Isolated native preview, never granted editor IPC. Source messages are only inert data.
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::{Component, Path},
    time::Duration,
};
use tauri::{Emitter, Manager};
#[derive(Deserialize)]
struct SourceEvent {
    file: String,
    line: u32,
    col: u32,
}
#[derive(Deserialize)]
struct SourceEvents {
    events: Vec<SourceEvent>,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SourceReply {
    project_id: String,
    file: String,
    line: u32,
    col: u32,
}
fn safe_source(root: &Path, event: &SourceEvent) -> bool {
    !event.file.is_empty()
        && event.file.len() <= 1024
        && !event.file.contains('\\')
        && event.line > 0
        && event.line <= 1_000_000
        && event.col > 0
        && event.col <= 100_000
        && Path::new(&event.file)
            .components()
            .all(|p| matches!(p, Component::Normal(_)))
        && !event
            .file
            .split('/')
            .any(|p| p == "node_modules" || p == ".git" || p.starts_with(".env"))
        && root
            .join(&event.file)
            .canonicalize()
            .is_ok_and(|p| p.starts_with(root))
}
pub fn open(
    app: &tauri::AppHandle,
    runner: &crate::proc_runner::ProcessRunner,
    run_id: &str,
) -> Result<(), String> {
    let handle = runner.status(run_id)?;
    if handle.kind != crate::proc_runner::RunKind::Dev || handle.state != "running" {
        return Err("frameworks.previewNotReady".into());
    }
    let port = handle.port.ok_or("frameworks.previewNotReady")?;
    let url = url::Url::parse(handle.url.as_deref().ok_or("frameworks.previewNotReady")?)
        .map_err(|_| "frameworks.previewNotReady")?;
    let label = format!("framework-preview-{run_id}");
    if let Some(window) = app.get_webview_window(&label) {
        return window
            .set_focus()
            .map_err(|_| "frameworks.previewFailed".into());
    }
    let preview = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
        .title("Somnia Preview")
        .inner_size(1100.0, 800.0)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .devtools(false)
        .on_navigation(move |u| {
            u.scheme() == "http"
                && u.host_str() == Some("127.0.0.1")
                && u.port_or_known_default() == Some(port)
        })
        .build()
        .map_err(|_| "frameworks.previewFailed")?;
    let stop_runner = runner.clone();
    let stop_id = run_id.to_owned();
    preview.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
        ) {
            let _ = stop_runner.stop(&stop_id);
        }
    });
    let app = app.clone();
    let runner = runner.clone();
    let run_id = run_id.to_owned();
    std::thread::spawn(move || {
        let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(1))
            .redirect(reqwest::redirect::Policy::none())
            .build()
        else {
            return;
        };
        let Ok(root) = runner.root(&run_id) else {
            return;
        };
        loop {
            if runner
                .status(&run_id)
                .map(|h| h.state != "running")
                .unwrap_or(true)
            {
                if let Some(w) = app.get_webview_window(&label) {
                    let _ = w.destroy();
                }
                break;
            }
            if app.get_webview_window(&label).is_none() {
                break;
            }
            let response = client
                .get(format!("http://127.0.0.1:{port}/__somnia/source-events"))
                .bearer_auth(handle.preview_token.as_deref().unwrap_or(""))
                .send();
            if let Ok(mut response) = response {
                if response.status().is_success()
                    && response.content_length().is_none_or(|n| n <= 65536)
                {
                    let mut bytes = Vec::new();
                    if response
                        .by_ref()
                        .take(65537)
                        .read_to_end(&mut bytes)
                        .is_ok()
                        && bytes.len() <= 65536
                    {
                        if let Ok(events) = serde_json::from_slice::<SourceEvents>(&bytes) {
                            for event in events.events.into_iter().take(64) {
                                if safe_source(&root, &event) {
                                    if let Some(main) = app.get_webview_window("main") {
                                        let _ = main.emit(
                                            "somnia://framework-source",
                                            SourceReply {
                                                project_id: handle.project_id.clone(),
                                                file: event.file,
                                                line: event.line,
                                                col: event.col,
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(350));
        }
    });
    Ok(())
}
pub fn close(app: &tauri::AppHandle, run_id: &str) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&format!("framework-preview-{run_id}")) {
        w.destroy().map_err(|_| "frameworks.previewFailed")?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_data_is_confined() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("App.tsx"), "hi").unwrap();
        let event = SourceEvent {
            file: "App.tsx".into(),
            line: 1,
            col: 1,
        };
        assert!(safe_source(d.path(), &event));
        for file in [
            "../outside",
            "/etc/passwd",
            ".env",
            "node_modules/foo",
            "C:\\file",
        ] {
            assert!(!safe_source(
                d.path(),
                &SourceEvent {
                    file: file.into(),
                    line: 1,
                    col: 1
                }
            ));
        }
    }
}
