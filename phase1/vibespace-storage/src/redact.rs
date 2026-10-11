//! Best-effort redaction and bounding of event payloads before they are persisted.
//! Redaction is by key name and by well-known secret shapes in string values.
//! It is a safety net, not a guarantee: callers must still not put secrets in events.

use serde_json::{Map, Value};

pub const REDACTED: &str = "[redacted]";
const MAX_DEPTH: usize = 16;
const PREVIEW_CHARS: usize = 512;

const SENSITIVE_KEYS: &[&str] = &[
    "apikey",
    "accesskey",
    "token",
    "secret",
    "password",
    "passwd",
    "passphrase",
    "authorization",
    "credential",
    "cookie",
    "privatekey",
    "bearer",
    "sessionid",
    "clientsecret",
];

fn key_is_sensitive(key: &str) -> bool {
    let k: String = key
        .chars()
        .filter(|c| *c != '_' && *c != '-')
        .collect::<String>()
        .to_lowercase();
    SENSITIVE_KEYS.iter().any(|s| k.contains(s))
}

/// True when a single string looks like a credential.
pub fn string_looks_secret(s: &str) -> bool {
    let t = s.trim();
    let lower = t.to_lowercase();
    if lower.starts_with("bearer ") && t.len() > 12 {
        return true;
    }
    if lower.contains("-----begin") && lower.contains("private key") {
        return true;
    }
    for p in [
        "sk-",
        "ghp_",
        "gho_",
        "ghs_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
        "xoxa-",
        "sk_live_",
        "rk_live_",
    ] {
        if t.starts_with(p) && t.len() >= 16 {
            return true;
        }
    }
    if t.len() == 20
        && t.starts_with("AKIA")
        && t.chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return true;
    }
    false
}

/// True when any whitespace-separated token of `text` looks like a credential.
pub fn text_contains_secret(text: &str) -> bool {
    text.split_whitespace().any(string_looks_secret)
}

fn redact_value(v: &Value, depth: usize) -> Value {
    if depth > MAX_DEPTH {
        return Value::String("[depth-limit]".to_string());
    }
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, val) in m {
                // Numbers/bools are never secrets (keeps `inputTokens` usable).
                let scalar_safe = matches!(val, Value::Number(_) | Value::Bool(_) | Value::Null);
                if key_is_sensitive(k) && !scalar_safe {
                    out.insert(k.clone(), Value::String(REDACTED.to_string()));
                } else {
                    out.insert(k.clone(), redact_value(val, depth + 1));
                }
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(|x| redact_value(x, depth + 1)).collect()),
        Value::String(s) => {
            if string_looks_secret(s) {
                Value::String(REDACTED.to_string())
            } else {
                Value::String(s.clone())
            }
        }
        other => other.clone(),
    }
}

/// Redact, then bound to `max_bytes` of serialized JSON. Returns (payload, truncated).
pub fn sanitize_payload(v: &Value, max_bytes: usize) -> (Value, bool) {
    let redacted = redact_value(v, 0);
    let text = redacted.to_string();
    if text.len() <= max_bytes {
        return (redacted, false);
    }
    let preview: String = text.chars().take(PREVIEW_CHARS).collect();
    let mut m = Map::new();
    m.insert("truncated".to_string(), Value::Bool(true));
    m.insert("originalBytes".to_string(), Value::from(text.len() as u64));
    m.insert("preview".to_string(), Value::String(preview));
    (Value::Object(m), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn redacts_keys_and_shapes() {
        let v = json!({"apiKey":"abc","nested":{"Authorization":"Bearer abcdefghijkl","ok":"hello"},"inputTokens":5,"list":["sk-abcdefghijklmnopqrstuvwxyz","fine"]});
        let (o, t) = sanitize_payload(&v, 4096);
        assert!(!t);
        assert_eq!(o["apiKey"], REDACTED);
        assert_eq!(o["nested"]["Authorization"], REDACTED);
        assert_eq!(o["nested"]["ok"], "hello");
        assert_eq!(o["inputTokens"], 5);
        assert_eq!(o["list"][0], REDACTED);
        assert_eq!(o["list"][1], "fine");
    }
    #[test]
    fn truncates_large_payloads_on_char_boundary() {
        let v = json!({"text":"ä".repeat(10_000)});
        let (o, t) = sanitize_payload(&v, 1024);
        assert!(t);
        assert_eq!(o["truncated"], true);
        assert!(o["preview"].as_str().unwrap().chars().count() <= PREVIEW_CHARS);
    }
}
