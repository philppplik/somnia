//! Read-only Ollama management. Never starts a process, modifies configuration or runs inference.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection { pub installed: bool }

fn executable(path: &Path) -> bool {
    let Ok(meta) = path.metadata() else { return false; };
    if !meta.is_file() { return false; }
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))] { true }
}

pub fn detect() -> Detection {
    let binary = if cfg!(windows) { "ollama.exe" } else { "ollama" };
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).map(|dir| dir.join(binary)).collect()).unwrap_or_default();
    #[cfg(windows)]
    if let Some(root) = std::env::var_os("LOCALAPPDATA") { paths.push(PathBuf::from(root).join("Programs/Ollama/ollama.exe")); }
    #[cfg(target_os = "macos")]
    paths.push(PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"));
    #[cfg(target_os = "linux")]
    paths.extend([PathBuf::from("/usr/local/bin/ollama"), PathBuf::from("/usr/bin/ollama")]);
    Detection { installed: paths.iter().any(|p| executable(p)) }
}

/// The renderer cannot supply arbitrary paths, queries, credentials, HTTPS or remote hosts.
pub fn endpoint(base: &str, operation: &str) -> Result<String, String> {
    let u = url::Url::parse(base).map_err(|_| "Invalid local runtime endpoint")?;
    let loopback = match u.host() {
        Some(url::Host::Domain(h)) => h == "localhost",
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    };
    if u.scheme() != "http" || !loopback || !u.username().is_empty() || u.password().is_some() || u.query().is_some() || u.fragment().is_some() || u.path() != "/" {
        return Err("Local runtime requires an HTTP loopback origin".into());
    }
    let path = match operation { "version" => "api/version", "tags" => "api/tags", "show" => "api/show", "ps" => "api/ps", _ => return Err("Local runtime operation is not allowed".into()) };
    Ok(u.join(path).map_err(|_| "Invalid local runtime endpoint")?.to_string())
}

#[cfg(feature = "desktop")]
pub async fn read(base: &str, operation: &str, model: Option<&str>) -> Result<serde_json::Value, String> {
    let url = endpoint(base, operation)?;
    if operation == "show" {
        let name = model.ok_or("Model name is required")?;
        if name.trim().is_empty() || name.len() > 512 || name.chars().any(char::is_control) { return Err("Invalid model name".into()); }
    } else if model.is_some() { return Err("Model is only allowed for show".into()); }
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(2)).timeout(std::time::Duration::from_secs(if operation == "version" { 2 } else { 5 }))
        .build().map_err(|_| "Local transport unavailable")?;
    let request = if operation == "show" { client.post(&url).json(&serde_json::json!({"model":model})) } else { client.get(&url) };
    let mut response = request.send().await.map_err(|_| "Local runtime unreachable")?;
    if !response.status().is_success() { return Err(format!("Local runtime answered {}", response.status().as_u16())); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Local response interrupted")? {
        if bytes.len() + chunk.len() > 2_000_000 { return Err("Local response too large".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid local runtime JSON".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn loopback_read_only_routes() {
        for base in ["http://127.0.0.1:11434", "http://127.2.3.4:11434", "http://localhost:11434", "http://[::1]:11434"] {
            for op in ["version", "tags", "show", "ps"] { assert!(endpoint(base, op).is_ok()); }
            for op in ["chat", "pull", "delete", "../api/chat"] { assert!(endpoint(base, op).is_err()); }
        }
        for base in ["https://localhost:11434", "http://example.com", "http://localhost.evil", "http://user@localhost", "http://localhost/path", "http://localhost?x=1", "http://localhost#x", "http://0.0.0.0"] { assert!(endpoint(base, "tags").is_err()); }
    }
    #[test] fn probe_requires_real_executable() {
        assert!(!executable(Path::new("/nonexistent-somnia-ollama")));
        assert!(!executable(Path::new(".")));
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("ollama");
        std::fs::write(&path, b"fixture").unwrap();
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
            assert!(!executable(&path));
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        assert!(executable(&path));
    }
}
