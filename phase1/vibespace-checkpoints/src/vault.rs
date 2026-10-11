//! The `Vault`: object store plus checkpoints, isolated copies, review and discard.

use crate::diff::{
    Change, ChangeKind, ChangeSet, ContentDiff, MAX_TEXT_DIFF_BYTES, Review, ReviewedChange,
    as_text, diff_manifests, unified_diff,
};
use crate::digest::{CheckpointId, Digest};
use crate::error::{Error, Result};
use crate::fsutil::{exec_bit, is_link_like, open_regular, write_atomic};
use crate::manifest::{FORMAT, Manifest, ScanOut, scan};
use crate::path::split_key;
use crate::scope::{Scope, ScopeRoot};
use crate::store::{CorruptEntry, ObjectStore};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};

/// Free-form run metadata stored inside the checkpoint (and therefore part of its identity).
/// Put things like run id, studio, goal or model here. Timestamps are deliberately not recorded
/// by this crate so that identical content and metadata give the identical checkpoint id.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunMetadata {
    pub run_id: Option<String>,
    pub label: Option<String>,
    pub extra: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckpointRecord {
    pub format: u32,
    pub manifest: Digest,
    pub scope: Scope,
    pub meta: RunMetadata,
}

#[derive(Clone, Debug)]
pub struct Checkpoint {
    pub id: CheckpointId,
    pub record: CheckpointRecord,
    pub manifest: Manifest,
}

/// A full copy of a checkpoint inside the vault. This is the only place an agent should write.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct IsolatedCopy {
    pub id: String,
    pub dir: PathBuf,
    pub baseline: CheckpointId,
    pub roots: Vec<String>,
    /// Expected digest of each root's marker file (root name -> digest). Empty if no marker was written.
    #[serde(default)]
    pub markers: BTreeMap<String, Digest>,
}

/// What to put into the `.vibespace-isolated` marker file of each root.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum MarkerPolicy {
    /// Write a small JSON document (format, isolated id, baseline, root name). Default.
    #[default]
    Default,
    /// Write exactly these bytes (for the policy layer's own marker format) into every root.
    Bytes(Vec<u8>),
    /// Do not write a marker (the caller creates it). No tamper check is possible then.
    None,
}

#[derive(Clone, Debug, Default)]
pub struct IsolatedCopyOptions {
    pub marker: MarkerPolicy,
}

impl IsolatedCopy {
    /// Working directory for one scope root.
    pub fn root_dir(&self, root: &str) -> PathBuf {
        self.dir.join(root)
    }
}

pub struct Vault {
    pub(crate) root: PathBuf,
    pub(crate) store: ObjectStore,
}

#[derive(Serialize, Deserialize)]
struct VaultFile {
    format: u32,
}

pub(crate) struct LockGuard(#[allow(dead_code)] File);

/// Join a manifest key's relative part onto a directory, component by component.
pub(crate) fn join_rel(dir: &Path, rel: &str) -> PathBuf {
    let mut p = dir.to_path_buf();
    for c in rel.split('/') {
        p.push(c);
    }
    p
}

pub(crate) fn key_path(roots: &[ScopeRoot], key: &str) -> Result<PathBuf> {
    let (root, rel) = split_key(key).ok_or_else(|| Error::path(key, "missing root name"))?;
    let r = roots
        .iter()
        .find(|r| r.name == root)
        .ok_or_else(|| Error::path(key, "unknown root"))?;
    Ok(join_rel(&r.path, rel))
}

fn valid_isolated_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("iso-") else {
        return false;
    };
    let Some((hex, n)) = rest.split_once('-') else {
        return false;
    };
    hex.len() == 12
        && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
        && !n.is_empty()
        && n.len() <= 9
        && n.bytes().all(|b| b.is_ascii_digit())
}

