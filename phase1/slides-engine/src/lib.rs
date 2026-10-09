//! Read-only PPTX adapter. No upstream UI, editing, export or media execution.
use deckcraft_model::{Presentation, Shape, ShapeKind};
use std::io::{Cursor, Read};
use wasm_bindgen::prelude::*;

const INPUT: usize = 32 * 1024 * 1024;
const PART: u64 = 16 * 1024 * 1024;
const XML: u64 = 4 * 1024 * 1024;
const TOTAL: u64 = 64 * 1024 * 1024;
const ENTRIES: usize = 2048;
/// Validate actual decompressed bytes before invoking the upstream parser.
/// A compressed byte cap alone does not prevent ZIP bombs.
fn preflight(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > INPUT { return Err("PPTX exceeds 32 MiB input cap".into()); }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Invalid PPTX ZIP")?;
    if zip.len() > ENTRIES { return Err("PPTX exceeds 2048 entries".into()); }
    let mut total = 0;
    let mut names = std::collections::HashSet::new();
    let mut presentation = false;
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(|_| "Unreadable or encrypted ZIP entry")?;
        if f.is_dir() { continue; }
        let name = f.name().replace('\\', "/").to_ascii_lowercase();
        if name.starts_with('/') || name.split('/').any(|s| s == "..") || !names.insert(name.clone()) {
            return Err("Ambiguous ZIP path".into());
        }
        if name == "ppt/presentation.xml" { presentation = true; }
        let cap = if name.ends_with(".xml") || name.ends_with(".rels") { XML } else { PART };
        if f.size() > cap { return Err("PPTX part exceeds intake cap".into()); }
        let read = std::io::copy(&mut f.take(cap + 1), &mut std::io::sink()).map_err(|_| "Invalid compressed data")?;
        total += read;
        if read > cap || total > TOTAL { return Err("PPTX expansion exceeds intake cap".into()); }
    }
    if !presentation { return Err("Missing PPTX presentation part".into()); }
    Ok(())
}
#[wasm_bindgen]
pub struct SlidesEngine { doc: Option<Presentation> }
#[wasm_bindgen]
impl SlidesEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { Self { doc: None } }
    pub fn open(&mut self, bytes: &[u8]) -> Result<String, JsValue> {
        preflight(bytes).map_err(|e| JsValue::from_str(&e))?;
        let doc = deckcraft_pptx::import(bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
        if doc.slides.is_empty() || doc.slides.len() > 200 { return Err(JsValue::from_str("Expected 1-200 slides")); }
        let (w,h) = (doc.slide_size.width,doc.slide_size.height);
        if !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0 { return Err(JsValue::from_str("Invalid slide dimensions")); }
        let result = serde_json::json!({"slides":doc.slides.len(),"widthPt":w,"heightPt":h}).to_string();
        self.doc = Some(doc);
        Ok(result)
    }
    pub fn read_slide(&self, index: usize) -> Result<String, JsValue> {
        let slide = self.doc.as_ref().and_then(|d|d.slides.get(index)).ok_or_else(||JsValue::from_str("Slide out of range"))?;
        let mut texts=Vec::new(); collect_text(&slide.shapes,&mut texts);
        Ok(serde_json::json!({"index":index,"texts":texts}).to_string())
    }
    pub fn render_png(&self, index: usize, scale: f64) -> Result<Vec<u8>, JsValue> {
        let doc=self.doc.as_ref().ok_or_else(||JsValue::from_str("No presentation"))?;
        let (w,h)=(doc.slide_size.width*scale,doc.slide_size.height*scale);
        if index>=doc.slides.len() || !scale.is_finite() || scale<=0.0 || !w.is_finite() || !h.is_finite() || w>4096.0 || h>4096.0 || w*h>8_000_000.0 {
            return Err(JsValue::from_str("Invalid slide or render exceeds 8 MP / 4096 px"));
        }
        Ok(deckcraft_render::render_slide(doc,index,&deckcraft_render::RenderOpts{scale,threads:0,..Default::default()}).to_png())
    }
}
impl Default for SlidesEngine { fn default()->Self {Self::new()} }
fn collect_text(shapes:&[Shape], out:&mut Vec<String>) {
    for shape in shapes { if let Some(body)=&shape.text {out.push(body.text());}
        if let ShapeKind::Group{children,..}=&shape.kind {collect_text(children,out);}
    }
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn fixture(){let mut e=SlidesEngine::new(); assert!(e.open(include_bytes!("../fixtures/independent.pptx")).unwrap().contains("\"slides\":2"));assert!(e.read_slide(0).unwrap().contains("Somnia Documents Studio"));assert_eq!(&e.render_png(1,1.0).unwrap()[..8],b"\x89PNG\r\n\x1a\n");}
 #[test] fn invalid_zip(){assert!(preflight(b"not zip").is_err());}
 #[test] fn compressed_cap(){assert!(preflight(&vec![0;INPUT+1]).is_err());}
 #[test] fn expansion_cap(){use std::io::Write;let mut z=zip::ZipWriter::new(Cursor::new(Vec::new()));z.start_file("ppt/presentation.xml",zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)).unwrap();z.write_all(&vec![b'x';XML as usize+1]).unwrap();let b=z.finish().unwrap().into_inner();assert!(preflight(&b).unwrap_err().contains("cap"));}
 #[test] fn missing_presentation(){use std::io::Write;let mut z=zip::ZipWriter::new(Cursor::new(Vec::new()));z.start_file("not-pptx.txt",zip::write::SimpleFileOptions::default()).unwrap();z.write_all(b"hello").unwrap();assert!(preflight(&z.finish().unwrap().into_inner()).unwrap_err().contains("Missing"));}
 #[test] fn traversal_rejected(){use std::io::Write;let mut z=zip::ZipWriter::new(Cursor::new(Vec::new()));z.start_file("ppt/../presentation.xml",zip::write::SimpleFileOptions::default()).unwrap();z.write_all(b"hello").unwrap();assert!(preflight(&z.finish().unwrap().into_inner()).unwrap_err().contains("path"));}
 #[test] fn total_expansion_rejected(){use std::io::Write;let mut z=zip::ZipWriter::new(Cursor::new(Vec::new()));for i in 0..5 {z.start_file(format!("image{i}.bin"),zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)).unwrap();z.write_all(&vec![0;PART as usize]).unwrap();}assert!(preflight(&z.finish().unwrap().into_inner()).unwrap_err().contains("expansion"));}

}
