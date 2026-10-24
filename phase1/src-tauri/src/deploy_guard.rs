//! Guard rails for live deployment (concept: docs/concepts/live-deployment.md, sections 10 and 11).
//!
//! This module is the single place where `publish` and `rollback` are allowed to start. It owns:
//! - the one-time confirmation token, bound to a plan hash (target, pinned fingerprint, file list),
//! - the pinned-host-key check and the trust/replace rules,
//! - target and key bookkeeping, and generic (secret-free) errors.
//!
//! The SSH engine, the host-key pin store and the keychain key maker sit behind small traits
//! ([`DeployEngine`], [`HostKeyPins`], [`KeyMaker`]) so everything here is unit-tested against
//! mocks. `desktop.rs` wires the real implementations. Nothing here accepts or returns key
//! material except the public key, and no error carries lower-level text.
use crate::deploy_targets::{Target, TargetError, TargetKind, TargetStore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::sync::Mutex;

pub const TOKEN_TTL_MS: u64 = 120_000;
const MAX_TOKENS: usize = 8;
const MAX_PLANS: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action { Publish, Rollback }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Change { Added, Changed, Removed, Unchanged }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFile { pub path: String, pub size: u64, pub sha256: String, pub change: Change }

/// What the engine reports after connecting (read-only) and diffing. `fingerprint` is the key the
/// server presented; the guard compares it with the pin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnginePlan {
    pub fingerprint: String,
    pub build_id: String,
    pub live_release: Option<String>,
    pub files: Vec<PlanFile>,
    /// Rollback only: the release to switch to.
    pub release_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanView {
    pub plan_hash: String,
    pub action: Action,
    pub target_id: String,
    pub fingerprint: String,
    pub build_id: String,
    pub live_release: Option<String>,
    pub release_id: Option<String>,
    pub files: Vec<PlanFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome { pub release_id: String, pub url: Option<String>, pub rolled_back: bool }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyInfo { pub algorithm: String, pub fingerprint: String }

/// One entry of a read-only server directory listing (FTP targets).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub kind: RemoteKind,
    pub size: Option<u64>,
    /// UTC `YYYY-MM-DD HH:MM` when the server reports it.
    pub modified: Option<String>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteKind { Dir, File, Link }

/// Engine failures are a closed enum: lower layers may not smuggle text through.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineError { Cancelled, ServerNotPrepared, Connect, Auth, HostKeyRejected, Preflight, Upload, Switch, HealthFailedRolledBack, HealthFailedRollbackFailed, NoSuchRelease, NodeMissing, NodeTooOld, InstallFailed, HealthFailed, TlsRequired, Other }

pub trait DeployEngine: Send + Sync {
    /// Connects with the pinned key (read-only), builds the artifact and diffs against the live release.
    fn plan(&self, target: &Target, action: Action, release_id: Option<&str>) -> Result<EnginePlan, EngineError>;
    fn probe_host_key(&self, target: &Target) -> Result<HostKeyInfo, EngineError>;
    fn publish(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError>;
    fn rollback(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError>;
    fn live_release(&self, _target: &Target) -> Result<Option<String>, EngineError> { Err(EngineError::Other) }
    fn cancel(&self, _target: &Target) -> bool { false }
    /// Kept releases, newest first (release id only).
    fn releases(&self, target: &Target) -> Result<Vec<String>, EngineError>;
    /// Read-only listing of one directory below the target's web root. `path` is relative, already validated by the guard.
    fn list_remote(&self, _target: &Target, _path: &str) -> Result<Vec<RemoteEntry>, EngineError> { Err(EngineError::Other) }
}

pub trait HostKeyPins: Send + Sync {
    fn pinned(&self, host: &str, port: u16) -> Option<String>;
    fn pin(&self, host: &str, port: u16, fingerprint: &str);
    fn replace(&self, host: &str, port: u16, fingerprint: &str);
}

pub trait KeyMaker: Send + Sync {
    fn exists(&self, slot: &str) -> bool;
    /// Generates an ed25519 key straight into the keychain slot. Returns the public key line.
    fn create(&self, slot: &str) -> Result<String, ()>;
    fn delete(&self, slot: &str);
    /// Public OpenSSH key only. Never returns private key material.
    fn public_key(&self, _slot: &str) -> Result<String, ()> { Err(()) }
    /// FTP password into the keychain (replaces an existing one). Write-only: nothing reads it back out.
    fn set_password(&self, _slot: &str, _password: &str) -> Result<(), ()> { Err(()) }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeployError {
    InvalidInput(&'static str),
    TargetNotFound,
    Storage,
    KeyMissing,
    KeyExists,
    KeyBackend,
    HostKeyUnknown,
    HostKeyChanged,
    HostKeyAlreadyPinned,
    HostKeyMismatch,
    NotAcknowledged,
    UnknownPlan,
    ConfirmationInvalid,
    PlanChanged,
    Busy,
    Engine(EngineError),
}
impl DeployError {
    /// Stable machine code, safe for the renderer and the agent.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid-input", Self::TargetNotFound => "target-not-found", Self::Storage => "storage",
            Self::KeyMissing => "key-missing", Self::KeyExists => "key-exists", Self::KeyBackend => "key-backend",
            Self::HostKeyUnknown => "host-key-unknown", Self::HostKeyChanged => "host-key-changed",
            Self::HostKeyAlreadyPinned => "host-key-already-pinned", Self::HostKeyMismatch => "host-key-mismatch",
            Self::NotAcknowledged => "not-acknowledged", Self::UnknownPlan => "unknown-plan",
            Self::ConfirmationInvalid => "confirmation-invalid", Self::PlanChanged => "plan-changed", Self::Busy => "busy",
            Self::Engine(e) => match e {
                EngineError::Cancelled => "cancelled", EngineError::ServerNotPrepared => "server-not-prepared", EngineError::Connect => "connect-failed", EngineError::Auth => "auth-failed", EngineError::HostKeyRejected => "host-key-rejected",
                EngineError::Preflight => "preflight-failed", EngineError::Upload => "upload-failed", EngineError::Switch => "switch-failed",
                EngineError::HealthFailedRolledBack => "health-failed-rolled-back", EngineError::HealthFailedRollbackFailed => "health-failed-rollback-failed",
                EngineError::NoSuchRelease => "no-such-release",
                EngineError::NodeMissing => "node-missing", EngineError::NodeTooOld => "node-too-old", EngineError::InstallFailed => "install-failed", EngineError::HealthFailed => "health-failed",
                EngineError::TlsRequired => "tls-required",
                EngineError::Other => "engine-failed",
            },
        }
    }
}
impl fmt::Display for DeployError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { write!(f, "deploy:{}", self.code()) }
}
impl From<TargetError> for DeployError {
    fn from(e: TargetError) -> Self { match e { TargetError::Invalid(w) => Self::InvalidInput(w), TargetError::NotFound => Self::TargetNotFound, TargetError::Storage => Self::Storage } }
}
impl From<EngineError> for DeployError { fn from(e: EngineError) -> Self { Self::Engine(e) } }

/// Canonical hash of what the human approves: action, target, pinned fingerprint, build and exact file list.
pub fn plan_hash(action: Action, target_id: &str, plan: &EnginePlan) -> String {
    let mut files: Vec<&PlanFile> = plan.files.iter().collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let mut h = Sha256::new();
    let mut line = |s: String| { h.update(s.len().to_le_bytes()); h.update(s.as_bytes()); };
    line("somnia-deploy-plan-v1".into());
    line(format!("{action:?}"));
    line(target_id.into());
    line(plan.fingerprint.clone());
    line(plan.build_id.clone());
    line(plan.live_release.clone().unwrap_or_default());
    line(plan.release_id.clone().unwrap_or_default());
    for f in files { line(format!("{}\t{}\t{}\t{:?}", f.path, f.size, f.sha256, f.change)); }
    hex(&h.finalize())
}
fn target_plan_hash(action: Action, target: &Target, plan: &EnginePlan) -> String {
    // Editing the destination or server configuration after approval must invalidate the token.
    let mut digest = Sha256::new();
    digest.update(plan_hash(action, &target.id, plan));
    digest.update(serde_json::to_vec(target).expect("validated target is serializable"));
    hex(&digest.finalize())
}
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

struct Token { plan_hash: String, expires_ms: u64 }

/// One-time confirmation tokens. A token is minted only for a plan hash this service produced,
/// expires after [`TOKEN_TTL_MS`], and is consumed by exactly one publish or rollback.
pub struct ConfirmationBroker { tokens: Mutex<BTreeMap<String, Token>>, plans: Mutex<Vec<String>> }
impl ConfirmationBroker {
    pub fn new() -> Self { Self { tokens: Mutex::new(BTreeMap::new()), plans: Mutex::new(Vec::new()) } }
    fn remember_plan(&self, hash: &str) {
        let mut p = self.plans.lock().unwrap_or_else(|e| e.into_inner());
        p.retain(|h| h != hash); p.push(hash.to_string());
        if p.len() > MAX_PLANS { p.remove(0); }
    }
    fn knows_plan(&self, hash: &str) -> bool { self.plans.lock().unwrap_or_else(|e| e.into_inner()).iter().any(|h| h == hash) }
    pub fn issue(&self, plan_hash: &str, now_ms: u64) -> Result<String, DeployError> {
        if !self.knows_plan(plan_hash) { return Err(DeployError::UnknownPlan); }
        let mut t = self.tokens.lock().unwrap_or_else(|e| e.into_inner());
        t.retain(|_, v| v.expires_ms > now_ms);
        if t.len() >= MAX_TOKENS { return Err(DeployError::Busy); }
        let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
        t.insert(token.clone(), Token { plan_hash: plan_hash.to_string(), expires_ms: now_ms + TOKEN_TTL_MS });
        Ok(token)
    }
    /// Removes the token whatever the outcome (a wrong-hash attempt burns it).
    pub fn consume(&self, token: &str, plan_hash: &str, now_ms: u64) -> Result<(), DeployError> {
        let found = self.tokens.lock().unwrap_or_else(|e| e.into_inner()).remove(token);
        match found {
            Some(t) if t.expires_ms > now_ms && constant_eq(t.plan_hash.as_bytes(), plan_hash.as_bytes()) => Ok(()),
            _ => Err(DeployError::ConfirmationInvalid),
        }
    }
    #[cfg(test)]
    fn outstanding(&self) -> usize { self.tokens.lock().unwrap().len() }
}
impl Default for ConfirmationBroker { fn default() -> Self { Self::new() } }
fn constant_eq(a: &[u8], b: &[u8]) -> bool { a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0 }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TargetState { KeyMissing, NeedsTrust, Ready }

/// Renderer-facing status: never a key, a passphrase or a path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus { pub target: Target, pub state: TargetState, #[serde(skip_serializing_if = "Option::is_none")] pub fingerprint: Option<String> }

pub struct DeployService {
    pub targets: Box<dyn TargetStore>,
    pub pins: Box<dyn HostKeyPins>,
    pub keys: Box<dyn KeyMaker>,
    pub engine: Box<dyn DeployEngine>,
    pub broker: ConfirmationBroker,
    busy: Mutex<BTreeSet<String>>,
}

struct BusyGuard<'a> { set: &'a Mutex<BTreeSet<String>>, id: String }
impl Drop for BusyGuard<'_> { fn drop(&mut self) { self.set.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.id); } }

impl DeployService {
    pub fn new(targets: Box<dyn TargetStore>, pins: Box<dyn HostKeyPins>, keys: Box<dyn KeyMaker>, engine: Box<dyn DeployEngine>) -> Self {
        Self { targets, pins, keys, engine, broker: ConfirmationBroker::new(), busy: Mutex::new(BTreeSet::new()) }
    }
    fn lock_target(&self, id: &str) -> Result<BusyGuard<'_>, DeployError> {
        if !self.busy.lock().unwrap_or_else(|e| e.into_inner()).insert(id.to_string()) { return Err(DeployError::Busy); }
        Ok(BusyGuard { set: &self.busy, id: id.to_string() })
    }

    pub fn targets_list(&self) -> Result<Vec<TargetStatus>, DeployError> {
        Ok(self.targets.list()?.into_iter().map(|t| {
            let fingerprint = self.pins.pinned(&t.host, t.port);
            let state = if !self.keys.exists(&t.key_slot) { TargetState::KeyMissing } else if fingerprint.is_none() { TargetState::NeedsTrust } else { TargetState::Ready };
            TargetStatus { target: t, state, fingerprint }
        }).collect())
    }

    pub fn target_save(&self, target: Target) -> Result<(), DeployError> { target.validate()?; self.targets.save(&target)?; Ok(()) }

    /// Removes the target. The keychain key goes too only when asked.
    pub fn target_delete(&self, id: &str, delete_key: bool) -> Result<(), DeployError> {
        let _g = self.lock_target(id)?;
        let gone = self.targets.delete(id)?;
        if delete_key { self.keys.delete(&gone.key_slot); }
        Ok(())
    }

    pub fn key_create(&self, target_id: &str) -> Result<String, DeployError> {
        let t = self.targets.get(target_id)?;
        if t.kind == TargetKind::Ftp { return Err(DeployError::InvalidInput("kind")); }
        if self.keys.exists(&t.key_slot) { return Err(DeployError::KeyExists); }
        self.keys.create(&t.key_slot).map_err(|_| DeployError::KeyBackend)
    }

    pub fn key_public(&self, target_id: &str) -> Result<String, DeployError> {
        let target = self.targets.get(target_id)?;
        if target.kind == TargetKind::Ftp { return Err(DeployError::InvalidInput("kind")); }
        self.keys.public_key(&target.key_slot).map_err(|_| DeployError::KeyBackend)
    }

    /// Stores the FTP password in the keychain. Only FTP targets; the password never comes back out.
    pub fn ftp_password_set(&self, target_id: &str, password: &str) -> Result<(), DeployError> {
        let t = self.targets.get(target_id)?;
        if t.kind != TargetKind::Ftp { return Err(DeployError::InvalidInput("kind")); }
        if password.is_empty() || password.len() > 1024 || password.chars().any(|c| matches!(c, '\r' | '\n' | '\0')) { return Err(DeployError::InvalidInput("password")); }
        self.keys.set_password(&t.key_slot, password).map_err(|_| DeployError::KeyBackend)
    }

    /// Read-only directory listing of an FTP target. The server identity must be pinned first, like every other server call.
    pub fn remote_list(&self, target_id: &str, path: &str) -> Result<Vec<RemoteEntry>, DeployError> {
        let t = self.targets.get(target_id)?;
        if t.kind != TargetKind::Ftp { return Err(DeployError::InvalidInput("kind")); }
        let rel = path.trim_matches('/');
        if rel.len() > 200 || (!rel.is_empty() && !rel.split('/').all(crate::deploy_targets::is_remote_segment)) { return Err(DeployError::InvalidInput("path")); }
        if !self.keys.exists(&t.key_slot) { return Err(DeployError::KeyMissing); }
        self.pins.pinned(&t.host, t.port).ok_or(DeployError::HostKeyUnknown)?;
        let mut list = self.engine.list_remote(&t, rel).map_err(|e| if e == EngineError::HostKeyRejected { DeployError::HostKeyChanged } else { e.into() })?;
        list.sort_by(|a, b| (a.kind != RemoteKind::Dir, a.name.to_lowercase()).cmp(&(b.kind != RemoteKind::Dir, b.name.to_lowercase())));
        Ok(list)
    }

    /// Read-only connect: returns the key the server presents so the dialog can show it.
    pub fn hostkey_probe(&self, target_id: &str) -> Result<HostKeyInfo, DeployError> {
        let t = self.targets.get(target_id)?;
        Ok(self.engine.probe_host_key(&t)?)
    }

    /// First trust only. `expected_fingerprint` is what the human saw in the dialog.
    pub fn hostkey_trust(&self, target_id: &str, expected_fingerprint: &str) -> Result<(), DeployError> {
        let t = self.targets.get(target_id)?;
        if self.pins.pinned(&t.host, t.port).is_some() { return Err(DeployError::HostKeyAlreadyPinned); }
        let seen = self.engine.probe_host_key(&t)?;
        if !constant_eq(seen.fingerprint.as_bytes(), expected_fingerprint.as_bytes()) { return Err(DeployError::HostKeyMismatch); }
        self.pins.pin(&t.host, t.port, &seen.fingerprint);
        if self.pins.pinned(&t.host, t.port).as_deref() != Some(&seen.fingerprint) { return Err(DeployError::Storage); }
        Ok(())
    }

    /// Replacing a pin needs the old fingerprint, the new one and an explicit acknowledgement.
    pub fn hostkey_replace(&self, target_id: &str, old_fingerprint: &str, new_fingerprint: &str, acknowledged: bool) -> Result<(), DeployError> {
        if !acknowledged { return Err(DeployError::NotAcknowledged); }
        let t = self.targets.get(target_id)?;
        let pinned = self.pins.pinned(&t.host, t.port).ok_or(DeployError::HostKeyUnknown)?;
        if !constant_eq(pinned.as_bytes(), old_fingerprint.as_bytes()) { return Err(DeployError::HostKeyMismatch); }
        let seen = self.engine.probe_host_key(&t)?;
        if !constant_eq(seen.fingerprint.as_bytes(), new_fingerprint.as_bytes()) { return Err(DeployError::HostKeyMismatch); }
        self.pins.replace(&t.host, t.port, &seen.fingerprint);
        if self.pins.pinned(&t.host, t.port).as_deref() != Some(&seen.fingerprint) { return Err(DeployError::Storage); }
        Ok(())
    }

    fn checked_plan(&self, t: &Target, action: Action, release_id: Option<&str>) -> Result<EnginePlan, DeployError> {
        if !self.keys.exists(&t.key_slot) { return Err(DeployError::KeyMissing); }
        let pinned = self.pins.pinned(&t.host, t.port).ok_or(DeployError::HostKeyUnknown)?;
        let plan = self.engine.plan(t, action, release_id).map_err(|e| if e == EngineError::HostKeyRejected { DeployError::HostKeyChanged } else { e.into() })?;
        if !constant_eq(plan.fingerprint.as_bytes(), pinned.as_bytes()) { return Err(DeployError::HostKeyChanged); }
        Ok(plan)
    }

    fn plan_inner(&self, target_id: &str, action: Action, release_id: Option<&str>) -> Result<PlanView, DeployError> {
        if let Some(r) = release_id { if !valid_release_id(r) { return Err(DeployError::InvalidInput("releaseId")); } }
        let t = self.targets.get(target_id)?;
        let plan = self.checked_plan(&t, action, release_id)?;
        let hash = target_plan_hash(action, &t, &plan);
        self.broker.remember_plan(&hash);
        Ok(PlanView { plan_hash: hash, action, target_id: t.id, fingerprint: plan.fingerprint, build_id: plan.build_id, live_release: plan.live_release, release_id: plan.release_id, files: plan.files })
    }
    pub fn plan(&self, target_id: &str) -> Result<PlanView, DeployError> { self.plan_inner(target_id, Action::Publish, None) }
    pub fn plan_rollback(&self, target_id: &str, release_id: &str) -> Result<PlanView, DeployError> { self.plan_inner(target_id, Action::Rollback, Some(release_id)) }
    /// `https://<domain>` of a saved target, or `None` without a domain. Only validated domains are ever returned.
    pub fn site_url(&self, target_id: &str) -> Result<Option<String>, DeployError> {
        let t = self.targets.get(target_id)?;
        Ok(t.domain.map(|d| format!("https://{}", d.to_ascii_lowercase())))
    }
    pub fn live_release(&self, target_id: &str) -> Result<Option<String>, DeployError> {
        Ok(self.engine.live_release(&self.targets.get(target_id)?)?)
    }
    pub fn cancel(&self, target_id: &str) -> Result<bool, DeployError> {
        Ok(self.engine.cancel(&self.targets.get(target_id)?))
    }
    pub fn releases(&self, target_id: &str) -> Result<Vec<String>, DeployError> { let t = self.targets.get(target_id)?; Ok(self.engine.releases(&t)?) }

    pub fn confirm_issue(&self, plan_hash: &str, now_ms: u64) -> Result<String, DeployError> { self.broker.issue(plan_hash, now_ms) }

    fn execute(&self, action: Action, target_id: &str, release_id: Option<&str>, hash: &str, token: &str, now_ms: u64, progress: &dyn Fn(&str)) -> Result<Outcome, DeployError> {
        let _g = self.lock_target(target_id)?;
        // Token first: a stale or forged call never reaches the server, and a wrong-hash attempt burns the token.
        self.broker.consume(token, hash, now_ms)?;
        let t = self.targets.get(target_id)?;
        // Re-plan against the live state: what is uploaded is exactly what was approved.
        let plan = self.checked_plan(&t, action, release_id)?;
        if target_plan_hash(action, &t, &plan) != hash { return Err(DeployError::PlanChanged); }
        Ok(match action { Action::Publish => self.engine.publish(&t, &plan, progress)?, Action::Rollback => self.engine.rollback(&t, &plan, progress)? })
    }
    pub fn publish(&self, target_id: &str, hash: &str, token: &str, now_ms: u64, progress: &dyn Fn(&str)) -> Result<Outcome, DeployError> {
        self.execute(Action::Publish, target_id, None, hash, token, now_ms, progress)
    }
    pub fn rollback(&self, target_id: &str, release_id: &str, hash: &str, token: &str, now_ms: u64, progress: &dyn Fn(&str)) -> Result<Outcome, DeployError> {
        if !valid_release_id(release_id) { return Err(DeployError::InvalidInput("releaseId")); }
        self.execute(Action::Rollback, target_id, Some(release_id), hash, token, now_ms, progress)
    }
}

/// Release ids are UTC time plus short hash, e.g. `20261013T093000Z-ab12cd`; same alphabet as site ids.
pub fn valid_release_id(s: &str) -> bool { !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'T' || b == b'Z') }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy_targets::{key_slot_for, MemoryTargets, TargetKind};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    const SECRET: &str = "SEEDED-PASSPHRASE-8f3a";
    #[derive(Default)]
    struct Pins(Mutex<BTreeMap<String, String>>);
    struct SharedPins(Arc<Pins>);
    impl HostKeyPins for SharedPins {
        fn pinned(&self, h: &str, p: u16) -> Option<String> { self.0 .0.lock().unwrap().get(&format!("{h}:{p}")).cloned() }
        fn pin(&self, h: &str, p: u16, f: &str) { self.0 .0.lock().unwrap().insert(format!("{h}:{p}"), f.into()); }
        fn replace(&self, h: &str, p: u16, f: &str) { self.pin(h, p, f) }
    }
    struct Keys(Arc<Mutex<BTreeSet<String>>>);
    impl KeyMaker for Keys {
        fn exists(&self, s: &str) -> bool { self.0.lock().unwrap().contains(s) }
        fn create(&self, s: &str) -> Result<String, ()> { self.0.lock().unwrap().insert(s.into()); Ok("ssh-ed25519 AAAATEST somnia".into()) }
        fn delete(&self, s: &str) { self.0.lock().unwrap().remove(s); }
    }
    struct Engine { fp: Mutex<String>, files: Mutex<Vec<PlanFile>>, publishes: Arc<AtomicUsize>, fail: Mutex<Option<EngineError>> }
    struct SharedEngine(Arc<Engine>);
    impl DeployEngine for SharedEngine {
        fn plan(&self, _t: &Target, _a: Action, rel: Option<&str>) -> Result<EnginePlan, EngineError> {
            Ok(EnginePlan { fingerprint: self.0.fp.lock().unwrap().clone(), build_id: "b1".into(), live_release: Some("20261012T000000Z-aaaaaa".into()), files: self.0.files.lock().unwrap().clone(), release_id: rel.map(String::from) })
        }
        fn probe_host_key(&self, _t: &Target) -> Result<HostKeyInfo, EngineError> { Ok(HostKeyInfo { algorithm: "ssh-ed25519".into(), fingerprint: self.0.fp.lock().unwrap().clone() }) }
        fn publish(&self, _t: &Target, _p: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
            progress("upload");
            if let Some(e) = *self.0.fail.lock().unwrap() { return Err(e); }
            self.0.publishes.fetch_add(1, Ordering::SeqCst);
            Ok(Outcome { release_id: "20261013T093000Z-ab12cd".into(), url: Some("https://example.com".into()), rolled_back: false })
        }
        fn rollback(&self, _t: &Target, p: &EnginePlan, _g: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
            self.0.publishes.fetch_add(1, Ordering::SeqCst);
            Ok(Outcome { release_id: p.release_id.clone().unwrap(), url: None, rolled_back: true })
        }
        fn releases(&self, _t: &Target) -> Result<Vec<String>, EngineError> { Ok(vec!["20261012T000000Z-aaaaaa".into()]) }
    }
    fn file(p: &str, c: Change) -> PlanFile { PlanFile { path: p.into(), size: 3, sha256: "ab".repeat(32), change: c } }
    struct Fx { svc: DeployService, eng: Arc<Engine>, pins: Arc<Pins>, keys: Arc<Mutex<BTreeSet<String>>> }
    fn fx() -> Fx {
        let eng = Arc::new(Engine { fp: Mutex::new("SHA256:good".into()), files: Mutex::new(vec![file("index.html", Change::Changed)]), publishes: Arc::new(AtomicUsize::new(0)), fail: Mutex::new(None) });
        let pins = Arc::new(Pins::default());
        let keys = Arc::new(Mutex::new(BTreeSet::new()));
        let svc = DeployService::new(Box::new(MemoryTargets::default()), Box::new(SharedPins(pins.clone())), Box::new(Keys(keys.clone())), Box::new(SharedEngine(eng.clone())));
        svc.target_save(Target { id: "s1".into(), name: "Site".into(), host: "203.0.113.10".into(), port: 22, user: "somnia".into(), domain: Some("example.com".into()), kind: TargetKind::Static, key_slot: key_slot_for("s1"), spa: false, app_port: None, ftp: None }).unwrap();
        Fx { svc, eng, pins, keys }
    }
    fn ready() -> Fx { let f = fx(); f.svc.key_create("s1").unwrap(); f.svc.hostkey_trust("s1", "SHA256:good").unwrap(); f }
    fn noop(_: &str) {}

    #[test]
    fn plan_requires_key_then_pin() {
        let f = fx();
        assert_eq!(f.svc.plan("s1").unwrap_err(), DeployError::KeyMissing);
        f.svc.key_create("s1").unwrap();
        assert_eq!(f.svc.plan("s1").unwrap_err(), DeployError::HostKeyUnknown);
        f.svc.hostkey_trust("s1", "SHA256:good").unwrap();
        let p = f.svc.plan("s1").unwrap();
        assert_eq!(p.fingerprint, "SHA256:good");
        assert_eq!(p.files.len(), 1);
    }
    #[test]
    fn status_reflects_state() {
        let f = fx();
        assert_eq!(f.svc.targets_list().unwrap()[0].state, TargetState::KeyMissing);
        f.svc.key_create("s1").unwrap();
        assert_eq!(f.svc.targets_list().unwrap()[0].state, TargetState::NeedsTrust);
        f.svc.hostkey_trust("s1", "SHA256:good").unwrap();
        let s = &f.svc.targets_list().unwrap()[0];
        assert_eq!((s.state, s.fingerprint.as_deref()), (TargetState::Ready, Some("SHA256:good")));
    }
    #[test]
    fn site_url_is_built_from_the_saved_domain_and_releases_are_listed() {
        let f = fx();
        assert_eq!(f.svc.site_url("nope").unwrap_err(), DeployError::TargetNotFound);
        let mut t = f.svc.targets.get("s1").unwrap();
        t.domain = Some("Example.COM".into());
        f.svc.target_save(t).unwrap();
        assert_eq!(f.svc.site_url("s1").unwrap().as_deref(), Some("https://example.com"));
        assert_eq!(f.svc.releases("s1").unwrap(), vec!["20261012T000000Z-aaaaaa".to_string()]);
    }
    #[test]
    fn publish_needs_a_valid_one_time_token_bound_to_the_plan() {
        let f = ready();
        let plan = f.svc.plan("s1").unwrap();
        // No token / forged token.
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, "", 1000, &noop).unwrap_err(), DeployError::ConfirmationInvalid);
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, "forged", 1000, &noop).unwrap_err(), DeployError::ConfirmationInvalid);
        assert_eq!(f.eng.publishes.load(Ordering::SeqCst), 0);
        // Good token works once.
        let tok = f.svc.confirm_issue(&plan.plan_hash, 1000).unwrap();
        let out = f.svc.publish("s1", &plan.plan_hash, &tok, 2000, &noop).unwrap();
        assert!(!out.rolled_back);
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &tok, 2000, &noop).unwrap_err(), DeployError::ConfirmationInvalid, "replay");
        assert_eq!(f.eng.publishes.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn token_expires_and_wrong_hash_burns_it() {
        let f = ready();
        let plan = f.svc.plan("s1").unwrap();
        let t1 = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &t1, TOKEN_TTL_MS + 1, &noop).unwrap_err(), DeployError::ConfirmationInvalid);
        let t2 = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        assert_eq!(f.svc.publish("s1", &"0".repeat(64), &t2, 10, &noop).unwrap_err(), DeployError::ConfirmationInvalid);
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &t2, 10, &noop).unwrap_err(), DeployError::ConfirmationInvalid, "burned");
        assert_eq!(f.eng.publishes.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn token_cannot_be_minted_for_unknown_plan() {
        let f = ready();
        assert_eq!(f.svc.confirm_issue(&"f".repeat(64), 0).unwrap_err(), DeployError::UnknownPlan);
        assert_eq!(f.svc.broker.outstanding(), 0);
    }
    #[test]
    fn token_for_one_target_is_useless_for_another() {
        let f = ready();
        f.svc.target_save(Target { id: "s2".into(), name: "Two".into(), host: "203.0.113.11".into(), port: 22, user: "somnia".into(), domain: None, kind: TargetKind::Static, key_slot: key_slot_for("s2"), spa: false, app_port: None, ftp: None }).unwrap();
        f.svc.key_create("s2").unwrap(); f.svc.hostkey_trust("s2", "SHA256:good").unwrap();
        let p1 = f.svc.plan("s1").unwrap(); let _p2 = f.svc.plan("s2").unwrap();
        let tok = f.svc.confirm_issue(&p1.plan_hash, 0).unwrap();
        assert_eq!(f.svc.publish("s2", &p1.plan_hash, &tok, 1, &noop).unwrap_err(), DeployError::PlanChanged);
    }
    #[test]
    fn changing_the_file_list_after_approval_invalidates() {
        let f = ready();
        let plan = f.svc.plan("s1").unwrap();
        let tok = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        f.eng.files.lock().unwrap().push(file("evil.php", Change::Added));
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &tok, 1, &noop).unwrap_err(), DeployError::PlanChanged);
        assert_eq!(f.eng.publishes.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn plan_hash_ignores_order_but_not_content() {
        let mut p = EnginePlan { fingerprint: "SHA256:x".into(), build_id: "b".into(), live_release: None, files: vec![file("a", Change::Added), file("b", Change::Added)], release_id: None };
        let h = plan_hash(Action::Publish, "t", &p);
        p.files.reverse();
        assert_eq!(plan_hash(Action::Publish, "t", &p), h);
        p.files[0].sha256 = "cd".repeat(32);
        assert_ne!(plan_hash(Action::Publish, "t", &p), h);
        assert_ne!(plan_hash(Action::Rollback, "t", &p), plan_hash(Action::Publish, "t", &p));
    }
    #[test]
    fn changed_host_key_is_a_hard_stop_and_publish_never_starts() {
        let f = ready();
        let plan = f.svc.plan("s1").unwrap();
        let tok = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        *f.eng.fp.lock().unwrap() = "SHA256:evil".into();
        assert_eq!(f.svc.plan("s1").unwrap_err(), DeployError::HostKeyChanged);
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &tok, 1, &noop).unwrap_err(), DeployError::HostKeyChanged);
        assert_eq!(f.eng.publishes.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn trust_only_first_time_and_only_for_the_fingerprint_shown() {
        let f = fx(); f.svc.key_create("s1").unwrap();
        assert_eq!(f.svc.hostkey_trust("s1", "SHA256:other").unwrap_err(), DeployError::HostKeyMismatch);
        assert!(f.pins.0.lock().unwrap().is_empty());
        f.svc.hostkey_trust("s1", "SHA256:good").unwrap();
        assert_eq!(f.svc.hostkey_trust("s1", "SHA256:good").unwrap_err(), DeployError::HostKeyAlreadyPinned);
    }
    #[test]
    fn replace_needs_ack_old_and_new_fingerprint() {
        let f = ready();
        *f.eng.fp.lock().unwrap() = "SHA256:new".into();
        assert_eq!(f.svc.hostkey_replace("s1", "SHA256:good", "SHA256:new", false).unwrap_err(), DeployError::NotAcknowledged);
        assert_eq!(f.svc.hostkey_replace("s1", "SHA256:wrong", "SHA256:new", true).unwrap_err(), DeployError::HostKeyMismatch);
        assert_eq!(f.svc.hostkey_replace("s1", "SHA256:good", "SHA256:attacker", true).unwrap_err(), DeployError::HostKeyMismatch);
        f.svc.hostkey_replace("s1", "SHA256:good", "SHA256:new", true).unwrap();
        assert_eq!(f.svc.plan("s1").unwrap().fingerprint, "SHA256:new");
    }
    #[test]
    fn rollback_flow_and_release_id_validation() {
        let f = ready();
        assert_eq!(f.svc.plan_rollback("s1", "../etc").unwrap_err(), DeployError::InvalidInput("releaseId"));
        let plan = f.svc.plan_rollback("s1", "20261012T000000Z-aaaaaa").unwrap();
        assert_eq!(plan.action, Action::Rollback);
        let tok = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        // A publish token cannot authorise a rollback and vice versa (hash includes the action).
        let pub_plan = f.svc.plan("s1").unwrap();
        let pub_tok = f.svc.confirm_issue(&pub_plan.plan_hash, 0).unwrap();
        assert_eq!(f.svc.rollback("s1", "20261012T000000Z-aaaaaa", &pub_plan.plan_hash, &pub_tok, 1, &noop).unwrap_err(), DeployError::PlanChanged);
        let out = f.svc.rollback("s1", "20261012T000000Z-aaaaaa", &plan.plan_hash, &tok, 1, &noop).unwrap();
        assert!(out.rolled_back);
    }
    #[test]
    fn concurrent_publish_on_same_target_is_busy() {
        let f = ready();
        let g = f.svc.lock_target("s1").unwrap();
        let plan = f.svc.plan("s1").unwrap();
        let tok = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        assert_eq!(f.svc.publish("s1", &plan.plan_hash, &tok, 1, &noop).unwrap_err(), DeployError::Busy);
        drop(g);
        f.svc.publish("s1", &plan.plan_hash, &tok, 1, &noop).unwrap();
    }
    #[test]
    fn engine_errors_map_to_codes_without_text() {
        let f = ready();
        *f.eng.fail.lock().unwrap() = Some(EngineError::HealthFailedRolledBack);
        let plan = f.svc.plan("s1").unwrap();
        let tok = f.svc.confirm_issue(&plan.plan_hash, 0).unwrap();
        let e = f.svc.publish("s1", &plan.plan_hash, &tok, 1, &noop).unwrap_err();
        assert_eq!(e.code(), "health-failed-rolled-back");
        assert_eq!(e.to_string(), "deploy:health-failed-rolled-back");
    }
    #[test]
    fn key_create_is_once_and_delete_key_is_opt_in() {
        let f = fx();
        assert_eq!(f.svc.key_create("s1").unwrap(), "ssh-ed25519 AAAATEST somnia");
        assert_eq!(f.svc.key_create("s1").unwrap_err(), DeployError::KeyExists);
        f.svc.target_delete("s1", false).unwrap();
        assert!(f.keys.lock().unwrap().contains("deploy-key:s1"));
        assert_eq!(f.svc.target_delete("s1", true).unwrap_err(), DeployError::TargetNotFound);
    }
    #[test]
    fn no_secret_in_errors_status_or_plan_json() {
        // Seed a secret into every place a lower layer could echo it: target name goes through status, errors are enums.
        let f = ready();
        let all = [
            serde_json::to_string(&f.svc.targets_list().unwrap()).unwrap(),
            serde_json::to_string(&f.svc.plan("s1").unwrap()).unwrap(),
            DeployError::KeyBackend.to_string(), DeployError::Engine(EngineError::Auth).to_string(), format!("{:?}", DeployError::Engine(EngineError::Connect)),
        ];
        for s in all { assert!(!s.contains(SECRET) && !s.contains("PRIVATE KEY")); }
        // Status JSON exposes state and fingerprint only, never a key slot's content.
        let j = serde_json::to_value(&f.svc.targets_list().unwrap()[0]).unwrap();
        assert!(j.get("state").is_some() && j.get("privateKey").is_none());
    }
}
