//! Standalone goose-agent compatibility spike. No desktop wiring or built-in tools.
mod goose;
mod transport;
pub mod evals;
pub mod inventory;
pub mod provider;
use async_trait::async_trait;
pub use goose::GooseBackend;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;
pub use transport::{HttpModel, Secret};

#[derive(Clone, Debug)]
pub struct WorkspaceScope {
    root: PathBuf,
}
impl WorkspaceScope {
    /// Existing explicit root only. This is context, not filesystem authority.
    pub fn new(root: PathBuf) -> Result<Self, Failure> {
        if !root.is_absolute() || !root.is_dir() {
            return Err(Failure::InvalidRequest);
        }
        Ok(Self {
            root: root.canonicalize().map_err(|_| Failure::InvalidRequest)?,
        })
    }
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }
}
#[derive(Clone, Debug)]
pub enum ModelConfig {
    Local {
        endpoint: String,
        model: String,
    },
    /// Credential is passed separately to HttpModel, never included in run state.
    Byok {
        endpoint: String,
        model: String,
    },
}
impl ModelConfig {
    pub fn model(&self) -> &str {
        match self {
            Self::Local { model, .. } | Self::Byok { model, .. } => model,
        }
    }
    pub fn endpoint(&self) -> &str {
        match self {
            Self::Local { endpoint, .. } | Self::Byok { endpoint, .. } => endpoint,
        }
    }
}
#[derive(Clone, Debug)]
pub struct RunRequest {
    pub run_id: String,
    pub goal: String,
    pub workspace: WorkspaceScope,
    pub model: ModelConfig,
    pub recalled_memory: Vec<String>,
    pub max_steps: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}
impl ModelMessage {
    pub fn text(role: &str, content: String) -> Self {
        Self {
            role: role.into(),
            content,
            tool_calls: None,
            tool_call_id: None,
        }
    }
}
#[derive(Clone, Debug)]
pub struct ModelInput {
    pub config: ModelConfig,
    pub messages: Vec<ModelMessage>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct ToolProposal {
    pub call_id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Usage {
    /// As reported by the provider. NOTE: Anthropic reports uncached input only; OpenAI-style
    /// `prompt_tokens` already includes cached tokens. Cache fields below are never added in.
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// `None` = the provider did not report it (distinct from a reported 0).
    pub cache_read_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
    /// Only ever copied from a provider response. No price tables, no estimates.
    pub cost_usd: Option<f64>,
    pub cost_source: Option<CostSource>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CostSource {
    /// The provider response itself carried the cost (e.g. OpenRouter `usage.cost`).
    ProviderReported,
}
impl Usage {
    pub fn tokens(input_tokens: u64, output_tokens: u64) -> Self {
        Self { input_tokens, output_tokens, ..Self::default() }
    }
}
#[derive(Clone, Debug)]
pub struct ModelReply {
    pub message: String,
    pub tool: Option<ToolProposal>,
    pub usage: Usage,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    InvalidRequest,
    Model,
    Policy,
    Tool,
    StepLimit,
}
#[derive(Clone, Debug, PartialEq)]
pub enum EventKind {
    Started,
    Step { index: u32, name: String },
    Message(String),
    ToolProposed(ToolProposal),
    Usage(Usage),
    Completed,
    Failed(Failure),
    Stopped,
}
#[derive(Clone, Debug)]
pub struct RunEvent {
    pub run_id: String,
    pub kind: EventKind,
}
#[async_trait]
pub trait ModelTransport: Send + Sync {
    /// Only explicitly configured model traffic. No logging of payloads or credentials.
    async fn complete(&self, input: ModelInput) -> Result<ModelReply, Failure>;
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Deny,
    AllowOnce,
}
#[async_trait]
pub trait EffectPort: Send + Sync {
    /// A trusted host policy/UI callback, not a model or tool-result decision.
    async fn authorize(
        &self,
        _run_id: &str,
        _scope: &WorkspaceScope,
        _tool: &ToolProposal,
    ) -> Result<Decision, Failure> {
        Ok(Decision::Deny)
    }
    /// Called only after AllowOnce for this exact proposal. The host must implement
    /// its own path/network/write checks and apply/discard semantics.
    async fn execute(
        &self,
        _run_id: &str,
        _scope: &WorkspaceScope,
        _tool: &ToolProposal,
    ) -> Result<String, Failure> {
        Err(Failure::Tool)
    }
}
pub struct DenyAll;
#[async_trait]
impl EffectPort for DenyAll {}

pub struct RunHandle {
    pub events: mpsc::UnboundedReceiver<RunEvent>,
    cancel: CancellationToken,
    steer: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}
impl RunHandle {
    /// Clone for host cancellation without taking an async RunHandle lock.
    pub fn cancellation(&self) -> CancellationToken {
        self.cancel.clone()
    }
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    /// Bounded queue; consumed at the next SDK pass, never mid-effect.
    pub async fn steer(&self, message: String) -> Result<(), Failure> {
        let mut queue = self.steer.lock().await;
        if message.len() > 8192 || queue.len() >= 8 {
            return Err(Failure::InvalidRequest);
        }
        queue.push(message);
        Ok(())
    }
    pub async fn join(self) {
        let _ = self.task.await;
    }
}
#[async_trait]
pub trait AgentBackend: Send + Sync {
    async fn start(&self, request: RunRequest) -> Result<RunHandle, Failure>;
}
