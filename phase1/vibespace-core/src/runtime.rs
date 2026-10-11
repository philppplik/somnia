//! Single owning native runtime. No frontend or model can supply effect authority.
use crate::{effect_port::ScopedEffectPort, folder_grants::FolderGrants, wire as w};
use engine::AgentBackend;
use somnia_vibespace_checkpoints as cp;
use somnia_vibespace_storage as db;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::broadcast;
use vibespace_engine as engine;
use vibespace_policy as policy;

pub type Result<T> = std::result::Result<T, CoreError>;
#[derive(Debug)]
pub struct CoreError(pub &'static str);
impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for CoreError {}
impl From<db::Error> for CoreError {
    fn from(_: db::Error) -> Self {
        Self("storage operation failed")
    }
}
impl From<cp::Error> for CoreError {
    fn from(_: cp::Error) -> Self {
        Self("checkpoint operation failed; originals may require recovery")
    }
}
fn lock<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    mutex.lock().map_err(|_| CoreError("runtime lock failed"))
}
fn now() -> String {
    db::time::format_millis(db::time::now_millis())
}
fn model(m: &db::ModelRef) -> w::ModelReference {
    w::ModelReference {
        provider: m.provider.clone(),
        model: m.model.clone(),
        locality: if m.locality == db::ModelLocality::Local {
            w::ModelLocality::Local
        } else {
            w::ModelLocality::Cloud
        },
    }
}

