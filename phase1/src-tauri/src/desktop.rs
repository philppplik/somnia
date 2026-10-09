use crate::drop_grant::DropGrant;
use crate::service::{AppError, Project, SyncFolder, SyncRead, ReadReply, RecoveryHistoryEntry, RecoverySafeRestore, RecoveryRecord, Result, Revision, StateEvent};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct Backend {
    sync: Option<SyncFolder>,
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

// ---- OpenAI account (OAuth) token storage: see docs/agent/oauth-token-store.md ----
// Tokens live only in the OS credential store and in this process; the renderer sees Status only.
const AGENT_KEY_SERVICE: &str = "de.philipp-paulik.somnia.agent";
struct KeyringBackend;
impl crate::oauth_store::SecretBackend for KeyringBackend {
    fn get(&self, slot: &str) -> std::result::Result<Option<String>, crate::oauth_store::StoreError> {
        match keyring::Entry::new(AGENT_KEY_SERVICE, slot).map_err(|_| crate::oauth_store::StoreError::Backend)?.get_password() {
            Ok(v) => Ok(Some(v)), Err(keyring::Error::NoEntry) => Ok(None), Err(_) => Err(crate::oauth_store::StoreError::Backend),
        }
    }
    fn set(&self, slot: &str, value: &str) -> std::result::Result<(), crate::oauth_store::StoreError> {
        keyring::Entry::new(AGENT_KEY_SERVICE, slot).map_err(|_| crate::oauth_store::StoreError::Backend)?.set_password(value).map_err(|_| crate::oauth_store::StoreError::Backend)
    }
    fn delete(&self, slot: &str) -> std::result::Result<(), crate::oauth_store::StoreError> {
        match keyring::Entry::new(AGENT_KEY_SERVICE, slot).map_err(|_| crate::oauth_store::StoreError::Backend)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(_) => Err(crate::oauth_store::StoreError::Backend),
        }
    }
}
fn oauth_store() -> crate::oauth_store::Store<KeyringBackend> { crate::oauth_store::Store::new(KeyringBackend) }
fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }
/// Set by the login flow (agent_account_start/cancel) while a browser login is in flight.
pub(crate) static OAUTH_PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// The login flow calls `oauth_saved()` after `Store::save_tokens` so the scheduler re-plans.
pub(crate) static OAUTH_WAKE: tokio::sync::Notify = tokio::sync::Notify::const_new();
pub(crate) fn oauth_saved() { OAUTH_PENDING.store(false, std::sync::atomic::Ordering::SeqCst); OAUTH_WAKE.notify_one(); }
// Serializes refreshes: refresh tokens can rotate, so two concurrent refreshes would invalidate each other.
static OAUTH_REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const ACCOUNT_ERROR: &str = "OpenAI account is not available. Reconnect it in Settings.";
async fn blocking_store<T: Send + 'static>(f: impl FnOnce(&crate::oauth_store::Store<KeyringBackend>) -> std::result::Result<T, crate::oauth_store::StoreError> + Send + 'static) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?;
        f(&oauth_store()).map_err(|e| e.to_string())
    }).await.map_err(|_| "Could not access credential store".to_string())?
}
/// Returns a valid access token, refreshing first when it is expired or inside the skew window.
async fn oauth_access_token() -> std::result::Result<String, String> {
    use crate::oauth_store as o;
    let t = blocking_store(|s| s.load_tokens()).await?.ok_or(ACCOUNT_ERROR)?;
    if t.needs_reauth { return Err(ACCOUNT_ERROR.into()); }
    if !o::needs_refresh(&t, now_ms()) { return Ok(t.access_token); }
    let _refresh = OAUTH_REFRESH_LOCK.lock().await;
    // Re-read: another task may have refreshed while we waited for the lock.
    let t = blocking_store(|s| s.load_tokens()).await?.ok_or(ACCOUNT_ERROR)?;
    if t.needs_reauth { return Err(ACCOUNT_ERROR.into()); }
    if !o::needs_refresh(&t, now_ms()) { return Ok(t.access_token); }
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(30)).build().map_err(|_| "Account refresh unavailable")?;
    let response = client.post(o::OAUTH_TOKEN_URL).header("content-type", "application/x-www-form-urlencoded").body(o::refresh_request_body(&t.client_id, &t.refresh_token)).send().await.map_err(|_| "Account refresh failed. Check your connection.")?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|_| "Account refresh failed")?;
    if !(200..300).contains(&status) {
        if o::classify_refresh_failure(status, &text) == o::RefreshFailure::Permanent { let _ = blocking_store(|s| s.mark_reauth()).await; return Err(ACCOUNT_ERROR.into()); }
        return Err("Account refresh failed. Try again later.".into());
    }
    let fresh = o::apply_refresh(&t, &text, now_ms()).map_err(|_| "Account refresh returned an unexpected response")?;
    let token = fresh.access_token.clone();
    blocking_store(move |s| s.update_tokens(&fresh)).await?;
    Ok(token)
}
/// Background refresh scheduling: sleeps until the next token is due, or until a login/logout wakes it.
pub(crate) async fn oauth_refresh_loop() {
    use crate::oauth_store as o;
    loop {
        let wait = match blocking_store(|s| s.load_tokens()).await {
            Ok(Some(t)) if !t.needs_reauth => {
                let delay = o::refresh_delay_ms(&t, now_ms());
                if delay == 0 { if oauth_access_token().await.is_err() { 5 * 60_000 } else { continue } } else { delay }
            }
            _ => 10 * 60_000,
        };
        tokio::select! { _ = tokio::time::sleep(Duration::from_millis(wait)) => {}, _ = OAUTH_WAKE.notified() => {} }
    }
}
fn account_status_now() -> std::result::Result<crate::oauth_store::Status, String> {
    oauth_store().status(now_ms(), OAUTH_PENDING.load(std::sync::atomic::Ordering::SeqCst)).map_err(|e| e.to_string())
}
#[tauri::command]
async fn agent_account_status(window: WebviewWindow, provider: String) -> std::result::Result<crate::oauth_store::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may inspect credentials")?;
    if provider != "openai" { return Err("Unsupported account provider".into()); }
    tauri::async_runtime::spawn_blocking(|| { let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?; account_status_now() }).await.map_err(|_| "Could not access credential store")?
}
#[tauri::command]
async fn agent_account_disconnect(window: WebviewWindow, provider: String) -> std::result::Result<crate::oauth_store::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may delete credentials")?;
    if provider != "openai" { return Err("Unsupported account provider".into()); }
    let _refresh = OAUTH_REFRESH_LOCK.lock().await; // never race a refresh that would re-save tokens
    OAUTH_PENDING.store(false, std::sync::atomic::Ordering::SeqCst);
    blocking_store(|s| s.disconnect()).await?; OAUTH_WAKE.notify_one();
    tauri::async_runtime::spawn_blocking(|| { let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?; account_status_now() }).await.map_err(|_| "Could not access credential store")?
}
static OAUTH_CANCEL: tokio::sync::Notify = tokio::sync::Notify::const_new();
fn open_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ())
}
/// The whole browser login runs here. The renderer never sees a code, verifier or token.
async fn oauth_login_flow() -> std::result::Result<(), crate::oauth_login::LoginError> {
    use crate::oauth_login as l;
    use crate::oauth_store as o;
    let existing = blocking_store(|s| s.load_tokens()).await.ok().flatten().map(|t| t.client_id);
    let host_id = blocking_store(|s| s.host_id()).await.map_err(|_| l::LoginError::Listener)?;
    let (state, nonce, verifier) = (l::random_token(), l::random_token(), l::random_token());
    let lb = l::Loopback::bind(l::LOOPBACK_PORT).await?;
    let redirect = lb.redirect_uri.clone();
    let url = l::authorize_url(existing.as_deref().unwrap_or(l::BOOTSTRAP_CLIENT_ID), &host_id, &redirect, &state, &nonce, &l::pkce_challenge(&verifier));
    open_browser(&url).map_err(|_| l::LoginError::Listener)?;
    let cb = lb.wait(l::LOGIN_TIMEOUT, &OAUTH_CANCEL).await?;
    let (code, client_id) = l::check_callback(&cb, &state, existing.as_deref())?;
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(30)).build().map_err(|_| l::LoginError::Exchange)?;
    let resp = client.post(o::OAUTH_TOKEN_URL).header("content-type", "application/x-www-form-urlencoded").body(l::exchange_body(&code, &redirect, &client_id, &verifier)).send().await.map_err(|_| l::LoginError::Exchange)?;
    if !resp.status().is_success() { return Err(l::LoginError::Exchange); }
    let text = resp.text().await.map_err(|_| l::LoginError::Exchange)?;
    let jwks = client.get(o::OAUTH_JWKS_URL).send().await.map_err(|_| l::LoginError::IdToken)?;
    if !jwks.status().is_success() { return Err(l::LoginError::IdToken); }
    let jwks = jwks.text().await.map_err(|_| l::LoginError::IdToken)?;
    let tokens = l::tokens_from_exchange(&text, &jwks, &client_id, &nonce, now_ms())?;
    let _refresh = OAUTH_REFRESH_LOCK.lock().await; // a refresh must not race the new token set; held only for the save
    blocking_store(move |s| s.save_tokens(&tokens)).await.map_err(|_| l::LoginError::Response)?;
    Ok(())
}
#[tauri::command]
async fn agent_account_start(window: WebviewWindow, provider: String) -> std::result::Result<crate::oauth_store::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may sign in")?;
    if provider != "openai" { return Err("Unsupported account provider".into()); }
    if OAUTH_PENDING.compare_exchange(false, true, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst).is_err() { return account_status_now(); }
    tauri::async_runtime::spawn(async {
        let _ = oauth_login_flow().await;
        oauth_saved(); // clears pending and wakes the scheduler, also after failure
    });
    account_status_now()
}
#[tauri::command]
async fn agent_account_cancel(window: WebviewWindow, provider: String) -> std::result::Result<crate::oauth_store::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may cancel sign-in")?;
    if provider != "openai" { return Err("Unsupported account provider".into()); }
    OAUTH_CANCEL.notify_waiters();
    account_status_now()
}
#[tauri::command]
async fn agent_account_set_method(window: WebviewWindow, provider: String, method: crate::oauth_store::Method) -> std::result::Result<crate::oauth_store::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may change credentials")?;
    if provider != "openai" { return Err("Unsupported account provider".into()); }
    blocking_store(move |s| s.set_method(method)).await.map_err(|_| "Connect your OpenAI account first".to_string())?;
    tauri::async_runtime::spawn_blocking(|| { let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?; account_status_now() }).await.map_err(|_| "Could not access credential store")?
}
// ---- GitHub account (OAuth device flow): see docs/agent/github-account-login.md ----
// The token lives only in the OS credential store and this process. The renderer sees
// github_account::Status (state, public login/name, user code while pending), never a token or device code.
fn github_store() -> crate::github_account::Store<KeyringBackend> { crate::github_account::Store::new(KeyringBackend) }
/// User code of a login in flight (shown in the UI); None when idle.
static GITHUB_PENDING: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
static GITHUB_CANCEL: tokio::sync::Notify = tokio::sync::Notify::const_new();
fn github_status_now() -> std::result::Result<crate::github_account::Status, String> {
    let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?;
    let pending = GITHUB_PENDING.lock().map_err(|_| "Credential store is busy".to_string())?.clone();
    github_store().status(pending.as_deref()).map_err(|e| e.to_string())
}
fn github_client() -> std::result::Result<reqwest::Client, crate::github_account::LoginError> {
    reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(30)).user_agent("Somnia").build().map_err(|_| crate::github_account::LoginError::Request)
}
async fn github_post(client: &reqwest::Client, url: &str, body: String) -> std::result::Result<String, crate::github_account::LoginError> {
    use crate::github_account::LoginError as E;
    let r = client.post(url).header("accept", "application/json").header("content-type", "application/x-www-form-urlencoded").body(body).send().await.map_err(|_| E::Request)?;
    if !r.status().is_success() { return Err(E::Response); }
    r.text().await.map_err(|_| E::Response)
}
/// The whole login runs here: device code, browser, polling, profile lookup, keyring save.
async fn github_login_flow() -> std::result::Result<(), crate::github_account::LoginError> {
    use crate::github_account as g;
    use g::LoginError as E;
    if g::CLIENT_ID.is_empty() { return Err(E::NotConfigured); }
    let client = github_client()?;
    let dc = g::parse_device_code(&github_post(&client, g::DEVICE_CODE_URL, g::device_code_body()).await?)?;
    *GITHUB_PENDING.lock().map_err(|_| E::Store)? = Some(dc.user_code.clone());
    let _ = open_browser(g::VERIFICATION_URI); // the user can also open the page by hand; the code is shown in the UI
    let deadline = tokio::time::Instant::now() + Duration::from_secs(dc.expires_in);
    let mut interval = dc.interval;
    let (token, scope) = loop {
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(interval)) => {},
            _ = GITHUB_CANCEL.notified() => return Err(E::Cancelled),
        }
        if tokio::time::Instant::now() >= deadline { return Err(E::Expired); }
        match g::parse_poll(&github_post(&client, g::TOKEN_URL, g::poll_body(&dc.device_code)).await?) {
            g::Poll::Token { token, scope } => break (token, scope),
            g::Poll::Pending => {}
            g::Poll::SlowDown(i) => interval = g::slowed(interval, i),
            g::Poll::Expired => return Err(E::Expired),
            g::Poll::Denied => return Err(E::Denied),
            g::Poll::Failed => return Err(E::Response),
        }
    };
    let r = client.get(g::USER_URL).header("accept", "application/vnd.github+json").header("authorization", format!("Bearer {token}")).send().await.map_err(|_| E::Request)?;
    if !r.status().is_success() { return Err(E::Response); }
    let account = g::account_from_user(&token, &scope, &r.text().await.map_err(|_| E::Response)?)?;
    tauri::async_runtime::spawn_blocking(move || { let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| E::Store)?; github_store().save(&account).map_err(|_| E::Store) }).await.map_err(|_| E::Store)?
}
#[tauri::command]
async fn github_account_status(window: WebviewWindow) -> std::result::Result<crate::github_account::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may inspect credentials")?;
    tauri::async_runtime::spawn_blocking(github_status_now).await.map_err(|_| "Could not access credential store")?
}
#[tauri::command]
async fn github_account_start(window: WebviewWindow) -> std::result::Result<crate::github_account::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may sign in")?;
    if crate::github_account::CLIENT_ID.is_empty() { return Err("GitHub sign-in is not configured in this build".into()); }
    let already = { let mut p = GITHUB_PENDING.lock().map_err(|_| "Sign-in is busy".to_string())?; if p.is_some() { true } else { *p = Some(String::new()); false } }; // reserve before the code exists so a double click cannot start two logins
    if already { return tauri::async_runtime::spawn_blocking(github_status_now).await.map_err(|_| "Could not access credential store")?; }
    tauri::async_runtime::spawn(async {
        let _ = github_login_flow().await;
        if let Ok(mut p) = GITHUB_PENDING.lock() { *p = None; }
    });
    tauri::async_runtime::spawn_blocking(github_status_now).await.map_err(|_| "Could not access credential store")?
}
#[tauri::command]
async fn github_account_cancel(window: WebviewWindow) -> std::result::Result<crate::github_account::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may cancel sign-in")?;
    GITHUB_CANCEL.notify_waiters();
    tauri::async_runtime::spawn_blocking(github_status_now).await.map_err(|_| "Could not access credential store")?
}
#[tauri::command]
async fn github_account_disconnect(window: WebviewWindow) -> std::result::Result<crate::github_account::Status, String> {
    gate(&window).map_err(|_| "Only the trusted editor may delete credentials")?;
    GITHUB_CANCEL.notify_waiters();
    tauri::async_runtime::spawn_blocking(|| { { let _g = AGENT_SETTINGS_LOCK.lock().map_err(|_| "Credential store is busy".to_string())?; github_store().disconnect().map_err(|e| e.to_string())?; } github_status_now() }).await.map_err(|_| "Could not access credential store")?
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
        if provider=="openai" && blocking_store(|s|s.method()).await.is_ok_and(|m|m==crate::oauth_store::Method::Account) { oauth_access_token().await? } else {
        let p=provider.clone();tauri::async_runtime::spawn_blocking(move||agent_key_for(&p)?.get_password().map_err(|_| "OS credential store is locked or key is missing".to_string())).await.map_err(|_| "Credential lookup failed")?? }
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
#[derive(Serialize)]
struct McpServerView { config: crate::mcp_host::McpServerConfig, running: bool }
fn mcp_path(window: &WebviewWindow) -> std::result::Result<std::path::PathBuf, String> {
    window.app_handle().path().app_config_dir().map(|d| d.join("mcp-servers.json")).map_err(|_| "App config directory is unavailable".to_string())
}
#[tauri::command]
async fn mcp_servers_list(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>) -> std::result::Result<Vec<McpServerView>, String> {
    gate(&window).map_err(|_| "Only the trusted editor may manage MCP servers")?;
    let path = mcp_path(&window)?;
    let list = tauri::async_runtime::spawn_blocking(move || crate::mcp_host::load_servers(&path)).await.map_err(|_| "Could not read MCP servers")??;
    let running = host.running().await;
    Ok(list.into_iter().map(|c| { let r = running.contains(&c.id); McpServerView { config: c, running: r } }).collect())
}
/// Saving is the user's approval to run this exact executable and argument list.
#[tauri::command]
async fn mcp_server_save(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>, config: crate::mcp_host::McpServerConfig) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may manage MCP servers")?;
    let path = mcp_path(&window)?;
    let id = config.id.clone();
    tauri::async_runtime::spawn_blocking(move || { let mut l = crate::mcp_host::load_servers(&path)?; crate::mcp_host::upsert_server(&mut l, config)?; crate::mcp_host::save_servers(&path, &l) }).await.map_err(|_| "Could not save MCP server")??;
    host.stop(&id).await; // changed config never keeps a running old process
    Ok(())
}
#[tauri::command]
async fn mcp_server_remove(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>, id: String) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may manage MCP servers")?;
    let path = mcp_path(&window)?;
    let id2 = id.clone();
    tauri::async_runtime::spawn_blocking(move || { let mut l = crate::mcp_host::load_servers(&path)?; l.retain(|c| c.id != id2); crate::mcp_host::save_servers(&path, &l) }).await.map_err(|_| "Could not remove MCP server")??;
    host.stop(&id).await;
    Ok(())
}
#[tauri::command]
async fn mcp_server_start(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>, id: String) -> std::result::Result<Vec<crate::mcp_host::McpToolInfo>, String> {
    gate(&window).map_err(|_| "Only the trusted editor may manage MCP servers")?;
    let path = mcp_path(&window)?;
    let list = tauri::async_runtime::spawn_blocking(move || crate::mcp_host::load_servers(&path)).await.map_err(|_| "Could not read MCP servers")??;
    let cfg = list.into_iter().find(|c| c.id == id).ok_or("Unknown MCP server")?;
    host.start(&cfg).await?;
    host.tools(&id).await
}
#[tauri::command]
async fn mcp_server_stop(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>, id: String) -> std::result::Result<(), String> {
    gate(&window).map_err(|_| "Only the trusted editor may manage MCP servers")?;
    host.stop(&id).await;
    Ok(())
}
#[tauri::command]
async fn mcp_tool_call(window: WebviewWindow, host: State<'_, crate::mcp_host::McpHost>, server: String, tool: String, arguments: serde_json::Map<String, serde_json::Value>) -> std::result::Result<String, String> {
    gate(&window).map_err(|_| "Only the trusted editor may call MCP tools")?;
    host.call(&server, &tool, arguments).await
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
const MEDIA_EXTENSIONS: [&str; 19] = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "ico", "tga", "tif", "tiff", "qoi", "ppm", "pnm", "pdf", "psd", "docx", "xlsx", "pptx"];
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
/// The sync folder path is stored host-side only, written from a native folder dialog result, never from renderer input.
fn sync_pointer(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("sync-v1")
        .join("folder.txt"))
}
fn sync_load<'a>(backend: &'a mut Backend, pointer: &std::path::Path) -> Result<Option<&'a SyncFolder>> {
    if backend.sync.is_none() {
        if let Ok(text) = std::fs::read_to_string(pointer) {
            let path = std::path::PathBuf::from(text.trim());
            if !text.trim().is_empty() {
                backend.sync = SyncFolder::open(&path).ok();
            }
        }
    }
    Ok(backend.sync.as_ref())
}
#[tauri::command]
async fn sync_status(window: WebviewWindow, state: State<'_, Shared>) -> Result<Option<String>> {
    gate(&window)?;
    let pointer = sync_pointer(window.app_handle())?;
    work(state.inner().clone(), move |b| Ok(sync_load(b, &pointer)?.map(|f| f.name().to_string()))).await
}
#[tauri::command]
async fn sync_choose(window: WebviewWindow, state: State<'_, Shared>) -> Result<Option<String>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let selected = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    let pointer = sync_pointer(window.app_handle())?;
    work(state.inner().clone(), move |b| {
        let folder = SyncFolder::open(&path)?;
        let canonical = path.canonicalize()?;
        if let Some(dir) = pointer.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(&pointer, canonical.to_string_lossy().as_bytes())?;
        let name = folder.name().to_string();
        b.sync = Some(folder);
        Ok(Some(name))
    })
    .await
}
#[tauri::command]
async fn sync_read(window: WebviewWindow, state: State<'_, Shared>) -> Result<Option<SyncRead>> {
    gate(&window)?;
    let pointer = sync_pointer(window.app_handle())?;
    work(state.inner().clone(), move |b| match sync_load(b, &pointer)? {
        Some(f) => f.read(),
        None => Err(AppError::Denied("No sync folder selected".into())),
    })
    .await
}
#[tauri::command]
async fn sync_write(window: WebviewWindow, state: State<'_, Shared>, content: String) -> Result<()> {
    gate(&window)?;
    let pointer = sync_pointer(window.app_handle())?;
    work(state.inner().clone(), move |b| match sync_load(b, &pointer)? {
        Some(f) => f.write(&content),
        None => Err(AppError::Denied("No sync folder selected".into())),
    })
    .await
}
#[tauri::command]
async fn sync_clear(window: WebviewWindow, state: State<'_, Shared>) -> Result<()> {
    gate(&window)?;
    let pointer = sync_pointer(window.app_handle())?;
    work(state.inner().clone(), move |b| {
        b.sync = None;
        match std::fs::remove_file(&pointer) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    })
    .await
}
#[tauri::command]
async fn read_project_settings(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
) -> Result<Option<String>> {
    gate(&window)?;
    work(state.inner().clone(), move |b| project(b, &project_id)?.read_project_settings()).await
}
#[tauri::command]
async fn write_project_settings(
    window: WebviewWindow,
    state: State<'_, Shared>,
    project_id: String,
    content: String,
) -> Result<()> {
    gate(&window)?;
    work(state.inner().clone(), move |b| project(b, &project_id)?.write_project_settings(&content)).await
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
    /// Path of the last picked image, kept for save mode "overwrite". Never sent to the renderer.
    origin: Mutex<Option<(String, std::path::PathBuf)>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageGrantReply {
    token: String,
    name: String,
    size: u64,
    origin_token: Option<String>,
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
    let origin_token = uuid::Uuid::new_v4().to_string();
    *grants.origin.lock().map_err(|e| AppError::Io(e.to_string()))? = Some((origin_token.clone(), path.clone()));
    let grant = crate::image_io::ImageGrant::new(path);
    let token = grant.token().to_owned();
    *grants.read.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(Some(ImageGrantReply { token, name, size, origin_token: Some(origin_token) }))
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
    Ok(Some(ImageGrantReply { token, name, size: 0, origin_token: None }))
}
/// Save mode "overwrite": a one-time save grant for the file that image_pick opened, only when the export keeps its format.
/// The write itself still goes through image_save_write (atomic, once). Nothing is written here.
#[tauri::command]
async fn image_overwrite_prepare(window: WebviewWindow, grants: State<'_, ImageGrants>, origin_token: String, extension: String) -> Result<ImageGrantReply> {
    gate(&window)?;
    let path = {
        let slot = grants.origin.lock().map_err(|e| AppError::Io(e.to_string()))?;
        match slot.as_ref() {
            Some((t, p)) if *t == origin_token => p.clone(),
            _ => return Err(AppError::Denied("Original file is no longer available. Save as a copy.".into())),
        }
    };
    if !crate::image_io::same_image_format(&path, &extension) {
        return Err(AppError::Denied("format-differs".into()));
    }
    if !path.is_file() {
        return Err(AppError::Denied("Original file is no longer available. Save as a copy.".into()));
    }
    let name = image_name(&path);
    let grant = crate::image_io::ImageGrant::new(path);
    let token = grant.token().to_owned();
    *grants.save.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(ImageGrantReply { token, name, size: 0, origin_token: None })
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
#[derive(Default)]
struct PdfGrants { save: Mutex<Option<crate::pdf_io::PdfGrant>> }
/// OS save dialog. Choosing an existing file makes the OS ask about overwriting. Nothing is written yet.
#[tauri::command]
async fn pdf_save_pick(window: WebviewWindow, grants: State<'_, PdfGrants>, suggested_name: String) -> Result<Option<ImageGrantReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let suggested: String = suggested_name.chars().filter(|c| !matches!(c, '/' | '\\' | '\0')).take(120).collect();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("PDF", &crate::pdf_io::PDF_EXTENSIONS).set_file_name(suggested).blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else { return Ok(None) };
    let path = selected.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    if !crate::pdf_io::has_pdf_extension(&path) {
        return Err(AppError::Denied("Save as PDF".into()));
    }
    let name = image_name(&path);
    let grant = crate::pdf_io::PdfGrant::new(path);
    let token = grant.token().to_owned();
    *grants.save.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(Some(ImageGrantReply { token, name, size: 0, origin_token: None }))
}
/// Raw request body = file bytes, header x-somnia-token = token from pdf_save_pick. Written atomically, once.
#[tauri::command]
async fn pdf_save_write(window: WebviewWindow, grants: State<'_, PdfGrants>, request: tauri::ipc::Request<'_>) -> Result<()> {
    gate(&window)?;
    let token = request
        .headers()
        .get("x-somnia-token")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| AppError::Denied("Missing save token".into()))?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err(AppError::Invalid("Expected raw PDF bytes".into())),
    };
    let path = {
        let mut slot = grants.save.lock().map_err(|e| AppError::Io(e.to_string()))?;
        crate::pdf_io::PdfGrant::consume(&mut slot, &token)?
    };
    tauri::async_runtime::spawn_blocking(move || crate::pdf_io::save_pdf_atomic(&path, &bytes))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}
