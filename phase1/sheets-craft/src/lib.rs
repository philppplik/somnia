//! Headless, byte-only adapter for the Somnia Sheets Studio. The worker owns one session; no UI or filesystem.
use gridcraft_engine::model::{style::{Color, HAlign, Underline}, Style};
use gridcraft_engine::numfmt::{format_value, FormatColor, NumberFormat};
use gridcraft_engine::{DocState, Session, core::CellRef};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_INPUT: usize = 32 * 1024 * 1024;
const MAX_FORMAT_CELLS: u64 = 1_000_000;

fn is_hex_color(v: &serde_json::Value) -> Option<&str> {
    let s = v.as_str()?;
    (s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())).then_some(s)
}

/// The typed allowlist: each `kind` maps to exactly one engine command with validated parameters.
fn format_command(op: &serde_json::Value) -> Result<(&'static str, serde_json::Value), String> {
    let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing format kind")?;
    let on = || op.get("on").and_then(|v| v.as_bool()).ok_or_else(|| "`on` must be true or false".to_string());
    Ok(match kind {
        "bold" => ("home.bold", json!({"on": on()?})),
        "italic" => ("home.italic", json!({"on": on()?})),
        "strike" => ("home.strikethrough", json!({"on": on()?})),
        "underline" => ("home.underline", json!({"on": on()?, "style": "single"})),
        "fontName" => {
            let n = op.get("name").and_then(|v| v.as_str()).ok_or("missing font name")?;
            if n.trim().is_empty() || n.chars().count() > 64 || n.chars().any(char::is_control) {
                return Err("invalid font name".into());
            }
            ("home.fontName", json!({"name": n.trim()}))
        }
        "fontSize" => {
            let z = op.get("size").and_then(|v| v.as_f64()).filter(|z| z.is_finite() && (1.0..=409.0).contains(z)).ok_or("font size must be between 1 and 409")?;
            ("home.fontSize", json!({"size": z}))
        }
        "fontColor" => match op.get("color") {
            Some(c) if c.as_str() == Some("auto") => ("home.fontColor", json!({"color": "auto"})),
            Some(c) => ("home.fontColor", json!({"color": is_hex_color(c).ok_or("color must be #RRGGBB or auto")?})),
            None => return Err("missing color".into()),
        },
        "fillColor" => match op.get("color") {
            Some(c) if c.as_str() == Some("none") => ("home.fillColor", json!({"color": "none"})),
            Some(c) => ("home.fillColor", json!({"color": is_hex_color(c).ok_or("color must be #RRGGBB or none")?})),
            None => return Err("missing color".into()),
        },
        _ => return Err("unsupported format operation".into()),
    })
}

#[wasm_bindgen]
pub struct HeadlessWorkbook {
    session: Session,
    warnings: Vec<String>,
}

#[wasm_bindgen]
impl HeadlessWorkbook {
    /// Import atomically: a failed open does not destroy the previous document.
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<HeadlessWorkbook, String> {
        console_error_panic_hook::set_once();
        if bytes.len() > MAX_INPUT {
            return Err("compressed workbook exceeds the spike's 32 MiB input limit".into());
        }
        let (wb, report) = gridcraft_xlsx::read_xlsx(bytes).map_err(|e| e.to_string())?;
        let mut session = Session::new();
        session.add_document(DocState::new(wb, None, "Imported workbook".into()));
        Ok(Self { session, warnings: report.warnings })
    }

