use image::{ImageFormat, Rgba, RgbaImage};
use somnia_extension_assets::{convert_release, digest, Role, Source};
use std::{io::Cursor, path::Path};
fn main() {
    let dir = std::env::args().nth(1).expect("output directory");
    std::fs::create_dir_all(&dir).unwrap();
    let mut sources = vec![];
    for (role, path, color) in [
        (Role::Icon, "icon.png", [80, 40, 210, 255]),
        (Role::IconDark, "dark.png", [190, 165, 255, 255]),
    ] {
        let mut img = RgbaImage::new(512, 512);
        for y in 64..448 {
            for x in 64..448 {
                if x < 144 || y < 144 || y > 368 {
                    img.put_pixel(x, y, Rgba(color));
                }
            }
        }
        let mut bytes = vec![];
        img.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        sources.push(Source {
            field: path.into(),
            path: path.into(),
            role,
            bytes,
        });
    }
    let bytes=br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12 L10 18 L20 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>"#.to_vec();
    sources.push(Source {
        field: "glyphs.check".into(),
        path: "check.svg".into(),
        role: Role::Glyph,
        bytes,
    });
    let inventory = convert_release(&digest(b"visual-fixture-package"), &sources).unwrap();
    for entry in inventory.entries {
        std::fs::write(
            Path::new(&dir).join(format!("{:?}-{}.png", entry.role, entry.width)),
            entry.bytes,
        )
        .unwrap();
    }
}
