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
const MAX_CF_RULES: usize = 64;
const MAX_SPLIT_PARTS: usize = 20;
const MAX_NOTE_CHARS: usize = 2000;
const MAX_NAMES: usize = 500;
const MAX_TABLES: usize = 200;
const MAX_EXPORT_BYTES: usize = 40 * 1024 * 1024;
const MAX_HEADER_CHARS: usize = 100;
const MAX_PASSWORD_CHARS: usize = 64;
const MAX_CHARTS: usize = 50;
const ICON_SETS: &[&str] = &["3Arrows", "3TrafficLights1", "3Symbols", "3Flags", "4Arrows", "4Rating", "5Arrows", "5Rating", "5Quarters"];
const MAX_SPARKLINES: usize = 500;
const MAX_SCENE_PRIMS: usize = 20_000;
const MAX_TITLE_CHARS: usize = 120;
const MAX_WHATIF_REFS: usize = 200;
const MAX_WHATIF_NAME: usize = 255;
const MAX_WHATIF_VALUES: usize = 32;
const MAX_OBJECTS: usize = 200;
const MAX_SAVED_VIEWS: usize = 50;
const MAX_VIEW_NAME: usize = 64;
/// Reviewed range edits: at most this many cells, and this many bytes of old and new text.
const MAX_REVIEWED_RANGE_CELLS: u64 = 1000;
const MAX_REVIEWED_RANGE_BYTES: usize = 1_000_000;
const MAX_SUBTOTAL_GROUPS: usize = 100;
const MAX_PICTURES: usize = 100;
const MAX_PICTURE_BYTES: usize = 10 * 1024 * 1024;
const MAX_SHAPE_TEXT: usize = 200;
const SHAPE_KINDS: &[&str] = &["rectangle", "roundedRectangle", "ellipse", "triangle", "line", "arrow", "textBox"];

/// A shape color preset as the hex the engine takes ("auto" means no color).
fn shape_color(name: &str, line: bool) -> Option<&'static str> {
    Some(match name {
        "blue" => "#4A7BD0",
        "green" => "#5BA85B",
        "orange" => "#E8923A",
        "red" => "#D9534F",
        "grey" => "#8A8F98",
        "yellow" if !line => "#F2C94C",
        "white" if !line => "#FFFFFF",
        "black" if line => "#1F2328",
        "none" => "auto",
        _ => return None,
    })
}
const CHART_TYPES: &[&str] = &["column", "bar", "line", "pie", "doughnut", "area", "scatter", "radar", "histogram", "waterfall", "funnel", "treemap"];
const CHART_SUBTYPES: &[&str] = &["clustered", "stacked", "stacked100", "markers", "lines"];
const SPARKLINE_TYPES: &[&str] = &["line", "column", "winLoss"];
const LEGENDS: &[&str] = &["none", "bottom", "top", "left", "right"];
const PROTECT_ALLOW: &[&str] = &["formatCells", "formatColumns", "formatRows", "insertColumns", "insertRows", "deleteColumns", "deleteRows", "sort", "autofilter"];
/// Paper names the page setup offers (the engine knows more).
const PAPERS: &[&str] = &["Letter", "Legal", "A4", "A3", "A5", "Tabloid", "Executive"];
/// Keys `page_setup` accepts; anything else is refused.
const PAGE_KEYS: &[&str] = &["orientation", "paper", "margins", "scale", "fitWidth", "fitHeight", "centerH", "centerV", "gridlines", "headings", "header", "footer", "printArea", "titleRows", "titleCols"];
const MAX_PIVOT_FIELDS: usize = 200;
/// Summary functions the pivot builder offers.
const PIVOT_FUNCS: &[&str] = &["sum", "count", "average", "max", "min"];
const MAX_NAME_CHARS: usize = 64;
const MAX_AFFIX_CHARS: usize = 12;
const MAX_LINK_BYTES: usize = 2048;
const MAX_NOTES_LISTED: usize = 200;
const SPLIT_DELIMITERS: [char; 5] = [',', ';', '\t', ' ', '|'];
const MAX_REPLACE_CELLS: usize = 10_000;
const MAX_VALIDATION_ITEMS: usize = 500;
const MAX_VALIDATION_ITEMS_SET: usize = 100;
const CF_OPERATORS: [&str; 8] = ["greater", "less", "equal", "notEqual", "greaterOrEqual", "lessOrEqual", "between", "notBetween"];
/// Literal find and replace in one text. `whole` needs the whole text to match; otherwise every occurrence is replaced.
/// Case-insensitive matching compares char by char, so it never depends on byte lengths. `None` = no match.
fn replace_text(text: &str, what: &str, with: &str, match_case: bool, whole: bool) -> Option<String> {
    let same = |a: char, b: char| a == b || (!match_case && a.to_lowercase().eq(b.to_lowercase()));
    let n = what.chars().count();
    if n == 0 {
        return None;
    }
    let at = |from: usize| -> bool { text[from..].chars().take(n).count() == n && text[from..].chars().zip(what.chars()).all(|(a, b)| same(a, b)) };
    if whole {
        return (text.chars().count() == n && at(0)).then(|| with.to_string());
    }
    let mut out = String::new();
    let mut hit = false;
    let mut skip = 0;
    for (i, c) in text.char_indices() {
        if skip > 0 {
            skip -= 1;
            continue;
        }
        if at(i) {
            out.push_str(with);
            hit = true;
            skip = n - 1;
        } else {
            out.push(c);
        }
    }
    hit.then_some(out)
}
/// `B7` -> `$B$7`, so a list source does not shift from cell to cell.
fn absolute_a1(a1: &str) -> String {
    let split = a1.find(|c: char| c.is_ascii_digit()).unwrap_or(a1.len());
    format!("${}${}", &a1[..split], &a1[split..])
}
/// A comparison value: a finite number or a short single-line text. Anything else is refused.
fn cf_value(v: Option<&serde_json::Value>) -> Option<serde_json::Value> {
    match v? {
        serde_json::Value::Number(n) if n.as_f64().is_some_and(f64::is_finite) => Some(serde_json::Value::Number(n.clone())),
        serde_json::Value::String(t) if !t.is_empty() && t.chars().count() <= MAX_FILTER_VALUE && !t.chars().any(char::is_control) => Some(serde_json::Value::String(t.clone())),
        _ => None,
    }
}
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
        "numFmtCustom" => ("home.numberFormat", json!({"code": custom_number_code(op)?})),
        "dateFmt" => {
            let id = op.get("pattern").and_then(|v| v.as_str()).ok_or("missing date pattern")?;
            let code = DATE_PATTERNS.iter().find(|(k, _)| *k == id).map(|(_, c)| *c).ok_or("unsupported date pattern")?;
            ("home.numberFormat", json!({"code": code}))
        }
        _ => return Err("unsupported format operation".into()),
    })
}

/// Date and time patterns the editor offers; ids are what the UI sends, codes are what the engine gets.
const DATE_PATTERNS: &[(&str, &str)] = &[
    ("ymd", "yyyy-mm-dd"),
    ("dmyDot", "dd.mm.yyyy"),
    ("mdy", "mm/dd/yyyy"),
    ("dmy", "dd/mm/yyyy"),
    ("long", "d mmmm yyyy"),
    ("weekday", "dddd, d mmmm yyyy"),
    ("short", "d mmm yy"),
    ("monthYear", "mmm yyyy"),
    ("time24", "hh:mm"),
    ("time12", "h:mm AM/PM"),
    ("dateTime", "yyyy-mm-dd hh:mm"),
];

