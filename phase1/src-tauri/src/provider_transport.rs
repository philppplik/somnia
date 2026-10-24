//! Fixed provider endpoints only. No renderer-selected host, credentials, redirects or proxy.
pub fn endpoint(provider: &str, url: &str, method: &str) -> Result<(), String> {
    let ok = match (provider, method) {
        ("openrouter", "POST") => url == "https://openrouter.ai/api/v1/chat/completions",
        ("openrouter", "GET") => url == "https://openrouter.ai/api/v1/key" || url == "https://openrouter.ai/api/v1/models",
        ("openai", "POST") => url == "https://api.openai.com/v1/chat/completions" || url == "https://api.openai.com/v1/responses",
        // Sign in with ChatGPT: fixed-host token endpoint only (code exchange and refresh). No revocation endpoint is allow-listed; logout deletes locally.
        ("openai-account", "POST") => url == "https://auth.openai.com/api/accounts/oauth/token",
        ("openai", "GET") => url == "https://api.openai.com/v1/models",
        // xAI, Meta Model API and DeepSeek: OpenAI-compatible Chat Completions plus the model list. Fixed routes, no query strings.
        ("xai", "POST") => url == "https://api.x.ai/v1/chat/completions" || url == "https://api.x.ai/v1/responses",
        ("xai", "GET") => url == "https://api.x.ai/v1/models",
        ("meta", "POST") => url == "https://api.meta.ai/v1/chat/completions" || url == "https://api.meta.ai/v1/responses",
        ("meta", "GET") => url == "https://api.meta.ai/v1/models",
        ("deepseek", "POST") => url == "https://api.deepseek.com/chat/completions",
        ("deepseek", "GET") => url == "https://api.deepseek.com/models",
        ("claude", "POST") => url == "https://api.anthropic.com/v1/messages",
        ("claude", "GET") => {
            if url == "https://api.anthropic.com/v1/models" { true }
            else if let Some(query) = url.strip_prefix("https://api.anthropic.com/v1/models?") {
                let mut seen = std::collections::HashSet::new();
                query.split('&').all(|part| {
                    let Some((k,v)) = part.split_once('=') else { return false; };
                    if !seen.insert(k) { return false; }
                    match k { "limit" => matches!(v.parse::<u32>(), Ok(1..=1000)), "after_id" => !v.is_empty() && v.len()<200 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b==b'_' || b==b'-'), _=>false }
                })
            } else { false }
        },
        _ => false,
    };
    if ok { Ok(()) } else { Err("Provider endpoint is not allowed".into()) }
}
#[cfg(test)] mod tests {
 use super::*;
 #[test] fn responses_stay_vendor_scoped() {
  for (provider, host) in [("xai", "api.x.ai"), ("meta", "api.meta.ai")] {
   assert!(endpoint(provider, &format!("https://{host}/v1/responses"), "POST").is_ok());
   assert!(endpoint(provider, &format!("https://{host}/v1/responses"), "GET").is_err());
   assert!(endpoint(provider, &format!("https://{host}/v1/responses?store=true"), "POST").is_err());
   assert!(endpoint(provider, "https://api.openai.com/v1/responses", "POST").is_err());
  }
 }
 #[test] fn fixed_hosts_and_routes_only() {
  assert!(endpoint("claude","https://api.anthropic.com/v1/models?limit=100&after_id=model_123","GET").is_ok());
  for url in ["http://api.anthropic.com/v1/models","https://api.anthropic.com.evil/v1/models","https://user@api.anthropic.com/v1/models","https://api.anthropic.com/v1/models?other=x","https://api.anthropic.com/v1/models?limit=1&limit=2"] {assert!(endpoint("claude",url,"GET").is_err());}
  assert!(endpoint("openai","https://api.openai.com/v1/models","POST").is_err());
  for (p,chat,models) in [("xai","https://api.x.ai/v1/chat/completions","https://api.x.ai/v1/models"),("meta","https://api.meta.ai/v1/chat/completions","https://api.meta.ai/v1/models"),("deepseek","https://api.deepseek.com/chat/completions","https://api.deepseek.com/models")] {
   assert!(endpoint(p,chat,"POST").is_ok()); assert!(endpoint(p,models,"GET").is_ok());
   assert!(endpoint(p,models,"POST").is_err()); assert!(endpoint(p,chat,"GET").is_err());
   assert!(endpoint(p,&format!("{chat}?x=1"),"POST").is_err()); assert!(endpoint(p,&chat.replace("https://","http://"),"POST").is_err());
   assert!(endpoint(p,&chat.replacen(".com",".com.evil",1).replacen(".ai",".ai.evil",1),"POST").is_err());
  }
  // A key slot never reaches another vendor's host.
  assert!(endpoint("xai","https://api.deepseek.com/chat/completions","POST").is_err());
  assert!(endpoint("deepseek","https://api.x.ai/v1/models","GET").is_err());
  assert!(endpoint("openai","https://api.openai.com/v1/responses","POST").is_ok());
  assert!(endpoint("openai","https://api.openai.com/v1/responses?x=1","POST").is_err());
  assert!(endpoint("openai-account","https://auth.openai.com/api/accounts/oauth/token","POST").is_ok());
  assert!(endpoint("openai-account","https://auth.openai.com.evil/api/accounts/oauth/token","POST").is_err());
  assert!(endpoint("openai-account","https://auth.openai.com/api/accounts/oauth/token","GET").is_err());
 }
}
