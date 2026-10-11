//! Contract between installer and app: `%APPDATA%\app.somnia.desktop\installer-options.json`.
//! The installer writes it; it also doubles as the saved settings for upgrades.
use somnia_installer_core::options::Options;
use std::path::PathBuf;

pub const APP_ID: &str = "app.somnia.desktop";

pub fn path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(APP_ID).join("installer-options.json"))
}

pub fn load() -> Option<Options> {
    let raw = std::fs::read_to_string(path()?).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    serde_json::from_value(v.get("options")?.clone()).ok()
}

pub fn save(o: &Options, version: &str) -> std::io::Result<()> {
    let p = path().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "APPDATA unset"))?;
    if let Some(d) = p.parent() { std::fs::create_dir_all(d)?; }
    let body = serde_json::json!({
        "schema": 1, "written_by": "Somnia-Setup", "version": version,
        // flat fields the app reads on first start to seed its own settings
        "auto_update_check": o.auto_update_check, "launch_at_signin": o.launch_at_signin,
        "options": o,
    });
    std::fs::write(p, serde_json::to_vec_pretty(&body)?)
}
