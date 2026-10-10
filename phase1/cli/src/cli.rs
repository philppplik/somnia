//! Command surface. Flags map 1:1 to Board task parameters (R4-C4). Exit codes: 0 done, 1 failed, 2 needs-input/review-required.
use crate::engine::{SidecarEngine, TaskEngine};
use crate::error::{CliError, ErrorKind, Result, EXIT_FAILED};
use crate::gitops;
use crate::protocol::*;
use crate::record::{self, ERROR_SCHEMA};
use crate::runner::{self, RunSpec};
use crate::server;
use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "somnia", version, about = "Somnia headless CLI")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run an agent task on the current project (local branch, never pushes).
    Run(RunArgs),
    /// Follow a detached run's events.
    Attach(TaskArgs),
    /// Print a run's current summary.
    Status(TaskArgs),
    /// Ask a detached run to stop.
    Cancel(TaskArgs),
    #[command(name = "__serve", hide = true)]
    Serve { root: PathBuf, task_id: String },
}

#[derive(Args)]
struct RunArgs {
    /// The task prompt.
    task: String,
    /// Human-readable output (default); accepted for scripts that pass it explicitly.
    #[arg(long)]
    print: bool,
    /// Deterministic JSON only: one run summary object, no ANSI, no banner.
    #[arg(long)]
    json: bool,
    /// Skip auto-discovery of hooks/MCP/instruction files.
    #[arg(long)]
    bare: bool,
    /// Start in the background and return the task id immediately.
    #[arg(long)]
    detach: bool,
    /// Allow the local commit of the agent's work. Never pushes.
    #[arg(long)]
    yes: bool,
    #[arg(long)]
    studio: Option<String>,
    /// Task branch name (default somnia/task/<task-id>).
    #[arg(long)]
    branch: Option<String>,
    /// Idempotency key: a repeat with the same id never starts a second run.
    #[arg(long)]
    request_id: Option<String>,
    /// Add Co-authored-by/X-Somnia-Session trailers to the agent commit (opt-in).
    #[arg(long)]
    attribution: bool,
    /// Limit the agent to these project-relative roots (repeatable).
    #[arg(long = "allow-root")]
    allow_root: Vec<String>,
    #[arg(long)]
    max_tokens: Option<u64>,
    #[arg(long)]
    max_cost: Option<f64>,
    /// Project directory (default: current directory).
    #[arg(long)]
    path: Option<PathBuf>,
}

#[derive(Args)]
struct TaskArgs {
    task_id: String,
    #[arg(long)]
    json: bool,
    #[arg(long)]
    path: Option<PathBuf>,
}

fn emit_error(json: bool, e: &CliError) -> i32 {
    if json {
        println!("{}", serde_json::json!({"schema": ERROR_SCHEMA, "error": e}));
    } else {
        eprintln!("somnia: {}: {}", serde_json::to_value(e.kind).unwrap().as_str().unwrap_or("error"), e.message);
        if let Some(d) = &e.details {
            eprintln!("  details: {d}");
        }
    }
    e.exit_code()
}

pub fn main_entry() -> i32 {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Run(a) => {
            let json = a.json;
            match run_cmd(a) {
                Ok(c) => c,
                Err(e) => emit_error(json, &e),
            }
        }
        Cmd::Attach(a) => finish_task_cmd(a.json, attach_cmd(&a)),
        Cmd::Status(a) => finish_task_cmd(a.json, status_cmd(&a)),
        Cmd::Cancel(a) => finish_task_cmd(a.json, cancel_cmd(&a)),
        Cmd::Serve { root, task_id } => match serve_cmd(root, task_id) {
            Ok(()) => 0,
            Err(_) => EXIT_FAILED,
        },
    }
}

fn finish_task_cmd(json: bool, r: Result<i32>) -> i32 {
    match r {
        Ok(c) => c,
        Err(e) => emit_error(json, &e),
    }
}

fn root_of(p: &Option<PathBuf>) -> Result<PathBuf> {
    let start = match p {
        Some(p) => p.clone(),
        None => std::env::current_dir()?,
    };
    gitops::repo_root(&start)
}

