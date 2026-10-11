//! What a checkpoint covers.

use crate::error::{Error, Result};
use crate::path::{fold, normalize_key, validate_root_name};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScopeRoot {
    /// Short stable name, becomes the first component of every snapshot key.
    pub name: String,
    /// Directory on disk. Canonicalized (symlinks in the root path itself are resolved) when the scope is validated.
    pub path: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Limits {
    pub max_files: u64,
    pub max_total_bytes: u64,
    pub max_file_bytes: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            max_files: 100_000,
            max_total_bytes: 4 << 30,
            max_file_bytes: 1 << 30,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SymlinkPolicy {
    /// Any symlink (or Windows reparse point) in scope is an error. Default.
    Reject,
    /// Symlinks are skipped and reported. They are never followed, copied or modified.
    Skip,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Scope {
    pub roots: Vec<ScopeRoot>,
    /// Snapshot keys (`"<root>/<rel>"`) of files or directory subtrees to leave out.
    /// A directory or file named `.git` is always left out, at any depth.
    pub exclude: Vec<String>,
    pub limits: Limits,
    pub symlinks: SymlinkPolicy,
    /// Reject names that cannot exist on Windows (reserved names, `:` etc.). Default true so that
    /// checkpoints stay portable.
    pub portable_names: bool,
}

impl Scope {
    pub fn new(roots: Vec<ScopeRoot>) -> Scope {
        Scope {
            roots,
            exclude: vec![],
            limits: Limits::default(),
            symlinks: SymlinkPolicy::Reject,
            portable_names: true,
        }
    }

    pub fn single(name: &str, path: impl Into<PathBuf>) -> Scope {
        Scope::new(vec![ScopeRoot {
            name: name.to_string(),
            path: path.into(),
        }])
    }

    /// Check the scope and return a canonical copy (roots canonicalized).
    /// `vault_root` must be the canonical vault directory; roots may not overlap it.
    pub(crate) fn validate(&self, vault_root: Option<&Path>) -> Result<Scope> {
        if self.roots.is_empty() {
            return Err(Error::InvalidScope("no roots".into()));
        }
        let mut names = HashSet::new();
        let mut out = Vec::new();
        for r in &self.roots {
            validate_root_name(&r.name)?;
            if !names.insert(fold(&r.name)) {
                return Err(Error::InvalidScope(format!(
                    "duplicate root name {:?}",
                    r.name
                )));
            }
            let canon = std::fs::canonicalize(&r.path)
                .map_err(|e| Error::io(format!("canonicalize root {}", r.path.display()), e))?;
            if !canon.is_dir() {
                return Err(Error::InvalidScope(format!(
                    "root is not a directory: {}",
                    canon.display()
                )));
            }
            if canon.to_str().is_none() {
                return Err(Error::InvalidScope("root path is not valid UTF-8".into()));
            }
            if let Some(v) = vault_root
                && (canon.starts_with(v) || v.starts_with(&canon))
            {
                return Err(Error::ScopeOverlapsVault(canon));
            }
            out.push(ScopeRoot {
                name: r.name.clone(),
                path: canon,
            });
        }
        for i in 0..out.len() {
            for j in (i + 1)..out.len() {
                if out[i].path.starts_with(&out[j].path) || out[j].path.starts_with(&out[i].path) {
                    return Err(Error::OverlappingRoots {
                        a: out[i].path.clone(),
                        b: out[j].path.clone(),
                    });
                }
            }
        }
        let mut exclude = Vec::new();
        for e in &self.exclude {
            let k = normalize_key(e, false)?;
            let root = k.split('/').next().unwrap();
            if !out.iter().any(|r| r.name == root) {
                return Err(Error::InvalidScope(format!(
                    "exclude {e:?} does not start with a root name"
                )));
            }
            exclude.push(k);
        }
        exclude.sort();
        exclude.dedup();
        let l = &self.limits;
        if l.max_files == 0 || l.max_total_bytes == 0 || l.max_file_bytes == 0 {
            return Err(Error::InvalidScope("limits must be non-zero".into()));
        }
        Ok(Scope {
            roots: out,
            exclude,
            limits: l.clone(),
            symlinks: self.symlinks,
            portable_names: self.portable_names,
        })
    }
}