impl Vault {
    /// Open (creating if needed) a vault directory. The directory must not be inside, or contain,
    /// any scope root used with it.
    pub fn open(dir: impl AsRef<Path>) -> Result<Vault> {
        let dir = dir.as_ref();
        fs::create_dir_all(dir)
            .map_err(|e| Error::io(format!("create vault {}", dir.display()), e))?;
        let root = fs::canonicalize(dir).map_err(|e| Error::io("canonicalize vault", e))?;
        let vf = root.join("vault.json");
        if vf.exists() {
            let v: VaultFile = serde_json::from_slice(
                &fs::read(&vf).map_err(|e| Error::io("read vault.json", e))?,
            )
            .map_err(|e| Error::CorruptRecord(format!("vault.json: {e}")))?;
            if v.format != FORMAT {
                return Err(Error::Unsupported(format!("vault format {}", v.format)));
            }
        } else {
            write_atomic(
                &vf,
                &serde_json::to_vec(&VaultFile { format: FORMAT }).unwrap(),
            )?;
        }
        for d in ["isolated", "journals", "applies"] {
            fs::create_dir_all(root.join(d)).map_err(|e| Error::io(format!("create {d}"), e))?;
        }
        let store = ObjectStore::open(&root)?;
        Ok(Vault { root, store })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn store(&self) -> &ObjectStore {
        &self.store
    }

    pub(crate) fn lock(&self) -> Result<LockGuard> {
        let f = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.root.join("lock"))
            .map_err(|e| Error::io("open lock file", e))?;
        match f.try_lock() {
            Ok(()) => Ok(LockGuard(f)),
            Err(std::fs::TryLockError::WouldBlock) => Err(Error::Locked),
            Err(std::fs::TryLockError::Error(e)) => Err(Error::io("lock vault", e)),
        }
    }

    pub(crate) fn pending_journals(&self) -> Result<Vec<String>> {
        let mut v = Vec::new();
        for e in
            fs::read_dir(self.root.join("journals")).map_err(|e| Error::io("read journals", e))?
        {
            let e = e.map_err(|e| Error::io("read journals", e))?;
            let n = e.file_name().to_string_lossy().into_owned();
            if n.ends_with(".json") {
                v.push(n.trim_end_matches(".json").to_string());
            }
        }
        v.sort();
        Ok(v)
    }

    pub(crate) fn refuse_if_pending(&self) -> Result<()> {
        let p = self.pending_journals()?;
        if p.is_empty() {
            Ok(())
        } else {
            Err(Error::PendingRecovery(p))
        }
    }

    // ---------------------------------------------------------------- checkpoints

    /// Snapshot the scope (all regular files, losslessly) plus run metadata.
    /// Taking a checkpoint of unchanged content with identical metadata returns the same id and
    /// stores nothing new.
    pub fn checkpoint(&self, scope: &Scope, meta: RunMetadata) -> Result<CheckpointId> {
        self.refuse_if_pending()?;
        let scope = scope.validate(Some(&self.root))?;
        Ok(self.snapshot(&scope, meta)?.0)
    }

    /// `scope` must already be validated.
    pub(crate) fn snapshot(
        &self,
        scope: &Scope,
        meta: RunMetadata,
    ) -> Result<(CheckpointId, ScanOut)> {
        let out = scan(
            scope,
            &|n| {
                scope
                    .roots
                    .iter()
                    .find(|r| r.name == n)
                    .unwrap()
                    .path
                    .clone()
            },
            Some(&self.store),
        )?;
        let m = Manifest {
            format: FORMAT,
            entries: out.entries.clone(),
        };
        let mdig = self.store.put_bytes(&m.to_bytes())?;
        let rec = CheckpointRecord {
            format: FORMAT,
            manifest: mdig,
            scope: scope.clone(),
            meta,
        };
        let id = self
            .store
            .put_bytes(&serde_json::to_vec(&rec).expect("record serializes"))?;
        Ok((id, out))
    }

    /// Load and verify a checkpoint (record and manifest digests, key validity).
    pub fn load_checkpoint(&self, id: &CheckpointId) -> Result<Checkpoint> {
        let rec: CheckpointRecord = serde_json::from_slice(&self.store.get_bytes(id)?)
            .map_err(|e| Error::CorruptRecord(format!("checkpoint {id}: {e}")))?;
        if rec.format != FORMAT {
            return Err(Error::CorruptRecord(format!(
                "unsupported checkpoint format {}",
                rec.format
            )));
        }
        for r in &rec.scope.roots {
            crate::path::validate_root_name(&r.name)?;
        }
        let manifest = Manifest::from_bytes(
            &self.store.get_bytes(&rec.manifest)?,
            rec.scope.portable_names,
        )?;
        for k in manifest.entries.keys() {
            let root = split_key(k).map(|x| x.0).unwrap_or("");
            if !rec.scope.roots.iter().any(|r| r.name == root) {
                return Err(Error::CorruptRecord(format!(
                    "manifest key {k:?} has no matching root"
                )));
            }
        }
        Ok(Checkpoint {
            id: *id,
            record: rec,
            manifest,
        })
    }

