//! Publish targets: metadata only (host, port, user, domain, type, key slot id).
//!
//! A target never carries key material. The SSH key lives in the OS keychain under the slot
//! `deploy-key:<id>`; fingerprint pins live in the host-key store, per app and not per project.
//! Pure logic behind [`TargetStore`] so it is testable without Tauri.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TargetKind { Static, Node, UploadOnly, Ftp }

/// FTP/FTPS transport security. Explicit TLS (AUTH TLS, then PROT P) is the default; plain FTP needs an explicit opt-in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FtpSecurity { #[default] ExplicitTls, Plain }
/// How the server certificate is checked. `ca` (default): chain and host name against the system roots.
/// `pinned`: the certificate fingerprint the person confirmed (self-signed or host-name-mismatch hosting certificates).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FtpVerify { #[default] Ca, Pinned }
/// Settings of an FTP target. The password is not here: it lives in the OS keychain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FtpSettings {
    #[serde(default)]
    pub security: FtpSecurity,
    #[serde(default)]
    pub verify: FtpVerify,
    /// Must be true for `security: plain`. The credentials then cross the network unencrypted.
    #[serde(default)]
    pub allow_plain: bool,
    /// Directory on the server that is the web root, e.g. `/public_html`. `/` means the login directory.
    #[serde(default = "default_remote_path")]
    pub remote_path: String,
}
fn default_remote_path() -> String { "/".into() }
/// Absolute, normalised, no `..`, no control or shell-ish characters. Segments are checked one by one.
pub fn is_remote_path(s: &str) -> bool {
    s.starts_with('/') && s.len() <= 200 && (s == "/" || (!s.ends_with('/') && s[1..].split('/').all(is_remote_segment)))
}
pub fn is_remote_segment(seg: &str) -> bool {
    !seg.is_empty() && seg.len() <= 120 && seg != "." && seg != ".." && !seg.chars().any(|c| c.is_control() || matches!(c, '\\' | '/' | '*' | '?' | '"' | '<' | '>' | '|' | ':'))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    pub kind: TargetKind,
    /// Always `deploy-key:<id>`; kept in the file so a shared project shows "key missing" by slot.
    pub key_slot: String,
    /// Single-page app: try_files fallback to index.html.
    #[serde(default)]
    pub spa: bool,
    /// Node targets: loopback port the app listens on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_port: Option<u16>,
    /// Only for `kind: ftp`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ftp: Option<FtpSettings>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetError { Invalid(&'static str), NotFound, Storage }
impl std::fmt::Display for TargetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Invalid(why) => write!(f, "Invalid target: {why}"), Self::NotFound => f.write_str("Target not found"), Self::Storage => f.write_str("Targets could not be saved") }
    }
}

pub fn key_slot_for(id: &str) -> String { format!("deploy-key:{id}") }

fn is_id(s: &str) -> bool { !s.is_empty() && s.len() <= 40 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') && !s.starts_with('-') }
fn is_host(s: &str) -> bool {
    !s.is_empty() && s.len() <= 253 && !s.starts_with('-') && !s.starts_with('.') && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'))
}
fn is_user(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty() && b.len() <= 32 && (b[0].is_ascii_lowercase() || b[0] == b'_') && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, b'_' | b'-'))
}
fn is_ftp_user(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.' | b'@' | b'+'))
}
fn is_domain(s: &str) -> bool {
    s.len() <= 253 && s.contains('.') && !s.starts_with('.') && !s.ends_with('.') && !s.contains("..")
        && s.split('.').all(|l| !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-') && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'))
}

impl Target {
    pub fn validate(&self) -> Result<(), TargetError> {
        if !is_id(&self.id) { return Err(TargetError::Invalid("id")); }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 || self.name.chars().any(char::is_control) { return Err(TargetError::Invalid("name")); }
        if !is_host(&self.host) { return Err(TargetError::Invalid("host")); }
        if self.port == 0 { return Err(TargetError::Invalid("port")); }
        if !(if self.kind == TargetKind::Ftp { is_ftp_user(&self.user) } else { is_user(&self.user) }) { return Err(TargetError::Invalid("user")); }
        match (&self.kind, &self.ftp) {
            (TargetKind::Ftp, Some(f)) => {
                if !is_remote_path(&f.remote_path) { return Err(TargetError::Invalid("remotePath")); }
                if f.security == FtpSecurity::Plain && !f.allow_plain { return Err(TargetError::Invalid("allowPlain")); }
                if f.security == FtpSecurity::Plain && f.verify == FtpVerify::Pinned { return Err(TargetError::Invalid("verify")); }
                if self.spa { return Err(TargetError::Invalid("spa")); }
            }
            (TargetKind::Ftp, None) => return Err(TargetError::Invalid("ftp")),
            (_, Some(_)) => return Err(TargetError::Invalid("ftp")),
            _ => {}
        }
        if let Some(d) = &self.domain { if !is_domain(&d.to_ascii_lowercase()) { return Err(TargetError::Invalid("domain")); } }
        if self.key_slot != key_slot_for(&self.id) { return Err(TargetError::Invalid("keySlot")); }
        if self.app_port.is_some() && self.kind != TargetKind::Node { return Err(TargetError::Invalid("appPort")); }
        if self.app_port.is_some_and(|p| p < 1024) { return Err(TargetError::Invalid("appPort")); }
        if self.kind == TargetKind::Node && self.app_port.is_none() { return Err(TargetError::Invalid("appPort")); }
        Ok(())
    }
}

