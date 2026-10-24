//! App-owned TOFU store. Never load pins from projects or ~/.ssh/known_hosts.
use super::{DeployError, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostKey {
    pub algorithm: String,
    pub fingerprint: String,
}
impl HostKey {
    pub fn from_public_key(key: &russh::keys::PublicKey) -> Self {
        Self {
            algorithm: key.algorithm().to_string(),
            fingerprint: key.fingerprint(russh::keys::HashAlg::Sha256).to_string(),
        }
    }
    fn validate(&self) -> Result<()> {
        if !matches!(
            self.algorithm.as_str(),
            "ssh-ed25519"
                | "ecdsa-sha2-nistp256"
                | "ecdsa-sha2-nistp384"
                | "ecdsa-sha2-nistp521"
                | "ssh-rsa"
                | "rsa-sha2-256"
                | "rsa-sha2-512"
                // FTP/FTPS targets: certificate chain checked at every connection, pinned leaf certificate, or plain FTP.
                | "tls-ca"
                | "tls-leaf"
                | "plaintext"
        ) {
            return Err(DeployError::InvalidInput);
        }
        let digest = self
            .fingerprint
            .strip_prefix("SHA256:")
            .ok_or(DeployError::InvalidInput)?;
        if digest.len() != 43
            || !digest
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/'))
        {
            return Err(DeployError::InvalidInput);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostKeyStatus {
    Unknown { observed: HostKey },
    Trusted,
    Changed { pinned: HostKey, observed: HostKey },
}
fn endpoint(host: &str, port: u16) -> Result<String> {
    if port == 0
        || host.is_empty()
        || host.len() > 253
        || !host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'))
        || host.starts_with('-')
    {
        return Err(DeployError::InvalidInput);
    }
    Ok(format!("[{}]:{port}", host.to_ascii_lowercase()))
}
pub struct HostKeyStore {
    path: Option<PathBuf>,
    pins: Mutex<BTreeMap<String, HostKey>>,
}
impl Default for HostKeyStore {
    fn default() -> Self {
        Self {
            path: None,
            pins: Mutex::new(BTreeMap::new()),
        }
    }
}
impl HostKeyStore {
    /// Caller supplies an app-config path, never a path supplied by a project.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let pins = match std::fs::read(&path) {
            Ok(bytes) => {
                if bytes.len() > 1024 * 1024 {
                    return Err(DeployError::HostStore);
                }
                let pins: BTreeMap<String, HostKey> =
                    serde_json::from_slice(&bytes).map_err(|_| DeployError::HostStore)?;
                for key in pins.values() {
                    key.validate().map_err(|_| DeployError::HostStore)?;
                }
                pins
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(_) => return Err(DeployError::HostStore),
        };
        Ok(Self {
            path: Some(path),
            pins: Mutex::new(pins),
        })
    }
    /// Read the app-owned pin without opening a connection. No project controls this store.
    pub fn pinned_key(&self, host: &str, port: u16) -> Result<Option<HostKey>> {
        let endpoint = endpoint(host, port)?;
        Ok(self.pins.lock().map_err(|_| DeployError::HostStore)?.get(&endpoint).cloned())
    }
    pub fn check(&self, host: &str, port: u16, observed: &HostKey) -> Result<HostKeyStatus> {
        observed.validate()?;
        let key = endpoint(host, port)?;
        let pins = self.pins.lock().map_err(|_| DeployError::HostStore)?;
        Ok(match pins.get(&key) {
            None => HostKeyStatus::Unknown {
                observed: observed.clone(),
            },
            Some(pin) if pin == observed => HostKeyStatus::Trusted,
            Some(pin) => HostKeyStatus::Changed {
                pinned: pin.clone(),
                observed: observed.clone(),
            },
        })
    }
    pub fn require_trusted(&self, host: &str, port: u16, observed: &HostKey) -> Result<()> {
        match self.check(host, port, observed)? {
            HostKeyStatus::Trusted => Ok(()),
            HostKeyStatus::Unknown { .. } => Err(DeployError::UntrustedHost),
            HostKeyStatus::Changed { .. } => Err(DeployError::HostKeyChanged),
        }
    }
    /// UI layer must require a human gesture (or verified bootstrap fingerprint).
    /// This cannot replace a pin. A second call after another dialog changed it hard-stops.
    pub fn trust_new(&self, host: &str, port: u16, observed: &HostKey) -> Result<()> {
        observed.validate()?;
        let endpoint = endpoint(host, port)?;
        let mut pins = self.pins.lock().map_err(|_| DeployError::HostStore)?;
        if let Some(pin) = pins.get(&endpoint) {
            return if pin == observed {
                Ok(())
            } else {
                Err(DeployError::HostKeyChanged)
            };
        }
        let mut next = pins.clone();
        next.insert(endpoint, observed.clone());
        self.persist(&next)?;
        *pins = next;
        Ok(())
    }
    /// Compare-and-swap, called only after the UI's separate reinstall confirmation.
    pub fn replace_confirmed(
        &self,
        host: &str,
        port: u16,
        expected: &HostKey,
        observed: &HostKey,
    ) -> Result<()> {
        observed.validate()?;
        let endpoint = endpoint(host, port)?;
        let mut pins = self.pins.lock().map_err(|_| DeployError::HostStore)?;
        if pins.get(&endpoint) != Some(expected) {
            return Err(DeployError::HostKeyChanged);
        }
        let mut next = pins.clone();
        next.insert(endpoint, observed.clone());
        self.persist(&next)?;
        *pins = next;
        Ok(())
    }
    fn persist(&self, pins: &BTreeMap<String, HostKey>) -> Result<()> {
        use std::io::Write;
        if let Some(path) = &self.path {
            let parent = path.parent().ok_or(DeployError::HostStore)?;
            std::fs::create_dir_all(parent).map_err(|_| DeployError::HostStore)?;
            let temporary = parent.join(format!(".hostkeys-{}.tmp", uuid::Uuid::new_v4()));
            let result = (|| {
                let mut options = std::fs::OpenOptions::new();
                options.write(true).create_new(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                let mut f = options
                    .open(&temporary)
                    .map_err(|_| DeployError::HostStore)?;
                f.write_all(&serde_json::to_vec(pins).map_err(|_| DeployError::HostStore)?)
                    .map_err(|_| DeployError::HostStore)?;
                f.sync_all().map_err(|_| DeployError::HostStore)?;
                std::fs::rename(&temporary, path).map_err(|_| DeployError::HostStore)?;
                Ok(())
            })();
            if result.is_err() {
                let _ = std::fs::remove_file(&temporary);
            }
            result?;
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn key(c: char) -> HostKey {
        HostKey {
            algorithm: "ssh-ed25519".into(),
            fingerprint: format!("SHA256:{}", c.to_string().repeat(43)),
        }
    }
    #[test]
    fn tofu_change_cas_and_port_scope() {
        let s = HostKeyStore::default();
        let a = key('A');
        let b = key('B');
        assert_eq!(
            s.require_trusted("HOST", 22, &a),
            Err(DeployError::UntrustedHost)
        );
        s.trust_new("HOST", 22, &a).unwrap();
        assert_eq!(s.require_trusted("host", 22, &a), Ok(()));
        assert_eq!(
            s.require_trusted("host", 23, &a),
            Err(DeployError::UntrustedHost)
        );
        assert_eq!(
            s.trust_new("host", 22, &b),
            Err(DeployError::HostKeyChanged)
        );
        assert_eq!(
            s.replace_confirmed("host", 22, &b, &a),
            Err(DeployError::HostKeyChanged)
        );
        s.replace_confirmed("host", 22, &a, &b).unwrap();
        assert_eq!(s.require_trusted("host", 22, &b), Ok(()));
    }
    #[test]
    fn durable_and_corrupt_fail_closed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hosts.json");
        let s = HostKeyStore::open(&path).unwrap();
        s.trust_new("host", 22, &key('A')).unwrap();
        let loaded = HostKeyStore::open(&path).unwrap();
        assert_eq!(loaded.require_trusted("host", 22, &key('A')), Ok(()));
        std::fs::write(path, b"bad").unwrap();
        assert!(HostKeyStore::open(dir.path().join("hosts.json")).is_err());
    }
}
