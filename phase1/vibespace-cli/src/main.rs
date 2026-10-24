use somnia_vibespace_cli::{command, Result};
use somnia_vibespace_core::{ownership::OwnerKind, runtime::Runtime};
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    let mut a: Vec<String> = std::env::args().skip(1).collect();
    if a.first().map(String::as_str) != Some("--data") || a.len() < 3 {
        return Err("Usage: somnia-vibe --data RUNTIME_DIRECTORY [--takeover] COMMAND ... | tui\nUse the SAME directory as the GUI. No automatic daemon is started.".into());
    }
    let data = std::path::PathBuf::from(a.remove(1));
    a.remove(0);
    let takeover = a.first().map(String::as_str) == Some("--takeover");
    if takeover {
        a.remove(0);
    }
    let rt = Runtime::open_owned(
        &data,
        cfg!(not(target_os = "windows")),
        OwnerKind::Cli,
        takeover,
    )?;
    if a.first().map(String::as_str) == Some("tui") {
        use std::io::{BufRead, Write};
        println!("Somnia Vibe Space alpha terminal. Enter each command as a JSON array (quotes preserve paths/goals). Type quit to close. One owner; no daemon or autostart.");
        loop {
            print!("vibe> ");
            std::io::stdout().flush()?;
            let mut line = String::new();
            if tokio::task::block_in_place(|| std::io::stdin().lock().read_line(&mut line))? == 0
                || line.trim() == "quit"
            {
                // Revoke/cancel before exiting an explicitly owned interactive session.
                for s in rt.list_snapshots()? {
                    if s.snapshot.capabilities.stop {
                        let _ = rt.stop(&s.snapshot.run_id).await;
                    }
                }
                for _ in 0..100 {
                    if rt
                        .list_snapshots()?
                        .iter()
                        .all(|s| !s.snapshot.capabilities.stop)
                    {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
                break;
            }
            match serde_json::from_str::<Vec<String>>(&line) {
                Ok(mut args) => {
                    if args.first().map(String::as_str) == Some("start") && args.len() == 3 {
                        args.push("--attached".into());
                    }
                    if let Err(e) = command(&rt, &args).await {
                        eprintln!("{e}")
                    }
                }
                Err(_) => eprintln!("Expected JSON command array"),
            }
        }
        Ok(())
    } else if a.first().map(String::as_str) == Some("daemon") {
        Err("Headless daemon is not implemented in this alpha; use explicit tui or foreground start. Nothing was spawned.".into())
    } else {
        if a.iter().any(|arg| arg == "--attached") {
            return Err("Attached runs require the persistent tui owner".into());
        }
        command(&rt, &a).await
    }
}
