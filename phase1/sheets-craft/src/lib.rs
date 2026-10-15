//! Headless, byte-only adapter for the Somnia Sheets Studio. The worker owns one session; no UI or filesystem.
use gridcraft_engine::model::{style::{Color, HAlign, Underline, VAlign}, Style};
use gridcraft_engine::numfmt::{format_value, FormatColor, NumberFormat};
use gridcraft_engine::{DocState, Session, core::CellRef};
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_INPUT: usize = 32 * 1024 * 1024;
const MAX_RESIZE_ROWS: u32 = 100_000;
const MAX_RESIZE_COLS: u32 = 16_384;
const MAX_FREEZE: u32 = 20;
const MAX_SHEETS: usize = 255;
const MAX_SORT_CELLS: u64 = 1_000_000;
const MAX_FILL_CELLS: u64 = 1_000_000;
const MAX_SORT_KEYS: usize = 3;
const FILTER_OPS: [&str; 10] = ["=", "<>", ">", "<", ">=", "<=", "beginsWith", "endsWith", "contains", "notContains"];
const MAX_FILTER_VALUE: usize = 255;
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
        "hAlign" => match op.get("align").and_then(|v| v.as_str()) {
            Some("left") => ("home.alignLeft", json!({})),
            Some("center") => ("home.alignCenter", json!({})),
            Some("right") => ("home.alignRight", json!({})),
            _ => return Err("horizontal alignment must be left, center or right".into()),
        },
        "vAlign" => match op.get("align").and_then(|v| v.as_str()) {
            Some("top") => ("home.alignTop", json!({})),
            Some("middle") => ("home.alignMiddle", json!({})),
            Some("bottom") => ("home.alignBottom", json!({})),
            _ => return Err("vertical alignment must be top, middle or bottom".into()),
        },
        "wrap" => ("home.wrapText", json!({"on": on()?})),
        "indent" => match op.get("delta").and_then(|v| v.as_i64()) {
            Some(1) => ("home.increaseIndent", json!({})),
            Some(-1) => ("home.decreaseIndent", json!({})),
            _ => return Err("delta must be 1 or -1".into()),
        },
        "borders" => {
            const PRESETS: &[&str] = &["none", "all", "outside", "thickOutside", "inside", "insideHorizontal", "insideVertical", "top", "bottom", "left", "right", "thickBottom", "doubleBottom", "topBottom", "topThickBottom", "topDoubleBottom"];
            const STYLES: &[&str] = &["thin", "medium", "thick", "dashed", "dotted", "double", "hair"];
            let preset = op.get("preset").and_then(|v| v.as_str()).filter(|p| PRESETS.contains(p)).ok_or("unsupported border preset")?;
            let style = match op.get("style") {
                None => "thin",
                Some(v) => v.as_str().filter(|s| STYLES.contains(s)).ok_or("unsupported border style")?,
            };
            let color = match op.get("color") {
                None => "auto",
                Some(c) if c.as_str() == Some("auto") => "auto",
                Some(c) => is_hex_color(c).ok_or("color must be #RRGGBB or auto")?,
            };
            ("home.borders", json!({"preset": preset, "style": style, "color": color}))
        }
        "numFmt" => ("home.numberFormat", json!({"code": number_format_code(op)?})),
        _ => return Err("unsupported format operation".into()),
    })
}

const CURRENCY_SYMBOLS: [&str; 5] = ["$", "€", "£", "¥", "CHF"];

