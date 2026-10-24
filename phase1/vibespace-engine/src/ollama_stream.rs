//! Opt-in bounded Ollama NDJSON codec. Provisional text never decodes effects.
use crate::*;
use serde_json::{json,Value};
pub struct Decoder { buffer:Vec<u8>,total:usize,text:String,pending:String,done:bool,final_value:Option<Value> }
impl Default for Decoder {fn default()->Self{Self{buffer:vec![],total:0,text:String::new(),pending:String::new(),done:false,final_value:None}}}
impl Decoder {
 pub fn push(&mut self,bytes:&[u8])->Result<Vec<String>,Failure>{
  self.total=self.total.checked_add(bytes.len()).ok_or(Failure::Model)?;
  if self.total>262144 || self.done&&!bytes.iter().all(u8::is_ascii_whitespace){return Err(Failure::Model);}
  self.buffer.extend_from_slice(bytes);let mut deltas=vec![];
  while let Some(i)=self.buffer.iter().position(|b|*b==b'\n'){
   if i>65536{return Err(Failure::Model);}let line:Vec<u8>=self.buffer.drain(..=i).collect();if line.iter().all(u8::is_ascii_whitespace){continue;}
   if self.done{return Err(Failure::Model);}let v:Value=serde_json::from_slice(&line).map_err(|_|Failure::Model)?;
   if !v.is_object() || v.get("error").is_some() || v.get("remote_host").is_some() || v.get("remote_model").is_some(){return Err(Failure::Model);}
   let message=v.get("message");if message.is_some_and(|m|!m.is_object()){return Err(Failure::Model);}
   // Experimental first slice is text-only. Tool deltas fail closed, never execute.
   if message.and_then(|m|m.get("tool_calls")).is_some(){return Err(Failure::Model);}
   if let Some(value)=message.and_then(|m|m.get("content")){
    let text=value.as_str().ok_or(Failure::Model)?;if text.len()>4096||self.text.len()+text.len()>65536{return Err(Failure::Model);}
    if !text.is_empty(){self.text.push_str(text);self.pending.push_str(text);}
   }
   if let Some(done)=v.get("done"){if done.as_bool().ok_or(Failure::Model)?{self.done=true;self.final_value=Some(v);}}
  }
  if self.pending.len()>=256 || self.done {
   while !self.pending.is_empty(){let mut end=self.pending.len().min(4096);while !self.pending.is_char_boundary(end){end-=1;}let rest=self.pending.split_off(end);deltas.push(std::mem::replace(&mut self.pending,rest));}
  }
  if self.buffer.len()>65536{return Err(Failure::Model);}Ok(deltas)
 }
 pub fn finish(self)->Result<ModelReply,Failure>{
  if !self.done||!self.buffer.iter().all(u8::is_ascii_whitespace)||self.text.trim().is_empty(){return Err(Failure::Model);}
  let v=self.final_value.ok_or(Failure::Model)?;let n=|key:&str|v.get(key).and_then(Value::as_u64).unwrap_or(0);
  if v.get("done_reason").and_then(Value::as_str)==Some("length"){return Err(Failure::Model);}
  let mut usage=Usage::tokens(n("prompt_eval_count"),n("eval_count"));usage.tokens_unknown=["prompt_eval_count","eval_count"].iter().any(|key|v.get(key).and_then(Value::as_u64).is_none());
  Ok(ModelReply{message:self.text,tool:None,usage})
 }
}
pub fn request(model:&str,messages:&[ModelMessage])->Result<Value,Failure>{let bytes=serde_json::to_vec(messages).map_err(|_|Failure::InvalidRequest)?;if bytes.len()>24000{return Err(Failure::InvalidRequest);}Ok(json!({"model":model,"messages":messages,"stream":true,"options":{"num_ctx":32768,"num_predict":2048}}))}
#[cfg(test)]mod tests{use super::*;
 #[test]fn split_utf8_and_final(){let input="{\"message\":{\"content\":\"Grüße\"}}\n{\"done\":true,\"eval_count\":2}\n";let mut d=Decoder::default();let mut out=vec![];for byte in input.as_bytes(){out.extend(d.push(&[*byte]).unwrap());}assert_eq!(out,vec!["Grüße"]);assert_eq!(d.finish().unwrap().usage.output_tokens,2);}
 #[test]fn incomplete_remote_and_tools_fail(){for text in ["null\n","{\"remote_host\":\"cloud\"}\n","{\"message\":{\"tool_calls\":[]}}\n"]{assert!(Decoder::default().push(text.as_bytes()).is_err());}let mut d=Decoder::default();d.push(b"{\"message\":{\"content\":\"partial\"}}\n").unwrap();assert!(d.finish().is_err());}
 #[test]fn bounded(){assert!(Decoder::default().push(&vec![b'x';65537]).is_err());}
}
#[cfg(test)]mod more_tests{use super::*;
 #[test]fn duplicate_done_and_length_fail(){let mut d=Decoder::default();assert!(d.push(b"{\"message\":{\"content\":\"ok\"},\"done\":true}\n{\"done\":true}\n").is_err());let mut d=Decoder::default();d.push(b"{\"message\":{\"content\":\"partial\"},\"done\":true,\"done_reason\":\"length\"}\n").unwrap();assert!(d.finish().is_err());}
 #[test]fn context_and_no_tools(){let m=vec![ModelMessage::text("user","x".repeat(24000))];assert!(request("m",&m).is_err());let body=request("m",&[ModelMessage::text("user","hello".to_string())]).unwrap();assert_eq!(body["stream"],true);assert!(body.get("tools").is_none());assert_eq!(body["options"]["num_ctx"],32768);}
}

#[cfg(test)]mod unknown_usage_tests{use super::*;#[test]fn missing_stream_counters_are_unknown(){let mut d=Decoder::default();d.push(b"{\"message\":{\"content\":\"ok\"},\"done\":true}\n").unwrap();assert!(d.finish().unwrap().usage.tokens_unknown);}}
