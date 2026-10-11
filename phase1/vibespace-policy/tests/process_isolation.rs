//! Windows spawn tests for the AppContainer PoC (Welle-B A4 follow-up). These compile on
//! every target but RUN only on Windows. Capability contract (same as the linux bwrap
//! tests): the launcher probe in `check` performs one minimal real sandboxed spawn; hosts
//! that cannot spawn AppContainer processes (some CI runners) skip with a visible reason
//! instead of failing. On capable hosts every assertion below runs unchanged. Fail-closed
//! contract: a host without the capability keeps the Windows shell gate closed.
#![cfg(windows)]

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
