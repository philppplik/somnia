//! GitHub account login (OAuth device flow) for Somnia.
//!
//! Pure logic and a store over [`SecretBackend`], no Tauri/reqwest types, so it is unit-testable
//! everywhere. The device flow needs no client secret and no loopback listener, which is the
//! right fit for a distributed desktop app (a secret in a public binary is not a secret).
//! The access token lives only in the OS credential store and in the Rust host. The renderer
//! sees [`Status`] only: state, public login/name, and the user code while a login is pending.
//! The `device_code` never leaves the host.
use crate::oauth_store::{SecretBackend, StoreError};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Client id of the "Somnia" GitHub OAuth App (device flow on, token expiry off; public by design, not a secret).
pub const CLIENT_ID: &str = "Ov23licQQ0Gt10vUeqn8";
/// Profile (name, login) plus repository access. GitHub OAuth Apps have no read-only repo scope: `repo`
/// can technically also write, so Somnia must only ever issue read requests with this token (owner decision B, 2026-10-08).
pub const SCOPE: &str = "read:user repo";
/// Scope the app needs; a stored token without it needs a re-login (one new consent on GitHub).
pub const REQUIRED_SCOPES: [&str; 2] = ["read:user", "repo"];
pub const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
pub const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
pub const USER_URL: &str = "https://api.github.com/user";
/// The only page the user is ever sent to. A different value from the server is rejected.
pub const VERIFICATION_URI: &str = "https://github.com/login/device";
pub const TOKEN_SLOT: &str = "github-oauth";
pub const MIN_INTERVAL_SECS: u64 = 5;
pub const MAX_LIFETIME_SECS: u64 = 15 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoginError { NotConfigured, Request, Response, Denied, Expired, Cancelled, Store }
impl fmt::Display for LoginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NotConfigured => "GitHub sign-in is not configured in this build", Self::Request => "Could not reach GitHub",
            Self::Response => "GitHub returned an unexpected response", Self::Denied => "Sign-in was denied on GitHub",
            Self::Expired => "The sign-in code expired", Self::Cancelled => "Sign-in was cancelled", Self::Store => "Could not save the account in the OS credential store",
        })
    }
}

/// Host-side device authorization. `device_code` is a secret: never serialized, never logged.
#[derive(Clone, PartialEq, Eq)]
pub struct DeviceCode { pub device_code: String, pub user_code: String, pub expires_in: u64, pub interval: u64 }
impl fmt::Debug for DeviceCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.debug_struct("DeviceCode").field("user_code", &self.user_code).finish_non_exhaustive() }
}
fn clean(s: &str, max: usize) -> bool { !s.is_empty() && s.len() <= max && !s.chars().any(|c| c.is_control() || c.is_whitespace()) }

pub fn device_code_body() -> String { format!("client_id={}&scope={}", form_encode(CLIENT_ID), form_encode(SCOPE)) }
pub fn poll_body(device_code: &str) -> String {
    format!("client_id={}&device_code={}&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code", form_encode(CLIENT_ID), form_encode(device_code))
}
fn form_encode(v: &str) -> String {
    v.bytes().map(|b| if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

pub fn parse_device_code(text: &str) -> Result<DeviceCode, LoginError> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|_| LoginError::Response)?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_owned);
    let n = |k: &str| v.get(k).and_then(|x| x.as_u64());
    let device_code = s("device_code").filter(|c| clean(c, 256)).ok_or(LoginError::Response)?;
    let user_code = s("user_code").filter(|c| clean(c, 32)).ok_or(LoginError::Response)?;
    if s("verification_uri").as_deref() != Some(VERIFICATION_URI) { return Err(LoginError::Response); }
    let expires_in = n("expires_in").ok_or(LoginError::Response)?.clamp(1, MAX_LIFETIME_SECS);
    let interval = n("interval").unwrap_or(MIN_INTERVAL_SECS).max(MIN_INTERVAL_SECS);
    Ok(DeviceCode { device_code, user_code, expires_in, interval })
}

