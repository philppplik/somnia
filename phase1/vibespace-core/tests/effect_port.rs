use somnia_vibespace_core::effect_port::ScopedEffectPort;
use std::{sync::Arc, time::Duration};
use vibespace_engine::{Decision, EffectPort, ToolProposal, WorkspaceScope};
use vibespace_policy::*;

fn setup() -> (
    tempfile::TempDir,
    BrokerHandles,
    Arc<ScopedEffectPort>,
    WorkspaceScope,
) {
    let dir = tempfile::tempdir().unwrap();
    IsolatedRoot::initialize(dir.path()).unwrap();
    let broker = ConsentBroker::new().unwrap();
    let run = RunId::new("run").unwrap();
    let scope = ScopeId::new("copy").unwrap();
    broker
        .runs
        .register_run(RunScope::new(run.clone(), scope.clone()))
        .unwrap();
    let executor = FileExecutor::attach(
        &broker.agent,
        run,
        scope,
        IsolatedRoot::open(dir.path()).unwrap(),
        FileLimits::default(),
    )
    .unwrap();
    let workspace = WorkspaceScope::new(dir.path().into()).unwrap();
    let port = Arc::new(ScopedEffectPort::new(
        "run".into(),
        &workspace,
        Arc::new(executor),
        broker.agent.clone(),
    ));
    (dir, broker, port, workspace)
}
fn write() -> ToolProposal {
    ToolProposal {
        call_id: "call".into(),
        name: "write_file".into(),
        arguments: serde_json::json!({"path":"a.txt","content":"after"}),
    }
}
async fn approve(broker: &BrokerHandles) {
    for _ in 0..100 {
        let pending = broker.ui.pending().unwrap();
        if let Some(request) = pending.first() {
            broker
                .ui
                .decide(&request.request_id, UserDecision::AllowOnce)
                .unwrap();
            return;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    panic!("no consent request");
}
#[tokio::test]
async fn actual_policy_port_denies_before_effect_and_binds_exact_args() {
    let (dir, broker, port, workspace) = setup();
    let task = tokio::spawn({
        let port = port.clone();
        let scope = workspace.clone();
        async move { port.authorize("run", &scope, &write()).await }
    });
    approve(&broker).await;
    assert_eq!(task.await.unwrap().unwrap(), Decision::AllowOnce);
    assert!(!dir.path().join("a.txt").exists());
    let mut changed = write();
    changed.arguments["content"] = serde_json::json!("forged");
    assert!(port.execute("run", &workspace, &changed).await.is_err());
    assert!(port.execute("run", &workspace, &write()).await.is_err());
    assert!(!dir.path().join("a.txt").exists());
}
#[tokio::test]
async fn actual_executor_writes_only_after_approval_and_cancel_blocks_late_effect() {
    let (dir, broker, port, workspace) = setup();
    let task = tokio::spawn({
        let port = port.clone();
        let scope = workspace.clone();
        async move { port.authorize("run", &scope, &write()).await }
    });
    approve(&broker).await;
    assert_eq!(task.await.unwrap().unwrap(), Decision::AllowOnce);
    let report = broker
        .runs
        .cancel_run(&RunId::new("run").unwrap(), Duration::from_secs(1))
        .unwrap();
    assert!(report.drained);
    assert!(port.execute("run", &workspace, &write()).await.is_err());
    assert!(!dir.path().join("a.txt").exists());
}
#[tokio::test]
async fn write_read_roundtrip_uses_exact_one_shot_tokens() {
    let (dir, broker, port, workspace) = setup();
    let task = tokio::spawn({
        let port = port.clone();
        let scope = workspace.clone();
        async move { port.authorize("run", &scope, &write()).await }
    });
    approve(&broker).await;
    task.await.unwrap().unwrap();
    port.execute("run", &workspace, &write()).await.unwrap();
    assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"after");
    let read = ToolProposal {
        call_id: "read".into(),
        name: "read_file".into(),
        arguments: serde_json::json!({"path":"a.txt"}),
    };
    assert_eq!(
        port.authorize("run", &workspace, &read).await.unwrap(),
        Decision::AllowOnce
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(
            &port.execute("run", &workspace, &read).await.unwrap()
        )
        .unwrap()["content"],
        "after"
    );
    assert!(port.execute("run", &workspace, &read).await.is_err());
}
#[tokio::test]
async fn unknown_tools_and_protected_paths_cannot_gain_consent() {
    let (_dir, broker, port, workspace) = setup();
    for tool in [
        ToolProposal {
            name: "shell".into(),
            ..write()
        },
        ToolProposal {
            arguments: serde_json::json!({"path":".vibespace-isolated","content":"tamper"}),
            ..write()
        },
        ToolProposal {
            arguments: serde_json::json!({"path":"../outside","content":"bad"}),
            ..write()
        },
        ToolProposal {
            arguments: serde_json::json!({"path":"a.txt","content":"ok","approved":true}),
            ..write()
        },
    ] {
        assert!(port.authorize("run", &workspace, &tool).await.is_err());
    }
    assert!(broker.ui.pending().unwrap().is_empty());
}
