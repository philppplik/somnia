//! Fixed provider endpoints only. No renderer-selected host, credentials, redirects or proxy.
pub fn endpoint(provider: &str, url: &str, method: &str) -> Result<(), String> {
    let ok = match (provider, method) {
        ("openrouter", "POST") => url == "https://openrouter.ai/api/v1/chat/completions",
        ("openrouter", "GET") => url == "https://openrouter.ai/api/v1/key" || url == "https://openrouter.ai/api/v1/models",
        ("openai", "POST") => url == "https://api.openai.com/v1/chat/completions" || url == "https://api.openai.com/v1/responses",
        // Sign in with ChatGPT: fixed-host token endpoint only (code exchange and refresh). No revocation endpoint is allow-listed; logout deletes locally.
        ("openai-account", "POST") => url == "https://auth.openai.com/api/accounts/oauth/token",
        ("openai", "GET") => url == "https://api.openai.com/v1/models",
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
 #[test] fn fixed_hosts_and_routes_only() {
  assert!(endpoint("claude","https://api.anthropic.com/v1/models?limit=100&after_id=model_123","GET").is_ok());
  for url in ["http://api.anthropic.com/v1/models","https://api.anthropic.com.evil/v1/models","https://user@api.anthropic.com/v1/models","https://api.anthropic.com/v1/models?other=x","https://api.anthropic.com/v1/models?limit=1&limit=2"] {assert!(endpoint("claude",url,"GET").is_err());}
  assert!(endpoint("openai","https://api.openai.com/v1/models","POST").is_err());
  assert!(endpoint("openai","https://api.openai.com/v1/responses","POST").is_ok());
  assert!(endpoint("openai","https://api.openai.com/v1/responses?x=1","POST").is_err());
  assert!(endpoint("openai-account","https://auth.openai.com/api/accounts/oauth/token","POST").is_ok());
  assert!(endpoint("openai-account","https://auth.openai.com.evil/api/accounts/oauth/token","POST").is_err());
  assert!(endpoint("openai-account","https://auth.openai.com/api/accounts/oauth/token","GET").is_err());
 }
}
