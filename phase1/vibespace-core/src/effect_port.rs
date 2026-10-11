//! SDK tools meet native policy here. No raw SDK file/shell/MCP tools are installed.
use async_trait::async_trait;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use vibespace_engine::{Decision, EffectPort, Failure, ToolProposal, WorkspaceScope};
use vibespace_policy::{
    AgentHandle, ApprovalToken, FileExecutor, Origin, PollResult, ProposeResult,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadArgs {
    path: String,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WriteArgs {
    path: String,
    content: String,
}

enum FileOperation {
    Read(String),
    Write(String, Vec<u8>),
    Delete(String),
}
fn parse(tool: &ToolProposal) -> Result<FileOperation, Failure> {
    match tool.name.as_str() {
        "read_file" => {
            let a: ReadArgs =
                serde_json::from_value(tool.arguments.clone()).map_err(|_| Failure::Tool)?;
            Ok(FileOperation::Read(a.path))
        }
        "write_file" => {
            let a: WriteArgs =
                serde_json::from_value(tool.arguments.clone()).map_err(|_| Failure::Tool)?;
            if a.content.len() > 48 * 1024 {
                return Err(Failure::Tool);
            }
            Ok(FileOperation::Write(a.path, a.content.into_bytes()))
        }
        "delete_file" => {
            let a: ReadArgs =
                serde_json::from_value(tool.arguments.clone()).map_err(|_| Failure::Tool)?;
            Ok(FileOperation::Delete(a.path))
        }
        _ => Err(Failure::Tool),
    }
}

struct Authorized {
    proposal: ToolProposal,
    token: ApprovalToken,
}
/// Run-scoped adapter. An approval token never goes to the model or frontend.
pub struct ScopedEffectPort {
    run_id: String,
    root: std::path::PathBuf,
    executor: Arc<FileExecutor>,
    agent: AgentHandle,
    authorized: Mutex<HashMap<String, Authorized>>,
    on_pending: Option<Arc<dyn Fn() + Send + Sync>>,
}
impl ScopedEffectPort {
    pub fn new(
        run_id: String,
        scope: &WorkspaceScope,
        executor: Arc<FileExecutor>,
        agent: AgentHandle,
    ) -> Self {
        Self {
            run_id,
            root: scope.root().into(),
            executor,
            agent,
            authorized: Mutex::new(HashMap::new()),
            on_pending: None,
        }
    }
    pub fn with_pending_observer(mut self, observer: Arc<dyn Fn() + Send + Sync>) -> Self {
        self.on_pending = Some(observer);
        self
    }
    fn check(&self, run: &str, scope: &WorkspaceScope) -> Result<(), Failure> {
        if run != self.run_id || scope.root() != self.root {
            return Err(Failure::Policy);
        }
        Ok(())
    }
}
#[async_trait]
impl EffectPort for ScopedEffectPort {
    async fn authorize(
        &self,
        run: &str,
        scope: &WorkspaceScope,
        tool: &ToolProposal,
    ) -> Result<Decision, Failure> {
        self.check(run, scope)?;
        // Model reason is not authority; describe the actual executor operation.
        let operation = parse(tool)?;
        let proposed = match &operation {
            FileOperation::Read(path) => {
                self.executor
                    .propose_read(path, "Read this isolated file", Origin::Model)
            }
            FileOperation::Write(path, content) => {
                self.executor
                    .propose_write(path, content, "Edit this isolated file", Origin::Model)
            }
            FileOperation::Delete(path) => {
                self.executor
                    .propose_delete(path, "Delete this isolated file", Origin::Model)
            }
        }
        .map_err(|_| Failure::Policy)?;
        let token = match proposed {
            ProposeResult::Denied(_) => return Ok(Decision::Deny),
            ProposeResult::Approved { token, .. } => token,
            ProposeResult::Pending(id) => {
                if let Some(observer) = &self.on_pending {
                    observer();
                }
                loop {
                    match self.agent.poll(&id).map_err(|_| Failure::Policy)? {
                        PollResult::Approved { token, .. } => break token,
                        PollResult::Denied(_) | PollResult::Gone => return Ok(Decision::Deny),
                        PollResult::Pending => tokio::time::sleep(Duration::from_millis(25)).await,
                    }
                }
            }
        };
        let mut granted = self.authorized.lock().map_err(|_| Failure::Policy)?;
        // Exactly one outstanding proposal per call ID. Never overwrite approval.
        if granted.contains_key(&tool.call_id) {
            return Err(Failure::Policy);
        }
        granted.insert(
            tool.call_id.clone(),
            Authorized {
                proposal: tool.clone(),
                token,
            },
        );
        Ok(Decision::AllowOnce)
    }
    async fn execute(
        &self,
        run: &str,
        scope: &WorkspaceScope,
        tool: &ToolProposal,
    ) -> Result<String, Failure> {
        self.check(run, scope)?;
        let approval = self
            .authorized
            .lock()
            .map_err(|_| Failure::Policy)?
            .remove(&tool.call_id)
            .ok_or(Failure::Policy)?;
        if approval.proposal != *tool {
            return Err(Failure::Policy);
        }
        // Synchronous confined IO only. No detached task can write after cancel.
        let result = match parse(tool)? {
            FileOperation::Read(path) => {
                let bytes = self
                    .executor
                    .read(approval.token, &path)
                    .map_err(|_| Failure::Tool)?;
                if bytes.len() > 48 * 1024 {
                    return Err(Failure::Tool);
                }
                let text = String::from_utf8(bytes).map_err(|_| Failure::Tool)?;
                serde_json::json!({"content": text}).to_string()
            }
            FileOperation::Write(path, bytes) => {
                let receipt = self
                    .executor
                    .write(approval.token, &path, &bytes)
                    .map_err(|_| Failure::Tool)?;
                serde_json::json!({"writtenBytes": receipt.bytes, "isolatedOnly": true}).to_string()
            }
            FileOperation::Delete(path) => {
                self.executor
                    .delete(approval.token, &path)
                    .map_err(|_| Failure::Tool)?;
                serde_json::json!({"deleted": true, "isolatedOnly": true}).to_string()
            }
        };
        // JSON escaping can grow read payloads. Bound the actual returned bytes.
        if result.len() > 64 * 1024 {
            return Err(Failure::Tool);
        }
        Ok(result)
    }
}
