//! Typed SFTP operations only. Implementations must not follow symlinks in ancestors,
//! must confine every path to the site's root, and must never expose raw server errors.
use super::{DeployError, Result};
use std::collections::BTreeMap;
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteEntry {
    Directory,
    File { bytes: Vec<u8>, mode: u32 },
    Symlink(String),
}
#[allow(async_fn_in_trait)]
pub trait SshTransport {
    async fn mkdir(&mut self, path: &str) -> Result<()>;
    async fn read(&mut self, path: &str) -> Result<Vec<u8>>;
    async fn write(&mut self, path: &str, bytes: &[u8], mode: u32) -> Result<()>;
    async fn hash(&mut self, path: &str) -> Result<String>;
    async fn hard_link(&mut self, from: &str, to: &str) -> Result<()>;
    /// Must be an atomic POSIX rename (SFTP posix-rename extension, not delete+rename).
    async fn rename(&mut self, from: &str, to: &str) -> Result<()>;
    async fn symlink(&mut self, target: &str, path: &str) -> Result<()>;
    async fn read_link(&mut self, path: &str) -> Result<Option<String>>;
    async fn exists(&mut self, path: &str) -> Result<bool>;
    async fn list(&mut self, path: &str) -> Result<Vec<String>>;
    async fn remove_tree(&mut self, path: &str) -> Result<()>;
}
/// In-process remote filesystem; no host/address is accepted, so tests cannot reach a server.
#[derive(Default)]
pub struct MockSshTransport {
    pub entries: BTreeMap<String, RemoteEntry>,
    pub operations: Vec<&'static str>,
    pub fail_on_operation: Option<usize>,
}
impl MockSshTransport {
    fn tick(&mut self, operation: &'static str) -> Result<()> {
        self.operations.push(operation);
        if self.fail_on_operation == Some(self.operations.len()) {
            return Err(DeployError::Transport);
        }
        Ok(())
    }
    fn safe(&self, path: &str) -> Result<()> {
        if !path.starts_with("/srv/somnia/")
            || path.contains(['\\', '\0'])
            || path
                .split('/')
                .skip(1)
                .any(|p| p.is_empty() || matches!(p, "." | ".."))
        {
            return Err(DeployError::InvalidInput);
        }
        for (i, _) in path.match_indices('/').skip(1) {
            if matches!(self.entries.get(&path[..i]), Some(RemoteEntry::Symlink(_))) {
                return Err(DeployError::InvalidInput);
            }
        }
        Ok(())
    }
    fn parent(&self, path: &str) -> Result<()> {
        self.safe(path)?;
        if !matches!(
            self.entries
                .get(path.rsplit_once('/').ok_or(DeployError::InvalidInput)?.0),
            Some(RemoteEntry::Directory)
        ) {
            return Err(DeployError::Transport);
        }
        Ok(())
    }
}
impl SshTransport for MockSshTransport {
    async fn mkdir(&mut self, path: &str) -> Result<()> {
        self.tick("mkdir")?;
        self.safe(path)?;
        let mut prefix = String::new();
        for part in path.split('/').skip(1) {
            prefix.push('/');
            prefix.push_str(part);
            match self.entries.get(&prefix) {
                None => {
                    self.entries.insert(prefix.clone(), RemoteEntry::Directory);
                }
                Some(RemoteEntry::Directory) => {}
                _ => return Err(DeployError::Transport),
            }
        }
        Ok(())
    }
    async fn read(&mut self, path: &str) -> Result<Vec<u8>> {
        self.tick("read")?;
        self.safe(path)?;
        match self.entries.get(path) {
            Some(RemoteEntry::File { bytes, .. }) => Ok(bytes.clone()),
            _ => Err(DeployError::Transport),
        }
    }
    async fn write(&mut self, path: &str, bytes: &[u8], mode: u32) -> Result<()> {
        self.tick("write")?;
        self.parent(path)?;
        if !matches!(mode, 0o600 | 0o644 | 0o755)
            || matches!(
                self.entries.get(path),
                Some(RemoteEntry::Directory | RemoteEntry::Symlink(_))
            )
        {
            return Err(DeployError::InvalidInput);
        }
        self.entries.insert(
            path.into(),
            RemoteEntry::File {
                bytes: bytes.into(),
                mode,
            },
        );
        Ok(())
    }
    async fn hash(&mut self, path: &str) -> Result<String> {
        Ok(super::manifest::sha256(&self.read(path).await?))
    }
    async fn hard_link(&mut self, from: &str, to: &str) -> Result<()> {
        self.tick("hard_link")?;
        self.safe(from)?;
        self.parent(to)?;
        if self.entries.contains_key(to) {
            return Err(DeployError::Transport);
        }
        let entry = self
            .entries
            .get(from)
            .cloned()
            .ok_or(DeployError::Transport)?;
        if !matches!(entry, RemoteEntry::File { .. }) {
            return Err(DeployError::Transport);
        }
        self.entries.insert(to.into(), entry);
        Ok(())
    }
    async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        self.tick("rename")?;
        self.safe(from)?;
        self.parent(to)?;
        let entry = self
            .entries
            .get(from)
            .cloned()
            .ok_or(DeployError::Transport)?;
        if matches!(self.entries.get(to), Some(RemoteEntry::Directory)) {
            return Err(DeployError::Transport);
        }
        let children: Vec<_> = self
            .entries
            .iter()
            .filter(|(k, _)| k.starts_with(&format!("{from}/")))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        self.entries.remove(from);
        self.entries.insert(to.into(), entry);
        for (k, v) in children {
            self.entries.remove(&k);
            self.entries.insert(format!("{to}{}", &k[from.len()..]), v);
        }
        Ok(())
    }
    async fn symlink(&mut self, target: &str, path: &str) -> Result<()> {
        self.tick("symlink")?;
        self.parent(path)?;
        if self.entries.contains_key(path)
            || !target.starts_with("releases/")
            || !super::manifest::valid_id(&target[9..])
        {
            return Err(DeployError::InvalidInput);
        }
        self.entries
            .insert(path.into(), RemoteEntry::Symlink(target.into()));
        Ok(())
    }
    async fn read_link(&mut self, path: &str) -> Result<Option<String>> {
        self.tick("read_link")?;
        self.safe(path)?;
        match self.entries.get(path) {
            None => Ok(None),
            Some(RemoteEntry::Symlink(t)) => Ok(Some(t.clone())),
            _ => Err(DeployError::Transport),
        }
    }
    async fn exists(&mut self, path: &str) -> Result<bool> {
        self.tick("exists")?;
        self.safe(path)?;
        Ok(self.entries.contains_key(path))
    }
    async fn list(&mut self, path: &str) -> Result<Vec<String>> {
        self.tick("list")?;
        self.safe(path)?;
        if !matches!(self.entries.get(path), Some(RemoteEntry::Directory)) {
            return Err(DeployError::Transport);
        }
        Ok(self
            .entries
            .keys()
            .filter_map(|k| {
                k.strip_prefix(&format!("{path}/"))
                    .filter(|s| !s.contains('/'))
                    .map(str::to_owned)
            })
            .collect())
    }
    async fn remove_tree(&mut self, path: &str) -> Result<()> {
        self.tick("remove_tree")?;
        self.safe(path)?;
        self.entries
            .retain(|k, _| k != path && !k.starts_with(&format!("{path}/")));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn symlink_ancestors_and_escape_are_rejected() {
        let mut t = MockSshTransport::default();
        t.mkdir("/srv/somnia/site/releases/r-1").await.unwrap();
        t.symlink("releases/r-1", "/srv/somnia/site/current")
            .await
            .unwrap();
        for path in [
            "/srv/somnia/site/current/index.html",
            "/srv/somnia/site/../other/index.html",
            "/etc/passwd",
        ] {
            assert!(t.write(path, b"never", 0o644).await.is_err());
        }
        assert!(t
            .symlink("../../etc", "/srv/somnia/site/evil")
            .await
            .is_err());
    }
}
