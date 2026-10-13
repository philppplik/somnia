//! Wiring seam between the guard ([`crate::deploy_guard`]) and the concrete deploy pieces.
//!
//! `build_service` is the only place that picks implementations. The SSH engine, the persistent
//! host-key store and the keychain key maker come from the foundation modules (`deploy::transport`,
//! `deploy::release`, `deploy::host_keys`, `deploy::keys`); until they are merged this seam uses
//! honest stand-ins: the engine and key maker report failure codes (no fake success), and pins are
//! session-only. Swapping them is a change inside this file only.
use crate::deploy_guard::{Action, DeployEngine, DeployService, EngineError, EnginePlan, HostKeyInfo, HostKeyPins, KeyMaker, Outcome};
use crate::deploy_targets::{FileTargets, Target};
use std::collections::BTreeMap;
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

pub struct UnwiredKeys;
impl KeyMaker for UnwiredKeys {
    fn exists(&self, _: &str) -> bool { false }
    fn create(&self, _: &str) -> Result<String, ()> { Err(()) }
    fn delete(&self, _: &str) {}
}

#[derive(Default)]
pub struct SessionPins(Mutex<BTreeMap<String, String>>);
fn pin_key(host: &str, port: u16) -> String { format!("{}:{port}", host.to_ascii_lowercase()) }
impl HostKeyPins for SessionPins {
    fn pinned(&self, host: &str, port: u16) -> Option<String> { self.0.lock().ok()?.get(&pin_key(host, port)).cloned() }
    fn pin(&self, host: &str, port: u16, fingerprint: &str) { if let Ok(mut m) = self.0.lock() { m.insert(pin_key(host, port), fingerprint.into()); } }
    fn replace(&self, host: &str, port: u16, fingerprint: &str) { self.pin(host, port, fingerprint) }
}

/// Targets are stored in `<config dir>/deploy-targets.json`.
pub fn build_service(config_dir: &Path) -> DeployService {
    DeployService::new(
        Box::new(FileTargets::new(config_dir.join("deploy-targets.json"))),
        Box::new(SessionPins::default()),
        Box::new(UnwiredKeys),
        Box::new(UnwiredEngine),
    )
}

pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy_guard::DeployError;
    use crate::deploy_targets::{key_slot_for, TargetKind};
    #[test]
    fn unwired_service_fails_closed_with_codes() {
        let dir = tempfile::tempdir().unwrap();
        let svc = build_service(dir.path());
        svc.target_save(Target { id: "a".into(), name: "A".into(), host: "example.org".into(), port: 22, user: "somnia".into(), domain: None, kind: TargetKind::Static, key_slot: key_slot_for("a"), spa: false, app_port: None }).unwrap();
        assert_eq!(svc.plan("a").unwrap_err(), DeployError::KeyMissing);
        assert_eq!(svc.key_create("a").unwrap_err(), DeployError::KeyBackend);
        assert_eq!(svc.confirm_issue(&"0".repeat(64), 0).unwrap_err(), DeployError::UnknownPlan);
        assert_eq!(svc.targets_list().unwrap().len(), 1);
    }
}
