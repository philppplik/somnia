//! Byte-only converter. Call only inside the owner's networkless, resource-limited worker.
//! No original source or publisher path is returned as a serving handle.
use image::{ImageDecoder, ImageReader, RgbaImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, io::Cursor};
pub const PIPELINE_VERSION: &str = "somnia-assets-1.0.0";
const MIB: usize = 1_048_576;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    Icon,
    IconDark,
    Screenshot,
    Cover,
    Glyph,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub field: String,
    pub path: String,
    pub role: Role,
    pub bytes: Vec<u8>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub code: String,
    pub field: String,
    pub path: String,
}
fn error(s: &Source, code: &str) -> Diagnostic {
    Diagnostic {
        code: code.into(),
        field: s.field.clone(),
        path: s.path.clone(),
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Derivative {
    pub role: Role,
    pub field: String,
    pub width: u32,
    pub height: u32,
    pub mime: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
    pub source_sha256: String,
    pub pipeline_version: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub package_digest: String,
    pub pipeline_version: String,
    pub entries: Vec<Derivative>,
}
pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn valid_path(path: &str) -> bool {
    if path.len() > 180 || path.is_empty() || !path.is_ascii() {
        return false;
    }
    path.split('/').all(|s| {
        let base = s.split('.').next().unwrap_or("").to_ascii_uppercase();
        !s.is_empty()
            && s.len() <= 64
            && s.as_bytes()[0].is_ascii_alphanumeric()
            && !s.ends_with('.')
            && s.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
            && !["CON", "PRN", "AUX", "NUL"].contains(&base.as_str())
            && !(base.len() == 4
                && (base.starts_with("COM") || base.starts_with("LPT"))
                && matches!(base.as_bytes()[3], b'1'..=b'9'))
    })
}
/// Results are returned only if every declared source succeeds. The caller commits
/// the inventory and immutable package digest together, never individual entries.
pub fn convert_release(
    package_digest: &str,
    sources: &[Source],
) -> Result<Inventory, Vec<Diagnostic>> {
    let mut errors = Vec::new();
    let mut paths = HashSet::new();
    let mut fields = HashSet::new();
    if package_digest.len() != 64 || !package_digest.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(vec![Diagnostic {
            code: "ASSET_REFERENCE_UNKNOWN".into(),
            field: "packageDigest".into(),
            path: String::new(),
        }]);
    }
    let total = sources
        .iter()
        .fold(0usize, |a, s| a.saturating_add(s.bytes.len()));
    let icons = sources.iter().filter(|s| s.role == Role::Icon).count();
    for s in sources {
        if !valid_path(&s.path)
            || !paths.insert(s.path.to_ascii_lowercase())
            || !fields.insert(&s.field)
        {
            errors.push(error(s, "ASSET_PATH_INVALID"));
        }
        if total > 48 * MIB {
            errors.push(error(s, "ASSET_BYTES_EXCEEDED"));
        }
        if s.role == Role::IconDark && icons != 1 {
            errors.push(error(s, "ASSET_REFERENCE_UNKNOWN"));
        }
    }
    for role in [Role::Icon, Role::IconDark, Role::Cover] {
        if sources.iter().filter(|s| s.role == role).count() > 1 {
            errors.push(Diagnostic {
                code: "ASSET_REFERENCE_UNKNOWN".into(),
                field: format!("{role:?}"),
                path: String::new(),
            });
        }
    }
    if sources
        .iter()
        .filter(|s| s.role == Role::Screenshot)
        .count()
        > 8
        || sources.iter().filter(|s| s.role == Role::Glyph).count() > 32
    {
        errors.push(Diagnostic {
            code: "ASSET_BYTES_EXCEEDED".into(),
            field: "assets".into(),
            path: String::new(),
        });
    }
    if !errors.is_empty() {
        return Err(errors);
    }
    let mut entries = Vec::new();
    let mut encoded = 0;
    for source in sources {
        match convert(source) {
            Ok(output) => {
                encoded += output.iter().map(|d| d.bytes.len()).sum::<usize>();
                if encoded > 512 * MIB {
                    errors.push(error(source, "ASSET_OUTPUT_EXCEEDED"));
                } else {
                    entries.extend(output);
                }
            }
            Err(e) => errors.push(e),
        }
    }
    if !errors.is_empty() {
        return Err(errors);
    }
    Ok(Inventory {
        package_digest: package_digest.to_ascii_lowercase(),
        pipeline_version: PIPELINE_VERSION.into(),
        entries,
    })
}
fn png_structure(bytes: &[u8]) -> Result<(), &'static str> {
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("ASSET_TYPE_MISMATCH");
    }
    let mut p = 8;
    let mut first = true;
    let mut ended = false;
    while p + 12 <= bytes.len() {
        let n = u32::from_be_bytes(bytes[p..p + 4].try_into().unwrap()) as usize;
        let end = p
            .checked_add(12)
            .and_then(|v| v.checked_add(n))
            .ok_or("ASSET_DECODE_FAILED")?;
        if end > bytes.len() {
            return Err("ASSET_DECODE_FAILED");
        }
        let kind = &bytes[p + 4..p + 8];
        if first && (kind != b"IHDR" || n != 13) {
            return Err("ASSET_DECODE_FAILED");
        }
        first = false;
        if [b"acTL", b"fcTL", b"fdAT"].contains(&kind.try_into().unwrap()) {
            return Err("ASSET_ANIMATED");
        }
        // ICC conversion is not supported in pipeline 1; fail closed rather than
        // relabeling non-sRGB pixels. sRGB and standard gamma metadata are allowed.
        if kind == b"cHRM" || kind == b"iCCP" {
            return Err("ASSET_TYPE_MISMATCH");
        }
        if kind == b"gAMA"
            && (n != 4 || u32::from_be_bytes(bytes[p + 8..p + 12].try_into().unwrap()) != 45455)
        {
            return Err("ASSET_TYPE_MISMATCH");
        }
        if crc32fast::hash(&bytes[p + 4..p + 8 + n])
            != u32::from_be_bytes(bytes[p + 8 + n..end].try_into().unwrap())
        {
            return Err("ASSET_DECODE_FAILED");
        }
        p = end;
        if kind == b"IEND" {
            if n != 0 {
                return Err("ASSET_DECODE_FAILED");
            }
            ended = true;
            break;
        }
    }
    if !ended || p != bytes.len() {
        return Err("ASSET_DECODE_FAILED");
    }
    Ok(())
}
fn jpeg_structure(bytes: &[u8]) -> Result<(), &'static str> {
    if !bytes.starts_with(&[255, 216]) {
        return Err("ASSET_TYPE_MISMATCH");
    }
    let mut p = 2;
    let mut scan = false;
    while p < bytes.len() {
        if bytes[p] != 255 {
            if scan {
                p += 1;
                continue;
            }
            return Err("ASSET_DECODE_FAILED");
        }
        p += 1;
        while p < bytes.len() && bytes[p] == 255 {
            p += 1;
        }
        if p == bytes.len() {
            return Err("ASSET_DECODE_FAILED");
        }
        let marker = bytes[p];
        p += 1;
        if scan && (marker == 0 || (208..=215).contains(&marker)) {
            continue;
        }
        if marker == 217 {
            return if p == bytes.len() {
                Ok(())
            } else {
                Err("ASSET_DECODE_FAILED")
            };
        }
        if marker == 216 {
            return Err("ASSET_ANIMATED");
        }
        if p + 2 > bytes.len() {
            return Err("ASSET_DECODE_FAILED");
        }
        let n = u16::from_be_bytes([bytes[p], bytes[p + 1]]) as usize;
        if n < 2 || p + n > bytes.len() {
            return Err("ASSET_DECODE_FAILED");
        }
        let data = &bytes[p + 2..p + n];
        if marker == 226 && (data.starts_with(b"ICC_PROFILE") || data.starts_with(b"MPF")) {
            return Err("ASSET_TYPE_MISMATCH");
        }
        p += n;
        scan = marker == 218;
    }
    Err("ASSET_DECODE_FAILED")
}
fn decode(s: &Source) -> Result<RgbaImage, Diagnostic> {
    let icon = matches!(s.role, Role::Icon | Role::IconDark);
    let cap = if icon { 2 * MIB } else { 8 * MIB };
    if s.bytes.len() > cap {
        return Err(error(s, "ASSET_BYTES_EXCEEDED"));
    }
    let format = if s.path.ends_with(".png") {
        png_structure(&s.bytes).map_err(|c| error(s, c))?;
        image::ImageFormat::Png
    } else if !icon && (s.path.ends_with(".jpg") || s.path.ends_with(".jpeg")) {
        jpeg_structure(&s.bytes).map_err(|c| error(s, c))?;
        image::ImageFormat::Jpeg
    } else {
        return Err(error(s, "ASSET_TYPE_MISMATCH"));
    };
    let mut reader = ImageReader::with_format(Cursor::new(&s.bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(3840);
    limits.max_image_height = Some(3840);
    limits.max_alloc = Some(128 * MIB as u64);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| error(s, "ASSET_DECODE_FAILED"))?;
    let (w, h) = decoder.dimensions();
    if u64::from(w) * u64::from(h) > 8_294_400 {
        return Err(error(s, "ASSET_PIXELS_EXCEEDED"));
    }
    let valid = match s.role {
        Role::Icon | Role::IconDark => w == 512 && h == 512,
        Role::Cover => w == 1600 && h == 900,
        _ => (640..=3840).contains(&w) && (640..=3840).contains(&h) && w <= 2 * h && h <= 2 * w,
    };
    if !valid {
        return Err(error(s, "ASSET_DIMENSIONS"));
    }
    let orientation = decoder
        .orientation()
        .map_err(|_| error(s, "ASSET_DECODE_FAILED"))?;
    let mut decoded =
        image::DynamicImage::from_decoder(decoder).map_err(|_| error(s, "ASSET_DECODE_FAILED"))?;
    decoded.apply_orientation(orientation);
    if s.role == Role::Cover && (decoded.width() != 1600 || decoded.height() != 900) {
        return Err(error(s, "ASSET_DIMENSIONS"));
    }
    let mut rgba = decoded.into_rgba8();
    if icon && !rgba.pixels().any(|p| p[3] != 0) {
        return Err(error(s, "ASSET_EMPTY"));
    }
    if !icon {
        for p in rgba.pixels_mut() {
            let a = u32::from(p[3]);
            for c in 0..3 {
                p[c] = ((u32::from(p[c]) * a + 255 * (255 - a) + 127) / 255) as u8;
            }
            p[3] = 255;
        }
    }
    Ok(rgba)
}
/// Lanczos filtering in premultiplied alpha space prevents dark transparent halos.
fn resize(image: &RgbaImage, w: u32, h: u32) -> RgbaImage {
    let src = image::ImageBuffer::from_fn(image.width(), image.height(), |x, y| {
        let p = image.get_pixel(x, y);
        let a = f32::from(p[3]) / 255.;
        image::Rgba([
            f32::from(p[0]) / 255. * a,
            f32::from(p[1]) / 255. * a,
            f32::from(p[2]) / 255. * a,
            a,
        ])
    });
    let resized = image::imageops::resize(&src, w, h, image::imageops::FilterType::Lanczos3);
    image::ImageBuffer::from_fn(w, h, |x, y| {
        let p = resized.get_pixel(x, y);
        let a = p[3].max(0.);
        image::Rgba([
            if a > 0. {
                (p[0] / a * 255.).clamp(0., 255.).round() as u8
            } else {
                0
            },
            if a > 0. {
                (p[1] / a * 255.).clamp(0., 255.).round() as u8
            } else {
                0
            },
            if a > 0. {
                (p[2] / a * 255.).clamp(0., 255.).round() as u8
            } else {
                0
            },
            (a.clamp(0., 1.) * 255.).round() as u8,
        ])
    })
}
fn output(s: &Source, img: &RgbaImage) -> Result<Derivative, Diagnostic> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, img.width(), img.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
        encoder
            .write_header()
            .and_then(|mut w| w.write_image_data(img.as_raw()))
            .map_err(|_| error(s, "ASSET_DECODE_FAILED"))?;
    }
    // Independent decoder reopens canonical output before inventory creation.
    let check = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .map_err(|_| error(s, "ASSET_DECODE_FAILED"))?;
    if check.width() != img.width() || check.height() != img.height() {
        return Err(error(s, "ASSET_DIMENSIONS"));
    }
    Ok(Derivative {
        role: s.role.clone(),
        field: s.field.clone(),
        width: img.width(),
        height: img.height(),
        mime: "image/png".into(),
        sha256: digest(&bytes),
        bytes,
        source_sha256: digest(&s.bytes),
        pipeline_version: PIPELINE_VERSION.into(),
    })
}
fn convert(s: &Source) -> Result<Vec<Derivative>, Diagnostic> {
    if s.role == Role::Glyph {
        return glyph::convert(s);
    }
    let img = decode(s)?;
    let dimensions: Vec<(u32, u32)> = match s.role {
        Role::Icon | Role::IconDark => [512, 256, 128, 64, 32, 16]
            .iter()
            .map(|&n| (n, n))
            .collect(),
        Role::Cover => vec![(1600, 900), (800, 450), (400, 225)],
        _ => {
            let mut d = vec![(img.width(), img.height())];
            for max in [1600, 800, 400] {
                let longest = img.width().max(img.height());
                if longest > max {
                    d.push((
                        (u64::from(img.width()) * u64::from(max) / u64::from(longest)) as u32,
                        (u64::from(img.height()) * u64::from(max) / u64::from(longest)) as u32,
                    ));
                }
            }
            d
        }
    };
    let mut out = Vec::new();
    let mut total = 0;
    for (w, h) in dimensions {
        let scaled = if (w, h) == img.dimensions() {
            img.clone()
        } else {
            resize(&img, w, h)
        };
        let d = output(s, &scaled)?;
        total += d.bytes.len();
        if total
            > if matches!(s.role, Role::Icon | Role::IconDark) {
                4 * MIB
            } else {
                48 * MIB
            }
        {
            return Err(error(s, "ASSET_OUTPUT_EXCEEDED"));
        }
        out.push(d);
    }
    Ok(out)
}
mod glyph;
#[cfg(test)]
mod tests {
    use super::*;
    fn source(role: Role, path: &str, img: RgbaImage) -> Source {
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(
                &mut Cursor::new(&mut bytes),
                if path.ends_with(".jpg") {
                    image::ImageFormat::Jpeg
                } else {
                    image::ImageFormat::Png
                },
            )
            .unwrap();
        Source {
            field: format!("{role:?}"),
            path: path.into(),
            role,
            bytes,
        }
    }
    fn icon() -> Source {
        source(
            Role::Icon,
            "assets/icon.png",
            RgbaImage::from_fn(512, 512, |x, y| {
                image::Rgba([230, 10, 40, if x > 64 && y > 64 { 255 } else { 0 }])
            }),
        )
    }
    #[test]
    fn valid_transparent_icon_derivatives() {
        let s = icon();
        let i = convert_release(&"a".repeat(64), &[s.clone()]).unwrap();
        assert_eq!(
            i.entries.iter().map(|x| x.width).collect::<Vec<_>>(),
            vec![512, 256, 128, 64, 32, 16]
        );
        for d in i.entries {
            assert_eq!(d.source_sha256, digest(&s.bytes));
            assert_eq!(d.sha256, digest(&d.bytes));
            assert_eq!(d.mime, "image/png");
            let img = image::load_from_memory(&d.bytes).unwrap().into_rgba8();
            assert_eq!(img.get_pixel(0, 0)[3], 0);
        }
    }
    #[test]
    fn premultiplied_resizing_does_not_create_dark_halos() {
        let s = icon();
        let ds = convert(&s).unwrap();
        let img = image::load_from_memory(&ds[4].bytes).unwrap().into_rgba8();
        for p in img.pixels().filter(|p| p[3] > 0) {
            assert!(p[0] >= 225);
            assert!(p[2] >= 35);
        }
    }
    #[test]
    fn invalid_icon_sizes_and_empty_alpha() {
        for (w, h) in [(511, 512), (512, 513), (256, 512)] {
            let s = source(Role::Icon, "a.png", RgbaImage::new(w, h));
            assert_eq!(convert(&s).unwrap_err().code, "ASSET_DIMENSIONS");
        }
        assert_eq!(
            convert(&source(Role::Icon, "a.png", RgbaImage::new(512, 512)))
                .unwrap_err()
                .code,
            "ASSET_EMPTY"
        );
    }
    #[test]
    fn optional_dark_failure_rejects_entire_release() {
        let mut dark = icon();
        dark.role = Role::IconDark;
        dark.field = "icon@dark".into();
        dark.path = "dark.png".into();
        dark.bytes.truncate(60);
        let result = convert_release(&"a".repeat(64), &[icon(), dark]);
        assert!(result.is_err());
    }
    #[test]
    fn static_png_trailing_corrupt_and_animated_inputs() {
        let mut s = icon();
        s.bytes.push(0);
        assert_eq!(convert(&s).unwrap_err().code, "ASSET_DECODE_FAILED");
        let mut s = icon();
        s.bytes[25] ^= 1;
        assert_eq!(convert(&s).unwrap_err().code, "ASSET_DECODE_FAILED");
        let mut s = icon();
        let mut chunk = vec![];
        chunk.extend(8u32.to_be_bytes());
        chunk.extend(b"acTL");
        chunk.extend([0, 0, 0, 1, 0, 0, 0, 0]);
        chunk.extend(crc32fast::hash(&chunk[4..]).to_be_bytes());
        s.bytes.splice(33..33, chunk);
        assert_eq!(convert(&s).unwrap_err().code, "ASSET_ANIMATED");
    }
    #[test]
    fn paths_and_case_collisions() {
        for p in [
            "../a.png",
            "a//b.png",
            "/a.png",
            "a\\b.png",
            "C:/a.png",
            "a%20.png",
            "a/CON.png",
            "NUL.svg",
            "LPT9.jpg",
            "a./b.png",
        ] {
            assert!(!valid_path(p), "{p}");
        }
        let mut b = icon();
        b.field = "other".into();
        b.role = Role::IconDark;
        b.path = "ASSETS/ICON.PNG".into();
        assert!(convert_release(&"b".repeat(64), &[icon(), b])
            .unwrap_err()
            .iter()
            .any(|e| e.code == "ASSET_PATH_INVALID"));
    }
    #[test]
    fn gallery_composite_and_preview_dimensions() {
        let s = source(
            Role::Screenshot,
            "screen.png",
            RgbaImage::from_pixel(1920, 1080, image::Rgba([0, 0, 0, 0])),
        );
        let d = convert(&s).unwrap();
        assert_eq!(
            d.iter().map(|d| (d.width, d.height)).collect::<Vec<_>>(),
            vec![(1920, 1080), (1600, 900), (800, 450), (400, 225)]
        );
        assert_eq!(
            image::load_from_memory(&d[0].bytes)
                .unwrap()
                .into_rgba8()
                .get_pixel(0, 0)
                .0,
            [255, 255, 255, 255]
        );
    }
    #[test]
    fn no_upscale_and_cover_sizes() {
        let s = source(
            Role::Screenshot,
            "screen.png",
            RgbaImage::from_pixel(640, 640, image::Rgba([30, 40, 50, 255])),
        );
        assert_eq!(convert(&s).unwrap().len(), 2);
        let s = source(Role::Cover, "cover.png", RgbaImage::new(1600, 900));
        assert_eq!(
            convert(&s)
                .unwrap()
                .iter()
                .map(|d| (d.width, d.height))
                .collect::<Vec<_>>(),
            vec![(1600, 900), (800, 450), (400, 225)]
        );
    }
    #[test]
    fn jpeg_and_signature_mismatch() {
        let s = source(
            Role::Screenshot,
            "screen.jpg",
            RgbaImage::from_pixel(640, 800, image::Rgba([30, 40, 50, 255])),
        );
        assert_eq!(convert(&s).unwrap()[0].height, 800);
        let mut s = icon();
        s.path = "icon.jpg".into();
        assert_eq!(convert(&s).unwrap_err().code, "ASSET_TYPE_MISMATCH");
    }
    fn glyph(body: &str) -> Source {
        Source {
            field: "glyphs.check".into(),
            path: "glyphs/check.svg".into(),
            role: Role::Glyph,
            bytes: format!(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\">{body}</svg>"
            )
            .into_bytes(),
        }
    }
    #[test]
    fn glyph_mask_dimensions_and_alpha() {
        let s=glyph("<path d=\"M4 12 L10 18 L20 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/>");
        let ds = convert(&s).unwrap();
        assert_eq!(
            ds.iter().map(|d| d.width).collect::<Vec<_>>(),
            vec![16, 20, 24, 32, 40, 48]
        );
        for d in ds {
            let img = image::load_from_memory(&d.bytes).unwrap().into_rgba8();
            assert!(img.pixels().any(|p| p[3] > 0));
            assert!(img
                .pixels()
                .all(|p| p[0] == 255 && p[1] == 255 && p[2] == 255));
        }
    }
    #[test]
    fn glyph_rejects_active_unknown_and_empty() {
        for body in [
            "<script/>",
            "<path d=\"M0 0L24 24\" style=\"fill:red\"/>",
            "<use href=\"https://evil\"/>",
            "<g onclick=\"x\"/>",
            "<path id=\"x\"/>",
            "<rect x=\"NaN\"/>",
            "<rect x=\"200\"/>",
            "<g transform=\"translate(80)\"/>",
            "<path d=\"M1 1\" stroke-width=\"5\"/>",
            "<path d=\"M1 1\" fill=\"red\"/>",
        ] {
            assert_eq!(
                convert(&glyph(body)).unwrap_err().code,
                "ASSET_SVG_FORBIDDEN",
                "{body}"
            );
        }
        assert_eq!(
            convert(&glyph(
                "<rect x=\"80\" y=\"80\" width=\"1\" height=\"1\" fill=\"currentColor\"/>"
            ))
            .unwrap_err()
            .code,
            "ASSET_SVG_FORBIDDEN"
        );
    }
    #[test]
    fn glyph_entities_duplicate_attributes_and_depth() {
        for text in [
            "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg/>",
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' viewBox='0 0 24 24'/>",
        ] {
            let mut s = glyph("");
            s.bytes = text.as_bytes().to_vec();
            assert!(convert(&s).is_err());
        }
        assert!(convert(&glyph(&format!(
            "{}{}",
            "<g>".repeat(17),
            "</g>".repeat(17)
        )))
        .is_err());
    }
}
#[cfg(test)]
mod extra_tests {
    use super::*;
    #[test]
    fn palette_png_is_canonical_rgba() {
        let mut bytes = vec![];
        {
            let mut e = png::Encoder::new(&mut bytes, 512, 512);
            e.set_color(png::ColorType::Indexed);
            e.set_depth(png::BitDepth::Eight);
            e.set_palette(vec![10, 20, 30, 210, 220, 230]);
            e.set_trns(vec![0, 255]);
            let mut writer = e.write_header().unwrap();
            let mut pixels = vec![1; 512 * 512];
            pixels[0] = 0;
            writer.write_image_data(&pixels).unwrap();
        }
        let s = Source {
            field: "icon".into(),
            path: "indexed.png".into(),
            role: Role::Icon,
            bytes,
        };
        let out = convert(&s).unwrap();
        let img = image::load_from_memory(&out[0].bytes).unwrap().into_rgba8();
        assert_eq!(img.get_pixel(0, 0)[3], 0);
        assert_eq!(img.get_pixel(1, 0).0, [210, 220, 230, 255]);
    }
    #[test]
    fn jpeg_orientation_is_applied_then_metadata_removed() {
        let img = image::RgbImage::from_pixel(640, 800, image::Rgb([100, 150, 200]));
        let mut jpeg = vec![];
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
            .unwrap();
        let mut exif =
            b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0".to_vec();
        let mut segment = vec![255, 225];
        segment.extend(((exif.len() + 2) as u16).to_be_bytes());
        segment.append(&mut exif);
        jpeg.splice(2..2, segment);
        let s = Source {
            field: "screenshots[0]".into(),
            path: "oriented.jpg".into(),
            role: Role::Screenshot,
            bytes: jpeg,
        };
        let out = convert(&s).unwrap();
        assert_eq!((out[0].width, out[0].height), (800, 640));
        assert!(!out[0].bytes.windows(4).any(|w| w == b"eXIf"));
    }
}
