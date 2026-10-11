//! Native-only Vibe Space adapter. Registration is owned by desktop integration.
//! Do not expose this module to extension windows or instantiate a second Runtime.
use crate::app_command_error::AppCommandError;
use serde::{Deserialize, Serialize};
use somnia_vibespace_core::{engine, runtime::Runtime, storage as db, wire as w};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager, State, Webview, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const RUN_CHANNEL: &str = "somnia://vibespace-run";
const KEY_SERVICE: &str = "de.philipp-paulik.somnia.agent";
type Result<T> = std::result::Result<T, AppCommandError>;

fn error(code: &str, expected: bool) -> AppCommandError {
    // Existing registry id; the specific bridge cause is in the fixed code, never raw errors.
    AppCommandError::new(
        "SOM-FS-004",
        code,
        "Vibe Space could not complete this action. Reload its native state and check Problems.",
        expected,
    )
}
fn failed<E>(_: E) -> AppCommandError {
    error("vibespace_native_failed", false)
}
fn allowed_caller(
    window: &str,
    webview: &str,
    scheme: &str,
    host: Option<&str>,
    port: Option<u16>,
) -> bool {
    if window != "main" || webview != "main" {
        return false;
    }
    matches!(
        (scheme, host, port),
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None)
    ) || (cfg!(debug_assertions)
        && matches!(
            (scheme, host, port),
            ("http", Some("127.0.0.1"), Some(1420))
        ))
}
fn gate(window: &WebviewWindow, webview: &Webview) -> Result<()> {
    let url = webview.url().map_err(failed)?;
    if !allowed_caller(
        window.label(),
        webview.label(),
        url.scheme(),
        url.host_str(),
        url.port(),
    ) || webview.window().label() != window.label()
    {
        return Err(error("vibespace_main_only", true));
    }
    Ok(())
}

