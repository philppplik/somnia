use crate::*;
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Url,
};
use std::{fmt, time::Duration};

/// Deliberately not Clone/Serialize. Never logged; Debug is redacted.
pub struct Secret(String);
impl Secret {
    pub fn new(value: String) -> Self {
        Self(value)
    }
}
impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}
/// Explicit OpenAI-compatible transport; no env lookup, proxy, redirects or fallback.
pub struct HttpModel {
    config: ModelConfig,
    endpoint: Url,
    client: reqwest::Client,
    propose: bool,
}
impl HttpModel {
    /// `propose_effects = false` is the read-only smoke mode.
    pub fn new(
        config: ModelConfig,
        credential: Option<Secret>,
        propose_effects: bool,
    ) -> Result<Self, Failure> {
        let endpoint = Url::parse(config.endpoint()).map_err(|_| Failure::InvalidRequest)?;
        if !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
        {
            return Err(Failure::InvalidRequest);
        }
        let local = matches!(config, ModelConfig::Local { .. });
        if local {
            // Numeric loopback only, no DNS rebinding or ambiguous localhost.
            if !matches!(endpoint.host_str(), Some("127.0.0.1" | "[::1]"))
                || endpoint.scheme() != "http"
                || credential.is_some()
            {
                return Err(Failure::InvalidRequest);
            }
        } else if endpoint.scheme() != "https" || credential.is_none() {
            return Err(Failure::InvalidRequest);
        }
        if config.model().is_empty() {
            return Err(Failure::InvalidRequest);
        }
        let mut headers = HeaderMap::new();
        if let Some(secret) = credential {
            let mut header = HeaderValue::from_str(&format!("Bearer {}", secret.0))
                .map_err(|_| Failure::InvalidRequest)?;
            header.set_sensitive(true);
            headers.insert(AUTHORIZATION, header);
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(120))
            .default_headers(headers)
            .build()
            .map_err(|_| Failure::Model)?;
        Ok(Self {
            config,
            endpoint,
            client,
            propose: propose_effects,
        })
    }
}
#[async_trait]
impl ModelTransport for HttpModel {
    async fn complete(&self, input: ModelInput) -> Result<ModelReply, Failure> {
        if input.config.model() != self.config.model()
            || input.config.endpoint() != self.config.endpoint()
            || std::mem::discriminant(&input.config) != std::mem::discriminant(&self.config)
        {
            return Err(Failure::InvalidRequest);
        }
        let mut body = serde_json::json!({"model": self.config.model(), "messages": input.messages, "stream": false, "max_tokens": 2048});
        if self.propose {
            body["tools"] = serde_json::json!([{"type":"function","function":{"name":"somnia_propose_effect","description":"Propose one effect to the Somnia host. This never grants execution permission.","parameters":{"type":"object","properties":{"name":{"type":"string"},"arguments":{"type":"object"}},"required":["name","arguments"],"additionalProperties":false}}}]);
            body["parallel_tool_calls"] = serde_json::json!(false);
        }
        let response = self
            .client
            .post(self.endpoint.clone())
            .json(&body)
            .send()
            .await
            .map_err(|_| Failure::Model)?;
        if !response.status().is_success() {
            return Err(Failure::Model);
        }
        // Enforce response cap while reading, not after allocating an arbitrary body.
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Model)? {
            if bytes.len() + chunk.len() > 262144 {
                return Err(Failure::Model);
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| Failure::Model)?;
        let message = value.pointer("/choices/0/message").ok_or(Failure::Model)?;
        let text = message
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let calls = message.get("tool_calls").and_then(|v| v.as_array());
        let tool = if let Some(calls) = calls.filter(|v| !v.is_empty()) {
            if !self.propose || calls.len() != 1 {
                return Err(Failure::Model);
            }
            let call = &calls[0];
            if call.pointer("/function/name").and_then(|v| v.as_str())
                != Some("somnia_propose_effect")
            {
                return Err(Failure::Model);
            }
            let args: serde_json::Value = serde_json::from_str(
                call.pointer("/function/arguments")
                    .and_then(|v| v.as_str())
                    .ok_or(Failure::Model)?,
            )
            .map_err(|_| Failure::Model)?;
            Some(ToolProposal {
                call_id: call
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or(Failure::Model)?
                    .into(),
                name: args
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or(Failure::Model)?
                    .into(),
                arguments: args
                    .get("arguments")
                    .filter(|v| v.is_object())
                    .ok_or(Failure::Model)?
                    .clone(),
            })
        } else {
            None
        };
        Ok(ModelReply {
            message: text,
            tool,
            usage: Usage {
                input_tokens: value
                    .pointer("/usage/prompt_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                output_tokens: value
                    .pointer("/usage/completion_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
            },
        })
    }
}
