//! Windows spawn tests for the AppContainer PoC (Welle-B A4 follow-up). These compile on
//! every target but RUN only on Windows. Capability contract (same as the linux bwrap
//! tests): the launcher probe in `check` performs one minimal real sandboxed spawn; hosts
//! that cannot spawn AppContainer processes (some CI runners) skip with a visible reason
//! instead of failing. On capable hosts every assertion below runs unchanged. Fail-closed
//! contract: a host without the capability keeps the Windows shell gate closed.
#![cfg(windows)]

use std::io::Read;
use vibespace_policy::proc::{windows::AppContainerLauncher, ExecSpec, ProcessLauncher, ProcessLimits};

fn limits() -> ProcessLimits {
    ProcessLimits {
        timeout: std::time::Duration::from_secs(30),
        max_output_bytes: 64 * 1024,
    }
}

fn spec(program: &str, args: &[&str]) -> ExecSpec {
    ExecSpec {
        program: program.to_string(),
        args: args.iter().map(|a| a.to_string()).collect(),
        cwd: None,
    }
}

/// Capability detection: None (with the reason logged) when this host cannot actually
/// run AppContainer spawns. Never weakens an assertion - it selects whether they run.
fn launcher_or_skip() -> Option<AppContainerLauncher> {
    let launcher = AppContainerLauncher::detect().expect("AppContainer APIs must link on Windows");
    match launcher.check() {
        Ok(()) => Some(launcher),
        Err(e) => {
            eprintln!("SKIP: AppContainer spawn not usable on this host: {e}");
            None
        }
    }
}

#[test]
fn appcontainer_spawns_cmd_and_captures_output() {
    let Some(launcher) = launcher_or_skip() else { return };
    let r = launcher
        .run(&spec("cmd.exe", &["/c", "echo", "vibespace-appcontainer-ok"]), &limits())
        .expect("sandboxed spawn must succeed on capable hosts");
    assert_eq!(r.exit_code, Some(0), "stderr: {}", r.stderr);
    assert!(
        r.stdout.contains("vibespace-appcontainer-ok"),
        "expected captured stdout, got: {}",
        r.stdout
    );
}

#[test]
fn appcontainer_propagates_exit_code() {
    let Some(launcher) = launcher_or_skip() else { return };
    let r = launcher.run(&spec("cmd.exe", &["/c", "exit", "7"]), &limits()).unwrap();
    assert_eq!(r.exit_code, Some(7));
}

#[test]
fn appcontainer_unknown_program_fails_visibly() {
    let Some(launcher) = launcher_or_skip() else { return };
    let err = launcher
        .run(&spec("somnia-not-a-real-binary-9f3b2c.exe", &[]), &limits())
        .expect_err("missing program must fail, not fall back");
    // Any fixed error class is fine; the contract is a visible failure, never a silent
    // unsandboxed spawn.
    let _ = err.class();
}

#[test]
fn appcontainer_invalid_profile_fails_closed() {
    // An over-long profile name is rejected by DeriveAppContainerSidFromAppContainerName;
    // the launcher must surface an error instead of falling back to an unsandboxed spawn.
    // This path fails before any spawn, so it needs no host capability.
    let launcher = AppContainerLauncher::with_profile(&"x".repeat(300));
    launcher
        .run(&spec("cmd.exe", &["/c", "exit", "0"]), &limits())
        .expect_err("invalid profile must fail closed");
}

// ---------- Interactive sessions (ACP stdio agents) ----------

/// Session capability probe: one minimal real session spawn (same path as the tests).
/// Hosts that cannot run killable piped AppContainer sessions skip with a visible reason;
/// capable hosts run every assertion below unchanged.
fn session_or_skip(launcher: &AppContainerLauncher) -> Option<Box<dyn vibespace_policy::SessionProcess>> {
    match launcher.spawn_session(&spec("cmd.exe", &["/c", "exit", "0"])) {
        Ok(mut s) => {
            s.kill_tree().expect("probe kill must succeed");
            Some(s)
        }
        Err(e) => {
            eprintln!("SKIP: AppContainer session spawn not usable on this host: {e}");
            None
        }
    }
}

/// Read a session pipe to EOF with a hard timeout (a stuck reader must fail, never hang).
fn read_with_timeout(mut r: Box<dyn std::io::Read + Send>, secs: u64) -> String {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = r.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    let buf = rx
        .recv_timeout(std::time::Duration::from_secs(secs))
        .expect("session pipe read timed out");
    String::from_utf8_lossy(&buf).into_owned()
}

#[test]
fn appcontainer_session_echo_captured() {
    let Some(launcher) = launcher_or_skip() else { return };
    let Some(_probe) = session_or_skip(&launcher) else { return };
    let mut s = launcher
        .spawn_session(&spec("cmd.exe", &["/c", "echo", "vibespace-acp-session-ok"]))
        .expect("session spawn must succeed on capable hosts");
    let mut io = s.io().expect("stdio must be handed out once");
    let stdout = read_with_timeout(io.stdout, 20);
    assert!(
        stdout.contains("vibespace-acp-session-ok"),
        "session stdout must be captured, got: {stdout}"
    );
    let _ = io.stdin; // untouched: the child needed no input
    let status = s.try_wait().expect("try_wait must work");
    assert_eq!(status, Some(Some(0)), "echo child must exit 0, got {status:?}");
    s.kill_tree().unwrap();
}

#[test]
fn appcontainer_session_stdin_roundtrip() {
    let Some(launcher) = launcher_or_skip() else { return };
    let Some(_probe) = session_or_skip(&launcher) else { return };
    let mut s = launcher
        .spawn_session(&spec("cmd.exe", &["/c", "more"]))
        .expect("session spawn must succeed on capable hosts");
    let mut io = s.io().unwrap();
    use std::io::Write;
    io.stdin
        .write_all(b"vibespace-acp-stdin\r\n")
        .expect("session stdin must accept input");
    drop(io.stdin); // EOF: more flushes and exits
    let stdout = read_with_timeout(io.stdout, 20);
    assert!(
        stdout.contains("vibespace-acp-stdin"),
        "session stdin must reach the child, got: {stdout}"
    );
    s.kill_tree().unwrap();
}

#[test]
fn appcontainer_session_kill_tree_stops_child() {
    let Some(launcher) = launcher_or_skip() else { return };
    let Some(_probe) = session_or_skip(&launcher) else { return };
    let mut s = launcher
        .spawn_session(&spec("cmd.exe", &["/c", "more"]))
        .expect("session spawn must succeed on capable hosts");
    let _io = s.io().unwrap(); // stdin stays open: the child keeps running
    assert_eq!(s.try_wait().unwrap(), None, "child must still be running");
    s.kill_tree().expect("kill_tree must succeed");
    assert!(
        s.try_wait().unwrap().is_some(),
        "after kill_tree the child must be gone"
    );
}

#[test]
fn appcontainer_session_missing_program_fails_visibly() {
    let Some(launcher) = launcher_or_skip() else { return };
    let Some(_probe) = session_or_skip(&launcher) else { return };
    assert!(
        launcher
            .spawn_session(&spec("somnia-not-a-real-binary-9f3b2c.exe", &[]))
            .is_err(),
        "missing program must fail, never fall back unsandboxed"
    );
}
