use wasm_bindgen::prelude::*;
use std::sync::Arc;
use pdfcraft_render::{inspect,PageRenderer,RenderConfig,RenderRequest};
#[wasm_bindgen]
pub struct PdfCraft {renderer:PageRenderer, count:usize, info:String, width:u32, height:u32}
#[wasm_bindgen]
impl PdfCraft {
 #[wasm_bindgen(constructor)]
 pub fn new(bytes:&[u8],password:Option<String>)->Result<PdfCraft,JsValue>{
  if bytes.len()>25_000_000 {return Err(JsValue::from_str("PDF exceeds 25 MB"));}
  let bytes=Arc::new(bytes.to_vec());
  let info=inspect(bytes.clone(),password.as_deref()).map_err(|e|JsValue::from_str(&e.to_string()))?;
  let pages:Vec<_>=info.pages.iter().map(|p|serde_json::json!({"width":p.width,"height":p.height,"rotation":p.rotation})).collect();
  if pages.is_empty()||pages.len()>2000{return Err(JsValue::from_str("Unsupported page count"));}
  let renderer=PageRenderer::new(bytes,RenderConfig{password:password.map(Arc::from),..Default::default()});
  Ok(Self{renderer,count:pages.len(),info:serde_json::json!({"pages":pages,"encrypted":info.encrypted,"hasJavascript":info.has_javascript}).to_string(),width:0,height:0})
 }
 pub fn info(&self)->String{self.info.clone()}
 pub fn width(&self)->u32{self.width}
 pub fn height(&self)->u32{self.height}
 pub fn render(&mut self,page:usize,scale:f32)->Result<Vec<u8>,JsValue>{
  if page>=self.count||!scale.is_finite()||scale<=0.0||scale>4.0{return Err(JsValue::from_str("Invalid render request"));}
  let output=self.renderer.render(RenderRequest{page,scale,..Default::default()});
  if let Some(error)=output.error{return Err(JsValue::from_str(&error));}
  self.width=output.width;self.height=output.height;Ok(output.rgba)
 }
}
