//! One-shot, read-only best-effort hardware probes. Unknown is never zero.
use serde::Serialize;
use std::{io::Read,process::{Command,Stdio},time::{Duration,Instant}};
#[derive(Debug,Serialize,Default)]
#[serde(rename_all="camelCase")]
pub struct Gpu {pub name:String,pub total_bytes:Option<u64>,pub free_bytes:Option<u64>,pub unified:bool,pub lower_bound:bool}
#[derive(Debug,Serialize,Default)]
#[serde(rename_all="camelCase")]
pub struct Hardware {pub os:String,pub arch:String,pub ram_total_bytes:Option<u64>,pub ram_available_bytes:Option<u64>,pub cpu:Option<String>,pub cores:Option<usize>,pub gpus:Vec<Gpu>,pub errors:Vec<String>}
/// No shell, bounded output/time, inherited credentials removed.
fn probe(program:&str,args:&[&str])->Option<String>{
 let mut command=Command::new(program);command.args(args).env_clear().stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
 for key in ["SystemRoot","WINDIR","PATH","LANG","LC_ALL"] {if let Some(value)=std::env::var_os(key){command.env(key,value);}}
 let mut child=command.spawn().ok()?;let stdout=child.stdout.take()?;
 let reader=std::thread::spawn(move||{let mut data=Vec::new();stdout.take(1_000_001).read_to_end(&mut data).ok()?;if data.len()>1_000_000{None}else{String::from_utf8(data).ok()}});
 let start=Instant::now();let ok=loop{match child.try_wait(){Ok(Some(status))=>break status.success(),Ok(None) if start.elapsed()<Duration::from_secs(4)=>std::thread::sleep(Duration::from_millis(20)),_=>{let _=child.kill();let _=child.wait();break false;}}};
 let output=reader.join().ok().flatten();if ok{output}else{None}
}
pub fn parse_meminfo(text:&str,key:&str)->Option<u64>{text.lines().find_map(|line|{let (name,value)=line.split_once(':')?;if name!=key{return None;}value.split_whitespace().next()?.parse::<u64>().ok()?.checked_mul(1024)})}
pub fn parse_nvidia(text:&str)->Vec<Gpu>{text.lines().filter_map(|line|{let parts:Vec<_>=line.split(',').map(str::trim).collect();if parts.len()!=3{return None;}Some(Gpu{name:parts[0].into(),total_bytes:parts[1].parse::<u64>().ok()?.checked_mul(1024*1024),free_bytes:parts[2].parse::<u64>().ok()?.checked_mul(1024*1024),unified:false,lower_bound:false})}).collect()}
pub fn snapshot()->Hardware{
 let mut hw=Hardware{os:std::env::consts::OS.into(),arch:std::env::consts::ARCH.into(),cores:std::thread::available_parallelism().ok().map(|n|n.get()),..Hardware::default()};
 #[cfg(target_os="linux")] {
  if let Ok(text)=std::fs::read_to_string("/proc/meminfo"){hw.ram_total_bytes=parse_meminfo(&text,"MemTotal");hw.ram_available_bytes=parse_meminfo(&text,"MemAvailable");}
  if let Ok(text)=std::fs::read_to_string("/proc/cpuinfo"){hw.cpu=text.lines().find_map(|l|l.strip_prefix("model name").and_then(|s|s.split_once(':').map(|(_,v)|v.trim().into())));}
  if let Ok(entries)=std::fs::read_dir("/sys/class/drm"){for entry in entries.flatten(){
   let name=entry.file_name().to_string_lossy().into_owned();if !name.starts_with("card")||!name[4..].bytes().all(|b|b.is_ascii_digit()){continue;}
   let path=entry.path().join("device");let vendor=std::fs::read_to_string(path.join("vendor")).unwrap_or_default();
   if vendor.trim().is_empty(){continue;}
   let number=|file:&str|std::fs::read_to_string(path.join(file)).ok()?.trim().parse::<u64>().ok();
   let total=number("mem_info_vram_total");let free=total.zip(number("mem_info_vram_used")).and_then(|(t,u)|t.checked_sub(u));
   hw.gpus.push(Gpu{name:format!("{} ({})",name,vendor.trim()),total_bytes:total,free_bytes:free,unified:false,lower_bound:false});
  }}
 }
 #[cfg(target_os="windows")] {
  let root=std::env::var("SystemRoot").unwrap_or_else(|_|"C:\\Windows".into());
  let ps=format!("{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",root);
  let script="$o=Get-CimInstance Win32_OperatingSystem;$c=Get-CimInstance Win32_Processor|Select-Object -First 1;@{total=$o.TotalVisibleMemorySize;free=$o.FreePhysicalMemory;cpu=$c.Name;gpu=@(Get-CimInstance Win32_VideoController|Select-Object Name,AdapterRAM)}|ConvertTo-Json -Depth 4 -Compress";
  if let Some(text)=probe(&ps,&["-NoProfile","-NonInteractive","-Command",script]){if let Ok(data)=serde_json::from_str::<serde_json::Value>(&text){
   hw.ram_total_bytes=data["total"].as_u64().and_then(|n|n.checked_mul(1024));hw.ram_available_bytes=data["free"].as_u64().and_then(|n|n.checked_mul(1024));hw.cpu=data["cpu"].as_str().map(str::to_string);
   if let Some(gpus)=data["gpu"].as_array(){for gpu in gpus{hw.gpus.push(Gpu{name:gpu["Name"].as_str().unwrap_or("GPU").into(),total_bytes:gpu["AdapterRAM"].as_u64(),free_bytes:None,unified:false,lower_bound:true});}}
  }}
 }
 #[cfg(target_os="macos")] {
  hw.ram_total_bytes=probe("/usr/sbin/sysctl",&["-n","hw.memsize"]).and_then(|v|v.trim().parse().ok());
  hw.cpu=probe("/usr/sbin/sysctl",&["-n","machdep.cpu.brand_string"]).map(|s|s.trim().to_string());
  // vm_stat free+inactive pages is an estimate, not memory pressure or a guaranteed allocation.
  if let Some(text)=probe("/usr/bin/vm_stat",&[]){hw.ram_available_bytes=parse_vm_stat(&text);}
  if let Some(text)=probe("/usr/sbin/system_profiler",&["SPDisplaysDataType","-json"]){if let Ok(data)=serde_json::from_str::<serde_json::Value>(&text){
   if let Some(gpus)=data["SPDisplaysDataType"].as_array(){for gpu in gpus{hw.gpus.push(Gpu{name:gpu["sppci_model"].as_str().unwrap_or("GPU").into(),unified:cfg!(target_arch="aarch64"),..Gpu::default()});}}
  }}
 }
 // NVIDIA exact memory is preferable to CIM's truncated AdapterRAM. Keep other vendors separate.
 if let Some(text)=probe("nvidia-smi",&["--query-gpu=name,memory.total,memory.free","--format=csv,noheader,nounits"]){let nvidia=parse_nvidia(&text);if !nvidia.is_empty(){hw.gpus.retain(|g|!g.name.to_ascii_lowercase().contains("nvidia")&&!g.name.contains("0x10de"));hw.gpus.extend(nvidia);}}
 if hw.ram_available_bytes.is_none(){hw.errors.push("Available RAM not measured".into());}
 if hw.gpus.is_empty(){hw.errors.push("GPU not detected".into());}
 hw
}
pub fn parse_vm_stat(text:&str)->Option<u64>{
 let header=text.lines().next()?;let size=header.split("page size of ").nth(1)?.split_whitespace().next()?.parse::<u64>().ok()?;
 let count=|key:&str|text.lines().find_map(|line|line.strip_prefix(key)?.trim().trim_end_matches('.').parse::<u64>().ok());
 count("Pages free:")?.checked_add(count("Pages inactive:")?)?.checked_mul(size)
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn units_and_unknown(){assert_eq!(parse_meminfo("MemTotal: 1024 kB\nMemAvailable: 512 kB","MemAvailable"),Some(524288));assert_eq!(parse_meminfo("broken","MemTotal"),None);}
 #[test]fn gpu_devices_are_separate(){let g=parse_nvidia("GPU A, 4096, 2048\nGPU B, 8192, 6144");assert_eq!(g.len(),2);assert_eq!(g[0].free_bytes,Some(2048*1024*1024));assert!(parse_nvidia("GPU, N/A, N/A").is_empty());}
 #[test]fn mac_page_units(){assert_eq!(parse_vm_stat("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 20."),Some(120*16384));}
}
