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

// Serialize access so concurrent windows cannot race preference/key updates.
static AGENT_SETTINGS_LOCK: Mutex<()> = Mutex::new(());
#[derive(serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentSettingsReply { provider: String, model: String, api_key: String, #[serde(default)] custom_prompts: Vec<crate::agent_settings::CustomPrompt> }
fn agent_key_for(provider: &str) -> std::result::Result<keyring::Entry, String> {
    if !matches!(provider, "openrouter" | "openai" | "claude") { return Err("Unsupported credential provider".into()); }
    keyring::Entry::new("de.philipp-paulik.somnia.agent", provider)
        .map_err(|_| "OS credential store is unavailable".into())
}
// Credentials are independent of preferences: saving an Ollama configuration must
// never delete an OpenRouter key. No raw backend/credential error reaches the UI.
struct NativeResponse { receiver: tokio::sync::Mutex<tokio::sync::mpsc::Receiver<std::result::Result<Vec<u8>, String>>>, task: tokio::task::AbortHandle, expires: std::time::Instant }
impl Drop for NativeResponse {fn drop(&mut self){self.task.abort();}}
#[derive(Default)]
struct ProviderNetwork(tokio::sync::Mutex<BTreeMap<String, Arc<NativeResponse>>>);
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct NativeStart { id: String, status: u16, headers: BTreeMap<String,String> }
#[tauri::command]
async fn provider_http_start(window: WebviewWindow, state: State<'_, ProviderNetwork>, provider: String, url: String, method: String, body: Option<String>, candidate_key: Option<String>) -> std::result::Result<NativeStart,String> {
    gate(&window).map_err(|_| "Only trusted editor may use provider transport")?;
    crate::provider_transport::endpoint(&provider,&url,&method)?;
    if body.as_ref().is_some_and(|b|b.len()>2_000_000) { return Err("Provider request is too large".into()); }
    if method=="GET" && body.is_some() {return Err("GET request body is not allowed".into());}
    // Candidate keys only validate account metadata, never inference before save.
    if candidate_key.is_some() && (method!="GET" || !matches!(url.as_str(),"https://api.openai.com/v1/models"|"https://api.anthropic.com/v1/models?limit=1"|"https://openrouter.ai/api/v1/key")) { return Err("Candidate key is allowed for authentication only".into()); }
    let key = if let Some(key)=candidate_key {
        if key.is_empty() || key.len()>8192 || key.chars().any(|c|c.is_control()||c.is_whitespace()) { return Err("Invalid API key".into()); } key
    } else {
        let p=provider.clone();tauri::async_runtime::spawn_blocking(move||agent_key_for(&p)?.get_password().map_err(|_| "OS credential store is locked or key is missing".to_string())).await.map_err(|_| "Credential lookup failed")??
    };
    let client=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(120)).build().map_err(|_| "Provider transport unavailable")?;
    let mut request=client.request(if method=="GET" {reqwest::Method::GET} else {reqwest::Method::POST},&url);
    request=if provider=="claude" {request.header("x-api-key",key).header("anthropic-version","2023-06-01")} else {request.bearer_auth(key)};
    if let Some(body)=body {request=request.header("content-type","application/json").body(body);}
    let response=request.send().await.map_err(|_| "Provider connection failed")?;
    let mut headers=BTreeMap::new();
    for name in ["content-type","retry-after"] {if let Some(v)=response.headers().get(name).and_then(|v|v.to_str().ok()) {headers.insert(name.into(),v.into());}}
    let status=response.status().as_u16();let id=uuid::Uuid::new_v4().to_string();
    let mut active=state.0.lock().await;active.retain(|_,r|r.expires>std::time::Instant::now());
    if active.len()>=4 { return Err("Too many active provider requests".into()); }
    let (sender,receiver)=tokio::sync::mpsc::channel(1);
    let task=tokio::spawn(async move {
      let mut response=response;
      loop {match response.chunk().await {
       Ok(Some(chunk)) if chunk.len()<=1_000_000 => {if sender.send(Ok(chunk.to_vec())).await.is_err(){break;}},
       Ok(None)=>break,
       _=>{let _=sender.send(Err("Provider stream interrupted".into())).await;break;}
      }}
    });
    active.insert(id.clone(),Arc::new(NativeResponse{receiver:tokio::sync::Mutex::new(receiver),task:task.abort_handle(),expires:std::time::Instant::now()+Duration::from_secs(120)}));
    Ok(NativeStart{id,status,headers})
}
#[tauri::command]
async fn provider_http_next(window: WebviewWindow,state: State<'_, ProviderNetwork>,id:String) -> std::result::Result<Option<Vec<u8>>,String> {
    gate(&window).map_err(|_| "Only trusted editor may read provider transport")?;
    let r=state.0.lock().await.get(&id).cloned().ok_or("Provider request is closed")?;
    if r.expires<std::time::Instant::now() {state.0.lock().await.remove(&id);return Err("Provider request timed out".into());}
    let mut receiver=r.receiver.lock().await;
    match tokio::time::timeout(Duration::from_secs(30),receiver.recv()).await {
      Ok(Some(Ok(chunk))) => Ok(Some(chunk)),
      Ok(None) => {state.0.lock().await.remove(&id);Ok(None)},
      _ => {state.0.lock().await.remove(&id);r.task.abort();Err("Provider stream interrupted".into())}
    }
}
#[tauri::command]
async fn provider_http_cancel(window:WebviewWindow,state:State<'_,ProviderNetwork>,id:String)->std::result::Result<(),String>{
 gate(&window).map_err(|_| "Only trusted editor may cancel provider transport")?;if let Some(r)=state.0.lock().await.remove(&id){r.task.abort();}Ok(())
}
#[tauri::command]
async fn agent_key_status(window: WebviewWindow, provider: String) -> std::result::Result<bool, String> {
    gate(&window).map_err(|_| "Only the trusted editor may inspect credentials")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy")?;
        match agent_key_for(&provider)?.get_password() {
            Ok(_) => Ok(true), Err(keyring::Error::NoEntry) => Ok(false),
            Err(_) => Err("OS credential store is locked or unavailable".into()),
        }
    }).await.map_err(|_| "Could not access credential store")?
}
#[tauri::command]
async fn agent_key_save(window: WebviewWindow, provider: String, api_key: String) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may save credentials")?;
    if api_key.is_empty() || api_key.len() > 8192 || api_key.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("Invalid API key".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy")?;
        agent_key_for(&provider)?.set_password(&api_key).map_err(|_| "OS credential store is locked or unavailable".into())
    }).await.map_err(|_| "Could not save credential")?
}
#[tauri::command]
async fn agent_key_delete(window: WebviewWindow, provider: String) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may delete credentials")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy")?;
        match agent_key_for(&provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("OS credential store is locked or unavailable".into()),
        }
    }).await.map_err(|_| "Could not delete credential")?
}
#[tauri::command]
async fn agent_settings_load(window: WebviewWindow) -> std::result::Result<AgentSettingsReply, String> {
    gate(&window).map_err(|_| "Only the trusted editor may access agent settings")?;
    let dir = window.app_handle().path().app_config_dir().map_err(|_| "App config directory is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Agent settings are busy")?;
        let p = crate::agent_settings::load(&dir.join("agent-settings.json"))?;
        let api_key = String::new(); // Keys are loaded independently through agent_key_load.
        Ok(AgentSettingsReply { provider: p.provider, model: p.model, api_key, custom_prompts: p.custom_prompts })
    }).await.map_err(|_| "Could not load agent settings")?
}
#[tauri::command]
async fn agent_settings_save(window: WebviewWindow, settings: AgentSettingsReply) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may save agent settings")?;
    let dir = window.app_handle().path().app_config_dir().map_err(|_| "App config directory is unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Agent settings are busy")?;
        let p = crate::agent_settings::Preferences { provider: settings.provider, model: settings.model, custom_prompts: settings.custom_prompts };
        p.validate()?;
        if settings.api_key.len() > 8192 || settings.api_key.contains(['\r', '\n', '\0']) { return Err("Invalid API key".into()); }
        crate::agent_settings::save(&dir.join("agent-settings.json"), &p)
    }).await.map_err(|_| "Could not save agent settings")?
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
    chat: Option<bool>,
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
            if chat.unwrap_or(false) {
                if files.len() >= 5 {
                    return Err(AppError::Limit);
                }
                let mut bytes = Vec::new();
                std::fs::File::open(&path)?
                    .take(10_000_001)
                    .read_to_end(&mut bytes)?;
                if bytes.is_empty() || bytes.len() > 10_000_000 {
                    return Err(AppError::Limit);
                }
                total += bytes.len();
                if total > 50_000_000 {
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
            if !["html", "htm", "css", "js", "json", "svg", "txt", "md", "tex"].contains(&ext.as_str()) {
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
    /// Physical drop position for routing to the visible session-chat target.
    position: [f64; 2],
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
// ---------- image editor file access (one-time grants, raw bytes, atomic save) ----------
#[derive(Default)]
struct ImageGrants {
    read: Mutex<Option<crate::image_io::ImageGrant>>,
    save: Mutex<Option<crate::image_io::ImageGrant>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageGrantReply {
    token: String,
    name: String,
    size: u64,
}
fn image_name(path: &std::path::Path) -> String {
    path.file_name().unwrap_or_default().to_string_lossy().into_owned()
}
/// OS open dialog for one image. The renderer receives a one-time token, never a path.
#[tauri::command]
async fn image_pick(window: WebviewWindow, grants: State<'_, ImageGrants>) -> Result<Option<ImageGrantReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Images", &crate::image_io::IMAGE_EXTENSIONS).blocking_pick_file()
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else { return Ok(None) };
    let path = selected.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    let size = crate::image_io::checked_image_size(&path)?;
    let name = image_name(&path);
    let grant = crate::image_io::ImageGrant::new(path);
    let token = grant.token().to_owned();
    *grants.read.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(Some(ImageGrantReply { token, name, size }))
}
/// Raw bytes (no base64) of the file granted by image_pick. The grant works once.
#[tauri::command]
async fn image_read(window: WebviewWindow, grants: State<'_, ImageGrants>, token: String) -> Result<tauri::ipc::Response> {
    gate(&window)?;
    let path = {
        let mut slot = grants.read.lock().map_err(|e| AppError::Io(e.to_string()))?;
        crate::image_io::ImageGrant::consume(&mut slot, &token)?
    };
    let bytes = tauri::async_runtime::spawn_blocking(move || crate::image_io::read_image(&path))
        .await
        .map_err(|e| AppError::Io(e.to_string()))??;
    Ok(tauri::ipc::Response::new(bytes))
}
/// OS save dialog. Choosing an existing file makes the OS ask about overwriting. Nothing is written yet.
#[tauri::command]
async fn image_save_pick(window: WebviewWindow, grants: State<'_, ImageGrants>, suggested_name: String) -> Result<Option<ImageGrantReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let suggested: String = suggested_name.chars().filter(|c| !matches!(c, '/' | '\\' | '\0')).take(120).collect();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Images", &crate::image_io::IMAGE_EXTENSIONS).set_file_name(suggested).blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else { return Ok(None) };
    let path = selected.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    if !crate::image_io::has_image_extension(&path) {
        return Err(AppError::Denied("Save as PNG, JPEG, WebP or SVG".into()));
    }
    let name = image_name(&path);
    let grant = crate::image_io::ImageGrant::new(path);
    let token = grant.token().to_owned();
    *grants.save.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(Some(ImageGrantReply { token, name, size: 0 }))
}
/// Raw request body = file bytes, header x-somnia-token = token from image_save_pick. Written atomically, once.
#[tauri::command]
async fn image_save_write(window: WebviewWindow, grants: State<'_, ImageGrants>, request: tauri::ipc::Request<'_>) -> Result<()> {
    gate(&window)?;
    let token = request
        .headers()
        .get("x-somnia-token")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| AppError::Denied("Missing save token".into()))?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err(AppError::Invalid("Expected raw image bytes".into())),
    };
    let path = {
        let mut slot = grants.save.lock().map_err(|e| AppError::Io(e.to_string()))?;
        crate::image_io::ImageGrant::consume(&mut slot, &token)?
    };
    tauri::async_runtime::spawn_blocking(move || crate::image_io::save_image_atomic(&path, &bytes))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
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
        .manage(ProviderNetwork::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared.clone())
        .manage(ImageGrants::default())
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
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position, .. }) =
                    event
                {
                    let shared = window.state::<Shared>();
                    if let Ok(mut backend) = shared.lock() {
                        let grant = DropGrant::new(paths.clone());
                        let reply = DropReply {
                            token: grant.token().to_owned(),
                            count: paths.len(),
                            position: [position.x, position.y],
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
            provider_http_start,
            provider_http_next,
            provider_http_cancel,
            agent_key_status,
            agent_key_save,
            agent_key_delete,
            agent_settings_load,
            agent_settings_save,
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
            image_pick,
            image_read,
            image_save_pick,
            image_save_write,
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
