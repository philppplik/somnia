//! Explicit trusted-editor operations only. No generic process or HTTP bridge.
use std::{collections::BTreeMap, sync::{Arc, OnceLock}, time::Duration};
use tokio::sync::{Mutex, mpsc};
use serde::Serialize;

fn model_name(model: &str) -> Result<(), String> {
    // Registry-only names, never custom hosts or insecure registries.
    if model.is_empty() || model.len()>200 || !model.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_.:/".contains(&c)) || model.contains("..") || model.contains("://") || model.matches('/').count()>1 || model.starts_with('/') || model.ends_with('/') || model.matches(':').count()>1 {
        return Err("Use an exact ollama.com library model name".into());
    }
    let namespace=model.split('/').next().unwrap_or("");
    if model.contains('/') && (namespace.contains('.') || namespace.contains(':')) {return Err("Custom model registries are not allowed".into());}
    if model.to_ascii_lowercase().ends_with("-cloud") || model.to_ascii_lowercase().ends_with(":cloud") {return Err("Cloud aliases cannot be pulled as local models".into());}
    Ok(())
}
fn client() -> Result<reqwest::Client,String> {
    reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(2)).timeout(Duration::from_secs(24*60*60)).build().map_err(|_| "Local transport unavailable".into())
}
fn action_url(base:&str,action:&str)->Result<String,String>{
    let mut url=url::Url::parse(&crate::local_models::endpoint(base,"tags")?).map_err(|_| "Invalid endpoint")?;
    url.set_path(match action {"pull"=>"/api/pull","delete"=>"/api/delete",_=>return Err("Invalid action".into())});
    Ok(url.to_string())
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct StartOutcome { pub launched:bool, pub instruction:Option<String> }
pub fn start()->Result<StartOutcome,String>{
    #[cfg(target_os="windows")] {
        let root=std::env::var_os("LOCALAPPDATA").ok_or("Ollama app not found")?;
        let app=std::path::PathBuf::from(root).join("Programs/Ollama/ollama app.exe");
        if !app.is_file(){return Err("Ollama app not found in its standard install location".into());}
        std::process::Command::new(app).env("OLLAMA_HOST","127.0.0.1:11434").spawn().map_err(|_| "Could not launch Ollama app")?;
        return Ok(StartOutcome{launched:true,instruction:None});
    }
    #[cfg(target_os="macos")] {
        if !std::path::Path::new("/Applications/Ollama.app").is_dir(){return Err("Ollama.app not found in /Applications".into());}
        let status=std::process::Command::new("/usr/bin/open").args(["-a","/Applications/Ollama.app"]).env("OLLAMA_HOST","127.0.0.1:11434").status().map_err(|_| "Could not launch Ollama app")?;
        if !status.success(){return Err("Could not launch Ollama app".into());}
        return Ok(StartOutcome{launched:true,instruction:None});
    }
    #[cfg(not(any(target_os="windows",target_os="macos")))]
    Ok(StartOutcome{launched:false,instruction:Some("sudo systemctl start ollama".into())})
}
struct Pull {receiver:Mutex<mpsc::Receiver<Result<Vec<u8>,String>>>,abort:tokio::task::AbortHandle}
impl Drop for Pull {fn drop(&mut self){self.abort.abort();}}
fn pulls()->&'static Mutex<BTreeMap<String,Arc<Pull>>>{static STATE:OnceLock<Mutex<BTreeMap<String,Arc<Pull>>>>=OnceLock::new();STATE.get_or_init(||Mutex::new(BTreeMap::new()))}

