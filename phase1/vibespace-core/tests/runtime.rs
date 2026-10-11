use async_trait::async_trait;
use somnia_vibespace_core::{runtime::Runtime, wire::*};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use vibespace_engine as engine;
struct Script(AtomicUsize);
#[async_trait]
impl engine::ModelTransport for Script {
    async fn complete(
        &self,
        input: engine::ModelInput,
    ) -> Result<engine::ModelReply, engine::Failure> {
        let n = self.0.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            assert!(input
                .messages
                .iter()
                .any(|m| m.content.contains("remember me")));
            Ok(engine::ModelReply {
                message: "Proposing isolated edit".into(),
                tool: Some(engine::ToolProposal {
                    call_id: "write-1".into(),
                    name: "write_file".into(),
                    arguments: serde_json::json!({"path":"hello.txt","content":"after"}),
                }),
                usage: engine::Usage {
                    input_tokens: 2,
                    output_tokens: 3,
                },
            })
        } else {
            Ok(engine::ModelReply {
                message: "Review this edit".into(),
                tool: None,
                usage: engine::Usage {
                    input_tokens: 4,
                    output_tokens: 1,
                },
            })
        }
    }
}
fn setup() -> (
    tempfile::TempDir,
    tempfile::TempDir,
    Arc<Runtime>,
    StudioSummary,
) {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    std::fs::write(project.path().join("hello.txt"), "before").unwrap();
    let rt = Runtime::open(data.path(), true).unwrap();
    let grant = rt.grant_native_folder("main", project.path()).unwrap();
    let space = rt
        .create_space(
            "main",
            CreateSpace {
                name: "test".into(),
                folder_grant_id: grant,
            },
        )
        .unwrap();
    rt.store
        .add_memory(somnia_vibespace_storage::NewMemory {
            schema_version: 1,
            space_id: space.space_id.clone(),
            kind: somnia_vibespace_storage::MemoryKind::Note,
            title: None,
            content: "remember me".into(),
            source: somnia_vibespace_storage::MemorySource::User,
            source_ref: None,
            consent: somnia_vibespace_storage::MemoryConsent::UserExplicit,
        })
        .unwrap();
    let studio = rt
        .create_studio(CreateStudio {
            space_id: space.space_id,
            goal: "edit hello".into(),
            model: ModelReference {
                provider: "ollama".into(),
                model: "qwen3.5:9b".into(),
                locality: ModelLocality::Local,
            },
        })
        .unwrap();
    (data, project, rt, studio)
}
async fn complete(rt: &Arc<Runtime>, studio: &StudioSummary) -> SnapshotReply {
    let transport = Arc::new(Script(AtomicUsize::new(0)));
    let request = StartRun {
        studio_id: studio.studio_id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        retry_of_run_id: None,
    };
    let snapshot = rt
        .start(
            request.clone(),
            transport.clone(),
            engine::ModelConfig::Local {
                endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(),
                model: "qwen3.5:9b".into(),
            },
        )
        .await
        .unwrap();
    let id = snapshot.snapshot.run_id;
    // The same firing cannot start a second SDK run.
    let repeated = rt
        .start(
            request,
            transport,
            engine::ModelConfig::Local {
                endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(),
                model: "qwen3.5:9b".into(),
            },
        )
        .await
        .unwrap();
    assert_eq!(repeated.snapshot.run_id, id);
    for _ in 0..300 {
        let snapshot = rt.snapshot(&id).unwrap();
        if let Some(consent) = snapshot.snapshot.pending_consents.first() {
            rt.decide(ConsentDecision {
                run_id: id.clone(),
                request_id: consent.request_id.clone(),
                choice: ConsentChoice::AllowOnce,
            })
            .unwrap();
        }
        if snapshot.snapshot.execution_state == ExecutionState::Done {
            return snapshot;
        }
        assert_ne!(snapshot.snapshot.execution_state, ExecutionState::Failed);
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("SDK run never completed");
}
#[tokio::test]
async fn actual_sdk_policy_checkpoint_memory_review_apply_restore_restart() {
    let (data, project, rt, studio) = setup();
    assert!(studio.can_start);
    assert!(studio.latest_run_id.is_none());
    let done = complete(&rt, &studio).await;
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert_eq!(done.snapshot.review_state, ReviewState::Ready);
    let review = done.snapshot.review.unwrap();
    assert_eq!(review.files[0].after_text.as_deref(), Some("after"));
    rt.apply(
        &done.snapshot.run_id,
        &review.revision,
        vec!["project/hello.txt".into()],
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "after"
    );
    let applied = rt.snapshot(&done.snapshot.run_id).unwrap();
    assert_eq!(applied.snapshot.review_state, ReviewState::Applied);
    let undo = applied
        .snapshot
        .checkpoints
        .iter()
        .find(|c| c.label == "Before Apply (Undo)")
        .unwrap()
        .checkpoint_id
        .clone();
    rt.restore(&done.snapshot.run_id, &undo).unwrap();
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "before"
    );
    drop(rt);
    let reopened = Runtime::open(data.path(), true).unwrap();
    assert_eq!(reopened.list_spaces().unwrap().len(), 1);
    assert_eq!(
        reopened.list_studios().unwrap()[0].studio_id,
        studio.studio_id
    );
    assert_eq!(
        reopened
            .snapshot(&done.snapshot.run_id)
            .unwrap()
            .snapshot
            .execution_state,
        ExecutionState::Done
    );
}
#[tokio::test]
async fn concurrent_project_edit_conflicts_without_clobber() {
    let (_data, project, rt, studio) = setup();
    let done = complete(&rt, &studio).await;
    std::fs::write(project.path().join("hello.txt"), "user edit").unwrap();
    let snapshot = rt.snapshot(&done.snapshot.run_id).unwrap();
    let review = snapshot.snapshot.review.unwrap();
    assert_eq!(review.conflicts, vec!["project/hello.txt"]);
    assert_eq!(review.files[0].current_text.as_deref(), Some("user edit"));
    assert!(rt
        .apply(
            &done.snapshot.run_id,
            &review.revision,
            vec!["project/hello.txt".into()]
        )
        .is_err());
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "user edit"
    );
    rt.discard(&done.snapshot.run_id, &review.revision).unwrap();
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "user edit"
    );
}