    /// The recorded scope, re-validated against the disk: roots must still resolve to the same
    /// canonical directories.
    pub(crate) fn current_scope(&self, cp: &Checkpoint) -> Result<Scope> {
        let s = cp.record.scope.validate(Some(&self.root))?;
        for (a, b) in s.roots.iter().zip(&cp.record.scope.roots) {
            if a.path != b.path {
                return Err(Error::InvalidScope(format!(
                    "root {:?} now resolves to {}",
                    a.name,
                    a.path.display()
                )));
            }
        }
        Ok(s)
    }

    // ---------------------------------------------------------------- isolated copies

    /// Materialize a full copy of a checkpoint under `<vault>/isolated/<id>/<root name>/`.
    /// Contains no `.git`. The originals are never referenced by the copy.
    pub fn isolated_copy(&self, checkpoint: &CheckpointId) -> Result<IsolatedCopy> {
        self.isolated_copy_with(checkpoint, &IsolatedCopyOptions::default())
    }

    /// Like `isolated_copy`, with control over the marker file. Files are byte copies (no hard
    /// links, no reflinks): editing a file in the copy can never change an original or a store object.
    pub fn isolated_copy_with(
        &self,
        checkpoint: &CheckpointId,
        opts: &IsolatedCopyOptions,
    ) -> Result<IsolatedCopy> {
        let cp = self.load_checkpoint(checkpoint)?;
        let hex = checkpoint.to_hex();
        let base = self.root.join("isolated");
        let mut n = 1u32;
        let (id, dir) = loop {
            let id = format!("iso-{}-{n}", &hex[..12]);
            let dir = base.join(&id);
            match fs::create_dir(&dir) {
                Ok(()) => break (id, dir),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => n += 1,
                Err(e) => return Err(Error::io("create isolated dir", e)),
            }
        };
        let res = self
            .materialize(&cp, &dir)
            .and_then(|_| self.write_markers(&cp, &id, &dir, &opts.marker));
        let markers = match res {
            Ok(m) => m,
            Err(e) => {
                let _ = fs::remove_dir_all(&dir);
                return Err(e);
            }
        };
        let copy = IsolatedCopy {
            id: id.clone(),
            dir,
            baseline: *checkpoint,
            roots: cp
                .record
                .scope
                .roots
                .iter()
                .map(|r| r.name.clone())
                .collect(),
            markers,
        };
        let rec = serde_json::to_vec(&copy).unwrap();
        if let Err(e) = write_atomic(&base.join(format!("{id}.json")), &rec) {
            let _ = fs::remove_dir_all(&copy.dir);
            return Err(e);
        }
        Ok(copy)
    }

