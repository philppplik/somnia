//! Durable disable policy, independent of package data. Never uninstalls or auto-enables.
//! Only the verified index consumer in the trusted host may call block/clear.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlockRecord {
    pub version: String,
    pub reason_url: String,
    pub revision: u64,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Policy {
    revision: u64,
    blocked: BTreeMap<String, BlockRecord>,
}
pub struct BlockState {
    path: PathBuf,
    lock: Mutex<()>,
}
impl BlockState {
    pub fn new(app_data: &Path) -> Self {
        Self {
            path: app_data.join("extension-block-state.json"),
            lock: Mutex::new(()),
        }
    }
    fn read(&self) -> Result<Policy, String> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| "Extension block policy is unreadable".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Policy::default()),
            Err(e) => Err(e.to_string()),
        }
    }
    fn write(&self, p: &Policy) -> Result<(), String> {
        let parent = self.path.parent().ok_or("Invalid policy path")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let tmp = parent.join(format!(
            ".extension-block-state-{}.tmp",
            uuid::Uuid::new_v4()
        ));
        let result = (|| {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp)
                .map_err(|e| e.to_string())?;
            f.write_all(&serde_json::to_vec(p).map_err(|e| e.to_string())?)
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
        })();
        if result.is_err() {
            let _ = fs::remove_file(tmp);
        }
        result
    }
    /// Persist BEFORE destroying the runtime; a crash during disable must not reload it.
    pub fn block(&self, id: &str, record: BlockRecord) -> Result<(), String> {
        let _g = self.lock.lock().map_err(|_| "Block policy lock failed")?;
        if !crate::extension_activity::valid_id(id) {
            return Err("Invalid extension id".into());
        }
        let mut p = self.read()?;
        if record.revision < p.revision {
            return Err("Blocklist rollback".into());
        }
        if p.blocked.get(id).is_some_and(|old| {
            old.revision == record.revision
                && (old.version != record.version || old.reason_url != record.reason_url)
        }) {
            return Err("Conflicting blocklist revision".into());
        }
        p.revision = record.revision;
        p.blocked.insert(id.to_string(), record);
        self.write(&p)
    }
    /// Clearing policy NEVER changes installed enabled state. Use only after verified removal.
    pub fn clear(&self, id: &str, revision: u64) -> Result<(), String> {
        let _g = self.lock.lock().map_err(|_| "Block policy lock failed")?;
        let mut p = self.read()?;
        if revision < p.revision {
            return Err("Blocklist rollback".into());
        }
        p.revision = revision;
        p.blocked.remove(id);
        self.write(&p)
    }
    /// Every startup/enable/install/update load gate must consult this, regardless of engine.
    pub fn blocked(&self, id: &str, version: &str) -> Result<Option<BlockRecord>, String> {
        let _g = self.lock.lock().map_err(|_| "Block policy lock failed")?;
        Ok(self
            .read()?
            .blocked
            .get(id)
            .filter(|r| r.version == version)
            .cloned())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn survives_restart_rejects_rollback_clears_without_package_deletion() {
        let d = tempfile::tempdir().unwrap();
        let state = BlockState::new(d.path());
        fs::create_dir_all(d.path().join("extensions/test")).unwrap();
        fs::write(d.path().join("extensions/test/settings.json"), "keep").unwrap();
        state
            .block(
                "test",
                BlockRecord {
                    version: "1.0.0".into(),
                    reason_url: "https://example.org/security".into(),
                    revision: 2,
                },
            )
            .unwrap();
        let state = BlockState::new(d.path());
        assert!(state.blocked("test", "1.0.0").unwrap().is_some());
        assert!(state.clear("test", 1).is_err());
        assert!(state.blocked("test", "2.0.0").unwrap().is_none());
        state.clear("test", 3).unwrap();
        assert!(state.blocked("test", "1.0.0").unwrap().is_none());
        assert_eq!(
            fs::read_to_string(d.path().join("extensions/test/settings.json")).unwrap(),
            "keep"
        );
    }
}
