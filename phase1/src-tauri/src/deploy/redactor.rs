//! Redact before logs, diagnostics or IPC. Never format underlying transport errors.
use regex::Regex;
use std::sync::LazyLock;
use zeroize::Zeroizing;
static PRIVATE_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)")
        .unwrap()
});
static CREDENTIAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:[A-Z0-9_]*(?:secret|token|password|passwd|passphrase|api[_-]?key|credential)[A-Z0-9_]*|authorization)\s*[:=]\s*[^\r\n]+").unwrap()
});
static BEARER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*").unwrap());
static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)").unwrap()
});
static URL_AUTH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(https?://)[^/\s@]+@").unwrap());
pub struct Redactor {
    secrets: Vec<Zeroizing<String>>,
}
impl Default for Redactor {
    fn default() -> Self {
        Self {
            secrets: Vec::new(),
        }
    }
}
impl std::fmt::Debug for Redactor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Redactor([REDACTED])")
    }
}
impl Redactor {
    pub fn new(secrets: impl IntoIterator<Item = String>) -> Self {
        let mut secrets: Vec<_> = secrets
            .into_iter()
            .filter(|s| !s.is_empty())
            .map(Zeroizing::new)
            .collect();
        secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
        Self { secrets }
    }
    /// Include every value of shared/.env, not only variables with secret-like names.
    pub fn with_env(mut self, env: &str) -> Self {
        for line in env.lines() {
            let line = line.trim().strip_prefix("export ").unwrap_or(line.trim());
            if line.starts_with('#') {
                continue;
            }
            if let Some((_, v)) = line.split_once('=') {
                let v = v.trim().trim_matches(['\'', '"']);
                if !v.is_empty() {
                    self.secrets.push(Zeroizing::new(v.to_owned()));
                }
            }
        }
        self.secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
        self
    }
    pub fn redact(&self, input: &str) -> String {
        // Unknown multiline secret material is removed wholesale.
        let mut text = PRIVATE_BLOCK
            .replace_all(input, "[REDACTED PRIVATE KEY]")
            .into_owned();
        for secret in &self.secrets {
            text = text.replace(secret.as_str(), "[REDACTED]");
        }
        text = CREDENTIAL
            .replace_all(&text, "[REDACTED CREDENTIAL]")
            .into_owned();
        text = BEARER.replace_all(&text, "Bearer [REDACTED]").into_owned();
        text = TOKEN.replace_all(&text, "[REDACTED TOKEN]").into_owned();
        text = URL_AUTH.replace_all(&text, "${1}[REDACTED]@").into_owned();
        text.chars()
            .filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
            .take(64 * 1024)
            .collect()
    }
}
/// A line/chunk collector holds incomplete lines and private-key blocks across reads.
/// Full buffers are dropped rather than exposing a partial secret.
pub struct RedactedLog {
    redactor: Redactor,
    pending: Zeroizing<String>,
    in_key: bool,
}
impl RedactedLog {
    pub fn new(redactor: Redactor) -> Self {
        Self {
            redactor,
            pending: Zeroizing::new(String::new()),
            in_key: false,
        }
    }
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.pending.push_str(chunk);
        if self.pending.len() > 1024 * 1024 {
            self.pending.clear();
            self.in_key = true;
            return vec!["[REDACTED oversized output]".into()];
        }
        let mut out = Vec::new();
        while let Some(end) = self.pending.find('\n') {
            let line = self.pending[..end].to_owned();
            self.pending.drain(..=end);
            self.line(&line, &mut out);
        }
        out
    }
    fn line(&mut self, line: &str, out: &mut Vec<String>) {
        if line.contains("-----BEGIN ") && line.contains("PRIVATE KEY-----") {
            self.in_key = true;
            out.push("[REDACTED PRIVATE KEY]".into());
        }
        if self.in_key {
            if line.contains("-----END ") && line.contains("PRIVATE KEY-----") {
                self.in_key = false;
            }
            return;
        }
        out.push(self.redactor.redact(line));
    }
    pub fn finish(&mut self) -> Vec<String> {
        let line = std::mem::take(&mut *self.pending);
        let mut out = Vec::new();
        if !line.is_empty() {
            self.line(&line, &mut out);
        }
        out
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canaries_all_patterns() {
        let r = Redactor::new(["canary-pass".into()]).with_env("PUBLIC_NAME=env-canary\n#ignore=x");
        let input="canary-pass env-canary\nPASSWORD=hidden-canary\nBearer bearer-canary\nsk-abcdef123456\nhttps://user:pass@example.test\n-----BEGIN OPENSSH PRIVATE KEY-----\nkey-canary\n-----END OPENSSH PRIVATE KEY-----";
        let result = r.redact(input);
        for secret in [
            "canary-pass",
            "env-canary",
            "hidden-canary",
            "bearer-canary",
            "sk-abcdef123456",
            "user:pass",
            "key-canary",
        ] {
            assert!(!result.contains(secret), "{result}");
        }
        assert_eq!(
            r.redact("Uploading 4 files: SHA256:hello"),
            "Uploading 4 files: SHA256:hello"
        );
    }
    #[test]
    fn split_secret_and_private_key_lines() {
        let mut log = RedactedLog::new(Redactor::new(["canary-pass".into()]));
        assert!(log.push("canary-").is_empty());
        assert_eq!(log.push("pass\n"), vec!["[REDACTED]"]);
        let lines = log.push("-----BEGIN OPENSSH PRIVATE KEY-----\nprivate-part\n");
        assert_eq!(lines, vec!["[REDACTED PRIVATE KEY]"]);
        assert!(log.push("-----END OPENSSH PRIVATE KEY-----\n").is_empty());
        assert_eq!(log.push("done\n"), vec!["done"]);
    }
}
