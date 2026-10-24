//! Terminal client of the one native Runtime. No agent loop or policy bypass.
use somnia_vibespace_core::{runtime::Runtime, wire as w};
use somnia_vibespace_storage as db;
use std::{
    io::{BufRead, Write},
    sync::Arc,
};
use vibespace_engine as engine;
/// Remove terminal control characters from untrusted display data (escape/OSC).
pub fn terminal_text(text: &str) -> String {
    text.chars().filter(|c| !c.is_control()).collect()
}
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub fn print<T: serde::Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}
/// This prompt is for native terminal input only. No model string is interpreted
/// as an answer. Empty/EOF/unknown replies deny; no unattended auto-approval flag.
pub fn consent_prompt(
    input: &mut impl BufRead,
    out: &mut impl Write,
    c: &w::PendingConsent,
) -> Result<w::ConsentChoice> {
    writeln!(
        out,
        "CONSENT REQUIRED\nAction: {}\nScope: {}\nReason: {}",
        terminal_text(&c.action),
        terminal_text(&c.scope),
        terminal_text(&c.reason)
    )?;
    writeln!(
        out,
        "Type allow-once, {}or deny (default):",
        if c.allow_for_run { "allow-run, " } else { "" }
    )?;
    out.flush()?;
    let mut answer = String::new();
    input.read_line(&mut answer)?;
    Ok(match answer.trim() {
        "allow-once" => w::ConsentChoice::AllowOnce,
        "allow-run" if c.allow_for_run => w::ConsentChoice::AllowForRun,
        _ => w::ConsentChoice::Deny,
    })
}
/// Execution and effect waits stay in Runtime/engine. This only presents state,
/// receives explicit terminal consent and stops on Ctrl-C before releasing owner.
pub async fn run_foreground(
    rt: &Arc<Runtime>,
    studio: String,
    transport: Arc<dyn engine::ModelTransport>,
    config: engine::ModelConfig,
    input: &mut impl BufRead,
    out: &mut impl Write,
) -> Result<w::SnapshotReply> {
    let run = rt
        .start(
            w::StartRun {
                studio_id: studio,
                request_id: uuid::Uuid::new_v4().to_string(),
                retry_of_run_id: None,
            },
            transport,
            config,
        )
        .await?;
    let id = run.snapshot.run_id;
    // Monitor Ctrl-C on another runtime worker even while terminal input blocks.
    let owner = Arc::downgrade(rt);
    let stop_id = id.clone();
    let signal = tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            if let Some(owner) = owner.upgrade() {
                let _ = owner.stop(&stop_id).await;
            }
        }
    });
    struct AbortOnDrop(tokio::task::JoinHandle<()>);
    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _signal = AbortOnDrop(signal);
    tokio::task::yield_now().await;
    writeln!(
        out,
        "Run {id}. Edits remain isolated until explicit review/apply."
    )?;
    loop {
        let s = rt.snapshot(&id)?;
        for c in &s.snapshot.pending_consents {
            let mut prompt = || consent_prompt(input, out, c);
            let answer = if tokio::runtime::Handle::current().runtime_flavor()
                == tokio::runtime::RuntimeFlavor::MultiThread
            {
                tokio::task::block_in_place(prompt)
            } else {
                prompt()
            };
            let choice = match answer {
                Ok(c) => c,
                Err(_) => w::ConsentChoice::Deny,
            };
            rt.decide(w::ConsentDecision {
                run_id: id.clone(),
                request_id: c.request_id.clone(),
                choice,
            })?;
        }
        if matches!(
            s.snapshot.execution_state,
            w::ExecutionState::Done
                | w::ExecutionState::Stopped
                | w::ExecutionState::Failed
                | w::ExecutionState::Crashed
        ) {
            return Ok(s);
        }
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {},
            _ = tokio::signal::ctrl_c() => { rt.stop(&id).await?; }
        }
    }
}
pub async fn command(rt: &Arc<Runtime>, a: &[String]) -> Result<()> {
    let arg =
        |i: usize| -> Result<String> { a.get(i).cloned().ok_or_else(|| "missing argument".into()) };
    match a.first().map(String::as_str) {
        Some("space") if a.get(1).map(String::as_str)==Some("list")=>print(&rt.list_spaces()?),
        Some("space") if a.get(1).map(String::as_str)==Some("create")=>{
            let folder=std::path::PathBuf::from(arg(3)?);
            // CLI argv is explicit local host selection, never renderer/model input.
            let grant=rt.grant_native_folder("main", &folder)?;
            print(&rt.create_space("main", w::CreateSpace {name:arg(2)?,folder_grant_id:grant})?)
        },
        Some("studio") if a.get(1).map(String::as_str)==Some("list")=>print(&rt.list_studios()?),
        Some("studio") if a.get(1).map(String::as_str)==Some("create")=> print(&rt.create_studio(w::CreateStudio {space_id:arg(2)?,goal:arg(3)?,model:w::ModelReference {provider:"ollama".into(),model:a.get(4).cloned().unwrap_or("qwen3.5:9b".into()),locality:w::ModelLocality::Local}})?),
        Some("status")=>if let Some(id)=a.get(1){print(&rt.snapshot(id)?)}else{print(&rt.list_snapshots()?)},
        Some("events")=>print(&rt.store.list_events(&arg(1)?, a.get(2).map(|s|s.parse()).transpose()?.unwrap_or(0),500)?),
        Some("stop")=>{rt.stop(&arg(1)?).await?;Ok(())},
        Some("steer")=>{rt.steer(&arg(1)?,arg(2)?).await?;Ok(())},
        Some("review")=>print(&rt.snapshot(&arg(1)?)?.snapshot.review),
        Some("checkpoints")=>print(&rt.snapshot(&arg(1)?)?.snapshot.checkpoints),
        Some("restore")=>{rt.restore(&arg(1)?,&arg(2)?)?;Ok(())},
        Some("apply")=>{rt.apply(&arg(1)?,&arg(2)?,a.get(3..).unwrap_or_default().to_vec())?;Ok(())},
        Some("discard")=>{rt.discard(&arg(1)?,&arg(2)?)?;Ok(())},
        Some("consent")=>{
            let id=arg(1)?; let req=arg(2)?; let s=rt.snapshot(&id)?;
            let c=s.snapshot.pending_consents.iter().find(|c|c.request_id==req).ok_or("consent changed or expired")?;
            let choice=tokio::task::block_in_place(|| consent_prompt(&mut std::io::stdin().lock(),&mut std::io::stdout().lock(),c))?;
            rt.decide(w::ConsentDecision {run_id:id,request_id:req,choice})?;Ok(())
        },
        Some("memory")=>{
            let space=arg(2)?;
            match a.get(1).map(String::as_str) {
                Some("list")=>print(&rt.store.list_memory(&space,&db::MemoryListOptions::default())?),
                Some("search")=>print(&rt.store.search_memory(&space,&arg(3)?,&db::SearchOptions::default())?),
                Some("delete")=>print(&rt.store.delete_memory(&space,&arg(3)?)?),
                Some("add")=>print(&rt.store.add_memory(db::NewMemory {schema_version:1,space_id:space,kind:db::MemoryKind::Note,title:None,content:arg(3)?,source:db::MemorySource::User,source_ref:None,consent:db::MemoryConsent::UserExplicit})?),
                _=>Err("memory: list/add/delete/search SPACE [TEXT|ID]".into())
            }
        },
        Some("start")=>{
            let studio=rt.store.get_studio(&arg(1)?)?;
            if studio.model.locality!=db::ModelLocality::Local {return Err("Cloud credentials must use the existing native vault/auth bridge; CLI alpha supports local models only".into());}
            let config=engine::ModelConfig::Local {endpoint:arg(2)?,model:studio.model.model};
            let transport=Arc::new(engine::HttpModel::new(config.clone(),None,true).map_err(|_|"invalid local model endpoint")?);
            if a.get(3).map(String::as_str)==Some("--attached") {
                // Only the persistent interactive terminal uses this mode.
                print(&rt.start(w::StartRun {studio_id:arg(1)?,request_id:uuid::Uuid::new_v4().to_string(),retry_of_run_id:None}, transport, config).await?)
            } else {
                let s=run_foreground(rt,arg(1)?,transport,config,&mut std::io::stdin().lock(),&mut std::io::stdout().lock()).await?;print(&s)
            }
        },
        _=>Err("Commands: space create NAME FOLDER | space list | studio create SPACE GOAL [MODEL] | studio list | start STUDIO LOOPBACK_ENDPOINT | status [RUN] | events RUN [AFTER] | stop RUN | steer RUN TEXT | consent RUN REQUEST | review RUN | apply RUN REVISION PATH... | discard RUN REVISION | checkpoints RUN | restore RUN CHECKPOINT | memory list/add/delete/search SPACE [TEXT|ID]".into())
    }
}
