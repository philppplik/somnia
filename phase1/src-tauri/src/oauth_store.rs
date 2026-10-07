//! OAuth account tokens for the Somnia Agent (OpenAI ChatGPT-account login).
//!
//! Pure logic, no Tauri/keyring types, so it is unit-testable everywhere. The OS
//! credential store is reached through [`SecretBackend`]; `desktop.rs` provides the
//! keyring implementation. Tokens never cross into the renderer: the UI only ever
//! sees [`Status`] (state, method, expiry), never a token, account id or e-mail.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::sync::Mutex;

/// Keyring slot names (service is `de.philipp-paulik.somnia.agent`). The API-key slot
/// `openai` is untouched, so key and account coexist.
pub const TOKEN_SLOT: &str = "openai-oauth";
pub const METHOD_SLOT: &str = "openai-auth-method";
/// Stable per-installation `ext_agent_host_id` (urn:uuid). Created before the first login and kept across logout.
pub const HOST_SLOT: &str = "openai-oauth-host";
/// Refresh this long before the access token expires.
pub const REFRESH_SKEW_MS: u64 = 5 * 60 * 1000;
/// Never schedule a background refresh sooner than this (prevents tight loops).
pub const MIN_REFRESH_DELAY_MS: u64 = 30 * 1000;
/// Fallback lifetime when the access token carries no readable `exp`.
pub const DEFAULT_LIFETIME_MS: u64 = 60 * 60 * 1000;
/// Official sign-in-with-ChatGPT endpoints. No first-party client id is used: the per-account
/// `client_id` (issued by dynamic client registration, `oaiapp_...`) is stored in [`Tokens`].
pub const OAUTH_TOKEN_URL: &str = "https://auth.openai.com/api/accounts/oauth/token";
pub const OAUTH_ISSUER: &str = "https://auth.openai.com";
pub const OAUTH_JWKS_URL: &str = "https://auth.openai.com/.well-known/jwks.json";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError { Backend, Corrupt, Invalid }
impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Generic on purpose: nothing here may reach the UI verbatim.
        f.write_str(match self { Self::Backend => "OS credential store is locked or unavailable", Self::Corrupt => "Stored account credentials are unreadable", Self::Invalid => "Invalid account credentials" })
    }
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Client id issued to this installation/account at registration; required for refresh.
    pub client_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    /// Unix ms.
    pub expires_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// Set after a permanent refresh failure (invalid_grant / expired / revoked): re-login needed.
    #[serde(default)]
    pub needs_reauth: bool,
}
impl fmt::Debug for Tokens {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Tokens").field("expires_at_ms", &self.expires_at_ms).field("needs_reauth", &self.needs_reauth).finish_non_exhaustive()
    }
}
impl Tokens {
    pub fn validate(&self) -> Result<(), StoreError> {
        let bad = |s: &str, max: usize| s.is_empty() || s.len() > max || s.chars().any(|c| c.is_control() || c.is_whitespace());
        if bad(&self.access_token, 16384) || bad(&self.refresh_token, 8192) || bad(&self.client_id, 256) { return Err(StoreError::Invalid); }
        if self.id_token.as_deref().is_some_and(|t| bad(t, 16384)) || self.account_id.as_deref().is_some_and(|t| bad(t, 256)) { return Err(StoreError::Invalid); }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Method { Account, ApiKey }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State { Disconnected, Pending, Connected, Expired }
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub provider: &'static str,
    pub state: State,
    pub method: Method,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

pub trait SecretBackend: Send + Sync {
    fn get(&self, slot: &str) -> Result<Option<String>, StoreError>;
    fn set(&self, slot: &str, value: &str) -> Result<(), StoreError>;
    /// Deleting a missing slot is success.
    fn delete(&self, slot: &str) -> Result<(), StoreError>;
}

/// In-memory backend for tests and non-desktop builds.
#[derive(Default)]
pub struct MemoryBackend(Mutex<BTreeMap<String, String>>);
impl SecretBackend for MemoryBackend {
    fn get(&self, slot: &str) -> Result<Option<String>, StoreError> { Ok(self.0.lock().map_err(|_| StoreError::Backend)?.get(slot).cloned()) }
    fn set(&self, slot: &str, value: &str) -> Result<(), StoreError> { self.0.lock().map_err(|_| StoreError::Backend)?.insert(slot.into(), value.into()); Ok(()) }
    fn delete(&self, slot: &str) -> Result<(), StoreError> { self.0.lock().map_err(|_| StoreError::Backend)?.remove(slot); Ok(()) }
}

pub struct Store<B: SecretBackend> { backend: B }
impl<B: SecretBackend> Store<B> {
    pub fn new(backend: B) -> Self { Self { backend } }

    pub fn load_tokens(&self) -> Result<Option<Tokens>, StoreError> {
        match self.backend.get(TOKEN_SLOT)? {
            None => Ok(None),
            Some(raw) => {
                let t: Tokens = serde_json::from_str(&raw).map_err(|_| StoreError::Corrupt)?;
                t.validate().map_err(|_| StoreError::Corrupt)?;
                Ok(Some(t))
            }
        }
    }
    /// Called by the login flow after a successful exchange. A fresh login is an explicit
    /// user action, so it also selects the account method. Never called from the renderer.
    pub fn save_tokens(&self, tokens: &Tokens) -> Result<(), StoreError> {
        tokens.validate()?;
        self.backend.set(TOKEN_SLOT, &serde_json::to_string(tokens).map_err(|_| StoreError::Invalid)?)?;
        self.backend.set(METHOD_SLOT, "account")
    }
    /// Refresh result: replace tokens but keep the user's chosen method untouched.
    pub fn update_tokens(&self, tokens: &Tokens) -> Result<(), StoreError> {
        tokens.validate()?;
        self.backend.set(TOKEN_SLOT, &serde_json::to_string(tokens).map_err(|_| StoreError::Invalid)?)
    }
    /// Logout. Deletes OAuth only; the API key slot stays. Without tokens the account
    /// method cannot work, so the method falls back to the API key (reported in status).
    pub fn disconnect(&self) -> Result<(), StoreError> {
        self.backend.delete(TOKEN_SLOT)?;
        if self.method()? == Method::Account { self.backend.set(METHOD_SLOT, "api-key")?; }
        Ok(())
    }
    /// Returns the persisted host id, creating and storing it first when absent.
    pub fn host_id(&self) -> Result<String, StoreError> {
        if let Some(h) = self.backend.get(HOST_SLOT)? { if h.starts_with("urn:uuid:") && h.len() < 64 { return Ok(h); } }
        let h = format!("urn:uuid:{}", uuid::Uuid::new_v4());
        self.backend.set(HOST_SLOT, &h)?; Ok(h)
    }
    pub fn method(&self) -> Result<Method, StoreError> {
        Ok(match self.backend.get(METHOD_SLOT)?.as_deref() { Some("account") => Method::Account, _ => Method::ApiKey })
    }
    /// Explicit switch only. `Account` needs stored, non-reauth tokens; never switches silently.
    pub fn set_method(&self, method: Method) -> Result<(), StoreError> {
        if method == Method::Account && self.load_tokens()?.is_none_or(|t| t.needs_reauth) { return Err(StoreError::Invalid); }
        self.backend.set(METHOD_SLOT, if method == Method::Account { "account" } else { "api-key" })
    }
    pub fn status(&self, _now_ms: u64, pending: bool) -> Result<Status, StoreError> {
        let method = self.method()?;
        let tokens = self.load_tokens()?;
        let (state, expires_at) = match &tokens {
            None => (if pending { State::Pending } else { State::Disconnected }, None),
            Some(t) if t.needs_reauth => (State::Expired, Some(t.expires_at_ms)),
            Some(t) => (State::Connected, Some(t.expires_at_ms)),
        };
        Ok(Status { provider: "openai", state, method, expires_at })
    }
    pub fn mark_reauth(&self) -> Result<(), StoreError> {
        if let Some(mut t) = self.load_tokens()? { t.needs_reauth = true; self.update_tokens(&t)?; }
        Ok(())
    }
}

/// True when the access token is expired or inside the skew window.
pub fn needs_refresh(t: &Tokens, now_ms: u64) -> bool { !t.needs_reauth && now_ms.saturating_add(REFRESH_SKEW_MS) >= t.expires_at_ms }
/// Milliseconds until the next background refresh should run (0 = now, bounded below by
/// MIN_REFRESH_DELAY_MS only when the token is not yet due).
pub fn refresh_delay_ms(t: &Tokens, now_ms: u64) -> u64 {
    if needs_refresh(t, now_ms) { return 0; }
    (t.expires_at_ms - REFRESH_SKEW_MS - now_ms).max(MIN_REFRESH_DELAY_MS)
}
/// Form body (application/x-www-form-urlencoded) for the refresh grant.
pub fn refresh_request_body(client_id: &str, refresh_token: &str) -> String {
    format!("grant_type=refresh_token&client_id={}&refresh_token={}", form_encode(client_id), form_encode(refresh_token))
}
fn form_encode(v: &str) -> String {
    v.bytes().map(|b| if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
/// Fail-closed issuer check for any id/access token we accept: `iss` must equal the issuer exactly.
pub fn issuer_ok(jwt: &str) -> bool {
    let Some(p) = jwt.split('.').nth(1).and_then(b64url_decode) else { return false };
    serde_json::from_slice::<serde_json::Value>(&p).ok().and_then(|v| v.get("iss").and_then(|i| i.as_str()).map(|i| i == OAUTH_ISSUER)).unwrap_or(false)
}
#[derive(Debug, PartialEq, Eq)]
pub enum RefreshFailure { Permanent, Transient }
/// HTTP status/error code -> failure kind. 400/401 with invalid_grant-style codes are permanent.
pub fn classify_refresh_failure(status: u16, body: &str) -> RefreshFailure {
    let code = serde_json::from_str::<serde_json::Value>(body).ok().and_then(|v| {
        let e = v.get("error")?;
        e.as_str().map(str::to_owned).or_else(|| e.get("code").and_then(|c| c.as_str()).map(str::to_owned))
    }).unwrap_or_default().to_ascii_lowercase();
    let permanent_code = matches!(code.as_str(), "invalid_grant" | "refresh_token_expired" | "refresh_token_reused" | "refresh_token_invalidated");
    if permanent_code || status == 401 { RefreshFailure::Permanent } else { RefreshFailure::Transient }
}
/// Merge a refresh response into the stored tokens. Absent refresh/id tokens keep old values
/// (refresh tokens may or may not rotate).
pub fn apply_refresh(old: &Tokens, response_json: &str, now_ms: u64) -> Result<Tokens, StoreError> {
    let v: serde_json::Value = serde_json::from_str(response_json).map_err(|_| StoreError::Invalid)?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(str::to_owned);
    let access = s("access_token").ok_or(StoreError::Invalid)?;
    let expires_at_ms = match v.get("expires_in").and_then(|x| x.as_u64()) {
        Some(secs) => now_ms + secs * 1000,
        None => jwt_exp_ms(&access).filter(|e| *e > now_ms).unwrap_or(now_ms + DEFAULT_LIFETIME_MS),
    };
    if s("id_token").is_some_and(|i| !issuer_ok(&i)) { return Err(StoreError::Invalid); } // fail closed
    let t = Tokens { access_token: access, refresh_token: s("refresh_token").unwrap_or_else(|| old.refresh_token.clone()), id_token: s("id_token").or_else(|| old.id_token.clone()), expires_at_ms, client_id: old.client_id.clone(), account_id: old.account_id.clone(), needs_reauth: false };
    t.validate()?;
    Ok(t)
}
/// `exp` claim (seconds) of a JWT in ms. No signature check: used only to schedule refreshes.
pub fn jwt_exp_ms(jwt: &str) -> Option<u64> {
    let payload = jwt.split('.').nth(1)?;
    let bytes = b64url_decode(payload)?;
    serde_json::from_slice::<serde_json::Value>(&bytes).ok()?.get("exp")?.as_u64().map(|s| s * 1000)
}
fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    let (mut out, mut buf, mut bits) = (Vec::new(), 0u32, 0u32);
    for c in s.trim_end_matches('=').bytes() {
        let v = match c { b'A'..=b'Z' => c - b'A', b'a'..=b'z' => c - b'a' + 26, b'0'..=b'9' => c - b'0' + 52, b'-' | b'+' => 62, b'_' | b'/' => 63, _ => return None } as u32;
        buf = (buf << 6) | v; bits += 6;
        if bits >= 8 { bits -= 8; out.push((buf >> bits) as u8); buf &= (1 << bits) - 1; }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tok(exp: u64) -> Tokens { Tokens { access_token: "acc".into(), refresh_token: "ref".into(), client_id: "oaiapp_test".into(), id_token: None, expires_at_ms: exp, account_id: Some("acct".into()), needs_reauth: false } }
    fn store() -> Store<MemoryBackend> { Store::new(MemoryBackend::default()) }
    #[test] fn roundtrip_and_default_method() {
        let s = store();
        assert_eq!(s.status(0, false).unwrap().state, State::Disconnected);
        assert_eq!(s.method().unwrap(), Method::ApiKey);
        s.save_tokens(&tok(10_000)).unwrap();
        assert_eq!(s.load_tokens().unwrap().unwrap(), tok(10_000));
        let st = s.status(0, false).unwrap();
        assert_eq!((st.state, st.method, st.expires_at), (State::Connected, Method::Account, Some(10_000)));
    }
    #[test] fn status_never_serializes_secrets() {
        let s = store(); s.save_tokens(&tok(5)).unwrap();
        let j = serde_json::to_string(&s.status(0, false).unwrap()).unwrap();
        assert_eq!(j, r#"{"provider":"openai","state":"connected","method":"account","expiresAt":5}"#);
        assert!(!format!("{:?}", tok(1)).contains("acc"));
    }
    #[test] fn pending_only_without_tokens() {
        let s = store();
        assert_eq!(s.status(0, true).unwrap().state, State::Pending);
        s.save_tokens(&tok(1)).unwrap();
        assert_eq!(s.status(0, true).unwrap().state, State::Connected);
    }
    #[test] fn disconnect_keeps_api_key_and_falls_back() {
        let s = store(); s.backend.set("openai", "sk-test").unwrap(); s.save_tokens(&tok(1)).unwrap();
        s.disconnect().unwrap();
        assert_eq!(s.backend.get("openai").unwrap().as_deref(), Some("sk-test"));
        assert!(s.load_tokens().unwrap().is_none());
        assert_eq!(s.method().unwrap(), Method::ApiKey);
        s.disconnect().unwrap(); // idempotent
    }
    #[test] fn method_switch_is_explicit_and_guarded() {
        let s = store();
        assert_eq!(s.set_method(Method::Account), Err(StoreError::Invalid));
        s.save_tokens(&tok(1)).unwrap();
        s.set_method(Method::ApiKey).unwrap();
        assert_eq!(s.method().unwrap(), Method::ApiKey);
        assert!(s.load_tokens().unwrap().is_some(), "switching away keeps tokens");
        s.set_method(Method::Account).unwrap();
        s.update_tokens(&tok(2)).unwrap(); s.set_method(Method::ApiKey).unwrap();
        s.update_tokens(&tok(3)).unwrap(); // refresh must not flip the method
        assert_eq!(s.method().unwrap(), Method::ApiKey);
    }
    #[test] fn reauth_state() {
        let s = store(); s.save_tokens(&tok(100)).unwrap(); s.mark_reauth().unwrap();
        assert_eq!(s.status(0, false).unwrap().state, State::Expired);
        assert_eq!(s.set_method(Method::Account), Err(StoreError::Invalid));
    }
    #[test] fn corrupt_and_invalid_rejected() {
        let s = store(); s.backend.set(TOKEN_SLOT, "{nope").unwrap();
        assert_eq!(s.load_tokens(), Err(StoreError::Corrupt));
        let mut t = tok(1); t.access_token = "a b".into();
        assert_eq!(store().save_tokens(&t), Err(StoreError::Invalid));
    }
    #[test] fn refresh_timing() {
        let t = tok(1_000_000);
        assert!(!needs_refresh(&t, 1_000_000 - REFRESH_SKEW_MS - 1));
        assert!(needs_refresh(&t, 1_000_000 - REFRESH_SKEW_MS));
        assert_eq!(refresh_delay_ms(&t, 2_000_000), 0);
        assert_eq!(refresh_delay_ms(&t, 1_000_000 - REFRESH_SKEW_MS - 1), MIN_REFRESH_DELAY_MS);
        assert_eq!(refresh_delay_ms(&t, 0), 1_000_000 - REFRESH_SKEW_MS);
        let mut r = tok(1); r.needs_reauth = true; assert!(!needs_refresh(&r, 99));
    }
    #[test] fn refresh_merge() {
        let old = tok(1);
        let t = apply_refresh(&old, r#"{"access_token":"n","expires_in":3600}"#, 1000).unwrap();
        assert_eq!((t.access_token.as_str(), t.refresh_token.as_str(), t.expires_at_ms), ("n", "ref", 3_601_000));
        let id = "e30.eyJpc3MiOiJodHRwczovL2F1dGgub3BlbmFpLmNvbSJ9.x";
        let t = apply_refresh(&old, &format!(r#"{{"access_token":"n","refresh_token":"r2","id_token":"{id}"}}"#), 1000).unwrap();
        assert_eq!((t.refresh_token.as_str(), t.id_token.as_deref(), t.expires_at_ms), ("r2", Some(id), 1000 + DEFAULT_LIFETIME_MS));
        assert!(apply_refresh(&old, r#"{"access_token":"n","id_token":"e30.e30.x"}"#, 0).is_err(), "foreign issuer rejected");
        assert!(apply_refresh(&old, r#"{"refresh_token":"x"}"#, 0).is_err());
        assert!(apply_refresh(&old, "garbage", 0).is_err());
    }
    #[test] fn jwt_exp_parse() {
        // header.{"exp":1700000000}.sig
        assert_eq!(jwt_exp_ms("e30.eyJleHAiOjE3MDAwMDAwMDB9.x"), Some(1_700_000_000_000));
        assert_eq!(jwt_exp_ms("nodots"), None);
        let t = apply_refresh(&tok(1), r#"{"access_token":"e30.eyJleHAiOjE3MDAwMDAwMDB9.x"}"#, 1000).unwrap();
        assert_eq!(t.expires_at_ms, 1_700_000_000_000);
    }
    #[test] fn failure_classification() {
        assert_eq!(classify_refresh_failure(400, r#"{"error":"invalid_grant"}"#), RefreshFailure::Permanent);
        assert_eq!(classify_refresh_failure(401, ""), RefreshFailure::Permanent);
        assert_eq!(classify_refresh_failure(400, r#"{"error":{"code":"refresh_token_expired"}}"#), RefreshFailure::Permanent);
        assert_eq!(classify_refresh_failure(503, "x"), RefreshFailure::Transient);
        assert_eq!(classify_refresh_failure(429, r#"{"error":"rate_limited"}"#), RefreshFailure::Transient);
    }
    #[test] fn refresh_body_is_form_encoded() {
        assert_eq!(refresh_request_body("oaiapp_x", "a b+c/d=&"), "grant_type=refresh_token&client_id=oaiapp_x&refresh_token=a%20b%2Bc%2Fd%3D%26");
        assert!(OAUTH_TOKEN_URL.starts_with("https://auth.openai.com/api/accounts/"));
    }
    #[test] fn issuer_is_exact_and_fail_closed() {
        // {"iss":"https://auth.openai.com"}
        assert!(issuer_ok("e30.eyJpc3MiOiJodHRwczovL2F1dGgub3BlbmFpLmNvbSJ9.x"));
        // {"iss":"https://auth.openai.com.evil.test"}
        assert!(!issuer_ok("e30.eyJpc3MiOiJodHRwczovL2F1dGgub3BlbmFpLmNvbS5ldmlsLnRlc3QifQ.x"));
        assert!(!issuer_ok("e30.e30.x") && !issuer_ok("garbage"));
    }
    #[test] fn client_id_required_and_kept_on_refresh() {
        let mut t = tok(1); t.client_id = String::new();
        assert_eq!(store().save_tokens(&t), Err(StoreError::Invalid));
        assert_eq!(apply_refresh(&tok(1), r#"{"access_token":"n","expires_in":1}"#, 0).unwrap().client_id, "oaiapp_test");
    }
}
