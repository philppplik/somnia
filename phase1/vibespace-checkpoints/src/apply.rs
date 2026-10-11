//! Explicit apply, restore and crash recovery.
//!
//! Safety model (see docs/vibespace/checkpoints.md):
//! * Nothing is written to the originals until conflicts are ruled out against a fresh
//!   pre-apply checkpoint.
//! * Writes go through a journal. Each file is replaced atomically (stage file in the same
//!   directory, then rename, or hard link for new files so an existing file is never clobbered).
//! * There is NO global atomicity. If a step fails, already written files are rolled back by
//!   inspecting the actual file state, never overwriting something the user changed meanwhile.
//!   If the process dies, `Vault::recover` finishes the rollback.

use crate::diff::{Change, ChangeKind, Review};
use crate::digest::{CheckpointId, Digest};
use crate::error::{Conflict, ConflictKind, Error, Result, RollbackReport};
use crate::fsutil::{exec_bit, is_link_like, open_regular, sync_dir, unique_name, write_atomic};
use crate::manifest::{Entry, FORMAT};
use crate::path::{check_case_collisions, split_key};
use crate::scope::ScopeRoot;
use crate::store::hash_reader;
use crate::vault::{IsolatedCopy, RunMetadata, Vault, key_path, set_exec};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub enum Selection {
    /// Every change in the review.
    All,
    /// Only these snapshot keys (`"<root>/<rel>"`), each of which must appear in the review.
    Paths(Vec<String>),
}

/// Failure injection for tests. Not part of the stable API.
#[doc(hidden)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Inject {
    /// Return an error before operation `n` runs (normal rollback follows).
    FailBeforeOp(usize),
    /// Return an error right after operation `n` was written (normal rollback follows).
    FailAfterOp(usize),
    /// Stop dead before operation `n` without rollback, like a killed process.
    CrashBeforeOp(usize),
}

#[derive(Clone, Debug, Default)]
pub struct ApplyOptions {
    #[doc(hidden)]
    pub inject: Option<Inject>,
}

