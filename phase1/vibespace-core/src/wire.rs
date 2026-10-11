//! Stable versioned wire contracts, independent of provider/SDK implementation.
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionState {
    Pending,
    Claimed,
    Running,
    Paused,
    Stopped,
    Done,
    Failed,
    Crashed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState {
    None,
    Ready,
    Applied,
    Discarded,
    Conflict,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConsentChoice {
    AllowOnce,
    AllowForRun,
    Deny,
}

/// No API key, OAuth token or provider response body crosses this boundary.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelReference {
    pub provider: String,
    pub model: String,
    pub locality: ModelLocality,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelLocality {
    Local,
    Cloud,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSpace {
    pub name: String,
    /// A native folder grant, not an arbitrary path supplied by an untrusted view.
    pub folder_grant_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateStudio {
    pub space_id: String,
    pub goal: String,
    pub model: ModelReference,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConsentDecision {
    pub run_id: String,
    pub request_id: String,
    pub choice: ConsentChoice,
}

/// Payload is normalized and redacted by the Rust core before publication.
/// The event sequence is scoped to a run and persisted before it is emitted.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunEvent {
    pub protocol_version: u32,
    pub run_id: String,
    pub sequence: u64,
    pub timestamp_utc: String,
    pub kind: String,
    pub payload: serde_json::Value,
}

/// A provider estimate is labelled as such. Local usage does not imply a cost.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub cost_usd: Option<f64>,
    pub cost_source: Option<String>,
}

impl Usage {
    pub fn visible_cost_usd(&self, locality: &ModelLocality) -> Option<f64> {
        if *locality == ModelLocality::Local {
            return None;
        }
        self.cost_usd.filter(|cost| cost.is_finite() && *cost > 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dto_has_no_secret_field_and_rejects_unrecognized_keys() {
        let value =
            r#"{"provider":"ollama","model":"qwen3.5:9b","locality":"local","apiKey":"secret"}"#;
        assert!(serde_json::from_str::<ModelReference>(value).is_err());
    }
    #[test]
    fn serialization_is_stable_and_explicit() {
        assert_eq!(
            serde_json::to_value(ExecutionState::Crashed).unwrap(),
            "crashed"
        );
        assert_eq!(serde_json::to_value(ReviewState::Ready).unwrap(), "ready");
        assert_eq!(
            serde_json::to_value(ConsentChoice::AllowForRun).unwrap(),
            "allow_for_run"
        );
        let request = CreateStudio {
            space_id: "space".into(),
            goal: "Edit".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: "qwen3.5:9b".into(),
                locality: ModelLocality::Local,
            },
        };
        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["spaceId"], "space");
        assert_eq!(value["model"]["locality"], "local");
        assert!(value.get("space_id").is_none());
    }
    #[test]
    fn d9_hides_zero_invalid_and_local_cost() {
        for cost in [
            None,
            Some(0.0),
            Some(-1.0),
            Some(f64::NAN),
            Some(f64::INFINITY),
        ] {
            let usage = Usage {
                input_tokens: 1,
                output_tokens: 2,
                cached_tokens: 0,
                cost_usd: cost,
                cost_source: None,
            };
            assert_eq!(usage.visible_cost_usd(&ModelLocality::Cloud), None);
        }
        let usage = Usage {
            input_tokens: 1,
            output_tokens: 2,
            cached_tokens: 0,
            cost_usd: Some(0.1),
            cost_source: Some("provider_reported".into()),
        };
        assert_eq!(usage.visible_cost_usd(&ModelLocality::Cloud), Some(0.1));
        assert_eq!(usage.visible_cost_usd(&ModelLocality::Local), None);
    }
    #[test]
    fn consent_decision_cannot_carry_scope_changes() {
        let value = r#"{"runId":"r","requestId":"q","choice":"allow_once","newScope":"/"}"#;
        assert!(serde_json::from_str::<ConsentDecision>(value).is_err());
    }
}

/// Full immutable projection assembled from durable native state.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunSnapshot {
    pub run_id: String,
    pub studio_id: String,
    pub space_id: String,
    pub execution_state: ExecutionState,
    pub review_state: ReviewState,
    pub goal: String,
    pub model: ModelReference,
    pub last_step: Option<String>,
    pub started_at_utc: Option<String>,
    pub finished_at_utc: Option<String>,
    pub elapsed_ms: u64,
    pub usage: Option<Usage>,
    pub messages: Vec<TranscriptMessage>,
    pub pending_consents: Vec<PendingConsent>,
    pub checkpoints: Vec<CheckpointSummary>,
    pub review: Option<ReviewProjection>,
    pub failure: Option<FailureSummary>,
    pub capabilities: RunCapabilities,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotReply {
    pub protocol_version: u32,
    pub sequence: u64,
    pub snapshot: RunSnapshot,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscriptMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    pub timestamp_utc: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PendingConsent {
    pub request_id: String,
    pub action: String,
    pub scope: String,
    pub reason: String,
    pub allow_for_run: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckpointSummary {
    pub checkpoint_id: String,
    pub label: String,
    pub created_at_utc: String,
    pub file_count: u64,
    pub restorable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewProjection {
    pub revision: String,
    pub summary: String,
    pub files: Vec<ReviewFile>,
    pub conflicts: Vec<String>,
    pub checks: Vec<CheckSummary>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewFile {
    pub path: String,
    /// added/modified/deleted; binary content is never decoded as text.
    pub change: String,
    pub binary: bool,
    pub before_text: Option<String>,
    pub after_text: Option<String>,
    pub before_bytes: u64,
    pub after_bytes: u64,
    /// Current project content for conflict comparison, bounded and UTF-8 only.
    pub current_text: Option<String>,
    pub current_bytes: u64,
    pub conflict: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckSummary {
    pub name: String,
    /// passed/failed/not_run. Skipped checks are never success.
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FailureSummary {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunCapabilities {
    pub stop: bool,
    pub steer: bool,
    pub pause: bool,
    pub resume: bool,
    pub apply: bool,
    pub restore: bool,
}

impl SnapshotReply {
    /// A snapshot event and a read share the exact same projection and sequence.
    pub fn into_event(self, timestamp_utc: String) -> Result<RunEvent, serde_json::Error> {
        Ok(RunEvent {
            protocol_version: self.protocol_version,
            run_id: self.snapshot.run_id.clone(),
            sequence: self.sequence,
            timestamp_utc,
            kind: "run_snapshot".into(),
            payload: serde_json::to_value(self.snapshot)?,
        })
    }
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    #[test]
    fn full_read_and_event_use_same_projection() {
        let snapshot = RunSnapshot {
            run_id: "r".into(),
            studio_id: "s".into(),
            space_id: "p".into(),
            execution_state: ExecutionState::Running,
            review_state: ReviewState::None,
            goal: "Edit".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: "qwen3.5:9b".into(),
                locality: ModelLocality::Local,
            },
            last_step: None,
            started_at_utc: None,
            finished_at_utc: None,
            elapsed_ms: 0,
            usage: None,
            messages: vec![],
            pending_consents: vec![],
            checkpoints: vec![],
            review: None,
            failure: None,
            capabilities: RunCapabilities::default(),
        };
        let reply = SnapshotReply {
            protocol_version: PROTOCOL_VERSION,
            sequence: 7,
            snapshot,
        };
        let read = serde_json::to_value(&reply).unwrap();
        let event = reply.into_event("2026-10-11T11:05:00Z".into()).unwrap();
        assert_eq!(event.sequence, 7);
        assert_eq!(event.kind, "run_snapshot");
        assert_eq!(event.payload, read["snapshot"]);
        assert_eq!(event.payload["runId"], event.run_id);
        assert_eq!(event.payload["review"], serde_json::Value::Null);
        assert_eq!(event.payload["capabilities"]["pause"], false);
    }
}

/// An explicit user firing, distinct from creating a studio. The same request ID
/// must return the same run after an ambiguous transport retry.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRun {
    pub studio_id: String,
    pub request_id: String,
    pub retry_of_run_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudioSummary {
    pub studio_id: String,
    pub space_id: String,
    pub goal: String,
    pub model: ModelReference,
    pub can_start: bool,
    pub latest_run_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceSummary {
    pub space_id: String,
    pub name: String,
    /// Display only; never an access grant or an executor root.
    pub scope_label: String,
    pub autonomy: String,
    pub studio_count: u64,
}