fn print_frame(f: &EventFrame) {
    match &f.event {
        RunEvent::Status { status } => println!("[status] {}", serde_json::to_value(status).unwrap().as_str().unwrap()),
        RunEvent::Plan { text } => println!("[plan] {text}"),
        RunEvent::Progress { text } => println!("[progress] {text}"),
        RunEvent::NeedsInput { reason } => println!("[needs-input] {reason}"),
        RunEvent::Result { .. } => {}
    }
}

fn print_summary(s: &record::RunSummary) {
    let st = serde_json::to_value(s.status).unwrap();
    println!("task {} {}", s.task_id, st.as_str().unwrap());
    println!("branch {}", s.branch);
    if let Some(r) = &s.result_sha {
        println!("commit {r}{}", if s.unreviewed_checkpoint { " (unreviewed checkpoint)" } else { "" });
    }
    if let Some(e) = &s.error {
        println!("error {:?}: {}", e.kind, e.message);
    }
}

fn run_cmd(a: RunArgs) -> Result<i32> {
    let root = root_of(&a.path)?;
    let task_id = runner::new_task_id();
    let spec = RunSpec {
        task_id: task_id.clone(),
        request_id: a.request_id.clone(),
        prompt: a.task.clone(),
        root: root.clone(),
        bare: a.bare,
        yes: a.yes,
        attribution: a.attribution,
        studio: a.studio.clone(),
        branch: a.branch.clone(),
        allowed_roots: if a.allow_root.is_empty() { vec![".".into()] } else { a.allow_root.clone() },
        max_tokens: a.max_tokens,
        max_cost: a.max_cost,
    };
    // Duplicate-run protection: same request id => report the existing run, start nothing.
    if let Some(rid) = &a.request_id {
        gitops::ensure_private_store(&root)?;
        if let Some(existing) = runner::claim_request(&root, rid, &task_id)? {
            let rec = record::load(&root, &existing)?;
            return Ok(report_summary(a.json, &rec.summary(), true));
        }
    }
    let res = (|| -> Result<i32> {
        if a.detach {
            runner::preflight(&spec)?;
            return detach(&spec, a.json);
        }
        let engine = SidecarEngine::from_env()?;
        run_foreground(&spec, &engine, a.json)
    })();
    if res.is_err() {
        // Nothing started: release the idempotency key so a corrected retry can run.
        if let Some(rid) = &a.request_id {
            release_request(&root, rid);
        }
    }
    res
}

fn release_request(root: &std::path::Path, rid: &str) {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(rid.as_bytes());
    let name: String = h.iter().take(16).map(|b| format!("{b:02x}")).collect();
    let _ = std::fs::remove_file(root.join(".somnia").join("requests").join(format!("{name}.json")));
}

fn report_summary(json: bool, s: &record::RunSummary, duplicate: bool) -> i32 {
    if json {
        println!("{}", serde_json::to_string(s).unwrap());
    } else {
        if duplicate {
            println!("duplicate request id: reporting existing run");
        }
        print_summary(s);
    }
    s.status.exit_code()
}

pub fn run_foreground(spec: &RunSpec, engine: &dyn TaskEngine, json: bool) -> Result<i32> {
    let cancel = runner::cancel_flag();
    let rec = runner::execute(spec, engine, &cancel, &mut |f| {
        if !json {
            print_frame(f)
        }
    })?;
    Ok(report_summary(json, &rec.summary(), false))
}

