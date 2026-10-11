//! One-shot grants for folders selected by a trusted native chooser.
//!
//! This registry only verifies the native selection and binds it to a window.
//! Filesystem confinement belongs to the policy executor. Canonicalization here
//! is NOT a sandbox and must not be used as a replacement for safe directory IO.
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[derive(Debug, PartialEq, Eq)]
pub enum GrantError {
    UntrustedWindow,
    InvalidFolder,
    MissingOrExpired,
    TooManyPending,
}

struct Grant {
    window: String,
    folder: PathBuf,
    issued: Instant,
}

pub struct FolderGrants {
    pending: HashMap<String, Grant>,
    ttl: Duration,
    max_pending: usize,
}

impl Default for FolderGrants {
    fn default() -> Self {
        Self {
            pending: HashMap::new(),
            ttl: Duration::from_secs(120),
            max_pending: 16,
        }
    }
}

impl FolderGrants {
    /// Call only after a native folder chooser returns the selected folder.
    /// Never expose this operation with a renderer-provided path parameter.
    pub fn issue_from_native_selection(
        &mut self,
        window: &str,
        folder: &Path,
    ) -> Result<String, GrantError> {
        self.issue_at(window, folder, Instant::now())
    }

    fn issue_at(
        &mut self,
        window: &str,
        folder: &Path,
        now: Instant,
    ) -> Result<String, GrantError> {
        if window != "main" {
            return Err(GrantError::UntrustedWindow);
        }
        self.pending
            .retain(|_, grant| now.saturating_duration_since(grant.issued) < self.ttl);
        if self.pending.len() >= self.max_pending {
            return Err(GrantError::TooManyPending);
        }
        // Selected folder itself must not be a symlink. Nested entries are
        // validated later by checkpoint/policy services, including race checks.
        let meta = std::fs::symlink_metadata(folder).map_err(|_| GrantError::InvalidFolder)?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(GrantError::InvalidFolder);
        }
        let canonical = std::fs::canonicalize(folder).map_err(|_| GrantError::InvalidFolder)?;
        if canonical.parent().is_none() {
            return Err(GrantError::InvalidFolder);
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.pending.insert(
            id.clone(),
            Grant {
                window: window.into(),
                folder: canonical,
                issued: now,
            },
        );
        Ok(id)
    }

    pub fn consume(&mut self, window: &str, id: &str) -> Result<PathBuf, GrantError> {
        self.consume_at(window, id, Instant::now())
    }

    fn consume_at(&mut self, window: &str, id: &str, now: Instant) -> Result<PathBuf, GrantError> {
        if window != "main" {
            return Err(GrantError::UntrustedWindow);
        }
        let grant = self.pending.get(id).ok_or(GrantError::MissingOrExpired)?;
        if grant.window != window {
            return Err(GrantError::UntrustedWindow);
        }
        if now.saturating_duration_since(grant.issued) >= self.ttl {
            self.pending.remove(id);
            return Err(GrantError::MissingOrExpired);
        }
        let grant = self
            .pending
            .remove(id)
            .ok_or(GrantError::MissingOrExpired)?;
        let meta =
            std::fs::symlink_metadata(&grant.folder).map_err(|_| GrantError::InvalidFolder)?;
        let canonical =
            std::fs::canonicalize(&grant.folder).map_err(|_| GrantError::InvalidFolder)?;
        if !meta.is_dir() || meta.file_type().is_symlink() || canonical != grant.folder {
            return Err(GrantError::InvalidFolder);
        }
        Ok(grant.folder)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_token_does_not_consume_real_grant_and_tokens_are_one_shot() {
        let folder = tempfile::tempdir().unwrap();
        let mut registry = FolderGrants::default();
        let id = registry
            .issue_from_native_selection("main", folder.path())
            .unwrap();
        assert_eq!(
            registry.consume("main", "forged"),
            Err(GrantError::MissingOrExpired)
        );
        assert_eq!(
            registry.consume("main", &id).unwrap(),
            std::fs::canonicalize(folder.path()).unwrap()
        );
        assert_eq!(
            registry.consume("main", &id),
            Err(GrantError::MissingOrExpired)
        );
    }
    #[test]
    fn untrusted_window_cannot_issue_or_consume() {
        let folder = tempfile::tempdir().unwrap();
        let mut registry = FolderGrants::default();
        assert_eq!(
            registry.issue_from_native_selection("extension", folder.path()),
            Err(GrantError::UntrustedWindow)
        );
        let id = registry
            .issue_from_native_selection("main", folder.path())
            .unwrap();
        assert_eq!(
            registry.consume("extension", &id),
            Err(GrantError::UntrustedWindow)
        );
        assert!(registry.consume("main", &id).is_ok());
    }
    #[test]
    fn expiration_is_checked_at_consumption() {
        let folder = tempfile::tempdir().unwrap();
        let mut registry = FolderGrants::default();
        let issued = Instant::now();
        let id = registry.issue_at("main", folder.path(), issued).unwrap();
        assert_eq!(
            registry.consume_at("main", &id, issued + Duration::from_secs(120)),
            Err(GrantError::MissingOrExpired)
        );
    }
    #[test]
    fn pending_grants_are_bounded_and_expired_slots_are_reclaimed() {
        let folder = tempfile::tempdir().unwrap();
        let mut registry = FolderGrants {
            max_pending: 1,
            ..Default::default()
        };
        let now = Instant::now();
        registry.issue_at("main", folder.path(), now).unwrap();
        assert_eq!(
            registry.issue_at("main", folder.path(), now),
            Err(GrantError::TooManyPending)
        );
        assert!(registry
            .issue_at("main", folder.path(), now + Duration::from_secs(120))
            .is_ok());
    }
    #[test]
    fn removed_directory_is_not_returned_as_valid() {
        let folder = tempfile::tempdir().unwrap();
        let child = folder.path().join("selected");
        std::fs::create_dir(&child).unwrap();
        let mut registry = FolderGrants::default();
        let id = registry
            .issue_from_native_selection("main", &child)
            .unwrap();
        std::fs::remove_dir(&child).unwrap();
        assert_eq!(
            registry.consume("main", &id),
            Err(GrantError::InvalidFolder)
        );
    }
    #[cfg(unix)]
    #[test]
    fn symlink_and_root_selection_are_rejected() {
        let folder = tempfile::tempdir().unwrap();
        let link = folder.path().join("link");
        std::os::unix::fs::symlink(folder.path(), &link).unwrap();
        let mut registry = FolderGrants::default();
        assert_eq!(
            registry.issue_from_native_selection("main", &link),
            Err(GrantError::InvalidFolder)
        );
        assert_eq!(
            registry.issue_from_native_selection("main", Path::new("/")),
            Err(GrantError::InvalidFolder)
        );
    }
}
