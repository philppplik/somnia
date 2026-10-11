//! How core calls the policy crate: register a run, attach the file executor, propose, let the
//! UI side decide, execute with the token, then cancel.
//!
//! `cargo run --example core_call`

use std::time::Duration;
use vibespace_policy::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = std::env::temp_dir().join(format!("vibespace-policy-example-{}", std::process::id()));
    IsolatedRoot::initialize(&dir)?; // done by whoever creates the isolated copy

    let b = ConsentBroker::new()?;
    let (run, scope) = (RunId::new("run-1")?, ScopeId::new("copy-1")?);
    let mut rs = RunScope::new(run.clone(), scope.clone()); // D5: ask for writes
    rs.label = "Website relaunch".into();
    b.runs.register_run(rs)?;
    let fx = FileExecutor::attach(
        &b.agent,
        run.clone(),
        scope,
        IsolatedRoot::open(&dir)?,
        FileLimits::default(),
    )?;

    // Agent side: propose a write. Nothing is written yet.
    let ProposeResult::Pending(id) = fx.propose_write(
        "notes/todo.md",
        b"- ship",
        "Track the next steps",
        Origin::Model,
    )?
    else {
        unreachable!()
    };

    // UI side: show the queue (JSON for the webview), then the user picks.
    println!("{}", serde_json::to_string_pretty(&b.ui.pending()?)?);
    b.ui.decide_wire("run-1", id.as_str(), UserDecision::AllowOnce)?;

    // Agent side: collect the token and execute. The executor re-checks it against its own args.
    let PollResult::Approved { token, .. } = b.agent.poll(&id)? else {
        unreachable!()
    };
    fx.write(token, "notes/todo.md", b"- ship")?;
    println!(
        "wrote {} bytes",
        std::fs::read(dir.join("notes/todo.md"))?.len()
    );

    // Stop button: revoke everything, wait for in-flight effects.
    let report = b.runs.cancel_run(&run, Duration::from_secs(2))?;
    println!("cancel: {report:?}");
    println!("audit events: {}", b.ui.audit(100)?.events.len());
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}
