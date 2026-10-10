//! Bounded native intake state machine. No disk persistence, no renderer paths.
use super::{
    grant::{GrantFault, Grants, RETRY_TTL_MS},
    identity::{FileIdentity, FileVersion},
    parse::ParsedRequest,
    policy::IntakePolicy,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::PathBuf,
};

pub const MAX_REQUESTS: usize = 8;
pub const COALESCE_WINDOW_MS: u64 = 300;
pub const DEDUPE_WINDOW_MS: u64 = 2_000;
pub const CLAIM_TIMEOUT_MS: u64 = 300_000;
const MAX_ITEMS: usize = 64;

/// Host-generated ULID, using UUID's OS-random entropy without another dependency.
pub(crate) fn new_id(now_ms: u64) -> String {
    let entropy = uuid::Uuid::new_v4().as_u128() & ((1u128 << 80) - 1);
    let mut value = ((now_ms as u128 & ((1u128 << 48) - 1)) << 80) | entropy;
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut out = [b'0'; 26];
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET.get((value & 31) as usize).copied().unwrap_or(b'0');
        value >>= 5;
    }
    out.iter().map(|v| char::from(*v)).collect()
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum OpenSource {
    ColdArgv,
    SecondInstance,
    OsOpen,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RequestState {
    Queued,
    Claimed,
    Terminal,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailureClass {
    Io,
    Permission,
    TooLarge,
    Locked,
    ChangedOrDeleted,
    Parse,
    Routing,
    Limit,
    Internal,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ItemState {
    Queued,
    Claimed,
    Opened,
    Failed(FailureClass),
    Cancelled,
    Deferred,
    ActivatedExisting,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenItemSummary {
    pub ordinal: u32,
    pub display_name: String,
    pub ext: String,
    pub size: u64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequestSummary {
    pub id: String,
    pub source: OpenSource,
    pub generation: u64,
    pub reset_count: u8,
    pub items: Vec<OpenItemSummary>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedItem {
    pub ordinal: u32,
    pub display_name: String,
    pub ext: String,
    pub size: u64,
    pub grant: Option<String>,
    pub identity_token: String,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_project_id: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimReply {
    pub items: Vec<ClaimedItem>,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OutcomeStatus {
    Opened,
    Failed,
    Cancelled,
    Deferred,
    ActivatedExisting,
    Rejected,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemOutcome {
    pub ordinal: u32,
    pub status: OutcomeStatus,
    pub cause: Option<FailureClass>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryToken {
    pub ordinal: u32,
    pub token: String,
    pub expires_at_ms: u64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AckReply {
    pub accepted: Vec<u32>,
    pub retry_tokens: Vec<RetryToken>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantRead {
    pub name: String,
    pub ext: String,
    pub size: u64,
    pub identity_token: String,
    pub data_base64: String,
}

/// Strictly allowlisted diagnostic metadata. No names, paths, identities or secrets.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeEvent {
    pub id: &'static str,
    pub corr: String,
    pub ordinal: Option<u32>,
    pub cause: &'static str,
    pub expected: bool,
    pub count: usize,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeError {
    pub id: &'static str,
    pub code: &'static str,
    pub message: &'static str,
    pub expected: bool,
    pub corr: String,
    pub ordinal: Option<u32>,
}
impl IntakeError {
    pub(crate) fn denied() -> Self {
        Self {
            id: "SOM-ACL-001",
            code: "ipc-denied",
            message: "Only the trusted editor may access intake",
            expected: false,
            corr: String::new(),
            ordinal: None,
        }
    }
}
struct OpenItem {
    ordinal: u32,
    identity: FileIdentity,
    display_name: String,
    ext: String,
    size: u64,
    path: PathBuf,
    version: FileVersion,
    state: ItemState,
}
struct OpenRequest {
    id: String,
    source: OpenSource,
    created_at_ms: u64,
    claimed_at_ms: Option<u64>,
    claim_ordinals: HashSet<u32>,
    generation: u64,
    state: RequestState,
    items: Vec<OpenItem>,
    resets: u8,
}
struct RetryGrant {
    request_id: String,
    ordinal: u32,
    version_hash: String,
    expires_at_ms: u64,
}
#[derive(Default)]
pub struct OpenQueue {
    requests: VecDeque<OpenRequest>,
    generation: u64,
    policy: IntakePolicy,
    grants: Grants,
    retries: HashMap<String, RetryGrant>,
    events: Vec<IntakeEvent>,
    existing: HashMap<String, String>,
}
#[derive(Clone, Debug)]
pub struct EnqueueReport {
    pub request_id: Option<String>,
    pub count: usize,
    pub rejected: usize,
}
impl OpenQueue {
    pub fn policy(&self) -> IntakePolicy {
        self.policy
    }
    pub fn set_policy(&mut self, policy: IntakePolicy) {
        self.policy = policy;
    }
    /// Integrator refreshes from Backend.projects under the same existing mutex.
    pub fn set_existing_projects(
        &mut self,
        entries: impl IntoIterator<Item = (FileIdentity, String)>,
    ) {
        self.existing = entries.into_iter().map(|(i, p)| (i.token, p)).collect();
    }
    pub fn take_events(&mut self) -> Vec<IntakeEvent> {
        std::mem::take(&mut self.events)
    }
    pub fn pending_count(&self) -> usize {
        self.requests
            .iter()
            .filter(|r| r.state == RequestState::Queued)
            .count()
    }
    fn event(
        &mut self,
        id: &'static str,
        corr: &str,
        ordinal: Option<u32>,
        cause: &'static str,
        expected: bool,
        count: usize,
    ) {
        self.events.push(IntakeEvent {
            id,
            corr: corr.into(),
            ordinal,
            cause,
            expected,
            count,
        });
    }
    fn fault(&mut self, corr: &str, ordinal: Option<u32>, cause: &'static str) -> IntakeError {
        self.event("SOM-APP-002", corr, ordinal, cause, false, 1);
        IntakeError {
            id: "SOM-APP-002",
            code: cause,
            message: "The requested item could not be opened",
            expected: false,
            corr: corr.into(),
            ordinal,
        }
    }
    pub fn report_item_failure(
        &mut self,
        id: &str,
        ordinal: u32,
        class: FailureClass,
    ) -> IntakeError {
        if class == FailureClass::Locked {
            self.event("SOM-FS-006", id, Some(ordinal), "lock-conflict", false, 1);
            IntakeError {
                id: "SOM-FS-006",
                code: "lock-conflict",
                message: "Another process has this file open",
                expected: false,
                corr: id.into(),
                ordinal: Some(ordinal),
            }
        } else {
            self.fault(id, Some(ordinal), failure_code(class))
        }
    }
    pub fn enqueue(
        &mut self,
        source: OpenSource,
        parsed: ParsedRequest,
        now_ms: u64,
    ) -> EnqueueReport {
        self.prune(now_ms);
        let mut id = new_id(now_ms);
        if let Some(last) = self.requests.back().filter(|r| {
            r.state == RequestState::Queued
                && now_ms >= r.created_at_ms
                && now_ms - r.created_at_ms <= COALESCE_WINDOW_MS
        }) {
            id = last.id.clone();
        }
        let offset = self
            .requests
            .back()
            .filter(|r| r.id == id && r.state == RequestState::Queued)
            .and_then(|r| r.items.iter().map(|i| i.ordinal).max())
            .map_or(0, |n| n.saturating_add(1));
        let rejected = parsed.rejected.len();
        for item in parsed.rejected {
            let cause = item.reason.cause_code();
            let overflow = matches!(
                cause,
                "files" | "length" | "too-many-files" | "argv-too-long"
            );
            self.event(
                if overflow {
                    "SOM-APP-008"
                } else {
                    "SOM-APP-011"
                },
                &id,
                Some(offset.saturating_add(item.ordinal)),
                cause,
                item.reason.expected(),
                1,
            );
        }
        let queued: HashSet<_> = self
            .requests
            .iter()
            .filter(|r| {
                r.state == RequestState::Queued
                    && now_ms.saturating_sub(r.created_at_ms) <= DEDUPE_WINDOW_MS
            })
            .flat_map(|r| r.items.iter().map(|i| i.identity.clone()))
            .collect();
        let mut seen = queued;
        let mut items = Vec::new();
        for item in parsed.items {
            if !seen.insert(item.identity.clone()) {
                continue;
            }
            match FileVersion::stat(&item.canonical) {
                Ok(version) if version.identity == item.identity && version.size == item.size => {
                    items.push(OpenItem {
                        ordinal: offset.saturating_add(item.ordinal),
                        identity: item.identity,
                        display_name: item.display_name,
                        ext: item.ext,
                        size: item.size,
                        path: item.canonical,
                        version,
                        state: ItemState::Queued,
                    })
                }
                _ => {
                    self.fault(&id, Some(item.ordinal), "changed-or-deleted");
                }
            }
        }
        if items.is_empty() {
            return EnqueueReport {
                request_id: None,
                count: self.pending_count(),
                rejected,
            };
        }
        self.generation = self.generation.saturating_add(1);
        if let Some(last) = self
            .requests
            .back_mut()
            .filter(|r| r.id == id && r.state == RequestState::Queued)
        {
            let available = MAX_ITEMS.saturating_sub(last.items.len());
            let excess = items.len().saturating_sub(available);
            for item in items.into_iter().take(available) {
                last.items.push(item);
            }
            last.generation = self.generation;
            if excess > 0 {
                self.event("SOM-APP-008", &id, None, "files", false, excess);
            }
        } else {
            if self.requests.len() >= MAX_REQUESTS {
                if let Some(index) = self
                    .requests
                    .iter()
                    .position(|r| r.state == RequestState::Queued)
                {
                    if let Some(old) = self.requests.remove(index) {
                        self.grants.forget_request(&old.id);
                        self.retries.retain(|_, t| t.request_id != old.id);
                    }
                    self.event("SOM-APP-008", &id, None, "requests", false, 1);
                } else {
                    self.event("SOM-APP-008", &id, None, "requests", false, 1);
                    return EnqueueReport {
                        request_id: None,
                        count: self.pending_count(),
                        rejected,
                    };
                }
            }
            let excess = items.len().saturating_sub(MAX_ITEMS);
            items.truncate(MAX_ITEMS);
            if excess > 0 {
                self.event("SOM-APP-008", &id, None, "files", false, excess);
            }
            self.requests.push_back(OpenRequest {
                id: id.clone(),
                source,
                created_at_ms: now_ms,
                claimed_at_ms: None,
                claim_ordinals: HashSet::new(),
                generation: self.generation,
                state: RequestState::Queued,
                items,
                resets: 0,
            });
        }
        EnqueueReport {
            request_id: Some(id),
            count: self.pending_count(),
            rejected,
        }
    }
    pub fn drain(&self) -> Vec<OpenRequestSummary> {
        self.requests
            .iter()
            .filter(|r| r.state == RequestState::Queued)
            .map(|r| OpenRequestSummary {
                id: r.id.clone(),
                source: r.source,
                generation: r.generation,
                reset_count: r.resets,
                items: r
                    .items
                    .iter()
                    .filter(|i| i.state == ItemState::Queued)
                    .map(summary)
                    .collect(),
            })
            .collect()
    }
    pub fn claim(&mut self, id: &str, now_ms: u64) -> Result<ClaimReply, IntakeError> {
        self.prune(now_ms);
        let index = match self.requests.iter().position(|r| r.id == id) {
            Some(i) => i,
            None => return Err(self.fault(id, None, "unknown-request")),
        };
        if self
            .requests
            .iter()
            .any(|r| r.state == RequestState::Claimed)
        {
            return Err(self.fault(id, None, "claim-busy"));
        }
        let request = match self.requests.get_mut(index) {
            Some(r) if r.state == RequestState::Queued => r,
            _ => return Err(self.fault(id, None, "already-claimed")),
        };
        request.state = RequestState::Claimed;
        request.claimed_at_ms = Some(now_ms);
        request.claim_ordinals.clear();
        let mut items = Vec::new();
        for item in request
            .items
            .iter_mut()
            .filter(|i| i.state == ItemState::Queued)
        {
            request.claim_ordinals.insert(item.ordinal);
            let existing = self.existing.get(&item.identity.token).cloned();
            let grant = if existing.is_some() {
                item.state = ItemState::ActivatedExisting;
                None
            } else {
                item.state = ItemState::Claimed;
                Some(self.grants.issue(
                    id,
                    item.ordinal,
                    item.path.clone(),
                    item.version.clone(),
                    now_ms,
                ))
            };
            items.push(claimed(item, grant, existing));
        }
        Ok(ClaimReply { items })
    }
    pub fn read_by_grant(&mut self, grant: &str, now_ms: u64) -> Result<GrantRead, IntakeError> {
        let association = self.grants.association(grant);
        let (id, ordinal) = association.clone().unwrap_or_default();
        let bytes = self
            .grants
            .read(grant, now_ms)
            .map_err(|e| self.fault(&id, association.map(|(_, o)| o), grant_code(e)))?;
        let item = self
            .requests
            .iter()
            .find(|r| r.id == id)
            .and_then(|r| r.items.iter().find(|i| i.ordinal == ordinal));
        let (name, ext) = match item {
            Some(i) => (i.display_name.clone(), i.ext.clone()),
            None => return Err(self.fault(&id, Some(ordinal), "unknown-item")),
        };
        Ok(GrantRead {
            name,
            ext,
            size: bytes.size,
            identity_token: bytes.identity_token,
            data_base64: base64(&bytes.bytes),
        })
    }
    /// Acknowledgement NEVER emits a defect. The decision/read boundary owns it.
    pub fn ack(
        &mut self,
        id: &str,
        outcomes: Vec<ItemOutcome>,
        now_ms: u64,
    ) -> Result<AckReply, IntakeError> {
        let invalid = || IntakeError {
            id: "SOM-APP-002",
            code: "invalid-ack",
            message: "Acknowledgement does not match claimed items",
            expected: false,
            corr: id.into(),
            ordinal: None,
        };
        let request = self
            .requests
            .iter_mut()
            .find(|r| r.id == id && r.state == RequestState::Claimed)
            .ok_or_else(invalid)?;
        let pending = request.claim_ordinals.clone();
        let supplied: HashSet<u32> = outcomes.iter().map(|i| i.ordinal).collect();
        if supplied.len() != outcomes.len()
            || !supplied.is_subset(&pending)
            || outcomes
                .iter()
                .any(|o| o.status == OutcomeStatus::Failed && o.cause.is_none())
        {
            return Err(invalid());
        }
        self.retries.retain(|_, t| t.request_id != id);
        let mut accepted = Vec::new();
        let mut retry_tokens = Vec::new();
        for outcome in outcomes {
            let item = request
                .items
                .iter_mut()
                .find(|i| i.ordinal == outcome.ordinal)
                .ok_or_else(invalid)?;
            item.state = match outcome.status {
                OutcomeStatus::Opened => ItemState::Opened,
                OutcomeStatus::ActivatedExisting => ItemState::ActivatedExisting,
                OutcomeStatus::Cancelled => ItemState::Cancelled,
                OutcomeStatus::Deferred => ItemState::Deferred,
                OutcomeStatus::Failed | OutcomeStatus::Rejected => {
                    ItemState::Failed(outcome.cause.unwrap_or(FailureClass::Parse))
                }
            };
            accepted.push(item.ordinal);
            if matches!(
                item.state,
                ItemState::Failed(FailureClass::Locked | FailureClass::Io)
            ) {
                let token = new_id(now_ms);
                let expires_at_ms = now_ms.saturating_add(RETRY_TTL_MS);
                self.retries.insert(
                    token.clone(),
                    RetryGrant {
                        request_id: id.into(),
                        ordinal: item.ordinal,
                        version_hash: item.version.hash(),
                        expires_at_ms,
                    },
                );
                retry_tokens.push(RetryToken {
                    ordinal: item.ordinal,
                    token,
                    expires_at_ms,
                });
            }
        }
        // Missing outcomes are cancellation, never silently requeued/reopened.
        for item in request
            .items
            .iter_mut()
            .filter(|i| i.state == ItemState::Claimed)
        {
            item.state = ItemState::Cancelled;
        }
        request.state = RequestState::Terminal;
        request.claim_ordinals.clear();
        self.grants.revoke_request(id);
        Ok(AckReply {
            accepted,
            retry_tokens,
        })
    }
    pub fn release(&mut self, id: &str) -> Result<(), IntakeError> {
        self.grants.revoke_request(id);
        if let Some(request) = self
            .requests
            .iter_mut()
            .find(|r| r.id == id && r.state == RequestState::Claimed)
        {
            request.state = RequestState::Terminal;
            for item in request
                .items
                .iter_mut()
                .filter(|i| i.state == ItemState::Claimed)
            {
                item.state = ItemState::Cancelled;
            }
            self.retries.retain(|_, t| t.request_id != id);
        }
        // Ack-terminal transient failures keep their retry capabilities in finally.
        Ok(())
    }
    pub fn retry(
        &mut self,
        id: &str,
        ordinal: u32,
        token: &str,
        now_ms: u64,
    ) -> Result<ClaimReply, IntakeError> {
        // Removal comes first: even a mismatched/expired capability cannot replay.
        let retry = match self.retries.remove(token) {
            Some(t) => t,
            None => return Err(self.fault(id, Some(ordinal), "retry-unavailable")),
        };
        if retry.request_id != id
            || retry.ordinal != ordinal
            || now_ms >= retry.expires_at_ms
            || now_ms < retry.expires_at_ms.saturating_sub(RETRY_TTL_MS)
        {
            return Err(self.fault(id, Some(ordinal), "retry-unavailable"));
        }
        if self
            .requests
            .iter()
            .any(|r| r.state == RequestState::Claimed)
        {
            return Err(self.fault(id, Some(ordinal), "claim-busy"));
        }
        let item = self
            .requests
            .iter()
            .find(|r| r.id == id)
            .and_then(|r| r.items.iter().find(|i| i.ordinal == ordinal));
        let version = match item
            .filter(|i| {
                matches!(
                    i.state,
                    ItemState::Failed(FailureClass::Locked | FailureClass::Io)
                )
            })
            .and_then(|i| FileVersion::stat(&i.path).ok())
        {
            Some(v) if v.hash() == retry.version_hash => v,
            _ => return Err(self.fault(id, Some(ordinal), "changed-or-deleted")),
        };
        let request = self
            .requests
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| IntakeError {
                id: "SOM-APP-002",
                code: "unknown-request",
                message: "Request unavailable",
                expected: false,
                corr: id.into(),
                ordinal: Some(ordinal),
            })?;
        let item = request
            .items
            .iter_mut()
            .find(|i| i.ordinal == ordinal)
            .ok_or_else(IntakeError::denied)?;
        request.state = RequestState::Claimed;
        request.claimed_at_ms = Some(now_ms);
        request.claim_ordinals.clear();
        request.claim_ordinals.insert(ordinal);
        item.version = version.clone();
        let existing = self.existing.get(&item.identity.token).cloned();
        let grant = if existing.is_some() {
            item.state = ItemState::ActivatedExisting;
            None
        } else {
            item.state = ItemState::Claimed;
            Some(
                self.grants
                    .issue(id, ordinal, item.path.clone(), version, now_ms),
            )
        };
        Ok(ClaimReply {
            items: vec![claimed(item, grant, existing)],
        })
    }
    pub fn reset_stale(&mut self, now_ms: u64) -> Vec<String> {
        let mut reset = Vec::new();
        let mut events = Vec::new();
        for request in self.requests.iter_mut().filter(|r| {
            r.state == RequestState::Claimed
                && r.claimed_at_ms
                    .is_some_and(|t| now_ms.saturating_sub(t) >= CLAIM_TIMEOUT_MS)
        }) {
            self.grants.revoke_request(&request.id);
            self.retries.retain(|_, t| t.request_id != request.id);
            if request.resets == 0 {
                request.resets = 1;
                request.state = RequestState::Queued;
                request.claimed_at_ms = None;
                let affected = request
                    .items
                    .iter_mut()
                    .filter(|i| i.state == ItemState::Claimed)
                    .map(|i| {
                        i.state = ItemState::Queued;
                        1usize
                    })
                    .sum();
                if affected > 0 {
                    events.push(IntakeEvent {
                        id: "SOM-APP-012",
                        corr: request.id.clone(),
                        ordinal: None,
                        cause: "reset",
                        expected: false,
                        count: affected,
                    });
                    reset.push(request.id.clone());
                } else {
                    request.state = RequestState::Terminal;
                }
            } else {
                request.state = RequestState::Terminal;
                for item in &mut request.items {
                    if item.state == ItemState::Claimed {
                        item.state = ItemState::Cancelled;
                    }
                }
            }
        }
        self.events.extend(events);
        reset
    }
    fn prune(&mut self, now_ms: u64) {
        self.retries.retain(|_, t| now_ms < t.expires_at_ms);
        let keep: HashSet<_> = self
            .retries
            .values()
            .map(|t| t.request_id.clone())
            .collect();
        self.requests.retain(|r| {
            let retain = r.state != RequestState::Terminal || keep.contains(&r.id);
            if !retain {
                self.grants.forget_request(&r.id);
            }
            retain
        });
    }
}
fn summary(i: &OpenItem) -> OpenItemSummary {
    OpenItemSummary {
        ordinal: i.ordinal,
        display_name: i.display_name.clone(),
        ext: i.ext.clone(),
        size: i.size,
    }
}
fn claimed(
    i: &OpenItem,
    grant: Option<String>,
    existing_project_id: Option<String>,
) -> ClaimedItem {
    ClaimedItem {
        ordinal: i.ordinal,
        display_name: i.display_name.clone(),
        ext: i.ext.clone(),
        size: i.size,
        identity_token: i.identity.token.clone(),
        status: if existing_project_id.is_some() {
            "activated-existing"
        } else {
            "queued"
        },
        grant,
        existing_project_id,
    }
}
fn failure_code(c: FailureClass) -> &'static str {
    match c {
        FailureClass::Io => "io",
        FailureClass::Permission => "permission",
        FailureClass::TooLarge => "too-large",
        FailureClass::Locked => "lock-conflict",
        FailureClass::ChangedOrDeleted => "changed-or-deleted",
        FailureClass::Parse => "parse",
        FailureClass::Routing => "routing",
        FailureClass::Limit => "limit",
        FailureClass::Internal => "internal",
    }
}
fn grant_code(c: GrantFault) -> &'static str {
    match c {
        GrantFault::Unknown => "unknown-grant",
        GrantFault::Consumed => "grant-consumed",
        GrantFault::Revoked => "grant-revoked",
        GrantFault::Expired => "grant-expired",
        GrantFault::ChangedOrDeleted => "changed-or-deleted",
        GrantFault::Permission => "permission",
        GrantFault::Io => "io",
        GrantFault::TooLarge => "too-large",
    }
}
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk.first().copied().unwrap_or(0) as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (a << 16) | (b << 8) | c;
        for shift in [18, 12] {
            out.push(char::from(
                TABLE
                    .get(((n >> shift) & 63) as usize)
                    .copied()
                    .unwrap_or(b'A'),
            ));
        }
        out.push(if chunk.len() > 1 {
            char::from(TABLE.get(((n >> 6) & 63) as usize).copied().unwrap_or(b'A'))
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            char::from(TABLE.get((n & 63) as usize).copied().unwrap_or(b'A'))
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::super::{
        commands,
        parse::{parse_open_args, RejectReason, RejectedItem},
    };
    use super::*;
    use std::{ffi::OsString, fs};
    use tempfile::TempDir;
    fn file(dir: &TempDir, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
    fn parsed(paths: &[PathBuf]) -> ParsedRequest {
        parse_open_args(
            std::iter::once(OsString::from("somnia"))
                .chain(paths.iter().map(|p| p.as_os_str().to_owned())),
            PathBuf::from(".").as_path(),
            &IntakePolicy::default(),
        )
    }
    fn enqueue(q: &mut OpenQueue, paths: &[PathBuf], time: u64) -> String {
        q.enqueue(OpenSource::ColdArgv, parsed(paths), time)
            .request_id
            .unwrap()
    }
    fn grant(reply: &ClaimReply) -> String {
        reply.items.first().unwrap().grant.clone().unwrap()
    }
    fn outcome(ordinal: u32, status: OutcomeStatus, cause: Option<FailureClass>) -> ItemOutcome {
        ItemOutcome {
            ordinal,
            status,
            cause,
        }
    }
    fn retry_setup(q: &mut OpenQueue, paths: &[PathBuf]) -> (String, RetryToken) {
        let id = enqueue(q, paths, 1_000);
        q.claim(&id, 1_001).unwrap();
        let token = q
            .ack(
                &id,
                vec![outcome(0, OutcomeStatus::Failed, Some(FailureClass::Io))],
                1_002,
            )
            .unwrap()
            .retry_tokens
            .remove(0);
        (id, token)
    }
    #[test]
    fn real_file_happy_path_and_exact_wire_contract() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "unicode-ä.html", b"hello");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        assert_eq!(id.len(), 26);
        assert_eq!(q.drain().len(), 1);
        assert_eq!(q.drain().len(), 1);
        let reply = commands::claim_open_request("main", &mut q, &id, 2).unwrap();
        let token = grant(&reply);
        let wire = serde_json::to_value(&reply).unwrap();
        assert!(wire["items"][0].get("displayName").is_some());
        assert!(wire["items"][0].get("identityToken").is_some());
        let read = commands::read_by_grant("main", &mut q, &token, 3).unwrap();
        assert_eq!(read.data_base64, "aGVsbG8=");
        let ack = commands::ack_open_request(
            "main",
            &mut q,
            &id,
            vec![outcome(0, OutcomeStatus::Opened, None)],
            4,
        )
        .unwrap();
        assert_eq!(ack.accepted, vec![0]);
        assert!(q.drain().is_empty());
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn overflow_evicts_oldest_queued_never_claimed_exact_one_app008() {
        let dir = TempDir::new().unwrap();
        let mut q = OpenQueue::default();
        let paths: Vec<_> = (0..9)
            .map(|n| file(&dir, &format!("{n}.md"), b"x"))
            .collect();
        let active = enqueue(&mut q, &[paths[0].clone()], 1_000);
        q.claim(&active, 1_001).unwrap();
        for (n, p) in paths.iter().enumerate().skip(1) {
            enqueue(&mut q, &[p.clone()], 1_000 + (n as u64) * 1_000);
        }
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-008");
        assert_eq!(events[0].cause, "requests");
        assert_eq!(q.requests.len(), 8);
        assert!(q
            .requests
            .iter()
            .any(|r| r.id == active && r.state == RequestState::Claimed));
    }
    #[test]
    fn unknown_claim_exact_one_app002() {
        let mut q = OpenQueue::default();
        assert!(q.claim("bogus", 0).is_err());
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-002");
    }
    #[test]
    fn grant_reuse_exact_one_app002_no_secret_in_event() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "private-name-sentinel.md", b"secret contents");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        q.read_by_grant(&token, 3).unwrap();
        assert!(q.read_by_grant(&token, 4).is_err());
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].corr, id);
        assert_eq!(events[0].ordinal, Some(0));
        let wire = serde_json::to_string(&events).unwrap();
        assert!(!wire.contains("sentinel"));
        assert!(!wire.contains(&token));
        assert!(!wire.contains("secret contents"));
    }
    #[test]
    fn delete_after_claim_exact_one_app002_and_failed_read_consumes() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "gone.md", b"x");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path.clone()], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        fs::remove_file(path).unwrap();
        assert_eq!(
            q.read_by_grant(&token, 3).unwrap_err().code,
            "changed-or-deleted"
        );
        assert_eq!(q.take_events().len(), 1);
        assert_eq!(
            q.read_by_grant(&token, 4).unwrap_err().code,
            "grant-consumed"
        );
    }
    #[test]
    fn changed_size_and_same_size_mtime_are_rejected() {
        for bytes in [b"longer".as_slice(), b"y".as_slice()] {
            let dir = TempDir::new().unwrap();
            let path = file(&dir, "change.md", b"x");
            let mut q = OpenQueue::default();
            let id = enqueue(&mut q, &[path.clone()], 1);
            let token = grant(&q.claim(&id, 2).unwrap());
            std::thread::sleep(std::time::Duration::from_millis(20));
            fs::write(path, bytes).unwrap();
            assert_eq!(
                q.read_by_grant(&token, 3).unwrap_err().code,
                "changed-or-deleted"
            );
            assert_eq!(q.take_events().len(), 1);
        }
    }
    #[test]
    fn replacement_identity_with_same_size_cannot_open() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "target.md", b"a");
        let other = file(&dir, "replacement.md", b"b");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path.clone()], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        fs::remove_file(&path).unwrap();
        fs::rename(other, path).unwrap();
        assert_eq!(
            q.read_by_grant(&token, 3).unwrap_err().code,
            "changed-or-deleted"
        );
    }
    #[test]
    fn expired_grant_and_clock_rollback_fail_closed() {
        for time in [1, 2 + super::super::grant::GRANT_TTL_MS] {
            let dir = TempDir::new().unwrap();
            let path = file(&dir, "expire.md", b"x");
            let mut q = OpenQueue::default();
            let id = enqueue(&mut q, &[path], 1);
            let token = grant(&q.claim(&id, 2).unwrap());
            assert_eq!(
                q.read_by_grant(&token, time).unwrap_err().code,
                "grant-expired"
            );
        }
    }
    #[test]
    fn oversized_real_file_limit_is_consumed_before_read() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "large.bin", b"");
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(super::super::grant::MAX_READ_BYTES + 1)
            .unwrap();
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        assert_eq!(q.read_by_grant(&token, 3).unwrap_err().code, "too-large");
        assert_eq!(
            q.read_by_grant(&token, 4).unwrap_err().code,
            "grant-consumed"
        );
    }
    #[test]
    fn ack_partial_exact_one_failure_at_decision_not_ack() {
        let dir = TempDir::new().unwrap();
        let paths = [file(&dir, "a.md", b"a"), file(&dir, "b.md", b"b")];
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &paths, 1);
        q.claim(&id, 2).unwrap();
        q.report_item_failure(&id, 1, FailureClass::Routing);
        let reply = q
            .ack(
                &id,
                vec![
                    outcome(0, OutcomeStatus::Opened, None),
                    outcome(1, OutcomeStatus::Failed, Some(FailureClass::Routing)),
                ],
                3,
            )
            .unwrap();
        assert_eq!(reply.accepted, vec![0, 1]);
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-002");
        assert_eq!(events[0].ordinal, Some(1));
    }
    #[test]
    fn ack_never_logs_even_invalid_or_all_failed() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "a.md", b"x");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        q.claim(&id, 2).unwrap();
        assert!(q
            .ack(&id, vec![outcome(7, OutcomeStatus::Opened, None)], 3)
            .is_err());
        assert!(q
            .ack(&id, vec![outcome(0, OutcomeStatus::Failed, None)], 3)
            .is_err());
        assert!(q
            .ack(
                &id,
                vec![
                    outcome(0, OutcomeStatus::Opened, None),
                    outcome(0, OutcomeStatus::Opened, None)
                ],
                3
            )
            .is_err());
        q.ack(
            &id,
            vec![outcome(0, OutcomeStatus::Failed, Some(FailureClass::Parse))],
            3,
        )
        .unwrap();
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn locked_is_only_fs006_not_app002() {
        let mut q = OpenQueue::default();
        let error = q.report_item_failure("request", 4, FailureClass::Locked);
        assert_eq!(error.id, "SOM-FS-006");
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-FS-006");
    }
    #[test]
    fn cancel_release_idempotent_revokes_without_events_or_retry() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "cancel.md", b"x");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        q.release(&id).unwrap();
        q.release(&id).unwrap();
        assert!(q.drain().is_empty());
        assert!(q.retries.is_empty());
        assert!(q.take_events().is_empty());
        assert_eq!(
            q.read_by_grant(&token, 3).unwrap_err().code,
            "grant-revoked"
        );
    }
    #[test]
    fn retry_fresh_grant_single_item_single_use_and_authoritative_expiry() {
        let dir = TempDir::new().unwrap();
        let paths = [file(&dir, "a.md", b"a"), file(&dir, "b.md", b"b")];
        let mut q = OpenQueue::default();
        let (id, t) = retry_setup(&mut q, &paths);
        assert_eq!(t.expires_at_ms, 61_002);
        q.release(&id).unwrap();
        let reply = q.retry(&id, 0, &t.token, 2_000).unwrap();
        assert_eq!(reply.items.len(), 1);
        let read = q.read_by_grant(&grant(&reply), 2_001).unwrap();
        assert_eq!(read.data_base64, "YQ==");
        assert!(q.retry(&id, 0, &t.token, 2_002).is_err());
        let wire = serde_json::to_value(&t).unwrap();
        assert_eq!(wire["expiresAtMs"], 61_002);
    }
    #[test]
    fn retry_expiry_and_parameter_binding_are_one_shot() {
        for variant in 0..3 {
            let dir = TempDir::new().unwrap();
            let path = file(&dir, "a.md", b"x");
            let mut q = OpenQueue::default();
            let (id, t) = retry_setup(&mut q, &[path]);
            let (request, ordinal, time) = match variant {
                0 => ("wrong", 0, 2_000),
                1 => (id.as_str(), 3, 2_000),
                _ => (id.as_str(), 0, t.expires_at_ms),
            };
            assert!(q.retry(request, ordinal, &t.token, time).is_err());
            assert!(q.retry(&id, 0, &t.token, 2_001).is_err());
        }
    }
    #[test]
    fn retry_restats_identity_size_mtime_and_consumes_on_failure() {
        for variant in 0..3 {
            let dir = TempDir::new().unwrap();
            let path = file(&dir, "a.md", b"x");
            let mut q = OpenQueue::default();
            let (id, t) = retry_setup(&mut q, &[path.clone()]);
            std::thread::sleep(std::time::Duration::from_millis(20));
            match variant {
                0 => {
                    fs::write(&path, b"longer").unwrap();
                }
                1 => {
                    fs::write(&path, b"y").unwrap();
                }
                _ => {
                    fs::remove_file(&path).unwrap();
                }
            }
            assert_eq!(
                q.retry(&id, 0, &t.token, 2_000).unwrap_err().code,
                "changed-or-deleted"
            );
            assert!(q.retry(&id, 0, &t.token, 2_001).is_err());
        }
    }
    #[test]
    fn activated_existing_never_issues_grant_and_can_ack() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "existing.md", b"x");
        let mut q = OpenQueue::default();
        let identity = FileVersion::stat(&path).unwrap().identity;
        q.set_existing_projects([(identity, "project-1".into())]);
        let id = enqueue(&mut q, &[path], 1);
        let reply = q.claim(&id, 2).unwrap();
        let item = reply.items.first().unwrap();
        assert!(item.grant.is_none());
        assert_eq!(item.status, "activated-existing");
        assert_eq!(item.existing_project_id.as_deref(), Some("project-1"));
        q.ack(
            &id,
            vec![outcome(0, OutcomeStatus::ActivatedExisting, None)],
            3,
        )
        .unwrap();
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn stale_claim_reset_exactly_once_then_terminal_no_reopen() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "stale.md", b"x");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        let token = grant(&q.claim(&id, 2).unwrap());
        assert!(q.reset_stale(2 + CLAIM_TIMEOUT_MS - 1).is_empty());
        assert_eq!(q.reset_stale(2 + CLAIM_TIMEOUT_MS), vec![id.clone()]);
        assert_eq!(q.drain()[0].reset_count, 1);
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-012");
        assert_eq!(events[0].count, 1);
        assert!(q.read_by_grant(&token, 2 + CLAIM_TIMEOUT_MS).is_err());
        q.take_events();
        q.claim(&id, 3 + CLAIM_TIMEOUT_MS).unwrap();
        assert!(q.reset_stale(3 + 2 * CLAIM_TIMEOUT_MS).is_empty());
        assert!(q.drain().is_empty());
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn coalesce_preserves_ordinals_and_dedupe_is_queued_only() {
        let dir = TempDir::new().unwrap();
        let a = file(&dir, "a.md", b"x");
        let b = file(&dir, "b.md", b"y");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[a.clone()], 1_000);
        assert!(q
            .enqueue(OpenSource::OsOpen, parsed(&[a.clone()]), 1_100)
            .request_id
            .is_none());
        assert_eq!(enqueue(&mut q, &[b], 1_300), id);
        let summary = &q.drain()[0];
        assert_eq!(
            summary.items.iter().map(|i| i.ordinal).collect::<Vec<_>>(),
            vec![0, 1]
        );
        q.claim(&id, 1_301).unwrap();
        let next = enqueue(&mut q, &[a], 1_400);
        assert_ne!(next, id);
        assert!(q.claim(&next, 1_401).is_err());
    }
    #[test]
    fn empty_parse_and_expected_rejections_no_queue() {
        let mut q = OpenQueue::default();
        assert!(q
            .enqueue(OpenSource::SecondInstance, ParsedRequest::default(), 0)
            .request_id
            .is_none());
        let rejected = ParsedRequest {
            items: vec![],
            rejected: vec![RejectedItem {
                ordinal: 0,
                reason: RejectReason::UncBlocked,
                ext: None,
            }],
        };
        assert!(q
            .enqueue(OpenSource::OsOpen, rejected, 0)
            .request_id
            .is_none());
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-011");
        assert!(events[0].expected);
    }
    #[test]
    fn request_limit_rejects_new_when_only_claimed_or_retry_retention() {
        let dir = TempDir::new().unwrap();
        let mut q = OpenQueue::default();
        for n in 0..8 {
            let path = file(&dir, &format!("{n}.md"), b"x");
            let id = enqueue(&mut q, &[path], 1_000 + n * 1_000);
            q.claim(&id, 1_001 + n * 1_000).unwrap();
            q.ack(
                &id,
                vec![outcome(0, OutcomeStatus::Failed, Some(FailureClass::Io))],
                1_002 + n * 1_000,
            )
            .unwrap();
        }
        let path = file(&dir, "ninth.md", b"x");
        assert!(q
            .enqueue(OpenSource::OsOpen, parsed(&[path]), 10_000)
            .request_id
            .is_none());
        assert_eq!(q.requests.len(), 8);
        assert_eq!(q.take_events().len(), 1);
    }
    #[test]
    fn denied_window_all_eight_commands_leave_state_unchanged() {
        let mut q = OpenQueue::default();
        assert!(commands::drain_open_requests("plugin", &mut q, 0).is_err());
        assert!(commands::claim_open_request("plugin", &mut q, "id", 0).is_err());
        assert!(commands::read_by_grant("plugin", &mut q, "token", 0).is_err());
        assert!(commands::ack_open_request("plugin", &mut q, "id", vec![], 0).is_err());
        assert!(commands::release_candidate("plugin", &mut q, "id").is_err());
        assert!(commands::retry_open_item("plugin", &mut q, "id", 0, "token", 0).is_err());
        assert!(commands::get_intake_policy("plugin", &q).is_err());
        assert!(commands::set_intake_policy("plugin", &mut q, true).is_err());
        assert!(!q.policy().allow_unc);
        assert!(q.take_events().is_empty());
        commands::set_intake_policy("main", &mut q, true).unwrap();
        assert!(commands::get_intake_policy("main", &q).unwrap().allow_unc);
    }
    #[test]
    fn public_dtos_never_include_canonical_paths() {
        let dir = TempDir::new().unwrap();
        let path = file(&dir, "public.md", b"x");
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &[path], 1);
        let drain = serde_json::to_string(&q.drain()).unwrap();
        let claim = serde_json::to_string(&q.claim(&id, 2).unwrap()).unwrap();
        assert!(!drain.contains(&dir.path().display().to_string()));
        assert!(!claim.contains(&dir.path().display().to_string()));
        assert!(!claim.contains("modifiedNs"));
        assert!(!claim.contains("versionHash"));
    }
    #[test]
    fn coalesced_batch_never_exceeds_64() {
        let dir = TempDir::new().unwrap();
        let mut q = OpenQueue::default();
        let files: Vec<_> = (0..65)
            .map(|n| file(&dir, &format!("{n}.md"), b"x"))
            .collect();
        let id = enqueue(&mut q, &files[..64], 1);
        assert_eq!(enqueue(&mut q, &files[64..], 2), id);
        assert_eq!(q.drain()[0].items.len(), 64);
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-APP-008");
    }
    #[test]
    fn base64_padding_matches_wire() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
    }
}

