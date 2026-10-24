//! Daemon-reported local weight evidence. Never promotes loopback alone to local processing.
use serde_json::Value;
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Locality{ReportedLocal,Remote,Unknown}
pub fn classify(model:&str,show:&Value)->Locality{
 let name=model.trim().to_ascii_lowercase();
 if name.is_empty()||name.len()>512||name.chars().any(char::is_control){return Locality::Unknown;}
 if name.split([':', '-', '_', '/']).any(|part|part=="cloud"){return Locality::Remote;}
 let Some(data)=show.as_object()else{return Locality::Unknown;};
 // Any non-null remote marker, including malformed/empty markers, is not positive local evidence.
 for key in ["remote_host","remote_model"]{if let Some(value)=data.get(key){if !value.is_null(){return Locality::Remote;}}}
 match data.get("model_info").and_then(Value::as_object){Some(info)if !info.is_empty()=>Locality::ReportedLocal,_=>Locality::Unknown}
}
#[cfg(feature="desktop")]
pub async fn verify_ollama(model:&str)->bool{
 if model.trim().is_empty()||model.len()>256||model.chars().any(char::is_control){return false;}
 match crate::local_models::read("http://127.0.0.1:11434","show",Some(model)).await{Ok(value)=>classify(model,&value)==Locality::ReportedLocal,Err(_)=>false}
}
#[cfg(test)]mod tests{
 use super::*;use serde_json::json;
 #[test]fn exact_model_metadata_is_required(){assert_eq!(classify("qwen3:4b",&json!({"model_info":{"general.architecture":"qwen"}})),Locality::ReportedLocal);for v in [json!({}),json!({"model_info":{}}),json!({"model_info":[]}),json!({"model_info":"x"}),json!(null)]{assert_eq!(classify("qwen3:4b",&v),Locality::Unknown);}}
 #[test]fn cloud_names_and_remote_markers_never_pass(){for name in ["x:cloud","x-cloud","x/CLOUD","x_cloud","x-cloud:latest"]{assert_eq!(classify(name,&json!({"model_info":{"x":1}})),Locality::Remote);}for marker in [json!("host"),json!(""),json!(false),json!({})]{assert_eq!(classify("custom",&json!({"model_info":{"x":1},"remote_host":marker})),Locality::Remote);assert_eq!(classify("custom",&json!({"model_info":{"x":1},"remote_model":marker})),Locality::Remote);}}
}
