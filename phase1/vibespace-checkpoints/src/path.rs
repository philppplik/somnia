//! Snapshot path rules.
//!
//! A snapshot key is `"<root-name>/<relative/path>"`: UTF-8, `/` separated, no `.` or `..`,
//! no empty components, no leading or trailing slash.

use crate::error::{Error, Result};
use std::collections::HashMap;

pub const MAX_COMPONENT_BYTES: usize = 255;
pub const MAX_KEY_BYTES: usize = 1024;
pub const MAX_DEPTH: usize = 128;

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Why a single path component is not acceptable, or `None` if it is fine.
pub fn component_problem(c: &str, portable: bool) -> Option<String> {
    if c.is_empty() {
        return Some("empty component".into());
    }
    if c == "." || c == ".." {
        return Some("'.' or '..' component".into());
    }
    if c.len() > MAX_COMPONENT_BYTES {
        return Some("component too long".into());
    }
    if c.chars().any(|ch| (ch as u32) < 0x20 || ch == '\u{7f}') {
        return Some("control character".into());
    }
    if c.contains('/') {
        return Some("separator inside component".into());
    }
    if portable {
        if let Some(ch) = c
            .chars()
            .find(|ch| matches!(ch, '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        {
            return Some(format!("character {ch:?} is not portable to Windows"));
        }
        if c.ends_with('.') || c.ends_with(' ') {
            return Some("trailing dot or space is not portable to Windows".into());
        }
        let stem = c.split('.').next().unwrap_or(c).trim_end_matches(' ');
        if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
            return Some("reserved Windows device name".into());
        }
    }
    None
}

/// Validate a snapshot key and return it unchanged. Keys are never "fixed up":
/// anything that is not already normalized is rejected.
pub fn normalize_key(s: &str, portable: bool) -> Result<String> {
    if s.is_empty() {
        return Err(Error::path(s, "empty path"));
    }
    if s.len() > MAX_KEY_BYTES {
        return Err(Error::path(s, "path too long"));
    }
    if s.starts_with('/') || s.ends_with('/') {
        return Err(Error::path(s, "absolute path or trailing slash"));
    }
    let mut n = 0;
    for c in s.split('/') {
        n += 1;
        if let Some(p) = component_problem(c, portable) {
            return Err(Error::path(s, p));
        }
    }
    if n > MAX_DEPTH {
        return Err(Error::path(s, "path too deep"));
    }
    Ok(s.to_string())
}

/// Root names are a single safe component, restricted to a small alphabet.
pub fn validate_root_name(name: &str) -> Result<()> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        && !name.starts_with('.')
        && component_problem(name, true).is_none();
    if ok {
        Ok(())
    } else {
        Err(Error::path(
            name,
            "invalid root name (use [A-Za-z0-9_.-], no leading dot)",
        ))
    }
}

pub fn split_key(key: &str) -> Option<(&str, &str)> {
    key.split_once('/')
}

/// Case folding used for collision detection. Unicode normalization (NFC/NFD) is not applied.
pub fn fold(s: &str) -> String {
    s.chars().flat_map(|c| c.to_lowercase()).collect()
}

/// Detects keys that would collide on a case-insensitive filesystem, and file/directory clashes.
#[derive(Default)]
pub struct CollisionTracker {
    seen: HashMap<String, (String, bool)>,
}

impl CollisionTracker {
    pub fn new() -> Self {
        Self::default()
    }

    fn register(&mut self, path: &str, is_dir: bool) -> Result<()> {
        let f = fold(path);
        match self.seen.get(&f) {
            None => {
                self.seen.insert(f, (path.to_string(), is_dir));
                Ok(())
            }
            Some((orig, d)) => {
                if orig != path {
                    Err(Error::CaseCollision {
                        a: orig.clone(),
                        b: path.to_string(),
                    })
                } else if *d != is_dir {
                    Err(Error::path(path, "used both as a file and as a directory"))
                } else {
                    Ok(())
                }
            }
        }
    }

    /// Register a file key together with all its parent directories.
    pub fn add_file(&mut self, key: &str) -> Result<()> {
        let mut idx = 0;
        while let Some(p) = key[idx..].find('/') {
            let end = idx + p;
            self.register(&key[..end], true)?;
            idx = end + 1;
        }
        self.register(key, false)
    }
}

pub fn check_case_collisions<'a>(keys: impl IntoIterator<Item = &'a str>) -> Result<()> {
    let mut t = CollisionTracker::new();
    for k in keys {
        t.add_file(k)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_keys() {
        for bad in [
            "",
            "/abs",
            "a/../b",
            "../a",
            "a/./b",
            "a//b",
            "a/",
            "a\\b",
            "C:/x",
            "a/b\0c",
            "r/CON",
            "r/con.txt",
            "r/a.",
            "r/a ",
            "r/a:b",
            "r/x?y",
        ] {
            assert!(
                normalize_key(bad, true).is_err(),
                "{bad:?} must be rejected"
            );
        }
        assert!(normalize_key("r/src/main.rs", true).is_ok());
        assert!(normalize_key("r/.gitignore", true).is_ok());
        assert!(normalize_key("r/a:b", false).is_ok());
        assert!(normalize_key("a/../b", false).is_err());
    }

    #[test]
    fn collisions() {
        assert!(check_case_collisions(["r/A.txt", "r/a.txt"]).is_err());
        assert!(check_case_collisions(["r/Src/a", "r/src/b"]).is_err());
        assert!(check_case_collisions(["r/a", "r/a/b"]).is_err());
        assert!(check_case_collisions(["r/a", "r/b"]).is_ok());
    }
}