/// Builds a custom number code from structured fields (never from free text): digits, grouping, decimals, percent, a quoted
/// prefix and suffix, and how negatives and zero look. Prefix and suffix cannot hold quotes, backslashes, semicolons,
/// brackets or asterisks, so nothing can open a new section, a color or a repeat fill.
fn custom_number_code(op: &serde_json::Value) -> Result<String, String> {
    let decimals = match op.get("decimals") {
        None => 2,
        Some(v) => v.as_u64().filter(|d| *d <= 10).ok_or("decimals must be a whole number from 0 to 10")? as usize,
    };
    let flag = |key: &str| -> Result<bool, String> {
        match op.get(key) {
            None => Ok(false),
            Some(v) => v.as_bool().ok_or_else(|| format!("{key} must be true or false")),
        }
    };
    let grouping = flag("grouping")?;
    let percent = flag("percent")?;
    let affix = |key: &str| -> Result<String, String> {
        let t = match op.get(key) {
            None => "",
            Some(v) => v.as_str().ok_or_else(|| format!("{key} must be text"))?,
        };
        if t.chars().count() > MAX_AFFIX_CHARS || t.chars().any(|c| c.is_control() || matches!(c, '"' | '\\' | ';' | '[' | ']' | '*')) {
            return Err("prefix and suffix are at most 12 characters without quotes, backslashes, semicolons, brackets or asterisks".into());
        }
        Ok(if t.is_empty() { String::new() } else { format!("\"{t}\"") })
    };
    let (prefix, suffix) = (affix("prefix")?, affix("suffix")?);
    let dec = if decimals == 0 { String::new() } else { format!(".{}", "0".repeat(decimals)) };
    let body = format!("{prefix}{}{dec}{}{suffix}", if grouping { "#,##0" } else { "0" }, if percent { "%" } else { "" });
    let negative = match op.get("negative").and_then(|v| v.as_str()).unwrap_or("minus") {
        "minus" => format!("-{body}"),
        "red" => format!("[Red]-{body}"),
        "paren" => format!("({body})"),
        "redParen" => format!("[Red]({body})"),
        _ => return Err("unsupported negative style".into()),
    };
    let zero_dash = match op.get("zero").and_then(|v| v.as_str()).unwrap_or("show") {
        "show" => false,
        "dash" => true,
        _ => return Err("unsupported zero style".into()),
    };
    Ok(if zero_dash {
        format!("{body};{negative};\"-\"")
    } else if negative == format!("-{body}") {
        body
    } else {
        format!("{body};{negative}")
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
            json!({"index":index,"name":s.name,"visibility":format!("{:?}",s.visibility),"tabColor":s.tab_color.and_then(|c| c.hex(&doc.wb.theme))}))
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

    /// The cells of a block read back row by row as `{"address","value","formula"}` (the same shape `cell_readback` gives one cell).
    fn range_readback(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<Vec<serde_json::Value>, String> {
        let mut out = Vec::with_capacity((rows * cols) as usize);
        for r in row..row + rows {
            for c in col..col + cols {
                out.push(self.cell_readback(sheet, r, c)?);
            }
        }
        Ok(out)
    }

    #[cfg(test)]
    fn range_readback_json(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> String {
        serde_json::Value::Array(self.range_readback(sheet, row, col, rows, cols).unwrap()).to_string()
    }

    /// Writes a reviewed RANGE atomically as ONE history entry, like `set_cell_reviewed` does for a cell. `expected_old_json` is the exact old
    /// block as a row-major array of `{"address","value","formula"}` (what `range` returns, with addresses), `inputs_json` a row-major array of
    /// strings, one per cell (at most 1,000 cells, 1,000,000 bytes of text each way). The owner state token and EVERY old cell are checked in the
    /// same call that commits, so a change between review and apply fails with a `stale` error and no mutation. All inputs and data-validation
    /// Stop rules are checked BEFORE the first write; if the engine still fails midway, the workbook, selection, redo stack and revision are
    /// restored exactly. Protected sheets refused. Returns a receipt `{"sheet","row","col","rows","cols","beforeRevision","afterRevision",
    /// "applied","undoable","token","readback":[cells]}`; `applied` is 0 for a true no-op (nothing changes, not even the redo stack).
    pub fn set_range_reviewed(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, expected_token: &str, expected_old_json: &str, inputs_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_REVIEWED_RANGE_CELLS {
            return Err("invalid range (1 to 1,000 cells)".into());
        }
        if expected_old_json.len() > MAX_REVIEWED_RANGE_BYTES * 4 || inputs_json.len() > MAX_REVIEWED_RANGE_BYTES * 2 {
            return Err("range text too large".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let inputs: Vec<String> = match serde_json::from_str::<serde_json::Value>(inputs_json) {
            Ok(serde_json::Value::Array(list)) => list.iter().map(|v| v.as_str().map(str::to_string).ok_or("every input must be text")).collect::<Result<_, _>>()?,
            _ => return Err("inputs must be a list of text".into()),
        };
        let count = (rows * cols) as usize;
        if inputs.len() != count {
            return Err("one input per cell is required".into());
        }
        if inputs.iter().any(|t| t.len() > 32_767) {
            return Err("input exceeds 32,767 UTF-8 bytes".into());
        }
        if inputs.iter().map(String::len).sum::<usize>() > MAX_REVIEWED_RANGE_BYTES {
            return Err("range text too large".into());
        }
        if self.state_token()? != expected_token {
            return Err("stale: the workbook changed since this edit was reviewed".into());
        }
        let expected_old: serde_json::Value = serde_json::from_str(expected_old_json).map_err(|_| "expected range must be a JSON list".to_string())?;
        let old_now = self.range_readback(sheet, row, col, rows, cols)?;
        if expected_old.as_array().is_none_or(|a| a.len() != count) || expected_old.as_array() != Some(&old_now) {
            return Err("stale: the range changed since this edit was reviewed".into());
        }
        let cells: Vec<CellRef> = (row..row + rows).flat_map(|r| (col..col + cols).map(move |c| CellRef::new(r, c))).collect();
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            for (at, new) in cells.iter().zip(&inputs) {
                if !new.starts_with('=')
                    && let Some((dv, msg)) = gridcraft_engine::cmd::data::check_validation(&doc.wb, sheet, *at, new)
                    && dv.error_style == gridcraft_engine::model::ErrorStyle::Stop
                {
                    return Err(format!("{}: {msg}", at.a1()));
                }
            }
        }
        let (before_rev, before_len, snap_wb, snap_sel, snap_redo) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            (doc.revision, doc.undo.len(), doc.wb.clone(), doc.selection.clone(), doc.redo.clone())
        };
        let mut failure: Option<String> = None;
        for (at, new) in cells.iter().zip(&inputs) {
            if let Err(e) = self.session.run("cell.set", json!({"sheet": sheet, "cell": at.a1(), "input": new})) {
                failure = Some(e.to_string());
                break;
            }
        }
        let readback = if failure.is_none() { Some(self.range_readback(sheet, row, col, rows, cols)?) } else { None };
        let unchanged = readback.as_ref().is_some_and(|r| *r == old_now);
        if failure.is_some() || unchanged {
            // Restore exactly: failed midway, or every write left the block as it was (a true no-op).
            let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
            doc.undo.truncate(before_len);
            doc.wb = snap_wb;
            doc.selection = snap_sel;
            doc.revision = before_rev;
            doc.redo = snap_redo;
            let wb = doc.wb.clone();
            doc.calc.rebuild(&wb);
            if let Some(e) = failure {
                return Err(e);
            }
        } else {
            // Every cell was its own snapshot; the first restores the state before the whole write, so keep only that as one step.
            let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
            doc.undo.truncate(before_len + 1);
            doc.revision = before_rev + 1;
        }
        let applied = u32::from(!unchanged);
        let after = self.session.doc().map_err(|e| e.to_string())?.revision;
        Ok(json!({"sheet": sheet, "row": row, "col": col, "rows": rows, "cols": cols, "beforeRevision": before_rev, "afterRevision": after,
            "applied": applied, "undoable": applied == 1, "token": self.state_token()?, "readback": readback.unwrap_or_default()}).to_string())
    }

    /// Undoes exactly the reviewed range edit: refused (`stale`) unless the owner state is still the state its receipt returned, then one undo and
    /// a receipt with the block read back and `applied` 1 only when the workbook snapshot really changed.
    pub fn undo_range_reviewed(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, expected_token: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_REVIEWED_RANGE_CELLS {
            return Err("invalid range (1 to 1,000 cells)".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        if self.state_token()? != expected_token {
            return Err("stale: newer changes exist, so this edit can no longer be undone on its own".into());
        }
        let ptr = |b: &Self| -> Result<usize, String> { Ok(std::sync::Arc::as_ptr(&b.session.doc().map_err(|e| e.to_string())?.wb) as usize) };
        let (before_ptr, before_rev) = (ptr(self)?, self.session.doc().map_err(|e| e.to_string())?.revision);
        self.session.run("edit.undo", json!({}))?;
        let applied = u32::from(ptr(self)? != before_ptr);
        let readback = self.range_readback(sheet, row, col, rows, cols)?;
        Ok(json!({"sheet": sheet, "row": row, "col": col, "rows": rows, "cols": cols, "beforeRevision": before_rev, "afterRevision": self.session.doc().map_err(|e| e.to_string())?.revision,
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
        // Typed values must pass a "stop" validation (formulas are not validated, like Excel); warnings and notes let the value in.
        if !input.starts_with('=')
            && let Some(at) = CellRef::parse(address)
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if let Some((dv, msg)) = gridcraft_engine::cmd::data::check_validation(&doc.wb, sheet, at, input)
                && dv.error_style == gridcraft_engine::model::ErrorStyle::Stop
            {
                return Err(msg);
            }
        }
        self.session.run("cell.set", json!({"sheet":sheet,"cell":address,"input":input})).map(|v| v.to_string())
    }

    /// The choices of a list validation on one cell, as `{"items":[..]}` (at most 500), or `{"items":null}` when the cell has none.
    pub fn validation_items(&self, sheet: usize, row: u32, col: u32) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let at = CellRef::new(row, col);
        let found = sh.validations.iter().find(|d| d.ranges.iter().any(|r| r.contains(at)));
        let Some(dv) = found.filter(|d| d.kind == gridcraft_engine::model::ValidationKind::List && d.in_cell_dropdown) else {
            return Ok(json!({"items": null}).to_string());
        };
        let items: Vec<String> = gridcraft_engine::cmd::data::list_items(&doc.wb, sheet, dv).into_iter().take(MAX_VALIDATION_ITEMS).collect();
        Ok(json!({"items": items}).to_string())
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
        let mut cf_cache = if sh.cond_formats.is_empty() { None } else { Some(gridcraft_engine::cf::CfCache::new()) };
        let mut cells = Vec::new();
        for r in row..row + rows {
            for c in col..col + cols {
                let at = CellRef::new(r, c);
                let (mut cf_bar, mut cf_icon) = (None, None);
                let value = sh.value(at);
                let formula = sh.cell(at).and_then(|v| v.formula.as_ref()).map(|f| f.text.clone());
                let base = wb.styles.get(sh.style_id(at));
                let fmt = NumberFormat::parse(base.num_fmt.as_str());
                let shown = format_value(&value, &fmt, wb.date_system);
                // "Show zeros" off blanks numeric zeros in the display only; the value and its formula are untouched.
                let shown = if !sh.show_zeros && value.as_f64() == Some(0.0) { Default::default() } else { shown };
                let mut style_json_value = style_json(base, &wb.theme);
                if let Some(cf) = cf_cache.as_mut()
                    && let Some(look) = cf.look(wb, sheet, at)
                {
                    let mut st = base.clone();
                    if let Some(d) = &look.style {
                        if d.fill.pattern != gridcraft_engine::model::style::PatternType::None {
                            st.fill = d.fill;
                        }
                        if d.font.color != Color::Auto {
                            st.font.color = d.font.color;
                        }
                        st.font.bold |= d.font.bold;
                        st.font.italic |= d.font.italic;
                        st.font.strike |= d.font.strike;
                        if d.font.underline != Underline::None {
                            st.font.underline = d.font.underline;
                        }
                    }
                    style_json_value = style_json(&st, &wb.theme);
                    if let Some(rgb) = look.scale_fill {
                        style_json_value["fill"] = json!(format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]));
                    }
                    cf_bar = look.bar.map(|(frac, rgb, gradient)| json!([frac, format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]), gradient]));
                    cf_icon = look.icon.map(|(set, idx)| json!([set, idx]));
                }
                cells.push(json!({
                    "address": at.a1(), "value": value, "formula": formula,
                    "text": shown.text, "numeric": shown.numeric,
                    "fmtColor": shown.color.map(format_color),
                    "style": style_json_value, "cfBar": cf_bar, "cfIcon": cf_icon,
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
            "cols":cols,"rows":rows,"showGridlines":sh.show_gridlines,"showHeadings":sh.show_headings,"showZeros":sh.show_zeros,"zoom":sh.zoom,"protection":sh.protection.as_ref().map(|p| json!({"password": p.password_hash.is_some(), "allow": Self::allowed_names(p)})),"workbookLocked":doc.wb.protected_structure,
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
    /// `{"kind":"rename","name":..}`, `{"kind":"duplicate"}`, `{"kind":"move","to":index}`, `{"kind":"delete"}`,
    /// `{"kind":"hide"}` (the last visible sheet is refused), `{"kind":"unhide","index":n}` (a plainly hidden sheet) or `{"kind":"tabColor","color":"#RRGGBB"|"none"}`.
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
            "hide" => {
                if visible <= 1 {
                    return Err("A workbook must contain at least one visible sheet.".into());
                }
                self.session.run("sheet.hide", json!({"sheet": sheet}))?;
            }
            "unhide" => {
                let index = op.get("index").and_then(|v| v.as_u64()).filter(|i| (*i as usize) < count).ok_or("pick a hidden sheet")? as usize;
                let hidden = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(index).is_some_and(|s| s.visibility == Visibility::Hidden);
                if !hidden {
                    return Err("That sheet is not hidden.".into());
                }
                self.session.run("sheet.unhide", json!({"sheet": index}))?;
            }
            "tabColor" => {
                let color = op.get("color").and_then(|v| v.as_str()).ok_or("missing tab color")?;
                let valid = color == "none" || (color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit()));
                if !valid {
                    return Err("The tab color must be #RRGGBB or none.".into());
                }
                self.session.run("sheet.tabColor", json!({"sheet": sheet, "color": color}))?;
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

    /// True when any cell of the block holds a formula (the engine moves cells without rewriting their references).
    fn block_has_formula(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<bool, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let block = gridcraft_engine::core::RangeRef::new(CellRef::new(row, col), CellRef::new(row + rows - 1, col + cols - 1));
        Ok(sh.cells.iter_range(block).any(|(_, c)| c.formula.is_some()))
    }

    /// `Sheet!$A$1:$C$9` for a block, quoted the way formulas need it.
    fn block_source(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let abs = |r: u32, c: u32| format!("${}${}", gridcraft_engine::core::col_to_letters(c), r + 1);
        Ok(format!("{}!{}:{}", gridcraft_engine::formula::quote_sheet(&sh.name), abs(row, col), abs(row + rows - 1, col + cols - 1)))
    }

    /// The column names (first row) of a block and whether each column is all numbers (read only):
    /// `{"fields":[{"name":..,"numeric":b}]}`, at most 200. Needs at least two rows.
    pub fn pivot_fields(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        if rows < 2 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_SORT_CELLS {
            return Err("Select a header row and at least one data row (at most 1,000,000 cells).".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        let source = self.block_source(sheet, row, col, rows, cols)?;
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let src = gridcraft_engine::pivot::read_source(&doc.wb, &source, sheet)?;
        let fields: Vec<serde_json::Value> = src
            .headers
            .iter()
            .enumerate()
            .take(MAX_PIVOT_FIELDS)
            .map(|(i, h)| json!({"name": h, "numeric": src.numeric.get(i).copied().unwrap_or(false)}))
            .collect();
        Ok(json!({"fields": fields}).to_string())
    }

    /// Builds a small PivotTable on a NEW sheet placed before `sheet`, as ONE history entry. `op_json` is
    /// `{"rows":field,"columns"?:field,"values":field,"func":"sum"|"count"|"average"|"max"|"min"}` with fields named in the block's
    /// first row. Sum, average, max and min need a numeric field. Refused: protected workbook structure, unknown or repeated
    /// fields. Returns `{"sheet":index of the report sheet}`.
    pub fn pivot_create(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        let fields: serde_json::Value = serde_json::from_str(&self.pivot_fields(sheet, row, col, rows, cols)?).map_err(|e| e.to_string())?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let known = |name: &str| -> Option<bool> {
            fields["fields"].as_array()?.iter().find(|f| f["name"].as_str() == Some(name)).map(|f| f["numeric"].as_bool().unwrap_or(false))
        };
        let pick = |key: &str, required: bool| -> Result<Option<String>, String> {
            match op.get(key).and_then(|v| v.as_str()) {
                None if required => Err(format!("{key} needs a field")),
                None => Ok(None),
                Some(n) => known(n).map(|_| Some(n.to_string())).ok_or_else(|| format!("{n} is not a column name in the first row")),
            }
        };
        let row_field = pick("rows", true)?.unwrap_or_default();
        let column_field = pick("columns", false)?;
        let value_field = pick("values", true)?.unwrap_or_default();
        if column_field.as_deref() == Some(row_field.as_str()) {
            return Err("Rows and columns need different fields.".into());
        }
        let func = op.get("func").and_then(|v| v.as_str()).unwrap_or("sum");
        if !PIVOT_FUNCS.contains(&func) {
            return Err("unsupported summary function".into());
        }
        if func != "count" && known(&value_field) != Some(true) {
            return Err("Sum, average, max and min need a field that holds only numbers.".into());
        }
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if doc.wb.protected_structure {
                return Err("The workbook structure is protected.".into());
            }
        }
        let source = self.block_source(sheet, row, col, rows, cols)?;
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        let mut params = json!({"source": source, "destination": "new", "rows": [row_field], "values": [{"field": value_field, "func": func}]});
        if let Some(c) = column_field {
            params["columns"] = json!([c]);
        }
        let made = self.session.run("insert.pivotTable", params).map_err(|e| e.to_string())?;
        let report = made.get("sheet").and_then(|v| v.as_str()).and_then(|n| self.session.doc().ok().and_then(|d| d.wb.sheet_index(n))).ok_or("the report sheet was not found")?;
        Ok(json!({"sheet": report}).to_string())
    }

    /// Refreshes every PivotTable from its source as ONE history entry (nothing outside the reports is overwritten).
    /// Returns `{"refreshed":n,"errors":[..]}`.
    pub fn pivot_refresh(&mut self) -> Result<String, String> {
        self.session.run("data.refreshAll", json!({})).map(|v| v.to_string()).map_err(|e| e.to_string())
    }

    /// Lists the tables of a sheet and the style names that can be chosen (read only):
    /// `{"tables":[{"name":..,"range":..,"header":b,"totals":b,"banded":b,"style":..}],"styles":[..]}`.
    pub fn tables_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let tables: Vec<serde_json::Value> = sh
            .tables
            .iter()
            .take(MAX_TABLES)
            .map(|t| json!({"name": t.name, "range": t.range.a1(), "header": t.header_row, "totals": t.totals_row, "banded": t.banded_rows, "style": t.style}))
            .collect();
        Ok(json!({"tables": tables, "styles": gridcraft_engine::tables::gallery()}).to_string())
    }

    fn table_name_problem(name: &str) -> Option<&'static str> {
        let count = name.chars().count();
        if count == 0 || count > MAX_NAME_CHARS {
            return Some("A table name has 1 to 64 characters.");
        }
        let mut chars = name.chars();
        if !chars.next().is_some_and(|c| c.is_alphabetic() || c == '_') || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.') {
            return Some("A table name starts with a letter or underscore and has only letters, digits, dots and underscores.");
        }
        if CellRef::parse(name).is_some() {
            return Some("This name looks like a cell address.");
        }
        None
    }

    /// Creates a table from the block, or changes one of this sheet's tables, as ONE history entry. `op_json` is
    /// `{"kind":"create","name"?:..,"style"?:..}` (the first row must hold text column names, so nothing moves),
    /// `{"kind":"totals","table":..,"on":b}` (refused when the row below the table is not empty), `{"kind":"banded","table":..,"on":b}`,
    /// `{"kind":"style","table":..,"style":..}`, `{"kind":"rename","table":..,"newName":..}` or `{"kind":"convert","table":..}`
    /// (keeps the look as plain formatting). Protected sheets refused; styles come from the engine's gallery.
    pub fn table_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let styles = gridcraft_engine::tables::gallery();
        let style_of = |op: &serde_json::Value| -> Result<Option<String>, String> {
            match op.get("style") {
                None => Ok(None),
                Some(v) => v.as_str().filter(|n| styles.iter().any(|s| s == n)).map(|n| Some(n.to_string())).ok_or_else(|| "unsupported table style".to_string()),
            }
        };
        if kind == "create" {
            if rows < 2 {
                return Err("A table needs a header row and at least one data row.".into());
            }
            {
                let doc = self.session.doc().map_err(|e| e.to_string())?;
                let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
                if sh.tables.len() >= MAX_TABLES {
                    return Err("A sheet holds at most 200 tables.".into());
                }
                for c in col..col + cols {
                    let v = sh.value(CellRef::new(row, c));
                    if !v.is_text() || v.display().trim().is_empty() {
                        return Err("The first row must hold text column names.".into());
                    }
                }
            }
            let mut params = json!({"sheet": sheet, "range": format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1()), "header": true});
            if let Some(n) = op.get("name") {
                let n = n.as_str().ok_or("name must be text")?;
                if let Some(why) = Self::table_name_problem(n) {
                    return Err(why.into());
                }
                params["name"] = json!(n);
            }
            if let Some(st) = style_of(&op)? {
                params["style"] = json!(st);
            }
            return self.session.run("insert.table", params).map(|v| v.to_string()).map_err(|e| e.to_string());
        }
        let table = op.get("table").and_then(|v| v.as_str()).ok_or("missing table name")?.to_string();
        let (totals_now, below_empty) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            let Some(t) = sh.tables.iter().find(|t| t.name.eq_ignore_ascii_case(&table)) else {
                return Err("There is no such table on this sheet.".into());
            };
            let below = gridcraft_engine::core::RangeRef::new(CellRef::new(t.range.end.row + 1, t.range.start.col), CellRef::new(t.range.end.row + 1, t.range.end.col));
            let empty = t.range.end.row + 1 >= gridcraft_engine::core::MAX_ROWS || !sh.cells.iter_range(below).any(|(_, c)| !c.value.is_empty() || c.formula.is_some());
            (t.totals_row, empty)
        };
        let flag = |op: &serde_json::Value| op.get("on").and_then(|v| v.as_bool()).ok_or_else(|| "on must be true or false".to_string());
        let (command, params) = match kind {
            "totals" => {
                let on = flag(&op)?;
                if on && !totals_now && !below_empty {
                    return Err("The row below the table is not empty. Clear it before adding a total row.".into());
                }
                ("table.totalRow", json!({"table": table, "on": on}))
            }
            "banded" => ("table.bandedRows", json!({"table": table, "on": flag(&op)?})),
            "style" => {
                let st = style_of(&op)?.ok_or("missing table style")?;
                ("table.style", json!({"table": table, "style": st}))
            }
            "rename" => {
                let new_name = op.get("newName").and_then(|v| v.as_str()).ok_or("missing new name")?;
                if let Some(why) = Self::table_name_problem(new_name) {
                    return Err(why.into());
                }
                ("table.rename", json!({"table": table, "name": new_name}))
            }
            "convert" => ("table.convertToRange", json!({"table": table})),
            _ => return Err("unsupported table operation".into()),
        };
        self.session.run(command, params).map(|v| v.to_string()).map_err(|e| e.to_string())
    }

    /// The protection permissions that are switched on, by their command names.
    fn allowed_names(p: &gridcraft_engine::model::SheetProtection) -> Vec<&'static str> {
        [("formatCells", p.format_cells), ("formatColumns", p.format_columns), ("formatRows", p.format_rows), ("insertColumns", p.insert_columns),
         ("insertRows", p.insert_rows), ("deleteColumns", p.delete_columns), ("deleteRows", p.delete_rows), ("sort", p.sort), ("autofilter", p.autofilter)]
            .into_iter().filter(|(_, on)| *on).map(|(n, _)| n).collect()
    }

    /// Locks or protects. `op_json` is one of `{"kind":"protect","password"?:text,"allow"?:[names]}` (the sheet must not be protected yet;
    /// the password is at most 64 characters without control characters and is only stored as a hash; `allow` names are
    /// formatCells, formatColumns, formatRows, insertColumns, insertRows, deleteColumns, deleteRows, sort, autofilter),
    /// `{"kind":"unprotect","password"?:text}`, `{"kind":"lock","locked":bool}` for the block (`row`, `col`, `rows`, `cols`; unprotected
    /// sheets only) or `{"kind":"workbook","on":bool}` (structure lock). One history entry each. Protection is a convenience, not security.
    pub fn protect_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("missing kind")?.to_string();
        let allowed_keys: &[&str] = match kind.as_str() {
            "protect" => &["kind", "password", "allow"],
            "unprotect" => &["kind", "password"],
            "lock" => &["kind", "locked"],
            "workbook" => &["kind", "on"],
            _ => return Err("unsupported protection operation".into()),
        };
        if map.keys().any(|k| !allowed_keys.contains(&k.as_str())) {
            return Err("unknown protection field".into());
        }
        let password = match map.get("password") {
            None => None,
            Some(v) => {
                let t = v.as_str().filter(|t| t.chars().count() <= MAX_PASSWORD_CHARS && !t.chars().any(|c| c.is_control())).ok_or("The password is too long or has control characters.")?;
                Some(t.to_string())
            }
        };
        let protected = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?.is_protected();
        match kind.as_str() {
            "protect" => {
                if protected {
                    return Err("The sheet is already protected.".into());
                }
                let mut params = serde_json::Map::new();
                params.insert("sheet".into(), json!(sheet));
                if let Some(pw) = password.filter(|t| !t.is_empty()) {
                    params.insert("password".into(), json!(pw));
                }
                if let Some(a) = map.get("allow") {
                    let list = a.as_array().ok_or("allow must be a list")?;
                    if list.len() > PROTECT_ALLOW.len() {
                        return Err("too many permissions".into());
                    }
                    for n in list {
                        let name = n.as_str().filter(|n| PROTECT_ALLOW.contains(n)).ok_or("unknown permission")?;
                        params.insert(name.into(), json!(true));
                    }
                }
                self.session.run("review.protectSheet", serde_json::Value::Object(params)).map_err(|e| e.to_string())?;
            }
            "unprotect" => {
                if !protected {
                    return Err("The sheet is not protected.".into());
                }
                let mut params = json!({"sheet": sheet});
                if let Some(pw) = password {
                    params["password"] = json!(pw);
                }
                self.session.run("review.unprotectSheet", params).map_err(|e| e.to_string())?;
            }
            "lock" => {
                let locked = map.get("locked").and_then(|v| v.as_bool()).ok_or("locked must be true or false")?;
                self.check_block(sheet, row, col, rows.max(1), cols.max(1), true)?;
                if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
                    return Err("Select a block of at most 1,000,000 cells.".into());
                }
                self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
                let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
                self.session.run("home.lockCell", json!({"range": range, "on": locked})).map_err(|e| e.to_string())?;
            }
            _ => {
                let on = map.get("on").and_then(|v| v.as_bool()).ok_or("on must be true or false")?;
                self.session.run("review.protectWorkbook", json!({"on": on})).map_err(|e| e.to_string())?;
            }
        }
        self.layout(sheet)
    }

    /// What-if analysis on one sheet (one history entry each). `op_json` is `{"kind":"goalSeek","set":"B5","to":number,"changing":"B2"}`
    /// (a formula cell is steered by changing one constant cell), `{"kind":"scenarioAdd","name","changing":"B2:B4","values"?:[..],"comment"?,"replace"?}`
    /// (at most 32 cells; values default to the current ones), `{"kind":"scenarioShow","name"}`, `{"kind":"scenarioDelete","name"}`,
    /// `{"kind":"scenarioSummary","resultCells"?:"B10:B12"}` (adds a summary sheet) or `{"kind":"dataTable","range":"D2:F10","rowInput"?,"columnInput"?}`
    /// (static values, at most 100,000 cells). References are plain A1 text on this sheet (no sheet names). Goal seek, showing a scenario and data
    /// tables write cells, so protected sheets are refused; the summary needs an unlocked workbook structure. Returns the engine's result object.
    pub fn whatif_op(&mut self, sheet: usize, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("missing kind")?.to_string();
        let allowed: &[&str] = match kind.as_str() {
            "goalSeek" => &["kind", "set", "to", "changing"],
            "scenarioAdd" => &["kind", "name", "changing", "values", "comment", "replace"],
            "scenarioShow" | "scenarioDelete" => &["kind", "name"],
            "scenarioSummary" => &["kind", "resultCells"],
            "dataTable" => &["kind", "range", "rowInput", "columnInput"],
            _ => return Err("unsupported what-if operation".into()),
        };
        if map.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err("unknown what-if field".into());
        }
        let refs = |key: &str, required: bool| -> Result<Option<String>, String> {
            match map.get(key) {
                None if !required => Ok(None),
                None => Err(format!("missing {key}")),
                Some(v) => {
                    let t = v.as_str().map(str::trim).filter(|t| !t.is_empty() && t.chars().count() <= MAX_WHATIF_REFS && t.chars().all(|c| c.is_ascii_alphanumeric() || c == ':' || c == ',' || c == '$')).ok_or_else(|| format!("{key} must be cell references on this sheet"))?;
                    Ok(Some(t.to_uppercase()))
                }
            }
        };
        let single = |t: &str| -> bool { CellRef::parse(t).is_some() };
        let name_ok = |v: &serde_json::Value| v.as_str().map(str::trim).filter(|t| !t.is_empty() && t.chars().count() <= MAX_WHATIF_NAME && !t.chars().any(|c| c.is_control())).map(str::to_string);
        let (protected, locked) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            (doc.wb.sheet(sheet).ok_or("unknown sheet")?.is_protected(), doc.wb.protected_structure)
        };
        let writes = matches!(kind.as_str(), "goalSeek" | "scenarioShow" | "dataTable" | "scenarioSummary");
        if writes && protected {
            return Err("The sheet is protected. Unprotect it to change cells.".into());
        }
        let (id, params) = match kind.as_str() {
            "goalSeek" => {
                let set = refs("set", true)?.filter(|t| single(t)).ok_or("set must be one cell")?;
                let changing = refs("changing", true)?.filter(|t| single(t)).ok_or("changing must be one cell")?;
                let to = map.get("to").and_then(|v| v.as_f64()).filter(|v| v.is_finite()).ok_or("to must be a number")?;
                ("data.goalSeek", json!({"set": set, "to": to, "changing": changing}))
            }
            "scenarioAdd" => {
                let name = name_ok(map.get("name").ok_or("missing name")?).ok_or("The scenario name must be 1 to 255 characters without control characters.")?;
                let changing = refs("changing", true)?.ok_or("missing changing")?;
                let mut params = json!({"name": name, "changing": changing});
                if let Some(v) = map.get("values") {
                    let list = v.as_array().filter(|a| a.len() <= MAX_WHATIF_VALUES).ok_or("values must be a short list")?;
                    for item in list {
                        let ok = match item {
                            serde_json::Value::Number(n) => n.as_f64().is_some_and(f64::is_finite),
                            serde_json::Value::Bool(_) | serde_json::Value::Null => true,
                            serde_json::Value::String(t) => t.chars().count() <= 255 && !t.chars().any(|c| c.is_control()),
                            _ => false,
                        };
                        if !ok {
                            return Err("Scenario values must be numbers, text, true or false.".into());
                        }
                    }
                    params["values"] = v.clone();
                }
                if let Some(c) = map.get("comment") {
                    params["comment"] = json!(c.as_str().filter(|t| t.chars().count() <= 255 && !t.chars().any(|ch| ch.is_control())).ok_or("The comment is too long or has control characters.")?);
                }
                if let Some(r) = map.get("replace") {
                    params["replace"] = json!(r.as_bool().ok_or("replace must be true or false")?);
                }
                ("data.scenarioAdd", params)
            }
            "scenarioShow" | "scenarioDelete" => {
                let name = name_ok(map.get("name").ok_or("missing name")?).ok_or("The scenario name must be 1 to 255 characters without control characters.")?;
                (if kind == "scenarioShow" { "data.scenarioShow" } else { "data.scenarioDelete" }, json!({"name": name}))
            }
            "scenarioSummary" => {
                if locked {
                    return Err("The workbook structure is protected. Unprotect it to add a sheet.".into());
                }
                let mut params = json!({});
                if let Some(t) = refs("resultCells", false)? {
                    params["resultCells"] = json!(t);
                }
                ("data.scenarioSummary", params)
            }
            _ => {
                let range = refs("range", true)?.ok_or("missing range")?;
                if !range.contains(':') || range.contains(',') {
                    return Err("range must be one block like D2:F10".into());
                }
                let mut params = json!({"range": range});
                for key in ["rowInput", "columnInput"] {
                    if let Some(t) = refs(key, false)? {
                        if !single(&t) {
                            return Err(format!("{key} must be one cell"));
                        }
                        params[key] = json!(t);
                    }
                }
                if params.get("rowInput").is_none() && params.get("columnInput").is_none() {
                    return Err("give a row input cell, a column input cell or both".into());
                }
                ("data.dataTable", params)
            }
        };
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        let out = self.session.run(id, params).map_err(|e| e.to_string())?;
        Ok(out.to_string())
    }

    /// The scenarios stored for a sheet (read only): `{"scenarios":[{"name","changing","values","comment"}]}`, at most 1000.
    pub fn scenarios_info(&mut self, sheet: usize) -> Result<String, String> {
        let name = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?.name.clone();
        let out = self.session.run("data.scenarioManager", json!({"sheet": name})).map_err(|e| e.to_string())?;
        Ok(out.to_string())
    }

    /// The pictures and shapes of a sheet (read only): `{"images":[{"id","row","col","dx","dy","width","height","mime","alt","bytes"}],
    /// "shapes":[{"id","kind","row","col","dx","dy","width","height","fill","line","text"}]}`, anchors in points, colors as `#RRGGBB` or null
    /// (no color), at most 200 of each.
    pub fn objects_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let hex = |rgb: Option<[u8; 3]>| rgb.map(|rgb| format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]));
        let images: Vec<_> = sh.images.iter().take(MAX_OBJECTS).map(|i| json!({
            "id": i.id, "row": i.anchor.cell.row, "col": i.anchor.cell.col, "dx": i.anchor.dx, "dy": i.anchor.dy,
            "width": i.anchor.width, "height": i.anchor.height, "mime": i.mime, "alt": i.alt, "bytes": i.data.len(),
        })).collect();
        let shapes: Vec<_> = sh.shapes.iter().take(MAX_OBJECTS).map(|x| json!({
            "id": x.id, "kind": format!("{:?}", x.kind), "row": x.anchor.cell.row, "col": x.anchor.cell.col, "dx": x.anchor.dx, "dy": x.anchor.dy,
            "width": x.anchor.width, "height": x.anchor.height, "fill": hex(x.fill.resolve(&doc.wb.theme)), "line": hex(x.line.resolve(&doc.wb.theme)), "text": x.text.chars().take(MAX_SHAPE_TEXT * 4).collect::<String>(),
        })).collect();
        Ok(json!({"images": images, "shapes": shapes}).to_string())
    }

    /// One picture's bytes as `{"mime","base64"}` (read only). Only PNG and JPEG are returned.
    pub fn image_data(&self, sheet: usize, id: u32) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let img = doc.wb.sheet(sheet).ok_or("unknown sheet")?.images.iter().find(|i| i.id == id).ok_or("no such picture")?;
        let mime = if img.data.starts_with(&[0x89, b'P', b'N', b'G']) {
            "image/png"
        } else if img.data.starts_with(&[0xFF, 0xD8]) {
            "image/jpeg"
        } else {
            return Err("This picture format cannot be shown.".into());
        };
        Ok(json!({"mime": mime, "base64": gridcraft_engine::io::base64_encode(&img.data)}).to_string())
    }

    /// Inserts a PNG or JPEG picture at the cell (`row`, `col`) as ONE history entry. At most 10 MB, 20,000 pixels per side, 100 pictures a sheet;
    /// `width` (16 to 2,000 points, optional) keeps the aspect ratio; `alt` at most 255 characters. Protected sheets refused. Returns `{"image":id}`.
    pub fn insert_picture(&mut self, sheet: usize, row: u32, col: u32, bytes: &[u8], alt: &str, width: f64) -> Result<String, String> {
        self.check_block(sheet, row, col, 1, 1, true)?;
        if bytes.is_empty() || bytes.len() > MAX_PICTURE_BYTES {
            return Err("A picture must be between 1 byte and 10 MB.".into());
        }
        if alt.chars().count() > 255 || alt.chars().any(|c| c.is_control()) {
            return Err("The description is too long or has control characters.".into());
        }
        let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            "image/png"
        } else if bytes.starts_with(&[0xFF, 0xD8]) {
            "image/jpeg"
        } else {
            return Err("Only PNG and JPEG pictures can be inserted.".into());
        };
        let (w, h) = gridcraft_engine::io::image_size(bytes).filter(|(w, h)| *w >= 1 && *h >= 1 && *w <= 20_000 && *h <= 20_000).ok_or("The picture size could not be read.")?;
        if self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?.images.len() >= MAX_PICTURES {
            return Err(format!("A sheet can hold at most {MAX_PICTURES} pictures."));
        }
        let mut params = json!({"base64": gridcraft_engine::io::base64_encode(bytes), "mime": mime, "at": CellRef::new(row, col).a1(), "alt": alt});
        if width != 0.0 {
            if !width.is_finite() || !(16.0..=2000.0).contains(&width) {
                return Err("The width must be 16 to 2,000 points.".into());
            }
            params["width"] = json!(width);
            params["height"] = json!((width * f64::from(h) / f64::from(w)).max(1.0));
        }
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        self.session.run("insert.picture", params).map_err(|e| e.to_string()).map(|v| v.to_string())
    }

    /// Shapes and object changes (one history entry each), `op_json` is `{"kind":"shape","shape":rectangle|roundedRectangle|ellipse|triangle|line|arrow|textBox,
    /// "fill"?:preset,"line"?:preset,"width"?,"height"?,"text"?}` (placed at the cell `row`,`col`; 8 to 4,000 points; text at most 200 characters, text boxes only;
    /// at most 200 shapes), `{"kind":"move","object":"image"|"shape","id","width"?,"height"?,"here"?:true}` (`here` moves it to the cell) or
    /// `{"kind":"delete","object":"image"|"shape","id"}`. Fill presets blue, green, orange, red, grey, yellow, white, none; line presets blue, green, orange, red, grey, black, none.
    /// Also `{"kind":"place","object","id","row","col","dx","dy","width"?,"height"?}` (drop at a cell plus an offset in points, from a mouse drag),
    /// `{"kind":"order","object","id","to":"front"|"forward"|"backward"|"back"}` (stacking order among objects of that kind) and
    /// `{"kind":"turn","id"}` (a shape turned by 90 degrees: width and height swap). Protected sheets refused. Returns the engine's result object.
    pub fn object_op(&mut self, sheet: usize, row: u32, col: u32, op_json: &str) -> Result<String, String> {
        self.check_block(sheet, row, col, 1, 1, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("missing kind")?.to_string();
        let allowed: &[&str] = match kind.as_str() {
            "shape" => &["kind", "shape", "fill", "line", "width", "height", "text"],
            "move" => &["kind", "object", "id", "width", "height", "here"],
            "delete" => &["kind", "object", "id"],
            "place" => &["kind", "object", "id", "row", "col", "dx", "dy", "width", "height"],
            "order" => &["kind", "object", "id", "to"],
            "turn" => &["kind", "id"],
            _ => return Err("unsupported object operation".into()),
        };
        if map.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err("unknown object field".into());
        }
        let size = |key: &str| -> Result<Option<f64>, String> {
            match map.get(key) {
                None => Ok(None),
                Some(v) => v.as_f64().filter(|n| n.is_finite() && (0.0..=4000.0).contains(n)).map(Some).ok_or_else(|| format!("{key} must be 0 to 4,000 points")),
            }
        };
        let (id, params) = if kind == "shape" {
            let shape = map.get("shape").and_then(|v| v.as_str()).filter(|n| SHAPE_KINDS.contains(n)).ok_or("unsupported shape")?;
            let count = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?.shapes.len();
            if count >= MAX_OBJECTS {
                return Err(format!("A sheet can hold at most {MAX_OBJECTS} shapes."));
            }
            let mut params = json!({"kind": shape, "at": CellRef::new(row, col).a1()});
            for (key, line) in [("fill", false), ("line", true)] {
                if let Some(v) = map.get(key) {
                    let name = v.as_str().ok_or("unknown color")?;
                    let hex = shape_color(name, line).ok_or("unknown color")?;
                    params[key] = json!(hex);
                }
            }
            for key in ["width", "height"] {
                if let Some(n) = size(key)? {
                    let line_height = key == "height" && matches!(shape, "line" | "arrow") && n == 0.0;
                    if n < 8.0 && !line_height {
                        return Err(format!("{key} must be at least 8 points"));
                    }
                    params[key] = json!(n);
                }
            }
            if let Some(t) = map.get("text") {
                let t = t.as_str().filter(|t| t.chars().count() <= MAX_SHAPE_TEXT && !t.chars().any(|c| c.is_control() && c != '\n')).ok_or("The text is too long or has control characters.")?;
                if shape != "textBox" && !t.is_empty() {
                    return Err("Only text boxes hold text.".into());
                }
                params["text"] = json!(t);
            }
            ("insert.shape", params)
        } else {
            let object = if kind == "turn" { "shape" } else { map.get("object").and_then(|v| v.as_str()).filter(|o| *o == "image" || *o == "shape").ok_or("object must be image or shape")? };
            let oid = map.get("id").and_then(|v| v.as_u64()).filter(|n| *n <= u64::from(u32::MAX)).ok_or("missing object id")?;
            let exists = {
                let sh = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?;
                if object == "image" { sh.images.iter().any(|i| u64::from(i.id) == oid) } else { sh.shapes.iter().any(|i| u64::from(i.id) == oid) }
            };
            if !exists {
                return Err("No such object on this sheet.".into());
            }
            let mut params = json!({"kind": object, "id": oid});
            if kind == "move" {
                for key in ["width", "height"] {
                    if let Some(n) = size(key)? {
                        if n < 1.0 && !(key == "height" && n == 0.0) {
                            return Err(format!("{key} must be at least 1 point"));
                        }
                        params[key] = json!(n);
                    }
                }
                if let Some(h) = map.get("here") {
                    if h.as_bool().ok_or("here must be true or false")? {
                        params["at"] = json!(CellRef::new(row, col).a1());
                        params["dx"] = json!(0.0);
                        params["dy"] = json!(0.0);
                    }
                }
                if params.as_object().is_some_and(|m| m.len() == 2) {
                    return Err("Nothing to change.".into());
                }
                ("object.move", params)
            } else if kind == "place" {
                let at = |key: &str, max: u32| map.get(key).and_then(|v| v.as_u64()).filter(|n| *n < u64::from(max)).map(|n| n as u32);
                let (r, c) = (at("row", gridcraft_engine::core::MAX_ROWS).ok_or("row is out of range")?, at("col", gridcraft_engine::core::MAX_COLS).ok_or("col is out of range")?);
                let off = |key: &str| -> Result<f64, String> { map.get(key).and_then(|v| v.as_f64()).filter(|n| n.is_finite() && (0.0..=100_000.0).contains(n)).ok_or_else(|| format!("{key} must be 0 to 100,000 points")) };
                params["at"] = json!(CellRef::new(r, c).a1());
                params["dx"] = json!(off("dx")?);
                params["dy"] = json!(off("dy")?);
                for key in ["width", "height"] {
                    if let Some(n) = size(key)? {
                        if n < 1.0 && !(key == "height" && n == 0.0) {
                            return Err(format!("{key} must be at least 1 point"));
                        }
                        params[key] = json!(n);
                    }
                }
                ("object.move", params)
            } else if kind == "order" {
                match map.get("to").and_then(|v| v.as_str()) {
                    Some("front") => {
                        params["toFront"] = json!(true);
                        ("arrange.bringForward", params)
                    }
                    Some("forward") => ("arrange.bringForward", params),
                    Some("back") => {
                        params["toBack"] = json!(true);
                        ("arrange.sendBackward", params)
                    }
                    Some("backward") => ("arrange.sendBackward", params),
                    _ => return Err("to must be front, forward, backward or back".into()),
                }
            } else if kind == "turn" {
                ("arrange.rotate", json!({"id": oid}))
            } else {
                ("object.delete", params)
            }
        };
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        self.session.run(id, params).map_err(|e| e.to_string()).map(|v| v.to_string())
    }

    /// The charts of a sheet (read only): `[{"id","kind","title","row","col","dx","dy","width","height","legend","dataLabels","gridlines","style","xTitle","yTitle","series","byRows"}]`
    /// with the anchor in pixels; at most 50 charts.
    pub fn charts_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let list: Vec<_> = sh.charts.iter().take(MAX_CHARTS).map(|c| json!({
            "id": c.id, "kind": format!("{:?}", c.kind), "title": c.title, "row": c.anchor.cell.row, "col": c.anchor.cell.col,
            "dx": c.anchor.dx, "dy": c.anchor.dy, "width": c.anchor.width, "height": c.anchor.height, "legend": format!("{:?}", c.legend),
            "dataLabels": c.data_labels, "gridlines": c.gridlines, "style": c.style, "xTitle": c.x_title, "yTitle": c.y_title,
            "series": c.series.len(), "byRows": c.by_rows
        })).collect();
        Ok(json!(list).to_string())
    }

    /// The drawing of one chart as primitives (read only): `{"width":w,"height":h,"prims":[..]}` in chart pixels, at most 20,000 primitives.
    pub fn chart_scene(&self, sheet: usize, id: u32) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let ch = sh.charts.iter().find(|c| c.id == id).ok_or("no such chart")?;
        let data = gridcraft_chart::resolve(&doc.wb, sheet, ch);
        let (w, h) = (ch.anchor.width.clamp(20.0, 4000.0), ch.anchor.height.clamp(20.0, 4000.0));
        let mut prims = gridcraft_chart::render(ch, &data, w, h, &gridcraft_chart::ApproxMeasure);
        prims.truncate(MAX_SCENE_PRIMS);
        Ok(json!({"width": w, "height": h, "prims": prims}).to_string())
    }

    /// The sparklines of a sheet (read only), each drawn to fit its cell: `[{"row","col","width","height","prims":[..]}]`; at most 500.
    pub fn sparklines_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let px = |pt: f32| (f64::from(pt) * 96.0 / 72.0).round() as f32;
        let mut out = Vec::new();
        for sp in sh.sparklines.iter().take(MAX_SPARKLINES) {
            let vals: Vec<Option<f64>> = match gridcraft_engine::calc::evaluate(&doc.wb, sheet, sp.cell, &sp.source) {
                gridcraft_engine::core::Value::Array(a) => a.iter().take(10_000).map(gridcraft_engine::core::Value::as_f64).collect(),
                v => vec![v.as_f64()],
            };
            let color = sp.color.resolve(&doc.wb.theme).unwrap_or([0x15, 0x60, 0x82]);
            let (w, h) = (px(sh.col_width(sp.cell.col)).max(4.0), px(sh.row_height(sp.cell.row)).max(4.0));
            let mut prims = gridcraft_chart::render_sparkline(sp.kind, &vals, [color[0], color[1], color[2], 255], sp.markers, w, h);
            prims.truncate(MAX_SCENE_PRIMS);
            out.push(json!({"row": sp.cell.row, "col": sp.cell.col, "width": w, "height": h, "prims": prims}));
        }
        Ok(json!(out).to_string())
    }

    /// Creates or changes a chart (one history entry), `op_json` is one of
    /// `{"kind":"create","type":..,"subtype"?:..,"title"?:text}` (data = the block `row`,`col`,`rows`,`cols`; types column, bar, line, pie, doughnut,
    /// area, scatter, radar, histogram, waterfall, funnel, treemap; subtypes clustered, stacked, stacked100, markers, lines; at most 50 charts),
    /// `{"kind":"set","chart":id,"type"?,"subtype"?,"title"?,"legend"?:none|bottom|top|left|right,"dataLabels"?,"gridlines"?,"style"?:1..16,"xTitle"?,"yTitle"?,"at"?:A1}`,
    /// `{"kind":"switch","chart":id}` (rows and columns swap) or `{"kind":"delete","chart":id}`. Titles: at most 120 characters, no control characters.
    /// Returns `charts_info`.
    pub fn chart_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("missing kind")?.to_string();
        let allowed: &[&str] = match kind.as_str() {
            "create" => &["kind", "type", "subtype", "title"],
            "set" => &["kind", "chart", "type", "subtype", "title", "legend", "dataLabels", "gridlines", "style", "xTitle", "yTitle", "at", "width", "height"],
            "switch" | "delete" => &["kind", "chart"],
            _ => return Err("unsupported chart operation".into()),
        };
        if map.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err("unknown chart field".into());
        }
        let text_ok = |v: &serde_json::Value| v.as_str().is_some_and(|t| t.chars().count() <= MAX_TITLE_CHARS && !t.chars().any(|c| c.is_control()));
        let mut params = serde_json::Map::new();
        params.insert("sheet".into(), json!(sheet));
        for (k, v) in map {
            let ok = match k.as_str() {
                "kind" => true,
                "type" => v.as_str().is_some_and(|t| CHART_TYPES.contains(&t)),
                "subtype" => v.as_str().is_some_and(|t| CHART_SUBTYPES.contains(&t)),
                "title" | "xTitle" | "yTitle" => text_ok(v),
                "legend" => v.as_str().is_some_and(|t| LEGENDS.contains(&t)),
                "dataLabels" | "gridlines" => v.is_boolean(),
                "style" => v.as_u64().is_some_and(|n| (1..=16).contains(&n)),
                "at" => v.as_str().and_then(CellRef::parse).is_some(),
                "width" | "height" => v.as_u64().is_some_and(|n| (20..=4000).contains(&n)),
                "chart" => v.as_u64().is_some_and(|n| n <= u64::from(u32::MAX)),
                _ => false,
            };
            if !ok {
                return Err(format!("{k} has an unsupported value"));
            }
            if k != "kind" {
                params.insert(k.clone(), v.clone());
            }
        }
        let count = self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).ok_or("unknown sheet")?.charts.len();
        if kind == "create" {
            self.check_block(sheet, row, col, rows.max(1), cols.max(1), true)?;
            if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
                return Err("Select a block of data of at most 1,000,000 cells.".into());
            }
            if count >= MAX_CHARTS {
                return Err("This sheet already has 50 charts.".into());
            }
            params.insert("range".into(), json!(format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1())));
        } else {
            let id = map.get("chart").and_then(|v| v.as_u64()).ok_or("missing chart")?;
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if doc.wb.sheet(sheet).ok_or("unknown sheet")?.is_protected() {
                return Err("The sheet is protected. Unprotect it to change charts.".into());
            }
            if !doc.wb.sheet(sheet).ok_or("unknown sheet")?.charts.iter().any(|c| u64::from(c.id) == id) {
                return Err("no such chart".into());
            }
        }
        let command = match kind.as_str() {
            "create" => "insert.chart",
            "set" => "chart.set",
            "switch" => "chart.switchRowColumn",
            _ => "chart.delete",
        };
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        self.session.run(command, serde_json::Value::Object(params)).map_err(|e| e.to_string())?;
        self.charts_info(sheet)
    }

    /// Adds a sparkline for the selected single row or column of numbers (2 to 500 cells) in the cell right after it
    /// (after the row's last cell, or below the column). `op_json` is `{"type"?:line|column|winLoss,"markers"?:bool}`. One history entry.
    /// A sparkline already in that cell is replaced. Returns `sparklines_info`.
    pub fn sparkline_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        if map.keys().any(|k| k != "type" && k != "markers") {
            return Err("unknown sparkline field".into());
        }
        let kind = match map.get("type") {
            None => "line",
            Some(v) => v.as_str().filter(|t| SPARKLINE_TYPES.contains(t)).ok_or("unsupported sparkline type")?,
        };
        let markers = match map.get("markers") {
            None => false,
            Some(v) => v.as_bool().ok_or("markers must be true or false")?,
        };
        let points = u64::from(rows) * u64::from(cols);
        if !((rows == 1 && cols >= 2) || (cols == 1 && rows >= 2)) || points > 500 {
            return Err("Select one row or one column of 2 to 500 cells.".into());
        }
        self.check_block(sheet, row, col, rows + u32::from(cols == 1), cols + u32::from(rows == 1), true)?;
        let at = if rows == 1 { CellRef::new(row, col + cols) } else { CellRef::new(row + rows, col) };
        let source = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        self.session.run("insert.sparkline", json!({"range": source, "location": at.a1(), "type": kind, "markers": markers})).map_err(|e| e.to_string())?;
        self.sparklines_info(sheet)
    }

    /// Changes how a sheet is shown. `op_json` is `{"zoom":10..400}` (whole percent; a view setting that is not an undo step) or
    /// `{"gridlines":true|false}` (one undo step). Exactly one key. Returns `{"zoom":n,"gridlines":b}`.
    pub fn view_op(&mut self, sheet: usize, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().filter(|m| m.len() == 1).ok_or("name exactly one view setting")?;
        if self.session.doc().map_err(|e| e.to_string())?.wb.sheet(sheet).is_none() {
            return Err("unknown sheet".into());
        }
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        if let Some(z) = map.get("zoom") {
            let pct = z.as_u64().filter(|n| (10..=400).contains(n)).ok_or("zoom must be a whole number from 10 to 400")?;
            self.session.run("view.zoom", json!({"percent": pct})).map_err(|e| e.to_string())?;
        } else if let Some(g) = map.get("gridlines") {
            let on = g.as_bool().ok_or("gridlines must be true or false")?;
            self.session.run("view.gridlines", json!({"on": on})).map_err(|e| e.to_string())?;
        } else if let Some(g) = map.get("headings") {
            let on = g.as_bool().ok_or("headings must be true or false")?;
            self.session.run("view.headings", json!({"on": on})).map_err(|e| e.to_string())?;
        } else if let Some(g) = map.get("zeros") {
            let on = g.as_bool().ok_or("zeros must be true or false")?;
            self.session.run("view.showZeros", json!({"on": on})).map_err(|e| e.to_string())?;
        } else {
            return Err("unknown view setting".into());
        }
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        Ok(json!({"zoom": sh.zoom, "gridlines": sh.show_gridlines, "headings": sh.show_headings, "zeros": sh.show_zeros}).to_string())
    }

    /// The saved views of the workbook (read only): `{"views":[{"name","sheet","selection","zoom"}]}` in name order, at most 50. A saved view remembers the
    /// sheet, the selected cell and the zoom of that sheet.
    pub fn saved_views(&mut self) -> Result<String, String> {
        let stash = self.session.run("view.customViews", json!({})).map_err(|e| e.to_string())?;
        let mut views: Vec<(String, serde_json::Value)> = stash.as_object().map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
        views.sort_by(|a, b| a.0.cmp(&b.0));
        let list: Vec<_> = views.iter().take(MAX_SAVED_VIEWS).filter(|(n, _)| n.chars().count() <= MAX_VIEW_NAME).map(|(n, v)| json!({
            "name": n, "sheet": v["sheet"].as_u64(), "selection": v["selection"].as_str().map(|t| t.chars().take(24).collect::<String>()), "zoom": v["zoom"].as_u64(),
        })).collect();
        Ok(json!({"views": list}).to_string())
    }

    /// Saves, shows or deletes a named view. `op_json` is `{"kind":"save","name"}` (the sheet `sheet`, the cell `row`,`col` and that sheet's zoom; an existing
    /// name is replaced; at most 50 views), `{"kind":"show","name"}` (activates the sheet, selects the cell, sets the zoom; hidden or missing sheets refused) or
    /// `{"kind":"delete","name"}`. Names are 1 to 64 characters without control characters. Views are workbook settings and not undo steps.
    /// Returns `{"sheet","selection","zoom"}` for `show` and the view list otherwise.
    pub fn saved_view_op(&mut self, sheet: usize, row: u32, col: u32, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        if map.keys().any(|k| k != "kind" && k != "name") {
            return Err("unknown view field".into());
        }
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("missing kind")?.to_string();
        let name = map.get("name").and_then(|v| v.as_str()).map(str::trim).filter(|t| !t.is_empty() && t.chars().count() <= MAX_VIEW_NAME && !t.chars().any(|c| c.is_control())).ok_or("The view name must be 1 to 64 characters without control characters.")?.to_string();
        let existing = {
            let listed: serde_json::Value = serde_json::from_str(&self.saved_views()?).map_err(|e| e.to_string())?;
            listed["views"].as_array().map(|a| a.iter().any(|v| v["name"].as_str() == Some(name.as_str())) as usize * 1000 + a.len()).unwrap_or(0)
        };
        let (known, count) = (existing >= 1000, existing % 1000);
        match kind.as_str() {
            "save" => {
                self.check_block(sheet, row, col, 1, 1, false)?;
                if !known && count >= MAX_SAVED_VIEWS {
                    return Err(format!("A workbook can keep at most {MAX_SAVED_VIEWS} saved views."));
                }
                self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
                self.session.run("selection.set", json!({"range": CellRef::new(row, col).a1()})).map_err(|e| e.to_string())?;
                self.session.run("view.customViews", json!({"save": name})).map_err(|e| e.to_string())?;
                self.saved_views()
            }
            "show" => {
                if !known {
                    return Err("No such view.".into());
                }
                let target = {
                    let listed: serde_json::Value = serde_json::from_str(&self.saved_views()?).map_err(|e| e.to_string())?;
                    listed["views"].as_array().and_then(|a| a.iter().find(|v| v["name"].as_str() == Some(name.as_str())).and_then(|v| v["sheet"].as_u64())).ok_or("The view has no sheet.")? as usize
                };
                {
                    use gridcraft_engine::model::Visibility;
                    let doc = self.session.doc().map_err(|e| e.to_string())?;
                    let sh = doc.wb.sheet(target).ok_or("The sheet of this view no longer exists.")?;
                    if sh.visibility != Visibility::Visible {
                        return Err("The sheet of this view is hidden.".into());
                    }
                }
                self.session.run("view.customViews", json!({"show": name})).map_err(|e| e.to_string())?;
                let doc = self.session.doc().map_err(|e| e.to_string())?;
                let sh = doc.wb.active().ok_or("no sheet")?;
                Ok(json!({"sheet": doc.wb.active_sheet, "selection": doc.selection.active.a1(), "zoom": sh.zoom}).to_string())
            }
            "delete" => {
                if !known {
                    return Err("No such view.".into());
                }
                self.session.run("view.customViews", json!({"delete": name})).map_err(|e| e.to_string())?;
                self.saved_views()
            }
            _ => Err("unsupported view operation".into()),
        }
    }

    /// Outline summary of a sheet (read only): `{"rows":{"lines":n,"deepest":n,"hidden":n},"cols":{..}}` counting lines that
    /// sit in a group (outline level 1 to 7), the deepest level and how many of those lines are collapsed (hidden).
    pub fn outline_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let sum = |lines: Vec<(u8, bool)>| {
            let lines: Vec<(u8, bool)> = lines.into_iter().filter(|(o, _)| *o > 0).collect();
            json!({"lines": lines.len(), "deepest": lines.iter().map(|(o, _)| *o).max().unwrap_or(0), "hidden": lines.iter().filter(|(_, h)| *h).count()})
        };
        let rows = sum(sh.rows.iter().map(|(_, i)| (i.outline, i.hidden)).collect());
        let cols = sum(sh.cols.iter().map(|(_, i)| (i.outline, i.hidden)).collect());
        Ok(json!({"rows": rows, "cols": cols}).to_string())
    }

    /// Groups, ungroups, collapses or expands lines, or inserts subtotals, as ONE history entry. `op_json` is
    /// `{"kind":"group"|"ungroup"|"hide"|"show","axis":"rows"|"cols"}` for the selected lines (`row`,`col`,`rows`,`cols` is the selection;
    /// at most 10,000 rows or 200 columns; group levels stop at 7; hide and show act on the whole group around the selection) or
    /// `{"kind":"subtotal","groupBy":offset,"function":"sum"|"count"|"average"|"max"|"min"|"product","columns":[offsets]}` for a block with a
    /// header row (at least 3 rows, at most 2,000 rows and 100 groups, 1 to 8 value columns, offsets inside the block). Subtotal inserts a
    /// SUBTOTAL row under every run of equal values in the group column plus a grand total and groups each run. Protected sheets and merged
    /// cells inside a subtotal block are refused. The engine acts on the active sheet, so it is activated first.
    pub fn outline_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 {
            return Err("Select at least one cell.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("unsupported outline operation")?;
        let known: &[&str] = if kind == "subtotal" { &["kind", "groupBy", "function", "columns"] } else { &["kind", "axis"] };
        if map.keys().any(|k| !known.contains(&k.as_str())) {
            return Err("unknown outline field".into());
        }
        let before = self.session.doc().map_err(|e| e.to_string())?.undo.len();
        let outcome: Result<String, String> = (|| {
            self.session.run("sheet.activate", json!({"sheet": sheet}))?;
            match kind {
                "group" | "ungroup" | "hide" | "show" => {
                    let rows_axis = match map.get("axis").and_then(|v| v.as_str()) {
                        Some("rows") => true,
                        Some("cols") => false,
                        _ => return Err("axis must be rows or cols".to_string()),
                    };
                    if (rows_axis && rows > 10_000) || (!rows_axis && cols > 200) {
                        return Err("Too many lines selected (at most 10,000 rows or 200 columns).".into());
                    }
                    let name = |c: u32| CellRef::new(0, c).a1().trim_end_matches(char::is_numeric).to_string();
                    let span = if rows_axis { format!("{}:{}", row + 1, row + rows) } else { format!("{}:{}", name(col), name(col + cols - 1)) };
                    let id = match kind {
                        "group" => "data.group",
                        "ungroup" => "data.ungroup",
                        "hide" => "data.hideDetail",
                        _ => "data.showDetail",
                    };
                    let params = if rows_axis { json!({"rows": span}) } else { json!({"cols": span}) };
                    self.session.run(id, params).map(|_| json!({"kind": kind}).to_string())
                }
                "subtotal" => {
                    if rows < 3 || rows > 2000 || cols > 200 {
                        return Err("Select a header row and at least two data rows (at most 2,000 rows).".into());
                    }
                    let off = |v: &serde_json::Value| v.as_u64().filter(|o| *o < u64::from(cols)).map(|o| o as u32);
                    let group_by = map.get("groupBy").and_then(off).ok_or("groupBy is outside the selection")?;
                    let func = map.get("function").and_then(|v| v.as_str()).unwrap_or("sum");
                    if !["sum", "count", "average", "max", "min", "product"].contains(&func) {
                        return Err("unsupported subtotal function".into());
                    }
                    let list = map.get("columns").and_then(|v| v.as_array()).ok_or("columns must be a list")?;
                    if list.is_empty() || list.len() > 8 {
                        return Err("Pick 1 to 8 value columns.".into());
                    }
                    let mut value_cols = Vec::new();
                    for v in list {
                        let o = off(v).ok_or("a value column is outside the selection")?;
                        if !value_cols.contains(&o) {
                            value_cols.push(o);
                        }
                    }
                    {
                        let doc = self.session.doc().map_err(|e| e.to_string())?;
                        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
                        let (r0, r1, c0, c1) = (row, row + rows - 1, col, col + cols - 1);
                        if sh.merges.iter().any(|m| m.start.row <= r1 && m.end.row >= r0 && m.start.col <= c1 && m.end.col >= c0) {
                            return Err("Merged cells inside the block are not supported. Unmerge them first.".into());
                        }
                        let mut runs = 0usize;
                        let mut prev: Option<String> = None;
                        for r in row + 1..=r1 {
                            let cur = sh.value(CellRef::new(r, col + group_by)).display();
                            if prev.as_ref() != Some(&cur) {
                                runs += 1;
                                prev = Some(cur);
                            }
                        }
                        if runs > MAX_SUBTOTAL_GROUPS {
                            return Err(format!("At most {MAX_SUBTOTAL_GROUPS} groups can get subtotals."));
                        }
                    }
                    let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
                    let letters = |o: u32| CellRef::new(0, col + o).a1().trim_end_matches(char::is_numeric).to_string();
                    let columns: Vec<String> = value_cols.iter().map(|o| letters(*o)).collect();
                    self.session
                        .run("data.subtotal", json!({"range": range, "groupBy": letters(group_by), "function": func, "columns": columns, "header": true}))
                        .map(|v| v.to_string())
                }
                _ => Err("unsupported outline operation".into()),
            }
        })();
        match outcome {
            Ok(text) => {
                // Subtotal runs many commands and each is its own snapshot; the first one restores the state before the whole operation.
                let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
                if doc.undo.len() > before {
                    doc.undo.truncate(before + 1);
                    doc.redo.clear();
                }
                Ok(text)
            }
            Err(e) => {
                while self.session.doc().map_err(|e| e.to_string())?.undo.len() > before {
                    if self.undo().is_err() {
                        break;
                    }
                }
                Err(e)
            }
        }
    }

    /// The page setup of a sheet (read only): `{"orientation":"portrait"|"landscape","paper":..,"margins":[l,r,t,b,header,footer],"scale":n,
    /// "fitWidth":n,"fitHeight":n,"centerH":b,"centerV":b,"gridlines":b,"headings":b,"header":..,"footer":..,"printArea":A1|null,
    /// "titleRows":"1:2"|null,"titleCols":"A:B"|null}`; fit values are 0 when the sheet is not fitted to pages.
    pub fn page_info(&self, sheet: usize) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let pr = &doc.wb.sheet(sheet).ok_or("unknown sheet")?.print;
        let (fit_w, fit_h) = pr.fit_to.unwrap_or((0, 0));
        let rows = pr.title_rows.map(|(a, b)| format!("{}:{}", a + 1, b + 1));
        let cols = pr.title_cols.map(|(a, b)| format!("{}:{}", gridcraft_engine::core::col_to_letters(a), gridcraft_engine::core::col_to_letters(b)));
        Ok(json!({
            "orientation": if pr.orientation == gridcraft_engine::model::Orientation::Landscape { "landscape" } else { "portrait" },
            "paper": pr.paper, "margins": pr.margins, "scale": pr.scale, "fitWidth": fit_w, "fitHeight": fit_h,
            "centerH": pr.center_h, "centerV": pr.center_v, "gridlines": pr.gridlines, "headings": pr.headings,
            "header": pr.header, "footer": pr.footer, "printArea": pr.print_area.map(|r| r.a1()), "titleRows": rows, "titleCols": cols
        })
        .to_string())
    }

    /// Header and footer text: at most 100 characters, no control characters, and `&` only as `&P &N &D &T &A &F &C &L &R &&`.
    fn header_problem(t: &str) -> bool {
        if t.chars().count() > MAX_HEADER_CHARS || t.chars().any(|c| c.is_control()) {
            return true;
        }
        let mut chars = t.chars();
        while let Some(c) = chars.next() {
            if c == '&' && !chars.next().is_some_and(|n| "PNDTAFCLR&".contains(n)) {
                return true;
            }
        }
        false
    }

    /// Changes the page setup of a sheet as ONE history entry. `op_json` holds any of `orientation` (portrait|landscape),
    /// `paper` (Letter, Legal, A4, A3, A5, Tabloid, Executive), `margins` (normal|wide|narrow), `scale` (10 to 400) or
    /// `fitWidth`/`fitHeight` (0 to 20 pages, 0 = automatic; not together with `scale`), `centerH`, `centerV`, `gridlines`, `headings`
    /// (booleans), `header`, `footer` (text, see header_problem), `printArea` (`A1:F40` or null), `titleRows` (`1:2` or null) and
    /// `titleCols` (`A:B` or null). Unknown keys are refused. Returns the new setup like `page_info`.
    pub fn page_setup(&mut self, sheet: usize, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().filter(|m| !m.is_empty()).ok_or("name at least one setting")?;
        if map.keys().any(|k| !PAGE_KEYS.contains(&k.as_str())) {
            return Err("unknown page setting".into());
        }
        if map.contains_key("scale") && (map.contains_key("fitWidth") || map.contains_key("fitHeight")) {
            return Err("Choose a scale or fit to pages, not both.".into());
        }
        let mut call = serde_json::Map::new();
        call.insert("sheet".into(), json!(sheet));
        for (key, v) in map {
            let ok = match key.as_str() {
                "orientation" => v.as_str().is_some_and(|o| o == "portrait" || o == "landscape"),
                "paper" => v.as_str().is_some_and(|p| PAPERS.contains(&p)),
                "scale" => v.as_u64().is_some_and(|n| (10..=400).contains(&n)),
                "fitWidth" | "fitHeight" => v.as_u64().is_some_and(|n| n <= 20),
                "centerH" | "centerV" | "gridlines" | "headings" => v.is_boolean(),
                "header" | "footer" => v.as_str().is_some_and(|t| !Self::header_problem(t)),
                "printArea" => v.is_null() || v.as_str().and_then(gridcraft_engine::core::RangeRef::parse).is_some_and(|r| r.count() <= MAX_FILL_CELLS),
                "titleRows" => v.is_null() || v.as_str().is_some_and(|t| t.contains(':') && t.chars().all(|c| c.is_ascii_digit() || c == ':') && gridcraft_engine::core::RangeRef::parse(t).is_some()),
                "titleCols" => v.is_null() || v.as_str().is_some_and(|t| t.contains(':') && t.chars().all(|c| c.is_ascii_alphabetic() || c == ':') && gridcraft_engine::core::RangeRef::parse(t).is_some()),
                "margins" => v.as_str().is_some_and(|m| matches!(m, "normal" | "wide" | "narrow")),
                _ => false,
            };
            if !ok {
                return Err(format!("{key} has an unsupported value"));
            }
            if key == "margins" {
                let m: [f64; 6] = match v.as_str() {
                    Some("wide") => [1.0, 1.0, 1.0, 1.0, 0.5, 0.5],
                    Some("narrow") => [0.25, 0.25, 0.75, 0.75, 0.3, 0.3],
                    _ => [0.7, 0.7, 0.75, 0.75, 0.3, 0.3],
                };
                call.insert("margins".into(), json!({"left": m[0], "right": m[1], "top": m[2], "bottom": m[3], "header": m[4], "footer": m[5]}));
            } else {
                call.insert(key.clone(), v.clone());
            }
        }
        self.session.run("pageLayout.pageSetup", serde_json::Value::Object(call)).map_err(|e| e.to_string())?;
        self.page_info(sheet)
    }

    /// Builds a file for the host to save (nothing in the workbook changes). `op_json` is
    /// `{"format":"pdf"|"csv"|"tsv"|"html","scope":"sheet"|"all"|"selection","fit":bool}`: only PDF may export all sheets or the
    /// block (`row`, `col`, `rows`, `cols`); `fit` fits each sheet to one page wide. Honours each sheet's page setup and print area.
    /// Returns `{"format":..,"base64":..,"bytes":n,"pages":n|null}`; files over 40 MB are refused.
    pub fn export_file(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let format = op.get("format").and_then(|v| v.as_str()).ok_or("missing format")?.to_string();
        let scope = op.get("scope").and_then(|v| v.as_str()).unwrap_or("sheet").to_string();
        let fit = op.get("fit").and_then(|v| v.as_bool()).unwrap_or(false);
        if !matches!(format.as_str(), "pdf" | "csv" | "tsv" | "html") || !matches!(scope.as_str(), "sheet" | "all" | "selection") {
            return Err("unsupported export".into());
        }
        if format != "pdf" && (scope != "sheet" || fit) {
            return Err("Only PDF can export all sheets, the selection or fit to a page.".into());
        }
        self.check_block(sheet, row, col, rows.max(1), cols.max(1), false)?;
        self.session.run("sheet.activate", json!({"sheet": sheet})).map_err(|e| e.to_string())?;
        let (base64, pages) = if format == "pdf" {
            let mut params = json!({"sheets": if scope == "all" { "all" } else { "active" }});
            if scope == "selection" {
                if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
                    return Err("Select a block of at most 1,000,000 cells.".into());
                }
                params["range"] = json!(format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1()));
            }
            if fit {
                params["fitToPage"] = json!(true);
            }
            let out = self.session.run("file.exportPdf", params).map_err(|e| e.to_string())?;
            (out.get("base64").and_then(|v| v.as_str()).unwrap_or("").to_string(), out.get("pages").and_then(|v| v.as_u64()))
        } else {
            let out = self.session.run("file.saveBytes", json!({"format": format})).map_err(|e| e.to_string())?;
            (out.get("base64").and_then(|v| v.as_str()).unwrap_or("").to_string(), None)
        };
        if base64.is_empty() {
            return Err("The export produced no file.".into());
        }
        if base64.len() / 4 * 3 > MAX_EXPORT_BYTES {
            return Err("The export is larger than 40 MB. Export fewer sheets or a smaller block.".into());
        }
        Ok(json!({"format": format, "base64": base64, "bytes": base64.len() / 4 * 3, "pages": pages}).to_string())
    }

    /// Lists the visible defined names (at most 500) as `{"names":[{"name":..,"refersTo":..,"scope":"Workbook"|sheet name,"comment":..}]}`.
    pub fn list_names(&self) -> Result<String, String> {
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let names: Vec<serde_json::Value> = doc
            .wb
            .names
            .iter()
            .filter(|n| !n.hidden)
            .take(MAX_NAMES)
            .map(|n| {
                let scope = n.scope.and_then(|i| doc.wb.sheet(i)).map(|s| s.name.clone()).unwrap_or_else(|| "Workbook".to_string());
                json!({"name": n.name, "refersTo": format!("={}", n.formula), "scope": scope, "comment": n.comment})
            })
            .collect();
        Ok(json!({"names": names}).to_string())
    }

    fn name_problem(name: &str) -> Option<&'static str> {
        let count = name.chars().count();
        if count == 0 || count > MAX_NAME_CHARS {
            return Some("A name has 1 to 64 characters.");
        }
        let mut chars = name.chars();
        if !chars.next().is_some_and(|c| c.is_alphabetic() || c == '_') || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.') {
            return Some("A name starts with a letter or underscore and has only letters, digits, dots and underscores.");
        }
        let lower = name.to_ascii_lowercase();
        let rc = lower.strip_prefix('r').is_some_and(|rest| {
            let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit());
            rest.strip_prefix('c').is_some_and(|tail| tail.chars().all(|c| c.is_ascii_digit()))
        });
        if lower == "r" || lower == "c" || rc || CellRef::parse(name).is_some() {
            return Some("This name looks like a cell address.");
        }
        None
    }

    /// Defines a name for the block as ONE history entry. `op_json` is `{"name":..,"scope":"workbook"|"sheet","replace":bool}`; the
    /// name refers to the block on `sheet` (absolute). An existing name of the same scope is only replaced with `replace`.
    /// Refused: protected workbook structure, invalid or cell-like names, more than 500 names. Returns `{"name":..,"refersTo":..}`.
    pub fn define_name(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let name = op.get("name").and_then(|v| v.as_str()).ok_or("missing name")?.to_string();
        if let Some(why) = Self::name_problem(&name) {
            return Err(why.into());
        }
        let sheet_scope = match op.get("scope").and_then(|v| v.as_str()).unwrap_or("workbook") {
            "workbook" => false,
            "sheet" => true,
            _ => return Err("scope must be workbook or sheet".into()),
        };
        let replace = op.get("replace").and_then(|v| v.as_bool()).unwrap_or(false);
        let (sheet_name, refers) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if doc.wb.protected_structure {
                return Err("The workbook structure is protected.".into());
            }
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            let scope = if sheet_scope { Some(sheet) } else { None };
            let same = doc.wb.names.iter().any(|n| n.name.eq_ignore_ascii_case(&name) && n.scope == scope);
            if same && !replace {
                return Err("A name like this already exists here. Choose another or replace it.".into());
            }
            if !same && doc.wb.names.iter().filter(|n| !n.hidden).count() >= MAX_NAMES {
                return Err("A workbook holds at most 500 names.".into());
            }
            let abs = |r: u32, c: u32| format!("${}${}", gridcraft_engine::core::col_to_letters(c), r + 1);
            let body = if rows == 1 && cols == 1 { abs(row, col) } else { format!("{}:{}", abs(row, col), abs(row + rows - 1, col + cols - 1)) };
            (sh.name.clone(), format!("{}!{body}", gridcraft_engine::formula::quote_sheet(&sh.name)))
        };
        let scope_param = if sheet_scope { sheet_name } else { "Workbook".to_string() };
        self.session.run("formulas.defineName", json!({"name": name, "refersTo": format!("={refers}"), "scope": scope_param})).map_err(|e| e.to_string())?;
        Ok(json!({"name": name, "refersTo": format!("={refers}")}).to_string())
    }

    /// Deletes one name as ONE history entry. `op_json` is `{"name":..,"scope":"workbook"|"sheet"}` with `sheet` the sheet a sheet-scoped
    /// name belongs to. Formulas that use the name are not rewritten, so they show #NAME? afterwards.
    pub fn delete_name(&mut self, sheet: usize, op_json: &str) -> Result<String, String> {
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let name = op.get("name").and_then(|v| v.as_str()).ok_or("missing name")?.to_string();
        let scope = match op.get("scope").and_then(|v| v.as_str()).unwrap_or("workbook") {
            "workbook" => None,
            "sheet" => Some(sheet),
            _ => return Err("scope must be workbook or sheet".into()),
        };
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if doc.wb.protected_structure {
                return Err("The workbook structure is protected.".into());
            }
            let same: Vec<_> = doc.wb.names.iter().filter(|n| n.name.eq_ignore_ascii_case(&name)).collect();
            if !same.iter().any(|n| n.scope == scope) {
                return Err("There is no such name.".into());
            }
            if same.len() > 1 {
                return Err("This name exists in several scopes. Rename the others first.".into());
            }
        }
        self.session.run("formulas.deleteName", json!({"name": name})).map_err(|e| e.to_string())?;
        Ok(json!({"deleted": name}).to_string())
    }

    /// Adds, answers, resolves or removes a note or comment, or sets or removes a link, on ONE cell as ONE history entry.
    /// `op_json` is `{"kind":"note"|"comment","text":..}` (the cell must not have one yet), `{"kind":"reply","text":..}`,
    /// `{"kind":"resolve","resolved":bool}`, `{"kind":"remove"}`, `{"kind":"link","target":..,"text"?:..,"tooltip"?:..}` or
    /// `{"kind":"unlink"}`. Text is 1 to 2000 characters without control characters. A link target is an http(s) address, a
    /// mailto address or a `Sheet!A1` place in this workbook (at most 2048 bytes, no spaces); link text never overwrites a formula.
    /// Protected sheets are refused. Returns `{"ok":true}`.
    pub fn annotate_cell(&mut self, sheet: usize, row: u32, col: u32, op_json: &str) -> Result<String, String> {
        self.check_block(sheet, row, col, 1, 1, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let at = CellRef::new(row, col);
        let cell = at.a1();
        let clean = |key: &str, required: bool, max: usize| -> Result<String, String> {
            let t = op.get(key).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if required && t.is_empty() {
                return Err("Write some text first.".into());
            }
            if t.chars().count() > max || t.chars().any(|c| c.is_control() && c != '\n') {
                return Err("The text is too long or has control characters.".into());
            }
            Ok(t)
        };
        let (has_note, has_link) = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            (sh.comments.contains_key(&at), sh.hyperlinks.contains_key(&at))
        };
        match kind {
            "note" | "comment" => {
                let t = clean("text", true, MAX_NOTE_CHARS)?;
                if has_note {
                    return Err("This cell already has a note or comment. Remove it first.".into());
                }
                let id = if kind == "note" { "review.newNote" } else { "review.newComment" };
                self.session.run(id, json!({"sheet": sheet, "cell": cell, "text": t})).map_err(|e| e.to_string())?;
            }
            "reply" => {
                let t = clean("text", true, MAX_NOTE_CHARS)?;
                if !has_note {
                    return Err("There is no comment in this cell.".into());
                }
                self.session.run("review.replyComment", json!({"sheet": sheet, "cell": cell, "text": t})).map_err(|e| e.to_string())?;
            }
            "resolve" => {
                if !has_note {
                    return Err("There is no comment in this cell.".into());
                }
                let resolved = op.get("resolved").and_then(|v| v.as_bool()).unwrap_or(true);
                self.session.run("review.resolveComment", json!({"sheet": sheet, "cell": cell, "resolved": resolved})).map_err(|e| e.to_string())?;
            }
            "remove" => {
                if !has_note {
                    return Err("There is no comment in this cell.".into());
                }
                self.session.run("review.deleteComment", json!({"sheet": sheet, "cell": cell})).map_err(|e| e.to_string())?;
            }
            "link" => {
                let target = op.get("target").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                self.check_link_target(&target)?;
                let text = clean("text", false, 1000)?;
                let tip = clean("tooltip", false, 255)?;
                if !text.is_empty() && self.block_has_formula(sheet, row, col, 1, 1)? {
                    return Err("The cell holds a formula; link it without new text.".into());
                }
                let mut params = json!({"sheet": sheet, "cell": cell, "target": target});
                if !text.is_empty() {
                    params["text"] = json!(text);
                }
                if !tip.is_empty() {
                    params["tooltip"] = json!(tip);
                }
                self.session.run("insert.link", params).map_err(|e| e.to_string())?;
            }
            "unlink" => {
                if !has_link {
                    return Err("There is no link in this cell.".into());
                }
                self.session.run("insert.link", json!({"sheet": sheet, "cell": cell, "remove": true})).map_err(|e| e.to_string())?;
            }
            _ => return Err("unsupported annotation".into()),
        }
        Ok(json!({"ok": true}).to_string())
    }

    /// Only web, mail and in-workbook targets: nothing that runs code or reads a local file.
    fn check_link_target(&self, target: &str) -> Result<(), String> {
        if target.is_empty() || target.len() > MAX_LINK_BYTES || target.chars().any(|c| c.is_control() || (c.is_whitespace() && !target.starts_with('\''))) {
            return Err("The link target is empty, too long or has spaces.".into());
        }
        let lower = target.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://")) {
            let host = rest.split(['/', '?', '#']).next().unwrap_or("");
            if host.is_empty() || host.contains('@') {
                return Err("The web address needs a host and no user name.".into());
            }
            return Ok(());
        }
        if let Some(rest) = lower.strip_prefix("mailto:") {
            let who = rest.split('?').next().unwrap_or("");
            return match who.split_once('@') {
                Some((a, b)) if !a.is_empty() && b.contains('.') && !b.starts_with('.') => Ok(()),
                _ => Err("The mail address is not valid.".into()),
            };
        }
        if let Some((name, place)) = target.rsplit_once('!') {
            let name = name.trim_matches('\'');
            let place_ok = !place.is_empty() && place.len() <= 24 && place.chars().all(|c| c.is_ascii_alphanumeric() || c == '$' || c == ':');
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            if place_ok && doc.wb.sheet_index(name).is_some() {
                return Ok(());
            }
            return Err("The place is not in this workbook.".into());
        }
        Err("Use an http(s) address, a mailto address or Sheet!A1.".into())
    }

    /// Reads the notes, comments and links inside the block (read only, at most 200 of each). Returns
    /// `{"notes":[{"cell":..,"author":..,"text":..,"threaded":b,"resolved":b,"replies":[[author,text]]}],"links":[{"cell":..,"target":..,"tooltip":..}],"truncated":b}`.
    pub fn annotations(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let inside = |c: &CellRef| c.row >= row && c.row < row + rows && c.col >= col && c.col < col + cols;
        let mut truncated = false;
        let mut notes = Vec::new();
        for (c, n) in sh.comments.iter().filter(|(c, _)| inside(c)) {
            if notes.len() >= MAX_NOTES_LISTED {
                truncated = true;
                break;
            }
            notes.push(json!({"cell": c.a1(), "author": n.author, "text": n.text, "threaded": n.threaded, "resolved": n.resolved, "replies": n.replies}));
        }
        let mut links = Vec::new();
        for (c, h) in sh.hyperlinks.iter().filter(|(c, _)| inside(c)) {
            if links.len() >= MAX_NOTES_LISTED {
                truncated = true;
                break;
            }
            links.push(json!({"cell": c.a1(), "target": h.target, "tooltip": h.tooltip}));
        }
        Ok(json!({"notes": notes, "links": links, "truncated": truncated}).to_string())
    }

    /// Removes rows whose chosen columns repeat an earlier row (case-insensitive, the first one stays) as ONE history entry.
    /// `op_json` is `{"header":bool,"columns":[offsets inside the block]}`; the rows below move up inside the block only.
    /// Refused: protected sheets, blocks with formulas (their references would not follow the rows), fewer than two data rows.
    /// Returns `{"removed":n,"remaining":n}`.
    pub fn remove_duplicates(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows < 2 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_SORT_CELLS {
            return Err("Select at least two rows (at most 1,000,000 cells).".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let header = op.get("header").and_then(|v| v.as_bool()).ok_or("header must be true or false")?;
        if header && rows < 3 {
            return Err("Nothing to check below the header row.".into());
        }
        let raw = op.get("columns").and_then(|v| v.as_array()).ok_or("columns must be a list")?;
        if raw.is_empty() || raw.len() > cols as usize {
            return Err("Pick at least one column to compare.".into());
        }
        let mut offsets: Vec<u64> = Vec::new();
        for c in raw {
            let o = c.as_u64().filter(|o| *o < u64::from(cols)).ok_or("a column is outside the selection")?;
            if offsets.contains(&o) {
                return Err("a column is listed twice".into());
            }
            offsets.push(o);
        }
        if self.block_has_formula(sheet, row, col, rows, cols)? {
            return Err("The selection contains formulas. Their references would not follow the moved rows.".into());
        }
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run("data.removeDuplicates", json!({"range": range, "header": header, "columns": offsets})).map(|v| v.to_string())
    }

    /// Splits the text of ONE column into columns to its right as ONE history entry. `op_json` is
    /// `{"kind":"delimited","delimiters":[",",";","\t"," ","|"],"treatConsecutive":bool}` or `{"kind":"fixed","widths":[n,..]}`
    /// (ascending cut positions, at most 19). Results fill the columns right of the source in the same rows (at most 20 parts); the
    /// area must be empty, so nothing is overwritten. Refused: protected sheets, more than one column, parts that would start with "=".
    pub fn text_to_columns(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if cols != 1 || rows == 0 || rows > 10_000 {
            return Err("Select one column of at most 10,000 rows.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let mut args = json!({"range": CellRef::new(row, col).a1() + ":" + &CellRef::new(row + rows - 1, col).a1(), "treatConsecutive": false});
        let mut delims: Vec<char> = Vec::new();
        let mut fixed = false;
        match kind {
            "delimited" => {
                let list = op.get("delimiters").and_then(|v| v.as_array()).ok_or("pick at least one delimiter")?;
                for d in list {
                    let c = d.as_str().and_then(|t| (t.chars().count() == 1).then(|| t.chars().next())).flatten().filter(|c| SPLIT_DELIMITERS.contains(c)).ok_or("unsupported delimiter")?;
                    if !delims.contains(&c) {
                        delims.push(c);
                    }
                }
                if delims.is_empty() {
                    return Err("Pick at least one delimiter.".into());
                }
                args["delimiters"] = json!(delims.iter().map(|c| c.to_string()).collect::<Vec<_>>());
                args["treatConsecutive"] = json!(op.get("treatConsecutive").and_then(|v| v.as_bool()).ok_or("treatConsecutive must be true or false")?);
            }
            "fixed" => {
                let list = op.get("widths").and_then(|v| v.as_array()).ok_or("widths must be a list")?;
                let mut cuts: Vec<u64> = Vec::new();
                for w in list {
                    let n = w.as_u64().filter(|n| (1..=255).contains(n)).ok_or("a width must be 1 to 255")?;
                    if cuts.last().is_some_and(|l| *l >= n) {
                        return Err("widths must be ascending".into());
                    }
                    cuts.push(n);
                }
                if cuts.is_empty() || cuts.len() > MAX_SPLIT_PARTS - 1 {
                    return Err(format!("Use 1 to {} cut positions.", MAX_SPLIT_PARTS - 1));
                }
                args["fixedWidths"] = json!(cuts);
                fixed = true;
            }
            _ => return Err("unsupported split kind".into()),
        }
        let widest = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
            let mut widest = 1usize;
            for r in row..row + rows {
                let text = sh.value(CellRef::new(r, col)).display();
                if text.starts_with('=') || (fixed && text.contains('=')) || delims.iter().any(|d| text.contains(&format!("{d}="))) {
                    return Err(format!("{}: a part would start with \"=\" and turn into a formula.", CellRef::new(r, col).a1()));
                }
                let parts = if fixed { MAX_SPLIT_PARTS } else { text.chars().filter(|c| delims.contains(c)).count() + 1 };
                widest = widest.max(parts);
            }
            if widest > MAX_SPLIT_PARTS {
                return Err(format!("A cell would split into more than {MAX_SPLIT_PARTS} parts."));
            }
            if fixed {
                widest = args["fixedWidths"].as_array().map_or(1, |a| a.len() + 1);
            }
            if col.checked_add(widest as u32).is_none_or(|v| v > gridcraft_engine::core::MAX_COLS) {
                return Err("The parts would run past the last column.".into());
            }
            let free = gridcraft_engine::core::RangeRef::new(CellRef::new(row, col + 1), CellRef::new(row + rows - 1, col + widest as u32 - 1));
            if widest > 1 && sh.cells.iter_range(free).next().is_some() {
                return Err("The columns to the right are not empty. Clear them or insert columns first.".into());
            }
            widest
        };
        if widest < 2 {
            return Err("Nothing to split: no cell has a delimiter.".into());
        }
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run("data.textToColumns", args).map(|v| v.to_string())
    }

    /// Cells in the block that a replace would change: `(cell, new input)`. Literal matching (no wildcards), formulas only
    /// with `inFormulas`. At most 10,000 changes, so a replace can never run away.
    fn replace_changes(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op: &serde_json::Value) -> Result<Vec<(CellRef, String)>, String> {
        let text_of = |key: &str, min: usize| -> Result<String, String> {
            let t = op.get(key).and_then(|v| v.as_str()).ok_or_else(|| format!("{key} must be text"))?;
            if t.chars().count() < min || t.chars().count() > MAX_FILTER_VALUE || t.chars().any(char::is_control) {
                return Err(format!("{key} must be {min} to {MAX_FILTER_VALUE} characters without control characters"));
            }
            Ok(t.to_string())
        };
        let what = text_of("what", 1)?;
        let with = text_of("with", 0)?;
        let flag = |key: &str| op.get(key).and_then(|v| v.as_bool()).ok_or_else(|| format!("{key} must be true or false"));
        let (match_case, whole, in_formulas) = (flag("matchCase")?, flag("wholeCell")?, flag("inFormulas")?);
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        let block = gridcraft_engine::core::RangeRef::new(CellRef::new(row, col), CellRef::new(row + rows - 1, col + cols - 1));
        let mut out = Vec::new();
        for (at, cell) in sh.cells.iter_range(block) {
            if cell.formula.is_some() && !in_formulas {
                continue;
            }
            let old = cell.input_text();
            if let Some(new) = replace_text(&old, &what, &with, match_case, whole)
                && new != old
            {
                if out.len() >= MAX_REPLACE_CELLS {
                    return Err(format!("More than {MAX_REPLACE_CELLS} cells would change. Select a smaller block."));
                }
                out.push((at, new));
            }
        }
        Ok(out)
    }

    /// How many cells `replace_range` would change, as `{"count":n}`. Read only.
    pub fn find_count(&self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, false)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        Ok(json!({"count": self.replace_changes(sheet, row, col, rows, cols, &op)?.len()}).to_string())
    }

    /// Replaces text in the cells of the block as ONE history entry. `op_json` is
    /// `{"what":..,"with":..,"matchCase":b,"wholeCell":b,"inFormulas":b}`. Literal matching, the block is never widened, protected
    /// sheets are refused, and a typed value that breaks a stop validation refuses the whole replace before anything changes.
    /// Returns `{"replaced":n}`.
    pub fn replace_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let changes = self.replace_changes(sheet, row, col, rows, cols, &op)?;
        if changes.is_empty() {
            return Ok(json!({"replaced": 0}).to_string());
        }
        {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            for (at, new) in &changes {
                if new.len() > 32_767 {
                    return Err("input exceeds 32,767 UTF-8 bytes".into());
                }
                if !new.starts_with('=')
                    && let Some((dv, msg)) = gridcraft_engine::cmd::data::check_validation(&doc.wb, sheet, *at, new)
                    && dv.error_style == gridcraft_engine::model::ErrorStyle::Stop
                {
                    return Err(format!("{}: {msg}", at.a1()));
                }
            }
        }
        let before = self.session.doc().map_err(|e| e.to_string())?.undo.len();
        for (at, new) in &changes {
            if let Err(e) = self.session.run("cell.set", json!({"sheet": sheet, "cell": at.a1(), "input": new})) {
                while self.session.doc().map_err(|e| e.to_string())?.undo.len() > before {
                    if self.undo().is_err() {
                        break;
                    }
                }
                return Err(e.to_string());
            }
        }
        // Every cell was its own snapshot; the first one restores the state before the replace, so keep only that.
        let doc = self.session.doc_mut().map_err(|e| e.to_string())?;
        doc.undo.truncate(before + 1);
        Ok(json!({"replaced": changes.len()}).to_string())
    }

    /// Sets or clears data validation on the block as ONE history entry. `op_json` is
    /// `{"kind":"list","items":["a","b"]}` (1 to 100 short items, no commas, quotes or control characters),
    /// `{"kind":"listRange","source":"A1:A9"}` (same sheet), `{"kind":"number","whole":bool,"operator":..,"value":n,"value2":n}`,
    /// `{"kind":"length","operator":..,"value":n,"value2":n}` or `{"kind":"clear"}`. Typed entries that break a rule are refused by
    /// `set_cell`. Protected sheets refused; the block replaces older rules it covers.
    pub fn validation_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        let num = |v: Option<&serde_json::Value>| -> Result<String, String> {
            let n = v.and_then(|v| v.as_f64()).filter(|n| n.is_finite() && n.abs() < 1e15).ok_or("the rule needs a number")?;
            Ok(n.to_string())
        };
        let compare = |op: &serde_json::Value| -> Result<(String, String, Option<String>), String> {
            let operator = op.get("operator").and_then(|v| v.as_str()).filter(|o| CF_OPERATORS.contains(o)).ok_or("unsupported comparison")?;
            let f1 = num(op.get("value"))?;
            let two = operator == "between" || operator == "notBetween";
            let f2 = if two { Some(num(op.get("value2"))?) } else { None };
            Ok((operator.to_string(), f1, f2))
        };
        let args = match kind {
            "clear" => json!({"range": range, "clear": true}),
            "list" => {
                let items = op.get("items").and_then(|v| v.as_array()).ok_or("the list needs items")?;
                if items.is_empty() || items.len() > MAX_VALIDATION_ITEMS_SET {
                    return Err(format!("A list holds 1 to {MAX_VALIDATION_ITEMS_SET} items."));
                }
                let mut texts = Vec::new();
                for i in items {
                    let t = i.as_str().map(str::trim).filter(|t| !t.is_empty() && t.chars().count() <= 64).ok_or("each list item must be 1 to 64 characters")?;
                    if t.chars().any(|c| c.is_control() || c == ',' || c == '"') {
                        return Err("List items cannot contain commas, quotes or control characters.".into());
                    }
                    texts.push(t.to_string());
                }
                json!({"range": range, "type": "list", "formula1": format!("\"{}\"", texts.join(",")), "dropdown": true, "ignoreBlank": true})
            }
            "listRange" => {
                let src = op.get("source").and_then(|v| v.as_str()).ok_or("the list needs a source range")?;
                let r = gridcraft_engine::core::RangeRef::parse(src).filter(|r| !src.contains('!') && r.count() <= 500).ok_or("the source must be a range of at most 500 cells on this sheet")?;
                json!({"range": range, "type": "list", "formula1": format!("{}:{}", absolute_a1(&r.start.a1()), absolute_a1(&r.end.a1())), "dropdown": true, "ignoreBlank": true})
            }
            "number" => {
                let whole = op.get("whole").and_then(|v| v.as_bool()).ok_or("whole must be true or false")?;
                let (operator, f1, f2) = compare(&op)?;
                json!({"range": range, "type": if whole { "whole" } else { "decimal" }, "operator": operator, "formula1": f1, "formula2": f2, "ignoreBlank": true})
            }
            "length" => {
                let (operator, f1, f2) = compare(&op)?;
                json!({"range": range, "type": "textLength", "operator": operator, "formula1": f1, "formula2": f2, "ignoreBlank": true})
            }
            _ => return Err("unsupported validation kind".into()),
        };
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run("data.validation", args).map(|v| v.to_string())
    }

    /// Adds or clears conditional-format rules as ONE history entry. `op_json` is one of
    /// `{"kind":"cell","operator":..,"value":..,"value2":..,"style":..}`, `{"kind":"text","mode":..,"text":..,"style":..}`,
    /// `{"kind":"flag","flag":..,"style":..}`, `{"kind":"top","rank":n,"bottom":b,"percent":b,"style":..}`,
    /// `{"kind":"scale","scale":..}`, `{"kind":"clear"}` (rules touching the block) or `{"kind":"clearAll"}` (whole sheet).
    /// Only these allowlisted shapes reach the engine; at most 64 rules per sheet, protected sheets refused.
    pub fn cf_range(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FILL_CELLS {
            return Err("Select a block of at most 1,000,000 cells.".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("missing operation kind")?;
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        let existing = {
            let doc = self.session.doc().map_err(|e| e.to_string())?;
            doc.wb.sheet(sheet).ok_or("unknown sheet")?.cond_formats.len()
        };
        let style_of = |op: &serde_json::Value| -> Result<&'static str, String> {
            match op.get("style").and_then(|v| v.as_str()) {
                Some("lightRed") => Ok("lightRedFillDarkRedText"),
                Some("yellow") => Ok("yellowFillDarkYellowText"),
                Some("green") => Ok("greenFillDarkGreenText"),
                Some("redText") => Ok("redText"),
                _ => Err("unsupported highlight style".into()),
            }
        };
        let rule = match kind {
            "clear" | "clearAll" => {
                if existing == 0 {
                    return Err("There are no highlight rules on this sheet.".into());
                }
                self.session.run("sheet.activate", json!({"sheet": sheet}))?;
                let args = if kind == "clear" { json!({"range": range}) } else { json!({"sheet": true}) };
                return self.session.run("home.clearRules", args).map(|v| v.to_string());
            }
            "cell" => {
                let operator = op.get("operator").and_then(|v| v.as_str()).filter(|o| CF_OPERATORS.contains(o)).ok_or("unsupported comparison")?;
                let value = cf_value(op.get("value")).ok_or("the comparison needs a value")?;
                let mut rule = json!({"type": "cellIs", "operator": operator, "value": value, "preset": style_of(&op)?});
                if operator == "between" || operator == "notBetween" {
                    rule["value2"] = cf_value(op.get("value2")).ok_or("between needs two values")?;
                }
                rule
            }
            "text" => {
                let mode = match op.get("mode").and_then(|v| v.as_str()) {
                    Some("contains") => "containsText",
                    Some("notContains") => "notContainsText",
                    Some("beginsWith") => "beginsWith",
                    Some("endsWith") => "endsWith",
                    _ => return Err("unsupported text rule".into()),
                };
                let text = op.get("text").and_then(|v| v.as_str()).ok_or("the text rule needs text")?;
                if text.is_empty() || text.chars().count() > MAX_FILTER_VALUE || text.chars().any(char::is_control) {
                    return Err(format!("The text must be 1 to {MAX_FILTER_VALUE} characters."));
                }
                json!({"type": mode, "text": text, "preset": style_of(&op)?})
            }
            "flag" => {
                let flag = op.get("flag").and_then(|v| v.as_str()).ok_or("missing flag")?;
                match flag {
                    "blanks" | "noBlanks" | "errors" | "noErrors" | "duplicate" | "unique" => json!({"type": flag, "preset": style_of(&op)?}),
                    "aboveAverage" | "belowAverage" => json!({"type": "aboveAverage", "below": flag == "belowAverage", "preset": style_of(&op)?}),
                    _ => return Err("unsupported rule".into()),
                }
            }
            "top" => {
                let rank = op.get("rank").and_then(|v| v.as_u64()).filter(|r| (1..=1000).contains(r)).ok_or("rank must be 1 to 1000")?;
                let bottom = op.get("bottom").and_then(|v| v.as_bool()).ok_or("bottom must be true or false")?;
                let percent = op.get("percent").and_then(|v| v.as_bool()).ok_or("percent must be true or false")?;
                if percent && rank > 100 {
                    return Err("A percentage can be at most 100.".into());
                }
                json!({"type": "top10", "rank": rank, "bottom": bottom, "percent": percent, "preset": style_of(&op)?})
            }
            "bar" => {
                let color = match op.get("color").and_then(|v| v.as_str()) {
                    Some("blue") => "#638EC6",
                    Some("green") => "#63BE7B",
                    Some("orange") => "#FFB628",
                    Some("red") => "#F8696B",
                    _ => return Err("unsupported data bar color".into()),
                };
                let gradient = match op.get("gradient") {
                    None => true,
                    Some(v) => v.as_bool().ok_or("gradient must be true or false")?,
                };
                json!({"type": "dataBar", "color": color, "gradient": gradient})
            }
            "icons" => {
                let set = op.get("set").and_then(|v| v.as_str()).filter(|s| ICON_SETS.contains(s)).ok_or("unsupported icon set")?;
                let reverse = match op.get("reverse") {
                    None => false,
                    Some(v) => v.as_bool().ok_or("reverse must be true or false")?,
                };
                json!({"type": "iconSet", "set": set, "reverse": reverse})
            }
            "scale" => {
                let colors: [&str; 3] = match op.get("scale").and_then(|v| v.as_str()) {
                    Some("greenYellowRed") => ["#63BE7B", "#FFEB84", "#F8696B"],
                    Some("redYellowGreen") => ["#F8696B", "#FFEB84", "#63BE7B"],
                    Some("whiteBlue") => ["#FFFFFF", "#9DC3E6", "#2E75B6"],
                    Some("whiteRed") => ["#FFFFFF", "#F4B183", "#C55A11"],
                    _ => return Err("unsupported color scale".into()),
                };
                json!({"type": "colorScale", "colors": colors})
            }
            _ => return Err("unsupported rule kind".into()),
        };
        if existing >= MAX_CF_RULES {
            return Err(format!("A sheet can hold at most {MAX_CF_RULES} highlight rules."));
        }
        self.session.run("sheet.activate", json!({"sheet": sheet}))?;
        self.session.run("home.conditionalFormat", json!({"range": range, "rule": rule})).map(|v| v.to_string())
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

    /// Merges, unmerges, justifies, rotates or clears the formats of a block as ONE history entry. `op_json` is
    /// `{"kind":"merge","how":"cells"|"center"|"across"|"unmerge"}`, `{"kind":"justify"}`, `{"kind":"rotate","mode":"none"|"up"|"down"|"stacked"}`,
    /// `{"kind":"doubleUnderline","on":bool}` or `{"kind":"clearFormats"}`. Merging needs at least two cells and is REFUSED when it would discard
    /// filled cells (only the upper-left value of a merge survives); protected sheets are refused for every kind; at most 1,000,000 cells.
    pub fn layout_op(&mut self, sheet: usize, row: u32, col: u32, rows: u32, cols: u32, op_json: &str) -> Result<String, String> {
        if rows == 0 || cols == 0 || u64::from(rows) * u64::from(cols) > MAX_FORMAT_CELLS {
            return Err("invalid block (1 to 1,000,000 cells)".into());
        }
        self.check_block(sheet, row, col, rows, cols, true)?;
        let op: serde_json::Value = serde_json::from_str(op_json).map_err(|_| "operation must be a JSON object".to_string())?;
        let map = op.as_object().ok_or("operation must be a JSON object")?;
        let kind = map.get("kind").and_then(|v| v.as_str()).ok_or("unsupported layout operation")?;
        let known: &[&str] = match kind {
            "merge" => &["kind", "how"],
            "rotate" => &["kind", "mode"],
            "doubleUnderline" => &["kind", "on"],
            _ => &["kind"],
        };
        if map.keys().any(|k| !known.contains(&k.as_str())) {
            return Err("unknown layout field".into());
        }
        let (command, mut params) = match kind {
            "merge" => {
                let how = map.get("how").and_then(|v| v.as_str()).ok_or("unsupported merge")?;
                let command = match how {
                    "cells" => "home.mergeCells",
                    "center" => "home.mergeCenter",
                    "across" => "home.mergeAcross",
                    "unmerge" => "home.unmergeCells",
                    _ => return Err("unsupported merge".into()),
                };
                if how != "unmerge" {
                    if rows * cols < 2 || (how == "across" && cols < 2) {
                        return Err("Select at least two cells to merge.".into());
                    }
                    let doc = self.session.doc().map_err(|e| e.to_string())?;
                    let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
                    let block = gridcraft_engine::core::RangeRef::new(CellRef::new(row, col), CellRef::new(row + rows - 1, col + cols - 1));
                    let kept = |at: CellRef| if how == "across" { at.col == col } else { at.row == row && at.col == col };
                    let lost = sh.cells.iter_range(block).filter(|(at, cell)| !kept(*at) && (cell.formula.is_some() || !cell.value.display().is_empty())).count();
                    if lost > 0 {
                        return Err(format!("Merging would discard {lost} filled cell(s). Only the upper-left value of a merge survives; clear or move them first."));
                    }
                }
                (command, json!({}))
            }
            "justify" => ("home.justify", json!({})),
            "rotate" => {
                let angle = match map.get("mode").and_then(|v| v.as_str()) {
                    Some("none") => json!(0),
                    Some("up") => json!("up"),
                    Some("down") => json!("down"),
                    Some("stacked") => json!("vertical"),
                    _ => return Err("rotation must be none, up, down or stacked".into()),
                };
                ("home.orientation", json!({"angle": angle}))
            }
            "doubleUnderline" => {
                let on = map.get("on").and_then(|v| v.as_bool()).ok_or("`on` must be true or false")?;
                ("home.underline", json!({"on": on, "style": "double"}))
            }
            "clearFormats" => ("edit.clearFormats", json!({})),
            _ => return Err("unsupported layout operation".into()),
        };
        let range = format!("{}:{}", CellRef::new(row, col).a1(), CellRef::new(row + rows - 1, col + cols - 1).a1());
        params["sheet"] = json!(sheet);
        params["range"] = json!(range);
        self.session.run(command, params).map(|v| v.to_string())
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
        "h": match st.align.h { HAlign::Left => "left", HAlign::Center | HAlign::CenterAcross => "center", HAlign::Right => "right", HAlign::Justify => "justify", _ => "general" },
        "rot": st.align.rotation, "ul2": st.font.underline == Underline::Double,
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
    #[test]
    fn saved_views_remember_sheet_cell_and_zoom_and_refuse_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.view_op(0, r#"{"zoom":150}"#).unwrap();
        book.saved_view_op(0, 12, 3, r#"{"kind":"save","name":"Totals"}"#).unwrap();
        book.view_op(0, r#"{"zoom":100}"#).unwrap();
        let listed = book.saved_views().unwrap();
        assert!(listed.contains("Totals") && listed.contains("D13"), "{listed}");
        let shown: serde_json::Value = serde_json::from_str(&book.saved_view_op(0, 0, 0, r#"{"kind":"show","name":"Totals"}"#).unwrap()).unwrap();
        assert_eq!(shown["selection"], "D13");
        assert_eq!(shown["zoom"], 150);
        book.saved_view_op(0, 1, 1, r#"{"kind":"save","name":"Totals"}"#).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&book.saved_views().unwrap()).unwrap()["views"].as_array().unwrap().len(), 1, "same name replaces");
        book.saved_view_op(0, 0, 0, r#"{"kind":"delete","name":"Totals"}"#).unwrap();
        assert!(!book.saved_views().unwrap().contains("Totals"));
        for bad in [
            "nope",
            r#"{"kind":"save"}"#,
            r#"{"kind":"save","name":""}"#,
            r#"{"kind":"save","name":"a\nb"}"#,
            r#"{"kind":"show","name":"Nobody"}"#,
            r#"{"kind":"delete","name":"Nobody"}"#,
            r#"{"kind":"rename","name":"x"}"#,
            r#"{"kind":"save","name":"x","extra":1}"#,
        ] {
            assert!(book.saved_view_op(0, 0, 0, bad).is_err(), "{bad}");
        }
        assert!(book.saved_view_op(0, 0, 0, &format!(r#"{{"kind":"save","name":"{}"}}"#, "x".repeat(65))).is_err());
        assert!(book.saved_view_op(9, 0, 0, r#"{"kind":"save","name":"x"}"#).is_err());
        for i in 0..50 {
            book.saved_view_op(0, 0, 0, &format!(r#"{{"kind":"save","name":"v{i}"}}"#)).unwrap();
        }
        assert!(book.saved_view_op(0, 0, 0, r#"{"kind":"save","name":"one too many"}"#).is_err());
        book.saved_view_op(0, 0, 0, r#"{"kind":"save","name":"v1"}"#).unwrap();
    }
    #[test]
    fn outline_groups_collapses_and_subtotals_in_one_undo_step_and_refuses_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let rows = [("Team", "Pts"), ("a", "1"), ("a", "2"), ("b", "5")];
        for (i, (x, y)) in rows.iter().enumerate() {
            book.session.run("cell.set", json!({"sheet": 0, "cell": format!("A{}", 701 + i), "input": x})).unwrap();
            book.session.run("cell.set", json!({"sheet": 0, "cell": format!("B{}", 701 + i), "input": y})).unwrap();
        }
        let steps = |b: &HeadlessWorkbook| b.session.doc().unwrap().undo.len();
        let before = steps(&book);
        book.outline_op(0, 700, 0, 4, 2, r#"{"kind":"subtotal","groupBy":0,"function":"sum","columns":[1]}"#).unwrap();
        assert_eq!(steps(&book), before + 1, "one history entry");
        let info: serde_json::Value = serde_json::from_str(&book.outline_info(0).unwrap()).unwrap();
        assert_eq!(info["rows"]["lines"], 3, "{info}");
        book.undo().unwrap();
        let info: serde_json::Value = serde_json::from_str(&book.outline_info(0).unwrap()).unwrap();
        assert_eq!(info["rows"]["lines"], 0, "{info}");
        let before = steps(&book);
        book.outline_op(0, 701, 0, 2, 1, r#"{"kind":"group","axis":"rows"}"#).unwrap();
        book.outline_op(0, 701, 0, 2, 1, r#"{"kind":"hide","axis":"rows"}"#).unwrap();
        let info: serde_json::Value = serde_json::from_str(&book.outline_info(0).unwrap()).unwrap();
        assert_eq!((info["rows"]["lines"].as_u64(), info["rows"]["hidden"].as_u64(), info["rows"]["deepest"].as_u64()), (Some(2), Some(2), Some(1)), "{info}");
        assert_eq!(steps(&book), before + 2);
        book.outline_op(0, 701, 0, 2, 1, r#"{"kind":"show","axis":"rows"}"#).unwrap();
        book.outline_op(0, 701, 0, 2, 1, r#"{"kind":"ungroup","axis":"rows"}"#).unwrap();
        for bad in [
            "nope",
            r#"{"kind":"group"}"#,
            r#"{"kind":"group","axis":"diagonal"}"#,
            r#"{"kind":"group","axis":"rows","extra":1}"#,
            r#"{"kind":"flatten","axis":"rows"}"#,
            r#"{"kind":"subtotal","groupBy":9,"function":"sum","columns":[1]}"#,
            r#"{"kind":"subtotal","groupBy":0,"function":"median","columns":[1]}"#,
            r#"{"kind":"subtotal","groupBy":0,"function":"sum","columns":[]}"#,
            r#"{"kind":"subtotal","groupBy":0,"function":"sum","columns":[7]}"#,
        ] {
            assert!(book.outline_op(0, 700, 0, 4, 2, bad).is_err(), "{bad}");
        }
        assert!(book.outline_op(0, 700, 0, 2, 2, r#"{"kind":"subtotal","groupBy":0,"function":"sum","columns":[1]}"#).is_err(), "needs three rows");
        assert!(book.outline_op(0, 700, 0, 0, 2, r#"{"kind":"group","axis":"rows"}"#).is_err());
        assert!(book.outline_op(0, 0, 0, 20_000, 1, r#"{"kind":"group","axis":"rows"}"#).is_err());
        assert!(book.outline_op(9, 700, 0, 4, 2, r#"{"kind":"group","axis":"rows"}"#).is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.outline_op(0, 701, 0, 2, 1, r#"{"kind":"group","axis":"rows"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn sheet_hide_unhide_tab_color_and_view_flags() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.edit_sheet(0, r#"{"kind":"add"}"#).unwrap();
        book.edit_sheet(0, r##"{"kind":"tabColor","color":"#2E7D32"}"##).unwrap();
        let listed = book.sheets().unwrap();
        assert!(listed.contains("#2E7D32"), "{listed}");
        book.edit_sheet(0, r#"{"kind":"tabColor","color":"none"}"#).unwrap();
        assert!(!book.sheets().unwrap().contains("#2E7D32"));
        for bad in [r#"{"kind":"tabColor","color":"red"}"#, r##"{"kind":"tabColor","color":"#12345"}"##, r##"{"kind":"tabColor","color":"#GGGGGG"}"##, r#"{"kind":"tabColor"}"#, r#"{"kind":"unhide","index":0}"#, r#"{"kind":"unhide"}"#, r#"{"kind":"unhide","index":99}"#] {
            assert!(book.edit_sheet(0, bad).is_err(), "{bad}");
        }
        let n = sheet_names(&book).len();
        let r: serde_json::Value = serde_json::from_str(&book.edit_sheet(0, r#"{"kind":"hide"}"#).unwrap()).unwrap();
        assert_ne!(r["active"], 0, "the hidden sheet is not the active one");
        assert!(book.sheets().unwrap().contains("Hidden"));
        for i in 1..n - 1 {
            book.edit_sheet(i, r#"{"kind":"hide"}"#).unwrap();
        }
        assert!(book.edit_sheet(n - 1, r#"{"kind":"hide"}"#).is_err(), "last visible sheet stays");
        book.edit_sheet(n - 1, r#"{"kind":"unhide","index":0}"#).unwrap();
        assert!(book.sheets().unwrap().contains("Visible"));
        let v: serde_json::Value = serde_json::from_str(&book.view_op(0, r#"{"headings":false}"#).unwrap()).unwrap();
        assert_eq!(v["headings"], false);
        let v: serde_json::Value = serde_json::from_str(&book.view_op(0, r#"{"zeros":false}"#).unwrap()).unwrap();
        assert_eq!(v["zeros"], false);
        let lay: serde_json::Value = serde_json::from_str(&book.layout(0).unwrap()).unwrap();
        assert_eq!((lay["showHeadings"].as_bool(), lay["showZeros"].as_bool()), (Some(false), Some(false)));
        assert!(book.view_op(0, r#"{"headings":"no"}"#).is_err());
        assert!(book.view_op(0, r#"{"headings":true,"zeros":true}"#).is_err());
    }
    #[test]
    fn layout_merges_rotates_and_clears_in_single_undo_steps_and_refuses_data_loss() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        for (a, v) in [("A900", "x"), ("B900", ""), ("A901", ""), ("B901", "")] {
            book.session.run("cell.set", json!({"sheet": 0, "cell": a, "input": v})).unwrap();
        }
        let steps = |b: &HeadlessWorkbook| b.session.doc().unwrap().undo.len();
        let before = steps(&book);
        book.layout_op(0, 899, 0, 2, 2, r#"{"kind":"merge","how":"center"}"#).unwrap();
        assert_eq!(steps(&book), before + 1);
        assert!(book.layout(0).unwrap().contains(r#""r0":899"#));
        book.layout_op(0, 899, 0, 2, 2, r#"{"kind":"merge","how":"unmerge"}"#).unwrap();
        book.session.run("cell.set", json!({"sheet": 0, "cell": "B900", "input": "keep"})).unwrap();
        assert!(book.layout_op(0, 899, 0, 2, 2, r#"{"kind":"merge","how":"cells"}"#).unwrap_err().contains("discard"));
        assert!(book.layout_op(0, 899, 0, 1, 1, r#"{"kind":"merge","how":"cells"}"#).is_err());
        book.layout_op(0, 899, 0, 1, 2, r#"{"kind":"rotate","mode":"up"}"#).unwrap();
        let style: serde_json::Value = serde_json::from_str(&book.view_range(0, 899, 0, 1, 1).unwrap()).unwrap();
        assert_eq!(style["cells"][0]["style"]["rot"], 90, "{style}");
        book.layout_op(0, 899, 0, 1, 1, r#"{"kind":"justify"}"#).unwrap();
        book.layout_op(0, 899, 0, 1, 1, r#"{"kind":"doubleUnderline","on":true}"#).unwrap();
        book.layout_op(0, 899, 0, 1, 1, r#"{"kind":"clearFormats"}"#).unwrap();
        for bad in ["nope", r#"{"kind":"merge"}"#, r#"{"kind":"merge","how":"x"}"#, r#"{"kind":"rotate","mode":"45"}"#, r#"{"kind":"doubleUnderline"}"#, r#"{"kind":"justify","extra":1}"#, r#"{"kind":"shrink"}"#] {
            assert!(book.layout_op(0, 899, 0, 2, 2, bad).is_err(), "{bad}");
        }
        assert!(book.layout_op(0, 899, 0, 0, 2, r#"{"kind":"justify"}"#).is_err());
        assert!(book.layout_op(9, 899, 0, 2, 2, r#"{"kind":"justify"}"#).is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.layout_op(0, 899, 0, 2, 2, r#"{"kind":"justify"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn reviewed_range_writes_are_atomic_one_step_and_refuse_stale_or_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let token = |b: &HeadlessWorkbook| serde_json::from_str::<serde_json::Value>(&b.native_state().unwrap()).unwrap()["token"].as_str().unwrap().to_string();
        let old = |b: &HeadlessWorkbook| serde_json::from_str::<serde_json::Value>(&b.range_readback_json(0, 949, 0, 2, 2)).unwrap().to_string();
        let t0 = token(&book);
        let steps = |b: &HeadlessWorkbook| b.session.doc().unwrap().undo.len();
        let before = steps(&book);
        let receipt: serde_json::Value = serde_json::from_str(&book.set_range_reviewed(0, 949, 0, 2, 2, &t0, &old(&book), r#"["1","2","=A950+B950","x"]"#).unwrap()).unwrap();
        assert_eq!(receipt["applied"], 1);
        assert_eq!(steps(&book), before + 1, "one history entry");
        assert_eq!(receipt["readback"].as_array().unwrap().len(), 4);
        assert!(receipt["readback"][2]["formula"].as_str().unwrap().contains("A950"));
        let t1 = receipt["token"].as_str().unwrap().to_string();
        // stale token and stale old range change nothing
        assert!(book.set_range_reviewed(0, 949, 0, 2, 2, &t0, &old(&book), r#"["a","b","c","d"]"#).unwrap_err().starts_with("stale"));
        let wrong_old = old(&book).replace("\"x\"", "\"y\"");
        assert_ne!(wrong_old, old(&book), "the test must really change the old range");
        assert!(book.set_range_reviewed(0, 949, 0, 2, 2, &t1, &wrong_old, r#"["a","b","c","d"]"#).unwrap_err().starts_with("stale"));
        assert_eq!(token(&book), t1, "refused writes leave the owner state alone");
        // a true no-op restores state and token
        let noop: serde_json::Value = serde_json::from_str(&book.set_range_reviewed(0, 949, 0, 2, 2, &t1, &old(&book), r#"["1","2","=A950+B950","x"]"#).unwrap()).unwrap();
        assert_eq!((noop["applied"].as_u64(), noop["undoable"].as_bool()), (Some(0), Some(false)));
        assert_eq!(token(&book), t1);
        // bad shapes
        for (r, c, inputs) in [(2u32, 2u32, r#"["a"]"#), (2, 2, r#"["a","b","c",4]"#), (2, 2, "nope"), (0, 2, "[]"), (40, 40, "[]")] {
            assert!(book.set_range_reviewed(0, 949, 0, r, c, &t1, "[]", inputs).is_err());
        }
        assert!(book.set_range_reviewed(9, 949, 0, 2, 2, &t1, "[]", r#"["a","b","c","d"]"#).is_err());
        // exact undo, then it cannot be repeated
        let u: serde_json::Value = serde_json::from_str(&book.undo_range_reviewed(0, 949, 0, 2, 2, &t1).unwrap()).unwrap();
        assert_eq!(u["applied"], 1);
        assert_eq!(steps(&book), before);
        assert!(book.undo_range_reviewed(0, 949, 0, 2, 2, &t1).unwrap_err().starts_with("stale"));
        book.session.run("review.protectSheet", json!({})).unwrap();
        let t2 = token(&book);
        assert!(book.set_range_reviewed(0, 949, 0, 2, 2, &t2, &old(&book), r#"["a","b","c","d"]"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn objects_insert_move_and_delete_in_single_undo_steps_and_refuse_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        // 1x1 PNG
        let png: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0];
        let made = book.insert_picture(0, 400, 1, &png, "dot", 64.0).unwrap();
        assert!(made.contains("image"), "{made}");
        let info: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(info["images"].as_array().unwrap().len(), 1);
        assert_eq!(info["images"][0]["width"], serde_json::json!(64.0));
        assert_eq!(info["images"][0]["height"], serde_json::json!(32.0));
        let id = info["images"][0]["id"].as_u64().unwrap();
        assert!(book.image_data(0, id as u32).unwrap().contains("image/png"));
        book.object_op(0, 405, 3, &format!(r#"{{"kind":"move","object":"image","id":{id},"here":true,"width":100}}"#)).unwrap();
        let moved: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(moved["images"][0]["row"], 405);
        assert_eq!(moved["images"][0]["width"], serde_json::json!(100.0));
        book.undo().unwrap();
        let back: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(back["images"][0]["row"], 400);
        book.object_op(0, 410, 0, r##"{"kind":"shape","shape":"textBox","fill":"yellow","line":"black","text":"Hi","width":120,"height":40}"##).unwrap();
        book.object_op(0, 412, 0, r#"{"kind":"shape","shape":"line","line":"red","width":80,"height":0}"#).unwrap();
        let shapes: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(shapes["shapes"].as_array().unwrap().len(), 2);
        assert_eq!(shapes["shapes"][0]["fill"], "#F2C94C");
        let sid = shapes["shapes"][0]["id"].as_u64().unwrap();
        book.object_op(0, 0, 0, &format!(r#"{{"kind":"delete","object":"shape","id":{sid}}}"#)).unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&book.objects_info(0).unwrap()).unwrap()["shapes"].as_array().unwrap().len(), 1);
        book.undo().unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&book.objects_info(0).unwrap()).unwrap()["shapes"].as_array().unwrap().len(), 2);
        book.object_op(0, 0, 0, &format!(r#"{{"kind":"place","object":"image","id":{id},"row":420,"col":5,"dx":3.5,"dy":2,"width":50,"height":25}}"#)).unwrap();
        let placed: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(placed["images"][0]["row"], 420);
        assert_eq!(placed["images"][0]["col"], 5);
        assert_eq!(placed["images"][0]["width"], serde_json::json!(50.0));
        book.object_op(0, 0, 0, &format!(r#"{{"kind":"order","object":"shape","id":{sid},"to":"front"}}"#)).unwrap();
        let ordered: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(ordered["shapes"][1]["id"].as_u64().unwrap(), sid, "now on top");
        book.object_op(0, 0, 0, &format!(r#"{{"kind":"turn","id":{sid}}}"#)).unwrap();
        let turned: serde_json::Value = serde_json::from_str(&book.objects_info(0).unwrap()).unwrap();
        assert_eq!(turned["shapes"][1]["width"], serde_json::json!(40.0));
        assert_eq!(turned["shapes"][1]["height"], serde_json::json!(120.0));
        for bad in [
            format!(r#"{{"kind":"place","object":"image","id":{id},"row":999999999,"col":5,"dx":0,"dy":0}}"#),
            format!(r#"{{"kind":"place","object":"image","id":{id},"row":1,"col":5,"dx":-1,"dy":0}}"#),
            format!(r#"{{"kind":"place","object":"image","id":{id},"row":1,"col":5,"dx":0}}"#),
            format!(r#"{{"kind":"order","object":"image","id":{id},"to":"sideways"}}"#),
            format!(r#"{{"kind":"turn","id":{id}}}"#),
            r#"{"kind":"turn","id":424242}"#.to_string(),
        ] {
            assert!(book.object_op(0, 0, 0, &bad).is_err(), "{bad}");
        }
        let mut fake = png.clone();
        fake[1] = 0x51;
        assert!(book.insert_picture(0, 400, 1, &fake, "", 0.0).is_err(), "not a PNG");
        assert!(book.insert_picture(0, 400, 1, &[], "", 0.0).is_err());
        assert!(book.insert_picture(0, 400, 1, &png, "a\nb", 0.0).is_err());
        assert!(book.insert_picture(0, 400, 1, &png, "", 5.0).is_err());
        assert!(book.insert_picture(9, 400, 1, &png, "", 0.0).is_err());
        for bad in [
            "nope",
            r#"{"kind":"shape","shape":"star"}"#,
            r##"{"kind":"shape","shape":"rectangle","fill":"#ff0000"}"##,
            r#"{"kind":"shape","shape":"rectangle","line":"yellow"}"#,
            r#"{"kind":"shape","shape":"rectangle","text":"x"}"#,
            r#"{"kind":"shape","shape":"textBox","width":2}"#,
            r#"{"kind":"shape","shape":"textBox","width":99999}"#,
            r#"{"kind":"shape","shape":"rectangle","extra":1}"#,
            r#"{"kind":"move","object":"chart","id":1,"here":true}"#,
            r#"{"kind":"move","object":"shape","id":999999,"here":true}"#,
            r#"{"kind":"move","object":"shape","id":1}"#,
            r#"{"kind":"delete","object":"image","id":999999}"#,
            r#"{"kind":"insert"}"#,
        ] {
            assert!(book.object_op(0, 0, 0, bad).is_err(), "{bad}");
        }
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.object_op(0, 0, 0, r#"{"kind":"shape","shape":"ellipse"}"#).unwrap_err().contains("protected"));
        assert!(book.insert_picture(0, 400, 1, &png, "", 0.0).unwrap_err().contains("protected"));
    }
    #[test]
    fn whatif_op_seeks_goals_keeps_scenarios_and_refuses_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 300, 0, r#"[["2"],["=A301*3"]]"#).unwrap();
        let value = |b: &HeadlessWorkbook, r: u32| serde_json::from_str::<serde_json::Value>(&b.range(0, r, 0, 1, 1).unwrap()).unwrap().to_string();
        let before = value(&book, 300);
        let got = book.whatif_op(0, r#"{"kind":"goalSeek","set":"A302","to":30,"changing":"A301"}"#).unwrap();
        assert!(got.contains("converged"), "{got}");
        assert_ne!(value(&book, 300), before, "the changing cell moved");
        book.undo().unwrap();
        assert_eq!(value(&book, 300), before);
        book.whatif_op(0, r#"{"kind":"scenarioAdd","name":"Base","changing":"A301"}"#).unwrap();
        assert!(book.scenarios_info(0).unwrap().contains("Base"));
        assert!(book.whatif_op(0, r#"{"kind":"scenarioAdd","name":"Base","changing":"A301"}"#).is_err(), "duplicate names need replace");
        book.whatif_op(0, r#"{"kind":"scenarioAdd","name":"Base","changing":"A301","values":[7],"replace":true}"#).unwrap();
        book.whatif_op(0, r#"{"kind":"scenarioShow","name":"Base"}"#).unwrap();
        assert_ne!(value(&book, 300), before, "showing the scenario wrote its value");
        book.whatif_op(0, r#"{"kind":"scenarioDelete","name":"Base"}"#).unwrap();
        assert!(!book.scenarios_info(0).unwrap().contains("Base"));
        for bad in [
            "nope",
            r#"{"kind":"goalSeek","set":"A302","to":"x","changing":"A301"}"#,
            r#"{"kind":"goalSeek","set":"Sheet2!A302","to":1,"changing":"A301"}"#,
            r#"{"kind":"goalSeek","set":"A302:A303","to":1,"changing":"A301"}"#,
            r#"{"kind":"goalSeek","set":"A301","to":1,"changing":"A301"}"#,
            r#"{"kind":"scenarioAdd","name":"","changing":"A301"}"#,
            r#"{"kind":"scenarioAdd","name":"x","changing":"A301","values":[[1]]}"#,
            r#"{"kind":"scenarioShow","name":"Nobody"}"#,
            r#"{"kind":"dataTable","range":"A301:A302"}"#,
            r#"{"kind":"dataTable","range":"A301","columnInput":"B1"}"#,
            r#"{"kind":"formula","x":1}"#,
        ] {
            assert!(book.whatif_op(0, bad).is_err(), "{bad}");
        }
        assert!(book.whatif_op(9, r#"{"kind":"scenarioDelete","name":"x"}"#).is_err());
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.whatif_op(0, r#"{"kind":"goalSeek","set":"A302","to":30,"changing":"A301"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn cf_range_highlights_cells_in_one_undo_step_and_refuses_bad_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 50, 0, r#"[["1"],["5"],["9"]]"#).unwrap();
        let op = r#"{"kind":"cell","operator":"greater","value":4,"style":"yellow"}"#;
        book.cf_range(0, 50, 0, 3, 1, op).unwrap();
        let fill = |b: &HeadlessWorkbook, r: u32| serde_json::from_str::<serde_json::Value>(&b.view_range(0, r, 0, 1, 1).unwrap()).unwrap()["cells"][0]["style"]["fill"].clone();
        assert_eq!(fill(&book, 50), serde_json::Value::Null);
        assert_eq!(fill(&book, 52), serde_json::json!("#FFEB9C"));
        book.undo().unwrap();
        assert_eq!(fill(&book, 52), serde_json::Value::Null);
        book.cf_range(0, 50, 0, 3, 1, op).unwrap();
        book.cf_range(0, 50, 0, 3, 1, r#"{"kind":"scale","scale":"whiteBlue"}"#).unwrap();
        book.cf_range(0, 50, 0, 3, 1, r#"{"kind":"bar","color":"green","gradient":false}"#).unwrap();
        book.cf_range(0, 50, 0, 3, 1, r#"{"kind":"icons","set":"4Rating","reverse":true}"#).unwrap();
        let shown = book.view_range(0, 50, 0, 3, 1).unwrap();
        assert!(shown.contains("\"cfBar\":[") && shown.contains("\"cfIcon\":[\"4Rating\""), "bars and icons reach the grid");
        book.cf_range(0, 50, 0, 3, 1, r#"{"kind":"clearAll"}"#).unwrap();
        assert_eq!(fill(&book, 52), serde_json::Value::Null);
        assert!(book.cf_range(0, 50, 0, 3, 1, r#"{"kind":"clearAll"}"#).is_err(), "nothing left to clear");
        for bad in [
            "nope",
            r#"{"kind":"cell","operator":"regex","value":1,"style":"yellow"}"#,
            r#"{"kind":"cell","operator":"greater","style":"yellow"}"#,
            r#"{"kind":"cell","operator":"between","value":1,"style":"yellow"}"#,
            r#"{"kind":"cell","operator":"greater","value":1,"style":"neon"}"#,
            r#"{"kind":"text","mode":"contains","text":"","style":"green"}"#,
            r#"{"kind":"top","rank":0,"bottom":false,"percent":false,"style":"green"}"#,
            r#"{"kind":"flag","flag":"expression","style":"green"}"#,
            r#"{"kind":"scale","scale":"rainbow"}"#,
            r#"{"kind":"expression"}"#,
            r#"{"kind":"bar","color":"pink"}"#,
            r#"{"kind":"bar","color":"blue","gradient":"x"}"#,
            r#"{"kind":"icons","set":"Bogus"}"#,
            r#"{"kind":"icons","set":"3Arrows","reverse":1}"#,
        ] {
            assert!(book.cf_range(0, 50, 0, 3, 1, bad).is_err(), "{bad}");
        }
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.cf_range(0, 50, 0, 3, 1, op).unwrap_err().contains("protected"));
    }
    #[test]
    fn validation_range_gates_typed_input_and_lists_choices() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.validation_range(0, 60, 0, 3, 1, r#"{"kind":"list","items":["red","green","blue"]}"#).unwrap();
        assert!(book.validation_items(0, 60, 0).unwrap().contains("green"));
        assert!(book.validation_items(0, 70, 0).unwrap().contains("null"));
        assert!(book.set_cell(0, "A61", "purple").is_err());
        book.set_cell(0, "A61", "Green").unwrap();
        book.set_cell(0, "A62", "=1+1").unwrap();
        book.undo().unwrap();
        book.undo().unwrap();
        book.undo().unwrap();
        assert!(book.validation_items(0, 60, 0).unwrap().contains("null"), "one undo step removes the rule");
        book.validation_range(0, 60, 1, 2, 1, r#"{"kind":"number","whole":true,"operator":"between","value":1,"value2":10}"#).unwrap();
        book.set_cell(0, "B61", "5").unwrap();
        assert!(book.set_cell(0, "B62", "11").is_err());
        assert!(book.set_cell(0, "B62", "2.5").is_err());
        book.validation_range(0, 60, 1, 2, 1, r#"{"kind":"clear"}"#).unwrap();
        book.set_cell(0, "B62", "11").unwrap();
        for bad in [
            "nope",
            r#"{"kind":"list","items":[]}"#,
            r#"{"kind":"list","items":["a,b"]}"#,
            r#"{"kind":"list","items":["a\"b"]}"#,
            r#"{"kind":"listRange","source":"Other!A1:A3"}"#,
            r#"{"kind":"listRange","source":"A1:A9999"}"#,
            r#"{"kind":"number","whole":true,"operator":"between","value":1}"#,
            r#"{"kind":"number","whole":true,"operator":"regex","value":1}"#,
            r#"{"kind":"custom","formula":"=1"}"#,
        ] {
            assert!(book.validation_range(0, 60, 0, 3, 1, bad).is_err(), "{bad}");
        }
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.validation_range(0, 60, 0, 3, 1, r#"{"kind":"clear"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn replace_range_is_one_undo_step_bounded_and_atomic() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 80, 0, r#"[["Red apple","keep"],["red RED","=1+1"],["blue","x"]]"#).unwrap();
        book.set_values(0, 80, 3, r#"[["red"]]"#).unwrap();
        let op = r#"{"what":"red","with":"green","matchCase":false,"wholeCell":false,"inFormulas":false}"#;
        assert!(book.find_count(0, 80, 0, 3, 2, op).unwrap().contains("2"));
        let out = book.replace_range(0, 80, 0, 3, 2, op).unwrap();
        assert!(out.contains("2"));
        assert_eq!(text(&book, "A81"), "green apple");
        assert_eq!(text(&book, "A82"), "green green");
        assert_eq!(text(&book, "B81"), "keep");
        assert_eq!(text(&book, "D81"), "red", "outside the block");
        book.undo().unwrap();
        assert_eq!(text(&book, "A81"), "Red apple");
        assert_eq!(text(&book, "A82"), "red RED");
        let whole = r#"{"what":"BLUE","with":"sky","matchCase":false,"wholeCell":true,"inFormulas":false}"#;
        book.replace_range(0, 80, 0, 3, 2, whole).unwrap();
        assert_eq!(text(&book, "A83"), "sky");
        let none = r#"{"what":"zzz","with":"y","matchCase":true,"wholeCell":false,"inFormulas":false}"#;
        assert!(book.replace_range(0, 80, 0, 3, 2, none).unwrap().contains("0"));
        for bad in [
            "nope",
            r#"{"what":"","with":"y","matchCase":true,"wholeCell":false,"inFormulas":false}"#,
            r#"{"what":"a","with":"y","matchCase":true,"wholeCell":false}"#,
            r#"{"what":"a","with":"y\u0001","matchCase":true,"wholeCell":false,"inFormulas":false}"#,
        ] {
            assert!(book.replace_range(0, 80, 0, 3, 2, bad).is_err(), "{bad}");
        }
        book.validation_range(0, 80, 0, 1, 1, r#"{"kind":"list","items":["Red apple","pear"]}"#).unwrap();
        assert!(book.replace_range(0, 80, 0, 3, 2, op).is_err(), "a stop rule refuses the whole replace");
        assert_eq!(text(&book, "A82"), "red RED", "nothing changed");
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.replace_range(0, 80, 0, 3, 2, op).unwrap_err().contains("protected"));
    }
    #[test]
    fn charts_and_sparklines_are_created_changed_drawn_and_validated() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 200, 0, r#"[["Month","Sales"],["Jan","10"],["Feb","20"],["Mar","15"]]"#).unwrap();
        let made = book.chart_op(0, 200, 0, 4, 2, r#"{"kind":"create","type":"line","subtype":"markers","title":"Sales"}"#).unwrap();
        let list: serde_json::Value = serde_json::from_str(&made).unwrap();
        assert_eq!(list.as_array().unwrap().len(), 1);
        let id = list[0]["id"].as_u64().unwrap();
        assert_eq!(list[0]["title"], "Sales");
        let scene: serde_json::Value = serde_json::from_str(&book.chart_scene(0, id as u32).unwrap()).unwrap();
        assert!(!scene["prims"].as_array().unwrap().is_empty());
        assert!(book.chart_scene(0, 9999).is_err());
        let set = book.chart_op(0, 0, 0, 1, 1, &format!(r#"{{"kind":"set","chart":{id},"type":"column","legend":"none","dataLabels":true,"style":3,"title":"Q1"}}"#)).unwrap();
        assert!(set.contains("\"title\":\"Q1\"") && set.contains("\"legend\":\"None\"") && set.contains("\"dataLabels\":true"));
        book.undo().unwrap();
        assert!(book.charts_info(0).unwrap().contains("\"title\":\"Sales\""), "one undo restores the chart");
        book.chart_op(0, 0, 0, 1, 1, &format!(r#"{{"kind":"switch","chart":{id}}}"#)).unwrap();
        let gone = book.chart_op(0, 0, 0, 1, 1, &format!(r#"{{"kind":"delete","chart":{id}}}"#)).unwrap();
        assert_eq!(gone, "[]");
        for bad in ["nope", "[]", "{}", r#"{"kind":"burn"}"#, r#"{"kind":"create","type":"bubble"}"#, r#"{"kind":"create","type":"column","subtype":"x"}"#, r#"{"kind":"create","extra":1}"#,
                    r#"{"kind":"create","title":"a\u0007"}"#, r#"{"kind":"set"}"#, r#"{"kind":"set","chart":1,"style":17}"#, r#"{"kind":"set","chart":1,"legend":"middle"}"#, r#"{"kind":"set","chart":4294967296}"#, r#"{"kind":"set","chart":1}"#,
                    r#"{"kind":"delete","chart":1,"x":1}"#, r#"{"kind":"set","chart":1,"at":"nope"}"#, r#"{"kind":"set","chart":1,"width":19}"#, r#"{"kind":"set","chart":1,"height":4001}"#] {
            assert!(book.chart_op(0, 200, 0, 4, 2, bad).is_err(), "{bad}");
        }
        assert!(book.chart_op(0, 200, 0, 0, 0, r#"{"kind":"create"}"#).is_err());
        assert!(book.chart_op(9, 200, 0, 4, 2, r#"{"kind":"create"}"#).is_err());
        let sp = book.sparkline_op(0, 201, 1, 3, 1, r#"{"type":"column","markers":true}"#).unwrap();
        assert!(sp.contains("\"row\":204") && sp.contains("prims"));
        book.undo().unwrap();
        assert_eq!(book.sparklines_info(0).unwrap(), "[]");
        for bad in ["nope", r#"{"type":"pie"}"#, r#"{"markers":"y"}"#, r#"{"x":1}"#] {
            assert!(book.sparkline_op(0, 201, 1, 3, 1, bad).is_err(), "{bad}");
        }
        assert!(book.sparkline_op(0, 201, 1, 1, 1, "{}").is_err(), "one cell is not a series");
        assert!(book.sparkline_op(0, 201, 0, 3, 2, "{}").is_err(), "a block is not a series");
        assert!(book.sparkline_op(0, 0, 0, 1, 501, "{}").is_err());
    }
    #[test]
    fn protect_op_protects_unprotects_locks_and_validates() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        let on = book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"protect","password":"pw","allow":["sort","formatCells"]}"#).unwrap();
        assert!(on.contains("\"password\":true") && on.contains("sort") && on.contains("formatCells"));
        assert!(book.set_cell(0, "B2", "5").is_err(), "locked cells refuse edits");
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"protect"}"#).is_err(), "already protected");
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"lock","locked":false}"#).is_err(), "no locking on a protected sheet");
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"unprotect","password":"wrong"}"#).is_err());
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"unprotect"}"#).is_err());
        let off = book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"unprotect","password":"pw"}"#).unwrap();
        assert!(off.contains("\"protection\":null"));
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"unprotect"}"#).is_err(), "not protected");
        book.protect_op(0, 0, 0, 2, 2, r#"{"kind":"lock","locked":false}"#).unwrap();
        book.undo().unwrap();
        assert!(book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"workbook","on":true}"#).unwrap().contains("\"workbookLocked\":true"));
        book.protect_op(0, 0, 0, 1, 1, r#"{"kind":"workbook","on":false}"#).unwrap();
        for bad in ["nope", "[]", "{}", r#"{"kind":"burn"}"#, r#"{"kind":"protect","extra":1}"#, r#"{"kind":"protect","allow":["everything"]}"#, r#"{"kind":"protect","allow":"sort"}"#,
                    r#"{"kind":"protect","password":"a\u0007b"}"#, r#"{"kind":"lock"}"#, r#"{"kind":"lock","locked":"y"}"#, r#"{"kind":"workbook"}"#] {
            assert!(book.protect_op(0, 0, 0, 1, 1, bad).is_err(), "{bad}");
        }
        assert!(book.protect_op(0, 0, 0, 1, 1, &format!(r#"{{"kind":"protect","password":"{}"}}"#, "x".repeat(65))).is_err());
        assert!(book.protect_op(0, 0, 0, 0, 0, r#"{"kind":"lock","locked":true}"#).is_err());
        assert!(book.protect_op(9, 0, 0, 1, 1, r#"{"kind":"workbook","on":true}"#).is_err());
    }
    #[test]
    fn view_op_sets_zoom_and_gridlines_with_bounds() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        assert!(book.view_op(0, r#"{"zoom":150}"#).unwrap().contains("\"zoom\":150"));
        assert!(book.layout(0).unwrap().contains("\"zoom\":150"));
        assert!(book.view_op(0, r#"{"gridlines":false}"#).unwrap().contains("\"gridlines\":false"));
        book.undo().unwrap();
        assert!(book.layout(0).unwrap().contains("\"showGridlines\":true"), "one undo restores the gridlines");
        for bad in ["nope", "{}", r#"{"zoom":9}"#, r#"{"zoom":401}"#, r#"{"zoom":99.5}"#, r#"{"zoom":"100"}"#, r#"{"gridlines":1}"#, r#"{"zoom":100,"gridlines":true}"#, r#"{"headings":true}"#] {
            assert!(book.view_op(0, bad).is_err(), "{bad}");
        }
        assert!(book.view_op(9, r#"{"zoom":100}"#).is_err());
    }
    #[test]
    fn page_setup_and_export_are_validated_and_undoable() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 160, 0, r#"[["a","b"],["1","2"],["3","4"]]"#).unwrap();
        let info = book.page_setup(0, r#"{"orientation":"landscape","paper":"A4","margins":"narrow","gridlines":true,"header":"&C&P","footer":"Page &P of &N","printArea":"A161:B163","titleRows":"161:161","fitWidth":1,"fitHeight":0}"#).unwrap();
        for want in ["landscape", "A4", "A161:B163", "161:161", "Page &P of &N"] {
            assert!(info.contains(want), "{want}");
        }
        assert!(book.page_info(0).unwrap().contains("\"gridlines\":true"));
        book.undo().unwrap();
        assert!(book.page_info(0).unwrap().contains("portrait"), "one undo restores the setup");
        for bad in [
            "nope",
            "{}",
            r#"{"orientation":"sideways"}"#,
            r#"{"paper":"Bogus"}"#,
            r#"{"margins":"huge"}"#,
            r#"{"scale":9}"#,
            r#"{"scale":401}"#,
            r#"{"scale":100,"fitWidth":1}"#,
            r#"{"fitWidth":21}"#,
            r#"{"gridlines":"yes"}"#,
            r#"{"header":"&X"}"#,
            r#"{"header":"a&"}"#,
            r#"{"footer":"line\nbreak"}"#,
            r#"{"printArea":"nope"}"#,
            r#"{"titleRows":"A:B"}"#,
            r#"{"titleCols":"1:2"}"#,
            r#"{"surprise":1}"#,
        ] {
            assert!(book.page_setup(0, bad).is_err(), "{bad}");
        }
        let pdf = book.export_file(0, 160, 0, 3, 2, r#"{"format":"pdf","scope":"sheet"}"#).unwrap();
        assert!(pdf.contains("base64") && pdf.contains("\"pages\""));
        assert!(book.export_file(0, 160, 0, 3, 2, r#"{"format":"pdf","scope":"selection","fit":true}"#).is_ok());
        assert!(book.export_file(0, 160, 0, 3, 2, r#"{"format":"pdf","scope":"all"}"#).is_ok());
        let csv = book.export_file(0, 160, 0, 3, 2, r#"{"format":"csv","scope":"sheet"}"#).unwrap();
        assert!(csv.contains("base64"));
        for bad in [r#"{"format":"xlsx"}"#, r#"{"format":"csv","scope":"all"}"#, r#"{"format":"csv","scope":"selection"}"#, r#"{"format":"html","fit":true}"#, r#"{"scope":"sheet"}"#, r#"{"format":"pdf","scope":"page"}"#, "nope"] {
            assert!(book.export_file(0, 160, 0, 3, 2, bad).is_err(), "{bad}");
        }
        assert!(book.export_file(0, 160, 0, 0, 0, r#"{"format":"pdf","scope":"selection"}"#).is_err());
    }
    #[test]
    fn tables_and_pivots_are_validated_undoable_and_refuse_unsafe_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 150, 0, r#"[["Region","Qtr","Sales"],["East","Q1","10"],["West","Q1","20"],["East","Q2","30"]]"#).unwrap();
        let fields = book.pivot_fields(0, 150, 0, 4, 3).unwrap();
        assert!(fields.contains("Region") && fields.contains("\"numeric\":true"));
        assert!(book.pivot_fields(0, 150, 0, 1, 3).is_err());
        assert!(book.pivot_create(0, 150, 0, 4, 3, r#"{"rows":"Nope","values":"Sales","func":"sum"}"#).is_err());
        assert!(book.pivot_create(0, 150, 0, 4, 3, r#"{"rows":"Region","values":"Region","func":"sum"}"#).is_err(), "sum needs numbers");
        assert!(book.pivot_create(0, 150, 0, 4, 3, r#"{"rows":"Region","columns":"Region","values":"Sales","func":"sum"}"#).is_err());
        assert!(book.pivot_create(0, 150, 0, 4, 3, r#"{"rows":"Region","values":"Sales","func":"median"}"#).is_err());
        let before = book.session.doc().unwrap().wb.sheets.len();
        let made = book.pivot_create(0, 150, 0, 4, 3, r#"{"rows":"Region","columns":"Qtr","values":"Sales","func":"sum"}"#).unwrap();
        assert_eq!(book.session.doc().unwrap().wb.sheets.len(), before + 1);
        assert!(made.contains("sheet"));
        book.undo().unwrap();
        assert_eq!(book.session.doc().unwrap().wb.sheets.len(), before, "one undo removes the report sheet");
        assert!(book.pivot_refresh().is_ok());
        assert!(book.table_op(0, 150, 0, 1, 3, r#"{"kind":"create"}"#).is_err(), "needs a data row");
        assert!(book.table_op(0, 151, 0, 3, 3, r#"{"kind":"create"}"#).is_err(), "first row must be text");
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"create","name":"A1"}"#).is_err());
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"create","style":"Nope"}"#).is_err());
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"create","name":"Sales1"}"#).unwrap();
        assert!(book.tables_info(0).unwrap().contains("Sales1"));
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"create","name":"Other"}"#).is_err(), "no overlap");
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"style","table":"Sales1","style":"TableStyleLight3"}"#).unwrap();
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"banded","table":"Sales1","on":false}"#).unwrap();
        book.set_values(0, 154, 0, r#"[["keep"]]"#).unwrap();
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"totals","table":"Sales1","on":true}"#).is_err(), "row below is not empty");
        book.session.run("cell.set", json!({"sheet": 0, "cell": "A155", "input": ""})).unwrap();
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"totals","table":"Sales1","on":true}"#).unwrap();
        assert!(book.tables_info(0).unwrap().contains("\"totals\":true"));
        book.undo().unwrap();
        assert!(book.tables_info(0).unwrap().contains("\"totals\":false"));
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"rename","table":"Sales1","newName":"Orders"}"#).unwrap();
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"rename","table":"Orders","newName":"bad name"}"#).is_err());
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"style","table":"Missing","style":"TableStyleLight3"}"#).is_err());
        book.table_op(0, 150, 0, 4, 3, r#"{"kind":"convert","table":"Orders"}"#).unwrap();
        assert!(!book.tables_info(0).unwrap().contains("Orders"));
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.table_op(0, 150, 0, 4, 3, r#"{"kind":"create"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn custom_formats_and_names_are_structured_validated_and_undoable() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 140, 0, r#"[["-1234.5","0"]]"#).unwrap();
        for (op, code, shown) in [
            (r##"{"kind":"numFmtCustom","grouping":true,"decimals":1}"##, "#,##0.0", "-1,234.5"),
            (r##"{"kind":"numFmtCustom","grouping":true,"decimals":0,"prefix":"EUR ","negative":"paren"}"##, "\"EUR \"#,##0;(\"EUR \"#,##0)", "(EUR 1,235)"),
            (r##"{"kind":"numFmtCustom","decimals":2,"suffix":" kg","zero":"dash"}"##, "0.00\" kg\";-0.00\" kg\";\"-\"", "-1234.50 kg"),
        ] {
            assert_eq!(custom_number_code(&serde_json::from_str(op).unwrap()).unwrap(), code);
            book.format_range(0, 140, 0, 1, 1, op).unwrap();
            assert_eq!(text(&book, "A141"), shown);
        }
        book.format_range(0, 140, 0, 1, 1, r##"{"kind":"dateFmt","pattern":"dmyDot"}"##).unwrap();
        for bad in [
            r##"{"kind":"numFmtCustom","prefix":"a\"b"}"##,
            r##"{"kind":"numFmtCustom","prefix":"a;b"}"##,
            r##"{"kind":"numFmtCustom","suffix":"[Red]"}"##,
            r##"{"kind":"numFmtCustom","suffix":"0123456789abc"}"##,
            r##"{"kind":"numFmtCustom","decimals":11}"##,
            r##"{"kind":"numFmtCustom","negative":"blue"}"##,
            r##"{"kind":"numFmtCustom","zero":"x"}"##,
            r##"{"kind":"numFmtCustom","grouping":"yes"}"##,
            r##"{"kind":"dateFmt","pattern":"yyyy"}"##,
            r##"{"kind":"dateFmt"}"##,
        ] {
            assert!(book.format_range(0, 140, 0, 1, 1, bad).is_err(), "{bad}");
        }
        let out = book.define_name(0, 140, 0, 1, 2, r#"{"name":"Prices","scope":"workbook","replace":false}"#).unwrap();
        assert!(out.contains("$A$141:$B$141"));
        assert!(book.list_names().unwrap().contains("Prices"));
        assert!(book.define_name(0, 140, 0, 1, 1, r#"{"name":"prices","scope":"workbook","replace":false}"#).is_err(), "no silent overwrite");
        book.define_name(0, 140, 0, 1, 1, r#"{"name":"prices","scope":"workbook","replace":true}"#).unwrap();
        for bad in ["", "1abc", "A1", "r1c1", "R", "a b", "x;y", "a\"b"] {
            let op = serde_json::json!({"name": bad, "scope": "workbook", "replace": false}).to_string();
            assert!(book.define_name(0, 140, 0, 1, 1, &op).is_err(), "{bad}");
        }
        book.undo().unwrap();
        assert!(book.list_names().unwrap().contains("$A$141:$B$141"), "undo restores the first definition");
        assert!(book.delete_name(0, r#"{"name":"Nope","scope":"workbook"}"#).is_err());
        book.delete_name(0, r#"{"name":"Prices","scope":"workbook"}"#).unwrap();
        assert!(!book.list_names().unwrap().contains("Prices"));
        book.undo().unwrap();
        assert!(book.list_names().unwrap().contains("Prices"));
    }
    #[test]
    fn notes_and_links_are_one_undo_step_validated_and_refuse_protected_sheets() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 130, 0, r#"[["x","=1+1"]]"#).unwrap();
        book.annotate_cell(0, 130, 0, r#"{"kind":"comment","text":"check this"}"#).unwrap();
        book.annotate_cell(0, 130, 0, r#"{"kind":"reply","text":"done"}"#).unwrap();
        let out = book.annotations(0, 130, 0, 1, 2).unwrap();
        assert!(out.contains("check this") && out.contains("done"));
        assert!(book.annotate_cell(0, 130, 0, r#"{"kind":"comment","text":"again"}"#).is_err());
        book.annotate_cell(0, 130, 0, r#"{"kind":"resolve","resolved":true}"#).unwrap();
        assert!(book.annotations(0, 130, 0, 1, 1).unwrap().contains("\"resolved\":true"));
        book.undo().unwrap();
        assert!(book.annotations(0, 130, 0, 1, 1).unwrap().contains("\"resolved\":false"));
        book.annotate_cell(0, 130, 0, r#"{"kind":"remove"}"#).unwrap();
        assert!(book.annotations(0, 130, 0, 1, 1).unwrap().contains("\"notes\":[]"));
        book.annotate_cell(0, 130, 0, r#"{"kind":"link","target":"https://example.com/a?b=1","tooltip":"site"}"#).unwrap();
        assert!(book.annotations(0, 130, 0, 1, 1).unwrap().contains("https://example.com"));
        book.annotate_cell(0, 130, 0, r#"{"kind":"unlink"}"#).unwrap();
        assert!(book.annotate_cell(0, 130, 0, r#"{"kind":"unlink"}"#).is_err());
        for bad in [
            r#"{"kind":"link","target":"javascript:alert(1)"}"#,
            r#"{"kind":"link","target":"file:///etc/passwd"}"#,
            r#"{"kind":"link","target":"https://user@evil.example"}"#,
            r#"{"kind":"link","target":"https://a b.example"}"#,
            r#"{"kind":"link","target":"My Sheet!A1"}"#,
            r#"{"kind":"link","target":"mailto:nobody"}"#,
            r#"{"kind":"link","target":"Nope!A1"}"#,
            r#"{"kind":"link","target":""}"#,
            r#"{"kind":"comment","text":"  "}"#,
            r#"{"kind":"comment","text":"a\u0001"}"#,
            r#"{"kind":"zzz"}"#,
            "nope",
        ] {
            assert!(book.annotate_cell(0, 130, 0, bad).is_err(), "{bad}");
        }
        assert!(book.annotate_cell(0, 130, 1, r#"{"kind":"link","target":"https://example.com","text":"hi"}"#).is_err(), "formula text refused");
        book.annotate_cell(0, 130, 1, r#"{"kind":"link","target":"https://example.com"}"#).unwrap();
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.annotate_cell(0, 130, 0, r#"{"kind":"comment","text":"x"}"#).unwrap_err().contains("protected"));
    }
    #[test]
    fn remove_duplicates_and_text_to_columns_are_one_undo_step_and_refuse_unsafe_input() {
        let mut book = HeadlessWorkbook::new(FIXTURE).unwrap();
        book.set_values(0, 90, 0, r#"[["name","n"],["a","1"],["A","2"],["b","3"],["a","4"]]"#).unwrap();
        let out = book.remove_duplicates(0, 90, 0, 5, 2, r#"{"header":true,"columns":[0]}"#).unwrap();
        assert!(out.contains("\"removed\":2"));
        assert_eq!(text(&book, "A92"), "b");
        assert_eq!(text(&book, "A93"), "");
        book.undo().unwrap();
        assert_eq!(text(&book, "A93"), "A");
        assert!(book.remove_duplicates(0, 90, 0, 5, 2, r#"{"header":true,"columns":[2]}"#).is_err());
        assert!(book.remove_duplicates(0, 90, 0, 5, 2, r#"{"header":true,"columns":[0,0]}"#).is_err());
        assert!(book.remove_duplicates(0, 90, 0, 5, 2, r#"{"header":true,"columns":[]}"#).is_err());
        assert!(book.remove_duplicates(0, 90, 0, 1, 2, r#"{"header":false,"columns":[0]}"#).is_err());
        book.set_values(0, 100, 0, r#"[["x"],["=1+1"]]"#).unwrap();
        assert!(book.remove_duplicates(0, 100, 0, 2, 1, r#"{"header":false,"columns":[0]}"#).is_err(), "formulas refused");
        book.set_values(0, 110, 0, r#"[["a,b,c"],["d,e"],["f"]]"#).unwrap();
        let split = r#"{"kind":"delimited","delimiters":[","],"treatConsecutive":false}"#;
        book.text_to_columns(0, 110, 0, 3, 1, split).unwrap();
        assert_eq!(text(&book, "A111"), "a");
        assert_eq!(text(&book, "C111"), "c");
        assert_eq!(text(&book, "B112"), "e");
        book.undo().unwrap();
        assert_eq!(text(&book, "A111"), "a,b,c");
        assert_eq!(text(&book, "B111"), "");
        book.set_values(0, 110, 1, r#"[["keep"]]"#).unwrap();
        assert!(book.text_to_columns(0, 110, 0, 3, 1, split).is_err(), "never overwrite");
        assert_eq!(text(&book, "B111"), "keep");
        for bad in [
            "nope",
            r#"{"kind":"delimited","delimiters":[],"treatConsecutive":false}"#,
            r#"{"kind":"delimited","delimiters":["x"],"treatConsecutive":false}"#,
            r#"{"kind":"delimited","delimiters":[","]}"#,
            r#"{"kind":"fixed","widths":[3,2]}"#,
            r#"{"kind":"fixed","widths":[]}"#,
            r#"{"kind":"regex"}"#,
        ] {
            assert!(book.text_to_columns(0, 120, 0, 3, 1, bad).is_err(), "{bad}");
        }
        assert!(book.text_to_columns(0, 110, 0, 3, 2, split).is_err(), "one column only");
        book.session.run("review.protectSheet", json!({})).unwrap();
        assert!(book.remove_duplicates(0, 90, 0, 5, 2, r#"{"header":true,"columns":[0]}"#).unwrap_err().contains("protected"));
        assert!(book.text_to_columns(0, 120, 0, 3, 1, split).unwrap_err().contains("protected"));
    }
}