    pub fn sheets(&self) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        Ok(json!({"sheets": doc.wb.sheets.iter().enumerate().map(|(index,s)|
            json!({"index":index,"name":s.name,"visibility":format!("{:?}",s.visibility)}))
            .collect::<Vec<_>>(), "warnings": self.warnings})
        .to_string())
    }

    /// Bounded viewport reads. Coordinates are zero-based; returns typed value + formula.
    pub fn range(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        if rows == 0
            || cols == 0
            || u64::from(rows) * u64::from(cols) > 10_000
            || row.checked_add(rows).is_none_or(|v| v > gridcraft_engine::core::MAX_ROWS)
            || col.checked_add(cols).is_none_or(|v| v > gridcraft_engine::core::MAX_COLS)
        {
            return Err("invalid range (maximum 10,000 cells per read)".into());
        }
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let mut cells = Vec::new();
        for r in row..row + rows {
            for c in col..col + cols {
                let at = CellRef::new(r, c);
                let formula = sh.cell(at).and_then(|v| v.formula.as_ref()).map(|f| f.text.clone());
                cells.push(json!({"address":at.a1(), "value":sh.value(at), "formula":formula}));
            }
        }
        Ok(json!({"sheet":sheet,"row":row,"col":col,"rows":rows,"cols":cols,"cells":cells}).to_string())
    }

    /// Use the real command path, including dependent recalculation and undo snapshots.
    pub fn set_cell(&mut self, sheet: usize, address: &str, input: &str) -> Result<String, String> {
        if CellRef::parse(address).is_none() {
            return Err("invalid cell address".into());
        }
        if self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).is_none() {
            return Err("unknown sheet".into());
        }
        if input.len() > 32_767 {
            return Err("input exceeds 32,767 UTF-8 bytes".into());
        }
        self.session.run("cell.set", json!({"sheet":sheet,"cell":address,"input":input})).map(|v| v.to_string())
    }

    /// Like `range`, plus what the grid needs to paint each cell: the display text with the
    /// cell's number format applied and the resolved style. Same bounds as `range`.
    pub fn view_range(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        if rows == 0
            || cols == 0
            || u64::from(rows) * u64::from(cols) > 10_000
            || row.checked_add(rows).is_none_or(|v| v > gridcraft_engine::core::MAX_ROWS)
            || col.checked_add(cols).is_none_or(|v| v > gridcraft_engine::core::MAX_COLS)
        {
            return Err("invalid range (maximum 10,000 cells per read)".into());
        }
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let wb = &doc.wb;
        let sh = wb.sheet(sheet).ok_or("unknown sheet")?;
        let mut cells = Vec::new();
        for r in row..row + rows {
            for c in col..col + cols {
                let at = CellRef::new(r, c);
                let value = sh.value(at);
                let formula = sh.cell(at).and_then(|v| v.formula.as_ref()).map(|f| f.text.clone());
                let st = wb.styles.get(sh.style_id(at));
                let fmt = NumberFormat::parse(st.num_fmt.as_str());
                let shown = format_value(&value, &fmt, wb.date_system);
                cells.push(json!({
                    "address": at.a1(), "value": value, "formula": formula,
                    "text": shown.text, "numeric": shown.numeric,
                    "fmtColor": shown.color.map(format_color),
                    "style": style_json(st, &wb.theme),
                }));
            }
        }
        Ok(json!({"sheet":sheet,"row":row,"col":col,"rows":rows,"cols":cols,"cells":cells}).to_string())
    }

    /// Sparse column widths and row heights (CSS px at 96 dpi from points), hidden lines and the
    /// frozen pane, so the grid can place cells without reading them.
    pub fn layout(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let px = |pt: f32| (f64::from(pt) * 96.0 / 72.0).round();
        let cols: Vec<_> = sh.cols.iter().filter(|(c, _)| **c < gridcraft_engine::core::MAX_COLS)
            .map(|(c, i)| json!({"i": c, "w": px(sh.col_width(*c)), "hidden": i.hidden})).collect();
        let rows: Vec<_> = sh.rows.iter().filter(|(r, _)| **r < gridcraft_engine::core::MAX_ROWS)
            .map(|(r, i)| json!({"i": r, "h": px(sh.row_height(*r)), "hidden": i.hidden})).collect();
        Ok(json!({"sheet":sheet,"defaultColWidth":px(sh.default_col_width),"defaultRowHeight":px(sh.default_row_height),
            "cols":cols,"rows":rows,"showGridlines":sh.show_gridlines,
            "freeze": sh.freeze.map(|(r, c)| json!({"rows": r.min(20), "cols": c.min(20)})),
            "merges": sh.merges.iter().map(|m| json!({"r0":m.start.row,"c0":m.start.col,"r1":m.end.row,"c1":m.end.col})).collect::<Vec<_>>()}).to_string())
    }

    /// Used extent of a sheet (end-exclusive) plus history availability, for the grid shell.
    pub fn sheet_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let (rows, cols) = sh.used_range().map_or((0, 0), |r| (r.end.row + 1, r.end.col + 1));
        Ok(json!({"sheet":sheet,"rows":rows,"cols":cols,"canUndo":!doc.undo.is_empty(),"canRedo":!doc.redo.is_empty()}).to_string())
    }

    pub fn redo(&mut self) -> Result<String, String> {
        self.session.run("edit.redo", json!({})).map(|v| v.to_string())
    }

    pub fn undo(&mut self) -> Result<String, String> {
        self.session.run("edit.undo", json!({})).map(|v| v.to_string())
    }

    /// Writes a rectangular block of cell inputs (text, numbers or =formulas, exactly as typed) as ONE
    /// history entry. Everything is validated first (sheet, bounds, shape, per-cell size, 10,000-cell
    /// cap); the engine applies the block to a copy and commits only if every cell parsed, so a
    /// rejected block changes nothing and leaves no undo step.
    pub fn set_values(&mut self, sheet: usize, row: u32, col: u32, values_json: &str) -> Result<String, String> {
        let rows: Vec<Vec<String>> = serde_json::from_str(values_json).map_err(|_| "values must be an array of rows of strings".to_string())?;
        let width = rows.first().map_or(0, Vec::len);
        let cells = (rows.len() as u64) * (width as u64);
        if rows.is_empty() || width == 0 || cells > 10_000 || rows.iter().any(|r| r.len() != width) {
            return Err("invalid block (rectangular, 1 to 10,000 cells)".into());
        }
        self.check_block(sheet, row, col, rows.len() as u32, width as u32, true)?;
        if rows.iter().flatten().any(|v| v.len() > 32_767) {
            return Err("input exceeds 32,767 UTF-8 bytes".into());
        }
        let at = CellRef::new(row, col).a1();
        self.session.run("range.setValues", json!({"sheet":sheet,"range":at,"values":rows})).map(|v| v.to_string())
    }

    /// Clears the contents (formats stay) of a block as ONE history entry, validated like `set_values`.
    pub fn clear_contents(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > 10_000 {
            return Err("invalid block (1 to 10,000 cells)".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let a = CellRef::new(row, col).a1();
        let b = CellRef::new(row + rows - 1, col + cols - 1).a1();
        self.session.run("edit.clearContents", json!({"sheet":sheet,"range":format!("{a}:{b}")})).map(|v| v.to_string())
    }

    fn check_block(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, refuse_protected: bool) -> Result<(), String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        // range.setValues / edit.clearContents do not look at protection (cell.set does), so refuse here.
        if refuse_protected && sh.is_protected() {
            return Err("The sheet is protected. Unprotect it to change cells.".into());
        }
        if row.checked_add(rows).is_none_or(|v| v > gridcraft_engine::core::MAX_ROWS)
            || col.checked_add(cols).is_none_or(|v| v > gridcraft_engine::core::MAX_COLS)
        {
            return Err("block exceeds the sheet limits".into());
        }
        Ok(())
    }

    /// Applies ONE typed formatting operation to a block as one history entry. `op_json` is
    /// `{"kind": ..., ...}` from a fixed allowlist (see `format_command`); anything else is refused, so the
    /// host never reaches arbitrary engine commands. Whole block validated first; the engine commits
    /// only if the operation succeeded. Protected sheets are checked by the engine's own format rule.
    pub fn format_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FORMAT_CELLS {
            return Err("invalid block (1 to 1,000,000 cells)".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "format operation must be a JSON object".to_string())?;
        let (command, params) = format_command(&op)?;
        let a = CellRef::new(row, col).a1();
        let b = CellRef::new(row + rows - 1, col + cols - 1).a1();
        let mut call = params;
        call["sheet"] = json!(sheet);
        call["range"] = json!(format!("{a}:{b}"));
        self.session.run(command, call).map(|v| v.to_string())
    }

    /// Sets the host clock (local date-time as a 1900-system serial) used by NOW/TODAY and every other
    /// volatile function, then recalculates. Without it wasm32 falls back to a fixed serial (46302.5 =
    /// 2026-10-07 12:00), so the host must call this after open and whenever the minute changes.
    /// Rejects non-finite and out-of-range values without touching the document. Not an undo step.
    pub fn set_clock(&mut self, serial: f64) -> Result<String, String> {
        if !serial.is_finite() || !(1.0..=2_958_465.999_999).contains(&serial) {
            return Err("invalid clock serial".into());
        }
        let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
        doc.calc.fixed_now = Some(serial);
        let mut wb = (*doc.wb).clone();
        doc.calc.recalc_all(&mut wb);
        doc.wb = std::sync::Arc::new(wb);
        Ok(json!({"clock": serial}).to_string())
    }

    pub fn export_xlsx(&self) -> Result<Vec<u8>, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        gridcraft_xlsx::write_xlsx(&doc.wb).map_err(|e| e.to_string())
    }
}

