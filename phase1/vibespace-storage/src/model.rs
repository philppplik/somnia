//! Serializable DTOs. Fields are camelCase on the wire, enum values snake_case.
//! Request DTOs reject unknown fields (so a credential or scope-extension field
//! can never be smuggled in) and accept an optional `schemaVersion` (must be 1).

use crate::{limits, DTO_SCHEMA_VERSION, PROTOCOL_VERSION};
use serde::{Deserialize, Serialize};
use serde_json::Value;

macro_rules! str_enum {
    ($(#[$m:meta])* $name:ident { $($var:ident => $s:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($var),+ }
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$var),+];
            pub fn as_str(&self) -> &'static str {
                match self { $($name::$var => $s),+ }
            }
            pub fn parse(s: &str) -> Option<$name> {
                match s { $($s => Some($name::$var),)+ _ => None }
            }
        }
    };
}

str_enum!(
    /// Execution state only. Review status is a separate axis (`ReviewState`).
    ExecutionState {
        Pending => "pending", Claimed => "claimed", Running => "running", Paused => "paused",
        Stopped => "stopped", Done => "done", Failed => "failed", Crashed => "crashed",
    }
);
str_enum!(ReviewState { None => "none", Ready => "ready", Applied => "applied", Discarded => "discarded", Conflict => "conflict" });
str_enum!(
    /// `AskForWrites` is the locked default (decision D5). The other levels are
    /// storage placeholders; the consent broker owns their meaning.
    Autonomy { AskForEverything => "ask_for_everything", AskForWrites => "ask_for_writes", AutonomousInScope => "autonomous_in_scope" }
);
str_enum!(ModelLocality { Local => "local", Cloud => "cloud" });
str_enum!(ScopeKind { Project => "project", Personal => "personal" });
str_enum!(CheckpointKind { Baseline => "baseline", Auto => "auto", PreApply => "pre_apply", Manual => "manual" });
str_enum!(MemoryKind { Fact => "fact", Preference => "preference", Note => "note" });
str_enum!(MemorySource { User => "user", Agent => "agent", Imported => "imported", Skill => "skill" });
str_enum!(
    /// Consent state of a memory item. `PendingReview` items are hidden from
    /// list/search unless explicitly requested.
    MemoryConsent { UserExplicit => "user_explicit", UserApproved => "user_approved", PendingReview => "pending_review" }
);
str_enum!(SearchMode { Fts5 => "fts5", LikeFallback => "like_fallback" });

impl ExecutionState {
    pub fn is_terminal(&self) -> bool {
        matches!(self, ExecutionState::Done | ExecutionState::Failed | ExecutionState::Stopped | ExecutionState::Crashed)
    }
    /// The allowed execution transition table. Terminal states have no exits:
    /// a retry is a new run, so a crashed run can never silently re-run effects.
    pub fn can_transition_to(&self, to: ExecutionState) -> bool {
        use ExecutionState::*;
        matches!(
            (*self, to),
            (Pending, Claimed)
                | (Pending, Stopped)
                | (Claimed, Running)
                | (Claimed, Pending)
                | (Claimed, Stopped)
                | (Claimed, Failed)
                | (Claimed, Crashed)
                | (Running, Paused)
                | (Running, Stopped)
                | (Running, Done)
                | (Running, Failed)
                | (Running, Crashed)
                | (Paused, Running)
                | (Paused, Stopped)
                | (Paused, Failed)
                | (Paused, Crashed)
        )
    }
}

impl ReviewState {
    pub fn can_transition_to(&self, to: ReviewState) -> bool {
        use ReviewState as R;
        matches!(
            (*self, to),
            (R::None, R::Ready)
                | (R::Ready, R::Applied)
                | (R::Ready, R::Discarded)
                | (R::Ready, R::Conflict)
                | (R::Conflict, R::Ready)
                | (R::Conflict, R::Discarded)
        )
    }
}

fn v1() -> u32 {
    DTO_SCHEMA_VERSION
}
fn dto_v() -> u32 {
    DTO_SCHEMA_VERSION
}
pub(crate) fn check_version(found: u32) -> crate::Result<()> {
    if found != DTO_SCHEMA_VERSION {
        return Err(crate::Error::UnsupportedDtoVersion { found });
    }
    Ok(())
}

