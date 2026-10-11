//! Stable versioned wire contracts, independent of provider/SDK implementation.
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionState {
    Pending, Claimed, Running, Paused, Stopped, Done, Failed, Crashed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState { None, Ready, Applied, Discarded, Conflict }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConsentChoice { AllowOnce, AllowForRun, Deny }

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
pub enum ModelLocality { Local, Cloud }

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
        if *locality == ModelLocality::Local { return None; }
        self.cost_usd.filter(|cost| cost.is_finite() && *cost > 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dto_has_no_secret_field_and_rejects_unrecognized_keys() {
        let value = r#"{"provider":"ollama","model":"qwen3.5:9b","locality":"local","apiKey":"secret"}"#;
        assert!(serde_json::from_str::<ModelReference>(value).is_err());
    }
    #[test]
    fn serialization_is_stable_and_explicit() {
        assert_eq!(serde_json::to_value(ExecutionState::Crashed).unwrap(), "crashed");
        assert_eq!(serde_json::to_value(ReviewState::Ready).unwrap(), "ready");
        assert_eq!(serde_json::to_value(ConsentChoice::AllowForRun).unwrap(), "allow_for_run");
        let request = CreateStudio { space_id: "space".into(), goal: "Edit".into(), model: ModelReference { provider: "ollama".into(), model: "qwen3.5:9b".into(), locality: ModelLocality::Local } };
        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["spaceId"], "space");
        assert_eq!(value["model"]["locality"], "local");
        assert!(value.get("space_id").is_none());
    }
    #[test]
    fn d9_hides_zero_invalid_and_local_cost() {
        for cost in [None, Some(0.0), Some(-1.0), Some(f64::NAN), Some(f64::INFINITY)] {
            let usage = Usage { input_tokens: 1, output_tokens: 2, cached_tokens: 0, cost_usd: cost, cost_source: None };
            assert_eq!(usage.visible_cost_usd(&ModelLocality::Cloud), None);
        }
        let usage = Usage { input_tokens: 1, output_tokens: 2, cached_tokens: 0, cost_usd: Some(0.1), cost_source: Some("provider_reported".into()) };
        assert_eq!(usage.visible_cost_usd(&ModelLocality::Cloud), Some(0.1));
        assert_eq!(usage.visible_cost_usd(&ModelLocality::Local), None);
    }
    #[test]
    fn consent_decision_cannot_carry_scope_changes() {
        let value = r#"{"runId":"r","requestId":"q","choice":"allow_once","newScope":"/"}"#;
        assert!(serde_json::from_str::<ConsentDecision>(value).is_err());
    }
}
