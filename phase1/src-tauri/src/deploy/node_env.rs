//! App settings for Node targets: the `shared/.env` file the systemd unit reads. Parsing,
//! validation and rendering only; no I/O. Values are held in zeroizing buffers and never
//! returned: the UI can list key names, never read a value back.
use std::collections::BTreeMap;
use zeroize::Zeroizing;

pub const MAX_ENTRIES: usize = 200;
pub const MAX_VALUE: usize = 16 * 1024;
pub const MAX_FILE: usize = 256 * 1024;

/// Set by the unit itself (placed after the file so they always win); users cannot define them.
pub const RESERVED: [&str; 16] = [
    "PORT", "HOST", "HOSTNAME", "NITRO_HOST", "NITRO_PORT", "NODE_ENV", "ORIGIN", "HOME", "PATH", "XDG_RUNTIME_DIR",
    "LD_PRELOAD", "LD_LIBRARY_PATH", "DBUS_SESSION_BUS_ADDRESS", "USER", "LOGNAME", "SHELL",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum EnvError {
    #[error("deploy.node.env.badKey")]
    BadKey,
    #[error("deploy.node.env.reserved")]
    Reserved,
    #[error("deploy.node.env.badValue")]
    BadValue,
    #[error("deploy.node.env.tooMany")]
    TooMany,
    #[error("deploy.node.env.tooLarge")]
    TooLarge,
}

pub type EnvMap = BTreeMap<String, Zeroizing<String>>;

pub fn valid_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && key.len() <= 128
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}
pub fn check_key(key: &str) -> Result<(), EnvError> {
    if !valid_key(key) {
        return Err(EnvError::BadKey);
    }
    if RESERVED.contains(&key) || key.starts_with("NITRO_") && matches!(key, "NITRO_HOST" | "NITRO_PORT") {
        return Err(EnvError::Reserved);
    }
    Ok(())
}
pub fn check_value(value: &str) -> Result<(), EnvError> {
    if value.len() > MAX_VALUE || value.contains('\0') {
        return Err(EnvError::BadValue);
    }
    Ok(())
}

/// Quote one value for a systemd EnvironmentFile: double quotes with C-style escapes. `$` and `%`
/// are not special there, so they pass through untouched.
fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
fn unquote(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if let Some(inner) = raw.strip_prefix('"') {
        let inner = inner.strip_suffix('"')?;
        let mut out = String::new();
        let mut it = inner.chars();
        while let Some(c) = it.next() {
            if c != '\\' {
                out.push(c);
                continue;
            }
            match it.next()? {
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                '\\' => out.push('\\'),
                '"' => out.push('"'),
                other => {
                    out.push('\\');
                    out.push(other);
                }
            }
        }
        return Some(out);
    }
    if let Some(inner) = raw.strip_prefix('\'') {
        return inner.strip_suffix('\'').map(str::to_owned);
    }
    Some(raw.to_owned())
}

/// Lenient parse of a file this module wrote (or a hand-edited one). Lines it cannot read are
/// dropped from the map; the key list shown to the user therefore never claims more than the app sees.
pub fn parse(text: &str) -> EnvMap {
    let mut map = EnvMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((k, v)) = line.split_once('=') else { continue };
        let k = k.trim();
        if !valid_key(k) {
            continue;
        }
        if let Some(v) = unquote(v) {
            map.insert(k.to_owned(), Zeroizing::new(v));
        }
    }
    map
}

pub fn render(map: &EnvMap) -> Result<Zeroizing<Vec<u8>>, EnvError> {
    if map.len() > MAX_ENTRIES {
        return Err(EnvError::TooMany);
    }
    let mut out = Zeroizing::new(String::from("# Written by Somnia. Edit through Publish > App settings.\n"));
    for (k, v) in map {
        check_value(v)?;
        out.push_str(k);
        out.push('=');
        out.push_str(&quote(v));
        out.push('\n');
    }
    if out.len() > MAX_FILE {
        return Err(EnvError::TooLarge);
    }
    Ok(Zeroizing::new(out.as_bytes().to_vec()))
}

