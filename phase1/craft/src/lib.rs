//! T1: selected headless PhotoCraft crates, not the full session/document engine.
use photocraft_algo::{FilterParams, apply};
use photocraft_color::PixelFormat;
use photocraft_geom::Rect;
use photocraft_raster::Surface;
use wasm_bindgen::prelude::*;

// Bound memory and CPU exposure in this synchronous spike. Production needs tiles/cancellation.
const MAX_PIXELS: usize = 1024 * 1024;

fn process(bytes: &[u8], width: u32, height: u32, radius: f32) -> Result<Vec<u8>, &'static str> {
    let count = (width as usize)
        .checked_mul(height as usize)
        .ok_or("image dimensions overflow")?;
    if width == 0 || height == 0 || count > MAX_PIXELS || width > 4096 || height > 4096 {
        return Err("image must contain 1..1048576 pixels; each axis <=4096");
    }
    if bytes.len() != count * 4 {
        return Err("expected tightly packed RGBA8");
    }
    if !radius.is_finite() || !(0.0..=32.0).contains(&radius) {
        return Err("radius must be finite and 0..32");
    }
    let bounds = Rect::new(0, 0, width as i32, height as i32);
    let surface = Surface::from_interleaved(PixelFormat::RGBA8, bounds, bytes);
    let result = apply(
        &surface,
        &FilterParams::GaussianBlur { radius },
        bounds,
        bounds,
        None,
    );
    let mut rgba = vec![[0; 4]; count];
    result.read_rgba8_into(bounds, &mut rgba);
    Ok(rgba.into_iter().flatten().collect())
}

/// Transfer-friendly bytes API. JS/WASM still copies at the memory boundary.
#[wasm_bindgen]
pub fn gaussian_blur_rgba(
    bytes: &[u8],
    width: u32,
    height: u32,
    radius: f32,
) -> Result<Vec<u8>, JsValue> {
    process(bytes, width, height, radius).map_err(JsValue::from_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_fixture_matches_browser_wasm_checksum() {
        let n = 256usize;
        let mut input = vec![0; n * n * 4];
        for y in 0..n {
            for x in 0..n {
                let i = (y * n + x) * 4;
                input[i] = if ((x >> 4) ^ (y >> 4)) & 1 != 0 {
                    240
                } else {
                    20
                };
                input[i + 1] = (x * 255 / n) as u8;
                input[i + 2] = (y * 255 / n) as u8;
                input[i + 3] = 255;
            }
        }
        let output = process(&input, n as u32, n as u32, 4.0).unwrap();
        let checksum = output
            .iter()
            .fold(2166136261u32, |h, b| (h ^ *b as u32).wrapping_mul(16777619));
        assert_eq!(checksum, 3228279209);
    }
    #[test]
    fn identity_and_validation() {
        let image = [64, 128, 192, 255].repeat(16);
        assert_eq!(process(&image, 4, 4, 0.0).unwrap(), image);
        assert!(process(&image, 0, 4, 1.0).is_err());
        assert!(process(&image, 4, 4, f32::NAN).is_err());
        assert!(process(&image, 4, 4, 33.0).is_err());
        assert!(process(&image, 1025, 1024, 1.0).is_err());
        assert!(process(&image[..4], 4, 4, 1.0).is_err());
    }
    #[test]
    fn impulse_spreads_without_losing_alpha() {
        let mut image = [0, 0, 0, 255].repeat(32 * 32);
        image[(16 * 32 + 16) * 4] = 255;
        let out = process(&image, 32, 32, 2.0).unwrap();
        assert!(out[(16 * 32 + 16) * 4] > 0 && out[(16 * 32 + 16) * 4] < 255);
        assert!(out[(16 * 32 + 17) * 4] > 0);
        // Transparent pixels outside the document lower edge alpha in upstream apply().
        assert_eq!(out[(16 * 32 + 16) * 4 + 3], 255);
        assert!(
            out[3] < 255,
            "upstream transparent document-edge behavior changed"
        );
    }
}


/// Retained document spike. Owns real PhotoCraft layers/masks inside WASM.
/// Bounds match T1 until tiled documents and allocation budgets are proved.
#[wasm_bindgen]
pub struct CraftDocument {
    doc: photocraft_doc::Document,
    past: Vec<photocraft_doc::Document>,
    future: Vec<photocraft_doc::Document>,
}
#[wasm_bindgen]
impl CraftDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], width: u32, height: u32) -> Result<CraftDocument, JsValue> {
        if width == 0 || height == 0 || width as usize * height as usize > MAX_PIXELS || bytes.len()!=width as usize*height as usize*4 {return Err(JsValue::from_str("invalid bounded RGBA document"));}
        let mut doc=photocraft_doc::Document::new("Raster",photocraft_geom::Size::new(width,height),photocraft_color::ColorMode::Rgb,photocraft_color::SampleType::U8);
        doc.layers.push(photocraft_doc::Layer::new("Background",photocraft_doc::LayerContent::Raster(Surface::from_interleaved(PixelFormat::RGBA8,doc.bounds(),bytes))));
        Ok(Self{doc,past:Vec::new(),future:Vec::new()})
    }
    fn checkpoint(&mut self){self.past.push(self.doc.clone());if self.past.len()>30{self.past.remove(0);}self.future.clear();}
    pub fn layer_count(&self)->usize{self.doc.layers.len()}
    pub fn duplicate_layer(&mut self,index:usize)->Result<(),JsValue>{
        let layer=self.doc.layers.get(index).ok_or_else(||JsValue::from_str("unknown layer"))?.clone();
        if self.doc.layers.len()>=32{return Err(JsValue::from_str("layer budget exceeded"));}
        self.checkpoint();let mut layer=layer;layer.id=photocraft_doc::LayerId::fresh();layer.name=format!("{} copy",layer.name);self.doc.layers.insert(index+1,layer);Ok(())
    }
    pub fn set_visible(&mut self,index:usize,visible:bool)->Result<(),JsValue>{
        if index>=self.doc.layers.len(){return Err(JsValue::from_str("unknown layer"));}self.checkpoint();self.doc.layers[index].visible=visible;Ok(())
    }
    pub fn set_opacity(&mut self,index:usize,opacity:f32)->Result<(),JsValue>{
        if index>=self.doc.layers.len()||!opacity.is_finite()||!(0.0..=1.0).contains(&opacity){return Err(JsValue::from_str("invalid layer opacity"));}self.checkpoint();self.doc.layers[index].opacity=opacity;Ok(())
    }
    pub fn set_mask(&mut self,index:usize,bytes:&[u8])->Result<(),JsValue>{
        let bounds=self.doc.bounds();if index>=self.doc.layers.len()||bytes.len()!=self.doc.size.width as usize*self.doc.size.height as usize{return Err(JsValue::from_str("invalid document mask"));}
        self.checkpoint();self.doc.layers[index].mask=Some(photocraft_doc::LayerMask{surface:Surface::from_interleaved(PixelFormat::GRAY8,bounds,bytes),enabled:true,linked:true,density:1.0,feather:0.0});Ok(())
    }
    pub fn clear_mask(&mut self,index:usize)->Result<(),JsValue>{if index>=self.doc.layers.len(){return Err(JsValue::from_str("unknown layer"));}self.checkpoint();self.doc.layers[index].mask=None;Ok(())}
    pub fn undo(&mut self)->bool{if let Some(doc)=self.past.pop(){self.future.push(self.doc.clone());self.doc=doc;true}else{false}}
    pub fn redo(&mut self)->bool{if let Some(doc)=self.future.pop(){self.past.push(self.doc.clone());self.doc=doc;true}else{false}}
    pub fn query(&self)->String{let rows:Vec<_>=self.doc.layers.iter().map(|l|serde_json::json!({"id":l.id.0.to_string(),"name":l.name,"visible":l.visible,"opacity":l.opacity,"mask":l.mask.is_some()})).collect();serde_json::json!({"width":self.doc.size.width,"height":self.doc.size.height,"layers":rows,"undo":self.past.len(),"redo":self.future.len()}).to_string()}
    pub fn render(&self)->Vec<u8>{let surface=photocraft_compose::flatten_to_surface(&self.doc,PixelFormat::RGBA8,None);let mut pixels=vec![[0;4];self.doc.size.width as usize*self.doc.size.height as usize];surface.read_rgba8_into(self.doc.bounds(),&mut pixels);pixels.into_iter().flatten().collect()}
}

