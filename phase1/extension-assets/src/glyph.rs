use super::*;
const PAINT: &[&str] = &[
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "fill-rule",
    "clip-rule",
    "transform",
];
fn allowed(tag: &str, attr: &str) -> bool {
    PAINT.contains(&attr)
        || match tag {
            "svg" => attr == "viewBox",
            "g" => false,
            "path" => attr == "d",
            "rect" => ["x", "y", "width", "height", "rx", "ry"].contains(&attr),
            "circle" => ["cx", "cy", "r"].contains(&attr),
            "ellipse" => ["cx", "cy", "rx", "ry"].contains(&attr),
            "line" => ["x1", "y1", "x2", "y2"].contains(&attr),
            "polyline" | "polygon" => attr == "points",
            _ => false,
        }
}
fn numbers(value: &str, bound: f64) -> bool {
    let nums = svgtypes::NumberListParser::from(value).collect::<Result<Vec<_>, _>>();
    matches!(nums,Ok(ref v) if !v.is_empty() && v.iter().all(|n|n.is_finite()&& *n>=-bound && *n<=if bound==96.{120.}else{bound}))
}
pub fn convert(s: &Source) -> Result<Vec<Derivative>, Diagnostic> {
    let bad = || error(s, "ASSET_SVG_FORBIDDEN");
    if s.bytes.len() > 32 * 1024 {
        return Err(error(s, "ASSET_BYTES_EXCEEDED"));
    }
    if !s.path.ends_with(".svg") {
        return Err(error(s, "ASSET_TYPE_MISMATCH"));
    }
    let text = std::str::from_utf8(&s.bytes).map_err(|_| bad())?;
    // XML declarations are harmless but processing instructions / DTDs are not.
    if text.contains("<!") || text.contains("<?") {
        return Err(bad());
    }
    let doc = roxmltree::Document::parse(text).map_err(|_| bad())?;
    let root = doc.root_element();
    if root.tag_name().name() != "svg"
        || root.tag_name().namespace() != Some("http://www.w3.org/2000/svg")
        || root.attribute("viewBox") != Some("0 0 24 24")
    {
        return Err(bad());
    }
    let mut count = 0;
    let mut segments = 0;
    let mut points = 0;
    for node in doc.descendants() {
        if node.is_text() && !node.text().unwrap_or("").trim().is_empty() {
            return Err(bad());
        }
        if !node.is_element() {
            continue;
        }
        count += 1;
        if count > 256 || node.ancestors().filter(|n| n.is_element()).count() > 16 {
            return Err(bad());
        }
        let tag = node.tag_name().name();
        if ![
            "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
        ]
        .contains(&tag)
            || node.tag_name().namespace() != Some("http://www.w3.org/2000/svg")
        {
            return Err(bad());
        }
        for a in node.attributes() {
            let k = a.name();
            let v = a.value();
            if a.namespace().is_some() || !allowed(tag, k) {
                return Err(bad());
            }
            match k {
                "viewBox" => {
                    if v != "0 0 24 24" {
                        return Err(bad());
                    }
                }
                "fill" | "stroke" => {
                    if !["none", "currentColor"].contains(&v) {
                        return Err(bad());
                    }
                }
                "stroke-width" => {
                    let n = v.parse::<f64>().map_err(|_| bad())?;
                    if !n.is_finite() || n <= 0. || n > 4. {
                        return Err(bad());
                    }
                }
                "stroke-linecap" => {
                    if !["butt", "round", "square"].contains(&v) {
                        return Err(bad());
                    }
                }
                "stroke-linejoin" => {
                    if !["miter", "round", "bevel"].contains(&v) {
                        return Err(bad());
                    }
                }
                "fill-rule" | "clip-rule" => {
                    if !["nonzero", "evenodd"].contains(&v) {
                        return Err(bad());
                    }
                }
                "transform" => {
                    for t in svgtypes::TransformListParser::from(v) {
                        let t = t.map_err(|_| bad())?;
                        let values = match t {
                            svgtypes::TransformListToken::Matrix { a, b, c, d, e, f } => {
                                vec![a, b, c, d, e, f]
                            }
                            svgtypes::TransformListToken::Translate { tx, ty } => vec![tx, ty],
                            svgtypes::TransformListToken::Scale { sx, sy } => vec![sx, sy],
                            svgtypes::TransformListToken::Rotate { angle } => vec![angle],
                            svgtypes::TransformListToken::SkewX { angle }
                            | svgtypes::TransformListToken::SkewY { angle } => vec![angle],
                        };
                        if values.iter().any(|n| !n.is_finite()) {
                            return Err(bad());
                        }
                    }
                    let t = svgtypes::Transform::from_str(v).map_err(|_| bad())?;
                    if [t.a, t.b, t.c, t.d, t.e, t.f]
                        .iter()
                        .any(|n| !n.is_finite() || n.abs() > 64.)
                    {
                        return Err(bad());
                    }
                }
                "d" => {
                    for p in svgtypes::PathParser::from(v) {
                        p.map_err(|_| bad())?;
                        segments += 1;
                        if segments > 4096 {
                            return Err(bad());
                        }
                    } // Check every numeric operand, including relative deltas.
                    let numeric = v
                        .chars()
                        .map(|c| {
                            if c.is_ascii_alphabetic() && c != 'e' && c != 'E' {
                                ' '
                            } else {
                                c
                            }
                        })
                        .collect::<String>();
                    if !numbers(&numeric, 96.) {
                        return Err(bad());
                    }
                }
                "points" => {
                    let n = svgtypes::NumberListParser::from(v)
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|_| bad())?;
                    points += n.len() / 2;
                    if n.len() % 2 != 0 || points > 8192 || !numbers(v, 96.) {
                        return Err(bad());
                    }
                }
                _ => {
                    if !numbers(v, 96.) {
                        return Err(bad());
                    }
                }
            }
        }
    }
    use std::str::FromStr;
    let tree = resvg::usvg::Tree::from_str(
        &text.replace("currentColor", "#ffffff"),
        &resvg::usvg::Options::default(),
    )
    .map_err(|_| bad())?;
    let bounds = tree.root().abs_stroke_bounding_box();
    if bounds.left() < 0. || bounds.top() < 0. || bounds.right() > 24. || bounds.bottom() > 24. {
        return Err(bad());
    }
    fn bounded(group: &resvg::usvg::Group) -> bool {
        group.children().iter().all(|n| {
            let t = n.abs_transform();
            [t.sx, t.kx, t.ky, t.sy, t.tx, t.ty]
                .iter()
                .all(|v| v.is_finite() && v.abs() <= 64.)
                && match n {
                    resvg::usvg::Node::Group(g) => bounded(g),
                    _ => true,
                }
        })
    }
    if !bounded(tree.root()) {
        return Err(bad());
    }
    let mut out = Vec::new();
    let mut total = 0;
    for size in [16, 20, 24, 32, 40, 48] {
        let mut pix = resvg::tiny_skia::Pixmap::new(size, size).ok_or_else(bad)?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(size as f32 / 24., size as f32 / 24.),
            &mut pix.as_mut(),
        );
        if !pix.data().chunks_exact(4).any(|p| p[3] != 0) {
            return Err(error(s, "ASSET_EMPTY"));
        }
        let img = RgbaImage::from_fn(size, size, |x, y| {
            image::Rgba([255, 255, 255, pix.pixel(x, y).unwrap().alpha()])
        });
        let d = output(s, &img)?;
        total += d.bytes.len();
        if total > MIB {
            return Err(error(s, "ASSET_OUTPUT_EXCEEDED"));
        }
        out.push(d);
    }
    Ok(out)
}
