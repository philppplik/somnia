//! Local model inventory and readiness (Ollama / LM Studio). Read-only: this module never
//! downloads, pulls or starts anything; it only reports and gives the user a manual hint.
use crate::provider::ProviderKind;
use crate::Failure;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

/// The single local trial model (D11). No other local model is recommended.
pub const TRIAL_MODEL_OLLAMA: &str = "qwen3.5:9b";
pub const TRIAL_MODEL_DISPLAY: &str = "Qwen3.5-9B";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LocalModel {
    pub id: String,
    pub size_bytes: Option<u64>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Readiness {
    /// Server not reachable on loopback.
    ServerDown { setup_hint: String },
    /// Server up, trial model absent.
    ModelMissing { setup_hint: String, installed: Vec<LocalModel> },
    Ready { model_id: String, installed: Vec<LocalModel> },
}

pub fn parse_ollama_tags(v: &Value) -> Result<Vec<LocalModel>, Failure> {
    let list = v.get("models").and_then(|m| m.as_array()).ok_or(Failure::Model)?;
    list.iter()
        .map(|m| {
            Ok(LocalModel {
                id: m.get("name").and_then(|n| n.as_str()).filter(|n| !n.is_empty()).ok_or(Failure::Model)?.to_string(),
                size_bytes: m.get("size").and_then(|s| s.as_u64()),
            })
        })
        .collect()
}
pub fn parse_lmstudio_models(v: &Value) -> Result<Vec<LocalModel>, Failure> {
    let list = v.get("data").and_then(|m| m.as_array()).ok_or(Failure::Model)?;
    list.iter()
        .map(|m| {
            Ok(LocalModel {
                id: m.get("id").and_then(|n| n.as_str()).filter(|n| !n.is_empty()).ok_or(Failure::Model)?.to_string(),
                size_bytes: None,
            })
        })
        .collect()
}
fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.').collect()
}
/// "qwen3.5:9b", "qwen3.5-9b", "Qwen3.5-9B-Instruct-GGUF" all count; "qwen3.5:90b" does not.
pub fn is_trial_model(id: &str) -> bool {
    let n = norm(id);
    n.find("qwen3.5").is_some_and(|i| {
        let rest = &n[i + 7..];
        rest.starts_with("9b") && !rest[2..].starts_with(|c: char| c.is_ascii_digit())
    })
}
pub fn setup_hint(kind: ProviderKind, server_up: bool) -> String {
    match (kind, server_up) {
        (ProviderKind::Ollama, false) => "Install and start Ollama, then run: ollama pull qwen3.5:9b".into(),
        (ProviderKind::Ollama, true) => "Run: ollama pull qwen3.5:9b (about 6 GB; nothing is downloaded automatically)".into(),
        (_, false) => "Start the LM Studio local server, then load Qwen3.5-9B".into(),
        (_, true) => "In LM Studio, download and load Qwen3.5-9B (nothing is downloaded automatically)".into(),
    }
}
pub fn readiness(kind: ProviderKind, installed: Option<Vec<LocalModel>>) -> Readiness {
    match installed {
        None => Readiness::ServerDown { setup_hint: setup_hint(kind, false) },
        Some(list) => match list.iter().find(|m| is_trial_model(&m.id)).map(|m| m.id.clone()) {
            Some(model_id) => Readiness::Ready { model_id, installed: list },
            None => Readiness::ModelMissing { setup_hint: setup_hint(kind, true), installed: list },
        },
    }
}
/// Loopback-only probe. `base` must be `http://127.0.0.1:<port>` or `[::1]`. Returns
/// `Ok(None)` when nothing is listening.
pub async fn probe(kind: ProviderKind, base: &str) -> Result<Option<Vec<LocalModel>>, Failure> {
    if !kind.is_local() {
        return Err(Failure::InvalidRequest);
    }
    let url = reqwest::Url::parse(base).map_err(|_| Failure::InvalidRequest)?;
    if url.scheme() != "http" || !matches!(url.host_str(), Some("127.0.0.1" | "[::1]")) {
        return Err(Failure::InvalidRequest);
    }
    let path = if kind == ProviderKind::Ollama { "/api/tags" } else { "/v1/models" };
    let url = url.join(path).map_err(|_| Failure::InvalidRequest)?;
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(3)).build().map_err(|_| Failure::Model)?;
    let resp = match client.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !resp.status().is_success() {
        return Err(Failure::Model);
    }
    let bytes = resp.bytes().await.map_err(|_| Failure::Model)?;
    if bytes.len() > 1 << 20 {
        return Err(Failure::Model);
    }
    let v: Value = serde_json::from_slice(&bytes).map_err(|_| Failure::Model)?;
    Ok(Some(if kind == ProviderKind::Ollama { parse_ollama_tags(&v)? } else { parse_lmstudio_models(&v)? }))
}
