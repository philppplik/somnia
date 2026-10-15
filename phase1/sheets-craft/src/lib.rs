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
                let value = sh.value(at);
                let formula = sh.cell(at).and_then(|v| v.formula.as_ref()).map(|f| f.text.clone());
                let base = wb.styles.get(sh.style_id(at));
                let fmt = NumberFormat::parse(base.num_fmt.as_str());
                let shown = format_value(&value, &fmt, wb.date_system);
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
                }
                cells.push(json!({
                    "address": at.a1(), "value": value, "formula": formula,
                    "text": shown.text, "numeric": shown.numeric,
                    "fmtColor": shown.color.map(format_color),
                    "style": style_json_value,
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
            "cols":cols,"rows":rows,"showGridlines":sh.show_gridlines,"zoom":sh.zoom,"protection":sh.protection.as_ref().map(|p| json!({"password": p.password_hash.is_some(), "allow": Self::allowed_names(p)})),"workbookLocked":doc.wb.protected_structure,
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
        } else {
            return Err("unknown view setting".into());
        }
        let doc = self.session.doc().map_err(|e| e.to_string())?;
        let sh = doc.wb.sheet(sheet).ok_or("unknown sheet")?;
        Ok(json!({"zoom": sh.zoom, "gridlines": sh.show_gridlines}).to_string())
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
