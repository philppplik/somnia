//! Wiring seam between the guard ([`crate::deploy_guard`]) and the concrete deploy pieces.
//!
//! `build_service` is the only place that picks implementations. The SSH engine, the persistent
//! host-key store and the keychain key maker come from the foundation modules (`deploy::transport`,
//! `deploy::release`, `deploy::host_keys`, `deploy::keys`); until they are merged this seam uses
//! honest stand-ins: the engine and key maker report failure codes (no fake success), and pins are
//! session-only. Swapping them is a change inside this file only.
use crate::deploy_guard::{Action, DeployEngine, DeployService, EngineError, EnginePlan, HostKeyInfo, HostKeyPins, KeyMaker, Outcome};
use crate::deploy_targets::Target;
#[cfg(feature = "desktop")]
use crate::deploy_targets::FileTargets;
use std::collections::BTreeMap;
#[cfg(feature = "desktop")]
use std::path::Path;
use std::sync::Mutex;

pub struct UnwiredEngine;
impl DeployEngine for UnwiredEngine {
    fn plan(&self, _: &Target, _: Action, _: Option<&str>) -> Result<EnginePlan, EngineError> { Err(EngineError::Other) }
    fn probe_host_key(&self, _: &Target) -> Result<HostKeyInfo, EngineError> { Err(EngineError::Other) }
    fn publish(&self, _: &Target, _: &EnginePlan, _: &dyn Fn(&str)) -> Result<Outcome, EngineError> { Err(EngineError::Other) }
    fn rollback(&self, _: &Target, _: &EnginePlan, _: &dyn Fn(&str)) -> Result<Outcome, EngineError> { Err(EngineError::Other) }
    fn releases(&self, _: &Target) -> Result<Vec<String>, EngineError> { Err(EngineError::Other) }
}

/// Shared OS-keychain adapter. Only public keys and existence cross the guard boundary.
pub struct RuntimeKeys<B: crate::oauth_store::SecretBackend>(pub std::sync::Arc<crate::deploy::keys::KeyStore<B>>);
fn target_from_slot(slot: &str) -> Result<&str, ()> {
    let id = slot.strip_prefix("deploy-key:").ok_or(())?;
    if !crate::deploy::manifest::valid_id(id) { return Err(()); }
    Ok(id)
}
impl<B: crate::oauth_store::SecretBackend> KeyMaker for RuntimeKeys<B> {
    fn exists(&self, slot: &str) -> bool { target_from_slot(slot).ok().is_some_and(|id| self.0.status(id).is_ok()) }
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
/// No fallback to a disk credential or session-only pin when storage fails.
#[cfg(feature = "desktop")]
pub fn build_service(config_dir: &Path) -> Result<DeployService, crate::deploy_guard::DeployError> {
    let store = std::sync::Arc::new(crate::deploy::host_keys::HostKeyStore::open(config_dir.join("deploy-host-keys.json")).map_err(|_| crate::deploy_guard::DeployError::Storage)?);
    let keys = std::sync::Arc::new(crate::deploy::keys::KeyStore::new(crate::deploy::keys::OsKeychainBackend));
    Ok(DeployService::new(
        Box::new(FileTargets::new(config_dir.join("deploy-targets.json"))),
        Box::new(RuntimePins { store, observed: Default::default() }),
        Box::new(RuntimeKeys(keys)),
        Box::new(UnwiredEngine),
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
