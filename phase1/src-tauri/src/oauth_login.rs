//! Browser login for the OpenAI ChatGPT account (authorization code + PKCE, loopback redirect).
//!
//! Pure logic and a tiny tokio loopback listener, no Tauri types, so everything is testable against
//! a local mock. The whole flow runs in the Rust host: the renderer never sees a code, token,
//! verifier or id_token. Nothing here has been run against the real OpenAI service.
use crate::oauth_store::{Tokens, DEFAULT_LIFETIME_MS, OAUTH_ISSUER};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const AUTHORIZE_URL: &str = "https://auth.openai.com/api/accounts/authorize";
pub const RESOURCE: &str = "https://api.openai.com/v1";
pub const BOOTSTRAP_CLIENT_ID: &str = "dynamic_agent_client";
pub const AGENT_NAME_HINT: &str = "Somnia";
pub const CALLBACK_PATH: &str = "/auth/callback";
pub const SCOPES: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
/// 0 = the OS picks a free port (what the reference flow and the TS config assume). Set a fixed
/// port here only if OpenAI registers one for the installation.
pub const LOOPBACK_PORT: u16 = 0;
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, PartialEq, Eq)]
pub enum LoginError { Denied, StateMismatch, NoCode, NoClientId, ClientIdMismatch, Timeout, Cancelled, Listener, Exchange, IdToken, PlanPermission, Response }
impl std::fmt::Display for LoginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Denied => "Sign-in was denied", Self::StateMismatch => "Sign-in response did not match this request", Self::NoCode => "Sign-in returned no code",
            Self::NoClientId | Self::ClientIdMismatch => "Sign-in returned an unexpected client", Self::Timeout => "Sign-in timed out", Self::Cancelled => "Sign-in was cancelled",
            Self::Listener => "Could not start the local sign-in listener", Self::Exchange => "Sign-in could not be completed", Self::IdToken => "Sign-in identity could not be verified",
            Self::PlanPermission => "Your ChatGPT plan does not allow direct use", Self::Response => "Sign-in returned an unexpected response",
        })
    }
}

fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for ch in bytes.chunks(3) {
        let n = (ch[0] as u32) << 16 | (*ch.get(1).unwrap_or(&0) as u32) << 8 | *ch.get(2).unwrap_or(&0) as u32;
        out.push(A[(n >> 18) as usize & 63] as char); out.push(A[(n >> 12) as usize & 63] as char);
        if ch.len() > 1 { out.push(A[(n >> 6) as usize & 63] as char); }
        if ch.len() > 2 { out.push(A[n as usize & 63] as char); }
    }
    out
}
/// 32 random bytes (two v4 UUIDs, each from the OS CSPRNG), base64url.
pub fn random_token() -> String {
    let (a, b) = (uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(a.as_bytes()); bytes[16..].copy_from_slice(b.as_bytes());
    b64url(&bytes)
}
pub fn pkce_challenge(verifier: &str) -> String { b64url(&Sha256::digest(verifier.as_bytes())) }

fn enc(v: &str) -> String {
    v.bytes().map(|b| if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
pub fn authorize_url(client_id: &str, host_id: &str, redirect: &str, state: &str, nonce: &str, challenge: &str) -> String {
    let q = [("response_type", "code"), ("client_id", client_id), ("agent_name_hint", AGENT_NAME_HINT), ("ext_agent_host_id", host_id), ("redirect_uri", redirect),
        ("scope", SCOPES), ("resource", RESOURCE), ("state", state), ("nonce", nonce), ("code_challenge", challenge), ("code_challenge_method", "S256")];
    format!("{AUTHORIZE_URL}?{}", q.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&"))
}
pub fn exchange_body(code: &str, redirect: &str, client_id: &str, verifier: &str) -> String {
    format!("grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}&resource={}", enc(code), enc(redirect), enc(client_id), enc(verifier), enc(RESOURCE))
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Callback { pub state: Option<String>, pub code: Option<String>, pub error: Option<String>, pub client_id: Option<String> }
fn dec(v: &str) -> String {
    let b = v.replace('+', " ").into_bytes(); let mut out = Vec::new(); let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() { if let Ok(h) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) { out.push(h); i += 3; continue; } }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
/// Parses `GET /auth/callback?... HTTP/1.1`. Returns None for any other method/path.
pub fn parse_request_line(line: &str) -> Option<Callback> {
    let mut it = line.split_whitespace();
    if it.next()? != "GET" { return None; }
    let target = it.next()?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != CALLBACK_PATH { return None; }
    let mut cb = Callback::default();
    for part in query.split('&') {
        let Some((k, v)) = part.split_once('=') else { continue };
        let v = dec(v);
        match k { "state" => cb.state = Some(v), "code" => cb.code = Some(v), "error" => cb.error = Some(v), "client_id" => cb.client_id = Some(v), _ => {} }
    }
    Some(cb)
}

const PAGE: &str = "<!doctype html><meta charset=utf-8><title>Somnia</title><body style=\"font:16px system-ui;margin:3em\"><h2>Signed in</h2><p>You can close this tab and return to Somnia.</p>";
async fn respond(sock: &mut tokio::net::TcpStream, status: &str, body: &str) {
    let r = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{body}", body.len());
    let _ = sock.write_all(r.as_bytes()).await; let _ = sock.shutdown().await;
}
pub struct Loopback { listener: TcpListener, pub redirect_uri: String }
impl Loopback {
    pub async fn bind(port: u16) -> Result<Self, LoginError> {
        let listener = TcpListener::bind(("127.0.0.1", port)).await.map_err(|_| LoginError::Listener)?;
        let p = listener.local_addr().map_err(|_| LoginError::Listener)?.port();
        Ok(Self { listener, redirect_uri: format!("http://127.0.0.1:{p}{CALLBACK_PATH}") })
    }
    /// Accepts connections until one valid `GET /auth/callback` arrives (other paths get 404, junk is dropped).
    /// Exactly one callback is consumed; the listener is dropped afterwards.
    pub async fn wait(self, timeout: Duration, cancel: &tokio::sync::Notify) -> Result<Callback, LoginError> {
        let accept = async {
            loop {
                let Ok((mut sock, _)) = self.listener.accept().await else { return Err(LoginError::Listener) };
                let mut buf = vec![0u8; 8192]; let mut n = 0;
                let read = tokio::time::timeout(Duration::from_secs(5), async {
                    loop { match sock.read(&mut buf[n..]).await { Ok(0) | Err(_) => break, Ok(k) => { n += k; if buf[..n].windows(2).any(|w| w == b"\r\n") || n == buf.len() { break; } } } }
                }).await;
                if read.is_err() || n == 0 { continue; }
                let head = String::from_utf8_lossy(&buf[..n]); let line = head.lines().next().unwrap_or("");
                match parse_request_line(line) {
                    Some(cb) if cb.state.is_some() || cb.error.is_some() => { respond(&mut sock, "200 OK", PAGE).await; return Ok(cb); }
                    _ => respond(&mut sock, "404 Not Found", "").await,
                }
            }
        };
        tokio::select! { r = accept => r, _ = tokio::time::sleep(timeout) => Err(LoginError::Timeout), _ = cancel.notified() => Err(LoginError::Cancelled) }
    }
}

/// Checks a callback against the request: error, state (constant-time-ish exact compare), code, issued client id.
/// Returns (code, client_id to use).
pub fn check_callback(cb: &Callback, state: &str, existing_client: Option<&str>) -> Result<(String, String), LoginError> {
    if cb.error.is_some() { return Err(LoginError::Denied); }
    if cb.state.as_deref() != Some(state) { return Err(LoginError::StateMismatch); }
    let code = cb.code.clone().filter(|c| !c.is_empty()).ok_or(LoginError::NoCode)?;
    let client = match existing_client {
        Some(c) => { if cb.client_id.as_deref().is_some_and(|x| x != c) { return Err(LoginError::ClientIdMismatch); } c.to_string() }
        None => cb.client_id.clone().filter(|c| c.starts_with("oaiapp_") && c.len() < 256).ok_or(LoginError::NoClientId)?,
    };
    Ok((code, client))
}

#[derive(Debug, PartialEq, Eq)]
pub struct Identity { pub sub: String }
/// Verifies the id_token signature against the pinned JWKS (RS256 only), issuer, audience (= client id), expiry and nonce.
pub fn verify_id_token(jwt: &str, jwks_json: &str, client_id: &str, nonce: &str) -> Result<Identity, LoginError> {
    use jsonwebtoken::{decode, decode_header, jwk::{AlgorithmParameters, JwkSet}, Algorithm, DecodingKey, Validation};
    let header = decode_header(jwt).map_err(|_| LoginError::IdToken)?;
    if header.alg != Algorithm::RS256 { return Err(LoginError::IdToken); }
    let set: JwkSet = serde_json::from_str(jwks_json).map_err(|_| LoginError::IdToken)?;
    let kid = header.kid.ok_or(LoginError::IdToken)?;
    let jwk = set.find(&kid).ok_or(LoginError::IdToken)?;
    let AlgorithmParameters::RSA(rsa) = &jwk.algorithm else { return Err(LoginError::IdToken) };
    let key = DecodingKey::from_rsa_components(&rsa.n, &rsa.e).map_err(|_| LoginError::IdToken)?;
    let mut v = Validation::new(Algorithm::RS256);
    v.set_issuer(&[OAUTH_ISSUER]); v.set_audience(&[client_id]); v.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let data = decode::<serde_json::Value>(jwt, &key, &v).map_err(|_| LoginError::IdToken)?;
    if data.claims.get("nonce").and_then(|n| n.as_str()) != Some(nonce) { return Err(LoginError::IdToken); }
    let sub = data.claims.get("sub").and_then(|s| s.as_str()).filter(|s| !s.is_empty()).ok_or(LoginError::IdToken)?;
    Ok(Identity { sub: sub.to_string() })
}

/// Builds the token set from the code-exchange response. Requires an id_token that verifies and the plan scopes.
pub fn tokens_from_exchange(response_json: &str, jwks_json: &str, client_id: &str, nonce: &str, now_ms: u64) -> Result<Tokens, LoginError> {
    let v: serde_json::Value = serde_json::from_str(response_json).map_err(|_| LoginError::Response)?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(str::to_owned);
    let access = s("access_token").ok_or(LoginError::Response)?; let refresh = s("refresh_token").ok_or(LoginError::Response)?;
    let id = s("id_token").ok_or(LoginError::IdToken)?;
    verify_id_token(&id, jwks_json, client_id, nonce)?;
    let scope = v.get("scope").and_then(|x| x.as_str()).unwrap_or("");
    if !(scope.split(' ').any(|x| x == "resource.invoke") && scope.split(' ').any(|x| x == "chatgpt.tokens.use.direct")) { return Err(LoginError::PlanPermission); }
    let expires_at_ms = now_ms + v.get("expires_in").and_then(|x| x.as_u64()).map(|s| s * 1000).unwrap_or(DEFAULT_LIFETIME_MS);
    let t = Tokens { access_token: access, refresh_token: refresh, client_id: client_id.to_string(), id_token: Some(id), expires_at_ms, account_id: None, needs_reauth: false };
    t.validate().map_err(|_| LoginError::Response)?;
    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    // Test-only RSA key (generated with openssl, never used anywhere else). Tokens expire in 2100.
    mod fx {
    pub const JWKS: &str = "{\"keys\": [{\"kty\": \"RSA\", \"kid\": \"test-1\", \"alg\": \"RS256\", \"use\": \"sig\", \"n\": \"yQbCGw9SQMrJtpTrlv5UaZK3GlfK5JA_E946L3Rx4nJB-fZYv6k6fnkR6MVQBUW8bhiNefR7Co22pnTROURa4dAVKvgMc9E0HssZVkotC8MxXawTqynBEm21obOlbv9U8Y1AwrlEZjyrciMqU6reSSC92OzV3FwpdcIAqGAsPlDJl2OwiZAQ51WnbkVya71e_le2jGvLY6AEPHFT_nyNKkahGSs14pjGMDUZ1LfhownQdvO5oyua7BgmltwZ1EfLEIZaqzWgyf9_Uk-4lkkMH31q6YPSgc6eoy2YY1FbzwQW8YNu4xDO721KOrgquhxfLd7qpGI7WiPLDOlxy9p5hQ\", \"e\": \"AQAB\"}]}";
    pub const GOOD: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCAiYXVkIjogIm9haWFwcF90ZXN0IiwgInN1YiI6ICJ1c2VyLTEiLCAibm9uY2UiOiAibm9uY2UtMSIsICJleHAiOiA0MTAyNDQ0ODAwfQ.Fw5gd6uelaGZe8knHWNU9hig0eOF-a5A4fepjtAIfViFpxq21k6gV67hcSL1iVVNMWfzVcOqSQ6MR246mxTvspDoD-cDSVR6Fnzul8K3eABK2ZFIAdMU_QS4rFZtns_WMsdSfNBnUJMD8VR_QiY-K_rZvP8nmnMBEEK68SnvziEKfZKhYVnqnXpBpLbrWxXH7ivlH6-kD09S9YztVbej8GkiTyxR4pNnfKfD6a7AwECrH9y2QGVU1LIKBJ_ogaPAumMLc-iqxNMRMEZ-CutED_-nQvpZVoOcr2INjCYQJpMibwSC7ZkRP1EH5MrUc_tse8V47-jUL5751gwrP2kyZg";
    pub const BADISS: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9ldmlsLmV4YW1wbGUiLCAiYXVkIjogIm9haWFwcF90ZXN0IiwgInN1YiI6ICJ1c2VyLTEiLCAibm9uY2UiOiAibm9uY2UtMSIsICJleHAiOiA0MTAyNDQ0ODAwfQ.Ny7ESMb4C0ICY9taYFndw8nvNHjD_UYdYcm-wE32TN4tbKiZCnUggWmPiwpXzaWVTtrVUc5VtrfUpIgp0AYb9cXhvvmTF2Jy_HDZkycK26JgqlGQ-1ODcYmV_xCEMGnbzPGsxdRRzbQhozFLd0HV6j7pIm5LdQdbTulKxHpA6WUiFSBi9TrOBZyBJrrs4RgyLwnndG0QMkqcakC0Zu191FUAvnS1bxm0YnZb4lKxpht0gz4D7ttySaFPOLbwLVNmq0O1RvgGgAykra0IiQ-PZgouZxeeyQEGF_FSIzSVcK9w6LlY_olMWAO5yvI80TQrLAobJmPD-MtsmGZUn0M9_Q";
    pub const BADAUD: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCAiYXVkIjogIm90aGVyIiwgInN1YiI6ICJ1c2VyLTEiLCAibm9uY2UiOiAibm9uY2UtMSIsICJleHAiOiA0MTAyNDQ0ODAwfQ.EfwA39mL6zuhbad6fI4X6ar53gqBefNC0e6JAwQJzRKkvTYcx_G87mhUeH8Dg9V37MWAYe6qDakvh2LoGcdjSkzR7v-dgiKta-5F3YKoZfAD9b3vh8NU8GPPbxglhiwXHzhySmPig_Jv5JcH_lJr40UYQpxHb2OPwmbrbs6AlRWK13_aMqtYcZ1az74ZqPE6t0tKnx5LRtXUFZw8y5xKJjzKqWHthNFNPYiUPe-dK7vSL7relzNBdlwF5zD6BJVbOnveIUd51iAc7AJy_Xnac5O1fdbo1iUiczoN0LEtSqSA6OZu97ueQAWkyXU-XpMSHCqfFlJhgIaDDNuGNjf9NQ";
    pub const BADNONCE: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCAiYXVkIjogIm9haWFwcF90ZXN0IiwgInN1YiI6ICJ1c2VyLTEiLCAibm9uY2UiOiAieCIsICJleHAiOiA0MTAyNDQ0ODAwfQ.YSxijNfC811MEzqXRRPzHlzI7Wqbqs4326vPD5zEvceBBQfzxQAQVBb967h6lg53DyLKM5D_Tg4Ae4x640EJcVh6D7ds4xf7VJrfTDwMkwP6afHAGdXveFHulutzgEXh8ywJi0qDSxKwbjWrOYM12PClPTMFHRGcGxQR8mK-ntm4Gz0TmeCzCfk4MLI0IP9cfZ6LmsoC0G0ylFORewTBzPli6gi764F_KyOAfWb1OdUtCdFEHEuTKFzf2IN-vIWIzmJvZ-2bv3dMaYXjVhk3TnLYA1xyC9JT13FfaeeNZRsu5rEIYsiNP__SY6ilSBVUlF2pKxrZH_5QJ5vyLi_LaQ";
    pub const EXPIRED: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCAiYXVkIjogIm9haWFwcF90ZXN0IiwgInN1YiI6ICJ1c2VyLTEiLCAibm9uY2UiOiAibm9uY2UtMSIsICJleHAiOiAxMDAwMDAwMDAwfQ.XxI5LPvDKBrxdIE1wXRMW1_44dfAh3Ae01znZyDZAlxSiq4NOF0nVkPd6KmGhF0wcILR8TxrKQEV111znlluSTbFupUxOy_lEQjozu8Q5_iG8eXkyxDKcj6LA9pXjt-eXyDgQrOLoBa4wZfHQ_CaD0tz-uA-wvYY9tp6nTxB7GB7SNFnSl8PZLNtRDaCLYz-v_h83CfaoltOdWzgZai7dNNxI1y3_UR3Gkthp1rRGT0ihlzJsSLZSXAFmHcxYLOhVAphnoCpkt3qpM2TawvD-6HavkPt5pvWLh6m8KDZNUCjFZkOQCRc9oATE-rfO_iu0J7Pq6-QQtcXJGWdDFJYPA";
    pub const TAMPERED: &str = "eyJhbGciOiAiUlMyNTYiLCAia2lkIjogInRlc3QtMSIsICJ0eXAiOiAiSldUIn0.eyJpc3MiOiAiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCAiYXVkIjogIm9haWFwcF90ZXN0IiwgInN1YiI6ICJhdHRhY2tlciIsICJub25jZSI6ICJub25jZS0xIiwgImV4cCI6IDQxMDI0NDQ4MDB9.Fw5gd6uelaGZe8knHWNU9hig0eOF-a5A4fepjtAIfViFpxq21k6gV67hcSL1iVVNMWfzVcOqSQ6MR246mxTvspDoD-cDSVR6Fnzul8K3eABK2ZFIAdMU_QS4rFZtns_WMsdSfNBnUJMD8VR_QiY-K_rZvP8nmnMBEEK68SnvziEKfZKhYVnqnXpBpLbrWxXH7ivlH6-kD09S9YztVbej8GkiTyxR4pNnfKfD6a7AwECrH9y2QGVU1LIKBJ_ogaPAumMLc-iqxNMRMEZ-CutED_-nQvpZVoOcr2INjCYQJpMibwSC7ZkRP1EH5MrUc_tse8V47-jUL5751gwrP2kyZg";
    }
    #[test] fn pkce_matches_rfc7636_example() {
        assert_eq!(pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assert_ne!(random_token(), random_token());
        assert_eq!(random_token().len(), 43);
    }
    #[test] fn authorize_url_carries_required_params() {
        let u = authorize_url("dynamic_agent_client", "urn:uuid:abc", "http://127.0.0.1:5555/auth/callback", "st", "no", "ch");
        for p in ["response_type=code", "client_id=dynamic_agent_client", "agent_name_hint=Somnia", "ext_agent_host_id=urn%3Auuid%3Aabc", "redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fauth%2Fcallback", "state=st", "nonce=no", "code_challenge=ch", "code_challenge_method=S256", "resource=https%3A%2F%2Fapi.openai.com%2Fv1"] { assert!(u.contains(p), "{p}"); }
        assert!(u.starts_with("https://auth.openai.com/api/accounts/authorize?"));
    }
    #[test] fn request_line_parsing() {
        let cb = parse_request_line("GET /auth/callback?code=a%20b&state=s1&client_id=oaiapp_x HTTP/1.1").unwrap();
        assert_eq!((cb.code.as_deref(), cb.state.as_deref(), cb.client_id.as_deref()), (Some("a b"), Some("s1"), Some("oaiapp_x")));
        assert!(parse_request_line("GET /other?state=s HTTP/1.1").is_none());
        assert!(parse_request_line("POST /auth/callback?state=s HTTP/1.1").is_none());
    }
    #[test] fn callback_checks() {
        let ok = Callback { state: Some("s".into()), code: Some("c".into()), error: None, client_id: Some("oaiapp_1".into()) };
        assert_eq!(check_callback(&ok, "s", None), Ok(("c".into(), "oaiapp_1".into())));
        assert_eq!(check_callback(&ok, "x", None), Err(LoginError::StateMismatch));
        assert_eq!(check_callback(&ok, "s", Some("oaiapp_2")), Err(LoginError::ClientIdMismatch));
        assert_eq!(check_callback(&Callback { client_id: Some("evil".into()), ..Callback { state: Some("s".into()), code: Some("c".into()), error: None, client_id: None } }, "s", None), Err(LoginError::NoClientId));
        assert_eq!(check_callback(&Callback { error: Some("access_denied".into()), ..Default::default() }, "s", None), Err(LoginError::Denied));
    }
    #[test] fn id_token_verification() {
        assert_eq!(verify_id_token(fx::GOOD, fx::JWKS, "oaiapp_test", "nonce-1"), Ok(Identity { sub: "user-1".into() }));
        for bad in [fx::BADISS, fx::BADAUD, fx::BADNONCE, fx::EXPIRED, fx::TAMPERED] { assert_eq!(verify_id_token(bad, fx::JWKS, "oaiapp_test", "nonce-1"), Err(LoginError::IdToken)); }
        assert_eq!(verify_id_token(fx::GOOD, "{\"keys\":[]}", "oaiapp_test", "nonce-1"), Err(LoginError::IdToken));
    }
    #[test] fn exchange_builds_tokens_and_fails_closed() {
        let body = |scope: &str| format!("{{\"access_token\":\"at\",\"refresh_token\":\"rt\",\"id_token\":\"{}\",\"expires_in\":3600,\"scope\":\"{scope}\"}}", fx::GOOD);
        let t = tokens_from_exchange(&body("openid resource.invoke chatgpt.tokens.use.direct"), fx::JWKS, "oaiapp_test", "nonce-1", 1000).unwrap();
        assert_eq!((t.client_id.as_str(), t.expires_at_ms, t.needs_reauth), ("oaiapp_test", 3_601_000, false));
        assert_eq!(tokens_from_exchange(&body("openid"), fx::JWKS, "oaiapp_test", "nonce-1", 1000).unwrap_err(), LoginError::PlanPermission);
        assert_eq!(tokens_from_exchange("{\"access_token\":\"a\",\"refresh_token\":\"r\",\"scope\":\"x\"}", fx::JWKS, "oaiapp_test", "nonce-1", 0).unwrap_err(), LoginError::IdToken);
        assert_eq!(tokens_from_exchange(&body("openid resource.invoke chatgpt.tokens.use.direct"), fx::JWKS, "oaiapp_test", "other", 0).unwrap_err(), LoginError::IdToken);
    }
    async fn get(port: u16, target: &str) -> String {
        let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(format!("GET {target} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).await.unwrap();
        let mut out = String::new(); s.read_to_string(&mut out).await.unwrap(); out
    }
    #[tokio::test] async fn loopback_takes_one_valid_callback() {
        let lb = Loopback::bind(0).await.unwrap(); let port: u16 = lb.redirect_uri.rsplit(':').next().unwrap().split('/').next().unwrap().parse().unwrap();
        assert!(lb.redirect_uri.starts_with("http://127.0.0.1:") && lb.redirect_uri.ends_with("/auth/callback"));
        let cancel = std::sync::Arc::new(tokio::sync::Notify::new());
        let c2 = cancel.clone();
        let h = tokio::spawn(async move { lb.wait(Duration::from_secs(5), &c2).await });
        assert!(get(port, "/favicon.ico").await.starts_with("HTTP/1.1 404"));
        let ok = get(port, "/auth/callback?code=c&state=s").await;
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("close this tab") && !ok.contains("code=c"));
        let cb = h.await.unwrap().unwrap();
        assert_eq!((cb.code.as_deref(), cb.state.as_deref()), (Some("c"), Some("s")));
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_err(), "listener closes after one callback");
    }
    #[tokio::test] async fn loopback_timeout_and_cancel() {
        let cancel = tokio::sync::Notify::new();
        assert_eq!(Loopback::bind(0).await.unwrap().wait(Duration::from_millis(50), &cancel).await, Err(LoginError::Timeout));
        let cancel = std::sync::Arc::new(tokio::sync::Notify::new()); let c2 = cancel.clone();
        let h = tokio::spawn(async move { Loopback::bind(0).await.unwrap().wait(Duration::from_secs(5), &c2).await });
        tokio::time::sleep(Duration::from_millis(100)).await; cancel.notify_one();
        assert_eq!(h.await.unwrap(), Err(LoginError::Cancelled));
    }
}