pub async fn pull(base:&str,model:&str)->Result<String,String>{
    model_name(model)?;let url=action_url(base,"pull")?;
    // Reserve the sole owned pull before opening the network request.
    let mut jobs=pulls().lock().await;
    if !jobs.is_empty(){return Err("An owned pull is already active".into());}
    let mut response=tokio::time::timeout(Duration::from_secs(15),client()?.post(url).json(&serde_json::json!({"model":model,"stream":true})).send()).await.map_err(|_| "Pull connection timed out")?.map_err(|_| "Pull connection failed")?;
    if !response.status().is_success(){return Err(format!("Pull answered {}",response.status().as_u16()));}
    let (sender,receiver)=mpsc::channel(1);
    let task=tokio::spawn(async move { loop {
        match tokio::time::timeout(Duration::from_secs(180),response.chunk()).await {
            Ok(Ok(Some(bytes))) if bytes.len()<=1_000_000 => {if sender.send(Ok(bytes.to_vec())).await.is_err(){break;}},
            Ok(Ok(None))=>break,
            _=>{let _=sender.send(Err("Pull interrupted or timed out".into())).await;break;}
        }
    }});
    let id=uuid::Uuid::new_v4().to_string();jobs.insert(id.clone(),Arc::new(Pull{receiver:Mutex::new(receiver),abort:task.abort_handle()}));Ok(id)
}
pub async fn next(id:&str)->Result<Option<Vec<u8>>,String>{
    let job=pulls().lock().await.get(id).cloned().ok_or("Pull closed")?;
    let mut receiver=job.receiver.lock().await;
    let result=tokio::time::timeout(Duration::from_secs(185),receiver.recv()).await;
    match result {Ok(Some(Ok(chunk)))=>Ok(Some(chunk)),Ok(None)=>{pulls().lock().await.remove(id);Ok(None)},_=>{pulls().lock().await.remove(id);Err("Pull interrupted".into())}}
}
/// Stopping our HTTP stream cannot establish what another client or the daemon is doing.
pub async fn cancel(id:&str)->String {
    if let Some(job)=pulls().lock().await.remove(id){job.abort.abort();}
    "unknown".into()
}
pub async fn delete(base:&str,model:&str,expected_digest:&str)->Result<(),String>{
    model_name(model)?;
    let owned=pulls().lock().await;
    if !owned.is_empty(){return Err("Wait for the owned pull to finish".into());}
    let tags=crate::local_models::read(base,"tags",None).await?;
    let rows=tags.get("models").and_then(|v|v.as_array()).ok_or("Inventory unavailable")?;
    let current=rows.iter().find(|m| m.get("model").or_else(||m.get("name")).and_then(|v|v.as_str())==Some(model)).ok_or("Model no longer installed")?;
    if expected_digest.is_empty() || current.get("digest").and_then(|v|v.as_str())!=Some(expected_digest){return Err("Model changed; refresh and confirm again".into());}
    // Loaded models may belong to another client. Fail closed instead of assuming Somnia owns the daemon.
    let mut ps_url=url::Url::parse(&crate::local_models::endpoint(base,"tags")?).map_err(|_| "Invalid endpoint")?;
    ps_url.set_path("/api/ps");
    let ps=client()?.get(ps_url).timeout(Duration::from_secs(5)).send().await.map_err(|_| "Cannot check loaded models")?;
    if !ps.status().is_success(){return Err("Cannot check loaded models".into());}
    let mut ps=ps;
    let mut ps_bytes=Vec::new();
    while let Some(chunk)=ps.chunk().await.map_err(|_| "Loaded-model response interrupted")? {
        if ps_bytes.len()+chunk.len()>2_000_000{return Err("Loaded-model response too large".into());}
        ps_bytes.extend_from_slice(&chunk);
    }
    let ps:serde_json::Value=serde_json::from_slice(&ps_bytes).map_err(|_| "Invalid loaded-model response")?;
    let loaded=ps.get("models").and_then(|v|v.as_array()).ok_or("Loaded-model state unknown")?;
    if loaded.iter().any(|m|m.get("model").or_else(||m.get("name")).and_then(|v|v.as_str())==Some(model)) {return Err("Model is loaded; stop other clients and unload it before removal".into());}
    let response=client()?.delete(action_url(base,"delete")?).timeout(Duration::from_secs(10)).json(&serde_json::json!({"model":model})).send().await.map_err(|_| "Delete result unknown; refresh before retrying")?;
    if !response.status().is_success(){return Err(format!("Delete answered {}",response.status().as_u16()));}
    drop(owned);Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn registry_names_only(){
  for name in ["qwen3:4b","library/qwen3:4b","my-model:Q4_K_M"]{assert!(model_name(name).is_ok());}
  for name in ["", "../evil","https://evil/model","evil.test/model","evil:80/model","tag-cloud","tag:cloud","MODEL:CLOUD","a/b/c","a\n","/foo"]{assert!(model_name(name).is_err(),"{name}");}
 }
 #[test]fn action_routes_preserve_loopback_gate(){assert!(action_url("http://127.0.0.1:11434","pull").unwrap().ends_with("/api/pull"));assert!(action_url("http://remote.invalid","pull").is_err());assert!(action_url("http://127.0.0.1:11434","chat").is_err());}
}
