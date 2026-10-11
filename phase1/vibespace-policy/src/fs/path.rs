//! Syntactic validation of agent-supplied relative paths. This is the first filter only; the
//! handle-based walk in the platform layer is what actually prevents escapes.

use super::FsError;

/// Longest accepted path, in bytes.
pub const MAX_PATH_BYTES: usize = 4096;
/// Longest accepted component, in bytes.
pub const MAX_COMPONENT_BYTES: usize = 255;

const WINDOWS_RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A validated, normalised relative path: components only, joined with `/`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RelPath {
    components: Vec<String>,
}

impl RelPath {
    /// Validate and normalise. Rejects empty, absolute, `..`, backslash, drive prefixes (`:`),
    /// NUL and control characters, over-long names, Windows reserved device names and names
    /// with trailing dot or space. `.` and empty components (`a//b`) are dropped.
    pub fn parse(input: &str) -> Result<Self, FsError> {
        if input.is_empty() || input.len() > MAX_PATH_BYTES {
            return Err(FsError::InvalidPath);
        }
        if input.starts_with('/') {
            return Err(FsError::InvalidPath);
        }
        let mut components = Vec::new();
        for c in input.split('/') {
            if c.is_empty() || c == "." {
                continue;
            }
            if c == ".." || c.len() > MAX_COMPONENT_BYTES {
                return Err(FsError::InvalidPath);
            }
            if c.chars().any(|ch| {
                ch.is_control() || matches!(ch, '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
            }) {
                return Err(FsError::InvalidPath);
            }
            if c.ends_with('.') || c.ends_with(' ') {
                return Err(FsError::InvalidPath);
            }
            let stem = c.split('.').next().unwrap_or(c).to_ascii_lowercase();
            if WINDOWS_RESERVED.contains(&stem.as_str()) {
                return Err(FsError::InvalidPath);
            }
            components.push(c.to_string());
        }
        if components.is_empty() {
            return Err(FsError::InvalidPath);
        }
        Ok(Self { components })
    }

    /// Components.
    pub fn components(&self) -> &[String] {
        &self.components
    }

    /// Canonical `a/b/c` form, used as the proposal target and in the args digest.
    pub fn canonical(&self) -> String {
        self.components.join("/")
    }

    /// Parent components and final name.
    pub fn split(&self) -> (&[String], &str) {
        let n = self.components.len();
        (&self.components[..n - 1], &self.components[n - 1])
    }

    /// True if any component equals `name` (ASCII case-insensitive).
    pub fn has_component(&self, name: &str) -> bool {
        self.components.iter().any(|c| c.eq_ignore_ascii_case(name))
    }
}
