//! Abstraction over OS facts so errors and upgrade detection are testable.
use std::path::Path;

pub trait Platform {
    /// Free bytes on the volume that holds `path` (nearest existing ancestor).
    fn free_space(&self, path: &Path) -> std::io::Result<u64>;
    /// Drive label for messages, e.g. "C:".
    fn drive_label(&self, path: &Path) -> String;
    /// True if the directory (or nearest existing ancestor) is writable.
    fn can_write(&self, path: &Path) -> bool;
    /// Installed Somnia version from the uninstall registry entry, if any.
    fn installed_version(&self) -> Option<String>;
    /// True while a Somnia process runs from the install dir.
    fn app_running(&self) -> bool;
    /// Expand %VAR% style environment variables.
    fn env(&self, name: &str) -> Option<String>;
}

/// Deterministic fake used by tests and by the `--mock-*` flags of the shell.
#[derive(Default, Clone)]
pub struct MockPlatform {
    pub free: u64,
    pub writable: bool,
    pub version: Option<String>,
    pub running: bool,
    pub localappdata: String,
}

impl Platform for MockPlatform {
    fn free_space(&self, _: &Path) -> std::io::Result<u64> { Ok(self.free) }
    fn drive_label(&self, _: &Path) -> String { "C:".into() }
    fn can_write(&self, _: &Path) -> bool { self.writable }
    fn installed_version(&self) -> Option<String> { self.version.clone() }
    fn app_running(&self) -> bool { self.running }
    fn env(&self, name: &str) -> Option<String> {
        if name.eq_ignore_ascii_case("LOCALAPPDATA") { Some(self.localappdata.clone()) } else { None }
    }
}