#[derive(Default)]
struct CollectionVersion {
    revision: u64,
    fingerprint: Option<serde_json::Value>,
}
impl CollectionVersion {
    fn changed(&mut self) -> Result<()> {
        // Keep the JavaScript number exact; fail rather than wrap or reuse an old revision.
        if self.revision >= 9_007_199_254_740_991 {
            return Err(error("vibespace_revision_exhausted", false));
        }
        self.revision += 1;
        Ok(())
    }
    fn observe(&mut self, fingerprint: serde_json::Value) -> Result<u64> {
        if self.fingerprint.as_ref() != Some(&fingerprint) {
            self.changed()?;
            self.fingerprint = Some(fingerprint);
        }
        Ok(self.revision)
    }
}
/// Managed once per app. Configured refs are supplied by native setup, not IPC.
/// Runtime::open performs artifact recovery. The cached result prevents repeat recovery.
pub struct VibeSpaceState {
    runtime: OnceLock<std::result::Result<Arc<Runtime>, AppCommandError>>,
    version: Arc<Mutex<CollectionVersion>>,
    configured: Vec<w::ModelReference>,
}
impl VibeSpaceState {
    pub fn new(configured: Vec<w::ModelReference>) -> Result<Self> {
        if configured.len() > 199 {
            return Err(error("vibespace_model_limit", true));
        }
        for reference in &configured {
            provider_config(reference)?;
        }
        Ok(Self {
            runtime: OnceLock::new(),
            version: Arc::new(Mutex::new(CollectionVersion::default())),
            configured,
        })
    }
    fn runtime(&self, app: &tauri::AppHandle) -> Result<Arc<Runtime>> {
        self.runtime
            .get_or_init(|| {
                let data = app.path().app_data_dir().map_err(failed)?.join("vibespace");
                // Platform gate is compiled natively, never enabled by renderer settings.
                let runtime = Runtime::open_owned(&data, native_files_enabled(),
                    somnia_vibespace_core::ownership::OwnerKind::Gui, false)
                    .map_err(|e| AppCommandError::new("SOM-FS-006", "vibespace_ownership_or_recovery", e.0, true))?;
                // Subscribe before commands can start a run. Exactly one publisher per owning state.
                let mut receiver = runtime.subscribe();
                let app = app.clone();
                let version = self.version.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        match receiver.recv().await {
                            Ok(mut event) => {
                                restrict_platform_event(&mut event);
                                let bumped =
                                    version.lock().map_err(failed).and_then(|mut v| v.changed());
                                if bumped.is_err() {
                                    publication_problem(&app, "vibespace_revision_failed");
                                }
                                // emit_to is not an app broadcast: private run data stays in main.
                                if app
                                    .emit_to(
                                        tauri::EventTarget::webview_window("main"),
                                        RUN_CHANNEL,
                                        &event,
                                    )
                                    .is_err()
                                {
                                    publication_problem(&app, "vibespace_publication_failed");
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                                let _ = version.lock().map(|mut v| v.changed());
                                publication_problem(&app, "vibespace_resync_required");
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                                publication_problem(&app, "vibespace_publication_closed");
                                break;
                            }
                        }
                    }
                });
                Ok(runtime)
            })
            .as_ref()
            .cloned()
            .map_err(Clone::clone)
    }
    fn changed(&self) -> Result<()> {
        self.version.lock().map_err(failed)?.changed()
    }
    fn models(&self, app: &tauri::AppHandle) -> Result<Vec<w::ModelReference>> {
        let mut refs = self.configured.clone();
        let path = app
            .path()
            .app_config_dir()
            .map_err(failed)?
            .join("agent-settings.json");
        let prefs = crate::agent_settings::load(&path).map_err(failed)?;
        if !prefs.model.is_empty() {
            let locality = if prefs.provider == "ollama" || prefs.provider == "lmstudio" {
                w::ModelLocality::Local
            } else {
                w::ModelLocality::Cloud
            };
            let reference = w::ModelReference {
                provider: prefs.provider,
                model: prefs.model,
                locality,
            };
            // Claude/account Responses settings are real but unsupported, not chooser options.
            if provider_config(&reference).is_ok() && !refs.contains(&reference) {
                refs.push(reference);
            }
        }
        Ok(refs)
    }
}
/// Call in setup exactly once; only desktop integration can supply configured refs.
pub fn manage(app: &tauri::AppHandle, configured: Vec<w::ModelReference>) -> Result<()> {
    if !app.manage(VibeSpaceState::new(configured)?) {
        return Err(error("vibespace_already_managed", false));
    }
    Ok(())
}
fn publication_problem(app: &tauri::AppHandle, code: &'static str) {
    let err = crate::cmd::cmd::<()>("vibespace_publication", Some("main"), || {
        Err(error(code, false))
    })
    .expect_err("publication problem always returns an error");
    // Intentionally NOT a RunEvent: no invented run id or sequence. P5 parseEvent rejects it
    // and invokes onError, invalidating actions until its full native refresh succeeds.
    let _ = app.emit_to(
        tauri::EventTarget::webview_window("main"),
        RUN_CHANNEL,
        serde_json::json!({"resyncRequired": true, "problem": err}),
    );
}

/// Windows and Linux broker/file/journal suites passed native CI run38146543284.
/// This does not grant arbitrary exec or claim an OS sandbox.
fn native_files_enabled() -> bool {
    cfg!(any(target_os = "windows", target_os = "linux"))
}
fn require_native_files() -> Result<()> {
    if !native_files_enabled() {
        return Err(error("vibespace_platform_files_not_verified", true));
    }
    Ok(())
}
fn restrict_platform_snapshot(snapshot: &mut w::RunSnapshot) {
    if !native_files_enabled() {
        snapshot.capabilities.apply = false;
        snapshot.capabilities.restore = false;
        for checkpoint in &mut snapshot.checkpoints {
            checkpoint.restorable = false;
        }
    }
}
fn restrict_platform_event(event: &mut w::RunEvent) {
    if !native_files_enabled() {
        if let Some(capabilities) = event
            .payload
            .get_mut("capabilities")
            .and_then(serde_json::Value::as_object_mut)
        {
            capabilities.insert("apply".into(), false.into());
            capabilities.insert("restore".into(), false.into());
        }
        if let Some(checkpoints) = event
            .payload
            .get_mut("checkpoints")
            .and_then(serde_json::Value::as_array_mut)
        {
            for checkpoint in checkpoints {
                if let Some(checkpoint) = checkpoint.as_object_mut() {
                    checkpoint.insert("restorable".into(), false.into());
                }
            }
        }
    }
}

