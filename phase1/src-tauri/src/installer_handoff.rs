//! One-way handoff from Somnia-Setup (the custom installer) to the app:
//! `<app config dir>/installer-options.json`. Read-only here; the installer owns the file.
use serde::Serialize;
use std::path::Path;

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Handoff {
    /// True only for a first installation. Upgrades must not override what the user set in the app.
    pub fresh_install: bool,
    /// Unix seconds when the installer wrote the file; the frontend uses it to apply the file once.
    pub written_at: u64,
    pub auto_update_check: bool,
}

pub const FILE_NAME: &str = "installer-options.json";

pub fn parse(raw: &str) -> Option<Handoff> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    if v.get("schema")?.as_u64()? != 1 || v.get("written_by")?.as_str()? != "Somnia-Setup" {
        return None;
    }
    Some(Handoff {
        fresh_install: v.get("fresh_install")?.as_bool()?,
        written_at: v.get("written_at")?.as_u64()?,
        auto_update_check: v.get("auto_update_check")?.as_bool()?,
    })
}

pub fn read(config_dir: &Path) -> Option<Handoff> {
    parse(&std::fs::read_to_string(config_dir.join(FILE_NAME)).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    const OK: &str = r#"{"schema":1,"written_by":"Somnia-Setup","version":"12.2.0","fresh_install":true,"written_at":1760000000,"auto_update_check":false,"launch_at_signin":true,"options":{}}"#;
    #[test]
    fn parses_installer_file() {
        assert_eq!(
            parse(OK),
            Some(Handoff {
                fresh_install: true,
                written_at: 1760000000,
                auto_update_check: false
            })
        );
    }
    #[test]
    fn rejects_foreign_or_malformed_files() {
        assert_eq!(parse(&OK.replace("Somnia-Setup", "other")), None);
        assert_eq!(parse(&OK.replace("\"schema\":1", "\"schema\":2")), None);
        assert_eq!(parse("{"), None);
        assert_eq!(parse(&OK.replace("\"auto_update_check\":false,", "")), None);
    }
    #[test]
    fn missing_file_is_none() {
        assert_eq!(read(Path::new("/definitely/not/here")), None);
    }
}