#[derive(Debug, PartialEq, Eq)]
pub enum Poll { Token { token: String, scope: String }, Pending, SlowDown(u64), Expired, Denied, Failed }
/// GitHub answers 200 for every polling outcome; the `error` field carries the state.
pub fn parse_poll(text: &str) -> Poll {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else { return Poll::Failed };
    if let Some(t) = v.get("access_token").and_then(|t| t.as_str()) {
        let scope = v.get("scope").and_then(|s| s.as_str()).unwrap_or("").to_owned();
        return if clean(t, 512) && scope.len() <= 512 && !scope.chars().any(|c| c.is_control()) && v.get("token_type").and_then(|t| t.as_str()).is_none_or(|t| t.eq_ignore_ascii_case("bearer")) { Poll::Token { token: t.to_owned(), scope } } else { Poll::Failed };
    }
    match v.get("error").and_then(|e| e.as_str()) {
        Some("authorization_pending") => Poll::Pending,
        Some("slow_down") => Poll::SlowDown(v.get("interval").and_then(|i| i.as_u64()).unwrap_or(0)),
        Some("expired_token") => Poll::Expired,
        Some("access_denied") => Poll::Denied,
        _ => Poll::Failed,
    }
}
/// Next polling interval after `slow_down`: GitHub's value when given, else +5 s, never decreasing.
pub fn slowed(current: u64, advised: u64) -> u64 { advised.max(current + 5) }

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Account {
    pub access_token: String,
    pub login: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Scopes GitHub granted, comma-separated as returned. Empty for tokens saved before scopes were recorded.
    #[serde(default)]
    pub scope: String,
}
impl fmt::Debug for Account {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.debug_struct("Account").field("login", &self.login).finish_non_exhaustive() }
}
impl Account {
    /// True when the stored token lacks a scope the app needs (older login, or the user narrowed it).
    pub fn needs_scope_upgrade(&self) -> bool {
        let have: Vec<&str> = self.scope.split(|c: char| c == ',' || c == ' ').filter(|s| !s.is_empty()).collect();
        !REQUIRED_SCOPES.iter().all(|r| have.contains(r))
    }
    pub fn validate(&self) -> Result<(), StoreError> {
        let login_ok = !self.login.is_empty() && self.login.len() <= 39 && self.login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if self.scope.len() > 512 || self.scope.chars().any(|c| c.is_control()) { return Err(StoreError::Invalid); }
        if !clean(&self.access_token, 512) || !login_ok || self.name.as_deref().is_some_and(|n| n.len() > 200 || n.chars().any(|c| c.is_control())) { return Err(StoreError::Invalid); }
        Ok(())
    }
}
/// `GET /user` -> account. Only public identity fields are read.
pub fn account_from_user(token: &str, scope: &str, text: &str) -> Result<Account, LoginError> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|_| LoginError::Response)?;
    let login = v.get("login").and_then(|l| l.as_str()).ok_or(LoginError::Response)?.to_owned();
    let name = v.get("name").and_then(|n| n.as_str()).map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    let a = Account { access_token: token.to_owned(), login, name, scope: scope.to_owned() };
    a.validate().map_err(|_| LoginError::Response)?;
    Ok(a)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State { Disconnected, Pending, Connected }
/// Public metadata only. Never a token or device code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub provider: &'static str,
    pub state: State,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Connected with an older/narrower scope: the UI offers a reconnect (one new consent on GitHub).
    pub scope_upgrade: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri: Option<&'static str>,
}