#[cfg(unix)]
fn detach(spec: &RunSpec, json: bool) -> Result<i32> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let root = &spec.root;
    std::fs::create_dir_all(server::run_dir(root))?;
    std::fs::write(server::spec_path(root, &spec.task_id), serde_json::to_vec(spec)?)?;
    let exe = std::env::current_exe()?;
    Command::new(exe)
        .arg("__serve")
        .arg(root)
        .arg(&spec.task_id)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|e| CliError::new(ErrorKind::Internal, format!("cannot start background run: {e}")))?;
    let disc = server::discovery_path(root, &spec.task_id);
    for _ in 0..100 {
        if disc.exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    if !disc.exists() {
        return Err(CliError::new(ErrorKind::UncertainOutcome, "background run did not report ready; check `somnia status`").with_details(serde_json::json!({"task_id": spec.task_id})));
    }
    if json {
        println!("{}", serde_json::json!({"schema": "somnia.detach/1", "task_id": spec.task_id, "branch": spec.branch.clone().unwrap_or_else(|| format!("somnia/task/{}", spec.task_id))}));
    } else {
        println!("task {} started in background; follow with `somnia attach {}`", spec.task_id, spec.task_id);
    }
    Ok(0)
}
#[cfg(not(unix))]
fn detach(_: &RunSpec, _: bool) -> Result<i32> {
    Err(CliError::new(ErrorKind::EngineUnavailable, "--detach is not supported on this platform in this build"))
}

#[cfg(unix)]
fn serve_cmd(root: PathBuf, task_id: String) -> Result<()> {
    use crate::server::sock;
    use std::sync::atomic::{AtomicBool, Ordering};
    let spec: RunSpec = serde_json::from_slice(&std::fs::read(server::spec_path(&root, &task_id))?)?;
    let sp = crate::transport::socket_path(&runner::repo_id(&root), &task_id)?;
    let listener = crate::transport::bind(&sp)?;
    let disc = server::Discovery { protocol: PROTOCOL_VERSION, pid: std::process::id(), socket: sp.to_string_lossy().into_owned(), task_id: task_id.clone() };
    std::fs::write(server::discovery_path(&root, &task_id), serde_json::to_vec(&disc)?)?;
    let cancel = runner::cancel_flag();
    let stop = Arc::new(AtomicBool::new(false));
    {
        let (r, c, s) = (root.clone(), cancel.clone(), stop.clone());
        std::thread::spawn(move || sock::serve(r, listener, c, s));
    }
    let engine = SidecarEngine::from_env();
    let result = match engine {
        Ok(e) => runner::execute(&spec, &e, &cancel, &mut |_| {}).map(|_| ()),
        Err(e) => Err(e),
    };
    if let Err(e) = &result {
        // Failed before a record existed (late blocker): persist a failed record so attach/status can answer.
        write_failed_record(&spec, e);
    }
    std::thread::sleep(std::time::Duration::from_secs(2)); // let attached clients drain
    stop.store(true, Ordering::SeqCst);
    let _ = std::fs::remove_file(server::discovery_path(&root, &task_id));
    let _ = std::fs::remove_file(&sp);
    result
}
#[cfg(not(unix))]
fn serve_cmd(_: PathBuf, _: String) -> Result<()> {
    Err(CliError::new(ErrorKind::EngineUnavailable, "unsupported platform"))
}

fn write_failed_record(spec: &RunSpec, e: &CliError) {
    use crate::record::*;
    if record::load(&spec.root, &spec.task_id).is_ok() {
        return;
    }
    let mut rec = SessionRecord {
        schema: RECORD_SCHEMA.into(),
        task_id: spec.task_id.clone(),
        repo_id: runner::repo_id(&spec.root),
        branch: spec.branch.clone().unwrap_or_else(|| format!("somnia/task/{}", spec.task_id)),
        base_sha: None,
        head_sha: None,
        allowed_roots: spec.allowed_roots.clone(),
        producer: Producer { kind: "builtin".into(), name: "somnia-agent".into(), ..Default::default() },
        prompt: spec.prompt.clone(),
        plan: None,
        overrides: Overrides { bare: spec.bare, yes: spec.yes, attribution: spec.attribution, studio: spec.studio.clone(), branch: spec.branch.clone() },
        status: if e.kind == ErrorKind::ReviewRequired { Status::Review } else { Status::Failed },
        verification: None,
        usage: Usage::default(),
        unreviewed_checkpoint: false,
        error: Some(e.clone()),
        created_at: now(),
        updated_at: 0,
    };
    let _ = save(&spec.root, &mut rec);
    // A terminal Result event so followers stop waiting.
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(events_path(&spec.root, &spec.task_id)) {
        use std::io::Write;
        let fr = EventFrame { protocol: PROTOCOL_VERSION, task_id: spec.task_id.clone(), seq: 1, event: RunEvent::Result { summary: Box::new(rec.summary()) } };
        let _ = writeln!(f, "{}", serde_json::to_string(&fr).unwrap());
    }
}

