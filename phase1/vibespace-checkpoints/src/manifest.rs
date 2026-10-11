//! Manifests (path -> digest) and the filesystem scanner that builds them.

use crate::digest::Digest;
use crate::error::{Error, Result};
use crate::fsutil::{exec_bit, is_link_like, open_regular};
use crate::path::{CollisionTracker, MAX_DEPTH, component_problem, normalize_key, split_key};
use crate::scope::{Limits, Scope, SymlinkPolicy};
use crate::store::{ObjectStore, hash_reader};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const FORMAT: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub digest: Digest,
    pub size: u64,
    /// Unix executable bit (always false on Windows).
    pub exec: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub format: u32,
    pub entries: BTreeMap<String, Entry>,
}

impl Manifest {
    pub fn to_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("manifest serializes")
    }

    pub fn from_bytes(b: &[u8], portable: bool) -> Result<Manifest> {
        let m: Manifest = serde_json::from_slice(b)
            .map_err(|e| Error::CorruptRecord(format!("manifest: {e}")))?;
        if m.format != FORMAT {
            return Err(Error::CorruptRecord(format!(
                "unsupported manifest format {}",
                m.format
            )));
        }
        // A hostile or damaged store must not be able to smuggle traversal paths.
        for k in m.entries.keys() {
            normalize_key(k, portable)?;
            if split_key(k).is_none() {
                return Err(Error::path(k.as_str(), "missing root name"));
            }
        }
        crate::path::check_case_collisions(m.entries.keys().map(|s| s.as_str()))?;
        Ok(m)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Skipped {
    pub path: String,
    pub reason: String,
}

pub struct ScanOut {
    pub entries: BTreeMap<String, Entry>,
    pub skipped: Vec<Skipped>,
}

struct Walker<'a> {
    scope: &'a Scope,
    store: Option<&'a ObjectStore>,
    out: BTreeMap<String, Entry>,
    skipped: Vec<Skipped>,
    files: u64,
    bytes: u64,
    tracker: CollisionTracker,
}

/// Scan the scope's roots, where root `name` lives at `dir_of(name)`.
/// With `store = Some`, file contents are ingested; with `None` they are only hashed.
pub(crate) fn scan(
    scope: &Scope,
    dir_of: &dyn Fn(&str) -> PathBuf,
    store: Option<&ObjectStore>,
) -> Result<ScanOut> {
    let mut w = Walker {
        scope,
        store,
        out: BTreeMap::new(),
        skipped: vec![],
        files: 0,
        bytes: 0,
        tracker: CollisionTracker::new(),
    };
    for r in &scope.roots {
        let dir = dir_of(&r.name);
        let md = fs::symlink_metadata(&dir)
            .map_err(|e| Error::io(format!("stat root {}", dir.display()), e))?;
        if is_link_like(&md) || !md.is_dir() {
            return Err(Error::InvalidScope(format!(
                "root {:?} is not a plain directory at {}",
                r.name,
                dir.display()
            )));
        }
        w.walk(&dir, &r.name, 1)?;
    }
    Ok(ScanOut {
        entries: w.out,
        skipped: w.skipped,
    })
}

impl Walker<'_> {
    fn excluded(&self, key: &str) -> bool {
        self.scope
            .exclude
            .iter()
            .any(|e| key == e || (key.starts_with(e.as_str()) && key.as_bytes()[e.len()] == b'/'))
    }

    fn walk(&mut self, dir: &Path, prefix: &str, depth: usize) -> Result<()> {
        if depth > MAX_DEPTH {
            return Err(Error::path(prefix, "directory nesting too deep"));
        }
        let mut names = Vec::new();
        for e in
            fs::read_dir(dir).map_err(|e| Error::io(format!("read dir {}", dir.display()), e))?
        {
            let e = e.map_err(|e| Error::io(format!("read dir {}", dir.display()), e))?;
            let name = e.file_name().into_string().map_err(|n| {
                Error::path(
                    format!("{prefix}/{}", n.to_string_lossy()),
                    "file name is not valid UTF-8",
                )
            })?;
            names.push(name);
        }
        names.sort();
        for name in names {
            let key = format!("{prefix}/{name}");
            if name.eq_ignore_ascii_case(".git") {
                self.skipped.push(Skipped {
                    path: key,
                    reason: ".git is never captured".into(),
                });
                continue;
            }
            if name.eq_ignore_ascii_case(crate::MARKER_NAME) {
                self.skipped.push(Skipped {
                    path: key,
                    reason: "isolated-copy marker is never captured".into(),
                });
                continue;
            }
            if self.excluded(&key) {
                self.skipped.push(Skipped {
                    path: key,
                    reason: "excluded by scope".into(),
                });
                continue;
            }
            if let Some(p) = component_problem(&name, self.scope.portable_names) {
                return Err(Error::path(key, p));
            }
            let path = dir.join(&name);
            let md = fs::symlink_metadata(&path)
                .map_err(|e| Error::io(format!("stat {}", path.display()), e))?;
            if is_link_like(&md) {
                match self.scope.symlinks {
                    SymlinkPolicy::Reject => return Err(Error::Symlink(key)),
                    SymlinkPolicy::Skip => {
                        self.skipped.push(Skipped {
                            path: key,
                            reason: "symlink skipped".into(),
                        });
                        continue;
                    }
                }
            }
            let ft = md.file_type();
            if ft.is_dir() {
                self.walk(&path, &key, depth + 1)?;
            } else if ft.is_file() {
                self.file(&key, &path, &md)?;
            } else {
                return Err(Error::SpecialFile(key));
            }
        }
        Ok(())
    }

    fn file(&mut self, key: &str, path: &Path, lmd: &fs::Metadata) -> Result<()> {
        let Limits {
            max_files,
            max_total_bytes,
            max_file_bytes,
        } = self.scope.limits;
        self.files += 1;
        if self.files > max_files {
            return Err(Error::QuotaExceeded {
                what: "file count",
                limit: max_files,
                path: Some(key.into()),
            });
        }
        if lmd.len() > max_file_bytes {
            return Err(Error::QuotaExceeded {
                what: "file bytes",
                limit: max_file_bytes,
                path: Some(key.into()),
            });
        }
        if self.bytes + lmd.len() > max_total_bytes {
            return Err(Error::QuotaExceeded {
                what: "total bytes",
                limit: max_total_bytes,
                path: Some(key.into()),
            });
        }
        self.tracker.add_file(key)?;
        let (mut f, md) = open_regular(path, lmd, key)?;
        let cap = max_file_bytes.min(max_total_bytes - self.bytes);
        let (digest, n) = match self.store {
            Some(s) => s.put_reader(&mut f, cap),
            None => hash_reader(&mut f, cap),
        }
        .map_err(|e| match e {
            Error::QuotaExceeded {
                what,
                limit,
                path: None,
            } => Error::QuotaExceeded {
                what,
                limit,
                path: Some(key.into()),
            },
            e => e,
        })?;
        if n != lmd.len() {
            return Err(Error::ChangedDuringSnapshot(key.into()));
        }
        self.bytes += n;
        self.out.insert(
            key.to_string(),
            Entry {
                digest,
                size: n,
                exec: exec_bit(&md),
            },
        );
        Ok(())
    }
}