pub trait TargetStore: Send + Sync {
    fn list(&self) -> Result<Vec<Target>, TargetError>;
    fn save(&self, target: &Target) -> Result<(), TargetError>;
    fn delete(&self, id: &str) -> Result<Target, TargetError>;
    fn get(&self, id: &str) -> Result<Target, TargetError> { self.list()?.into_iter().find(|t| t.id == id).ok_or(TargetError::NotFound) }
}

#[derive(Default)]
pub struct MemoryTargets(Mutex<Vec<Target>>);
impl TargetStore for MemoryTargets {
    fn list(&self) -> Result<Vec<Target>, TargetError> { Ok(self.0.lock().map_err(|_| TargetError::Storage)?.clone()) }
    fn save(&self, target: &Target) -> Result<(), TargetError> {
        target.validate()?;
        let mut v = self.0.lock().map_err(|_| TargetError::Storage)?;
        match v.iter_mut().find(|t| t.id == target.id) { Some(slot) => *slot = target.clone(), None => v.push(target.clone()) }
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<Target, TargetError> {
        let mut v = self.0.lock().map_err(|_| TargetError::Storage)?;
        let i = v.iter().position(|t| t.id == id).ok_or(TargetError::NotFound)?;
        Ok(v.remove(i))
    }
}

/// JSON file in the app config directory (`deploy-targets.json`), written atomically.
pub struct FileTargets { path: PathBuf, lock: Mutex<()> }
impl FileTargets {
    pub fn new(path: PathBuf) -> Self { Self { path, lock: Mutex::new(()) } }
    fn read(&self) -> Result<Vec<Target>, TargetError> {
        match std::fs::read_to_string(&self.path) {
            Ok(raw) => { let v: Vec<Target> = serde_json::from_str(&raw).map_err(|_| TargetError::Storage)?; for t in &v { t.validate()?; } Ok(v) }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(_) => Err(TargetError::Storage),
        }
    }
    fn write(&self, v: &[Target]) -> Result<(), TargetError> {
        if let Some(dir) = self.path.parent() { std::fs::create_dir_all(dir).map_err(|_| TargetError::Storage)?; }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(v).map_err(|_| TargetError::Storage)?).map_err(|_| TargetError::Storage)?;
        std::fs::rename(&tmp, &self.path).map_err(|_| TargetError::Storage)
    }
}
impl TargetStore for FileTargets {
    fn list(&self) -> Result<Vec<Target>, TargetError> { let _g = self.lock.lock().map_err(|_| TargetError::Storage)?; self.read() }
    fn save(&self, target: &Target) -> Result<(), TargetError> {
        target.validate()?;
        let _g = self.lock.lock().map_err(|_| TargetError::Storage)?;
        let mut v = self.read()?;
        match v.iter_mut().find(|t| t.id == target.id) { Some(slot) => *slot = target.clone(), None => v.push(target.clone()) }
        self.write(&v)
    }
    fn delete(&self, id: &str) -> Result<Target, TargetError> {
        let _g = self.lock.lock().map_err(|_| TargetError::Storage)?;
        let mut v = self.read()?;
        let i = v.iter().position(|t| t.id == id).ok_or(TargetError::NotFound)?;
        let gone = v.remove(i);
        self.write(&v)?;
        Ok(gone)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(crate) fn sample(id: &str) -> Target {
        Target { id: id.into(), name: "My site".into(), host: "203.0.113.10".into(), port: 22, user: "somnia".into(), domain: Some("example.com".into()), kind: TargetKind::Static, key_slot: key_slot_for(id), spa: false, app_port: None, ftp: None }
    }
    #[test]
    fn validates_fields() {
        assert!(sample("site-1").validate().is_ok());
        for bad in ["", "Site", "a b", "-x", "a/b", "../x"] { assert!(sample(bad).validate().is_err(), "{bad}"); }
        let mut t = sample("a"); t.host = "evil;rm".into(); assert!(t.validate().is_err());
        t = sample("a"); t.user = "root user".into(); assert!(t.validate().is_err());
        t = sample("a"); t.port = 0; assert!(t.validate().is_err());
        t = sample("a"); t.domain = Some("no_dot".into()); assert!(t.validate().is_err());
        t = sample("a"); t.key_slot = "deploy-key:other".into(); assert!(t.validate().is_err());
        t = sample("a"); t.kind = TargetKind::Node; assert!(t.validate().is_err(), "node needs app port");
        t.app_port = Some(3000); assert!(t.validate().is_ok());
        t = sample("a"); t.app_port = Some(3000); assert!(t.validate().is_err(), "static has no app port");
    }
    #[test]
    fn file_store_roundtrip_and_atomic() {
        let dir = tempfile::tempdir().unwrap();
        let s = FileTargets::new(dir.path().join("deploy-targets.json"));
        assert!(s.list().unwrap().is_empty());
        s.save(&sample("one")).unwrap();
        let mut two = sample("two"); two.name = "Second".into(); s.save(&two).unwrap();
        two.name = "Renamed".into(); s.save(&two).unwrap();
        let all = s.list().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(s.get("two").unwrap().name, "Renamed");
        assert_eq!(s.delete("one").unwrap().id, "one");
        assert_eq!(s.delete("one"), Err(TargetError::NotFound));
        let raw = std::fs::read_to_string(dir.path().join("deploy-targets.json")).unwrap();
        assert!(!raw.to_lowercase().contains("private") && !raw.contains("passphrase"));
    }
    #[test]
    fn corrupt_file_is_storage_error_not_panic() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("t.json"); std::fs::write(&p, "{not json").unwrap();
        assert_eq!(FileTargets::new(p).list(), Err(TargetError::Storage));
    }
}
