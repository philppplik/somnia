/// The system-browser bridge accepts web URLs only, never filesystem/custom schemes.
pub fn validate_external(value: &str) -> Result<(), &'static str> {
    if value.len() > 4096 || value.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
        return Err("Invalid preview URL");
    }
    let url = url::Url::parse(value).map_err(|_| "Invalid preview URL")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some()
    {
        return Err("Only HTTP(S) links without credentials can be opened");
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_web_links() {
        for url in ["https://example.com/a?x=1#two", "http://localhost:8080/"] { assert!(validate_external(url).is_ok()); }
        for url in ["file:///etc/passwd", "javascript:alert(1)", "https://user:pass@example.com", "https://example.com\n", "https:\\example.com", "mailto:test@example.com", "//example.com", "https://"] { assert!(validate_external(url).is_err(), "{url}"); }
    }
}
