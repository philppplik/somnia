//! Read-only, bounded raster-to-PNG adapter. No source writes, animation or color-fidelity claim.
use image::{ImageDecoder, ImageFormat, ImageReader, Limits};
use std::io::Cursor;
pub const MAX_BYTES: usize = 25_000_000;
pub const MAX_EDGE: u32 = 8192;
pub const MAX_PIXELS: u64 = 32_000_000;

fn format(bytes: &[u8], name: &str) -> Result<ImageFormat, String> {
    if let Ok(format) = image::guess_format(bytes) {
        return Ok(format);
    }
    // TGA has no unique leading signature. Explicit extension is a hint only;
    // the real TGA decoder still validates the full file.
    if name
        .rsplit('.')
        .next()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("tga"))
    {
        return Ok(ImageFormat::Tga);
    }
    Err(
        "Unknown image signature. HEIC, RAW, PSD and SVG are not supported by this raster adapter."
            .into(),
    )
}

pub fn decode_png(bytes: &[u8], name: &str) -> Result<Vec<u8>, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("Choose an image of at most 25 MB.".into());
    }
    let format = format(bytes, name)?;
    #[cfg(not(feature = "avif-native"))]
    if format == ImageFormat::Avif {
        return Err("Native AVIF decoding is not enabled. Use an AVIF-capable WebView or convert to PNG first.".into());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_EDGE);
    limits.max_image_height = Some(MAX_EDGE);
    limits.max_alloc = Some(256 * 1024 * 1024);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    let decoder = reader
        .into_decoder()
        .map_err(|e| format!("Image cannot be decoded: {e}"))?;
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 || u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err("Image exceeds the 32 million pixel budget.".into());
    }
    let decoded = image::DynamicImage::from_decoder(decoder)
        .map_err(|e| format!("Image is damaged or unsupported: {e}"))?;
    let rgba = decoded.to_rgba8();
    let mut output = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(rgba)
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let output = output.into_inner();
    if output.len() > MAX_BYTES {
        return Err("Converted PNG exceeds the 25 MB preview budget.".into());
    }
    Ok(output)
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn preview_png(bytes: &[u8], name: &str) -> Result<Vec<u8>, wasm_bindgen::JsValue> {
    decode_png(bytes, name).map_err(|e| wasm_bindgen::JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_enabled_writers_decode_to_identical_rgba() {
        let source = image::RgbaImage::from_pixel(3, 2, image::Rgba([220, 80, 30, 255]));
        for (format, name) in [
            (ImageFormat::Bmp, "x.bmp"),
            (ImageFormat::Ico, "x.ico"),
            (ImageFormat::Tga, "x.tga"),
            (ImageFormat::Tiff, "x.tiff"),
            (ImageFormat::Qoi, "x.qoi"),
            (ImageFormat::Png, "x.png"),
            (ImageFormat::WebP, "x.webp"),
            (ImageFormat::Gif, "x.gif"),
        ] {
            let mut bytes = Cursor::new(Vec::new());
            image::DynamicImage::ImageRgba8(source.clone())
                .write_to(&mut bytes, format)
                .unwrap();
            let png = decode_png(bytes.get_ref(), name).unwrap();
            assert_eq!(
                image::load_from_memory(&png).unwrap().to_rgba8(),
                source,
                "{name}"
            );
            if format != ImageFormat::Tga {
                assert!(decode_png(bytes.get_ref(), "renamed.txt").is_ok());
            }
        }
    }
    #[test]
    fn animation_is_explicitly_first_frame() {
        let mut bytes = Vec::new();
        {
            let mut encoder = image::codecs::gif::GifEncoder::new(&mut bytes);
            for color in [[255, 0, 0, 255], [0, 0, 255, 255]] {
                encoder
                    .encode_frame(image::Frame::new(image::RgbaImage::from_pixel(
                        2,
                        2,
                        image::Rgba(color),
                    )))
                    .unwrap();
            }
        }
        let png = decode_png(&bytes, "animation.gif").unwrap();
        assert_eq!(
            image::load_from_memory(&png)
                .unwrap()
                .to_rgba8()
                .get_pixel(0, 0)
                .0,
            [255, 0, 0, 255]
        );
    }
    #[test]
    fn pnm_and_corrupt_and_budget() {
        let png = decode_png(b"P6\n1 1\n255\n\x12\x34\x56", "x.ppm").unwrap();
        assert_eq!(
            image::load_from_memory(&png)
                .unwrap()
                .to_rgb8()
                .get_pixel(0, 0)
                .0,
            [18, 52, 86]
        );
        for bytes in [&b"BMbad"[..], &b"not an image"[..], &b""[..]] {
            assert!(decode_png(bytes, "x.bmp").is_err());
        }
        assert!(decode_png(&vec![0; MAX_BYTES + 1], "x.png").is_err());
        assert!(decode_png(b"P6\n10000 1\n255\n", "large.ppm").is_err());
        assert!(decode_png(b"P6\n8192 8192\n255\n", "bomb.ppm")
            .unwrap_err()
            .contains("pixel budget"));
        assert!(decode_png(b"garbage", "renamed.tga").is_err());
    }
}
