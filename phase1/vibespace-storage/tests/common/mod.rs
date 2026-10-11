#![allow(dead_code)]
use somnia_vibespace_storage::*;

pub fn opts_none() -> StoreOptions {
    StoreOptions {
        recovery: Recovery::None,
        ..StoreOptions::default()
    }
}

pub fn mem_store() -> Store {
    Store::open_in_memory(opts_none()).unwrap()
}

pub fn model() -> ModelRef {
    ModelRef {
        provider: "ollama".into(),
        model: "qwen3.5:9b".into(),
        locality: ModelLocality::Local,
    }
}

/// (space, studio, run) with a fresh project space.
pub fn setup(store: &Store) -> (Space, Studio, Run) {
    let space = store
        .create_space(NewSpace::project("Project", "grant-1"))
        .unwrap();
    let studio = store
        .create_studio(NewStudio {
            schema_version: 1,
            space_id: space.id.clone(),
            goal: "Refactor".into(),
            model: model(),
        })
        .unwrap();
    let run = store.create_run(&studio.id).unwrap();
    (space, studio, run)
}

pub fn new_memory(space_id: &str, title: Option<&str>, content: &str) -> NewMemory {
    NewMemory {
        schema_version: 1,
        space_id: space_id.to_string(),
        kind: MemoryKind::Note,
        title: title.map(|t| t.to_string()),
        content: content.to_string(),
        source: MemorySource::User,
        source_ref: None,
        consent: MemoryConsent::UserExplicit,
    }
}

pub fn claim_and_run(store: &Store, run_id: &str) -> Run {
    store.claim_run(run_id, "instance-a", 60_000).unwrap();
    store
        .transition_run(
            run_id,
            TransitionRequest::execution(ExecutionState::Running),
        )
        .unwrap()
        .run
}
