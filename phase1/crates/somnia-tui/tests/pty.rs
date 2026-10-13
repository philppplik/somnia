//! Raw-mode end to end in a real pseudo-terminal (python3 pty): somnia-tui over the real `somnia run --tui-stdio`.
//! Skipped (with a note) when python3, node or git is missing or the CLI crate cannot be built offline.
use std::path::{Path, PathBuf};
use std::process::Command;

fn have(bin: &str) -> bool { Command::new(bin).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) }

#[test]
fn pty_answer_then_approve_over_real_core() {
    if !(have("python3") && have("node") && have("git")) { eprintln!("skip: python3/node/git missing"); return; }
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cli = root.join("../../cli");
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let target = std::env::temp_dir().join(format!("somnia-cli-target-{}", std::process::id()));
    let b = Command::new(&cargo).args(["build", "--quiet", "--manifest-path"]).arg(cli.join("Cargo.toml")).env("CARGO_TARGET_DIR", &target).output().unwrap();
    if !b.status.success() { eprintln!("skip: cli build failed: {}", String::from_utf8_lossy(&b.stderr)); return; }
    let somnia: PathBuf = target.join("debug/somnia");
    let repo = tempfile::tempdir_in(std::env::temp_dir()).unwrap();
    let rt = tempfile::tempdir().unwrap();
    std::fs::set_permissions(rt.path(), std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
    let git = |a: &[&str]| assert!(Command::new("git").current_dir(repo.path()).args(a).env("GIT_CONFIG_GLOBAL", "/dev/null").status().unwrap().success());
    git(&["init", "-q", "-b", "main"]);
    std::fs::write(repo.path().join("a.txt"), "hi\n").unwrap();
    git(&["add", "-A"]);
    git(&["-c", "user.name=S", "-c", "user.email=s@example.com", "commit", "-q", "-m", "seed"]);
    let o = Command::new("python3")
        .arg(root.join("scripts/pty_e2e.py"))
        .arg(env!("CARGO_BIN_EXE_somnia-tui")).arg(&somnia)
        .arg(cli.join("tests/fixtures/fake-engine.mjs")).arg(repo.path()).arg(rt.path())
        .output().unwrap();
    let _ = std::fs::remove_dir_all(&target);
    assert!(o.status.success(), "pty e2e failed:\n{}\n{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
}