pub struct ApplyRequest<'a> {
    /// The baseline checkpoint the caller believes the isolated copy was made from.
    pub expected_baseline: CheckpointId,
    pub copy: &'a IsolatedCopy,
    /// The review the user looked at.
    pub review: &'a Review,
    pub selection: Selection,
    pub options: ApplyOptions,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApplyReport {
    pub id: String,
    /// Checkpoint of the originals taken right before applying. `restore` it to undo.
    pub preapply_checkpoint: CheckpointId,
    pub applied: Vec<String>,
    /// Selected changes whose result was already present in the originals; left alone.
    pub already_applied: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct RestoreOptions {
    /// Also delete files that exist in scope now but not in the checkpoint. Default false:
    /// restore only rewrites or recreates files and never deletes the user's other files.
    pub remove_extra: bool,
    #[doc(hidden)]
    pub inject: Option<Inject>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RestoreReport {
    pub id: String,
    pub preapply_checkpoint: CheckpointId,
    pub restored: Vec<String>,
    pub removed: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct RecoveryReport {
    /// Journals that were rolled back or finalized and removed.
    pub resolved: Vec<String>,
    pub rollbacks: Vec<(String, RollbackReport)>,
    /// Journals that could not be resolved; they stay in place.
    pub failed: Vec<(String, String)>,
}

// ------------------------------------------------------------------ journal

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
enum State {
    Prepared,
    Committed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Op {
    key: String,
    prior: Option<Entry>,
    /// None = delete.
    new: Option<Entry>,
    created_dirs: Vec<String>,
    stage: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Journal {
    format: u32,
    id: String,
    kind: String,
    preapply: Digest,
    roots: Vec<ScopeRoot>,
    ops: Vec<Op>,
    state: State,
}

struct PlanItem {
    key: String,
    prior: Option<Entry>,
    new: Option<Entry>,
}

#[derive(Debug, PartialEq, Eq)]
enum FileState {
    Absent,
    File(Digest, bool),
    Other,
}

fn file_state(path: &Path) -> Result<FileState> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileState::Absent),
        Err(e) => Err(Error::io(format!("stat {}", path.display()), e)),
        Ok(md) if is_link_like(&md) || !md.is_file() => Ok(FileState::Other),
        Ok(md) => {
            let (mut f, md2) = open_regular(path, &md, "")?;
            let (d, _) = hash_reader(&mut f, u64::MAX)?;
            Ok(FileState::File(d, exec_bit(&md2)))
        }
    }
}

fn entry_matches(st: &FileState, e: &Option<Entry>) -> bool {
    match (st, e) {
        (FileState::Absent, None) => true,
        (FileState::File(d, x), Some(e)) => *d == e.digest && *x == e.exec,
        _ => false,
    }
}

fn conflict(path: &str, kind: ConflictKind, detail: &str) -> Conflict {
    Conflict {
        path: path.to_string(),
        kind,
        detail: detail.to_string(),
    }
}

/// Walk the parent directories of `root/rel`. Refuses symlinked or non-directory parents.
/// Returns the directories (as keys) that do not exist yet and are not already in `planned`.
fn check_parents(
    root_dir: &Path,
    root_name: &str,
    rel: &str,
    planned: &mut HashSet<String>,
) -> std::result::Result<Vec<String>, Conflict> {
    let comps: Vec<&str> = rel.split('/').collect();
    let mut cur = root_dir.to_path_buf();
    let mut acc = root_name.to_string();
    let mut missing = false;
    let mut created = Vec::new();
    let full = format!("{root_name}/{rel}");
    for c in &comps[..comps.len() - 1] {
        cur.push(c);
        acc.push('/');
        acc.push_str(c);
        if !missing {
            match fs::symlink_metadata(&cur) {
                Ok(md) if is_link_like(&md) => {
                    return Err(conflict(
                        &full,
                        ConflictKind::SymlinkedParent,
                        &format!("{acc} is a symlink"),
                    ));
                }
                Ok(md) if !md.is_dir() => {
                    return Err(conflict(
                        &full,
                        ConflictKind::NotRegularFile,
                        &format!("{acc} is not a directory"),
                    ));
                }
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => missing = true,
                Err(e) => {
                    return Err(conflict(
                        &full,
                        ConflictKind::NotRegularFile,
                        &format!("stat {acc}: {e}"),
                    ));
                }
            }
        }
        if planned.insert(acc.clone()) {
            created.push(acc.clone());
        }
    }
    Ok(created)
}

#[cfg(unix)]
fn open_new(path: &Path, exec: bool) -> std::io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(if exec { 0o777 } else { 0o666 })
        .open(path)
}
#[cfg(not(unix))]
fn open_new(path: &Path, _exec: bool) -> std::io::Result<fs::File> {
    OpenOptions::new().write(true).create_new(true).open(path)
}

fn ctx(what: &str, p: &Path) -> String {
    format!("{what} {}", p.display())
}

impl Vault {
    fn write_stage(&self, stage: &Path, e: &Entry, mode_from: Option<&fs::Metadata>) -> Result<()> {
        let res = (|| -> Result<()> {
            let mut f =
                open_new(stage, e.exec).map_err(|x| Error::io(ctx("create stage", stage), x))?;
            self.store.copy_to(&e.digest, &mut f)?;
            f.flush().map_err(|x| Error::io("flush stage", x))?;
            f.sync_all().map_err(|x| Error::io("sync stage", x))?;
            drop(f);
            if let Some(md) = mode_from {
                // keep the replaced file's permission bits, adjusting only the exec bit
                let _ = fs::set_permissions(stage, md.permissions());
            }
            set_exec(stage, e.exec)
        })();
        if res.is_err() {
            let _ = fs::remove_file(stage);
        }
        res
    }

    /// Move `stage` to `target`. With `expect_absent` an existing target is never replaced.
    fn install(&self, stage: &Path, target: &Path, expect_absent: bool, key: &str) -> Result<()> {
        if expect_absent {
            match fs::hard_link(stage, target) {
                Ok(()) => {
                    let _ = fs::remove_file(stage);
                    return Ok(());
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    let _ = fs::remove_file(stage);
                    return Err(Error::Conflicts(vec![conflict(
                        key,
                        ConflictKind::AlreadyExists,
                        "appeared during apply",
                    )]));
                }
                Err(_) => {
                    // filesystem without hard links: fall back to check + rename
                    if fs::symlink_metadata(target).is_ok() {
                        let _ = fs::remove_file(stage);
                        return Err(Error::Conflicts(vec![conflict(
                            key,
                            ConflictKind::AlreadyExists,
                            "appeared during apply",
                        )]));
                    }
                }
            }
        }
        if let Err(e) = fs::rename(stage, target) {
            let _ = fs::remove_file(stage);
            return Err(Error::io(ctx("replace", target), e));
        }
        if let Some(d) = target.parent() {
            sync_dir(d);
        }
        Ok(())
    }

    fn journal_path(&self, id: &str) -> PathBuf {
        self.root.join("journals").join(format!("{id}.json"))
    }

    fn write_journal(&self, j: &Journal) -> Result<()> {
        write_atomic(
            &self.journal_path(&j.id),
            &serde_json::to_vec_pretty(j).unwrap(),
        )?;
        sync_dir(&self.root.join("journals"));
        Ok(())
    }

    fn remove_journal(&self, id: &str) -> Result<()> {
        fs::remove_file(self.journal_path(id)).map_err(|e| Error::io("remove journal", e))?;
        sync_dir(&self.root.join("journals"));
        Ok(())
    }

    fn plan_ops(
        &self,
        roots: &[ScopeRoot],
        items: Vec<PlanItem>,
        id: &str,
    ) -> std::result::Result<Vec<Op>, Vec<Conflict>> {
        let mut items = items;
        // deletions first (so a case-only rename works on case-insensitive filesystems), then writes
        items.sort_by(|a, b| (a.new.is_some(), &a.key).cmp(&(b.new.is_some(), &b.key)));
        let mut planned = HashSet::new();
        let mut conflicts = Vec::new();
        let mut ops = Vec::new();
        for (i, it) in items.into_iter().enumerate() {
            let (root, rel) = split_key(&it.key).expect("validated key");
            let rd = &roots
                .iter()
                .find(|r| r.name == root)
                .expect("known root")
                .path;
            match check_parents(rd, root, rel, &mut planned) {
                Ok(created) => ops.push(Op {
                    key: it.key,
                    prior: it.prior,
                    new: it.new,
                    created_dirs: created,
                    stage: format!(".somnia-stage-{id}-{i}"),
                }),
                Err(c) => conflicts.push(c),
            }
        }
        if conflicts.is_empty() {
            Ok(ops)
        } else {
            Err(conflicts)
        }
    }

    fn execute_op(&self, roots: &[ScopeRoot], op: &Op) -> Result<()> {
        let target = key_path(roots, &op.key)?;
        let (root, rel) = split_key(&op.key).unwrap();
        let rd = &roots.iter().find(|r| r.name == root).unwrap().path;
        // re-check parents right before writing; they may have changed since planning
        let create = check_parents(rd, root, rel, &mut HashSet::new())
            .map_err(|c| Error::Conflicts(vec![c]))?;
        for d in &create {
            let p = key_path(roots, d)?;
            match fs::create_dir(&p) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    let md = fs::symlink_metadata(&p).map_err(|e| Error::io("stat dir", e))?;
                    if is_link_like(&md) || !md.is_dir() {
                        return Err(Error::Conflicts(vec![conflict(
                            &op.key,
                            ConflictKind::SymlinkedParent,
                            d,
                        )]));
                    }
                }
                Err(e) => return Err(Error::io(ctx("create dir", &p), e)),
            }
        }
        let st = file_state(&target)?;
        if !entry_matches(&st, &op.prior) {
            let (kind, detail) = match st {
                FileState::Absent => (ConflictKind::DeletedSinceBaseline, "file disappeared"),
                FileState::Other => (ConflictKind::NotRegularFile, "target is not a regular file"),
                FileState::File(..) if op.prior.is_none() => {
                    (ConflictKind::AlreadyExists, "file appeared")
                }
                FileState::File(..) => (
                    ConflictKind::ModifiedSinceBaseline,
                    "file changed during apply",
                ),
            };
            return Err(Error::Conflicts(vec![conflict(&op.key, kind, detail)]));
        }
        match &op.new {
            None => fs::remove_file(&target).map_err(|e| Error::io(ctx("delete", &target), e)),
            Some(n) => {
                let stage = target.with_file_name(&op.stage);
                let md = if op.prior.is_some() {
                    fs::metadata(&target).ok()
                } else {
                    None
                };
                self.write_stage(&stage, n, md.as_ref())?;
                self.install(&stage, &target, op.prior.is_none(), &op.key)
            }
        }
    }

    fn execute(&self, j: &Journal, inject: Option<Inject>) -> Result<()> {
        for (i, op) in j.ops.iter().enumerate() {
            match inject {
                Some(Inject::CrashBeforeOp(n)) if n == i => return Err(Error::InjectedCrash),
                Some(Inject::FailBeforeOp(n)) if n == i => return Err(Error::InjectedFailure),
                _ => {}
            }
            self.execute_op(&j.roots, op)?;
            if inject == Some(Inject::FailAfterOp(i)) {
                return Err(Error::InjectedFailure);
            }
        }
        match inject {
            Some(Inject::CrashBeforeOp(n)) if n >= j.ops.len() => Err(Error::InjectedCrash),
            Some(Inject::FailBeforeOp(n)) if n >= j.ops.len() => Err(Error::InjectedFailure),
            _ => Ok(()),
        }
    }

    fn cleanup_stages(&self, j: &Journal) {
        for op in &j.ops {
            if let Ok(t) = key_path(&j.roots, &op.key) {
                let _ = fs::remove_file(t.with_file_name(&op.stage));
            }
        }
    }

    /// Put every touched path back to its pre-apply state, but only where the file still looks
    /// like what this apply produced. Anything else is left alone and reported.
    fn rollback(&self, j: &Journal) -> RollbackReport {
        let mut rep = RollbackReport::default();
        for op in j.ops.iter().rev() {
            let target = match key_path(&j.roots, &op.key) {
                Ok(t) => t,
                Err(e) => {
                    rep.failures.push(format!("{}: {e}", op.key));
                    continue;
                }
            };
            let _ = fs::remove_file(target.with_file_name(&op.stage));
            let st = match file_state(&target) {
                Ok(s) => s,
                Err(e) => {
                    rep.failures.push(format!("{}: {e}", op.key));
                    continue;
                }
            };
            if entry_matches(&st, &op.new) {
                // we wrote this: revert it
                let r = match &op.prior {
                    None => {
                        fs::remove_file(&target).map_err(|e| Error::io(ctx("remove", &target), e))
                    }
                    Some(p) => {
                        let stage = target.with_file_name(format!("{}.rb", op.stage));
                        let md = fs::metadata(&target).ok();
                        self.write_stage(&stage, p, md.as_ref()).and_then(|_| {
                            self.install(&stage, &target, matches!(st, FileState::Absent), &op.key)
                        })
                    }
                };
                match r {
                    Ok(()) => rep.reverted.push(op.key.clone()),
                    Err(e) => rep.failures.push(format!("{}: {e}", op.key)),
                }
            } else if entry_matches(&st, &op.prior) {
                // never touched
            } else {
                rep.preserved.push(op.key.clone());
            }
        }
        for op in j.ops.iter().rev() {
            for d in op.created_dirs.iter().rev() {
                if let Ok(p) = key_path(&j.roots, d) {
                    let _ = fs::remove_dir(p); // only succeeds when empty
                }
            }
        }
        rep
    }

    fn run_plan(
        &self,
        kind: &str,
        id: String,
        preapply: Digest,
        roots: &[ScopeRoot],
        items: Vec<PlanItem>,
        inject: Option<Inject>,
    ) -> Result<()> {
        let ops = self.plan_ops(roots, items, &id).map_err(Error::Conflicts)?;
        let mut j = Journal {
            format: FORMAT,
            id,
            kind: kind.into(),
            preapply,
            roots: roots.to_vec(),
            ops,
            state: State::Prepared,
        };
        self.write_journal(&j)?;
        match self.execute(&j, inject) {
            Ok(()) => {}
            Err(Error::InjectedCrash) => return Err(Error::InjectedCrash),
            Err(cause) => {
                let rollback = self.rollback(&j);
                if rollback.failures.is_empty() {
                    self.remove_journal(&j.id)?;
                }
                return Err(Error::ApplyFailed {
                    cause: Box::new(cause),
                    rollback,
                });
            }
        }
        j.state = State::Committed;
        self.write_journal(&j)?;
        self.cleanup_stages(&j);
        let summary = serde_json::json!({
            "id": j.id, "kind": j.kind, "preapply": j.preapply.to_hex(),
            "paths": j.ops.iter().map(|o| o.key.clone()).collect::<Vec<_>>()
        });
        write_atomic(
            &self.root.join("applies").join(format!("{}.json", j.id)),
            summary.to_string().as_bytes(),
        )?;
        self.remove_journal(&j.id)
    }

    /// Apply selected reviewed changes from an isolated copy to the original project.
    ///
    /// Order of events: validate the request, copy the selected result files into the object
    /// store (verifying they still equal what was reviewed), checkpoint the originals, compare
    /// them against the baseline and refuse on any conflict (nothing is written), then write
    /// through the journal.
    pub fn explicit_apply(&self, req: &ApplyRequest<'_>) -> Result<ApplyReport> {
        let _guard = self.lock()?;
        self.refuse_if_pending()?;
        let expected = req.expected_baseline;
        if req.copy.baseline != expected {
            return Err(Error::BaselineMismatch {
                expected,
                found: req.copy.baseline,
            });
        }
        if req.review.baseline != expected {
            return Err(Error::BaselineMismatch {
                expected,
                found: req.review.baseline,
            });
        }
        if req.review.isolated_id != req.copy.id {
            return Err(Error::UnknownIsolatedCopy(req.review.isolated_id.clone()));
        }
        let real = self.open_isolated(&req.copy.id)?;
        // the recorded markers are authoritative, not the caller's struct
        if let Some(p) = self.tampered_markers(&real).into_iter().next() {
            return Err(Error::IsolatedTampered(p));
        }
        let base = self.load_checkpoint(&expected)?;

        let reviewed: BTreeMap<&str, &Change> = req
            .review
            .changes
            .iter()
            .map(|r| (r.change.path.as_str(), &r.change))
            .collect();
        let selected: Vec<&Change> = match &req.selection {
            Selection::All => reviewed.values().copied().collect(),
            Selection::Paths(ps) => {
                let mut set = BTreeSet::new();
                for p in ps {
                    if !reviewed.contains_key(p.as_str()) {
                        return Err(Error::UnknownSelection(p.clone()));
                    }
                    set.insert(p.as_str());
                }
                set.into_iter().map(|p| reviewed[p]).collect()
            }
        };
        if selected.is_empty() {
            return Err(Error::EmptySelection);
        }
        // Reviewed changes must be consistent with the baseline manifest.
        for c in &selected {
            if base.manifest.entries.get(&c.path) != c.before.as_ref() {
                return Err(Error::StaleReview(c.path.clone()));
            }
        }

        // 1. Pull the result files into the object store, verifying them against the review.
        let limit = base.record.scope.limits.max_file_bytes;
        for c in &selected {
            let Some(after) = &c.after else { continue };
            let (root, rel) =
                split_key(&c.path).ok_or_else(|| Error::path(c.path.as_str(), "no root"))?;
            let p = crate::vault::join_rel(&real.dir.join(root), rel);
            let stale = || Error::StaleReview(c.path.clone());
            let md = fs::symlink_metadata(&p).map_err(|_| stale())?;
            if is_link_like(&md) || !md.is_file() {
                return Err(stale());
            }
            let (mut f, md2) = open_regular(&p, &md, &c.path).map_err(|_| stale())?;
            let (d, _) = self.store.put_reader(&mut f, limit)?;
            if d != after.digest || exec_bit(&md2) != after.exec {
                return Err(stale());
            }
        }

        // 2. Backup checkpoint of the originals, and conflict detection against it.
        let scope = self.current_scope(&base)?;
        let apply_id = unique_name("apply");
        let mut meta = RunMetadata {
            label: Some("pre-apply".into()),
            ..Default::default()
        };
        meta.extra.insert("kind".into(), "pre-apply".into());
        meta.extra.insert("isolated".into(), real.id.clone());
        meta.extra.insert("apply".into(), apply_id.clone());
        let (pre_id, cur) = self.snapshot(&scope, meta)?;
        let cur = cur.entries;

        let mut conflicts = Vec::new();
        let mut items = Vec::new();
        let mut already = Vec::new();
        for c in &selected {
            let now = cur.get(&c.path);
            match c.kind {
                ChangeKind::Added => match now {
                    None => items.push(PlanItem {
                        key: c.path.clone(),
                        prior: None,
                        new: c.after.clone(),
                    }),
                    Some(e) if Some(e) == c.after.as_ref() => already.push(c.path.clone()),
                    Some(_) => conflicts.push(conflict(
                        &c.path,
                        ConflictKind::AlreadyExists,
                        "a different file exists in the original",
                    )),
                },
                ChangeKind::Modified | ChangeKind::ModeChanged => match now {
                    Some(e) if Some(e) == c.before.as_ref() => items.push(PlanItem {
                        key: c.path.clone(),
                        prior: now.cloned(),
                        new: c.after.clone(),
                    }),
                    Some(e) if Some(e) == c.after.as_ref() => already.push(c.path.clone()),
                    Some(_) => conflicts.push(conflict(
                        &c.path,
                        ConflictKind::ModifiedSinceBaseline,
                        "original changed since the baseline",
                    )),
                    None => conflicts.push(conflict(
                        &c.path,
                        ConflictKind::DeletedSinceBaseline,
                        "original was removed since the baseline",
                    )),
                },
                ChangeKind::Deleted => match now {
                    None => already.push(c.path.clone()),
                    Some(e) if Some(e) == c.before.as_ref() => items.push(PlanItem {
                        key: c.path.clone(),
                        prior: now.cloned(),
                        new: None,
                    }),
                    Some(_) => conflicts.push(conflict(
                        &c.path,
                        ConflictKind::ModifiedSinceBaseline,
                        "original changed since the baseline",
                    )),
                },
            }
        }
        if !conflicts.is_empty() {
            return Err(Error::Conflicts(conflicts));
        }
        // 3. The resulting tree must not contain case collisions.
        {
            let mut result: BTreeSet<&str> = cur.keys().map(|s| s.as_str()).collect();
            for it in &items {
                if it.new.is_none() {
                    result.remove(it.key.as_str());
                }
            }
            for it in &items {
                if it.new.is_some() {
                    result.insert(it.key.as_str());
                }
            }
            check_case_collisions(result.iter().copied())?;
        }
        let applied: Vec<String> = items.iter().map(|i| i.key.clone()).collect();
        if !items.is_empty() {
            self.run_plan(
                "apply",
                apply_id.clone(),
                pre_id,
                &scope.roots,
                items,
                req.options.inject,
            )?;
        }
        Ok(ApplyReport {
            id: apply_id,
            preapply_checkpoint: pre_id,
            applied,
            already_applied: already,
        })
    }

    /// Bring the original scope back to a checkpoint (for example the `preapply_checkpoint` of an
    /// apply). A new checkpoint of the current state is taken first, so a restore can itself be
    /// undone. Files that exist now but not in the checkpoint are kept unless `remove_extra`.
    pub fn restore(
        &self,
        checkpoint: &CheckpointId,
        opts: &RestoreOptions,
    ) -> Result<RestoreReport> {
        let _guard = self.lock()?;
        self.refuse_if_pending()?;
        let cp = self.load_checkpoint(checkpoint)?;
        let scope = self.current_scope(&cp)?;
        let id = unique_name("restore");
        let mut meta = RunMetadata {
            label: Some("pre-restore".into()),
            ..Default::default()
        };
        meta.extra.insert("kind".into(), "pre-restore".into());
        meta.extra.insert("restore-of".into(), checkpoint.to_hex());
        meta.extra.insert("restore".into(), id.clone());
        let (pre_id, cur) = self.snapshot(&scope, meta)?;
        let cur = cur.entries;
        let mut items = Vec::new();
        let (mut restored, mut removed) = (Vec::new(), Vec::new());
        let mut checked = HashSet::new();
        for (k, t) in &cp.manifest.entries {
            if cur.get(k) == Some(t) {
                continue;
            }
            if checked.insert(t.digest) {
                self.store.verify(&t.digest)?; // refuse before touching anything
            }
            restored.push(k.clone());
            items.push(PlanItem {
                key: k.clone(),
                prior: cur.get(k).cloned(),
                new: Some(t.clone()),
            });
        }
        if opts.remove_extra {
            for (k, c) in &cur {
                if !cp.manifest.entries.contains_key(k) {
                    removed.push(k.clone());
                    items.push(PlanItem {
                        key: k.clone(),
                        prior: Some(c.clone()),
                        new: None,
                    });
                }
            }
        }
        {
            let mut result: BTreeSet<&str> = cur.keys().map(|s| s.as_str()).collect();
            for it in items.iter().filter(|i| i.new.is_none()) {
                result.remove(it.key.as_str());
            }
            for it in items.iter().filter(|i| i.new.is_some()) {
                result.insert(it.key.as_str());
            }
            check_case_collisions(result.iter().copied())?;
        }
        if !items.is_empty() {
            self.run_plan(
                "restore",
                id.clone(),
                pre_id,
                &scope.roots,
                items,
                opts.inject,
            )?;
        }
        Ok(RestoreReport {
            id,
            preapply_checkpoint: pre_id,
            restored,
            removed,
        })
    }

    /// Resolve interrupted apply/restore operations: committed ones are finalized, uncommitted
    /// ones are rolled back (never overwriting files the user changed since).
    pub fn recover(&self) -> Result<RecoveryReport> {
        let _guard = self.lock()?;
        let mut rep = RecoveryReport::default();
        for id in self.pending_journals()? {
            let parsed = fs::read(self.journal_path(&id))
                .map_err(|e| e.to_string())
                .and_then(|b| serde_json::from_slice::<Journal>(&b).map_err(|e| e.to_string()));
            let j = match parsed {
                Ok(j) if j.format == FORMAT && j.id == id => j,
                Ok(_) => {
                    rep.failed
                        .push((id, "unsupported or mismatching journal".into()));
                    continue;
                }
                Err(e) => {
                    rep.failed.push((id, e));
                    continue;
                }
            };
            // journal keys come from our own writes, but never trust them blindly
            if j.ops.iter().any(|o| {
                crate::path::normalize_key(&o.key, false).is_err() || split_key(&o.key).is_none()
            }) {
                rep.failed
                    .push((id, "journal contains an invalid path".into()));
                continue;
            }
            match j.state {
                State::Committed => {
                    self.cleanup_stages(&j);
                    self.remove_journal(&id)?;
                    rep.resolved.push(id);
                }
                State::Prepared => {
                    let rb = self.rollback(&j);
                    self.cleanup_stages(&j);
                    if rb.failures.is_empty() {
                        self.remove_journal(&id)?;
                        rep.resolved.push(id.clone());
                    } else {
                        rep.failed.push((id.clone(), rb.failures.join("; ")));
                    }
                    rep.rollbacks.push((id, rb));
                }
            }
        }
        Ok(rep)
    }
}