// ---------------------------------------------------------------- spaces

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceScope {
    pub kind: ScopeKind,
    /// Native folder grant id from the folder chooser. Required for `project`, forbidden for `personal`.
    pub folder_grant_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewSpace {
    #[serde(default = "v1")]
    pub schema_version: u32,
    pub name: String,
    pub scope: SpaceScope,
    /// Defaults to `ask_for_writes`.
    #[serde(default)]
    pub autonomy: Option<Autonomy>,
}

impl NewSpace {
    pub fn project(name: &str, folder_grant_id: &str) -> NewSpace {
        NewSpace {
            schema_version: DTO_SCHEMA_VERSION,
            name: name.to_string(),
            scope: SpaceScope { kind: ScopeKind::Project, folder_grant_id: Some(folder_grant_id.to_string()) },
            autonomy: None,
        }
    }
    pub fn personal(name: &str) -> NewSpace {
        NewSpace {
            schema_version: DTO_SCHEMA_VERSION,
            name: name.to_string(),
            scope: SpaceScope { kind: ScopeKind::Personal, folder_grant_id: None },
            autonomy: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub scope: SpaceScope,
    pub autonomy: Autonomy,
    pub created_at: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------- studios

/// Model reference. Never contains an API key or token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelRef {
    pub provider: String,
    pub model: String,
    pub locality: ModelLocality,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewStudio {
    #[serde(default = "v1")]
    pub schema_version: u32,
    pub space_id: String,
    pub goal: String,
    pub model: ModelRef,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Studio {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub id: String,
    pub space_id: String,
    pub goal: String,
    pub model: ModelRef,
    pub created_at: String,
}

// ---------------------------------------------------------------- runs

/// Mirrors the wire `StartRun`. `request_id` is a UUID, stable per user firing and NEW for an
/// explicit retry. The same request id always returns the same run.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRunRequest {
    #[serde(default = "v1")]
    pub schema_version: u32,
    pub studio_id: String,
    pub request_id: String,
    pub retry_of_run_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunOutcome {
    pub run: Run,
    /// False when the request id already existed (idempotent replay): nothing was written.
    pub created: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub id: String,
    pub studio_id: String,
    pub space_id: String,
    /// Stable id of the user firing that created this run (unique).
    pub request_id: String,
    /// Set for an explicit retry: the earlier failed/stopped/crashed run in the same studio.
    pub retry_of_run_id: Option<String>,
    pub execution: ExecutionState,
    pub review: ReviewState,
    /// Incremented on every review state change; use as `expectedReviewRevision`.
    pub review_revision: i64,
    pub claimed_by: Option<String>,
    pub fencing_token: i64,
    pub lease_expires_at: Option<String>,
    /// True when crash recovery marked this run; always visible, never cleared.
    pub interrupted: bool,
    pub interrupted_reason: Option<String>,
    pub last_sequence: i64,
    pub result: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

/// Stored form of an event. Use `wire()` for the `somnia://vibespace-run` envelope.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEventRecord {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub protocol_version: u32,
    pub run_id: String,
    pub sequence: i64,
    pub timestamp_utc: String,
    pub kind: String,
    pub payload: Value,
    /// True when the payload exceeded the byte limit and was replaced by a preview.
    pub truncated: bool,
}

/// Exactly the six envelope fields of the wire contract (`RunEvent` in vibespace-core).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireRunEvent {
    pub protocol_version: u32,
    pub run_id: String,
    pub sequence: u64,
    pub timestamp_utc: String,
    pub kind: String,
    pub payload: Value,
}

impl RunEventRecord {
    pub fn wire(&self) -> WireRunEvent {
        WireRunEvent {
            protocol_version: PROTOCOL_VERSION,
            run_id: self.run_id.clone(),
            sequence: self.sequence as u64,
            timestamp_utc: self.timestamp_utc.clone(),
            kind: self.kind.clone(),
            payload: self.payload.clone(),
        }
    }
}

/// Atomic state change request: updates execution and/or review state and appends
/// one `run.state_changed` event in the same transaction.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionRequest {
    #[serde(default = "v1")]
    pub schema_version: u32,
    pub execution: Option<ExecutionState>,
    pub review: Option<ReviewState>,
    /// Reject with `Conflict` unless the current execution state equals this.
    pub expected_execution: Option<ExecutionState>,
    /// Reject with `Conflict` unless the current review revision equals this.
    pub expected_review_revision: Option<i64>,
    /// Reject with `FencingMismatch` unless it equals the run's current token.
    pub fencing_token: Option<i64>,
    /// Free-form detail, redacted and bounded like any event payload.
    pub detail: Option<Value>,
    /// Stored as the run result (redacted and bounded). Only meaningful on terminal transitions.
    pub result: Option<Value>,
}

impl Default for TransitionRequest {
    fn default() -> Self {
        TransitionRequest {
            schema_version: DTO_SCHEMA_VERSION,
            execution: None,
            review: None,
            expected_execution: None,
            expected_review_revision: None,
            fencing_token: None,
            detail: None,
            result: None,
        }
    }
}

impl TransitionRequest {
    pub fn execution(to: ExecutionState) -> TransitionRequest {
        TransitionRequest { schema_version: DTO_SCHEMA_VERSION, execution: Some(to), ..Default::default() }
    }
    pub fn review(to: ReviewState) -> TransitionRequest {
        TransitionRequest { schema_version: DTO_SCHEMA_VERSION, review: Some(to), ..Default::default() }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionOutcome {
    pub run: Run,
    pub event: RunEventRecord,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RecoveryMode {
    /// Every claimed/running run is marked crashed (single-process app restart).
    AllActive,
    /// Only claimed/running runs whose lease expired (or has no lease) are marked.
    ExpiredLeases,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredRun {
    pub run_id: String,
    pub space_id: String,
    pub previous_state: ExecutionState,
    pub reason: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub recovered: Vec<RecoveredRun>,
}

// ---------------------------------------------------------------- checkpoints

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewCheckpoint {
    #[serde(default = "v1")]
    pub schema_version: u32,
    pub space_id: String,
    pub run_id: String,
    pub kind: CheckpointKind,
    pub label: String,
    /// Opaque content-addressed reference, `algo:hex` (e.g. `sha256:<64 hex>`). Never a path.
    pub content_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub id: String,
    pub space_id: String,
    pub run_id: String,
    pub kind: CheckpointKind,
    pub label: String,
    pub content_ref: String,
    /// Sequence of the `run.checkpoint_created` event written in the same transaction.
    pub event_sequence: i64,
    pub created_at: String,
}

// ---------------------------------------------------------------- memory

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewMemory {
    #[serde(default = "v1")]
    pub schema_version: u32,
    /// Explicit scope. There is no global memory.
    pub space_id: String,
    pub kind: MemoryKind,
    pub title: Option<String>,
    pub content: String,
    pub source: MemorySource,
    pub source_ref: Option<String>,
    pub consent: MemoryConsent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source: MemorySource,
    pub source_ref: Option<String>,
    pub consent: MemoryConsent,
}

/// `content` is untrusted data. `instruction_authority` is always `"none"`: a memory
/// item never grants permission and must not be placed in an instruction channel.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub id: String,
    pub space_id: String,
    pub kind: MemoryKind,
    pub title: Option<String>,
    pub content: String,
    pub provenance: Provenance,
    pub instruction_authority: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemoryListOptions {
    pub include_pending: bool,
    pub limit: usize,
    pub offset: usize,
}
impl Default for MemoryListOptions {
    fn default() -> Self {
        MemoryListOptions { include_pending: false, limit: limits::DEFAULT_LIST_LIMIT, offset: 0 }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchOptions {
    pub include_pending: bool,
    pub limit: usize,
}
impl Default for SearchOptions {
    fn default() -> Self {
        SearchOptions { include_pending: false, limit: limits::DEFAULT_LIST_LIMIT }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub item: MemoryItem,
    /// Higher is better. `None` in fallback mode (no ranking).
    pub score: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub mode: SearchMode,
    /// Set whenever `mode` is `like_fallback`: why FTS5 was not used.
    pub fallback_reason: Option<String>,
    pub hits: Vec<SearchHit>,
}

// ---------------------------------------------------------------- capabilities

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorCapability {
    /// `unavailable` in this version. Never `ready` without an embedding backend and tests.
    pub status: String,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitsDto {
    pub max_name_chars: usize,
    pub max_goal_chars: usize,
    pub max_memory_content_bytes: usize,
    pub max_memory_per_space: i64,
    pub max_event_payload_bytes: usize,
    pub max_events_per_run: i64,
    pub max_query_chars: usize,
    pub max_list_limit: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    #[serde(default = "dto_v")]
    pub schema_version: u32,
    pub db_schema_version: i64,
    pub fts5: bool,
    pub search_mode: SearchMode,
    pub vector: VectorCapability,
    /// Whether the store accepts transitions to `paused` (off unless enabled in `StoreOptions`).
    pub pause_resume: bool,
    pub limits: LimitsDto,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn as_str_matches_serde() {
        for s in ExecutionState::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
            assert_eq!(ExecutionState::parse(s.as_str()), Some(*s));
        }
        for s in ReviewState::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in Autonomy::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in CheckpointKind::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in MemoryConsent::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in SearchMode::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in MemorySource::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in MemoryKind::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in ScopeKind::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
        for s in ModelLocality::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.as_str());
        }
    }
}
