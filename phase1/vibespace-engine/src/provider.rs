//! Provider adapters for the Vibespace transport (A10).
//!
//! Pure request/response codecs plus a loopback/https `ProviderModel`. Credentials are
//! passed in as `Secret` by the host (existing vault/auth route); there is no env lookup,
//! no proxy, no redirect and no silent fallback between providers.
use crate::transport::parse_openai_reply;
use crate::*;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION},
    Url,
};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderKind {
    Ollama,
    LmStudio,
    OpenAi,
    OpenRouter,
    Anthropic,
    Xai,
    Meta,
    DeepSeek,
}
impl ProviderKind {
    pub fn is_local(self) -> bool {
        matches!(self, Self::Ollama | Self::LmStudio)
    }
    pub fn default_endpoint(self) -> &'static str {
        match self {
            Self::Ollama => "http://127.0.0.1:11434/v1/chat/completions",
            Self::LmStudio => "http://127.0.0.1:1234/v1/chat/completions",
            Self::OpenAi => "https://api.openai.com/v1/chat/completions",
            Self::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
            Self::Anthropic => "https://api.anthropic.com/v1/messages",
            Self::Xai => "https://api.x.ai/v1/chat/completions",
            Self::Meta => "https://api.meta.ai/v1/chat/completions",
            Self::DeepSeek => "https://api.deepseek.com/chat/completions",
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
            Self::LmStudio => "lmstudio",
            Self::OpenAi => "openai",
            Self::OpenRouter => "openrouter",
            Self::Anthropic => "anthropic",
            Self::Xai => "xai",
            Self::Meta => "meta",
            Self::DeepSeek => "deepseek",
        }
    }
}

const PROPOSE: &str = "somnia_propose_effect";
fn propose_schema() -> Value {
    json!({"type":"object","properties":{"name":{"type":"string"},"arguments":{"type":"object"}},"required":["name","arguments"],"additionalProperties":false})
}

/// Build the provider-specific JSON body. Never contains credentials.
pub fn encode_request(
    kind: ProviderKind,
    model: &str,
    messages: &[ModelMessage],
    propose: bool,
) -> Value {
    if kind != ProviderKind::Anthropic {
        let mut body = json!({"model": model, "messages": messages, "stream": false, "max_tokens": 2048});
        if propose {
            body["tools"] = json!([{"type":"function","function":{"name":PROPOSE,"description":"Propose one effect to the Somnia host. This never grants execution permission.","parameters":propose_schema()}}]);
            body["parallel_tool_calls"] = json!(false);
        }
        return body;
    }
    let mut system = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => system.push(m.content.clone()),
            "tool" => out.push(json!({"role":"user","content":[{"type":"tool_result","tool_use_id":m.tool_call_id.clone().unwrap_or_default(),"content":m.content}]})),
            "assistant" if m.tool_calls.is_some() => {
                let mut blocks = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({"type":"text","text":m.content}));
                }
                for c in m.tool_calls.as_ref().and_then(|v| v.as_array()).into_iter().flatten() {
                    let args = c.pointer("/function/arguments").and_then(|v| v.as_str()).and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or(json!({}));
                    blocks.push(json!({"type":"tool_use","id":c.get("id").cloned().unwrap_or(Value::Null),"name":PROPOSE,"input":args}));
                }
                out.push(json!({"role":"assistant","content":blocks}));
            }
            role => out.push(json!({"role": if role == "assistant" {"assistant"} else {"user"}, "content": m.content})),
        }
    }
    let mut body = json!({"model": model, "messages": out, "max_tokens": 2048});
    if !system.is_empty() {
        body["system"] = json!(system.join("\n\n"));
    }
    if propose {
        body["tools"] = json!([{"name":PROPOSE,"description":"Propose one effect to the Somnia host. This never grants execution permission.","input_schema":propose_schema()}]);
        body["tool_choice"] = json!({"type":"auto","disable_parallel_tool_use":true});
    }
    body
}

