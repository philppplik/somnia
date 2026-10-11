//! Local incident index. Never scans project folders or transports recovery capabilities.
use crate::diagnostics_types::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;
pub const MAX_REPORTS: usize = 10;
pub const MAX_AGE_SECS: u64 = 14 * 24 * 60 * 60;
pub const MAX_STORE_BYTES: u64 = 10 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Indexed {
    meta: CrashMeta,
    epoch: u64,
    file: String,
}
pub struct IncidentStore {
    dir: PathBuf,
    index: Vec<Indexed>,
    pub pruned: u64,
    pub corrupt: bool,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn io_err(_: std::io::Error) -> DiagnosticError {
    DiagnosticError::StoreCorrupt
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(io_err)?;
        f.write_all(bytes).map_err(io_err)?;
        f.sync_all().map_err(io_err)?;
        atomic_replace(&tmp, path).map_err(io_err)
    })();
    if result.is_err() {
        let _ = fs::remove_file(tmp);
    }
    result
}
impl IncidentStore {
    pub fn open(dir: impl Into<PathBuf>) -> Result<Self> {
        Self::open_at(dir, now())
    }
    pub fn open_at(dir: impl Into<PathBuf>, at: u64) -> Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir).map_err(io_err)?;
        let path = dir.join("index.json");
        let mut corrupt = false;
        let index: Vec<Indexed> = match fs::metadata(&path) {
            Ok(m) if m.len() <= 128 * 1024 => match fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
            {
                Some(i) => i,
                None => {
                    corrupt = true;
                    vec![]
                }
            },
            Ok(_) => {
                corrupt = true;
                vec![]
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => vec![],
            Err(_) => return Err(DiagnosticError::StoreCorrupt),
        };
        let mut store = Self {
            dir,
            index,
            pruned: 0,
            corrupt,
        };
        let before = store.index.len();
        store.index.retain(|i| {
            safe_identifier(&i.meta.incident_id)
                && i.file == format!("{}.json", i.meta.incident_id)
                && safe_error_id(&i.meta.error_id)
                && safe_timestamp(&i.meta.occurred_at)
                && i.meta
                    .reviewed_at
                    .as_deref()
                    .map(safe_timestamp)
                    .unwrap_or(true)
                && i.meta
                    .artifacts
                    .iter()
                    .all(|a| matches!(a.kind.as_str(), "incident" | "log"))
        });
        store.corrupt |= before != store.index.len();
        store.scan_panic_artifacts(at)?;
        store.prune(at)?;
        Ok(store)
    }
    fn persist(&self) -> Result<()> {
        atomic_write(
            &self.dir.join("index.json"),
            &serde_json::to_vec(&self.index).map_err(|_| DiagnosticError::StoreCorrupt)?,
        )
    }
    fn validate_ids(&self, ids: &[String]) -> Result<()> {
        if ids.len() > MAX_REPORTS
            || ids.iter().any(|id| {
                !safe_identifier(id) || !self.index.iter().any(|i| &i.meta.incident_id == id)
            })
        {
            return Err(DiagnosticError::InvalidInput);
        }
        Ok(())
    }
    pub fn list(&self) -> Vec<CrashMeta> {
        self.index
            .iter()
            .rev()
            .map(|i| {
                let mut meta = i.meta.clone();
                let valid = self.read_artifact(i).is_some();
                for a in &mut meta.artifacts {
                    a.available = valid;
                }
                // No producer exists yet. Stored or renderer supplied recovery assertions are not evidence.
                meta.recovery = unknown_recovery();
                meta.build = sanitize_build(meta.build);
                meta
            })
            .collect()
    }
    fn read_artifact(&self, i: &Indexed) -> Option<Value> {
        let path = self.dir.join(&i.file);
        let m = fs::symlink_metadata(&path).ok()?;
        if !m.is_file() || m.file_type().is_symlink() || m.len() > MAX_STORE_BYTES {
            return None;
        }
        let v: Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
        safe_event(v.get("entry")?)
    }
    pub fn details(&self, ids: &[String]) -> Result<Vec<Value>> {
        self.validate_ids(ids)?;
        Ok(self
            .index
            .iter()
            .filter(|i| ids.contains(&i.meta.incident_id))
            .filter_map(|i| self.read_artifact(i))
            .collect())
    }
    pub fn mark_reviewed(&mut self, ids: &[String]) -> Result<()> {
        self.validate_ids(ids)?;
        let ts = crate::applog::timestamp();
        for i in &mut self.index {
            if ids.contains(&i.meta.incident_id) {
                i.meta.reviewed_at = Some(ts.clone());
            }
        }
        self.persist()
    }
    pub fn delete(&mut self, ids: &[String]) -> Result<()> {
        self.validate_ids(ids)?;
        for i in &self.index {
            if ids.contains(&i.meta.incident_id) {
                match fs::remove_file(self.dir.join(&i.file)) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(_) => return Err(DiagnosticError::StoreCorrupt),
                }
            }
        }
        self.index.retain(|i| !ids.contains(&i.meta.incident_id));
        self.persist()
    }
    pub fn record_frontend_fatal(&mut self, entry: Value, build: BuildIdentity) -> Result<String> {
        self.record(entry, build, IncidentKind::FrontendFatal, now())
    }
    pub fn record(
        &mut self,
        entry: Value,
        build: BuildIdentity,
        kind: IncidentKind,
        at: u64,
    ) -> Result<String> {
        let entry = safe_event(&entry).ok_or(DiagnosticError::InvalidInput)?;
        if kind != IncidentKind::UncleanExit && entry["fatal"] != true {
            return Err(DiagnosticError::InvalidInput);
        }
        if kind == IncidentKind::FrontendFatal
            && !matches!(entry["id"].as_str(), Some("SOM-APP-001" | "SOM-DOC-002"))
        {
            return Err(DiagnosticError::InvalidInput);
        }
        if kind == IncidentKind::UncleanExit && entry["id"] != "SOM-APP-010" {
            return Err(DiagnosticError::InvalidInput);
        }
        if kind == IncidentKind::NativePanic && entry["id"] != "SOM-APP-009" {
            return Err(DiagnosticError::InvalidInput);
        }
        let id = Uuid::new_v4().to_string();
        let file = format!("{id}.json");
        let bytes = serde_json::to_vec(&serde_json::json!({"entry":entry}))
            .map_err(|_| DiagnosticError::InvalidInput)?;
        atomic_write(&self.dir.join(&file), &bytes)?;
        let build = sanitize_build(build);
        let meta = CrashMeta {
            incident_id: id.clone(),
            kind,
            occurred_at: crate::applog::format_ts(at as i64, 0),
            error_id: entry["id"].as_str().unwrap_or("SOM-APP-099").into(),
            reviewed_at: None,
            build,
            recovery: unknown_recovery(),
            artifacts: vec![Artifact {
                kind: "incident".into(),
                bytes: bytes.len() as u64,
                available: true,
            }],
        };
        self.index.push(Indexed {
            meta,
            epoch: at,
            file,
        });
        self.prune(at)?;
        Ok(id)
    }
    pub fn prune(&mut self, at: u64) -> Result<()> {
        self.index.sort_by_key(|i| i.epoch);
        let mut total: u64 = self
            .index
            .iter()
            .map(|i| {
                fs::symlink_metadata(self.dir.join(&i.file))
                    .map(|m| m.len())
                    .unwrap_or(0)
            })
            .sum();
        while !self.index.is_empty()
            && (self.index.len() > MAX_REPORTS
                || total > MAX_STORE_BYTES
                || at.saturating_sub(self.index[0].epoch) > MAX_AGE_SECS)
        {
            let i = self.index[0].clone();
            let p = self.dir.join(&i.file);
            let bytes = fs::symlink_metadata(&p).map(|m| m.len()).unwrap_or(0);
            match fs::remove_file(p) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(DiagnosticError::StoreCorrupt),
            }
            self.index.remove(0);
            total = total.saturating_sub(bytes);
            self.pruned += 1;
        }
        self.persist()
    }
    fn scan_panic_artifacts(&mut self, at: u64) -> Result<()> {
        let entries = fs::read_dir(&self.dir).map_err(io_err)?;
        for file in entries.flatten().take(100) {
            let name = file.file_name().to_string_lossy().into_owned();
            if !name.starts_with("panic-")
                || !name.ends_with(".json")
                || !file.file_type().map(|t| t.is_file()).unwrap_or(false)
            {
                continue;
            }
            let meta = file.metadata().map_err(io_err)?;
            let valid = if meta.len() <= 4096 {
                fs::read(file.path())
                    .ok()
                    .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                    .and_then(|v| safe_event(&v))
            } else {
                None
            };
            if let Some(v) = valid {
                let epoch = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(at);
                self.record(
                    v,
                    BuildIdentity::default(),
                    IncidentKind::NativePanic,
                    epoch,
                )?;
            } else {
                self.corrupt = true;
            }
            fs::remove_file(file.path()).map_err(io_err)?;
        }
        Ok(())
    }
}
pub fn sanitize_build(mut b: BuildIdentity) -> BuildIdentity {
    for value in [
        &mut b.release,
        &mut b.sha,
        &mut b.channel,
        &mut b.arch,
        &mut b.frontend_build,
    ] {
        if !safe_token(value) {
            *value = "unknown".into();
        }
    }
    b
}
#[cfg(test)]
mod tests {
    use super::*;
    fn event(seq: u64) -> Value {
        serde_json::json!({"v":2,"session":"s","source":"ts","seq":seq,"id":"SOM-DOC-002","ts":"2026-10-10T16:00:00.000Z","fatal":true})
    }
    #[test]
    fn startup_and_write_prune_and_review_is_explicit() {
        let d = tempfile::tempdir().unwrap();
        let mut s = IncidentStore::open_at(d.path(), 100).unwrap();
        for n in 0..11 {
            s.record(
                event(n),
                BuildIdentity::default(),
                IncidentKind::FrontendFatal,
                100 + n,
            )
            .unwrap();
        }
        assert_eq!(s.list().len(), 10);
        assert_eq!(s.pruned, 1);
        assert!(s.list().iter().all(|m| m.reviewed_at.is_none()));
        let id = s.list()[0].incident_id.clone();
        s.mark_reviewed(&[id.clone()]).unwrap();
        assert!(s
            .list()
            .iter()
            .find(|m| m.incident_id == id)
            .unwrap()
            .reviewed_at
            .is_some());
        assert!(s.delete(&["../secret".into()]).is_err());
        drop(s);
        assert!(IncidentStore::open_at(d.path(), MAX_AGE_SECS + 200)
            .unwrap()
            .list()
            .is_empty());
    }
    #[test]
    fn fatal_is_not_inferred_and_corruption_is_unavailable() {
        let d = tempfile::tempdir().unwrap();
        let mut s = IncidentStore::open_at(d.path(), 100).unwrap();
        let mut v = event(0);
        v["fatal"] = false.into();
        assert!(s
            .record(
                v,
                BuildIdentity::default(),
                IncidentKind::FrontendFatal,
                100
            )
            .is_err());
        let id = s
            .record(
                event(1),
                BuildIdentity::default(),
                IncidentKind::FrontendFatal,
                100,
            )
            .unwrap();
        fs::write(d.path().join(format!("{id}.json")), b"broken").unwrap();
        assert!(!s.list()[0].artifacts[0].available);
        assert_eq!(s.list()[0].recovery, unknown_recovery());
    }
    #[test]
    fn oversized_store_pruned_at_start() {
        let d = tempfile::tempdir().unwrap();
        let mut s = IncidentStore::open_at(d.path(), 100).unwrap();
        let id = s
            .record(
                event(1),
                BuildIdentity::default(),
                IncidentKind::FrontendFatal,
                100,
            )
            .unwrap();
        let f = fs::File::create(d.path().join(format!("{id}.json"))).unwrap();
        f.set_len(MAX_STORE_BYTES + 1).unwrap();
        drop(s);
        assert!(IncidentStore::open_at(d.path(), 101)
            .unwrap()
            .list()
            .is_empty());
    }
    #[test]
    fn unclean_exit_is_never_panic() {
        let d = tempfile::tempdir().unwrap();
        let mut s = IncidentStore::open_at(d.path(), 100).unwrap();
        let mut v = event(0);
        v["id"] = "SOM-APP-010".into();
        v["fatal"] = false.into();
        s.record(v, BuildIdentity::default(), IncidentKind::UncleanExit, 100)
            .unwrap();
        assert_eq!(s.list()[0].kind, IncidentKind::UncleanExit);
    }
}
