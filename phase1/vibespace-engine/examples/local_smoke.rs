//! Read-only local smoke. No cloud route, credentials, or effect registration.
use std::sync::Arc;
use vibespace_engine::*;
#[tokio::main]
async fn main() -> Result<(), String> {
    let model = ModelConfig::Local {
        endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(),
        model: "Qwen3.5-9B".into(),
    };
    let transport =
        HttpModel::new(model.clone(), None, false).map_err(|_| "local transport config")?;
    let mut run = GooseBackend::new(Arc::new(transport))
        .start(RunRequest {
            run_id: "qwen-readonly-smoke".into(),
            goal: "Reply with a brief greeting. Do not request tools.".into(),
            workspace: WorkspaceScope::new(std::env::current_dir().map_err(|_| "cwd")?)
                .map_err(|_| "scope")?,
            model,
            recalled_memory: vec![],
            max_steps: 2,
        })
        .await
        .map_err(|_| "start")?;
    let mut completed = false;
    while let Some(event) = run.events.recv().await {
        if matches!(event.kind, EventKind::Completed) {
            completed = true;
        }
        println!("{:?}", event.kind);
    }
    run.join().await;
    if completed {
        Ok(())
    } else {
        Err("real model smoke did not complete".into())
    }
}