/// Generates a number-format code from a preset (never from free text), so a hostile or malformed code can't reach the engine.
fn number_format_code(op: &serde_json::Value) -> Result<String, String> {
    let preset = op.get("preset").and_then(|v| v.as_str()).ok_or("missing number format preset")?;
    let wants_decimals = matches!(preset, "number" | "comma" | "percent" | "currency" | "scientific");
    let decimals = match op.get("decimals") {
        None => match preset {
            "percent" => 0,
            _ => 2,
        },
        Some(_) if !wants_decimals => return Err("this number format has no decimals".into()),
        Some(v) => v.as_u64().filter(|d| *d <= 10).ok_or("decimals must be a whole number from 0 to 10")? as usize,
    };
    let dec = if decimals == 0 { String::new() } else { format!(".{}", "0".repeat(decimals)) };
    if op.get("symbol").is_some() && preset != "currency" {
        return Err("only currency has a symbol".into());
    }
    Ok(match preset {
        "general" => "General".into(),
        "number" => format!("0{dec}"),
        "comma" => format!("#,##0{dec}"),
        "percent" => format!("0{dec}%"),
        "currency" => {
            let sym = match op.get("symbol") {
                None => "$",
                Some(v) => v.as_str().filter(|s| CURRENCY_SYMBOLS.contains(s)).ok_or("unsupported currency symbol")?,
            };
            format!("\"{sym}\"#,##0{dec}")
        }
        "date" => "yyyy-mm-dd".into(),
        "time" => "hh:mm:ss".into(),
        "scientific" => format!("0{dec}E+00"),
        "text" => "@".into(),
        _ => return Err("unsupported number format preset".into()),
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

    /// The owner's exact state identity: native revision, history depths and the workbook snapshot identity.
    /// Two equal tokens mean the very same workbook state, including after undo then redo. Reviews pin it.
    fn state_token(&self) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        Ok(format!("{}:{}:{}:{:x}", doc.revision, doc.undo.len(), doc.redo.len(), std::sync::Arc::as_ptr(&doc.wb) as usize))
    }

    /// `{"revision":n,"token":".."}` for the review step. The token changes on every edit, undo, redo and reopen.
    pub fn native_state(&self) -> Result<String, String> {
        let rev = self.session.doc().map_err(|e| e.to_string())?.revision;
        Ok(json!({"revision": rev, "token": self.state_token()?}).to_string())
    }

    fn cell_readback(&self, sheet: usize, row: u32, col: u32) -> Result<serde_json::Value, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let at = CellRef::new(row, col);
        let formula = sh.cell(at).and_then(|v| v.formula.as_ref()).map(|f| f.text.clone());
        Ok(json!({"address": at.a1(), "value": sh.value(at), "formula": formula}))
    }

    /// Writes one reviewed cell ATOMICALLY: the owner state token and the exact old cell (`expected_old_json` is
    /// `{"value":..,"formula":..}` as `range` returns it) are checked right here, in the same call that commits,
    /// so a queued or manual edit between review and apply fails with a `stale` error and no mutation. Returns a
    /// receipt: before/after native revision, `applied` (1 changed, 0 true no-op, taken from the engine's own
    /// revision counter and not from history length), the new state token and the cell read back from the
    /// workbook. Errors are proven pre-commit failures (the workbook is untouched). Protected sheets refused.
    pub fn set_cell_reviewed(&mut self, sheet: usize, address: &str, expected_token: &str, expected_old_json: &str, input: &str) -> Result<String, String> {
        let at = CellRef::parse(address).ok_or("invalid cell address")?;
        if input.len() > 32_767 {
            return Err("input exceeds 32,767 UTF-8 bytes".into());
        }
        self.check_block(sheet, at.row, at.col, 1, 1, true)?;
        if self.state_token()? != expected_token {
            return Err("stale: the workbook changed since this edit was reviewed".into());
        }
        let expected_old: serde_json::Value = serde_json::from_str(expected_old_json).map_err(|_| "expected cell must be a JSON object".to_string())?;
        let old_now = self.cell_readback(sheet, at.row, at.col)?;
        if !expected_old.is_object() || old_now != expected_old {
            return Err("stale: the cell changed since this edit was reviewed".into());
        }
        let (before, redo_before) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            (doc.revision, doc.redo.clone())
        };
        self.session.run("cell.set", json!({"sheet": sheet, "cell": address, "input": input}))?;
        let readback = self.cell_readback(sheet, at.row, at.col)?;
        let mut applied = 1u32;
        if readback == old_now {
            // The engine records every cell.set; a write that leaves the cell as it was is a true no-op, so
            // take its history entry back and restore the redo stack: state, revision and token are unchanged.
            let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
            if let Some(entry) = doc.undo.pop() {
                doc.wb = entry.wb;
                doc.selection = entry.selection;
                doc.revision = before;
                doc.redo = redo_before;
                applied = 0;
            }
        }
        let after = self.session.doc().map_err(|e| e.to_string())?.revision;
        Ok(json!({"sheet": sheet, "address": at.a1(), "beforeRevision": before, "afterRevision": after, "applied": applied,
            "undoable": applied == 1, "token": self.state_token()?, "readback": readback}).to_string())
    }

    /// Undoes exactly the reviewed edit: refuses unless the owner state is still the state the edit receipt
    /// returned (no manual edit, newer history, redo, reopen or other mutation since), then runs one undo and
    /// returns a receipt with the cell read back and `applied` 1 only when the workbook snapshot really changed.
    pub fn undo_reviewed(&mut self, sheet: usize, address: &str, expected_token: &str) -> Result<String, String> {
        let at = CellRef::parse(address).ok_or("invalid cell address")?;
        if self.state_token()? != expected_token {
            return Err("stale: newer changes exist, so this edit can no longer be undone on its own".into());
        }
        let ptr = |b: &Self| -> Result<usize, String> { Ok(std::sync::Arc::as_ptr(&b.session.doc().map_err(|e| e.to_string())?.wb) as usize) };
        let (before_ptr, before_rev) = (ptr(self)?, self.session.doc().map_err(|e| e.to_string())?.revision);
        self.session.run("edit.undo", json!({}))?;
        let applied = u32::from(ptr(self)? != before_ptr);
        let readback = self.cell_readback(sheet, at.row, at.col)?;
        Ok(json!({"sheet": sheet, "address": at.a1(), "beforeRevision": before_rev, "afterRevision": self.session.doc().map_err(|e| e.to_string())?.revision,
            "applied": applied, "undoable": false, "token": self.state_token()?, "readback": readback}).to_string())
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

    /// Adds, renames, duplicates, moves or deletes a sheet as ONE history entry. `sheet` is the sheet the
    /// operation is about; `op_json` is `{"kind":"add"}` (new sheet after `sheet`, engine-chosen or given `name`),
    /// `{"kind":"rename","name":..}`, `{"kind":"duplicate"}`, `{"kind":"move","to":index}` or `{"kind":"delete"}`.
    /// Names are checked here (1 to 31 characters, no control characters) and again by the engine (duplicates,
    /// forbidden characters). Protected workbook structure refused, at most 255 sheets. Returns the index of the
    /// sheet to show afterwards as `{"active":n}`; formulas, names and charts follow renames and deletes.
    pub fn edit_sheet(&mut self, sheet: usize, op_json: &str) -> Result<String, String> {
        use gridcraft_engine::model::Visibility;
        let (count, visible) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if doc.wb.protected_structure {
                return Err("The workbook structure is protected. Unprotect it to change sheets.".into());
            }
            if doc.wb.sheet(sheet).is_none() {
                return Err("unknown sheet".into());
            }
            (doc.wb.sheets.len(), doc.wb.sheets.iter().filter(|s| s.visibility == Visibility::Visible).count())
        };
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let name = match op.get("name") {
            None => None,
            Some(v) => {
                let n = v.as_str().ok_or("sheet name must be text")?.trim();
                if n.is_empty() || n.chars().count() > 31 || n.chars().any(char::is_control) {
                    return Err("A sheet name must be 1 to 31 characters long.".into());
                }
                Some(n.to_string())
            }
        };
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        match kind {
            "add" | "duplicate" if count >= MAX_SHEETS => return Err(format!("A workbook can have at most {MAX_SHEETS} sheets.")),
            "add" => {
                let mut p = json!({"before": sheet + 1});
                if let Some(n) = name {
                    p["name"] = json!(n);
                }
                self.session.run("home.insertSheet", p)?;
            }
            "rename" => {
                let n = name.ok_or("missing sheet name")?;
                self.session.run("sheet.rename", json!({"sheet": sheet, "name": n}))?;
            }
            "duplicate" => {
                self.session.run("sheet.move", json!({"sheet": sheet, "to": sheet + 1, "copy": true}))?;
            }
            "move" => {
                let to = op.get("to").and_then(|v| v.as_u64()).filter(|t| (*t as usize) < count).ok_or("target position is outside the workbook")?;
                self.session.run("sheet.move", json!({"sheet": sheet, "to": to}))?;
            }
            "delete" => {
                let is_visible = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).is_some_and(|s| s.visibility == Visibility::Visible);
                if visible <= 1 && is_visible {
                    return Err("A workbook must contain at least one visible sheet.".into());
                }
                self.session.run("home.deleteSheet", json!({"sheet": sheet}))?;
            }
            _ => return Err("unsupported sheet operation".into()),
        }
        let active = self.session.doc().map_err(|e| e.to_string())?.wb.active_sheet;
        Ok(json!({"active": active}).to_string())
    }

    /// Resizes, autofits, hides or unhides whole rows or columns as ONE history entry. `axis` is "rows" or
    /// "cols"; `op_json` is `{"kind":"size","px":n}`, `{"kind":"autofit"}`, `{"kind":"hide"}` or
    /// `{"kind":"unhide"}`. Counts are bounded, protected sheets refused (the engine's size commands do not
    /// look at protection), and the target sheet is activated first because those commands act on it.
    pub fn resize_lines(&mut self, sheet: usize, axis: &str, first: u32, count: u32, op_json: &str) -> Result<String, String> {
        let rows = match axis {
            "rows" => true,
            "cols" => false,
            _ => return Err("axis must be rows or cols".into()),
        };
        let (limit, cap) = if rows { (gridcraft_engine::core::MAX_ROWS, MAX_RESIZE_ROWS) } else { (gridcraft_engine::core::MAX_COLS, MAX_RESIZE_COLS) };
        if count == 0 || count > cap || first.checked_add(count).is_none_or(|v| v > limit) {
            return Err(format!("invalid {axis} span (1 to {cap} lines inside the sheet)"));
        }
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            if sh.is_protected() {
                return Err("The sheet is protected. Unprotect it to change rows or columns.".into());
            }
        }
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let a = if rows { first + 1 } else { first };
        let b = if rows { first + count } else { first + count - 1 };
        let name = |n: u32| if rows { (n).to_string() } else { CellRef::new(0, n).a1().trim_end_matches(char::is_numeric).to_string() };
        let span = format!("{}:{}", name(a), name(b));
        let mut params = json!({});
        params[axis] = json!(span);
        let command = match (kind, rows) {
            ("size", _) => {
                let px = op.get("px").and_then(|v| v.as_f64()).filter(|v| v.is_finite()).ok_or("size must be a number")?;
                let max_px = if rows { 409.0 * 96.0 / 72.0 } else { 1800.0 * 96.0 / 72.0 };
                if !(0.0..=max_px).contains(&px) {
                    return Err(format!("size must be between 0 and {} px", max_px.floor()));
                }
                let pt = px * 72.0 / 96.0;
                if rows { params["height"] = json!(pt) } else { params["width"] = json!(pt) }
                if rows { "home.rowHeight" } else { "home.columnWidth" }
            }
            ("autofit", true) => "home.autofitRowHeight",
            ("autofit", false) => "home.autofitColumnWidth",
            ("hide", true) => "home.hideRows",
            ("hide", false) => "home.hideColumns",
            ("unhide", true) => "home.unhideRows",
            ("unhide", false) => "home.unhideColumns",
            _ => return Err("unsupported row or column operation".into()),
        };
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run(command, params).map(|v| v.to_string())
    }

    /// Inserts or deletes whole rows or columns as ONE history entry; formulas (on every sheet), merges,
    /// names and line sizes shift with the engine's own reference rewriting. `axis` is "rows" or "cols";
    /// `op_json` is `{"kind":"insert"}` (new lines appear at `first`, pushing the rest down/right) or
    /// `{"kind":"delete"}`. Bounded, protected sheets and protected workbook structure refused.
    pub fn edit_lines(&mut self, sheet: usize, axis: &str, first: u32, count: u32, op_json: &str) -> Result<String, String> {
        let rows = match axis {
            "rows" => true,
            "cols" => false,
            _ => return Err("axis must be rows or cols".into()),
        };
        let (limit, cap) = if rows { (gridcraft_engine::core::MAX_ROWS, MAX_RESIZE_ROWS) } else { (gridcraft_engine::core::MAX_COLS, MAX_RESIZE_COLS) };
        if count == 0 || count > cap || first.checked_add(count).is_none_or(|v| v > limit) {
            return Err(format!("invalid {axis} span (1 to {cap} lines inside the sheet)"));
        }
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            if sh.is_protected() {
                return Err("The sheet is protected. Unprotect it to insert or delete rows or columns.".into());
            }
        }
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let command = match (op.get("kind").and_then(|v| v.as_str()), rows) {
            (Some("insert"), true) => "home.insertRows",
            (Some("insert"), false) => "home.insertColumns",
            (Some("delete"), true) => "home.deleteRows",
            (Some("delete"), false) => "home.deleteColumns",
            _ => return Err("unsupported row or column operation".into()),
        };
        let name = |n: u32| if rows { n.to_string() } else { CellRef::new(0, n).a1().trim_end_matches(char::is_numeric).to_string() };
        let (a, b) = if rows { (first + 1, first + count) } else { (first, first + count - 1) };
        let mut params = json!({"sheet": sheet});
        params[axis] = json!(format!("{}:{}", name(a), name(b)));
        self.session.run(command, params).map(|v| v.to_string())
    }

    /// Sorts the rows of an explicit block as ONE history entry. `op_json` is
    /// `{"header":bool,"keys":[{"column":offset,"order":"asc"|"desc"}],"matchCase":bool}` where `column` is the
    /// 0-based offset inside the block. The block is never widened: only the cells given are reordered, formulas
    /// keep their relative references, and merged cells or a protected sheet are refused. At most 3 keys and
    /// MAX_SORT_CELLS cells. The target sheet is activated first because the engine sorts the active sheet.
    pub fn sort_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows < 2 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_SORT_CELLS {
            return Err("Select at least two rows to sort (at most 1,000,000 cells).".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let header = op.get("header").and_then(|v| v.as_bool()).ok_or("header must be true or false")?;
        let match_case = op.get("matchCase").and_then(|v| v.as_bool()).unwrap_or(false);
        let raw_keys = op.get("keys").and_then(|v| v.as_array()).ok_or("keys must be a list")?;
        if raw_keys.is_empty() || raw_keys.len() > MAX_SORT_KEYS {
            return Err(format!("Sort by 1 to {MAX_SORT_KEYS} columns."));
        }
        if header && rows < 3 {
            return Err("Nothing to sort below the header row.".into());
        }
        let mut keys = Vec::new();
        for k in raw_keys {
            let column = k.get("column").and_then(|v| v.as_u64()).filter(|c| *c < u64::from(cols)).ok_or("sort column is outside the selection")?;
            let desc = match k.get("order").and_then(|v| v.as_str()) {
                Some("asc") => false,
                Some("desc") => true,
                _ => return Err("order must be asc or desc".into()),
            };
            keys.push(json!({"column": column, "order": if desc { "desc" } else { "asc" }}));
        }
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run("data.sort", json!({"range": range, "header": header, "keys": keys, "matchCase": match_case})).map(|v| v.to_string())
    }

    /// Fills the selected block in one direction (`down`, `right`, `up`, `left`) as ONE history entry, copying the first
    /// row/column of the block (the last for up/left) over the rest like Fill Down/Right. Formulas shift relative references.
    /// With a single row (or column) selected, down/right copy from the row above (column to the left), so that needs
    /// one more row above (column to the left). Protected sheets and blocks over 1,000,000 cells are refused.
    pub fn fill_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, dir: &str) -> Result<String, String> {
        let (cmd, vertical) = match dir {
            "down" => ("edit.fillDown", true),
            "up" => ("edit.fillUp", true),
            "right" => ("edit.fillRight", false),
            "left" => ("edit.fillLeft", false),
            _ => return Err("direction must be down, right, up or left".into()),
        };
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells to fill.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let span = if vertical { rows } else { cols };
        let start = if vertical { row } else { col };
        if span < 2 && (dir == "up" || dir == "left" || start == 0) {
            return Err("Select at least two rows or columns to fill.".into());
        }
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run(cmd, json!({"range": range})).map(|v| v.to_string())
    }

    /// Filters rows by one column as ONE history entry. `op_json` is `{"kind":"custom","column":abs,"op":..,"value":..}`
    /// (op one of FILTER_OPS), `{"kind":"clear","column":abs}`, `{"kind":"clearAll"}` or `{"kind":"off"}`; `column` is the
    /// absolute 0-based sheet column. The block only creates the filter (its first row is the header); an existing
    /// filter keeps its own range. Protected sheets, filters inside tables, empty or oversized values are refused.
    /// Hidden rows come from the engine, so they follow the file and undo.
    pub fn filter_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        self.check_block(sheet, row, col, rows.max(1), cols.max(1), true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let (existing, in_table) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            (sh.autofilter.as_ref().map(|a| (a.range.start.col, a.range.end.col)), sh.table_at(doc.selection.active).is_some())
        };
        if in_table {
            return Err("Filters inside tables are not supported here.".into());
        }
        let abs_col = |op: &serde_json::Value| -> Result<u32, String> {
            let c = op.get("column").and_then(|v| v.as_u64()).filter(|c| *c < u64::from(gridcraft_engine::core::MAX_COLS)).ok_or("filter column is outside the sheet")?;
            Ok(c as u32)
        };
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        match kind {
            "off" => {
                if existing.is_none() {
                    return Err("There is no filter on this sheet.".into());
                }
                self.session.run("data.filter", json!({})).map(|v| v.to_string())
            }
            "clearAll" => {
                if existing.is_none() {
                    return Err("There is no filter on this sheet.".into());
                }
                self.session.run("data.clearFilter", json!({})).map(|v| v.to_string())
            }
            "clear" => {
                let (first, last) = existing.ok_or("There is no filter on this sheet.")?;
                let c = abs_col(&op)?;
                if c < first || c > last {
                    return Err("The column is outside the filter range.".into());
                }
                self.session.run("data.filterBy", json!({"column": c - first, "clear": true})).map(|v| v.to_string())
            }
            "custom" => {
                let c = abs_col(&op)?;
                let cmp = op.get("op").and_then(|v| v.as_str()).filter(|o| FILTER_OPS.contains(o)).ok_or("unsupported filter condition")?;
                let value = op.get("value").and_then(|v| v.as_str()).ok_or("filter value must be text")?;
                if value.is_empty() || value.chars().count() > MAX_FILTER_VALUE || value.chars().any(char::is_control) {
                    return Err(format!("A filter value must be 1 to {MAX_FILTER_VALUE} characters."));
                }
                let criterion = json!({"op": cmp, "value": value});
                match existing {
                    Some((first, last)) => {
                        if c < first || c > last {
                            return Err("The column is outside the filter range.".into());
                        }
                        self.session.run("data.filterBy", json!({"column": c - first, "custom": criterion})).map(|v| v.to_string())
                    }
                    None => {
                        if rows < 2 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_SORT_CELLS || c < col || c >= col + cols {
                            return Err("Select a header row, at least one data row and the column to filter.".into());
                        }
                        let before = self.session.doc().map_err(|e| e.to_string())?.undo.len();
                        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
                        self.session.run("data.filter", json!({"range": range}))?;
                        let out = match self.session.run("data.filterBy", json!({"column": c - col, "custom": criterion})) {
                            Ok(v) => v.to_string(),
                            Err(e) => {
                                let _ = self.undo();
                                return Err(e.to_string());
                            }
                        };
                        // Creating the filter and applying it is one user action: keep only the first snapshot.
                        let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
                        if doc.undo.len() == before + 2 {
                            doc.undo.pop();
                        }
                        Ok(out)
                    }
                }
            }
            _ => Err("unsupported filter operation".into()),
        }
    }

    /// Freezes the first `rows` rows and `cols` columns (0 and 0 unfreezes), as one history entry.
    pub fn freeze_panes(&mut self, sheet: usize, rows: u32, cols: u32) -> Result<String, String> {
        if rows > MAX_FREEZE || cols > MAX_FREEZE {
            return Err(format!("freeze at most {MAX_FREEZE} rows and columns"));
        }
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            if sh.is_protected() {
                return Err("The sheet is protected. Unprotect it to change the view.".into());
            }
        }
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        if rows == 0 && cols == 0 {
            self.session.run("view.unfreezePanes", json!({})).map(|v| v.to_string())
        } else {
            self.session.run("view.freezePanes", json!({"cell": CellRef::new(rows, cols).a1()})).map(|v| v.to_string())
        }
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
        let (command, params) = if op.get("kind").and_then(|v| v.as_str()) == Some("decimals") {
            self.decimals_command(sheet, row, col, rows, cols, &op)?
        } else {
            format_command(&op)?
        };
        let a = CellRef::new(row, col).a1();
        let b = CellRef::new(row + rows - 1, col + cols - 1).a1();
        let mut call = params;
        call["sheet"] = json!(sheet);
        call["range"] = json!(format!("{a}:{b}"));
        self.session.run(command, call).map(|v| v.to_string())
    }

    /// Increase/decrease decimals like a spreadsheet: the active cell (`at`, inside the block) decides the
    /// new number format, which is then applied to the whole block.
    fn decimals_command(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op: &serde_json::Value) -> Result<(&'static str, serde_json::Value), String> {
        let delta = match op.get("delta").and_then(|v| v.as_i64()) {
            Some(d @ (-1 | 1)) => d as i32,
            _ => return Err("delta must be 1 or -1".into()),
        };
        let at = op.get("at").ok_or("missing active cell")?;
        let (ar, ac) = match (at.get("row").and_then(|v| v.as_u64()), at.get("col").and_then(|v| v.as_u64())) {
            (Some(r), Some(c)) if r <= u64::from(u32::MAX) && c <= u64::from(u32::MAX) => (r as u32, c as u32),
            _ => return Err("invalid active cell".into()),
        };
        if ar < row || ar >= row + rows || ac < col || ac >= col + cols {
            return Err("active cell must be inside the block".into());
        }
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let cell = CellRef::new(ar, ac);
        let code = doc.wb.styles.get(sh.style_id(cell)).num_fmt.as_str().to_string();
        let next = gridcraft_engine::cmd::format::adjust_decimals(&code, &sh.value(cell), delta);
        if next.len() > 255 {
            return Err("number format too long".into());
        }
        Ok(("home.numberFormat", json!({"code": next})))
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
        "wrap": st.align.wrap, "indent": st.align.indent,
        "v": match st.align.v { VAlign::Top => "top", VAlign::Center => "middle", _ => "bottom" }, "fmt": st.num_fmt.as_str(),
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
    fn fmt_text(b: &HeadlessWorkbook, a: &str) -> (String, String) {
        let col = (a.as_bytes()[0] - b'A') as u32;
        let row = a[1..].parse::<u32>().unwrap() - 1;
        let v: serde_json::Value = serde_json::from_str(&b.view_range(0, row, col, 1, 1).unwrap()).unwrap();
        (v["cells"][0]["style"]["fmt"].as_str().unwrap().to_string(), v["cells"][0]["text"].as_str().unwrap().to_string())
    }
    fn style_of(b: &HeadlessWorkbook, a: &str) -> serde_json::Value {
        let col = (a.as_bytes()[0] - b'A') as u32;
        let row = a[1..].parse::<u32>().unwrap() - 1;
        let v: serde_json::Value = serde_json::from_str(&b.view_range(0, row, col, 1, 1).unwrap()).unwrap();
        v["cells"][0]["style"].clone()
    }
    #[test]
    fn alignment_wrap_indent_and_borders_read_back_roundtrip_and_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "x").unwrap();
        book.set_cell(0, "I2", "y").unwrap();
        book.format_range(0, 0, 7, 1, 1, r#"{"kind":"hAlign","align":"right"}"#).unwrap();
        book.format_range(0, 0, 7, 1, 1, r#"{"kind":"vAlign","align":"top"}"#).unwrap();
        book.format_range(0, 0, 7, 1, 1, r#"{"kind":"wrap","on":true}"#).unwrap();
        book.format_range(0, 0, 7, 1, 1, r#"{"kind":"indent","delta":1}"#).unwrap();
        let st = style_of(&book, "H1");
        assert_eq!((st["h"].as_str(), st["v"].as_str(), st["wrap"].as_bool(), st["indent"].as_u64()), (Some("right"), Some("top"), Some(true), Some(1)));
        // Outside border on a 2x2 block only touches the block's edges.
        book.format_range(0, 0, 7, 2, 2, r##"{"kind":"borders","preset":"outside","style":"medium","color":"#FF0000"}"##).unwrap();
        assert!(!style_of(&book, "H1")["borders"]["t"].is_null());
        assert!(style_of(&book, "I2")["borders"]["b"]["color"].as_str() == Some("#FF0000"));
        assert!(style_of(&book, "H1")["borders"]["b"].is_null(), "inner edge stays clear");
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        assert_eq!(style_of(&reopened, "H1")["h"], "right");
        assert_eq!(style_of(&reopened, "H1")["wrap"], true);
        assert!(!style_of(&reopened, "I2")["borders"]["r"].is_null());
        book.undo().unwrap();
        assert!(style_of(&book, "I2")["borders"]["b"].is_null(), "one undo removes the whole border action");
        assert_eq!(style_of(&book, "H1")["indent"], 1);
        book.format_range(0, 0, 7, 1, 1, r#"{"kind":"borders","preset":"none"}"#).unwrap();
        for op in [
            r#"{"kind":"hAlign","align":"justify"}"#,
            r#"{"kind":"vAlign"}"#,
            r#"{"kind":"wrap"}"#,
            r#"{"kind":"indent","delta":2}"#,
            r#"{"kind":"borders","preset":"sparkle"}"#,
            r#"{"kind":"borders","preset":"all","style":"zigzag"}"#,
            r#"{"kind":"borders","preset":"all","color":"red"}"#,
        ] {
            assert!(book.format_range(0, 0, 7, 1, 1, op).is_err(), "{op}");
        }
    }
    fn layout_of(b: &HeadlessWorkbook) -> serde_json::Value {
        serde_json::from_str(&b.layout(0).unwrap()).unwrap()
    }
    #[test]
    fn resize_hide_autofit_and_freeze_read_back_roundtrip_and_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "a fairly long piece of text to fit").unwrap();
        book.resize_lines(0, "cols", 7, 2, r#"{"kind":"size","px":200}"#).unwrap();
        let l = layout_of(&book);
        let w = |i: u64| l["cols"].as_array().unwrap().iter().find(|c| c["i"] == i).map(|c| c["w"].as_f64().unwrap());
        assert_eq!((w(7), w(8), w(9)), (Some(200.0), Some(200.0), None), "columns H:I resized, J untouched");
        book.resize_lines(0, "cols", 7, 1, r#"{"kind":"autofit"}"#).unwrap();
        assert!(layout_of(&book)["cols"].as_array().unwrap().iter().any(|c| c["i"] == 7 && c["w"].as_f64().unwrap() > 100.0));
        book.resize_lines(0, "cols", 8, 1, r#"{"kind":"hide"}"#).unwrap();
        assert!(layout_of(&book)["cols"].as_array().unwrap().iter().any(|c| c["i"] == 8 && c["hidden"] == true));
        book.resize_lines(0, "cols", 8, 1, r#"{"kind":"unhide"}"#).unwrap();
        assert!(layout_of(&book)["cols"].as_array().unwrap().iter().all(|c| c["i"] != 8 || c["hidden"] == false));
        book.resize_lines(0, "rows", 2, 3, r#"{"kind":"size","px":40}"#).unwrap();
        let rows = layout_of(&book);
        assert!(rows["rows"].as_array().unwrap().iter().filter(|r| (2..5).contains(&r["i"].as_u64().unwrap())).all(|r| r["h"] == 40.0));
        book.resize_lines(0, "rows", 3, 1, r#"{"kind":"hide"}"#).unwrap();
        assert!(layout_of(&book)["rows"].as_array().unwrap().iter().any(|r| r["i"] == 3 && r["hidden"] == true));
        book.freeze_panes(0, 1, 2).unwrap();
        assert_eq!(layout_of(&book)["freeze"], json!({"rows": 1, "cols": 2}));
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        assert_eq!(layout_of(&reopened)["freeze"], json!({"rows": 1, "cols": 2}));
        book.undo().unwrap();
        assert!(layout_of(&book)["freeze"].is_null(), "one undo removes the freeze");
        book.freeze_panes(0, 1, 0).unwrap();
        book.freeze_panes(0, 0, 0).unwrap();
        assert!(layout_of(&book)["freeze"].is_null());
        for (axis, first, count, op) in [
            ("cells", 0, 1, r#"{"kind":"hide"}"#),
            ("cols", 0, 0, r#"{"kind":"hide"}"#),
            ("cols", 16_383, 2, r#"{"kind":"hide"}"#),
            ("rows", 0, 100_001, r#"{"kind":"hide"}"#),
            ("cols", 0, 1, r#"{"kind":"size","px":3000}"#),
            ("cols", 0, 1, r#"{"kind":"size","px":-1}"#),
            ("rows", 0, 1, r#"{"kind":"size","px":600}"#),
            ("rows", 0, 1, r#"{"kind":"size"}"#),
            ("rows", 0, 1, r#"{"kind":"delete"}"#),
        ] {
            assert!(book.resize_lines(0, axis, first, count, op).is_err(), "{axis} {first} {count} {op}");
        }
        assert!(book.resize_lines(9, "cols", 0, 1, r#"{"kind":"hide"}"#).is_err(), "unknown sheet");
        assert!(book.freeze_panes(0, 21, 0).is_err());
        assert!(book.freeze_panes(9, 1, 0).is_err());
    }
    #[test]
    fn insert_and_delete_lines_shift_references_roundtrip_and_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        for (a, v) in [("H1", "1"), ("H2", "2"), ("H3", "3"), ("J1", "SUM(H1:H3)"), ("K3", "=H3*10")] {
            book.set_cell(0, a, v).unwrap();
        }
        let formula = |b: &HeadlessWorkbook, row: u32, col: u32| -> String {
            let v: serde_json::Value = serde_json::from_str(&b.range(0, row, col, 1, 1).unwrap()).unwrap();
            v["cells"][0]["formula"].as_str().unwrap_or("").to_string()
        };
        book.edit_lines(0, "rows", 1, 1, r#"{"kind":"insert"}"#).unwrap();
        assert_eq!(fmt_text(&book, "H3").1, "2", "H2 moved down");
        assert_eq!(fmt_text(&book, "H4").1, "3");
        assert_eq!(formula(&book, 0, 9), "SUM(H1:H4)", "range grows over the inserted row");
        assert_eq!(formula(&book, 3, 10), "H4*10", "K3 moved to K4 and follows H3 to H4");
        assert_eq!(fmt_text(&book, "J1").1, "6");
        book.undo().unwrap();
        assert_eq!(formula(&book, 0, 9), "SUM(H1:H3)", "one undo restores rows and formulas");
        assert_eq!(fmt_text(&book, "H2").1, "2");
        book.edit_lines(0, "cols", 5, 1, r#"{"kind":"insert"}"#).unwrap();
        assert_eq!(formula(&book, 0, 10), "SUM(I1:I3)", "inserting a column before H moves the references");
        book.undo().unwrap();
        book.edit_lines(0, "rows", 2, 1, r#"{"kind":"delete"}"#).unwrap();
        assert_eq!(formula(&book, 0, 9), "SUM(H1:H2)", "deleting a row inside the range shrinks it");
        assert!(fmt_text(&book, "K2").1.contains("REF"), "K3 referred to the deleted row: {:?}", fmt_text(&book, "K2"));
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        assert_eq!(formula(&reopened, 0, 9), "SUM(H1:H2)");
        book.undo().unwrap();
        assert_eq!(fmt_text(&book, "H3").1, "3");
        for (axis, first, count, op) in [
            ("cells", 0, 1, r#"{"kind":"insert"}"#),
            ("rows", 0, 0, r#"{"kind":"insert"}"#),
            ("rows", 0, 100_001, r#"{"kind":"delete"}"#),
            ("cols", 16_383, 2, r#"{"kind":"insert"}"#),
            ("rows", 0, 1, r#"{"kind":"clear"}"#),
            ("rows", 0, 1, r#"{}"#),
        ] {
            assert!(book.edit_lines(0, axis, first, count, op).is_err(), "{axis} {first} {count} {op}");
        }
        assert!(book.edit_lines(9, "rows", 0, 1, r#"{"kind":"insert"}"#).is_err(), "unknown sheet");
    }
    #[test]
    fn number_format_presets_display_roundtrip_and_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "1234.5").unwrap();
        let cases = [
            (r#"{"kind":"numFmt","preset":"number"}"#, "0.00", "1234.50"),
            (r#"{"kind":"numFmt","preset":"number","decimals":0}"#, "0", "1235"),
            (r#"{"kind":"numFmt","preset":"comma","decimals":1}"#, "#,##0.0", "1,234.5"),
            (r#"{"kind":"numFmt","preset":"percent"}"#, "0%", "123450%"),
            (r#"{"kind":"numFmt","preset":"percent","decimals":2}"#, "0.00%", "123450.00%"),
            (r#"{"kind":"numFmt","preset":"currency"}"#, "\"$\"#,##0.00", "$1,234.50"),
            (r#"{"kind":"numFmt","preset":"currency","symbol":"€","decimals":0}"#, "\"€\"#,##0", "€1,235"),
            (r#"{"kind":"numFmt","preset":"scientific","decimals":1}"#, "0.0E+00", "1.2E+03"),
            (r#"{"kind":"numFmt","preset":"text"}"#, "@", "1234.5"),
            (r#"{"kind":"numFmt","preset":"general"}"#, "General", "1234.5"),
        ];
        for (op, code, shown) in cases {
            book.format_range(0, 0, 7, 1, 1, op).unwrap();
            assert_eq!(fmt_text(&book, "H1"), (code.to_string(), shown.to_string()), "{op}");
        }
        book.set_cell(0, "H2", "46302").unwrap();
        book.format_range(0, 1, 7, 1, 1, r#"{"kind":"numFmt","preset":"date"}"#).unwrap();
        assert_eq!(fmt_text(&book, "H2").1, "2026-10-07");
        // XLSX roundtrip keeps the code and the displayed text.
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        assert_eq!(fmt_text(&reopened, "H2"), ("yyyy-mm-dd".to_string(), "2026-10-07".to_string()));
        // One undo step per format change; the value never changes.
        book.undo().unwrap();
        assert_eq!(fmt_text(&book, "H2").0, "General");
        assert_eq!(fmt_text(&book, "H1").0, "General");
    }
    #[test]
    fn decimals_follow_the_active_cell_and_apply_to_the_block() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_cell(0, "H1", "1.5").unwrap();
        book.set_cell(0, "H2", "2.25").unwrap();
        let more = r#"{"kind":"decimals","delta":1,"at":{"row":0,"col":7}}"#;
        book.format_range(0, 0, 7, 2, 1, more).unwrap();
        assert_eq!(fmt_text(&book, "H1"), ("0.00".to_string(), "1.50".to_string()), "General 1.5 shows 1 decimal, +1 gives 2");
        assert_eq!(fmt_text(&book, "H2").0, "0.00", "the whole block takes the active cell's new format");
        book.format_range(0, 0, 7, 2, 1, r#"{"kind":"decimals","delta":-1,"at":{"row":0,"col":7}}"#).unwrap();
        assert_eq!(fmt_text(&book, "H1").0, "0.0");
        assert!(book.format_range(0, 0, 7, 2, 1, r#"{"kind":"decimals","delta":2,"at":{"row":0,"col":7}}"#).is_err());
        assert!(book.format_range(0, 0, 7, 2, 1, r#"{"kind":"decimals","delta":1}"#).is_err());
        assert!(book.format_range(0, 0, 7, 2, 1, r#"{"kind":"decimals","delta":1,"at":{"row":5,"col":7}}"#).is_err(), "active cell outside the block");
    }
    #[test]
    fn number_format_presets_reject_free_text_and_bad_parameters() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        for op in [
            r#"{"kind":"numFmt","code":"0.00"}"#,
            r#"{"kind":"numFmt","preset":"0.00"}"#,
            r#"{"kind":"numFmt","preset":"General;[Red]@"}"#,
            r#"{"kind":"numFmt","preset":"number","decimals":11}"#,
            r#"{"kind":"numFmt","preset":"number","decimals":-1}"#,
            r#"{"kind":"numFmt","preset":"number","decimals":1.5}"#,
            r#"{"kind":"numFmt","preset":"date","decimals":2}"#,
            r#"{"kind":"numFmt","preset":"number","symbol":"$"}"#,
            r#"{"kind":"numFmt","preset":"currency","symbol":"\"0;"}"#,
            r#"{"kind":"numFmt","preset":"currency","symbol":"BTC"}"#,
            r#"{"kind":"numFmt"}"#,
        ] {
            assert!(book.format_range(0, 1, 1, 1, 1, op).is_err(), "{op}");
        }
        assert_eq!(info_json(&book)["canUndo"], false);
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
    fn sheet_names(b: &HeadlessWorkbook) -> Vec<String> {
        let v: serde_json::Value = serde_json::from_str(&b.sheets().unwrap()).unwrap();
        v["sheets"].as_array().unwrap().iter().map(|s| s["name"].as_str().unwrap().to_string()).collect()
    }
    #[test]
    fn sheets_can_be_added_renamed_duplicated_moved_and_deleted_with_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let first = sheet_names(&book);
        let n = first.len();
        let r: serde_json::Value = serde_json::from_str(&book.edit_sheet(0, r#"{"kind":"add","name":"Notes"}"#).unwrap()).unwrap();
        assert_eq!(r["active"], 1, "the new sheet follows the sheet it was added after");
        assert_eq!(sheet_names(&book)[1], "Notes");
        book.undo().unwrap();
        assert_eq!(sheet_names(&book), first, "one undo removes the added sheet");
        book.edit_sheet(0, r#"{"kind":"add"}"#).unwrap();
        assert_eq!(sheet_names(&book).len(), n + 1, "engine picks a default name");
        book.edit_sheet(1, r#"{"kind":"rename","name":"Ideas"}"#).unwrap();
        assert_eq!(sheet_names(&book)[1], "Ideas");
        let d: serde_json::Value = serde_json::from_str(&book.edit_sheet(1, r#"{"kind":"duplicate"}"#).unwrap()).unwrap();
        assert_eq!(d["active"], 2);
        assert_eq!(sheet_names(&book)[2], "Ideas (2)");
        book.edit_sheet(2, r#"{"kind":"move","to":0}"#).unwrap();
        assert_eq!(sheet_names(&book)[0], "Ideas (2)");
        let reopened = HeadlessWorkbook::new(&book.export_xlsx().unwrap()).unwrap();
        assert_eq!(sheet_names(&reopened), sheet_names(&book));
        book.edit_sheet(0, r#"{"kind":"delete"}"#).unwrap();
        assert!(!sheet_names(&book).contains(&"Ideas (2)".to_string()));
        book.undo().unwrap();
        assert!(sheet_names(&book).contains(&"Ideas (2)".to_string()), "one undo brings the deleted sheet back");
        for (sheet, op) in [
            (0, r#"{"kind":"rename","name":""}"#),
            (0, r#"{"kind":"rename","name":"   "}"#),
            (0, r#"{"kind":"rename","name":"0123456789012345678901234567890123"}"#),
            (0, r#"{"kind":"rename","name":"bad:name"}"#),
            (0, r#"{"kind":"rename","name":"a\u0001b"}"#),
            (0, r#"{"kind":"rename"}"#),
            (0, r#"{"kind":"move","to":99}"#),
            (0, r#"{"kind":"fly"}"#),
            (99, r#"{"kind":"delete"}"#),
        ] {
            assert!(book.edit_sheet(sheet, op).is_err(), "{op}");
        }
        let taken = sheet_names(&book)[1].clone();
        assert!(book.edit_sheet(0, &format!(r#"{{"kind":"rename","name":"{}"}}"#, taken.to_lowercase())).is_err(), "names are unique, ignoring case");
    }
    #[test]
    fn sort_range_orders_rows_in_one_undo_step_and_never_widens() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 20, 0, r#"[["name","n"],["b","2"],["a","3"],["c","1"]]"#).unwrap();
        book.set_values(0, 24, 0, r#"[["keep","9"]]"#).unwrap();
        book.set_values(0, 20, 3, r#"[["x"],["x"],["x"],["x"]]"#).unwrap();
        let op = r#"{"header":true,"keys":[{"column":1,"order":"desc"}]}"#;
        book.sort_range(0, 20, 0, 4, 2, op).unwrap();
        assert_eq!(text(&book, "A21"), "name");
        assert_eq!(text(&book, "A22"), "a");
        assert_eq!(text(&book, "A23"), "b");
        assert_eq!(text(&book, "A24"), "c");
        assert_eq!(text(&book, "A25"), "keep");
        assert_eq!(text(&book, "D22"), "x");
        book.undo().unwrap();
        assert_eq!(text(&book, "A22"), "b");
        assert_eq!(text(&book, "A23"), "a");
        assert_eq!(text(&book, "B23"), "3");
    }
    #[test]
    fn sort_range_rejects_bad_input_and_protected_sheets() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let ok = r#"{"header":false,"keys":[{"column":0,"order":"asc"}]}"#;
        assert!(book.sort_range(0, 0, 0, 1, 2, ok).is_err());
        assert!(book.sort_range(0, 0, 0, 3, 2, r#"{"header":false,"keys":[{"column":2,"order":"asc"}]}"#).is_err());
        assert!(book.sort_range(0, 0, 0, 3, 2, r#"{"header":false,"keys":[]}"#).is_err());
        assert!(book.sort_range(0, 0, 0, 3, 2, r#"{"header":false,"keys":[{"column":0,"order":"up"}]}"#).is_err());
        assert!(book.sort_range(0, 0, 0, 3, 2, r#"{"keys":[{"column":0,"order":"asc"}]}"#).is_err());
        assert!(book.sort_range(0, 0, 0, 3, 2, "nope").is_err());
        assert!(book.sort_range(0, 0, 0, 2_000_000, 2, ok).is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.sort_range(0, 0, 0, 3, 2, ok).unwrap_err().contains("protected"));
    }
    #[test]
    fn filter_range_hides_rows_in_one_undo_step_and_clears() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 20, 0, r#"[["name","n"],["b","2"],["a","3"],["c","1"]]"#).unwrap();
        let before = book.layout(0).unwrap();
        book.filter_range(0, 20, 0, 4, 2, r#"{"kind":"custom","column":1,"op":">","value":"1"}"#).unwrap();
        let lay: serde_json::Value = serde_json::from_str(&book.layout(0).unwrap()).unwrap();
        let hidden = lay["rows"].as_array().unwrap().iter().filter(|r| r["hidden"] == true).count();
        assert_eq!(hidden, 1, "only the row with n = 1 is hidden");
        book.filter_range(0, 20, 0, 4, 2, r#"{"kind":"clearAll"}"#).unwrap();
        let lay: serde_json::Value = serde_json::from_str(&book.layout(0).unwrap()).unwrap();
        assert_eq!(lay["rows"].as_array().unwrap().iter().filter(|r| r["hidden"] == true).count(), 0);
        book.undo().unwrap();
        book.undo().unwrap();
        assert_eq!(book.layout(0).unwrap(), before, "undo of the filter and its creation is one step");
    }
    #[test]
    fn filter_range_rejects_bad_input_and_protected_sheets() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let ok = r#"{"kind":"custom","column":0,"op":"contains","value":"a"}"#;
        assert!(book.filter_range(0, 0, 0, 1, 2, ok).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, r#"{"kind":"custom","column":5,"op":"contains","value":"a"}"#).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, r#"{"kind":"custom","column":0,"op":"regex","value":"a"}"#).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, r#"{"kind":"custom","column":0,"op":"contains","value":""}"#).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, r#"{"kind":"clearAll"}"#).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, r#"{"kind":"off"}"#).is_err());
        assert!(book.filter_range(0, 0, 0, 3, 2, "nope").is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.filter_range(0, 0, 0, 3, 2, ok).unwrap_err().contains("protected"));
    }
    #[test]
    fn reviewed_cell_write_is_atomic_with_receipt_readback_and_exact_undo() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let state: serde_json::Value = serde_json::from_str(&book.native_state().unwrap()).unwrap();
        let token = state["token"].as_str().unwrap().to_string();
        let old: serde_json::Value = serde_json::from_str(&book.range(0, 29, 0, 1, 1).unwrap()).unwrap();
        let old_cell = old["cells"][0].to_string();
        let r: serde_json::Value = serde_json::from_str(&book.set_cell_reviewed(0, "A30", &token, &old_cell, "42").unwrap()).unwrap();
        assert_eq!(r["applied"], 1);
        assert_eq!(r["afterRevision"].as_u64().unwrap(), r["beforeRevision"].as_u64().unwrap() + 1);
        assert_eq!(text(&book, "A30"), "42");
        // The same review cannot be applied twice, and a manual edit makes it stale without mutation.
        assert!(book.set_cell_reviewed(0, "A30", &token, &old_cell, "7").unwrap_err().starts_with("stale"));
        assert_eq!(text(&book, "A30"), "42");
        let after_token = r["token"].as_str().unwrap().to_string();
        let u: serde_json::Value = serde_json::from_str(&book.undo_reviewed(0, "A30", &after_token).unwrap()).unwrap();
        assert_eq!(u["applied"], 1);
        assert_eq!(text(&book, "A30"), "");
        assert!(book.undo_reviewed(0, "A30", &after_token).unwrap_err().starts_with("stale"));
    }
    #[test]
    fn reviewed_undo_refuses_after_a_newer_edit_and_no_op_applies_zero() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let token = |b: &HeadlessWorkbook| -> String { serde_json::from_str::<serde_json::Value>(&b.native_state().unwrap()).unwrap()["token"].as_str().unwrap().to_string() };
        let cell = |b: &HeadlessWorkbook, row: u32| -> String { serde_json::from_str::<serde_json::Value>(&b.range(0, row, 0, 1, 1).unwrap()).unwrap()["cells"][0].to_string() };
        let t0 = token(&book);
        let r: serde_json::Value = serde_json::from_str(&book.set_cell_reviewed(0, "A30", &t0, &cell(&book, 29), "42").unwrap()).unwrap();
        let t1 = r["token"].as_str().unwrap().to_string();
        book.set_cell(0, "A31", "x").unwrap();
        assert!(book.undo_reviewed(0, "A30", &t1).unwrap_err().starts_with("stale"));
        assert_eq!(text(&book, "A30"), "42");
        let t2 = token(&book);
        let n: serde_json::Value = serde_json::from_str(&book.set_cell_reviewed(0, "A30", &t2, &cell(&book, 29), "42").unwrap()).unwrap();
        assert_eq!(n["applied"], 0, "writing the same value is a true no-op");
        assert_eq!(n["undoable"], false);
    }
    #[test]
    fn reviewed_write_rejects_bad_input_and_protected_sheets_without_mutation() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let state: serde_json::Value = serde_json::from_str(&book.native_state().unwrap()).unwrap();
        let token = state["token"].as_str().unwrap().to_string();
        let old = serde_json::from_str::<serde_json::Value>(&book.range(0, 29, 0, 1, 1).unwrap()).unwrap()["cells"][0].to_string();
        assert!(book.set_cell_reviewed(0, "nope", &token, &old, "1").is_err());
        assert!(book.set_cell_reviewed(0, "A30", &token, "not json", "1").is_err());
        assert!(book.set_cell_reviewed(0, "A30", &token, &old, &"x".repeat(32_768)).is_err());
        assert!(book.set_cell_reviewed(0, "A30", &token, "{\"address\":\"A30\",\"value\":\"other\",\"formula\":null}", "1").unwrap_err().starts_with("stale"));
        assert!(book.set_cell_reviewed(9, "A30", &token, &old, "1").is_err());
        assert_eq!(text(&book, "A30"), "");
        book.session.run("review.protectSheet", json!({})).unwrap();
        let token = serde_json::from_str::<serde_json::Value>(&book.native_state().unwrap()).unwrap()["token"].as_str().unwrap().to_string();
        assert!(book.set_cell_reviewed(0, "A30", &token, &old, "1").unwrap_err().contains("protected"));
    }
    #[test]
    fn the_last_visible_sheet_cannot_be_deleted() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        while sheet_names(&book).len() > 1 {
            book.edit_sheet(0, r#"{"kind":"delete"}"#).unwrap();
        }
        assert!(book.edit_sheet(0, r#"{"kind":"delete"}"#).is_err());
        assert_eq!(sheet_names(&book).len(), 1);
    }
    #[test]
    fn fill_range_copies_in_one_undo_step_and_refuses_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 30, 0, r#"[["1","=A31+1"],["",""],["",""]]"#).unwrap();
        book.fill_range(0, 30, 0, 3, 2, "down").unwrap();
        assert_eq!(text(&book, "A33"), "1");
        assert_eq!(text(&book, "B33"), "2");
        book.undo().unwrap();
        assert_ne!(text(&book, "A33"), "1");
        book.set_values(0, 40, 0, r#"[["7","","",""]]"#).unwrap();
        book.fill_range(0, 40, 0, 1, 4, "right").unwrap();
        assert_eq!(text(&book, "D41"), "7");
        assert!(book.fill_range(0, 0, 0, 1, 2, "down").is_err(), "no row above to copy");
        assert!(book.fill_range(0, 5, 0, 1, 2, "up").is_err());
        assert!(book.fill_range(0, 5, 0, 3, 2, "sideways").is_err());
        assert!(book.fill_range(0, 0, 0, 2_000_000, 2, "down").is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.fill_range(0, 5, 0, 3, 2, "down").unwrap_err().contains("protected"));
    }
}