pub struct Runtime {
    pub store: Arc<db::Store>,
    vault: cp::Vault,
    broker: policy::BrokerHandles,
    grants: Mutex<FolderGrants>,
    /// Serializes user lifecycle/artifact operations, including baseline and Apply.
    command: Mutex<()>,
    handles: Mutex<HashMap<String, Arc<tokio::sync::Mutex<engine::RunHandle>>>>,
    events: broadcast::Sender<w::RunEvent>,
    instance: String,
    /// Windows effects stay unavailable until native Windows test evidence exists.
    enable_files: bool,
}
impl Runtime {
    pub fn open(data: &Path, enable_files: bool) -> Result<Arc<Self>> {
        std::fs::create_dir_all(data)
            .map_err(|_| CoreError("cannot create native data directory"))?;
        let vault = cp::Vault::open(data.join("artifacts"))?;
        let recovery = vault.recover()?;
        if !recovery.failed.is_empty() {
            return Err(CoreError("artifact recovery incomplete; open recovery log"));
        }
        let store = Arc::new(db::Store::open(
            data.join("vibespace.sqlite"),
            db::StoreOptions::default(),
        )?);
        let broker =
            policy::ConsentBroker::new().map_err(|_| CoreError("cannot create consent broker"))?;
        let (events, _) = broadcast::channel(256);
        Ok(Arc::new(Self {
            store,
            vault,
            broker,
            grants: Mutex::new(FolderGrants::default()),
            command: Mutex::new(()),
            handles: Mutex::new(HashMap::new()),
            events,
            instance: uuid::Uuid::new_v4().to_string(),
            enable_files,
        }))
    }
    pub fn subscribe(&self) -> broadcast::Receiver<w::RunEvent> {
        self.events.subscribe()
    }
    pub fn grant_native_folder(&self, window: &str, folder: &Path) -> Result<String> {
        lock(&self.grants)?
            .issue_from_native_selection(window, folder)
            .map_err(|_| CoreError("invalid native folder selection"))
    }
    pub fn create_space(&self, window: &str, request: w::CreateSpace) -> Result<w::SpaceSummary> {
        let _guard = lock(&self.command)?;
        let root = lock(&self.grants)?
            .consume(window, &request.folder_grant_id)
            .map_err(|_| CoreError("folder selection expired; choose again"))?;
        // Check vault overlap before persisting a usable scope.
        if root.starts_with(self.vault.root()) || self.vault.root().starts_with(&root) {
            return Err(CoreError("project scope overlaps private runtime data"));
        }
        let root = root.to_str().ok_or(CoreError("folder path is not UTF-8"))?;
        let space = self.store.create_space(db::NewSpace::project(
            &request.name,
            &request.folder_grant_id,
        ))?;
        self.store.bind_native_scope(&space.id, root)?;
        self.space_summary(&space)
    }
    fn space_summary(&self, space: &db::Space) -> Result<w::SpaceSummary> {
        let root = self
            .store
            .native_scope_anchor(&space.id)?
            .unwrap_or_default();
        let label = Path::new(&root)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unavailable scope")
            .to_string();
        Ok(w::SpaceSummary {
            space_id: space.id.clone(),
            name: space.name.clone(),
            scope_label: label,
            autonomy: "ask_for_writes".into(),
            studio_count: self.store.list_studios(&space.id, 500)?.len() as u64,
        })
    }
    pub fn list_spaces(&self) -> Result<Vec<w::SpaceSummary>> {
        self.store
            .list_spaces(500)?
            .iter()
            .map(|s| self.space_summary(s))
            .collect()
    }
    pub fn create_studio(&self, request: w::CreateStudio) -> Result<w::StudioSummary> {
        if !matches!(
            (request.model.provider.as_str(), &request.model.locality),
            ("ollama" | "lmstudio", w::ModelLocality::Local)
                | ("openai" | "openrouter", w::ModelLocality::Cloud)
        ) {
            return Err(CoreError("model provider is not supported by this alpha"));
        }
        let studio = self.store.create_studio(db::NewStudio {
            schema_version: 1,
            space_id: request.space_id,
            goal: request.goal,
            model: db::ModelRef {
                provider: request.model.provider,
                model: request.model.model,
                locality: if request.model.locality == w::ModelLocality::Local {
                    db::ModelLocality::Local
                } else {
                    db::ModelLocality::Cloud
                },
            },
        })?;
        self.studio_summary(&studio)
    }
    fn studio_summary(&self, studio: &db::Studio) -> Result<w::StudioSummary> {
        let runs = self
            .store
            .list_runs(&studio.space_id, Some(&studio.id), 500)?;
        let busy = runs.iter().any(|r| {
            !r.execution.is_terminal()
                || matches!(r.review, db::ReviewState::Ready | db::ReviewState::Conflict)
        });
        let scope_ready = self.store.native_scope_anchor(&studio.space_id)?.is_some();
        Ok(w::StudioSummary {
            studio_id: studio.id.clone(),
            space_id: studio.space_id.clone(),
            goal: studio.goal.clone(),
            model: model(&studio.model),
            can_start: scope_ready && !busy,
            latest_run_id: runs.first().map(|r| r.id.clone()),
        })
    }
    pub fn list_studios(&self) -> Result<Vec<w::StudioSummary>> {
        let mut result = vec![];
        for space in self.store.list_spaces(500)? {
            for studio in self.store.list_studios(&space.id, 500)? {
                result.push(self.studio_summary(&studio)?);
            }
        }
        Ok(result)
    }
    /// `transport` is created by trusted native settings resolution, not renderer code.
    pub async fn start(
        self: &Arc<Self>,
        request: w::StartRun,
        transport: Arc<dyn engine::ModelTransport>,
        config: engine::ModelConfig,
    ) -> Result<w::SnapshotReply> {
        let (run, workspace, backend) = {
            let _guard = lock(&self.command)?;
            if let Some(old) = self.store.get_run_by_request(&request.request_id)? {
                if old.studio_id != request.studio_id
                    || old.retry_of_run_id != request.retry_of_run_id
                {
                    return Err(CoreError("request identity conflict"));
                }
                return self.snapshot(&old.id);
            }
            let studio = self.store.get_studio(&request.studio_id)?;
            if config.model() != studio.model.model {
                return Err(CoreError("configured model differs from Studio"));
            }
            if matches!(config, engine::ModelConfig::Local { .. })
                != (studio.model.locality == db::ModelLocality::Local)
            {
                return Err(CoreError("model locality mismatch"));
            }
            if !self.studio_summary(&studio)?.can_start {
                return Err(CoreError("Studio has an active or unreviewed run"));
            }
            let root = self
                .store
                .native_scope_anchor(&studio.space_id)?
                .ok_or(CoreError("no validated folder scope"))?;
            let root = PathBuf::from(root);
            if std::fs::symlink_metadata(&root)
                .map_err(|_| CoreError("project folder unavailable"))?
                .file_type()
                .is_symlink()
            {
                return Err(CoreError("project root changed to symlink"));
            }
            let run = self
                .store
                .start_run(db::StartRunRequest {
                    schema_version: 1,
                    studio_id: studio.id,
                    request_id: request.request_id,
                    retry_of_run_id: request.retry_of_run_id,
                })?
                .run;
            self.store.claim_run(&run.id, &self.instance, 3600000)?;
            let preparation = (|| -> Result<_> {
                let checkpoint = self.vault.checkpoint(
                    &cp::Scope::single("project", root),
                    cp::RunMetadata {
                        run_id: Some(run.id.clone()),
                        label: Some("Checkpoint 0".into()),
                        ..Default::default()
                    },
                )?;
                let copy = self.vault.isolated_copy(&checkpoint)?;
                let workspace = engine::WorkspaceScope::new(copy.root_dir("project"))
                    .map_err(|_| CoreError("isolated workspace unavailable"))?;
                self.store.add_checkpoint(db::NewCheckpoint {
                    schema_version: 1,
                    space_id: run.space_id.clone(),
                    run_id: run.id.clone(),
                    kind: db::CheckpointKind::Baseline,
                    label: "Checkpoint 0".into(),
                    content_ref: format!("sha256:{}", checkpoint.to_hex()),
                })?;
                self.store.append_event(
                    &run.id,
                    "core.prepared",
                    &serde_json::json!({"baseline":checkpoint.to_hex(),"isolatedId":copy.id}),
                    None,
                )?;
                let mut backend = engine::GooseBackend::new(transport);
                if self.enable_files {
                    let run_id = policy::RunId::new(&run.id)
                        .map_err(|_| CoreError("invalid policy run id"))?;
                    let scope_id = policy::ScopeId::new(&copy.id)
                        .map_err(|_| CoreError("invalid policy scope id"))?;
                    self.broker
                        .runs
                        .register_run(policy::RunScope::new(run_id.clone(), scope_id.clone()))
                        .map_err(|_| CoreError("cannot register policy run"))?;
                    let executor = policy::FileExecutor::attach(
                        &self.broker.agent,
                        run_id,
                        scope_id,
                        policy::IsolatedRoot::open(workspace.root())
                            .map_err(|_| CoreError("isolated root refused"))?,
                        policy::FileLimits {
                            max_read_bytes: 48 * 1024,
                            max_write_bytes: 48 * 1024,
                            ..Default::default()
                        },
                    )
                    .map_err(|_| CoreError("file enforcement unavailable"))?;
                    let weak = Arc::downgrade(self);
                    let observed_run = run.id.clone();
                    let observer = Arc::new(move || {
                        if let Some(runtime) = weak.upgrade() {
                            runtime
                                .store
                                .append_event(
                                    &observed_run,
                                    "consent.pending",
                                    &serde_json::json!({}),
                                    None,
                                )
                                .ok();
                            runtime.publish(&observed_run).ok();
                        }
                    });
                    backend = backend.with_effect_port(Arc::new(
                        ScopedEffectPort::new(
                            run.id.clone(),
                            &workspace,
                            Arc::new(executor),
                            self.broker.agent.clone(),
                        )
                        .with_pending_observer(observer),
                    ));
                }
                Ok((workspace, backend))
            })();
            match preparation {
                Ok((workspace, backend)) => {
                    self.store.transition_run(
                        &run.id,
                        db::TransitionRequest::execution(db::ExecutionState::Running),
                    )?;
                    (run, workspace, backend)
                }
                Err(error) => {
                    self.store.transition_run(
                        &run.id,
                        db::TransitionRequest {
                            execution: Some(db::ExecutionState::Failed),
                            result: Some(serde_json::json!({"code":"preparation_failed"})),
                            ..Default::default()
                        },
                    )?;
                    self.publish(&run.id).ok();
                    return Err(error);
                }
            }
        };
        let studio = self.store.get_studio(&run.studio_id)?;
        let mut memory = vec![];
        let mut bytes = 0;
        for item in self.store.list_memory(
            &run.space_id,
            &db::MemoryListOptions {
                limit: 32,
                ..Default::default()
            },
        )? {
            if bytes + item.content.len() > 16384 {
                break;
            }
            bytes += item.content.len();
            memory.push(item.content);
        }
        let started=backend.start(engine::RunRequest{run_id:run.id.clone(),goal:format!("{}\nAvailable proposed tools: read_file(path), write_file(path, content), delete_file(path). File paths are relative to the isolated project. Never request shell, network or original-file effects.",studio.goal),workspace,model:config,recalled_memory:memory,max_steps:64}).await;
        let mut handle = match started {
            Ok(handle) => handle,
            Err(_) => {
                self.store.transition_run(
                    &run.id,
                    db::TransitionRequest {
                        execution: Some(db::ExecutionState::Failed),
                        result: Some(serde_json::json!({"code":"engine_start_failed"})),
                        ..Default::default()
                    },
                )?;
                self.publish(&run.id).ok();
                return Err(CoreError("agent could not start"));
            }
        };
        let (_, dummy) = tokio::sync::mpsc::unbounded_channel();
        let mut incoming = std::mem::replace(&mut handle.events, dummy);
        let handle = Arc::new(tokio::sync::Mutex::new(handle));
        lock(&self.handles)?.insert(run.id.clone(), handle);
        let runtime = self.clone();
        let id = run.id.clone();
        tokio::spawn(async move {
            while let Some(event) = incoming.recv().await {
                if runtime.consume_engine_event(&id, event.kind).is_err() {
                    runtime.fail_run(&id, "event_persistence_failed").ok();
                    break;
                }
            }
            if let Ok(run) = runtime.store.get_run(&id) {
                if !run.execution.is_terminal() {
                    runtime.fail_run(&id, "engine_interrupted").ok();
                }
            }
            runtime.finish_policy(&id);
            if let Ok(mut handles) = runtime.handles.lock() {
                handles.remove(&id);
            }
        });
        self.publish(&run.id)?;
        self.snapshot(&run.id)
    }
    fn finish_policy(&self, id: &str) {
        if let Ok(run) = policy::RunId::new(id) {
            self.broker
                .runs
                .finish_run(&run, Duration::from_secs(2))
                .ok();
        }
    }
    fn fail_run(&self, id: &str, code: &str) -> Result<()> {
        let state = self.store.get_run(id)?.execution;
        if state.is_terminal() {
            return Ok(());
        }
        self.store.transition_run(
            id,
            db::TransitionRequest {
                execution: Some(db::ExecutionState::Failed),
                result: Some(serde_json::json!({"code":code})),
                ..Default::default()
            },
        )?;
        self.publish(id)
    }
    fn consume_engine_event(&self, id: &str, event: engine::EventKind) -> Result<()> {
        if self.store.get_run(id)?.execution.is_terminal() {
            return Ok(());
        }
        use engine::EventKind::*;
        match event {
            Completed | Stopped => {
                let state = if matches!(event, Stopped) {
                    db::ExecutionState::Stopped
                } else {
                    db::ExecutionState::Done
                };
                let review_result = self.prepared(id).and_then(|(baseline, copy)| {
                    self.vault
                        .review_changes(&baseline, &copy)
                        .map_err(CoreError::from)
                });
                match review_result {
                    Ok(review) => {
                        self.store
                            .transition_run(id, db::TransitionRequest::execution(state))?;
                        if !review.changes.is_empty() {
                            self.store.transition_run(
                                id,
                                db::TransitionRequest::review(db::ReviewState::Ready),
                            )?;
                        }
                    }
                    Err(_) => {
                        self.fail_run(id, "artifact_review_failed")?;
                    }
                }
                self.finish_policy(id);
            }
            Failed(failure) => {
                self.fail_run(
                    id,
                    match failure {
                        engine::Failure::Model => "model_failed",
                        engine::Failure::Policy => "policy_failed",
                        engine::Failure::Tool => "tool_failed",
                        engine::Failure::StepLimit => "step_limit",
                        _ => "invalid_request",
                    },
                )?;
                self.finish_policy(id);
            }
            Started => {
                self.store
                    .append_event(id, "agent.started", &serde_json::json!({}), None)?;
            }
            Step { index, name } => {
                self.store.append_event(
                    id,
                    "agent.step",
                    &serde_json::json!({"index":index,"name":name}),
                    None,
                )?;
            }
            Message(text) => {
                self.store.append_event(
                    id,
                    "agent.message",
                    &serde_json::json!({"text":text.chars().take(6000).collect::<String>()}),
                    None,
                )?;
            }
            Usage(usage) => {
                self.store.append_event(id,"agent.usage",&serde_json::json!({"inputTokens":usage.input_tokens,"outputTokens":usage.output_tokens}),None)?;
            }
            ToolProposed(proposal) => {
                self.store.append_event(
                    id,
                    "agent.tool_proposed",
                    &serde_json::json!({"callId":proposal.call_id,"name":proposal.name}),
                    None,
                )?;
            }
        }
        self.publish(id)
    }
    fn all_events(&self, id: &str) -> Result<Vec<db::RunEventRecord>> {
        let mut events = vec![];
        let mut after = 0;
        loop {
            let page = self.store.list_events(id, after, 500)?;
            if page.is_empty() {
                break;
            }
            after = page.last().unwrap().sequence;
            events.extend(page);
            if events.len() > 10100 {
                return Err(CoreError("event history limit exceeded"));
            }
        }
        Ok(events)
    }
    fn prepared(&self, id: &str) -> Result<(cp::CheckpointId, cp::IsolatedCopy)> {
        let events = self.all_events(id)?;
        let event = events
            .iter()
            .find(|e| e.kind == "core.prepared")
            .ok_or(CoreError("run preparation is incomplete"))?;
        let baseline = cp::Digest::from_hex(
            event.payload["baseline"]
                .as_str()
                .ok_or(CoreError("baseline unavailable"))?,
        )
        .ok_or(CoreError("invalid baseline"))?;
        let copy = self.vault.open_isolated(
            event.payload["isolatedId"]
                .as_str()
                .ok_or(CoreError("isolated copy unavailable"))?,
        )?;
        Ok((baseline, copy))
    }
    fn publish(&self, id: &str) -> Result<()> {
        let snapshot = self.snapshot(id)?;
        let event = snapshot
            .into_event(now())
            .map_err(|_| CoreError("invalid projection"))?;
        let _ = self.events.send(event);
        Ok(())
    }
    pub fn decide(&self, decision: w::ConsentDecision) -> Result<()> {
        self.broker
            .ui
            .decide_wire(
                &decision.run_id,
                &decision.request_id,
                match decision.choice {
                    w::ConsentChoice::AllowOnce => policy::UserDecision::AllowOnce,
                    w::ConsentChoice::AllowForRun => policy::UserDecision::AllowForRun,
                    w::ConsentChoice::Deny => policy::UserDecision::Deny,
                },
            )
            .map_err(|_| CoreError("consent request changed or expired"))?;
        self.store.append_event(
            &decision.run_id,
            "consent.decided",
            &serde_json::json!({}),
            None,
        )?;
        self.publish(&decision.run_id)
    }
    pub async fn stop(&self, id: &str) -> Result<()> {
        if let Ok(run) = policy::RunId::new(id) {
            if self
                .broker
                .runs
                .state(&run)
                .map_err(|_| CoreError("cannot read policy run"))?
                .is_some()
            {
                self.broker
                    .runs
                    .cancel_run(&run, Duration::from_secs(2))
                    .map_err(|_| CoreError("cannot revoke run"))?;
            }
        }
        let handle = lock(&self.handles)?
            .get(id)
            .cloned()
            .ok_or(CoreError("run is not active"))?;
        handle.lock().await.cancel();
        Ok(())
    }
    pub async fn steer(&self, id: &str, message: String) -> Result<()> {
        let handle = lock(&self.handles)?
            .get(id)
            .cloned()
            .ok_or(CoreError("run is not active"))?;
        handle
            .lock()
            .await
            .steer(message)
            .await
            .map_err(|_| CoreError("steering queue unavailable"))?;
        Ok(())
    }
    pub fn snapshot(&self, id: &str) -> Result<w::SnapshotReply> {
        let run = self.store.get_run(id)?;
        let studio = self.store.get_studio(&run.studio_id)?;
        let events = self.all_events(id)?;
        let mut messages = vec![];
        let mut last_step = None;
        let mut usage = w::Usage {
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0,
            cost_usd: None,
            cost_source: None,
        };
        for event in &events {
            match event.kind.as_str() {
                "agent.message" => messages.push(w::TranscriptMessage {
                    id: format!("{}:{}", id, event.sequence),
                    role: "assistant".into(),
                    text: event.payload["text"].as_str().unwrap_or("").into(),
                    timestamp_utc: event.timestamp_utc.clone(),
                }),
                "agent.step" => last_step = event.payload["name"].as_str().map(str::to_string),
                "agent.usage" => {
                    usage.input_tokens = usage
                        .input_tokens
                        .saturating_add(event.payload["inputTokens"].as_u64().unwrap_or(0));
                    usage.output_tokens = usage
                        .output_tokens
                        .saturating_add(event.payload["outputTokens"].as_u64().unwrap_or(0));
                }
                _ => {}
            }
        }
        let pending = self
            .broker
            .ui
            .pending_for_run(&policy::RunId::new(id).map_err(|_| CoreError("invalid run id"))?)
            .map_err(|_| CoreError("cannot read consent state"))?;
        let pending_consents = pending
            .into_iter()
            .map(|p| w::PendingConsent {
                request_id: p.request_id.as_str().into(),
                action: p.kind.as_str().into(),
                scope: p.target,
                reason: p.reason,
                allow_for_run: p.offered.contains(&policy::UserDecision::AllowForRun),
            })
            .collect();
        let mut checkpoints = vec![];
        for checkpoint in self.store.list_checkpoints(&run.space_id, Some(id), 500)? {
            let digest = checkpoint
                .content_ref
                .strip_prefix("sha256:")
                .and_then(cp::Digest::from_hex);
            let files = digest
                .and_then(|d| self.vault.load_checkpoint(&d).ok())
                .map(|c| c.manifest.entries.len())
                .unwrap_or(0);
            checkpoints.push(w::CheckpointSummary {
                checkpoint_id: checkpoint.id,
                label: checkpoint.label,
                created_at_utc: checkpoint.created_at,
                file_count: files as u64,
                restorable: run.execution.is_terminal() && digest.is_some(),
            });
        }
        let mut failure = if matches!(
            run.execution,
            db::ExecutionState::Failed | db::ExecutionState::Crashed
        ) {
            Some(w::FailureSummary {
                code: run
                    .result
                    .as_ref()
                    .and_then(|v| v["code"].as_str())
                    .unwrap_or("interrupted_run")
                    .into(),
                message: "Run did not complete. Open its history or retry in a fresh copy.".into(),
                retryable: true,
            })
        } else {
            None
        };
        let review = if matches!(
            run.review,
            db::ReviewState::Ready | db::ReviewState::Conflict
        ) {
            match self.review_projection(id) {
                Ok(review) => Some(review),
                Err(_) => {
                    failure = Some(w::FailureSummary {
                        code: "artifact_review_failed".into(),
                        message: "Cannot verify the isolated changes. Nothing can be applied."
                            .into(),
                        retryable: false,
                    });
                    None
                }
            }
        } else {
            None
        };
        let active = lock(&self.handles)?.contains_key(id);
        let execution_state = serde_json::from_value(
            serde_json::to_value(run.execution).map_err(|_| CoreError("invalid state"))?,
        )
        .map_err(|_| CoreError("invalid state"))?;
        let review_state = serde_json::from_value(
            serde_json::to_value(run.review).map_err(|_| CoreError("invalid review state"))?,
        )
        .map_err(|_| CoreError("invalid review state"))?;
        let snapshot = w::RunSnapshot {
            run_id: id.into(),
            studio_id: run.studio_id,
            space_id: run.space_id,
            execution_state,
            review_state,
            goal: studio.goal,
            model: model(&studio.model),
            last_step,
            started_at_utc: run.started_at,
            finished_at_utc: run.finished_at,
            elapsed_ms: 0,
            usage: Some(usage),
            messages,
            pending_consents,
            checkpoints,
            review: review.clone(),
            failure,
            capabilities: w::RunCapabilities {
                stop: active,
                steer: active,
                pause: false,
                resume: false,
                apply: review.as_ref().is_some_and(|r| r.conflicts.is_empty()),
                restore: run.execution.is_terminal(),
            },
        };
        Ok(w::SnapshotReply {
            protocol_version: 1,
            sequence: run.last_sequence as u64,
            snapshot,
        })
    }
    pub fn list_snapshots(&self) -> Result<Vec<w::SnapshotReply>> {
        let mut result = vec![];
        for space in self.store.list_spaces(500)? {
            for run in self.store.list_runs(&space.id, None, 500)? {
                result.push(self.snapshot(&run.id)?);
            }
        }
        Ok(result)
    }
    fn review_projection(&self, id: &str) -> Result<w::ReviewProjection> {
        let run = self.store.get_run(id)?;
        let (baseline, copy) = self.prepared(id)?;
        let review = self.vault.review_changes(&baseline, &copy)?;
        let original = self.vault.load_checkpoint(&baseline)?;
        // Snapshot current originals through the trusted checkpoint service, never a model tool.
        let current = self
            .vault
            .checkpoint(&original.record.scope, cp::RunMetadata::default())?;
        let current = self.vault.load_checkpoint(&current)?;
        let mut files = vec![];
        let mut conflicts = vec![];
        for reviewed in &review.changes {
            let change = &reviewed.change;
            let before = change.before.as_ref();
            let after = change.after.as_ref();
            let actual = current.manifest.entries.get(&change.path);
            // Selected changes already applied are no longer pending review.
            if actual == after {
                continue;
            }
            let conflict = actual != before && actual != after;
            if conflict {
                conflicts.push(change.path.clone());
            }
            let text = |entry: Option<&cp::Entry>| -> Result<Option<String>> {
                match entry {
                    Some(e) if e.size <= 48 * 1024 => {
                        let bytes = self.vault.store().get_bytes(&e.digest)?;
                        if bytes.contains(&0) {
                            Ok(None)
                        } else {
                            Ok(String::from_utf8(bytes).ok())
                        }
                    }
                    _ => Ok(None),
                }
            };
            let before_text = text(before)?;
            let current_text = text(actual)?;
            // review_changes stores changed copy objects in the vault for verified reads.
            let after_text = text(after)?;
            let binary = (before.is_some() && before_text.is_none())
                || (after.is_some() && after_text.is_none());
            files.push(w::ReviewFile {
                path: change.path.clone(),
                change: match change.kind {
                    cp::ChangeKind::Added => "added",
                    cp::ChangeKind::Deleted => "deleted",
                    _ => "modified",
                }
                .into(),
                binary,
                before_text: if binary { None } else { before_text },
                after_text: if binary { None } else { after_text },
                before_bytes: before.map(|e| e.size).unwrap_or(0),
                after_bytes: after.map(|e| e.size).unwrap_or(0),
                current_text: if binary { None } else { current_text },
                current_bytes: actual.map(|e| e.size).unwrap_or(0),
                conflict,
            });
        }
        let digest =
            cp::Digest::of(&serde_json::to_vec(&review).map_err(|_| CoreError("invalid review"))?)
                .to_hex();
        Ok(w::ReviewProjection {
            revision: format!("{}:{}", run.review_revision, digest),
            summary: format!("{} files changed in the isolated copy", files.len()),
            files,
            conflicts,
            checks: vec![w::CheckSummary {
                name: "Project checks".into(),
                status: "not_run".into(),
                detail: Some("No shell/test runner is enabled in this alpha.".into()),
            }],
        })
    }
    pub fn apply(&self, id: &str, revision: &str, paths: Vec<String>) -> Result<()> {
        let _guard = lock(&self.command)?;
        let run = self.store.get_run(id)?;
        if !matches!(
            run.review,
            db::ReviewState::Ready | db::ReviewState::Conflict
        ) || !run.execution.is_terminal()
        {
            return Err(CoreError("run is not ready for review"));
        }
        let projected = self.review_projection(id)?;
        if projected.revision != revision {
            return Err(CoreError("review changed; reload before applying"));
        }
        if !projected.conflicts.is_empty() {
            return Err(CoreError("project edits conflict; nothing applied"));
        }
        let (baseline, copy) = self.prepared(id)?;
        let review = self.vault.review_changes(&baseline, &copy)?;
        let report = self.vault.explicit_apply(&cp::ApplyRequest {
            expected_baseline: baseline,
            copy: &copy,
            review: &review,
            selection: cp::Selection::Paths(paths),
            options: Default::default(),
        })?;
        self.store.add_checkpoint(db::NewCheckpoint {
            schema_version: 1,
            space_id: run.space_id,
            run_id: id.into(),
            kind: db::CheckpointKind::PreApply,
            label: "Before Apply (Undo)".into(),
            content_ref: format!("sha256:{}", report.preapply_checkpoint.to_hex()),
        })?;
        if run.review == db::ReviewState::Conflict {
            self.store
                .transition_run(id, db::TransitionRequest::review(db::ReviewState::Ready))?;
        }
        if self.review_projection(id)?.files.is_empty() {
            self.store.transition_run(
                id,
                db::TransitionRequest {
                    review: Some(db::ReviewState::Applied),
                    expected_review_revision: if run.review == db::ReviewState::Ready {
                        Some(run.review_revision)
                    } else {
                        None
                    },
                    ..Default::default()
                },
            )?;
        }
        self.publish(id)
    }
    pub fn discard(&self, id: &str, revision: &str) -> Result<()> {
        let _guard = lock(&self.command)?;
        let run = self.store.get_run(id)?;
        if !matches!(
            run.review,
            db::ReviewState::Ready | db::ReviewState::Conflict
        ) || self.review_projection(id)?.revision != revision
        {
            return Err(CoreError("review changed; reload"));
        }
        let (_, copy) = self.prepared(id)?;
        self.vault.discard(&copy)?;
        self.store.transition_run(
            id,
            db::TransitionRequest {
                review: Some(db::ReviewState::Discarded),
                expected_review_revision: Some(run.review_revision),
                ..Default::default()
            },
        )?;
        self.publish(id)
    }
    pub fn restore(&self, id: &str, checkpoint_id: &str) -> Result<()> {
        let _guard = lock(&self.command)?;
        let run = self.store.get_run(id)?;
        if !run.execution.is_terminal() {
            return Err(CoreError("stop the run before restoring"));
        }
        let checkpoint = self.store.get_checkpoint(&run.space_id, checkpoint_id)?;
        if checkpoint.run_id != id {
            return Err(CoreError("checkpoint belongs to another run"));
        }
        let digest = checkpoint
            .content_ref
            .strip_prefix("sha256:")
            .and_then(cp::Digest::from_hex)
            .ok_or(CoreError("invalid checkpoint"))?;
        let report = self
            .vault
            .restore(&digest, &cp::RestoreOptions::default())?;
        self.store.add_checkpoint(db::NewCheckpoint {
            schema_version: 1,
            space_id: run.space_id,
            run_id: id.into(),
            kind: db::CheckpointKind::PreApply,
            label: "Before Restore".into(),
            content_ref: format!("sha256:{}", report.preapply_checkpoint.to_hex()),
        })?;
        self.publish(id)
    }
}