    fn write_markers(
        &self,
        cp: &Checkpoint,
        id: &str,
        dir: &Path,
        policy: &MarkerPolicy,
    ) -> Result<BTreeMap<String, Digest>> {
        let mut out = BTreeMap::new();
        for r in &cp.record.scope.roots {
            let bytes = match policy {
                MarkerPolicy::None => continue,
                MarkerPolicy::Bytes(b) => b.clone(),
                MarkerPolicy::Default => serde_json::to_vec(&serde_json::json!({
                    "format": 1, "isolated": id, "baseline": cp.id.to_hex(), "root": r.name
                }))
                .unwrap(),
            };
            let p = dir.join(&r.name).join(crate::MARKER_NAME);
            let mut f = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&p)
                .map_err(|e| Error::io("create marker", e))?;
            std::io::Write::write_all(&mut f, &bytes).map_err(|e| Error::io("write marker", e))?;
            f.sync_all().map_err(|e| Error::io("sync marker", e))?;
            drop(f);
            // best effort: read-only bit. Real protection is the sandbox policy, not file modes.
            if let Ok(md) = fs::metadata(&p) {
                let mut perm = md.permissions();
                perm.set_readonly(true);
                let _ = fs::set_permissions(&p, perm);
            }
            out.insert(r.name.clone(), Digest::of(&bytes));
        }
        Ok(out)
    }

    /// Roots whose marker file is missing, not a regular file, or changed.
    pub(crate) fn tampered_markers(&self, copy: &IsolatedCopy) -> Vec<String> {
        let mut bad = Vec::new();
        for (root, want) in &copy.markers {
            let p = copy.dir.join(root).join(crate::MARKER_NAME);
            let ok = fs::symlink_metadata(&p)
                .ok()
                .filter(|md| md.is_file() && !is_link_like(md))
                .and_then(|_| fs::read(&p).ok())
                .is_some_and(|b| Digest::of(&b) == *want);
            if !ok {
                bad.push(format!("{root}/{}", crate::MARKER_NAME));
            }
        }
        bad
    }

    fn materialize(&self, cp: &Checkpoint, dir: &Path) -> Result<()> {
        for r in &cp.record.scope.roots {
            fs::create_dir_all(dir.join(&r.name)).map_err(|e| Error::io("create root dir", e))?;
        }
        for (key, e) in &cp.manifest.entries {
            let (root, rel) = split_key(key).expect("validated");
            let target = join_rel(&dir.join(root), rel);
            if let Some(p) = target.parent() {
                fs::create_dir_all(p).map_err(|e| Error::io("create dir", e))?;
            }
            let mut f = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|e| Error::io(format!("create {}", target.display()), e))?;
            self.store.copy_to(&e.digest, &mut f)?;
            drop(f);
            set_exec(&target, e.exec)?;
        }
        Ok(())
    }

    /// Re-open a previously created isolated copy by id.
    pub fn open_isolated(&self, id: &str) -> Result<IsolatedCopy> {
        if !valid_isolated_id(id) {
            return Err(Error::UnknownIsolatedCopy(id.to_string()));
        }
        let p = self.root.join("isolated").join(format!("{id}.json"));
        let b = fs::read(&p).map_err(|_| Error::UnknownIsolatedCopy(id.to_string()))?;
        let c: IsolatedCopy = serde_json::from_slice(&b)
            .map_err(|e| Error::CorruptRecord(format!("isolated {id}: {e}")))?;
        if c.id != id || c.dir != self.root.join("isolated").join(id) {
            return Err(Error::CorruptRecord(format!(
                "isolated {id}: record does not match location"
            )));
        }
        Ok(c)
    }

    /// Delete an isolated copy and its record. Only ever removes `<vault>/isolated/<id>`; the
    /// original project is never touched. Returns false if it was already gone.
    pub fn discard(&self, copy: &IsolatedCopy) -> Result<bool> {
        self.discard_id(&copy.id)
    }

    /// Delete by validated private artifact id even when the isolated record is lost.
    pub fn discard_id(&self, id: &str) -> Result<bool> {
        if !valid_isolated_id(id) {
            return Err(Error::UnknownIsolatedCopy(id.to_string()));
        }
        // Do not trust the caller's struct for the path.
        let base = self.root.join("isolated");
        let dir = base.join(id);
        let rec = base.join(format!("{id}.json"));
        let existed = match fs::symlink_metadata(&dir) {
            Ok(md) => {
                if is_link_like(&md) || !md.is_dir() {
                    // a symlink here would be unlinked, never followed
                    fs::remove_file(&dir).map_err(|e| Error::io("remove bad isolated entry", e))?;
                } else {
                    fs::remove_dir_all(&dir).map_err(|e| Error::io("remove isolated copy", e))?;
                }
                true
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(e) => return Err(Error::io("stat isolated copy", e)),
        };
        match fs::remove_file(&rec) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(Error::io("remove isolated record", e)),
        }
        Ok(existed)
    }

    // ---------------------------------------------------------------- diff and review

    pub(crate) fn scan_isolated(&self, cp: &Checkpoint, copy: &IsolatedCopy) -> Result<ScanOut> {
        scan(&cp.record.scope, &|n| copy.dir.join(n), None)
    }

    /// Compare the baseline manifest with the current content of the isolated copy.
    pub fn diff(&self, baseline: &CheckpointId, copy: &IsolatedCopy) -> Result<ChangeSet> {
        if copy.baseline != *baseline {
            return Err(Error::BaselineMismatch {
                expected: *baseline,
                found: copy.baseline,
            });
        }
        let cp = self.load_checkpoint(baseline)?;
        let mut now = self.scan_isolated(&cp, copy)?;
        for p in self.tampered_markers(copy) {
            now.skipped.push(crate::manifest::Skipped {
                path: p,
                reason: "isolated-copy marker missing or modified (never applied)".into(),
            });
        }
        Ok(ChangeSet {
            baseline: *baseline,
            changes: diff_manifests(&cp.manifest.entries, &now.entries),
            skipped: now.skipped,
        })
    }

    /// Diff plus per-file content: unified text diff for UTF-8 files up to 1 MiB, metadata for
    /// everything else.
    pub fn review_changes(&self, baseline: &CheckpointId, copy: &IsolatedCopy) -> Result<Review> {
        let cs = self.diff(baseline, copy)?;
        let mut out = Vec::new();
        for c in cs.changes {
            let content = self.content_diff(&c, copy)?;
            out.push(ReviewedChange { change: c, content });
        }
        Ok(Review {
            baseline: *baseline,
            isolated_id: copy.id.clone(),
            changes: out,
            skipped: cs.skipped,
        })
    }

    fn content_diff(&self, c: &Change, copy: &IsolatedCopy) -> Result<ContentDiff> {
        if c.kind == ChangeKind::ModeChanged {
            return Ok(ContentDiff::ModeOnly {
                before_exec: c.before.as_ref().unwrap().exec,
                after_exec: c.after.as_ref().unwrap().exec,
            });
        }
        let binary = |note: &str| ContentDiff::Binary {
            before_size: c.before.as_ref().map(|e| e.size),
            after_size: c.after.as_ref().map(|e| e.size),
            before_digest: c.before.as_ref().map(|e| e.digest),
            after_digest: c.after.as_ref().map(|e| e.digest),
            note: note.to_string(),
        };
        let too_big = |e: &Option<crate::manifest::Entry>| {
            e.as_ref()
                .is_some_and(|e| e.size as usize > MAX_TEXT_DIFF_BYTES)
        };
        if too_big(&c.before) || too_big(&c.after) {
            return Ok(binary("too large for text diff"));
        }
        let before = match &c.before {
            Some(e) => Some(self.store.get_bytes(&e.digest)?),
            None => Some(Vec::new()),
        };
        let after = match &c.after {
            Some(e) => {
                let (root, rel) = split_key(&c.path).expect("validated");
                let p = join_rel(&copy.dir.join(root), rel);
                let md =
                    fs::symlink_metadata(&p).map_err(|_| Error::StaleReview(c.path.clone()))?;
                if is_link_like(&md) || !md.is_file() {
                    return Err(Error::StaleReview(c.path.clone()));
                }
                let (mut f, _) = open_regular(&p, &md, &c.path)
                    .map_err(|_| Error::StaleReview(c.path.clone()))?;
                let mut v = Vec::new();
                f.read_to_end(&mut v)
                    .map_err(|e| Error::io("read isolated file", e))?;
                if Digest::of(&v) != e.digest {
                    return Err(Error::StaleReview(c.path.clone()));
                }
                // Keep the reviewed bytes in immutable verified storage so native
                // projections never reopen mutable paths to display proposed text.
                self.store.put_bytes(&v)?;
                v
            }
            None => Vec::new(),
        };
        let (b, a) = (before.unwrap(), after);
        match (as_text(&b), as_text(&a)) {
            (Some(bt), Some(at)) => {
                let (old_l, new_l) = (
                    if c.before.is_some() {
                        format!("a/{}", c.path)
                    } else {
                        "/dev/null".into()
                    },
                    if c.after.is_some() {
                        format!("b/{}", c.path)
                    } else {
                        "/dev/null".into()
                    },
                );
                let (unified, added_lines, removed_lines) = unified_diff(bt, at, &old_l, &new_l);
                Ok(ContentDiff::Text {
                    unified,
                    added_lines,
                    removed_lines,
                })
            }
            _ => Ok(binary("binary or non-UTF-8 content")),
        }
    }

    /// Verify every object in the store. Empty result means the store is intact.
    pub fn verify_store(&self) -> Result<Vec<CorruptEntry>> {
        self.store.verify_all()
    }
}

pub(crate) fn set_exec(path: &Path, exec: bool) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let md = fs::metadata(path).map_err(|e| Error::io("stat", e))?;
        if exec_bit(&md) != exec {
            let mut p = md.permissions();
            let mode = p.mode();
            p.set_mode(if exec {
                mode | ((mode & 0o444) >> 2)
            } else {
                mode & !0o111
            });
            fs::set_permissions(path, p).map_err(|e| Error::io("chmod", e))?;
        }
    }
    #[cfg(not(unix))]
    let _ = (path, exec, exec_bit as fn(&fs::Metadata) -> bool);
    Ok(())
}