/// Apply removals, then sets, to an existing map. Nothing is applied if any entry is invalid.
pub fn apply(mut map: EnvMap, set: Vec<(String, Zeroizing<String>)>, remove: &[String]) -> Result<EnvMap, EnvError> {
    for (k, v) in &set {
        check_key(k)?;
        check_value(v)?;
    }
    for k in remove {
        if !valid_key(k) {
            return Err(EnvError::BadKey);
        }
    }
    for k in remove {
        map.remove(k);
    }
    for (k, v) in set {
        map.insert(k, v);
    }
    if map.len() > MAX_ENTRIES {
        return Err(EnvError::TooMany);
    }
    Ok(map)
}

/// Strings the redactor must scrub from logs: every value of four or more characters.
pub fn secret_values(map: &EnvMap) -> Vec<String> {
    map.values().filter(|v| v.len() >= 4).map(|v| v.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn z(s: &str) -> Zeroizing<String> {
        Zeroizing::new(s.into())
    }
    #[test]
    fn roundtrips_awkward_values() {
        let mut m = EnvMap::new();
        for (k, v) in [("A", "plain"), ("B", "with \"quotes\" and \\ slash"), ("C", "line1\nline2\ttab"), ("D", "$HOME %h #not-comment"), ("E", "")] {
            m.insert(k.into(), z(v));
        }
        let bytes = render(&m).unwrap();
        let back = parse(std::str::from_utf8(&bytes).unwrap());
        assert_eq!(back.len(), 5);
        for (k, v) in &m {
            assert_eq!(back[k].as_str(), v.as_str(), "{k}");
        }
        // One physical line per entry, so no value can start a new variable.
        assert_eq!(std::str::from_utf8(&bytes).unwrap().lines().count(), 6);
    }
    #[test]
    fn newline_in_value_cannot_inject_a_second_variable() {
        let m = apply(EnvMap::new(), vec![("A".into(), z("x\"\nEVIL=1"))], &[]).unwrap();
        let text = String::from_utf8(render(&m).unwrap().to_vec()).unwrap();
        let back = parse(&text);
        assert_eq!(back.len(), 1);
        assert!(!back.contains_key("EVIL"));
    }
    #[test]
    fn rejects_bad_and_reserved_keys_without_partial_apply() {
        let base = apply(EnvMap::new(), vec![("KEEP".into(), z("1"))], &[]).unwrap();
        for bad in ["", "1A", "A-B", "A B", "A=B", "PORT", "HOSTNAME", "NODE_ENV", "NITRO_PORT", "LD_PRELOAD", "PATH"] {
            assert!(apply(base.clone(), vec![("OK".into(), z("v")), (bad.into(), z("v"))], &[]).is_err(), "{bad}");
        }
        assert!(apply(base.clone(), vec![("X".into(), z("a\0b"))], &[]).is_err());
        assert!(apply(base, vec![], &["bad key".into()]).is_err());
    }
    #[test]
    fn removal_and_overwrite() {
        let m = apply(EnvMap::new(), vec![("A".into(), z("1")), ("B".into(), z("2"))], &[]).unwrap();
        let m = apply(m, vec![("A".into(), z("9"))], &["B".into()]).unwrap();
        assert_eq!(m.keys().collect::<Vec<_>>(), ["A"]);
        assert_eq!(m["A"].as_str(), "9");
    }
    #[test]
    fn limits_and_secret_values() {
        let many: Vec<_> = (0..201).map(|i| (format!("K{i}"), z("v"))).collect();
        assert_eq!(apply(EnvMap::new(), many, &[]).unwrap_err(), EnvError::TooMany);
        assert_eq!(check_value(&"x".repeat(MAX_VALUE + 1)).unwrap_err(), EnvError::BadValue);
        let m = apply(EnvMap::new(), vec![("A".into(), z("abc")), ("B".into(), z("long-secret"))], &[]).unwrap();
        assert_eq!(secret_values(&m), ["long-secret"]);
    }
    #[test]
    fn parses_hand_edited_files() {
        let m = parse("# c\n; c\nexport A=1\nB='raw $x'\n  C = \"q\\\"\"\nbad line\n9X=1\n");
        assert_eq!(m["A"].as_str(), "1");
        assert_eq!(m["B"].as_str(), "raw $x");
        assert_eq!(m["C"].as_str(), "q\"");
        assert_eq!(m.len(), 3);
    }
}
