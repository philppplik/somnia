//! Synthetic, project-owned fixtures. No upstream test assets.
use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::{fs, io::Cursor, path::PathBuf};
fn main() {
    let out = PathBuf::from(std::env::args().nth(1).expect("output directory"));
    fs::create_dir_all(&out).unwrap();
    let mut source = RgbaImage::new(240, 160);
    for (x, y, pixel) in source.enumerate_pixels_mut() {
        *pixel = if x < 80 {
            Rgba([124, 58, 237, 255])
        } else if y < 80 {
            Rgba([20, 184, 166, 255])
        } else {
            Rgba([251, 146, 60, 255])
        };
    }
    for (format, ext) in [
        (ImageFormat::Bmp, "bmp"),
        (ImageFormat::Ico, "ico"),
        (ImageFormat::Tga, "tga"),
        (ImageFormat::Tiff, "tiff"),
        (ImageFormat::Qoi, "qoi"),
        (ImageFormat::Png, "png"),
        (ImageFormat::Gif, "gif"),
    ] {
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(source.clone())
            .write_to(&mut bytes, format)
            .unwrap();
        fs::write(out.join(format!("raster.{ext}")), bytes.into_inner()).unwrap();
    }
    fs::write(
        out.join("raster.ppm"),
        b"P6\n2 1\n255\n\x7c\x3a\xed\x14\xb8\xa6",
    )
    .unwrap();
}
