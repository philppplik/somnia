//! Non-secret preferences live in app config; the API key lives only in the OS key store.
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomPrompt { pub id: String, pub name: String, pub text: String, pub enabled: bool }
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct LocalRuntimePreferences {pub version:u8,#[serde(default,skip_serializing_if="Option::is_none")]pub num_ctx:Option<u32>,#[serde(default,skip_serializing_if="Option::is_none")]pub keep_alive_seconds:Option<u32>,#[serde(default,skip_serializing_if="Option::is_none")]pub studio_models:Option<std::collections::BTreeMap<String,String>>,#[serde(default,skip_serializing_if="Option::is_none")]pub model_contexts:Option<std::collections::BTreeMap<String,u32>>,#[serde(default,skip_serializing_if="Option::is_none")]pub routing:Option<ProviderRouting>}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub custom_prompts: Vec<CustomPrompt>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub local_runtime:Option<LocalRuntimePreferences>,
}

#[derive(Clone,Debug,Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ProviderLimit{pub timeout_ms:u32,pub retries:u8}
#[derive(Clone,Debug,Deserialize,Serialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ProviderRouting{pub local_only:bool,pub order:Vec<String>,pub models:std::collections::BTreeMap<String,String>,pub limits:std::collections::BTreeMap<String,ProviderLimit>}
impl ProviderRouting{fn validate(&self)->Result<(),String>{let valid=|id:&str|matches!(id,"ollama"|"openai"|"openrouter"|"claude");let mut seen=std::collections::HashSet::new();if self.order.is_empty()||self.order.len()>4||self.order[0]!="ollama"||self.order.iter().any(|id|!valid(id)||!seen.insert(id)||!self.models.contains_key(id)){return Err("Invalid provider route".into());}if self.models.iter().any(|(id,m)|!valid(id)||m.trim().is_empty()||m.len()>512||m.contains(['\r','\n','\0']))||self.limits.iter().any(|(id,l)|!valid(id)||l.timeout_ms<1000||l.timeout_ms>300000||l.retries>5){return Err("Invalid provider settings".into());}Ok(())}}
static LOCAL_ONLY:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(true);
pub fn initialize_local_only(path:&Path){match load(path){Ok(p)=>configure_local_only(&p),Err(_)=>LOCAL_ONLY.store(true,std::sync::atomic::Ordering::SeqCst)}}
pub fn local_only()->bool{LOCAL_ONLY.load(std::sync::atomic::Ordering::SeqCst)}
pub fn configure_local_only(p:&Preferences){LOCAL_ONLY.store(p.local_runtime.as_ref().and_then(|p|p.routing.as_ref()).is_some_and(|p|p.local_only),std::sync::atomic::Ordering::SeqCst);}

impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.provider.as_str(), "ollama" | "openrouter" | "openai" | "claude") || self.model.len() > 512 || self.model.contains(['\r', '\n', '\0']) {
            return Err("Invalid agent preferences".into());
        }
        if let Some(p)=&self.local_runtime {
            if let Some(models)=&p.studio_models {if models.len()>100||models.iter().any(|(id,model)|id.is_empty()||id.len()>80||!id.bytes().all(|c|c.is_ascii_alphanumeric()||b"._-".contains(&c))||model.trim().is_empty()||model.len()>512||model.contains(['\r','\n','\0'])){return Err("Invalid studio model choices".into());}}
            if let Some(models)=&p.model_contexts {if models.len()>100||models.iter().any(|(model,n)|model.is_empty()||model.len()>512||model.contains(['\r','\n','\0'])||*n==0||*n>1_048_576){return Err("Invalid model contexts".into());}}
            if let Some(route)=&p.routing{route.validate()?;}
            if p.version!=1 || p.num_ctx.is_some_and(|n|n==0||n>1_048_576) || p.keep_alive_seconds.is_some_and(|n|n>86_400){return Err("Invalid local runtime preferences".into());}
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
    if !path.exists() { return Ok(Preferences { provider: "ollama".into(), model: String::new(), custom_prompts: vec![], local_runtime:None }); }
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
        let p=Preferences{provider:"openrouter".into(),model:"fixture/model".into(),custom_prompts:vec![],local_runtime:None};
        save(&path,&p).unwrap();assert_eq!(load(&path).unwrap().model,p.model);
        let data=std::fs::read_to_string(&path).unwrap();assert!(!data.contains("apiKey"));
        assert!(serde_json::from_str::<Preferences>(r#"{"provider":"ollama","model":"x","apiKey":"fixture"}"#).is_err());
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt;assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,0o600); }
    }
    #[test] fn invalid_and_corrupt_fail_closed() {
        assert!(Preferences{provider:"unknown".into(),model:"x".into(),custom_prompts:vec![],local_runtime:None}.validate().is_err());
        assert!(Preferences{provider:"ollama".into(),model:"x\n".into(),custom_prompts:vec![],local_runtime:None}.validate().is_err());
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("prefs");std::fs::write(&path,"{}").unwrap();assert!(load(&path).is_err());
    }
}
#[cfg(test)]mod local_runtime_tests {
 use super::*;
 #[test]fn old_preferences_load_and_new_options_roundtrip(){
  let old:Preferences=serde_json::from_str(r#"{"provider":"ollama","model":"x"}"#).unwrap();assert!(old.local_runtime.is_none());
  let new:Preferences=serde_json::from_str(r#"{"provider":"ollama","model":"x","localRuntime":{"version":1,"numCtx":16384,"keepAliveSeconds":0}}"#).unwrap();assert!(new.validate().is_ok());
  let dir=tempfile::tempdir().unwrap();let path=dir.path().join("prefs");save(&path,&new).unwrap();assert_eq!(load(&path).unwrap().local_runtime.unwrap().keep_alive_seconds,Some(0));
 }
 #[test]fn invalid_version_and_unknown_fields_fail(){
  let wrong:Preferences=serde_json::from_str(r#"{"provider":"ollama","model":"x","localRuntime":{"version":2}}"#).unwrap();assert!(wrong.validate().is_err());
  assert!(serde_json::from_str::<Preferences>(r#"{"provider":"ollama","model":"x","localRuntime":{"version":1,"endpoint":"http://evil"}}"#).is_err());
 }
}
#[cfg(test)]mod model_context_tests{use super::*;#[test]fn exact_model_defaults(){let p:Preferences=serde_json::from_str(r#"{"provider":"ollama","model":"qwen3:4b","localRuntime":{"version":1,"modelContexts":{"qwen3:4b":16384}}}"#).unwrap();assert!(p.validate().is_ok());let bad:Preferences=serde_json::from_str(r#"{"provider":"ollama","model":"qwen3:4b","localRuntime":{"version":1,"modelContexts":{"qwen3:4b":0}}}"#).unwrap();assert!(bad.validate().is_err());}}

/// Drop owned HTTP futures as soon as local-only is enabled. No payload or credential logging.
#[cfg(feature="desktop")]
pub async fn cloud_request<F,T>(future:F)->Result<T,String> where F:std::future::Future<Output=Result<T,reqwest::Error>>{
 if local_only(){return Err("Local-only mode blocks cloud providers".into());}
 tokio::pin!(future);let mut interval=tokio::time::interval(std::time::Duration::from_millis(25));
 loop{tokio::select!{result=&mut future=>{if local_only(){return Err("Local-only mode blocks cloud providers".into());}return result.map_err(|_|"Provider connection failed".into());},_=interval.tick()=>{if local_only(){return Err("Local-only mode blocks cloud providers".into());}}}}
}
#[cfg(test)]mod routing_tests{
 use super::*;
 #[test]fn routing_strict_roundtrip_and_bounds(){
  let valid=r#"{"provider":"ollama","model":"x","localRuntime":{"version":1,"routing":{"localOnly":true,"order":["ollama","openai"],"models":{"ollama":"x","openai":"gpt"},"limits":{"openai":{"timeoutMs":1000,"retries":2}}}}}"#;
  let p:Preferences=serde_json::from_str(valid).unwrap();assert!(p.validate().is_ok());
  for broken in [valid.replace("1000","999"),valid.replace("\"retries\":2","\"retries\":6"),valid.replace("[\"ollama\",\"openai\"]","[\"openai\",\"ollama\"]"),valid.replace("\"openai\":\"gpt\"","\"openai\":\"\"")]{assert!(serde_json::from_str::<Preferences>(&broken).unwrap().validate().is_err());}
  assert!(serde_json::from_str::<Preferences>(&valid.replace("\"retries\":2","\"retries\":2,\"extra\":1")).is_err());
  let dir=tempfile::tempdir().unwrap();let path=dir.path().join("prefs");save(&path,&p).unwrap();assert!(load(&path).unwrap().local_runtime.unwrap().routing.unwrap().local_only);
 }
}