fn format_color(c: FormatColor) -> String {
    match c {
        FormatColor::Black => "#000000",
        FormatColor::Blue => "#0000FF",
        FormatColor::Cyan => "#00FFFF",
        FormatColor::Green => "#00FF00",
        FormatColor::Magenta => "#FF00FF",
        FormatColor::Red => "#FF0000",
        FormatColor::White => "#FFFFFF",
        FormatColor::Yellow => "#FFFF00",
        FormatColor::Indexed(_) => "#000000",
    }
    .into()
}

fn border_json(b: &gridcraft_engine::model::style::BorderLine, theme: &gridcraft_engine::model::style::Theme) -> serde_json::Value {
    use gridcraft_engine::model::style::BorderStyle as B;
    if b.is_none() {
        return serde_json::Value::Null;
    }
    let css = match b.style {
        B::Dashed | B::MediumDashed | B::DashDot | B::MediumDashDot | B::DashDotDot | B::MediumDashDotDot | B::SlantDashDot => "dashed",
        B::Dotted | B::Hair => "dotted",
        B::Double => "double",
        _ => "solid",
    };
    json!({"w": b.style.width(), "style": css, "color": b.color.hex(theme).unwrap_or_else(|| "#000000".into())})
}

fn style_json(st: &Style, theme: &gridcraft_engine::model::style::Theme) -> serde_json::Value {
    let hex = |c: &Color| c.hex(theme);
    let fill = if st.fill.pattern == gridcraft_engine::model::style::PatternType::Solid { hex(&st.fill.fg) } else { None };
    json!({
        "bold": st.font.bold, "italic": st.font.italic, "strike": st.font.strike,
        "underline": st.font.underline != Underline::None,
        "color": hex(&st.font.color), "fill": fill,
        "h": match st.align.h { HAlign::Left => "left", HAlign::Center | HAlign::CenterAcross => "center", HAlign::Right => "right", _ => "general" },
        "wrap": st.align.wrap, "fmt": st.num_fmt.as_str(),
        "font": st.font.name, "size": st.font.size,
        "borders": {
            "l": border_json(&st.borders.left, theme), "r": border_json(&st.borders.right, theme),
            "t": border_json(&st.borders.top, theme), "b": border_json(&st.borders.bottom, theme),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const FIXTURE: &[u8] = include_bytes!("../fixtures/fixture.xlsx");
    #[test]
    fn independent_xlsx_edit_recalc_undo_and_roundtrip() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        assert!(book.sheets().unwrap().contains("Summary"));
        assert!(book.range(0, 1, 2, 1, 1).unwrap().contains("20.0"));
        book.set_cell(0, "B2", "7").unwrap();
        assert!(book.range(0, 1, 2, 1, 1).unwrap().contains("70.0"));
        let saved = book.export_xlsx().unwrap();
        let reopened = HeadlessWorkbook::new(&saved).unwrap();
        assert!(reopened.range(0, 1, 1, 1, 1).unwrap().contains("7.0"));
        book.undo().unwrap();
        assert!(book.range(0, 1, 1, 1, 1).unwrap().contains("2.0"));
    }
    #[test]
    fn sheet_info_and_redo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let info: serde_json::Value = serde_json::from_str(&book.sheet_info(0).unwrap()).unwrap();
        assert_eq!(info["canUndo"], false);
        assert!(info["rows"].as_u64().unwrap() >= 5 && info["cols"].as_u64().unwrap() >= 3);
        book.set_cell(0, "B2", "9").unwrap();
        let info: serde_json::Value = serde_json::from_str(&book.sheet_info(0).unwrap()).unwrap();
        assert_eq!(info["canUndo"], true);
        book.undo().unwrap();
        book.redo().unwrap();
        assert!(book.range(0, 1, 1, 1, 1).unwrap().contains("9.0"));
        assert!(book.sheet_info(9).is_err());
    }
    #[test]
    fn view_range_formats_and_layout() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let v: serde_json::Value = serde_json::from_str(&book.view_range(0, 0, 0, 3, 3).unwrap()).unwrap();
        let a1 = &v["cells"][0];
        assert_eq!(a1["text"], "Product");
        assert_eq!(a1["style"]["bold"], true, "fixture A1 is bold");
        assert_eq!(v["cells"][5]["text"], "20");
        book.set_cell(0, "B3", "0.256").unwrap();
        let v: serde_json::Value = serde_json::from_str(&book.view_range(0, 2, 1, 1, 1).unwrap()).unwrap();
        assert_eq!(v["cells"][0]["style"]["fmt"], "General");
        let l: serde_json::Value = serde_json::from_str(&book.layout(0).unwrap()).unwrap();
        assert!(l["defaultColWidth"].as_f64().unwrap() > 0.0);
        assert_eq!(l["merges"][0]["c1"], 2, "A5:C5 merge");
        assert!(book.view_range(0, 0, 0, 1000, 1000).is_err());
        assert!(book.layout(9).is_err());
    }
    const FORMATS: &[u8] = include_bytes!("../fixtures/formats.xlsx");
    #[test]
    fn number_formats_styles_and_widths_come_from_the_file() {
        let book = HeadlessWorkbook::new(FORMATS).unwrap();
        let v: serde_json::Value = serde_json::from_str(&book.view_range(0, 0, 0, 8, 2).unwrap()).unwrap();
        let at = |a: &str| v["cells"].as_array().unwrap().iter().find(|c| c["address"] == a).unwrap().clone();
        assert_eq!(at("B2")["text"], "25.6%");
        assert_eq!(at("B3")["text"], "1,234.50 EUR");
        assert_eq!(at("B4")["text"], "2026-10-09");
        assert_eq!(at("B5")["text"], "-42");
        assert_eq!(at("B5")["fmtColor"], "#FF0000");
        assert_eq!(at("B6")["style"]["h"], "center");
        assert_eq!(at("B7")["style"]["h"], "right");
        assert_eq!(at("B2")["numeric"], true);
        let a1 = at("A1");
        assert_eq!(a1["style"]["bold"], true);
        assert_eq!(a1["style"]["italic"], true);
        assert_eq!(a1["style"]["color"], "#FF0000");
        assert_eq!(a1["style"]["fill"], "#FFF2CC");
        let l: serde_json::Value = serde_json::from_str(&book.layout(0).unwrap()).unwrap();
        let col = |i: u64| l["cols"].as_array().unwrap().iter().find(|c| c["i"] == i).cloned();
        assert!(col(0).unwrap()["w"].as_f64().unwrap() > 150.0, "A is wider than the default");
        assert_eq!(col(2).unwrap()["hidden"], true);
        assert_eq!(l["freeze"]["rows"], 1);
        assert_eq!(l["freeze"]["cols"], 1);
        assert_eq!(l["merges"][0]["c1"], 1, "A10:B10 merge");
        let b: serde_json::Value = serde_json::from_str(&book.view_range(0, 8, 0, 1, 1).unwrap()).unwrap();
        let bs = &b["cells"][0]["style"];
        assert_eq!(bs["borders"]["b"]["style"], "solid");
        assert_eq!(bs["borders"]["b"]["color"], "#0000FF");
        assert!(bs["borders"]["t"].is_null());
        assert_eq!(bs["font"], "Courier New");
        assert_eq!(bs["size"], 16.0);
        assert!(col(3).unwrap()["w"].as_f64().unwrap() < l["defaultColWidth"].as_f64().unwrap());
    }
    #[test]
    fn host_clock_drives_now_and_today_and_survives_edits_and_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "=NOW()").unwrap();
        book.set_cell(0, "H2", "=TODAY()").unwrap();
        let num = |b: &HeadlessWorkbook, a: &str| -> f64 {
            let v: serde_json::Value = serde_json::from_str(&b.range(0, a[1..].parse::<u32>().unwrap() - 1, 7, 1, 1).unwrap()).unwrap();
            v["cells"][0]["value"]["v"].as_f64().unwrap()
        };
        book.set_clock(46310.25).unwrap();
        assert_eq!(num(&book, "H1"), 46310.25);
        assert_eq!(num(&book, "H2"), 46310.0);
        // An edit elsewhere recalculates volatiles with the host clock, not the fallback.
        book.set_cell(0, "H3", "=NOW()-TODAY()").unwrap();
        assert_eq!(num(&book, "H3"), 0.25);
        // Clock changes are not history entries.
        let info: serde_json::Value = serde_json::from_str(&book.sheet_info(0).unwrap()).unwrap();
        assert_eq!(info["canUndo"], true);
        book.undo().unwrap();
        book.undo().unwrap();
        book.undo().unwrap();
        let info: serde_json::Value = serde_json::from_str(&book.sheet_info(0).unwrap()).unwrap();
        assert_eq!(info["canUndo"], false, "set_clock added no undo step");
    }
    #[test]
    fn host_clock_rejects_bad_serials_without_touching_the_document() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "=NOW()").unwrap();
        book.set_clock(46310.5).unwrap();
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 0.0, -5.0, 3_000_000.0] {
            assert!(book.set_clock(bad).is_err(), "{bad}");
        }
        assert!(book.range(0, 0, 7, 1, 1).unwrap().contains("46310.5"));
    }
    fn info_json(b: &HeadlessWorkbook) -> serde_json::Value {
        serde_json::from_str(&b.sheet_info(0).unwrap()).unwrap()
    }
    fn text(b: &HeadlessWorkbook, a: &str) -> String {
        let col = (a.as_bytes()[0] - b'A') as u32;
        let row = a[1..].parse::<u32>().unwrap() - 1;
        let v: serde_json::Value = serde_json::from_str(&b.view_range(0, row, col, 1, 1).unwrap()).unwrap();
        v["cells"][0]["text"].as_str().unwrap().to_string()
    }
    #[test]
    fn set_values_is_one_undo_step_and_undo_restores_everything() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 9, 0, r#"[["1","2","=A10+B10"],["x","","=A10*2"]]"#).unwrap();
        assert_eq!(text(&book, "C10"), "3");
        assert_eq!(text(&book, "C11"), "2");
        book.undo().unwrap();
        assert_eq!(text(&book, "A10"), "");
        assert_eq!(text(&book, "C10"), "");
        assert_eq!(info_json(&book)["canUndo"], false, "exactly one history entry for the whole block");
        book.redo().unwrap();
        assert_eq!(text(&book, "C10"), "3");
    }
    #[test]
    fn set_values_is_all_or_nothing() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let before = text(&book, "B2");
        let big = "x".repeat(32_768);
        let cases = [
            r#"[["9","=1+*2"]]"#.to_string(),
            format!(r#"[["9","{big}"]]"#),
            r#"[["9"],["1","2"]]"#.to_string(),
            "[]".to_string(),
            r#"[[]]"#.to_string(),
            "not json".to_string(),
            r#"[[1,2]]"#.to_string(),
        ];
        for c in &cases {
            assert!(book.set_values(0, 1, 1, c).is_err(), "{}", &c[..c.len().min(30)]);
        }
        assert!(book.set_values(9, 0, 0, r#"[["1"]]"#).is_err(), "unknown sheet");
        assert!(book.set_values(0, gridcraft_engine::core::MAX_ROWS - 1, 0, r#"[["1"],["2"]]"#).is_err(), "past the last row");
        assert!(book.set_values(0, 0, gridcraft_engine::core::MAX_COLS - 1, r#"[["1","2"]]"#).is_err(), "past the last column");
        assert_eq!(text(&book, "B2"), before, "a rejected block changes nothing");
        assert_eq!(info_json(&book)["canUndo"], false, "and leaves no undo step");
    }
    #[test]
    fn batch_writes_refuse_a_protected_sheet() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.set_values(0, 1, 1, r#"[["9"]]"#).unwrap_err().contains("protected"));
        assert!(book.clear_contents(0, 1, 1, 1, 1).unwrap_err().contains("protected"));
        assert!(book.range(0, 1, 1, 1, 1).unwrap().contains("2.0"));
    }
    fn style_at(b: &HeadlessWorkbook, sheet: usize, row: u32, col: u32) -> serde_json::Value {
        let v: serde_json::Value = serde_json::from_str(&b.view_range(sheet, row, col, 1, 1).unwrap()).unwrap();
        v["cells"][0]["style"].clone()
    }
    #[test]
    fn font_and_fill_formats_apply_read_back_undo_and_roundtrip_xlsx() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        for op in [
            r##"{"kind":"bold","on":true}"##,
            r##"{"kind":"italic","on":true}"##,
            r##"{"kind":"underline","on":true}"##,
            r##"{"kind":"strike","on":true}"##,
            r##"{"kind":"fontName","name":"Courier New"}"##,
            r##"{"kind":"fontSize","size":14}"##,
            r##"{"kind":"fontColor","color":"#C00000"}"##,
            r##"{"kind":"fillColor","color":"#FFF2CC"}"##,
        ] {
            book.format_range(0, 1, 1, 2, 2, op).unwrap();
        }
        for (r, c) in [(1, 1), (1, 2), (2, 1), (2, 2)] {
            let st = style_at(&book, 0, r, c);
            assert_eq!(st["bold"], true);
            assert_eq!(st["italic"], true);
            assert_eq!(st["underline"], true);
            assert_eq!(st["strike"], true);
            assert_eq!(st["font"], "Courier New");
            assert_eq!(st["size"], 14.0);
            assert_eq!(st["color"], "#C00000");
            assert_eq!(st["fill"], "#FFF2CC");
        }
        assert_eq!(style_at(&book, 0, 3, 3)["bold"], false, "cells outside the block are untouched");
        // XLSX roundtrip keeps every property.
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        let st = style_at(&reopened, 0, 2, 2);
        assert_eq!(st["bold"], true);
        assert_eq!(st["italic"], true);
        assert_eq!(st["underline"], true);
        assert_eq!(st["strike"], true);
        assert_eq!(st["font"], "Courier New");
        assert_eq!(st["size"], 14.0);
        assert_eq!(st["color"], "#C00000");
        assert_eq!(st["fill"], "#FFF2CC");
        // Each operation is exactly one undo step, and the values never change.
        let mut undone = 0;
        while info_json(&book)["canUndo"] == true {
            book.undo().unwrap();
            undone += 1;
        }
        assert_eq!(undone, 8);
        assert_eq!(style_at(&book, 0, 1, 1)["bold"], false);
        assert_eq!(style_at(&book, 0, 1, 1)["fill"], serde_json::Value::Null);
    }
    #[test]
    fn explicit_off_and_clearing_colors() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.format_range(0, 0, 0, 1, 1, r##"{"kind":"bold","on":false}"##).unwrap();
        assert_eq!(style_at(&book, 0, 0, 0)["bold"], false, "fixture A1 was bold");
        book.format_range(0, 5, 5, 1, 1, r##"{"kind":"fillColor","color":"#00FF00"}"##).unwrap();
        book.format_range(0, 5, 5, 1, 1, r##"{"kind":"fillColor","color":"none"}"##).unwrap();
        assert_eq!(style_at(&book, 0, 5, 5)["fill"], serde_json::Value::Null);
        book.format_range(0, 5, 5, 1, 1, r##"{"kind":"fontColor","color":"#0000FF"}"##).unwrap();
        book.format_range(0, 5, 5, 1, 1, r##"{"kind":"fontColor","color":"auto"}"##).unwrap();
        assert_ne!(style_at(&book, 0, 5, 5)["color"], "#0000FF");
    }
    #[test]
    fn format_range_is_a_closed_allowlist_with_validated_parameters() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let bad = [
            r##"{"kind":"cell.set","input":"x"}"##,
            r##"{"kind":"home.bold","on":true}"##,
            r##"{"kind":"bold"}"##,
            r##"{"kind":"bold","on":"yes"}"##,
            r##"{"kind":"fontSize","size":0}"##,
            r##"{"kind":"fontSize","size":410}"##,
            r##"{"kind":"fontSize","size":"12"}"##,
            r##"{"kind":"fontName","name":""}"##,
            r##"{"kind":"fontName","name":"bad\u0007name"}"##,
            r##"{"kind":"fontColor","color":"red"}"##,
            r##"{"kind":"fontColor","color":"#FFF"}"##,
            r##"{"kind":"fillColor","color":"#GGGGGG"}"##,
            r##"{"kind":"fillColor","color":{"theme":1}}"##,
            r##"{"kind":"fillColor"}"##,
            r##"[1]"##,
            "nonsense",
        ];
        for op in bad {
            assert!(book.format_range(0, 0, 0, 1, 1, op).is_err(), "{op}");
        }
        let long = format!(r##"{{"kind":"fontName","name":"{}"}}"##, "x".repeat(65));
        assert!(book.format_range(0, 0, 0, 1, 1, &long).is_err());
        assert!(book.format_range(9, 0, 0, 1, 1, r##"{"kind":"bold","on":true}"##).is_err(), "unknown sheet");
        assert!(book.format_range(0, 0, 0, 0, 1, r##"{"kind":"bold","on":true}"##).is_err());
        assert!(book.format_range(0, 0, 0, 1001, 1001, r##"{"kind":"bold","on":true}"##).is_err(), "over 1,000,000 cells");
        assert!(book.format_range(0, gridcraft_engine::core::MAX_ROWS - 1, 0, 2, 1, r##"{"kind":"bold","on":true}"##).is_err());
        assert_eq!(info_json(&book)["canUndo"], false, "rejected operations leave no history");
    }
    #[test]
    fn format_respects_sheet_protection() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.format_range(0, 1, 1, 1, 1, r##"{"kind":"bold","on":true}"##).is_err());
        assert_eq!(style_at(&book, 0, 1, 1)["bold"], false);
    }
    #[test]
    fn clear_contents_is_one_undo_step_and_keeps_formats() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let a1_bold = {
            let v: serde_json::Value = serde_json::from_str(&book.view_range(0, 0, 0, 1, 1).unwrap()).unwrap();
            v["cells"][0]["style"]["bold"].clone()
        };
        book.clear_contents(0, 0, 0, 3, 3).unwrap();
        assert_eq!(text(&book, "A1"), "");
        let v: serde_json::Value = serde_json::from_str(&book.view_range(0, 0, 0, 1, 1).unwrap()).unwrap();
        assert_eq!(v["cells"][0]["style"]["bold"], a1_bold, "formats stay");
        book.undo().unwrap();
        assert_eq!(text(&book, "A1"), "Product");
        assert_eq!(info_json(&book)["canUndo"], false, "one history entry for the whole clear");
        assert!(book.clear_contents(0, 0, 0, 0, 3).is_err());
        assert!(book.clear_contents(0, 0, 0, 101, 100).is_err(), "over 10,000 cells");
        assert!(book.clear_contents(9, 0, 0, 1, 1).is_err());
        assert!(book.clear_contents(0, gridcraft_engine::core::MAX_ROWS - 1, 0, 2, 1).is_err());
        assert_eq!(info_json(&book)["canUndo"], false);
    }
    #[test]
    fn rejects_bad_input_and_out_of_bounds_without_losing_document() {
        assert!(HeadlessWorkbook::new(b"not a zip").is_err());
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        assert!(book.range(0, 0, 0, 1000, 1000).is_err());
        assert!(book.range(0, u32::MAX, 0, 1, 1).is_err());
        assert!(book.range(9, 0, 0, 1, 1).is_err());
        assert!(book.set_cell(9, "A1", "x").is_err());
        assert!(book.set_cell(0, "XFE1", "x").is_err());
        assert!(book.range(0, 1, 1, 1, 1).unwrap().contains("2.0"));
    }
}