fn live_discovery(root: &std::path::Path, task_id: &str) -> Option<server::Discovery> {
    let d: server::Discovery = serde_json::from_slice(&std::fs::read(server::discovery_path(root, task_id)).ok()?).ok()?;
    if crate::transport::pid_alive(d.pid) { Some(d) } else { None }
}

fn new_request(body: RequestBody) -> Request {
    let capability = body.required_capability();
    Request { protocol: PROTOCOL_VERSION, request_id: format!("r-{}", uuid::Uuid::new_v4().simple()), capability, body }
}

fn attach_cmd(a: &TaskArgs) -> Result<i32> {
    let root = root_of(&a.path)?;
    let rec = record::load(&root, &a.task_id)?;
    let last: std::cell::RefCell<Option<record::RunSummary>> = std::cell::RefCell::new(None);
    let json = a.json;
    let on_event = |f: &EventFrame| {
        if let RunEvent::Result { summary } = &f.event {
            *last.borrow_mut() = Some((**summary).clone());
        } else if !json {
            print_frame(f);
        }
    };
    #[cfg(unix)]
    if let Some(d) = live_discovery(&root, &a.task_id) {
        let req = new_request(RequestBody::Attach { task_id: a.task_id.clone() });
        let mut err: Option<CliError> = None;
        crate::server::sock::request(std::path::Path::new(&d.socket), &req, &mut |fr| match fr {
            Frame::Event { event, .. } => {
                let done = matches!(event.event, RunEvent::Result { .. });
                on_event(&event);
                !done
            }
            Frame::Error { error, .. } => {
                err = Some(error);
                false
            }
            _ => true,
        })?;
        if let Some(e) = err {
            return Err(e);
        }
        if let Some(s) = last.borrow().clone() {
            return Ok(report_summary(json, &s, false));
        }
    }
    // Run already finished (or no live socket): replay the persisted event log read-only.
    server::stream_events(&root, &a.task_id, None, &mut |f| {
        on_event(f);
        Ok(())
    })
    .or_else(|e| if rec.status.is_terminal() { Ok(()) } else { Err(e) })?;
    let s = last.borrow().clone().unwrap_or_else(|| record::load(&root, &a.task_id).map(|r| r.summary()).unwrap());
    Ok(report_summary(json, &s, false))
}

fn status_cmd(a: &TaskArgs) -> Result<i32> {
    let root = root_of(&a.path)?;
    let rec = record::load(&root, &a.task_id)?;
    Ok(report_summary(a.json, &rec.summary(), false))
}

fn cancel_cmd(a: &TaskArgs) -> Result<i32> {
    let root = root_of(&a.path)?;
    #[cfg(unix)]
    {
        let d = live_discovery(&root, &a.task_id).ok_or_else(|| CliError::new(ErrorKind::NotFound, "no live run for that task id"))?;
        let req = new_request(RequestBody::Cancel { task_id: a.task_id.clone() });
        let mut ok = false;
        let mut err = None;
        crate::server::sock::request(std::path::Path::new(&d.socket), &req, &mut |f| {
            match f {
                Frame::Ack { .. } => ok = true,
                Frame::Error { error, .. } => err = Some(error),
                _ => {}
            }
            false
        })?;
        if let Some(e) = err {
            return Err(e);
        }
        if a.json {
            println!("{}", serde_json::json!({"schema": "somnia.cancel/1", "task_id": a.task_id, "acknowledged": ok}));
        } else {
            println!("cancel {}", if ok { "acknowledged" } else { "not acknowledged" });
        }
        return Ok(if ok { 0 } else { 1 });
    }
    #[allow(unreachable_code)]
    {
        let _ = root;
        Err(CliError::new(ErrorKind::EngineUnavailable, "unsupported platform"))
    }
}
