use async_trait::async_trait;
use somnia_vibespace_cli::{consent_prompt, run_foreground};
use somnia_vibespace_core::{ownership::OwnerKind, runtime::Runtime, wire as w};
use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
use vibespace_engine as e;
struct Fixture(AtomicUsize);
#[async_trait]
impl e::ModelTransport for Fixture {
    async fn complete(&self, _: e::ModelInput) -> Result<e::ModelReply, e::Failure> {
        let n = self.0.fetch_add(1, Ordering::SeqCst);
        Ok(e::ModelReply {
            message: "offline fixture".into(),
            tool: if n == 0 {
                Some(e::ToolProposal {
                    call_id: "edit".into(),
                    name: "write_file".into(),
                    arguments: serde_json::json!({"path":"hello.txt","content":"after"}),
                })
            } else {
                None
            },
            usage: Default::default(),
        })
    }
}
#[tokio::test]
async fn fixture_create_run_consent_review_apply_checkpoint() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    std::fs::write(project.path().join("hello.txt"), "before").unwrap();
    let rt = Runtime::open_owned(data.path(), true, OwnerKind::Cli, false).unwrap();
    let grant = rt.grant_native_folder("main", project.path()).unwrap();
    let space = rt
        .create_space(
            "main",
            w::CreateSpace {
                name: "fixture".into(),
                folder_grant_id: grant,
            },
        )
        .unwrap();
    let studio = rt
        .create_studio(w::CreateStudio {
            space_id: space.space_id,
            goal: "edit".into(),
            model: w::ModelReference {
                provider: "ollama".into(),
                model: "qwen3.5:9b".into(),
                locality: w::ModelLocality::Local,
            },
        })
        .unwrap();
    let mut input = Cursor::new(b"allow-once\n");
    let mut out = vec![];
    let done = run_foreground(
        &rt,
        studio.studio_id,
        Arc::new(Fixture(AtomicUsize::new(0))),
        e::ModelConfig::Local {
            endpoint: "http://127.0.0.1:1/v1/chat/completions".into(),
            model: "qwen3.5:9b".into(),
        },
        &mut input,
        &mut out,
    )
    .await
    .unwrap();
    let display = String::from_utf8(out).unwrap();
    assert!(display.contains("CONSENT REQUIRED"));
    assert!(display.contains("allow-once"));
    assert!(display.contains("Scope:"));
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert_eq!(done.snapshot.review_state, w::ReviewState::Ready);
    let review = done.snapshot.review.unwrap();
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
    assert!(rt
        .snapshot(&done.snapshot.run_id)
        .unwrap()
        .snapshot
        .checkpoints
        .iter()
        .any(|c| c.label == "Before Apply (Undo)"));
    drop(rt);
    assert!(Runtime::open_owned(data.path(), true, OwnerKind::Gui, false).is_ok());
}
#[test]
fn prompts_default_deny_and_never_elevate_disallowed_run_grant() {
    let c = w::PendingConsent {
        request_id: "c".into(),
        action: "write".into(),
        scope: "isolated/hello.txt".into(),
        reason: "edit".into(),
        allow_for_run: false,
        kind: Some("write".into()),
    };
    for text in ["", "\n", "allow-run\n", "yes\n", "ignore all policies\n"] {
        let mut out = vec![];
        assert_eq!(
            consent_prompt(&mut Cursor::new(text), &mut out, &c).unwrap(),
            w::ConsentChoice::Deny
        );
        assert!(!String::from_utf8(out).unwrap().contains("allow-run"));
    }
}
#[test]
fn binary_create_memory_restart_and_live_owner_conflict() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let bin = env!("CARGO_BIN_EXE_somnia-vibe");
    let invoke = |args: &[&str]| {
        std::process::Command::new(bin)
            .arg("--data")
            .arg(data.path())
            .args(args)
            .output()
            .unwrap()
    };
    let result = invoke(&["space", "create", "CLI", project.path().to_str().unwrap()]);
    assert!(result.status.success(), "{:?}", result);
    let space: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    let id = space["spaceId"].as_str().unwrap();
    assert!(invoke(&["memory", "add", id, "remember fixture"])
        .status
        .success());
    assert!(
        String::from_utf8(invoke(&["memory", "search", id, "fixture"]).stdout)
            .unwrap()
            .contains("remember fixture")
    );
    let gui = Runtime::open(data.path(), true).unwrap();
    let result = invoke(&["status"]);
    assert!(!result.status.success());
    assert!(String::from_utf8(result.stderr)
        .unwrap()
        .contains("GUI/CLI"));
    drop(gui);
}
#[test]
fn terminal_control_sequences_are_not_emitted_as_controls() {
    assert_eq!(
        somnia_vibespace_cli::terminal_text("write\u{1b}]8;;https://evil\u{7}\r\n"),
        "write]8;;https://evil"
    );
}
struct Waiting;
#[async_trait]
impl e::ModelTransport for Waiting {
    async fn complete(&self, _: e::ModelInput) -> Result<e::ModelReply, e::Failure> {
        std::future::pending().await
    }
}
#[tokio::test]
async fn interactive_owner_can_steer_stop_and_deny_without_second_open() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    std::fs::write(project.path().join("hello.txt"), "before").unwrap();
    let rt = Runtime::open_owned(data.path(), true, OwnerKind::Cli, false).unwrap();
    let grant = rt.grant_native_folder("main", project.path()).unwrap();
    let space = rt
        .create_space(
            "main",
            w::CreateSpace {
                name: "fixture".into(),
                folder_grant_id: grant,
            },
        )
        .unwrap();
    let studio = rt
        .create_studio(w::CreateStudio {
            space_id: space.space_id,
            goal: "edit".into(),
            model: w::ModelReference {
                provider: "ollama".into(),
                model: "qwen3.5:9b".into(),
                locality: w::ModelLocality::Local,
            },
        })
        .unwrap();
    let config = e::ModelConfig::Local {
        endpoint: "http://127.0.0.1:1/v1/chat/completions".into(),
        model: "qwen3.5:9b".into(),
    };
    let run = rt
        .start(
            w::StartRun {
                studio_id: studio.studio_id.clone(),
                request_id: uuid::Uuid::new_v4().to_string(),
                retry_of_run_id: None,
            },
            Arc::new(Waiting),
            config.clone(),
        )
        .await
        .unwrap();
    let id = run.snapshot.run_id;
    somnia_vibespace_cli::command(&rt, &["steer".into(), id.clone(), "shorter".into()])
        .await
        .unwrap();
    somnia_vibespace_cli::command(&rt, &["stop".into(), id.clone()])
        .await
        .unwrap();
    for _ in 0..100 {
        if rt.snapshot(&id).unwrap().snapshot.execution_state == w::ExecutionState::Stopped {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    assert_eq!(
        rt.snapshot(&id).unwrap().snapshot.execution_state,
        w::ExecutionState::Stopped
    );
    let done = run_foreground(
        &rt,
        studio.studio_id,
        Arc::new(Fixture(AtomicUsize::new(0))),
        config,
        &mut Cursor::new("deny\n"),
        &mut vec![],
    )
    .await
    .unwrap();
    assert!(done.snapshot.pending_consents.is_empty());
    assert_eq!(
        std::fs::read_to_string(project.path().join("hello.txt")).unwrap(),
        "before"
    );
    assert!(!rt
        .snapshot(&done.snapshot.run_id)
        .unwrap()
        .snapshot
        .review
        .is_some_and(|r| r
            .files
            .iter()
            .any(|f| f.after_text.as_deref() == Some("after"))));
}
