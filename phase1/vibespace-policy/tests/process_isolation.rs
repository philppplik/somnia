//! Windows spawn tests for the AppContainer PoC (Welle-B A4 follow-up). These compile on
//! every target but RUN only on Windows CI: they are the proof required before the
//! sandboxed shell gate opens on Windows. Fail-closed contract: any error here keeps the
//! Windows product surface shell-disabled.
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

#[test]
fn appcontainer_spawns_cmd_and_captures_output() {
    let launcher = AppContainerLauncher::detect().expect("AppContainer must be available on Windows CI");
    launcher.check().expect("check must pass");
    let r = launcher
        .run(&spec("cmd.exe", &["/c", "echo", "vibespace-appcontainer-ok"]), &limits())
        .expect("sandboxed spawn must succeed");
    assert_eq!(r.exit_code, Some(0), "stderr: {}", r.stderr);
    assert!(
        r.stdout.contains("vibespace-appcontainer-ok"),
        "expected captured stdout, got: {}",
        r.stdout
    );
}

#[test]
fn appcontainer_propagates_exit_code() {
    let launcher = AppContainerLauncher::detect().unwrap();
    let r = launcher.run(&spec("cmd.exe", &["/c", "exit", "7"]), &limits()).unwrap();
    assert_eq!(r.exit_code, Some(7));
}

#[test]
fn appcontainer_unknown_program_fails_visibly() {
    let launcher = AppContainerLauncher::detect().unwrap();
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
    let launcher = AppContainerLauncher::with_profile(&"x".repeat(300));
    launcher
        .run(&spec("cmd.exe", &["/c", "exit", "0"]), &limits())
        .expect_err("invalid profile must fail closed");
}
