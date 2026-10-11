use crate::errors::InstallError;
use crate::platform::Platform;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Build-owned allowlist for file associations (options-spec: no claim of all formats).
pub const FILE_ASSOC_ALLOWLIST: &[&str] = &[".html", ".svg", ".md", ".somnia"];
pub const DEFAULT_DIR: &str = "%LOCALAPPDATA%\\Somnia";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Options {
    pub install_dir: String,
    pub start_menu: bool,
    pub desktop_shortcut: bool,
    /// "Launch at sign-in" - opt-in, default off.
    pub launch_at_signin: bool,
    /// File associations - opt-in, default off.
    pub file_associations: bool,
    /// "Check for updates automatically" - persisted into the app updater config.
    pub auto_update_check: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            install_dir: DEFAULT_DIR.into(),
            start_menu: true,
            desktop_shortcut: true,
            launch_at_signin: false,
            file_associations: false,
            auto_update_check: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "field", rename_all = "snake_case")]
pub enum FieldError {
    Empty,
    NotAbsolute,
    Unwritable { path: String },
    NoSpace { required: u64, free: u64, drive: String },
}

/// Expand `%VAR%` using the platform environment. Unknown variables stay untouched.
pub fn expand(p: &dyn Platform, raw: &str) -> String {
    let mut out = String::new();
    let mut rest = raw;
    while let Some(s) = rest.find('%') {
        out.push_str(&rest[..s]);
        let after = &rest[s + 1..];
        match after.find('%') {
            Some(e) => {
                let name = &after[..e];
                match p.env(name) {
                    Some(v) if !name.is_empty() => out.push_str(&v),
                    _ => { out.push('%'); out.push_str(name); out.push('%'); }
                }
                rest = &after[e + 1..];
            }
            None => { out.push('%'); rest = after; }
        }
    }
    out.push_str(rest);
    out
}

fn is_absolute_windows(s: &str) -> bool {
    let b = s.as_bytes();
    (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
        || s.starts_with("\\\\")
}

/// Validate folder before install (options-spec: nonempty, absolute, writable, space from real build size).
pub fn validate(p: &dyn Platform, opts: &Options, required_bytes: u64) -> Result<PathBuf, FieldError> {
    let trimmed = opts.install_dir.trim();
    if trimmed.is_empty() { return Err(FieldError::Empty); }
    let expanded = expand(p, trimmed);
    if !is_absolute_windows(&expanded) { return Err(FieldError::NotAbsolute); }
    let path = PathBuf::from(&expanded);
    if !p.can_write(&path) { return Err(FieldError::Unwritable { path: expanded }); }
    let free = p.free_space(&path).unwrap_or(0);
    if free < required_bytes {
        return Err(FieldError::NoSpace { required: required_bytes, free, drive: p.drive_label(&path) });
    }
    Ok(path)
}

impl FieldError {
    pub fn into_install_error(self) -> InstallError {
        match self {
            FieldError::NoSpace { required, free, drive } => InstallError::DiskFull { required, free, drive },
            FieldError::Unwritable { path } => InstallError::NoWritePermission { path },
            FieldError::Empty | FieldError::NotAbsolute => InstallError::Generic { detail: "invalid install folder".into() },
        }
    }
}

/// Upgrade keeps existing settings: if a saved options file exists, it wins over fresh defaults.
pub fn merge_for_upgrade(saved: Option<Options>, fresh: Options, upgrading: bool) -> Options {
    match (upgrading, saved) { (true, Some(s)) => s, _ => fresh }
}

pub fn is_inside(dir: &Path, child: &Path) -> bool { child.starts_with(dir) }
