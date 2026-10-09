//! Headless, byte-only adapter for the Somnia Sheets Studio. The worker owns one session; no UI or filesystem.
use gridcraft_engine::model::{style::{Color, HAlign, Underline}, Style};
use gridcraft_engine::numfmt::{format_value, FormatColor, NumberFormat};
use gridcraft_engine::{DocState, Session, core::CellRef};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_INPUT: usize = 32 * 1024 * 1024;

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

fn style_json(st: &Style, theme: &gridcraft_engine::model::style::Theme) -> serde_json::Value {
    let hex = |c: &Color| c.hex(theme);
    let fill = if st.fill.pattern == gridcraft_engine::model::style::PatternType::Solid { hex(&st.fill.fg) } else { None };
    json!({
        "bold": st.font.bold, "italic": st.font.italic, "strike": st.font.strike,
        "underline": st.font.underline != Underline::None,
        "color": hex(&st.font.color), "fill": fill,
        "h": match st.align.h { HAlign::Left => "left", HAlign::Center | HAlign::CenterAcross => "center", HAlign::Right => "right", _ => "general" },
        "wrap": st.align.wrap, "fmt": st.num_fmt.as_str(),
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
        assert!(col(3).unwrap()["w"].as_f64().unwrap() < l["defaultColWidth"].as_f64().unwrap());
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
