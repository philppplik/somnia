use lightcraft_codecs::{ChromaSubsampling, EncodeImage, EncodeMeta};
use lightcraft_develop::DevelopSettings;
use lightcraft_pipeline::{RenderRequest, StageCache};
use lightcraft_raster::{Rgb32f,resample::{fit,Filter}};
fn load_bytes(bytes:&[u8], max_edge:usize)->Result<(Rgb32f,lightcraft_pipeline::SourceInfo),String>{
    let format=lightcraft_codecs::sniff(bytes).ok_or("Unrecognized photo")?;
    if !matches!(format,lightcraft_codecs::Format::Jpeg|lightcraft_codecs::Format::Png) {return Err("First Develop package supports JPEG and PNG only".into());}
    let d=lightcraft_codecs::decode(bytes,lightcraft_codecs::DecodeOptions{max_size:Some((max_edge as u32,max_edge as u32)),max_pixels:16_777_216}).map_err(|e|e.to_string())?;
    if d.source_width as u64*d.source_height as u64>16_777_216 {return Err("Source exceeds 16 MP experimental limit".into());}
    if d.alpha.as_ref().is_some_and(|a| a.data.iter().any(|v| *v < 0.99999)) {return Err("Transparent PNG development is not implemented; use Raster tools".into());}
    let img=d.to_working();let img=if img.width.max(img.height)>max_edge {fit(&img,max_edge,max_edge,Filter::Mitchell)}else{img};
    Ok((img.into_oriented(lightcraft_geom::Orientation::from_exif(d.orientation)),lightcraft_pipeline::SourceInfo::default()))
}
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct PhotosCore {
    source: std::sync::Arc<lightcraft_raster::Rgb32f>,
    info: lightcraft_pipeline::SourceInfo,
    cache: StageCache,
    last: Option<lightcraft_pipeline::Rendered>,
}
#[wasm_bindgen]
impl PhotosCore {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], max_edge: usize) -> Result<PhotosCore, JsValue> {
        if bytes.is_empty() || bytes.len() > 16 * 1024 * 1024 || max_edge == 0 || max_edge > 2048 {
            return Err(JsValue::from_str("Develop input exceeds bounded preview limits"));
        }
        let (source, info) = load_bytes(bytes, max_edge).map_err(|e| JsValue::from_str(&e))?;
        Ok(Self { source: std::sync::Arc::new(source), info, cache: StageCache::default(), last: None })
    }
    pub fn source_width(&self) -> usize {
        self.source.width
    }
    pub fn source_height(&self) -> usize {
        self.source.height
    }
    pub fn raw(&self) -> bool {
        self.info.raw
    }
    pub fn render(&mut self, settings: &str, edge: usize) -> Result<Vec<u8>, JsValue> {
        if edge == 0 || edge > 2048 { return Err(JsValue::from_str("Invalid render edge")); }
        let v = serde_json::from_str(settings).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let s = DevelopSettings::default().merged(&v).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let r = lightcraft_pipeline::render_cached(
            &self.source,
            &self.info,
            &s,
            &RenderRequest::fit(edge.min(self.source.width.max(self.source.height)), edge.min(self.source.width.max(self.source.height))),
            &self.cache,
        );
        let bytes = r.image.as_bytes().to_vec();
        self.last = Some(r);
        Ok(bytes)
    }
    pub fn width(&self) -> usize {
        self.last.as_ref().map_or(0, |r| r.image.width)
    }
    pub fn height(&self) -> usize {
        self.last.as_ref().map_or(0, |r| r.image.height)
    }
    pub fn export_png(&self) -> Result<Vec<u8>, JsValue> {
        let r = self.last.as_ref().ok_or_else(|| JsValue::from_str("render first"))?;
        lightcraft_codecs::encode_png(&EncodeImage::rgba8(&r.image), &EncodeMeta::default()).map_err(|e| JsValue::from_str(&e.to_string()))
    }
    pub fn export_jpeg(&self) -> Result<Vec<u8>, JsValue> {
        let r = self.last.as_ref().ok_or_else(|| JsValue::from_str("render first"))?;
        lightcraft_codecs::encode_jpeg(&EncodeImage::rgba8(&r.image), 92, ChromaSubsampling::S444, &EncodeMeta::default())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
