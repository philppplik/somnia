//! Skills layer for Vibe Space (package A6). Pure data: parse, validate, scan, discover, install.
//!
//! There is deliberately NO execution API in this crate. Installing a skill stores its files and a
//! scan report; `allowed-tools` is parsed only to be shown as "requested". Script execution needs
//! the safety runner (package A4, wave B) plus per-run consent and is out of scope here.

pub mod discover;
pub mod parse;
pub mod scan;

pub use discover::{discover_dir, install_from_files, DiscoveredSkill};
pub use parse::{parse_skill_md, ParseError, ParsedSkill};
pub use scan::{scan_bundle, SCANNER_VERSION};
