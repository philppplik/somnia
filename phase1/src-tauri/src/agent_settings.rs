//! Non-secret preferences live in app config; the API key lives only in the OS key store.
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomPrompt { pub id: String, pub name: String, pub text: String, pub enabled: bool }
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub custom_prompts: Vec<CustomPrompt>,
}
impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.provider.as_str(), "ollama" | "openrouter") || self.model.len() > 512 || self.model.contains(['\r', '\n', '\0']) {
            return Err("Invalid agent preferences".into());
        }
        if self.custom_prompts.len() > 20 || self.custom_prompts.iter().map(|p| p.text.len()).sum::<usize>() > 16000 {
            return Err("Custom prompts exceed size limits".into());
        }
        let mut ids = std::collections::HashSet::new();
        for p in &self.custom_prompts {
            if p.id.is_empty() || p.id.len() > 80 || !ids.insert(&p.id) || p.name.len() > 120 || p.text.len() > 8000 || p.text.contains('\0') {
                return Err("Invalid custom prompt".into());
            }
        }
        Ok(())
    }
}
pub fn load(path: &Path) -> Result<Preferences, String> {
    if !path.exists() { return Ok(Preferences { provider: "ollama".into(), model: String::new(), custom_prompts: vec![] }); }
    let bytes = std::fs::read(path).map_err(|_| "Could not read agent preferences")?;
    if bytes.len() > 100000 { return Err("Agent preferences are too large".into()); }
    let p: Preferences = serde_json::from_slice(&bytes).map_err(|_| "Invalid agent preferences file")?;
    p.validate()?;
    Ok(p)
}
pub fn save(path: &Path, p: &Preferences) -> Result<(), String> {
    p.validate()?;
    let dir = path.parent().ok_or("Invalid config path")?;
    std::fs::create_dir_all(dir).map_err(|_| "Could not create app config directory")?;
    let tmp = path.with_extension("tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut f = options.open(&tmp).map_err(|_| "Could not write agent preferences")?;
    use std::io::Write;
    f.write_all(&serde_json::to_vec(p).map_err(|_| "Could not encode preferences")?).map_err(|_| "Could not write agent preferences")?;
    f.sync_all().map_err(|_| "Could not sync agent preferences")?;
    // Windows rename cannot overwrite a destination. Only non-secret preferences are replaced.
    #[cfg(windows)] if path.exists() { std::fs::remove_file(path).map_err(|_| "Could not replace agent preferences")?; }
    std::fs::rename(&tmp, path).map_err(|_| "Could not replace agent preferences")?;
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn round_trip_and_no_secret_field() {
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("agent-settings.json");
        assert_eq!(load(&path).unwrap().provider,"ollama");
        let p=Preferences{provider:"openrouter".into(),model:"fixture/model".into(),custom_prompts:vec![]};
        save(&path,&p).unwrap();assert_eq!(load(&path).unwrap().model,p.model);
        let data=std::fs::read_to_string(&path).unwrap();assert!(!data.contains("apiKey"));
        assert!(serde_json::from_str::<Preferences>(r#"{"provider":"ollama","model":"x","apiKey":"fixture"}"#).is_err());
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt;assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,0o600); }
    }
    #[test] fn invalid_and_corrupt_fail_closed() {
        assert!(Preferences{provider:"unknown".into(),model:"x".into(),custom_prompts:vec![]}.validate().is_err());
        assert!(Preferences{provider:"ollama".into(),model:"x\n".into(),custom_prompts:vec![]}.validate().is_err());
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("prefs");std::fs::write(&path,"{}").unwrap();assert!(load(&path).is_err());
    }
}
