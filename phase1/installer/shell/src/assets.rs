//! Embedded UI assets served over a custom protocol (no files on disk, strict CSP).
pub fn get(path: &str) -> Option<(&'static str, &'static [u8])> {
    let p = path.trim_start_matches('/');
    Some(match if p.is_empty() { "index.html" } else { p } {
        "index.html" => (
            "text/html; charset=utf-8",
            include_bytes!("../../ui/index.html"),
        ),
        "style.css" => (
            "text/css; charset=utf-8",
            include_bytes!("../../ui/style.css"),
        ),
        "app.js" => (
            "text/javascript; charset=utf-8",
            include_bytes!("../../ui/app.js"),
        ),
        "bridge.js" => (
            "text/javascript; charset=utf-8",
            include_bytes!("../../ui/bridge.js"),
        ),
        "logic.mjs" => (
            "text/javascript; charset=utf-8",
            include_bytes!("../../ui/logic.mjs"),
        ),
        "mark.svg" => ("image/svg+xml", include_bytes!("../../ui/mark.svg")),
        "fonts/Inter.woff2" => ("font/woff2", include_bytes!("../../ui/fonts/Inter.woff2")),
        _ => return None,
    })
}
