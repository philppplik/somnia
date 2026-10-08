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