/// A host-only snapshot built from Backend.projects while holding its mutex.
/// Folder membership must come from Project::list_files(), not path ancestry alone.
/// These types cannot be serialized into diagnostics or renderer responses.
pub enum ProjectAccess {
    SingleFile {
        project_id: String,
        canonical_file: PathBuf,
        identity: FileIdentity,
    },
    Folder {
        project_id: String,
        canonical_root: PathBuf,
        visible_files: HashSet<PathBuf>,
    },
}
impl OpenQueue {
    /// Replace the live registry before Claim/Retry. Do not cache across closes.
    pub fn refresh_project_access(&mut self, access: &[ProjectAccess]) {
        self.existing.clear();
        for request in &self.requests {
            for item in &request.items {
                if let Some(id) = activated_project(access, &item.path, &item.identity) {
                    self.existing
                        .insert(item.identity.token.clone(), id.to_owned());
                }
            }
        }
    }
    /// Call after native folder picker canonicalization, BEFORE Project::open().
    /// A folder cannot replace live single-file projects in that folder tree.
    pub fn check_folder_open(
        &mut self,
        canonical_root: &std::path::Path,
        access: &[ProjectAccess],
        corr: &str,
    ) -> Result<(), IntakeError> {
        let count = access.iter().filter(|entry| matches!(entry, ProjectAccess::SingleFile { canonical_file, .. } if canonical_file.starts_with(canonical_root))).count();
        if count == 0 {
            return Ok(());
        }
        self.event("SOM-FS-006", corr, None, "lock-conflict", false, count);
        Err(IntakeError {
            id: "SOM-FS-006",
            code: "lock-conflict",
            message: "Close the open single-file projects before opening this folder",
            expected: false,
            corr: corr.into(),
            ordinal: None,
        })
    }
}
/// Matches native identity first; folder ancestry alone does not grant visibility.
pub fn activated_project<'a>(
    access: &'a [ProjectAccess],
    canonical_file: &std::path::Path,
    identity: &FileIdentity,
) -> Option<&'a str> {
    access.iter().find_map(|entry| match entry {
        ProjectAccess::SingleFile {
            project_id,
            identity: existing,
            ..
        } if existing == identity => Some(project_id.as_str()),
        ProjectAccess::Folder {
            project_id,
            canonical_root,
            visible_files,
        } if canonical_file.starts_with(canonical_root)
            && visible_files.contains(canonical_file) =>
        {
            Some(project_id.as_str())
        }
        _ => None,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod overlap_tests {
    use super::super::{commands, parse::parse_open_args};
    use super::*;
    use crate::service::Project;
    use std::{collections::BTreeMap, ffi::OsString, fs};
    #[test]
    fn folder_visible_nested_file_activates_no_grant_no_new_project() {
        let root = tempfile::TempDir::new().unwrap();
        let recovery = tempfile::TempDir::new().unwrap();
        fs::create_dir(root.path().join("sub")).unwrap();
        let file = root.path().join("sub/x.md");
        fs::write(&file, b"x").unwrap();
        let folder = Project::open(root.path(), recovery.path()).unwrap();
        let id = folder.id.clone();
        let mut backend_projects = BTreeMap::new();
        backend_projects.insert(id.clone(), folder);
        let visible = backend_projects
            .get(&id)
            .unwrap()
            .list_files()
            .unwrap()
            .iter()
            .map(|p| root.path().join(p).canonicalize().unwrap())
            .collect();
        let access = vec![ProjectAccess::Folder {
            project_id: id.clone(),
            canonical_root: root.path().canonicalize().unwrap(),
            visible_files: visible,
        }];
        let parsed = parse_open_args(
            [OsString::from("somnia"), file.as_os_str().to_owned()],
            root.path(),
            &IntakePolicy::default(),
        );
        let mut q = OpenQueue::default();
        let request = q.enqueue(OpenSource::OsOpen, parsed, 1).request_id.unwrap();
        q.refresh_project_access(&access);
        let claim = q.claim(&request, 2).unwrap();
        let item = claim.items.first().unwrap();
        assert_eq!(item.existing_project_id.as_deref(), Some(id.as_str()));
        assert!(item.grant.is_none());
        assert_eq!(backend_projects.len(), 1);
        commands::release_candidate("main", &mut q, &request).unwrap();
        assert_eq!(backend_projects.len(), 1);
        assert!(q.take_events().is_empty());
        backend_projects.clear();
        assert!(Project::open(root.path(), recovery.path()).is_ok());
    }
    #[test]
    fn hidden_or_outside_folder_file_not_activated() {
        let root = tempfile::TempDir::new().unwrap();
        let outside = tempfile::TempDir::new().unwrap();
        let hidden = root.path().join(".hidden.md");
        let other = outside.path().join("x.md");
        fs::write(&hidden, b"h").unwrap();
        fs::write(&other, b"x").unwrap();
        let access = vec![ProjectAccess::Folder {
            project_id: "folder".into(),
            canonical_root: root.path().canonicalize().unwrap(),
            visible_files: HashSet::new(),
        }];
        for path in [hidden, other] {
            let version = FileVersion::stat(&path).unwrap();
            assert!(activated_project(&access, &path, &version.identity).is_none());
        }
    }
    #[test]
    fn open_single_blocks_ancestor_folder_count_only_and_no_mutation() {
        let root = tempfile::TempDir::new().unwrap();
        fs::create_dir(root.path().join("sub")).unwrap();
        let a = root.path().join("sub/private-a.md");
        let b = root.path().join("private-b.md");
        fs::write(&a, b"a").unwrap();
        fs::write(&b, b"b").unwrap();
        let access: Vec<_> = [a, b]
            .into_iter()
            .enumerate()
            .map(|(i, p)| ProjectAccess::SingleFile {
                project_id: format!("p{i}"),
                identity: FileVersion::stat(&p).unwrap().identity,
                canonical_file: p.canonicalize().unwrap(),
            })
            .collect();
        let mut q = OpenQueue::default();
        assert!(q
            .check_folder_open(root.path(), &access, "folder-request")
            .is_err());
        assert_eq!(access.len(), 2);
        let events = q.take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "SOM-FS-006");
        assert_eq!(events[0].count, 2);
        assert!(!serde_json::to_string(&events).unwrap().contains("private-"));
        let outside = tempfile::TempDir::new().unwrap();
        assert!(q
            .check_folder_open(outside.path(), &access, "other")
            .is_ok());
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn same_file_identity_activates_single_project() {
        let root = tempfile::TempDir::new().unwrap();
        let path = root.path().join("x.md");
        fs::write(&path, b"x").unwrap();
        let identity = FileVersion::stat(&path).unwrap().identity;
        let access = vec![ProjectAccess::SingleFile {
            project_id: "single".into(),
            canonical_file: path.clone(),
            identity: identity.clone(),
        }];
        assert_eq!(activated_project(&access, &path, &identity), Some("single"));
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod retry_ack_scope_tests {
    use super::super::parse::parse_open_args;
    use super::*;
    use std::{ffi::OsString, fs};
    #[test]
    fn retry_ack_cannot_modify_unrelated_activated_or_opened_item() {
        let dir = tempfile::TempDir::new().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        fs::write(&a, b"a").unwrap();
        fs::write(&b, b"b").unwrap();
        let mut q = OpenQueue::default();
        q.set_existing_projects([(FileVersion::stat(&b).unwrap().identity, "b-project".into())]);
        let parsed = parse_open_args(
            [
                OsString::from("somnia"),
                a.as_os_str().to_owned(),
                b.as_os_str().to_owned(),
            ],
            dir.path(),
            &IntakePolicy::default(),
        );
        let id = q.enqueue(OpenSource::OsOpen, parsed, 1).request_id.unwrap();
        q.claim(&id, 2).unwrap();
        let token = q
            .ack(
                &id,
                vec![
                    ItemOutcome {
                        ordinal: 0,
                        status: OutcomeStatus::Failed,
                        cause: Some(FailureClass::Io),
                    },
                    ItemOutcome {
                        ordinal: 1,
                        status: OutcomeStatus::ActivatedExisting,
                        cause: None,
                    },
                ],
                3,
            )
            .unwrap()
            .retry_tokens
            .remove(0);
        q.retry(&id, 0, &token.token, 4).unwrap();
        assert!(q
            .ack(
                &id,
                vec![ItemOutcome {
                    ordinal: 1,
                    status: OutcomeStatus::Cancelled,
                    cause: None
                }],
                5
            )
            .is_err());
        q.ack(
            &id,
            vec![ItemOutcome {
                ordinal: 0,
                status: OutcomeStatus::Opened,
                cause: None,
            }],
            5,
        )
        .unwrap();
        let request = q.requests.iter().find(|r| r.id == id).unwrap();
        assert_eq!(request.items[1].state, ItemState::ActivatedExisting);
    }
}
