//! Runtime adapters and wiring seam between the guard ([`crate::deploy_guard`]) and the concrete deploy pieces.
//!
//! `build_service` picks the embedded SSH engine, app-owned persistent pins and OS keychain.
//! No fallback writes credentials or trusts a host implicitly when storage is unavailable.
use crate::deploy_guard::{HostKeyPins, KeyMaker};
#[cfg(feature = "desktop")]
use crate::deploy_guard::DeployService;
#[cfg(feature = "desktop")]
use crate::deploy_targets::FileTargets;
use std::collections::BTreeMap;
#[cfg(feature = "desktop")]
use std::path::Path;
use std::sync::Mutex;

/// Shared OS-keychain adapter. Only public keys and existence cross the guard boundary.
pub struct RuntimeKeys<B: crate::oauth_store::SecretBackend>(pub std::sync::Arc<crate::deploy::keys::KeyStore<B>>);
fn target_from_slot(slot: &str) -> Result<&str, ()> {
    let id = slot.strip_prefix("deploy-key:").ok_or(())?;
    if !crate::deploy::manifest::valid_id(id) { return Err(()); }
    Ok(id)
}
impl<B: crate::oauth_store::SecretBackend> KeyMaker for RuntimeKeys<B> {
    fn exists(&self, slot: &str) -> bool { target_from_slot(slot).ok().is_some_and(|id| self.0.status(id).is_ok() || self.0.has_password(id)) }
    fn set_password(&self, slot: &str, password: &str) -> Result<(), ()> { self.0.set_password(target_from_slot(slot)?, password).map_err(|_| ()) }
    fn create(&self, slot: &str) -> Result<String, ()> { self.0.create(target_from_slot(slot)?).map(|s| s.public_key).map_err(|_| ()) }
    fn public_key(&self, slot: &str) -> Result<String, ()> { self.0.status(target_from_slot(slot)?).map(|s| s.public_key).map_err(|_| ()) }
    fn delete(&self, slot: &str) { if let Ok(id) = target_from_slot(slot) { let _ = self.0.delete(id); } }
}
/// Pin mutation uses the exact algorithm observed by a credential-free probe.
/// The guard re-probes immediately before calling pin/replace.
pub struct RuntimePins {
    pub store: std::sync::Arc<crate::deploy::host_keys::HostKeyStore>,
    pub observed: std::sync::Arc<Mutex<BTreeMap<String, crate::deploy::host_keys::HostKey>>>,
}
fn pin_key(host: &str, port: u16) -> String { format!("{}:{port}", host.to_ascii_lowercase()) }
impl HostKeyPins for RuntimePins {
    fn pinned(&self, host: &str, port: u16) -> Option<String> { self.store.pinned_key(host, port).ok().flatten().map(|p| p.fingerprint) }
    fn pin(&self, host: &str, port: u16, fingerprint: &str) {
        if let Ok(seen) = self.observed.lock() {
            if let Some(key) = seen.get(&pin_key(host, port)).filter(|k| k.fingerprint == fingerprint) {
                let _ = self.store.trust_new(host, port, key);
            }
        }
    }
    fn replace(&self, host: &str, port: u16, fingerprint: &str) {
        if let (Ok(Some(old)), Ok(seen)) = (self.store.pinned_key(host, port), self.observed.lock()) {
            if let Some(key) = seen.get(&pin_key(host, port)).filter(|k| k.fingerprint == fingerprint) {
                let _ = self.store.replace_confirmed(host, port, &old, key);
            }
        }
    }
}
#[cfg(feature = "desktop")]
pub type DesktopNodeAdmin = crate::deploy::node_admin::NodeAdmin<crate::deploy::node_host::DesktopNodeHost<crate::deploy::keys::OsKeychainBackend>>;
#[cfg(feature = "desktop")]
static NODE_ADMIN: std::sync::OnceLock<std::sync::Arc<DesktopNodeAdmin>> = std::sync::OnceLock::new();
/// Available once [`build_service`] has run (every deploy command goes through it first).
#[cfg(feature = "desktop")]
pub fn node_admin() -> Option<std::sync::Arc<DesktopNodeAdmin>> { NODE_ADMIN.get().cloned() }
/// No fallback to a disk credential or session-only pin when storage fails.
#[cfg(feature = "desktop")]
pub fn build_service(config_dir: &Path, source: crate::deploy::engine::ProjectSource) -> Result<DeployService, crate::deploy_guard::DeployError> {
    let store = std::sync::Arc::new(crate::deploy::host_keys::HostKeyStore::open(config_dir.join("deploy-host-keys.json")).map_err(|_| crate::deploy_guard::DeployError::Storage)?);
    let keys = std::sync::Arc::new(crate::deploy::keys::KeyStore::new(crate::deploy::keys::OsKeychainBackend));
    let observed: crate::deploy::engine::ObservedKeys = Default::default();
    let host = crate::deploy::node_host::DesktopNodeHost {
        keys: keys.clone(),
        pins: store.clone(),
        project_root: { let source = source.clone(); Box::new(move |_| source.lock().ok().and_then(|g| g.clone())) },
        options: Default::default(),
        public_probe: Box::new(crate::deploy::node_host::https_probe),
    };
    let node = std::sync::Arc::new(crate::deploy::node_engine::NodeEngine::new(host, Default::default()).map_err(|_| crate::deploy_guard::DeployError::Storage)?);
    // The same engine serves publishing (through the live engine) and the app-settings commands.
    let admin = crate::deploy::node_admin::NodeAdmin { engine: node.clone(), targets: Box::new(FileTargets::new(config_dir.join("deploy-targets.json"))) };
    let _ = NODE_ADMIN.set(std::sync::Arc::new(admin));
    let ftp = crate::deploy::ftp_engine::FtpEngine::new(keys.clone(), store.clone(), observed.clone(), source.clone());
    let engine = crate::deploy::engine::LiveDeployEngine::new(keys.clone(), store.clone(), observed.clone(), source).with_node_engine(Box::new(node));
    // FTP targets take the FTP engine; every other target kind goes to the SSH engine unchanged.
    let engine = crate::deploy::ftp_engine::RoutingEngine { ssh: Box::new(engine), ftp: Box::new(ftp) };
    Ok(DeployService::new(
        Box::new(FileTargets::new(config_dir.join("deploy-targets.json"))),
        Box::new(RuntimePins { store, observed }),
        Box::new(RuntimeKeys(keys)),
        Box::new(engine),
    ))
}

pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::{host_keys::{HostKey, HostKeyStore}, keys::KeyStore};
    #[test]
    fn keys_are_shared_public_only_and_slot_bound() {
        let keys = std::sync::Arc::new(KeyStore::new(crate::oauth_store::MemoryBackend::default()));
        let adapter = RuntimeKeys(keys.clone());
        let public = adapter.create("deploy-key:site").unwrap();
        assert!(public.starts_with("ssh-ed25519 "));
        assert!(adapter.exists("deploy-key:site"));
        assert_eq!(keys.status("site").unwrap().public_key, public);
        assert!(adapter.create("other:site").is_err());
        assert!(adapter.create("deploy-key:../site").is_err());
        adapter.delete("deploy-key:site");
        assert!(!adapter.exists("deploy-key:site"));
    }
    #[test]
    fn pins_persist_observed_algorithm_and_replace_only_observed_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pins.json");
        let key = HostKey { algorithm: "ssh-ed25519".into(), fingerprint: format!("SHA256:{}", "a".repeat(43)) };
        let adapter = RuntimePins { store: std::sync::Arc::new(HostKeyStore::open(&path).unwrap()), observed: Default::default() };
        adapter.pin("example.com", 22, &key.fingerprint);
        assert_eq!(adapter.pinned("example.com", 22), None);
        adapter.observed.lock().unwrap().insert(pin_key("example.com", 22), key.clone());
        adapter.pin("example.com", 22, &key.fingerprint);
        assert_eq!(HostKeyStore::open(&path).unwrap().pinned_key("example.com", 22).unwrap(), Some(key));
    }
}