fn provider_config(reference: &w::ModelReference) -> Result<engine::ModelConfig> {
    if reference.model.trim().is_empty()
        || reference.model.len() > 256
        || reference.model.chars().any(char::is_control)
        || db::redact::text_contains_secret(&reference.model)
    {
        return Err(error("vibespace_invalid_model", true));
    }
    let endpoint = match (reference.provider.as_str(), &reference.locality) {
        ("ollama", w::ModelLocality::Local) => "http://127.0.0.1:11434/v1/chat/completions",
        ("lmstudio", w::ModelLocality::Local) => "http://127.0.0.1:1234/v1/chat/completions",
        ("openai", w::ModelLocality::Cloud) => "https://api.openai.com/v1/chat/completions",
        ("openrouter", w::ModelLocality::Cloud) => "https://openrouter.ai/api/v1/chat/completions",
        _ => return Err(error("vibespace_unsupported_provider", true)),
    };
    Ok(match reference.locality {
        w::ModelLocality::Local => engine::ModelConfig::Local {
            endpoint: endpoint.into(),
            model: reference.model.clone(),
        },
        w::ModelLocality::Cloud => engine::ModelConfig::Byok {
            endpoint: endpoint.into(),
            model: reference.model.clone(),
        },
    })
}
fn resolve(
    reference: &w::ModelReference,
) -> Result<(Arc<dyn engine::ModelTransport>, engine::ModelConfig)> {
    let config = provider_config(reference)?;
    let credential = if reference.locality == w::ModelLocality::Cloud {
        let secret = keyring::Entry::new(KEY_SERVICE, &reference.provider)
            .map_err(failed)?
            .get_password()
            .map_err(|_| error("vibespace_key_unavailable", true))?;
        if secret.is_empty() {
            return Err(error("vibespace_key_unavailable", true));
        }
        Some(engine::Secret::new(secret))
    } else {
        None
    };
    // HttpModel uses no_proxy(), redirects disabled and no environment credentials.
    let transport = engine::HttpModel::new(config.clone(), credential, true).map_err(failed)?;
    Ok((Arc::new(transport), config))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FolderGrant {
    pub folder_grant_id: String,
    pub folder: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunId {
    pub run_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteerRun {
    pub run_id: String,
    pub message: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyRun {
    pub run_id: String,
    pub review_revision: String,
    pub paths: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscardRun {
    pub run_id: String,
    pub review_revision: String,
    pub paths: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreCheckpoint {
    pub run_id: String,
    pub checkpoint_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryList {
    pub space_id: String,
    #[serde(default)]
    pub include_pending: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryAdd {
    pub space_id: String,
    pub kind: db::MemoryKind,
    pub title: Option<String>,
    pub content: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryDelete {
    pub space_id: String,
    pub memory_id: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryProvenance {
    pub source: db::MemorySource,
    pub source_ref: Option<String>,
    pub consent: db::MemoryConsent,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryReply {
    pub schema_version: u32,
    pub id: String,
    pub space_id: String,
    pub kind: db::MemoryKind,
    pub title: Option<String>,
    pub content: String,
    pub provenance: MemoryProvenance,
    pub instruction_authority: String,
    pub created_at: String,
}
impl From<db::MemoryItem> for MemoryReply {
    fn from(item: db::MemoryItem) -> Self {
        Self {
            schema_version: item.schema_version,
            id: item.id,
            space_id: item.space_id,
            kind: item.kind,
            title: item.title,
            content: item.content,
            provenance: MemoryProvenance {
                source: item.provenance.source,
                source_ref: item.provenance.source_ref,
                consent: item.provenance.consent,
            },
            instruction_authority: item.instruction_authority,
            created_at: item.created_at,
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadProjection {
    pub revision: u64,
    pub models: Vec<w::ModelReference>,
    pub runs: Vec<w::SnapshotReply>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeCapabilities {
    pub transport: bool,
    pub files: bool,
    pub actions: Vec<String>,
    pub pause: bool,
    pub resume: bool,
    pub catalog: bool,
}

// No elapsed clock in the version fingerprint. Durable run sequences and all other
// projection content DO participate. Re-reading a running clock is not a mutation.
fn collection_fingerprint(
    spaces: &[w::SpaceSummary],
    studios: &[w::StudioSummary],
    models: &[w::ModelReference],
    runs: &[w::SnapshotReply],
) -> Result<serde_json::Value> {
    let mut runs = serde_json::to_value(runs).map_err(failed)?;
    if let Some(runs) = runs.as_array_mut() {
        for run in runs {
            if let Some(snapshot) = run
                .get_mut("snapshot")
                .and_then(serde_json::Value::as_object_mut)
            {
                snapshot.remove("elapsedMs");
            }
        }
    }
    Ok(serde_json::json!({"spaces": spaces, "studios": studios, "models": models, "runs": runs}))
}

#[tauri::command]
pub async fn vibespace_choose_folder(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
) -> Result<Option<FolderGrant>> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_choose_folder", Some(&label), async {
        gate(&window, &webview)?;
        let runtime = state.runtime(window.app_handle())?;
        let app = window.app_handle().clone();
        let selected = tauri::async_runtime::spawn_blocking(move || {
            app.dialog().file().blocking_pick_folder()
        })
        .await
        .map_err(failed)?;
        // Revalidate after the native dialog: the caller may have navigated meanwhile.
        gate(&window, &webview)?;
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(failed)?;
        let folder = path
            .to_str()
            .ok_or_else(|| error("vibespace_folder_encoding", true))?
            .to_string();
        let folder_grant_id = runtime
            .grant_native_folder(window.label(), &path)
            .map_err(failed)?;
        Ok(Some(FolderGrant {
            folder_grant_id,
            folder,
        }))
    })
    .await
}

// Each request is one strict DTO under `request`, matching P5 native.ts.
macro_rules! sync_command {
    ($name:ident, $req:ty, $out:ty, $mutates:expr, |$rt:ident, $request:ident, $window:ident, $state:ident| $body:block) => {
        #[tauri::command]
        pub fn $name(
            window: WebviewWindow,
            webview: Webview,
            state: State<'_, VibeSpaceState>,
            request: $req,
        ) -> Result<$out> {
            crate::cmd::cmd(stringify!($name), Some(window.label()), || {
                gate(&window, &webview)?;
                let $rt = state.runtime(window.app_handle())?;
                let $request = request;
                let $window = &window;
                let $state = &*state;
                let result: Result<$out> = (|| $body)();
                if $mutates && result.is_ok() {
                    state.changed()?;
                }
                result
            })
        }
    };
}
sync_command!(
    vibespace_create_space,
    w::CreateSpace,
    w::SpaceSummary,
    true,
    |runtime, request, window, _state| {
        runtime
            .create_space(window.label(), request)
            .map_err(failed)
    }
);
sync_command!(
    vibespace_create_studio,
    w::CreateStudio,
    w::StudioSummary,
    true,
    |runtime, request, window, state| {
        provider_config(&request.model)?;
        if !state.models(window.app_handle())?.contains(&request.model) {
            return Err(error("vibespace_model_not_configured", true));
        }
        runtime.create_studio(request).map_err(failed)
    }
);
sync_command!(
    vibespace_decide_consent,
    w::ConsentDecision,
    (),
    true,
    |runtime, request, _window, _state| { runtime.decide(request).map_err(failed) }
);
sync_command!(
    vibespace_apply_run,
    ApplyRun,
    (),
    true,
    |runtime, request, _window, _state| {
        // These are selected relative review entries, not renderer filesystem roots.
        require_native_files()?;
        runtime
            .apply(&request.run_id, &request.review_revision, request.paths)
            .map_err(failed)
    }
);
sync_command!(
    vibespace_discard_run,
    DiscardRun,
    (),
    true,
    |runtime, request, _window, _state| {
        if !request.paths.is_empty() {
            return Err(error("vibespace_discard_paths_not_empty", true));
        }
        runtime
            .discard(&request.run_id, &request.review_revision)
            .map_err(failed)
    }
);
sync_command!(
    vibespace_restore_checkpoint,
    RestoreCheckpoint,
    (),
    true,
    |runtime, request, _window, _state| {
        require_native_files()?;
        runtime
            .restore(&request.run_id, &request.checkpoint_id)
            .map_err(failed)
    }
);
sync_command!(
    vibespace_memory_list,
    MemoryList,
    Vec<MemoryReply>,
    false,
    |runtime, request, _window, _state| {
        runtime
            .store
            .list_memory(
                &request.space_id,
                &db::MemoryListOptions {
                    include_pending: request.include_pending,
                    limit: 500,
                    offset: 0,
                },
            )
            .map(|items| items.into_iter().map(MemoryReply::from).collect())
            .map_err(failed)
    }
);
sync_command!(
    vibespace_memory_add,
    MemoryAdd,
    MemoryReply,
    true,
    |runtime, request, _window, _state| {
        runtime
            .store
            .add_memory(db::NewMemory {
                schema_version: db::DTO_SCHEMA_VERSION,
                space_id: request.space_id,
                kind: request.kind,
                title: request.title,
                content: request.content,
                source: db::MemorySource::User,
                source_ref: None,
                consent: db::MemoryConsent::UserExplicit,
            })
            .map(MemoryReply::from)
            .map_err(failed)
    }
);
sync_command!(
    vibespace_memory_delete,
    MemoryDelete,
    bool,
    true,
    |runtime, request, _window, _state| {
        runtime
            .store
            .delete_memory(&request.space_id, &request.memory_id)
            .map_err(failed)
    }
);

#[tauri::command]
pub fn vibespace_list_spaces(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
) -> Result<Vec<w::SpaceSummary>> {
    crate::cmd::cmd("vibespace_list_spaces", Some(window.label()), || {
        gate(&window, &webview)?;
        state
            .runtime(window.app_handle())?
            .list_spaces()
            .map_err(failed)
    })
}
#[tauri::command]
pub fn vibespace_list_studios(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
) -> Result<Vec<w::StudioSummary>> {
    crate::cmd::cmd("vibespace_list_studios", Some(window.label()), || {
        gate(&window, &webview)?;
        state
            .runtime(window.app_handle())?
            .list_studios()
            .map_err(failed)
    })
}
#[tauri::command]
pub fn vibespace_read_snapshot(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
) -> Result<ReadProjection> {
    crate::cmd::cmd("vibespace_read_snapshot", Some(window.label()), || {
        gate(&window, &webview)?;
        let runtime = state.runtime(window.app_handle())?;
        // Store/core have no atomic collection read in 4687285. Bound churn rather than
        // attach a made-up revision to a mixed read. No event sequence is ever a revision.
        for _ in 0..3 {
            let start_version = state.version.lock().map_err(failed)?.revision;
            let spaces = runtime.list_spaces().map_err(failed)?;
            let studios = runtime.list_studios().map_err(failed)?;
            let models = state.models(window.app_handle())?;
            let mut runs = runtime.list_snapshots().map_err(failed)?;
            for run in &mut runs {
                restrict_platform_snapshot(&mut run.snapshot);
            }
            let fingerprint = collection_fingerprint(&spaces, &studios, &models, &runs)?;
            let mut again_runs = runtime.list_snapshots().map_err(failed)?;
            for run in &mut again_runs {
                restrict_platform_snapshot(&mut run.snapshot);
            }
            let again = collection_fingerprint(
                &runtime.list_spaces().map_err(failed)?,
                &runtime.list_studios().map_err(failed)?,
                &state.models(window.app_handle())?,
                &again_runs,
            )?;
            let mut version = state.version.lock().map_err(failed)?;
            if fingerprint == again && version.revision == start_version {
                let revision = version.observe(fingerprint)?;
                return Ok(ReadProjection {
                    revision,
                    models,
                    runs,
                });
            }
        }
        Err(error("vibespace_read_changed", true))
    })
}
#[tauri::command]
pub fn vibespace_capabilities(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
) -> Result<NativeCapabilities> {
    crate::cmd::cmd("vibespace_capabilities", Some(window.label()), || {
        gate(&window, &webview)?;
        state.runtime(window.app_handle())?;
        // This means an adapter/configuration exists, NOT installed/reachable/smoke-tested.
        let transport = state
            .models(window.app_handle())?
            .iter()
            .any(|reference| resolve(reference).is_ok());
        let mut actions = vec![
            "create-space",
            "create-studio",
            "stop",
            "steer",
            "consent",
            "review",
        ];
        if native_files_enabled() {
            actions.push("restore");
        }
        if transport {
            actions.extend(["start", "retry"]);
        }
        Ok(NativeCapabilities {
            transport,
            files: native_files_enabled(),
            actions: actions.into_iter().map(String::from).collect(),
            pause: false,
            resume: false,
            catalog: false,
        })
    })
}
#[tauri::command]
pub async fn vibespace_start_run(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    request: w::StartRun,
) -> Result<w::SnapshotReply> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_start_run", Some(&label), async {
        gate(&window, &webview)?;
        let runtime = state.runtime(window.app_handle())?;
        if let Some(old) = runtime
            .store
            .get_run_by_request(&request.request_id)
            .map_err(failed)?
        {
            if old.studio_id != request.studio_id || old.retry_of_run_id != request.retry_of_run_id
            {
                return Err(error("vibespace_request_identity_conflict", true));
            }
            let mut reply = runtime.snapshot(&old.id).map_err(failed)?;
            restrict_platform_snapshot(&mut reply.snapshot);
            return Ok(reply);
        }
        // Resolve ONLY the saved Studio model. No endpoint/key/model override in StartRun.
        let studio = runtime
            .list_studios()
            .map_err(failed)?
            .into_iter()
            .find(|s| s.studio_id == request.studio_id)
            .ok_or_else(|| error("vibespace_studio_missing", true))?;
        if !state.models(window.app_handle())?.contains(&studio.model) {
            return Err(error("vibespace_model_not_configured", true));
        }
        let reference = studio.model;
        let (transport, config) = tauri::async_runtime::spawn_blocking(move || resolve(&reference))
            .await
            .map_err(failed)??;
        gate(&window, &webview)?;
        let mut result = runtime
            .start(request, transport, config)
            .await
            .map_err(failed)?;
        restrict_platform_snapshot(&mut result.snapshot);
        state.changed()?;
        Ok(result)
    })
    .await
}
#[tauri::command]
pub async fn vibespace_stop_run(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    request: RunId,
) -> Result<()> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_stop_run", Some(&label), async {
        gate(&window, &webview)?;
        state
            .runtime(window.app_handle())?
            .stop(&request.run_id)
            .await
            .map_err(failed)?;
        state.changed()
    })
    .await
}
#[tauri::command]
pub async fn vibespace_steer_run(
    window: WebviewWindow,
    webview: Webview,
    state: State<'_, VibeSpaceState>,
    request: SteerRun,
) -> Result<()> {
    let label = window.label().to_string();
    crate::cmd::cmd_async("vibespace_steer_run", Some(&label), async {
        gate(&window, &webview)?;
        if request.message.trim().is_empty()
            || request.message.len() > 8192
            || request.message.contains('\0')
        {
            return Err(error("vibespace_invalid_steer", true));
        }
        state
            .runtime(window.app_handle())?
            .steer(&request.run_id, request.message)
            .await
            .map_err(failed)?;
        state.changed()
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::de::DeserializeOwned;
    fn rejects_extra<T: DeserializeOwned>(base: serde_json::Value) {
        let mut value = base;
        assert!(serde_json::from_value::<T>(value.clone()).is_ok());
        for field in ["apiKey", "endpoint", "path", "window", "scope", "arguments"] {
            value
                .as_object_mut()
                .unwrap()
                .insert(field.into(), serde_json::json!("forbidden"));
            assert!(
                serde_json::from_value::<T>(value.clone()).is_err(),
                "accepted {field}"
            );
            value.as_object_mut().unwrap().remove(field);
        }
    }
    #[test]
    fn files_gate_enables_only_native_verified_alpha_platforms() {
        assert_eq!(
            native_files_enabled(),
            cfg!(any(target_os = "windows", target_os = "linux"))
        );
        assert_eq!(require_native_files().is_ok(), native_files_enabled());
        let mut payload = serde_json::json!({"capabilities":{"apply":true,"restore":true},"checkpoints":[{"restorable":true}]});
        let mut event = w::RunEvent {
            protocol_version: 1,
            run_id: "r".into(),
            sequence: 1,
            timestamp_utc: "2026-10-11T15:00:00Z".into(),
            kind: "run_snapshot".into(),
            payload: payload.clone(),
        };
        restrict_platform_event(&mut event);
        if !native_files_enabled() {
            payload["capabilities"]["apply"] = false.into();
            payload["capabilities"]["restore"] = false.into();
            payload["checkpoints"][0]["restorable"] = false.into();
        }
        assert_eq!(event.payload, payload);
    }
    #[test]
    fn request_dtos_reject_renderer_authority() {
        rejects_extra::<w::CreateSpace>(
            serde_json::json!({"name":"space", "folderGrantId":"grant"}),
        );
        rejects_extra::<w::CreateStudio>(
            serde_json::json!({"spaceId":"s", "goal":"edit", "model":{"provider":"ollama", "model":"configured", "locality":"local"}}),
        );
        rejects_extra::<w::StartRun>(
            serde_json::json!({"studioId":"s", "requestId":"q", "retryOfRunId":null}),
        );
        rejects_extra::<w::ConsentDecision>(
            serde_json::json!({"runId":"r", "requestId":"q", "choice":"deny"}),
        );
        rejects_extra::<RunId>(serde_json::json!({"runId":"r"}));
        rejects_extra::<SteerRun>(serde_json::json!({"runId":"r", "message":"continue"}));
        rejects_extra::<ApplyRun>(
            serde_json::json!({"runId":"r", "reviewRevision":"rev", "paths":["index.html"]}),
        );
        rejects_extra::<DiscardRun>(
            serde_json::json!({"runId":"r", "reviewRevision":"rev", "paths":[]}),
        );
        rejects_extra::<RestoreCheckpoint>(serde_json::json!({"runId":"r", "checkpointId":"c"}));
        rejects_extra::<MemoryList>(serde_json::json!({"spaceId":"s"}));
        rejects_extra::<MemoryAdd>(
            serde_json::json!({"spaceId":"s", "kind":"note", "title":null, "content":"note"}),
        );
        rejects_extra::<MemoryDelete>(serde_json::json!({"spaceId":"s", "memoryId":"m"}));
        assert!(serde_json::from_str::<w::CreateStudio>(r#"{"spaceId":"s","goal":"g","model":{"provider":"ollama","model":"x","locality":"local","apiKey":"key"}}"#).is_err());
    }
    #[test]
    fn providers_map_to_exact_fixed_endpoints() {
        for (provider, locality, endpoint) in [
            (
                "ollama",
                w::ModelLocality::Local,
                "http://127.0.0.1:11434/v1/chat/completions",
            ),
            (
                "lmstudio",
                w::ModelLocality::Local,
                "http://127.0.0.1:1234/v1/chat/completions",
            ),
            (
                "openai",
                w::ModelLocality::Cloud,
                "https://api.openai.com/v1/chat/completions",
            ),
            (
                "openrouter",
                w::ModelLocality::Cloud,
                "https://openrouter.ai/api/v1/chat/completions",
            ),
        ] {
            let reference = w::ModelReference {
                provider: provider.into(),
                model: "explicit-model".into(),
                locality: locality.clone(),
            };
            let config = provider_config(&reference).unwrap();
            assert_eq!(config.endpoint(), endpoint);
            assert_eq!(config.model(), "explicit-model");
            assert_eq!(
                matches!(config, engine::ModelConfig::Local { .. }),
                locality == w::ModelLocality::Local
            );
        }
        for provider in [
            "claude",
            "responses",
            "openai-responses",
            "https://attacker.invalid",
            "OLLAMA",
        ] {
            assert!(provider_config(&w::ModelReference {
                provider: provider.into(),
                model: "x".into(),
                locality: w::ModelLocality::Cloud
            })
            .is_err());
        }
        assert!(provider_config(&w::ModelReference {
            provider: "ollama".into(),
            model: "x".into(),
            locality: w::ModelLocality::Cloud
        })
        .is_err());
        assert!(provider_config(&w::ModelReference {
            provider: "openai".into(),
            model: "x".into(),
            locality: w::ModelLocality::Local
        })
        .is_err());
    }
    #[test]
    fn only_trusted_main_webview_is_allowed() {
        assert!(allowed_caller(
            "main",
            "main",
            "tauri",
            Some("localhost"),
            None
        ));
        assert!(allowed_caller(
            "main",
            "main",
            "http",
            Some("tauri.localhost"),
            None
        ));
        for (window, view, scheme, host, port) in [
            ("extension", "extension", "tauri", Some("localhost"), None),
            ("main", "plugin", "tauri", Some("localhost"), None),
            ("main", "main", "somnia-ext", Some("localhost"), None),
            ("main", "main", "https", Some("attacker.invalid"), None),
            ("main", "main", "http", Some("localhost"), Some(1420)),
            ("main", "main", "http", Some("127.0.0.1"), Some(1421)),
        ] {
            assert!(!allowed_caller(window, view, scheme, host, port));
        }
        assert_eq!(
            allowed_caller("main", "main", "http", Some("127.0.0.1"), Some(1420)),
            cfg!(debug_assertions)
        );
    }
    #[test]
    fn collection_counter_is_not_event_sequence() {
        let mut version = CollectionVersion::default();
        assert_eq!(
            version
                .observe(serde_json::json!({"sequence":999}))
                .unwrap(),
            1
        );
        assert_eq!(
            version
                .observe(serde_json::json!({"sequence":999}))
                .unwrap(),
            1
        );
        version.changed().unwrap();
        assert_eq!(
            version
                .observe(serde_json::json!({"sequence":999}))
                .unwrap(),
            2
        );
        assert_eq!(
            version
                .observe(serde_json::json!({"sequence":1000}))
                .unwrap(),
            3
        );
        assert_eq!(CollectionVersion::default().revision, 0);
    }
    #[test]
    fn errors_never_include_raw_details() {
        let error = failed("secret-token /private/folder transport response");
        let text = serde_json::to_string(&error).unwrap();
        assert!(
            !text.contains("secret-token")
                && !text.contains("private/folder")
                && !text.contains("transport response")
        );
    }
}
