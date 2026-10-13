use super::{
    manifest::{diff, valid_id, DeployArtifactDiff, DeployArtifactManifest, MANIFEST_FILE},
    transport::SshTransport,
    DeployError, Result,
};
use std::collections::BTreeMap;
/// Sortable UTC Unix-second id plus the canonical artifact hash. No local paths or secrets.
pub fn release_id(now: std::time::SystemTime, manifest: &DeployArtifactManifest) -> Result<String> {
    let seconds = now
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| DeployError::InvalidInput)?
        .as_secs();
    Ok(format!("{seconds:020}-{}", &manifest.digest()?[..12]))
}
/// Callers own pinned-host verification and human approval before mutating operations.
#[derive(Debug, Clone)]
pub struct ReleaseLayout {
    root: String,
}
impl ReleaseLayout {
    pub fn new(site: &str) -> Result<Self> {
        if !valid_id(site) {
            return Err(DeployError::InvalidInput);
        }
        Ok(Self {
            root: format!("/srv/somnia/{site}"),
        })
    }
    pub fn root(&self) -> &str {
        &self.root
    }
    pub fn releases(&self) -> String {
        format!("{}/releases", self.root)
    }
    pub fn current(&self) -> String {
        format!("{}/current", self.root)
    }
    pub fn release(&self, id: &str) -> Result<String> {
        if !valid_id(id) {
            return Err(DeployError::InvalidInput);
        }
        Ok(format!("{}/{id}", self.releases()))
    }
    pub fn partial(&self, id: &str) -> Result<String> {
        Ok(format!("{}.partial", self.release(id)?))
    }
    pub async fn current_release<T: SshTransport>(&self, t: &mut T) -> Result<Option<String>> {
        let link = t.read_link(&self.current()).await?;
        match link {
            None => Ok(None),
            Some(s) => {
                let id = s
                    .strip_prefix("releases/")
                    .ok_or(DeployError::InvalidInput)?;
                self.release(id)?;
                Ok(Some(id.into()))
            }
        }
    }
    pub async fn read_manifest<T: SshTransport>(
        &self,
        t: &mut T,
        id: &str,
    ) -> Result<DeployArtifactManifest> {
        let raw = t
            .read(&format!("{}/{MANIFEST_FILE}", self.release(id)?))
            .await?;
        if raw.len() > 32 * 1024 * 1024 {
            return Err(DeployError::Integrity);
        }
        let m: DeployArtifactManifest =
            serde_json::from_slice(&raw).map_err(|_| DeployError::Integrity)?;
        m.validate()?;
        Ok(m)
    }
    /// Upload/verify a complete immutable release. Failures leave only an unserved partial.
    /// Reuses unchanged files only after re-hashing remote bytes, not trusting stale manifests.
    pub async fn stage<T: SshTransport>(
        &self,
        t: &mut T,
        id: &str,
        manifest: &DeployArtifactManifest,
        files: &BTreeMap<String, Vec<u8>>,
    ) -> Result<DeployArtifactDiff> {
        self.stage_progress(t, id, manifest, files, &|_, _| Ok(())).await
    }
    /// Progress is reported only after each verified file; callback may cancel before switch.
    pub async fn stage_progress<T: SshTransport>(
        &self, t: &mut T, id: &str, manifest: &DeployArtifactManifest,
        files: &BTreeMap<String, Vec<u8>>, progress: &dyn Fn(usize, usize) -> Result<()>,
    ) -> Result<DeployArtifactDiff> {
        manifest.verify_bytes(files)?;
        progress(0, manifest.files.len())?;
        let ready = self.release(id)?;
        let partial = self.partial(id)?;
        if t.exists(&ready).await? {
            return Err(DeployError::ReleaseExists);
        }
        let old_id = self.current_release(t).await?;
        let old = match &old_id {
            Some(old) => Some(self.read_manifest(t, old).await?),
            None => None,
        };
        let changes = diff(old.as_ref(), manifest)?;
        // Never silently reuse an interrupted partial: start a clean, unserved directory.
        if t.exists(&partial).await? {
            t.remove_tree(&partial).await?;
        }
        t.mkdir(&partial).await?;
        for (index, file) in manifest.files.iter().enumerate() {
            let destination = format!("{partial}/{}", file.path);
            if let Some((parent, _)) = destination.rsplit_once('/') {
                t.mkdir(parent).await?;
            }
            if changes.unchanged.iter().any(|f| f.path == file.path) {
                let source = format!(
                    "{}/{}",
                    self.release(old_id.as_ref().ok_or(DeployError::Integrity)?)?,
                    file.path
                );
                if t.hash(&source).await? != file.sha256 {
                    return Err(DeployError::Integrity);
                }
                t.hard_link(&source, &destination).await?;
            } else {
                t.write(
                    &destination,
                    files.get(&file.path).ok_or(DeployError::Integrity)?,
                    file.mode,
                )
                .await?;
            }
            if t.hash(&destination).await? != file.sha256 {
                return Err(DeployError::Integrity);
            }
            progress(index + 1, manifest.files.len())?;
        }
        t.write(
            &format!("{partial}/{MANIFEST_FILE}"),
            &serde_json::to_vec(manifest).map_err(|_| DeployError::InvalidInput)?,
            0o644,
        )
        .await?;
        t.rename(&partial, &ready).await?;
        Ok(changes)
    }
    /// Create a new symlink then atomically replace current. Never delete current first.
    /// Re-verifies all release files, including during rollback.
    pub async fn activate<T: SshTransport>(&self, t: &mut T, id: &str) -> Result<Option<String>> {
        let manifest = self.read_manifest(t, id).await?;
        for file in &manifest.files {
            if t.hash(&format!("{}/{}", self.release(id)?, file.path))
                .await?
                != file.sha256
            {
                return Err(DeployError::Integrity);
            }
        }
        let previous = self.current_release(t).await?;
        let pending = format!("{}/current.new", self.root);
        if t.exists(&pending).await? {
            t.remove_tree(&pending).await?;
        }
        t.symlink(&format!("releases/{id}"), &pending).await?;
        t.rename(&pending, &self.current()).await?;
        Ok(previous)
    }
    pub async fn cleanup_partials<T: SshTransport>(&self, t: &mut T) -> Result<usize> {
        let mut count = 0;
        for name in t.list(&self.releases()).await? {
            if let Some(id) = name.strip_suffix(".partial") {
                if valid_id(id) {
                    t.remove_tree(&self.partial(id)?).await?;
                    count += 1;
                }
            }
        }
        Ok(count)
    }
    /// Release ids are UTC-sortable. The current release is always retained.
    pub async fn prune<T: SshTransport>(&self, t: &mut T, keep: usize) -> Result<Vec<String>> {
        if keep == 0 {
            return Err(DeployError::InvalidInput);
        }
        let current = self.current_release(t).await?;
        let mut names = t.list(&self.releases()).await?;
        names.retain(|id| valid_id(id));
        names.sort();
        names.reverse();
        let mut retained = usize::from(current.is_some());
        let mut removed = Vec::new();
        for id in names {
            if current.as_deref() == Some(&id) {
                continue;
            }
            if retained < keep {
                retained += 1;
            } else {
                t.remove_tree(&self.release(&id)?).await?;
                removed.push(id);
            }
        }
        Ok(removed)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::{
        manifest::{sha256, DeployArtifactFile, DeployArtifactKind},
        transport::MockSshTransport,
    };
    fn artifact(value: &[u8]) -> (DeployArtifactManifest, BTreeMap<String, Vec<u8>>) {
        (
            DeployArtifactManifest {
                kind: DeployArtifactKind::Static,
                files: vec![DeployArtifactFile {
                    path: "index.html".into(),
                    sha256: sha256(value),
                    size: value.len() as u64,
                    mode: 0o644,
                }],
                entry: None,
                engines: None,
                port: None,
                build_id: "build".into(),
            },
            BTreeMap::from([("index.html".into(), value.to_vec())]),
        )
    }
    #[tokio::test]
    async fn switch_rollback_and_link_reuse() {
        let l = ReleaseLayout::new("site").unwrap();
        let mut t = MockSshTransport::default();
        let (m, f) = artifact(b"old");
        l.stage(&mut t, "r-1", &m, &f).await.unwrap();
        assert_eq!(l.current_release(&mut t).await.unwrap(), None);
        assert_eq!(l.activate(&mut t, "r-1").await.unwrap(), None);
        l.stage(&mut t, "r-2", &m, &f).await.unwrap();
        assert!(t.operations.contains(&"hard_link"));
        assert_eq!(l.activate(&mut t, "r-2").await.unwrap(), Some("r-1".into()));
        l.activate(&mut t, "r-1").await.unwrap();
        assert_eq!(l.current_release(&mut t).await.unwrap(), Some("r-1".into()));
        assert_eq!(l.prune(&mut t, 1).await.unwrap(), vec!["r-2"]);
    }
    #[tokio::test]
    async fn every_interruption_preserves_live_release() {
        let l = ReleaseLayout::new("site").unwrap();
        let (old, of) = artifact(b"old");
        let (new, nf) = artifact(b"new");
        let mut base = MockSshTransport::default();
        l.stage(&mut base, "r-1", &old, &of).await.unwrap();
        l.activate(&mut base, "r-1").await.unwrap();
        let mut successful = MockSshTransport {
            entries: base.entries.clone(),
            ..Default::default()
        };
        l.stage(&mut successful, "r-2", &new, &nf).await.unwrap();
        l.activate(&mut successful, "r-2").await.unwrap();
        let switch_operation = successful.operations.len();
        for failure in 1..=switch_operation {
            let mut t = MockSshTransport {
                entries: base.entries.clone(),
                fail_on_operation: Some(failure),
                ..Default::default()
            };
            let result = l.stage(&mut t, "r-2", &new, &nf).await;
            if result.is_ok() {
                let _ = l.activate(&mut t, "r-2").await;
            }
            t.fail_on_operation = None;
            let live = l.current_release(&mut t).await.unwrap().unwrap();
            // Every failed operation, including the final rename, leaves the old link.
            assert_eq!(live, "r-1", "failed operation {failure}");
            let actual = t
                .read(&format!("{}/index.html", l.release(&live).unwrap()))
                .await
                .unwrap();
            assert!(actual == b"old" || actual == b"new");
        }
    }
    #[tokio::test]
    async fn tamper_and_bad_artifact_never_switch() {
        let l = ReleaseLayout::new("site").unwrap();
        let mut t = MockSshTransport::default();
        let (m, f) = artifact(b"old");
        l.stage(&mut t, "r-1", &m, &f).await.unwrap();
        l.activate(&mut t, "r-1").await.unwrap();
        t.write(
            &format!("{}/index.html", l.release("r-1").unwrap()),
            b"tamper",
            0o644,
        )
        .await
        .unwrap();
        assert_eq!(
            l.stage(&mut t, "r-2", &m, &f).await.unwrap_err(),
            DeployError::Integrity
        );
        assert!(l.activate(&mut t, "r-1").await.is_err());
        assert_eq!(l.current_release(&mut t).await.unwrap(), Some("r-1".into()));
        let mut bad = f.clone();
        bad.insert(".env".into(), b"secret".to_vec());
        assert!(l.stage(&mut t, "r-3", &m, &bad).await.is_err());
        assert!(!t.exists(&l.partial("r-3").unwrap()).await.unwrap());
        assert_eq!(l.cleanup_partials(&mut t).await.unwrap(), 1);
    }
}
