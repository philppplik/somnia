//! Local independent Code copies. No project handles or main-window grants cross this boundary.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::{Mutex, OnceLock}, time::{Duration, Instant}};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
const MAX_BYTES: usize = 8_000_000;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Snapshot { version: u8, studio: String, name: String, files: BTreeMap<String,String>, active_file: String, locale: String }
impl Snapshot {
 fn validate(&self)->Result<(),String>{
  if self.version!=1 || self.studio!="code" || self.name.len()>200 || self.locale.len()>20 || self.files.is_empty() || self.files.len()>1000 || !self.files.contains_key(&self.active_file){return Err("Invalid studio copy".into());}
  for path in self.files.keys(){if path.len()>1024 || path.contains('\\') || path.starts_with('/') || path.split('/').any(|p|p.is_empty()||p=="."||p=="..") {return Err("Invalid studio copy path".into());}}
  if serde_json::to_vec(self).map_err(|_|"Invalid studio copy")?.len()>MAX_BYTES{return Err("Studio copy is too large".into());}Ok(())
 }
}
struct CopyRecord {snapshot:Option<Snapshot>,created:Instant,claimed:bool}
fn copies()->&'static Mutex<BTreeMap<String,CopyRecord>>{static VALUE:OnceLock<Mutex<BTreeMap<String,CopyRecord>>>=OnceLock::new();VALUE.get_or_init(||Mutex::new(BTreeMap::new()))}
#[tauri::command]
pub async fn studio_copy_open(window:WebviewWindow,snapshot:Snapshot)->Result<String,String>{
 if window.label()!="main" || window.url().map(|u|!matches!(u.path(),"/"|"/index.html")).unwrap_or(true) {return Err("Only main may open studio copies".into());}snapshot.validate()?;
 let label=format!("studio-copy-{}",uuid::Uuid::new_v4());
 {let mut c=copies().lock().map_err(|_|"Studio copy unavailable")?;if c.len()>=8{return Err("Close a studio copy first".into());}c.insert(label.clone(),CopyRecord{snapshot:Some(snapshot),created:Instant::now(),claimed:false});}
 let app=window.app_handle();
 let result=tauri::WebviewWindowBuilder::new(app,&label,tauri::WebviewUrl::App("studio-copy.html".into()))
  .title("Somnia Code - independent copy").inner_size(1100.0,800.0).min_inner_size(700.0,500.0)
  .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
  .on_navigation(|url|url.path()=="/studio-copy.html" && (url.scheme()=="tauri" || (url.scheme()=="http"||url.scheme()=="https")&&url.host_str()==Some("tauri.localhost") || (cfg!(debug_assertions)&&url.host_str()==Some("127.0.0.1")&&url.port()==Some(1420))))
  .build();
 match result{Ok(child)=>{let id=label.clone();child.on_window_event(move|event|{if matches!(event,tauri::WindowEvent::Destroyed){if let Ok(mut c)=copies().lock(){c.remove(&id);}}});Ok(label)},Err(_)=>{if let Ok(mut c)=copies().lock(){c.remove(&label);}Err("Studio copy could not open".into())}}
}
#[tauri::command]
pub fn studio_copy_take(window:WebviewWindow)->Result<Snapshot,String>{
 let mut c=copies().lock().map_err(|_|"Studio copy unavailable")?;let record=c.get_mut(window.label()).ok_or("Unregistered studio copy")?;
 if record.created.elapsed()>Duration::from_secs(60){record.snapshot=None;return Err("Studio copy expired".into());}
 let snapshot=record.snapshot.take().ok_or("Studio copy already claimed")?;record.claimed=true;Ok(snapshot)
}
#[tauri::command]
pub async fn studio_copy_export(window:WebviewWindow,snapshot:Snapshot)->Result<bool,String>{
 {let c=copies().lock().map_err(|_|"Studio copy unavailable")?;let record=c.get(window.label()).ok_or("Unregistered studio copy")?;if !record.claimed{return Err("Claim studio copy first".into());}}snapshot.validate()?;
 let app=window.app_handle().clone();
 tauri::async_runtime::spawn_blocking(move||{
  let selected=app.dialog().file().add_filter("ZIP project copy",&["zip"]).set_file_name("somnia-copy.zip").blocking_save_file();
  let Some(selected)=selected else{return Ok(false)};let path=selected.into_path().map_err(|_|"Invalid export destination")?;
  if path.extension().and_then(|x|x.to_str())!=Some("zip"){return Err("Choose a ZIP destination".into());}
  use std::io::Write;let mut zip=zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
  for (name,text) in snapshot.files{zip.start_file(name,zip::write::SimpleFileOptions::default()).map_err(|_|"Export failed")?;zip.write_all(text.as_bytes()).map_err(|_|"Export failed")?;}
  let bytes=zip.finish().map_err(|_|"Export failed")?.into_inner();std::fs::write(path,bytes).map_err(|_|"Export failed")?;Ok(true)
 }).await.map_err(|_|"Export failed")?
}
#[cfg(test)] mod tests{
 use super::*;
 fn valid()->Snapshot{Snapshot{version:1,studio:"code".into(),name:"Copy".into(),locale:"en".into(),active_file:"index.html".into(),files:BTreeMap::from([("index.html".into(),"<h1>Copy</h1>".into())])}}
 #[test]fn accepts_text(){assert!(valid().validate().is_ok());}
 #[test]fn rejects_escape(){let mut s=valid();s.files.insert("../secret".into(),"x".into());assert!(s.validate().is_err());}
 #[test]fn rejects_missing_active(){let mut s=valid();s.active_file="other".into();assert!(s.validate().is_err());}
 #[test]fn rejects_big(){let mut s=valid();s.files.insert("big.txt".into(),"x".repeat(MAX_BYTES));assert!(s.validate().is_err());}
}