pub struct Store<B: SecretBackend> { backend: B }
impl<B: SecretBackend> Store<B> {
    pub fn new(backend: B) -> Self { Self { backend } }
    pub fn load(&self) -> Result<Option<Account>, StoreError> {
        match self.backend.get(TOKEN_SLOT)? {
            None => Ok(None),
            Some(raw) => { let a: Account = serde_json::from_str(&raw).map_err(|_| StoreError::Corrupt)?; a.validate().map_err(|_| StoreError::Corrupt)?; Ok(Some(a)) }
        }
    }
    pub fn save(&self, a: &Account) -> Result<(), StoreError> {
        a.validate()?;
        self.backend.set(TOKEN_SLOT, &serde_json::to_string(a).map_err(|_| StoreError::Invalid)?)
    }
    pub fn disconnect(&self) -> Result<(), StoreError> { self.backend.delete(TOKEN_SLOT) }
    /// `pending` carries the user code of a login in flight, if any.
    pub fn status(&self, pending: Option<&str>) -> Result<Status, StoreError> {
        let a = self.load()?;
        Ok(match (a, pending) {
            (Some(a), None) => Status { provider: "github", state: State::Connected, scope_upgrade: a.needs_scope_upgrade(), login: Some(a.login), name: a.name, user_code: None, verification_uri: None },
            (Some(a), Some(_)) if !a.needs_scope_upgrade() => Status { provider: "github", state: State::Connected, scope_upgrade: false, login: Some(a.login), name: a.name, user_code: None, verification_uri: None },
            (_, Some(code)) => Status { provider: "github", state: State::Pending, scope_upgrade: false, login: None, name: None, user_code: Some(code.to_owned()), verification_uri: Some(VERIFICATION_URI) },
            (None, None) => Status { provider: "github", state: State::Disconnected, scope_upgrade: false, login: None, name: None, user_code: None, verification_uri: None },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oauth_store::MemoryBackend;
    const DC: &str = r#"{"device_code":"3584d83530557fdd1f46af8289938c8ef79f9dc5","user_code":"WDJB-MJHT","verification_uri":"https://github.com/login/device","expires_in":900,"interval":5}"#;
    #[test] fn device_code_parses_and_hides_secret() {
        let d = parse_device_code(DC).unwrap();
        assert_eq!((d.user_code.as_str(), d.expires_in, d.interval), ("WDJB-MJHT", 900, 5));
        assert!(!format!("{d:?}").contains("3584d8"));
    }
    #[test] fn device_code_rejects_foreign_verification_page() {
        assert_eq!(parse_device_code(&DC.replace("github.com/login/device", "evil.example/login")), Err(LoginError::Response));
        assert_eq!(parse_device_code("{}"), Err(LoginError::Response));
        assert_eq!(parse_device_code("nope"), Err(LoginError::Response));
    }
    #[test] fn interval_and_lifetime_are_bounded() {
        let d = parse_device_code(&DC.replace("\"interval\":5", "\"interval\":1").replace("900", "99999")).unwrap();
        assert_eq!((d.interval, d.expires_in), (5, MAX_LIFETIME_SECS));
    }
    #[test] fn poll_outcomes() {
        assert_eq!(parse_poll(r#"{"access_token":"gho_abc","token_type":"bearer","scope":"read:user"}"#), Poll::Token { token: "gho_abc".into(), scope: "read:user".into() });
        assert_eq!(parse_poll(r#"{"error":"authorization_pending"}"#), Poll::Pending);
        assert_eq!(parse_poll(r#"{"error":"slow_down","interval":10}"#), Poll::SlowDown(10));
        assert_eq!(parse_poll(r#"{"error":"expired_token"}"#), Poll::Expired);
        assert_eq!(parse_poll(r#"{"error":"access_denied"}"#), Poll::Denied);
        assert_eq!(parse_poll(r#"{"error":"incorrect_client_credentials"}"#), Poll::Failed);
        assert_eq!(parse_poll(r#"{"access_token":"has space","token_type":"bearer"}"#), Poll::Failed);
        assert_eq!(parse_poll(r#"{"access_token":"x","token_type":"mac"}"#), Poll::Failed);
        assert_eq!(parse_poll("<html>"), Poll::Failed);
    }
    #[test] fn slow_down_never_decreases() { assert_eq!(slowed(5, 10), 10); assert_eq!(slowed(10, 0), 15); assert_eq!(slowed(10, 12), 15); }
    #[test] fn bodies_are_form_encoded() { assert!(poll_body("a b").contains("device_code=a%20b")); assert!(poll_body("x").contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code")); }
    #[test] fn user_profile_maps_to_account() {
        let a = account_from_user("gho_abc", "read:user,repo", r#"{"login":"philppplik","name":" Philipp ","email":"secret@example.com","id":1}"#).unwrap();
        assert_eq!((a.login.as_str(), a.name.as_deref()), ("philppplik", Some("Philipp")));
        assert!(account_from_user("gho_abc", "read:user,repo", r#"{"login":"bad login"}"#).is_err());
        assert!(account_from_user("gho_abc", "read:user,repo", r#"{"name":"x"}"#).is_err());
    }
    #[test] fn store_roundtrip_status_and_logout() {
        let s = Store::new(MemoryBackend::default());
        assert_eq!(s.status(None).unwrap().state, State::Disconnected);
        let p = s.status(Some("WDJB-MJHT")).unwrap();
        assert_eq!((p.state, p.user_code.as_deref(), p.verification_uri), (State::Pending, Some("WDJB-MJHT"), Some(VERIFICATION_URI)));
        s.save(&account_from_user("gho_abc", "read:user,repo", r#"{"login":"philppplik","name":"Philipp"}"#).unwrap()).unwrap();
        let c = s.status(Some("IGNORED")).unwrap();
        assert_eq!((c.state, c.login.as_deref(), c.user_code.as_deref()), (State::Connected, Some("philppplik"), None));
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("gho_abc") && json.contains("\"state\":\"connected\""));
        s.disconnect().unwrap();
        assert_eq!(s.status(None).unwrap().state, State::Disconnected);
        assert!(s.load().unwrap().is_none());
    }
    #[test] fn scope_upgrade_is_detected() {
        let full = account_from_user("t", "read:user,repo", r#"{"login":"a"}"#).unwrap();
        assert!(!full.needs_scope_upgrade());
        assert!(!account_from_user("t", "repo read:user", r#"{"login":"a"}"#).unwrap().needs_scope_upgrade());
        assert!(account_from_user("t", "read:user", r#"{"login":"a"}"#).unwrap().needs_scope_upgrade());
        assert!(account_from_user("t", "", r#"{"login":"a"}"#).unwrap().needs_scope_upgrade());
        assert!(account_from_user("t", "public_repo,read:user", r#"{"login":"a"}"#).unwrap().needs_scope_upgrade());
        let s = Store::new(MemoryBackend::default()); s.save(&account_from_user("t", "read:user", r#"{"login":"a"}"#).unwrap()).unwrap();
        let st = s.status(None).unwrap(); assert!(st.scope_upgrade && serde_json::to_string(&st).unwrap().contains("\"scopeUpgrade\":true"));
    }
    #[test] fn old_stored_tokens_without_scope_still_load() {
        let b = MemoryBackend::default(); b.set(TOKEN_SLOT, r#"{"accessToken":"gho_x","login":"a"}"#).unwrap();
        let a = Store::new(b).load().unwrap().unwrap(); assert!(a.needs_scope_upgrade());
    }
    #[test] fn requested_scope_is_profile_plus_repo() { assert_eq!(SCOPE, "read:user repo"); assert!(device_code_body().contains("scope=read%3Auser%20repo")); }
    #[test] fn corrupt_store_is_reported() {
        let b = MemoryBackend::default(); b.set(TOKEN_SLOT, "{").unwrap();
        assert_eq!(Store::new(b).load(), Err(StoreError::Corrupt));
    }
}