/// Parse a provider reply into the engine's strict `ModelReply`. Malformed, empty or
/// over-permissive replies fail visibly (`Failure::Model`).
pub fn decode_response(kind: ProviderKind, value: &Value, propose: bool) -> Result<ModelReply, Failure> {
    if kind != ProviderKind::Anthropic {
        let mut reply = parse_openai_reply(value, propose)?;
        if kind == ProviderKind::OpenRouter {
            // Cost is copied only when the response reports a sane number; never computed.
            if let Some(c) = value.pointer("/usage/cost").and_then(|v| v.as_f64()).filter(|c| c.is_finite() && *c >= 0.0) {
                reply.usage.cost_usd = Some(c);
                reply.usage.cost_source = Some(CostSource::ProviderReported);
            }
        }
        return Ok(reply);
    }
    let blocks = value.get("content").and_then(|v| v.as_array()).ok_or(Failure::Model)?;
    let mut text = String::new();
    let mut tool = None;
    for b in blocks {
        match b.get("type").and_then(|v| v.as_str()) {
            Some("text") => text.push_str(b.get("text").and_then(|v| v.as_str()).ok_or(Failure::Model)?),
            Some("tool_use") => {
                if !propose || tool.is_some() || b.get("name").and_then(|v| v.as_str()) != Some(PROPOSE) {
                    return Err(Failure::Model);
                }
                let input = b.get("input").and_then(|v| v.as_object()).ok_or(Failure::Model)?;
                if input.len() != 2 {
                    return Err(Failure::Model);
                }
                let name = input.get("name").and_then(|v| v.as_str()).ok_or(Failure::Model)?;
                let arguments = input.get("arguments").filter(|v| v.is_object()).ok_or(Failure::Model)?;
                let id = b.get("id").and_then(|v| v.as_str()).ok_or(Failure::Model)?;
                if id.is_empty() || name.is_empty() {
                    return Err(Failure::Model);
                }
                tool = Some(ToolProposal { call_id: id.into(), name: name.into(), arguments: arguments.clone() });
            }
            _ => return Err(Failure::Model),
        }
    }
    if tool.is_none() && text.trim().is_empty() {
        return Err(Failure::Model);
    }
    let n = |p: &str| value.pointer(p).and_then(|v| v.as_u64()).unwrap_or(0);
    let opt = |p: &str| value.pointer(p).and_then(|v| v.as_u64());
    Ok(ModelReply { message: text, tool, usage: Usage { input_tokens: n("/usage/input_tokens"), output_tokens: n("/usage/output_tokens"), cache_read_tokens: opt("/usage/cache_read_input_tokens"), cache_write_tokens: opt("/usage/cache_creation_input_tokens"), ..Usage::default() } })
}

/// Transport for any supported provider. Local kinds: numeric loopback http, no credential.
/// Remote kinds: https plus credential required.
pub struct ProviderModel {
    kind: ProviderKind,
    config: ModelConfig,
    endpoint: Url,
    client: reqwest::Client,
    propose: bool,
}
impl ProviderModel {
    pub fn new(kind: ProviderKind, endpoint: Option<&str>, model: &str, credential: Option<Secret>, propose: bool) -> Result<Self, Failure> {
        let endpoint_s = endpoint.unwrap_or(kind.default_endpoint()).to_string();
        let config = if kind.is_local() {
            ModelConfig::Local { endpoint: endpoint_s.clone(), model: model.into() }
        } else {
            ModelConfig::Byok { endpoint: endpoint_s.clone(), model: model.into() }
        };
        let url = Url::parse(&endpoint_s).map_err(|_| Failure::InvalidRequest)?;
        if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || model.is_empty() {
            return Err(Failure::InvalidRequest);
        }
        if kind.is_local() {
            if !matches!(url.host_str(), Some("127.0.0.1" | "[::1]")) || url.scheme() != "http" || credential.is_some() {
                return Err(Failure::InvalidRequest);
            }
        } else if url.scheme() != "https" || credential.is_none() {
            return Err(Failure::InvalidRequest);
        }
        let mut headers = HeaderMap::new();
        if let Some(secret) = credential {
            let (name, value) = if kind == ProviderKind::Anthropic {
                (HeaderName::from_static("x-api-key"), secret.expose())
            } else {
                (AUTHORIZATION, format!("Bearer {}", secret.expose()))
            };
            let mut h = HeaderValue::from_str(&value).map_err(|_| Failure::InvalidRequest)?;
            h.set_sensitive(true);
            headers.insert(name, h);
        }
        if kind == ProviderKind::Anthropic {
            headers.insert(HeaderName::from_static("anthropic-version"), HeaderValue::from_static("2023-06-01"));
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(120))
            .default_headers(headers)
            .build()
            .map_err(|_| Failure::Model)?;
        Ok(Self { kind, config, endpoint: url, client, propose })
    }
    pub fn kind(&self) -> ProviderKind {
        self.kind
    }
}
#[async_trait]
impl ModelTransport for ProviderModel {
    async fn complete(&self, input: ModelInput) -> Result<ModelReply, Failure> {
        if input.config.model() != self.config.model() || input.config.endpoint() != self.config.endpoint() || std::mem::discriminant(&input.config) != std::mem::discriminant(&self.config) {
            return Err(Failure::InvalidRequest);
        }
        let body = encode_request(self.kind, self.config.model(), &input.messages, self.propose);
        let mut response = self.client.post(self.endpoint.clone()).json(&body).send().await.map_err(|_| Failure::Model)?;
        if !response.status().is_success() {
            return Err(Failure::Model); // never surface the provider body
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Model)? {
            if bytes.len() + chunk.len() > 262144 {
                return Err(Failure::Model);
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| Failure::Model)?;
        decode_response(self.kind, &value, self.propose)
    }
}
