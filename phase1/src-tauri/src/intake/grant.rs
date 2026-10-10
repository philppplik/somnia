//! Native, one-shot grants. The consumed bit is set before opening the file.
use super::identity::FileVersion;
use std::{collections::HashMap, fs::File, io::Read, path::PathBuf};

pub const GRANT_TTL_MS: u64 = 120_000;
pub const RETRY_TTL_MS: u64 = 60_000;
/// Matches the service's media read ceiling; text/model limits remain downstream.
pub const MAX_READ_BYTES: u64 = crate::service::MAX_MEDIA_BYTES as u64;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GrantFault {
    Unknown,
    Consumed,
    Revoked,
    Expired,
    ChangedOrDeleted,
    Permission,
    Io,
    TooLarge,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum GrantState {
    Issued,
    Consumed,
    Revoked,
}
struct Grant {
    request_id: String,
    ordinal: u32,
    path: PathBuf,
    version: FileVersion,
    issued_at_ms: u64,
    state: GrantState,
}
/// Not serializable and deliberately not Debug: tokens and paths stay host-only.
#[derive(Default)]
pub struct Grants {
    grants: HashMap<String, Grant>,
}
pub struct GrantBytes {
    pub bytes: Vec<u8>,
    pub identity_token: String,
    pub size: u64,
}

impl Grants {
    pub fn issue(
        &mut self,
        request_id: &str,
        ordinal: u32,
        path: PathBuf,
        version: FileVersion,
        now_ms: u64,
    ) -> String {
        // Bound host capability storage to one grant per live request item.
        self.grants
            .retain(|_, grant| grant.request_id != request_id || grant.ordinal != ordinal);
        let id = super::queue::new_id(now_ms);
        self.grants.insert(
            id.clone(),
            Grant {
                request_id: request_id.into(),
                ordinal,
                path,
                version,
                issued_at_ms: now_ms,
                state: GrantState::Issued,
            },
        );
        id
    }
    pub fn association(&self, token: &str) -> Option<(String, u32)> {
        self.grants
            .get(token)
            .map(|g| (g.request_id.clone(), g.ordinal))
    }
    pub fn read(&mut self, token: &str, now_ms: u64) -> Result<GrantBytes, GrantFault> {
        let grant = self.grants.get_mut(token).ok_or(GrantFault::Unknown)?;
        match grant.state {
            GrantState::Consumed => return Err(GrantFault::Consumed),
            GrantState::Revoked => return Err(GrantFault::Revoked),
            GrantState::Issued => {}
        }
        // Every attempted use consumes it, including expiry and a failed read.
        grant.state = GrantState::Consumed;
        if now_ms < grant.issued_at_ms || now_ms.saturating_sub(grant.issued_at_ms) >= GRANT_TTL_MS
        {
            return Err(GrantFault::Expired);
        }
        let current = FileVersion::stat(&grant.path).map_err(map_io)?;
        if current != grant.version {
            return Err(GrantFault::ChangedOrDeleted);
        }
        if current.size > MAX_READ_BYTES {
            return Err(GrantFault::TooLarge);
        }
        let file = File::open(&grant.path).map_err(map_io)?;
        // Check the opened HANDLE as well. A rename/replacement between stat and
        // open cannot substitute another file even if its size/mtime match.
        let opened = FileVersion::from_metadata(&grant.path, &file.metadata().map_err(map_io)?)
            .map_err(map_io)?;
        if opened != grant.version {
            return Err(GrantFault::ChangedOrDeleted);
        }
        let mut bytes = Vec::new();
        let mut limited = (&file).take(MAX_READ_BYTES + 1);
        limited.read_to_end(&mut bytes).map_err(map_io)?;
        if bytes.len() as u64 > MAX_READ_BYTES {
            return Err(GrantFault::TooLarge);
        }
        let after = FileVersion::from_metadata(&grant.path, &file.metadata().map_err(map_io)?)
            .map_err(map_io)?;
        if after != grant.version || bytes.len() as u64 != grant.version.size {
            return Err(GrantFault::ChangedOrDeleted);
        }
        // A removed/replaced pathname also fails, even if the open handle survived.
        if FileVersion::stat(&grant.path).map_err(map_io)? != grant.version {
            return Err(GrantFault::ChangedOrDeleted);
        }
        Ok(GrantBytes {
            size: bytes.len() as u64,
            identity_token: grant.version.identity.token.clone(),
            bytes,
        })
    }
    pub fn revoke_request(&mut self, id: &str) {
        for grant in self.grants.values_mut().filter(|g| g.request_id == id) {
            grant.state = GrantState::Revoked;
        }
    }
    pub fn forget_request(&mut self, id: &str) {
        self.grants.retain(|_, g| g.request_id != id);
    }
}
fn map_io(error: std::io::Error) -> GrantFault {
    match error.kind() {
        std::io::ErrorKind::NotFound | std::io::ErrorKind::InvalidInput => {
            GrantFault::ChangedOrDeleted
        }
        std::io::ErrorKind::PermissionDenied => GrantFault::Permission,
        _ => GrantFault::Io,
    }
}