#[derive(Default)]
struct SlidesGrants { save: Mutex<Option<crate::slides_io::SlidesGrant>> }
/// OS save dialog. Copy-only: selecting an existing target is rejected at write. Nothing is written yet.
#[tauri::command]
async fn slides_save_pick(window: WebviewWindow, grants: State<'_, SlidesGrants>, suggested_name: String) -> Result<Option<ImageGrantReply>> {
    gate(&window)?;
    let app = window.app_handle().clone();
    let suggested: String = suggested_name.chars().filter(|c| !matches!(c, '/' | '\\' | '\0')).take(120).collect();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("PPTX", &crate::slides_io::SLIDES_EXTENSIONS).set_file_name(suggested).blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?;
    let Some(selected) = selected else { return Ok(None) };
    let path = selected.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    if !crate::slides_io::has_slides_extension(&path) {
        return Err(AppError::Denied("Save as PPTX".into()));
    }
    let name = image_name(&path);
    let grant = crate::slides_io::SlidesGrant::new(path);
    let token = grant.token().to_owned();
    *grants.save.lock().map_err(|e| AppError::Io(e.to_string()))? = Some(grant);
    Ok(Some(ImageGrantReply { token, name, size: 0, origin_token: None }))
}
/// Raw request body = file bytes, header x-somnia-token = token from slides_save_pick. Written atomically, once.
#[tauri::command]
async fn slides_save_write(window: WebviewWindow, grants: State<'_, SlidesGrants>, request: tauri::ipc::Request<'_>) -> Result<()> {
    gate(&window)?;
    let token = request
        .headers()
        .get("x-somnia-token")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| AppError::Denied("Missing save token".into()))?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err(AppError::Invalid("Expected raw PPTX bytes".into())),
    };
    let path = {
        let mut slot = grants.save.lock().map_err(|e| AppError::Io(e.to_string()))?;
        crate::slides_io::SlidesGrant::consume(&mut slot, &token)?
    };
    tauri::async_runtime::spawn_blocking(move || crate::slides_io::save_slides_copy(&path, &bytes))
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
async fn recovery_history_list(window: WebviewWindow, state: State<'_, Shared>, project_id: String) -> Result<Vec<RecoveryHistoryEntry>> {
    gate(&window)?;
    work(state.inner().clone(), move |b| project(b, &project_id)?.recovery_history_list()).await
}
#[tauri::command]
async fn recovery_restore_safe(window: WebviewWindow, state: State<'_, Shared>, project_id: String,
    id: String, path: String, client_revision: u64, expected_revision: Revision) -> Result<RecoverySafeRestore> {
    gate(&window)?;
    let result = work(state.inner().clone(), move |b|
        project(b, &project_id)?.recovery_restore_safe(&id, &path, client_revision, &expected_revision)).await?;
    emit(&window, &result.event);
    Ok(result)
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

// ---- Git backend (contract: docs/git/CONTRACT.md; logic in crate::git) ----
fn git_trust_path(window: &WebviewWindow) -> std::result::Result<PathBuf, String> {
    window
        .app_handle()
        .path()
        .app_config_dir()
        .map(|d| d.join("git-trusted-repos.json"))
        .map_err(|_| "App config directory is unavailable".to_string())
}
fn git_project_root(backend: &Backend) -> std::result::Result<PathBuf, String> {
    match backend.projects.len() {
        1 => Ok(backend
            .projects
            .values()
            .next()
            .map(|p| p.root_path().to_path_buf())
            .expect("one project present")),
        0 => Err(crate::git::GitError::new(
            crate::git::GitErrorCode::NotARepo,
            "Open a project folder first",
        )
        .to_json()),
        _ => Err(crate::git::GitError::new(
            crate::git::GitErrorCode::Unknown,
            "Git works with exactly one open project",
        )
        .to_json()),
    }
}
fn git_gate(window: &WebviewWindow) -> std::result::Result<(), String> {
    gate(window).map_err(|_| {
        crate::git::GitError::new(
            crate::git::GitErrorCode::Unknown,
            "Only the trusted editor window may use Git",
        )
        .to_json()
    })
}
async fn git_work<T: Send + 'static>(
    state: Shared,
    f: impl FnOnce(&mut Backend) -> std::result::Result<T, String> + Send + 'static,
) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut backend = state.lock().map_err(|e| e.to_string())?;
        f(&mut backend)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn git_store(window: &WebviewWindow) -> std::result::Result<crate::git::TrustStore, String> {
    crate::git::TrustStore::load(&git_trust_path(window)?).map_err(|e| e.to_json())
}
#[tauri::command]
async fn git_detect(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<crate::git::GitRepoState, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        Ok(crate::git::detect(&root, Some(&store)))
    })
    .await
}
#[tauri::command]
async fn git_status(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<crate::git::GitStatus, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::status(&root).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_diff_file(
    window: WebviewWindow,
    state: State<'_, Shared>,
    path: String,
    base: crate::git::DiffBase,
    target: crate::git::DiffTarget,
) -> std::result::Result<crate::git::GitFileDiff, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::diff_file(&root, &path, base, target).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_init(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<crate::git::GitRepoState, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::init(&root, Some(&store)).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_commit(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::GitCommitRequest,
) -> std::result::Result<crate::git::GitVersion, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::commit(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_log(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::GitLogRequest,
) -> std::result::Result<Vec<crate::git::GitVersion>, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::log(&root, &request).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_restore_as_new_version(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::GitRestoreRequest,
) -> std::result::Result<crate::git::GitRestoreResult, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::restore_as_new_version(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_trust_repo(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<crate::git::GitRepoState, String> {
    git_gate(&window)?;
    let mut store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::trust_repo(&root, &mut store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_variant_list(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<Vec<crate::git::variants::GitVariant>, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::variant_list(&root).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_variant_create(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitVariantCreateRequest,
) -> std::result::Result<crate::git::variants::GitVariant, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::variant_create(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_variant_open(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitVariantOpenRequest,
) -> std::result::Result<crate::git::GitRepoState, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::variant_open(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_variant_rename(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitVariantRenameRequest,
) -> std::result::Result<crate::git::variants::GitVariant, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::variant_rename(&root, &request).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_variant_delete(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitVariantDeleteRequest,
) -> std::result::Result<crate::git::variants::GitVariantDeleteResult, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::variant_delete(&root, &request).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_preview(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitCombinePreviewRequest,
) -> std::result::Result<crate::git::variants::GitCombinePreview, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_preview(&root, &request).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_start(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitCombineStartRequest,
) -> std::result::Result<crate::git::variants::GitCombineSession, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_start(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_status(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<Option<crate::git::variants::GitCombineSession>, String> {
    git_gate(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_status(&root).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_resolve(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitCombineResolveRequest,
) -> std::result::Result<crate::git::variants::GitCombineSession, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_resolve(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_finish(
    window: WebviewWindow,
    state: State<'_, Shared>,
    request: crate::git::variants::GitCombineFinishRequest,
) -> std::result::Result<crate::git::GitVersion, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_finish(&root, &request, &store).map_err(|e| e.to_json())
    })
    .await
}
#[tauri::command]
async fn git_combine_abort(
    window: WebviewWindow,
    state: State<'_, Shared>,
) -> std::result::Result<crate::git::GitRepoState, String> {
    git_gate(&window)?;
    let store = git_store(&window)?;
    git_work(state.inner().clone(), move |b| {
        let root = git_project_root(b)?;
        crate::git::variants::combine_abort(&root, Some(&store)).map_err(|e| e.to_json())
    })
    .await
}

pub fn run() {
    let shared = Shared::default();
    tauri::Builder::default()
        .manage(ProviderNetwork::default())
        .manage(crate::mcp_host::McpHost::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared.clone())
        .manage(ImageGrants::default())
        .manage(PdfGrants::default()).manage(SlidesGrants::default())
        .manage(crate::lan_host::LanHost::default())
        .setup(move |app| {
            tauri::async_runtime::spawn(oauth_refresh_loop());
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
            agent_account_status,
            mcp_servers_list,
            mcp_server_save,
            mcp_server_remove,
            mcp_server_start,
            mcp_server_stop,
            mcp_tool_call,
            agent_account_disconnect,
            agent_account_set_method,
            agent_account_start,
            agent_account_cancel,
            github_account_status,
            read_project_settings,
            sync_status,
            sync_choose,
            sync_read,
            sync_write,
            sync_clear,
            write_project_settings,
            github_account_start,
            github_account_cancel,
            github_account_disconnect,
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
            pdf_save_pick,
            pdf_save_write,
            slides_save_pick,
            slides_save_write,
            image_save_pick,
            image_save_write,
            image_overwrite_prepare,
            hold_autosave,
            stage_edit,
            save_file,
            delete_file,
            open_external,
            recovery_list,
            recovery_read,
            recovery_restore,
            recovery_discard,
            recovery_history_list,
            recovery_restore_safe,
            close_project,
            log_write,
            log_tail,
            log_dir,
            git_detect,
            git_status,
            git_diff_file,
            git_init,
            git_commit,
            git_log,
            git_restore_as_new_version,
            git_trust_repo,
            git_variant_list,
            git_variant_create,
            git_variant_open,
            git_variant_rename,
            git_variant_delete,
            git_combine_preview,
            git_combine_start,
            git_combine_status,
            git_combine_resolve,
            git_combine_finish,
            git_combine_abort
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