/// Actual upstream selection algorithms on a bounded image-space surface.
#[wasm_bindgen]
pub fn selection_wand_rgba(bytes:&[u8],width:u32,height:u32,x:i32,y:i32,tolerance:f32)->Result<Vec<u8>,JsValue>{
    if width==0||height==0||width as usize*height as usize>MAX_PIXELS||bytes.len()!=width as usize*height as usize*4||!tolerance.is_finite()||!(0.0..=255.0).contains(&tolerance)||x<0||y<0||x>=width as i32||y>=height as i32{return Err(JsValue::from_str("invalid bounded wand request"));}
    let bounds=Rect::new(0,0,width as i32,height as i32);let surface=Surface::from_interleaved(PixelFormat::RGBA8,bounds,bytes);
    let px=photocraft_algo::selection::rgba8_image(&surface,bounds);
    let region=photocraft_algo::selection::wand_region(&px,bounds,(x,y),tolerance,true,false);
    let mask=photocraft_algo::selection::combine_region(None,region.as_ref(),photocraft_algo::selection::SelectionMode::Replace);
    let coverage=photocraft_algo::selection::mask_from_surface(mask.as_ref(),bounds);
    Ok(coverage.into_iter().map(|v|(v*255.0).round() as u8).collect())
}
#[wasm_bindgen]
pub fn selection_polygon(width:u32,height:u32,points:&[f32])->Result<Vec<u8>,JsValue>{
    if width==0||height==0||width as usize*height as usize>MAX_PIXELS||points.len()<6||points.len()>8192||points.len()%2!=0||points.iter().any(|x|!x.is_finite()){return Err(JsValue::from_str("invalid bounded polygon request"));}
    let pairs:Vec<_>=points.chunks_exact(2).map(|p|(p[0],p[1])).collect();let coverage=photocraft_algo::selection::polygon(&pairs,Rect::new(0,0,width as i32,height as i32),false);
    Ok(coverage.into_iter().map(|v|(v*255.0).round() as u8).collect())
}
