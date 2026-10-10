//! System-git orchestration. Subcommand allowlist: this layer can never fetch/pull/push (slice 1 has no network git).
use crate::error::{CliError, ErrorKind, Result};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const ALLOWED: &[&str] = &[
    "rev-parse", "status", "switch", "update-ref", "add", "commit", "config", "diff", "check-ref-format", "show-ref", "symbolic-ref", "reset",
];

pub fn git(root: &Path, args: &[&str], stdin: Option<&str>) -> Result<String> {
    let sub = args.first().copied().unwrap_or("");
    if !ALLOWED.contains(&sub) {
        return Err(CliError::new(ErrorKind::Internal, format!("git subcommand not allowed in headless core: {sub}")));
    }
    let mut cmd = Command::new("git");
    cmd.current_dir(root)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() });
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            CliError::new(ErrorKind::GitMissing, "git executable not found on PATH")
        } else {
            e.into()
        }
    })?;
    if let Some(s) = stdin {
        child.stdin.take().unwrap().write_all(s.as_bytes())?;
    }
    let out = child.wait_with_output()?;
    if !out.status.success() {
        return Err(CliError::new(ErrorKind::Internal, format!("git {sub} failed: {}", String::from_utf8_lossy(&out.stderr).trim())));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
}

pub fn git_available() -> Result<()> {
    Command::new("git").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().map(|_| ()).map_err(|_| CliError::new(ErrorKind::GitMissing, "git executable not found on PATH"))
}

pub fn repo_root(start: &Path) -> Result<std::path::PathBuf> {
    git_available()?;
    let out = Command::new("git").current_dir(start).args(["rev-parse", "--show-toplevel"]).output()?;
    if !out.status.success() {
        return Err(CliError::new(ErrorKind::BadRequest, "not inside a git repository"));
    }
    Ok(std::path::PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()).canonicalize()?)
}

pub fn head_sha(root: &Path) -> Result<String> {
    git(root, &["rev-parse", "HEAD"], None).map_err(|_| CliError::new(ErrorKind::BadRequest, "repository has no commits yet"))
}

/// Tracked or untracked changes visible to git (`.somnia/` is excluded locally, see `ensure_private_store`).
pub fn dirty_paths(root: &Path) -> Result<Vec<String>> {
    let out = git(root, &["status", "--porcelain=v1", "-uall"], None)?;
    Ok(out.lines().map(|l| l.get(3..).unwrap_or(l).to_string()).filter(|l| !l.is_empty()).collect())
}

/// Session records are private by default (owner decision D6): exclude locally, never touch tracked files.
pub fn ensure_private_store(root: &Path) -> Result<()> {
    let git_dir = git(root, &["rev-parse", "--git-dir"], None)?;
    let gd = if Path::new(&git_dir).is_absolute() { Path::new(&git_dir).to_path_buf() } else { root.join(git_dir) };
    let info = gd.join("info");
    std::fs::create_dir_all(&info)?;
    let ex = info.join("exclude");
    let cur = std::fs::read_to_string(&ex).unwrap_or_default();
    if !cur.lines().any(|l| l.trim() == "/.somnia/") {
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&ex)?;
        if !cur.is_empty() && !cur.ends_with('\n') {
            writeln!(f)?;
        }
        writeln!(f, "/.somnia/")?;
    }
    Ok(())
}

pub fn identity_configured(root: &Path) -> Result<()> {
    for k in ["user.name", "user.email"] {
        let v = git(root, &["config", "--get", k], None).unwrap_or_default();
        if v.trim().is_empty() {
            return Err(CliError::new(ErrorKind::IdentityMissing, format!("git {k} is not configured; Somnia never writes git identity")));
        }
    }
    Ok(())
}
