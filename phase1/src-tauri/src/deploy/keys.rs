use super::{manifest::valid_id, DeployError, Result};
use crate::oauth_store::SecretBackend;
use russh::keys::{Algorithm, HashAlg, PrivateKey};
use serde::Serialize;
use zeroize::Zeroizing;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicKeyStatus {
    pub target_id: String,
    pub slot: String,
    pub public_key: String,
    pub fingerprint: String,
}
/// Private keys have no Serialize/Display and always-redacted Debug.
pub struct DeploymentKey(PrivateKey);
impl std::fmt::Debug for DeploymentKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("DeploymentKey([REDACTED])")
    }
}
impl DeploymentKey {
    pub fn private_key(&self) -> &PrivateKey {
        &self.0
    }
    /// Test-only: the live OpenSSH integration test reads a throwaway key from disk.
    #[cfg(test)]
    pub fn from_openssh_bytes(raw: &[u8]) -> Result<Self> {
        let key = PrivateKey::from_openssh(raw).map_err(|_| DeployError::Keychain)?;
        if key.algorithm() != Algorithm::Ed25519 || key.is_encrypted() {
            return Err(DeployError::Keychain);
        }
        Ok(DeploymentKey(key))
    }
}
fn slot(target: &str) -> Result<String> {
    if !valid_id(target) {
        return Err(DeployError::InvalidInput);
    }
    Ok(format!("deploy-key:{target}"))
}
fn password_slot(target: &str) -> Result<String> {
    if !valid_id(target) {
        return Err(DeployError::InvalidInput);
    }
    Ok(format!("deploy-ftp:{target}"))
}
pub struct KeyStore<B: SecretBackend> {
    backend: B,
}
impl<B: SecretBackend> KeyStore<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }
    /// No file is created and no private key is returned to the renderer.
    pub fn create(&self, target: &str) -> Result<PublicKeyStatus> {
        let slot = slot(target)?;
        if let Some(existing) = self.backend.get(&slot).map_err(|_| DeployError::Keychain)? {
            let _existing = Zeroizing::new(existing);
            return Err(DeployError::KeyExists);
        }
        let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519)
            .map_err(|_| DeployError::Keychain)?;
        let encoded = key
            .to_openssh(russh::keys::ssh_key::LineEnding::LF)
            .map_err(|_| DeployError::Keychain)?;
        self.backend
            .set(&slot, &encoded)
            .map_err(|_| DeployError::Keychain)?;
        public_status(target, slot, &key)
    }
    pub fn load(&self, target: &str) -> Result<DeploymentKey> {
        let raw = Zeroizing::new(
            self.backend
                .get(&slot(target)?)
                .map_err(|_| DeployError::Keychain)?
                .ok_or(DeployError::KeyMissing)?,
        );
        let key = PrivateKey::from_openssh(raw.as_bytes()).map_err(|_| DeployError::Keychain)?;
        if key.algorithm() != Algorithm::Ed25519 || key.is_encrypted() {
            return Err(DeployError::Keychain);
        }
        Ok(DeploymentKey(key))
    }
    pub fn status(&self, target: &str) -> Result<PublicKeyStatus> {
        let key = self.load(target)?;
        public_status(target, slot(target)?, &key.0)
    }
    pub fn delete(&self, target: &str) -> Result<()> {
        self.backend
            .delete(&slot(target)?)
            .map_err(|_| DeployError::Keychain)?;
        self.backend
            .delete(&password_slot(target)?)
            .map_err(|_| DeployError::Keychain)
    }
    /// FTP password. Lives only in the OS keychain, in its own slot; there is no read path to the renderer.
    pub fn set_password(&self, target: &str, password: &str) -> Result<()> {
        if password.is_empty()
            || password.len() > 1024
            || password.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
        {
            return Err(DeployError::InvalidInput);
        }
        self.backend
            .set(&password_slot(target)?, password)
            .map_err(|_| DeployError::Keychain)
    }
    pub fn password(&self, target: &str) -> Result<Zeroizing<String>> {
        self.backend
            .get(&password_slot(target)?)
            .map_err(|_| DeployError::Keychain)?
            .map(Zeroizing::new)
            .ok_or(DeployError::KeyMissing)
    }
    pub fn has_password(&self, target: &str) -> bool {
        self.password(target).is_ok()
    }
}
fn public_status(target: &str, slot: String, key: &PrivateKey) -> Result<PublicKeyStatus> {
    Ok(PublicKeyStatus {
        target_id: target.into(),
        slot,
        public_key: key
            .public_key()
            .to_openssh()
            .map_err(|_| DeployError::Keychain)?,
        fingerprint: key.public_key().fingerprint(HashAlg::Sha256).to_string(),
    })
}
/// Same OS credential service as the existing Somnia Agent store. No disk fallback.
#[cfg(feature = "desktop")]
pub struct OsKeychainBackend;
#[cfg(feature = "desktop")]
impl SecretBackend for OsKeychainBackend {
    fn get(
        &self,
        slot: &str,
    ) -> std::result::Result<Option<String>, crate::oauth_store::StoreError> {
        match keyring::Entry::new("de.philipp-paulik.somnia.agent", slot)
            .map_err(|_| crate::oauth_store::StoreError::Backend)?
            .get_password()
        {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(crate::oauth_store::StoreError::Backend),
        }
    }
    fn set(
        &self,
        slot: &str,
        value: &str,
    ) -> std::result::Result<(), crate::oauth_store::StoreError> {
        keyring::Entry::new("de.philipp-paulik.somnia.agent", slot)
            .map_err(|_| crate::oauth_store::StoreError::Backend)?
            .set_password(value)
            .map_err(|_| crate::oauth_store::StoreError::Backend)
    }
    fn delete(&self, slot: &str) -> std::result::Result<(), crate::oauth_store::StoreError> {
        match keyring::Entry::new("de.philipp-paulik.somnia.agent", slot)
            .map_err(|_| crate::oauth_store::StoreError::Backend)?
            .delete_credential()
        {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(crate::oauth_store::StoreError::Backend),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::oauth_store::MemoryBackend;
    #[test]
    fn generate_keychain_only_public_status() {
        let store = KeyStore::new(MemoryBackend::default());
        let status = store.create("site").unwrap();
        assert!(status.public_key.starts_with("ssh-ed25519 "));
        assert!(status.fingerprint.starts_with("SHA256:"));
        assert_eq!(store.create("site").unwrap_err(), DeployError::KeyExists);
        let key = store.load("site").unwrap();
        assert!(!format!("{key:?}").contains(&status.public_key));
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("PRIVATE"));
        assert_eq!(
            store.status("site").unwrap().fingerprint,
            status.fingerprint
        );
        store.delete("site").unwrap();
        assert!(matches!(store.load("site"), Err(DeployError::KeyMissing)));
        assert!(store.create("../site").is_err());
    }
    #[test]
    fn ftp_password_is_separate_zeroizing_and_deleted_with_the_target() {
        let store = KeyStore::new(MemoryBackend::default());
        assert!(!store.has_password("site"));
        assert!(store.set_password("site", "").is_err());
        assert!(store.set_password("site", "a\nb").is_err());
        assert!(store.set_password("../x", "pw").is_err());
        store.set_password("site", "hunter2").unwrap();
        assert!(store.has_password("site"));
        assert_eq!(&*store.password("site").unwrap(), "hunter2");
        store.set_password("site", "changed").unwrap();
        assert_eq!(&*store.password("site").unwrap(), "changed");
        store.delete("site").unwrap();
        assert!(!store.has_password("site"));
    }
}
