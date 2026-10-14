use crate::*;
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Url,
};
use std::{fmt, time::Duration};

/// Deliberately not Clone/Serialize. Never logged; Debug is redacted.
pub struct Secret(String);
impl Secret {
    pub(crate) fn expose(&self) -> String {
        self.0.clone()
    }
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
    request_guard:Option<std::sync::Arc<dyn Fn()->std::pin::Pin<Box<dyn std::future::Future<Output=bool>+Send>>+Send+Sync>>,
    cloud_guard: Option<std::sync::Arc<dyn Fn()->bool+Send+Sync>>,
}
impl HttpModel {
    /// Fresh host evidence immediately before each model request, never a cached chooser label.
    pub fn with_request_guard(mut self,guard:std::sync::Arc<dyn Fn()->std::pin::Pin<Box<dyn std::future::Future<Output=bool>+Send>>+Send+Sync>)->Self{self.request_guard=Some(guard);self}
    /// Host-owned live policy, checked before each request and while awaiting response.
    pub fn with_cloud_guard(mut self, guard:std::sync::Arc<dyn Fn()->bool+Send+Sync>)->Self{self.cloud_guard=Some(guard);self}
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
            cloud_guard:None,
            request_guard:None,
        })
    }
}
#[async_trait]
impl ModelTransport for HttpModel {
    async fn complete(&self, input: ModelInput) -> Result<ModelReply, Failure> {
        if let Some(guard)=&self.cloud_guard {
                if !guard(){return Err(Failure::InvalidRequest);}
                let response=self.complete_checked(input);tokio::pin!(response);
                let mut interval=tokio::time::interval(Duration::from_millis(25));
                loop{tokio::select!{result=&mut response=>{if !guard(){return Err(Failure::InvalidRequest);}return result;},_=interval.tick()=>{if !guard(){return Err(Failure::InvalidRequest);}}}}
        }
        self.complete_checked(input).await
    }
}
impl HttpModel {
    async fn complete_checked(&self,input:ModelInput)->Result<ModelReply,Failure>{
        if let Some(guard)=&self.request_guard{if !guard().await{return Err(Failure::InvalidRequest);}}
        if self.cloud_guard.as_ref().is_some_and(|guard|!guard()){return Err(Failure::InvalidRequest);}
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
        parse_openai_reply(&value, self.propose)
    }
}

/// Shared OpenAI-compatible reply parser (also used by provider adapters).
pub(crate) fn parse_openai_reply(value: &serde_json::Value, propose: bool) -> Result<ModelReply, Failure> {
    let message = value.pointer("/choices/0/message").ok_or(Failure::Model)?;
    if !message.is_object() {
        return Err(Failure::Model);
    }
    if message
        .get("content")
        .is_some_and(|content| !content.is_null() && !content.is_string())
        || message
            .get("tool_calls")
            .is_some_and(|calls| !calls.is_null() && !calls.is_array())
    {
        return Err(Failure::Model);
    }
    let text = message
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let calls = message.get("tool_calls").and_then(|v| v.as_array());
    let tool = if let Some(calls) = calls.filter(|v| !v.is_empty()) {
        if !propose || calls.len() != 1 {
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
        let object = args.as_object().ok_or(Failure::Model)?;
        if object.len() != 2
            || !object.contains_key("name")
            || !object.contains_key("arguments")
        {
            return Err(Failure::Model);
        }
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
    // A malformed or empty response cannot become a successful agent run.
    if tool.is_none() && text.trim().is_empty() {
        return Err(Failure::Model);
    }
    if tool
        .as_ref()
        .is_some_and(|tool| tool.call_id.is_empty() || tool.name.is_empty())
    {
        return Err(Failure::Model);
    }
    Ok(ModelReply {
        message: text,
        tool,
        usage: Usage {
            tokens_unknown: ["/usage/prompt_tokens","/usage/completion_tokens"].iter().any(|p| value.pointer(p).and_then(|v|v.as_u64()).is_none()),
            input_tokens: value.pointer("/usage/prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            output_tokens: value.pointer("/usage/completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_read_tokens: value.pointer("/usage/prompt_tokens_details/cached_tokens").and_then(|v| v.as_u64()),
            cache_write_tokens: value.pointer("/usage/prompt_tokens_details/cache_write_tokens").and_then(|v| v.as_u64()),
            ..Usage::default()
        },
    })
}

#[cfg(test)]mod host_guard_tests{
 use super::*;
 #[tokio::test]async fn host_denial_prevents_even_loopback_request(){
  let config=ModelConfig::Local{endpoint:"http://127.0.0.1:1/v1/chat/completions".into(),model:"fixture".into()};
  let model=HttpModel::new(config.clone(),None,false).unwrap().with_cloud_guard(std::sync::Arc::new(||false));
  let input=ModelInput{config,messages:vec![]};
  assert!(matches!(model.complete(input).await,Err(Failure::InvalidRequest)));
 }
}

#[cfg(test)]mod request_guard_tests{
 use super::*;
 #[tokio::test]async fn missing_live_weight_evidence_denies_before_network(){
  let config=ModelConfig::Local{endpoint:"http://127.0.0.1:1/v1/chat/completions".into(),model:"exact:tag".into()};
  let model=HttpModel::new(config.clone(),None,false).unwrap().with_request_guard(std::sync::Arc::new(||Box::pin(async{false})));
  assert!(matches!(model.complete(ModelInput{config,messages:vec![]}).await,Err(Failure::InvalidRequest)));
 }
 #[tokio::test]async fn evidence_is_rechecked_on_each_request_not_cached(){
  let count=std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));let seen=count.clone();
  let config=ModelConfig::Local{endpoint:"http://127.0.0.1:1/v1/chat/completions".into(),model:"exact:tag".into()};
  let model=HttpModel::new(config.clone(),None,false).unwrap().with_request_guard(std::sync::Arc::new(move ||{seen.fetch_add(1,std::sync::atomic::Ordering::SeqCst);Box::pin(async{false})}));
  for _ in 0..2{assert!(matches!(model.complete(ModelInput{config:config.clone(),messages:vec![]}).await,Err(Failure::InvalidRequest)));}
  assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst),2);
 }
}

#[cfg(test)]mod request_guard_network_tests{
 use super::*;use std::io::{Read,Write};
 #[tokio::test]async fn positive_host_evidence_allows_local_request_and_is_not_reused(){
  let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
  let server=std::thread::spawn(move ||{
   let (mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
   let mut buffer=[0u8;8192];let _=stream.read(&mut buffer).unwrap();
   let body=r#"{"choices":[{"message":{"content":"local reply"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}"#;
   write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
  });
  let checks=std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));let seen=checks.clone();
  let config=ModelConfig::Local{endpoint:format!("http://{address}/v1/chat/completions"),model:"exact:tag".into()};
  let model=HttpModel::new(config.clone(),None,false).unwrap().with_request_guard(std::sync::Arc::new(move ||{let first=seen.fetch_add(1,std::sync::atomic::Ordering::SeqCst)==0;Box::pin(async move{first})}));
  let reply=model.complete(ModelInput{config:config.clone(),messages:vec![]}).await.unwrap();assert_eq!(reply.message,"local reply");
  assert!(matches!(model.complete(ModelInput{config,messages:vec![]}).await,Err(Failure::InvalidRequest)));assert_eq!(checks.load(std::sync::atomic::Ordering::SeqCst),2);server.join().unwrap();
 }
}
