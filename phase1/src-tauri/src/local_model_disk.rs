//! Read-only capacity of an explicitly selected folder. Not daemon-path discovery.
use std::{path::PathBuf,sync::{Mutex,OnceLock}};
use serde::Serialize;
static CHOICE:OnceLock<Mutex<Option<(String,PathBuf)>>>=OnceLock::new();
#[derive(Serialize)]#[serde(rename_all="camelCase")]
pub struct Disk {pub token:String,pub free_bytes:u64,pub checked_at:u64,pub source:&'static str}
pub fn select(path:PathBuf)->Result<Disk,String>{let path=path.canonicalize().map_err(|_|"Model folder unavailable")?;if !path.is_dir(){return Err("Select a model folder".into());}let token=uuid::Uuid::new_v4().to_string();let result=measure(&token,&path)?;*CHOICE.get_or_init(||Mutex::new(None)).lock().map_err(|_|"Disk check unavailable")?=Some((token,path));Ok(result)}
fn measure(token:&str,path:&std::path::Path)->Result<Disk,String>{Ok(Disk{token:token.into(),free_bytes:fs2::available_space(path).map_err(|_|"Model volume capacity unavailable")?,checked_at:std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"Clock unavailable")?.as_millis() as u64,source:"user-selected-volume"})}
pub fn check(token:&str)->Result<Disk,String>{let slot=CHOICE.get_or_init(||Mutex::new(None)).lock().map_err(|_|"Disk check unavailable")?;let (id,path)=slot.as_ref().filter(|(id,_)|id==token).ok_or("Select the actual Ollama model folder first")?;measure(id,path)}
#[cfg(test)]mod tests{use super::*;#[test]fn selected_volume_only(){let root=tempfile::tempdir().unwrap();let disk=select(root.path().into()).unwrap();assert_eq!(disk.source,"user-selected-volume");assert!(check("untrusted").is_err());assert!(check(&disk.token).is_ok());}}

/// Reviewed catalog estimates only, not registry manifest or exact incremental bytes.
pub fn require_capacity(model:&str,free:u64)->Result<(),String>{let bytes=match model{"qwen3:1.7b"=>1_400_000_000u64,"qwen3:4b"=>2_500_000_000,"qwen3:8b"=>5_200_000_000,"qwen2.5-coder:7b"=>4_700_000_000,"gemma3:4b"=>3_400_000_000,_=>return Ok(())};let required=bytes+bytes/4+1024*1024*1024;if free<required{Err("Not enough space for catalog estimate and headroom".into())}else{Ok(())}}
#[cfg(test)]mod capacity_tests{use super::*;#[test]fn known_estimate_and_unknown_not_guaranteed(){assert!(require_capacity("qwen3:4b",1).is_err());assert!(require_capacity("qwen3:4b",20*1024*1024*1024).is_ok());assert!(require_capacity("arbitrary:tag",1).is_ok());}}
