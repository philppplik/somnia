//! Local Git backend over the system `git` binary. Contract: docs/git/CONTRACT.md.
//!
//! - argv array only, never a shell; environment cleared and rebuilt from a
//!   whitelist plus GIT_TERMINAL_PROMPT=0 and LC_ALL=C.
//! - Reads run with GIT_OPTIONAL_LOCKS=0 and never trigger hooks.
//! - No --no-verify, no identity/signing -c overrides, no network commands.
//! - 30 s timeout per call (60 s for log), retained output capped.
//! - Restore never deletes without a safety commit on refs/somnia/safety/*.
//!
//! Pure logic only: no Tauri imports, so `cargo test --no-default-features`
//! exercises everything against real temporary repositories.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::io::Read;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub mod variants;
pub mod worktrees;

const READ_TIMEOUT: Duration = Duration::from_secs(30);
const LOG_TIMEOUT: Duration = Duration::from_secs(60);
/// Retained child stdout per call. Diff sides are cut to their own caps below.
const MAX_STDOUT: usize = 16 * 1024 * 1024;
const MAX_STDERR_DETAIL: usize = 2000;
/// Per-side cap for diff before/after (contract: 1 MiB each).
const MAX_DIFF_SIDE: usize = 1024 * 1024;
/// Unified diff text cap; beyond it the field is omitted and tooLarge is set.
const MAX_UNIFIED: usize = 2 * 1024 * 1024;
const MAX_CHANGES: usize = 5000;
const MAX_LOG_LIMIT: u32 = 200;
const MAX_SUBJECT: usize = 200;
const MAX_BODY: usize = 8000;
/// Well-known empty tree object, HEAD substitute for unborn branches.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitErrorCode {
    GitMissing,
    NotARepo,
    Blocked,
    StateChanged,
    NothingToCommit,
    HookFailed,
    SigningFailed,
    IdentityMissing,
    PathRejected,
    Timeout,
    Cancelled,
    TooLarge,
    Io,
    Unknown,
}

/// Serialized as the command error string (contract: "GitError JSON strings").
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitError {
    pub code: GitErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl GitError {
    pub(crate) fn new(code: GitErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }
    pub(crate) fn detail(code: GitErrorCode, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: Some(detail.into()) }
    }
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            "{\"code\":\"unknown\",\"message\":\"git error encoding failed\"}".into()
        })
    }
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for GitError {}

type GResult<T> = Result<T, GitError>;

// ---------------------------------------------------------------- types (mirror src/lib/git/types.ts)

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitBlockReason {
    IndexLock,
    MergeInProgress,
    RebaseInProgress,
    CherryPickInProgress,
    InvalidRepo,
    UntrustedRepo,
    UnsupportedWorktree,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub root: String,
    /// Canonical split-directory identity, private to local hosts.
    pub repo_id: String,
    pub worktree_id: String,
    pub git_dir: String,
    pub common_dir: String,
    pub project_prefix: String,
    pub branch: Option<String>,
    pub detached: bool,
    pub unborn: bool,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub has_lfs: bool,
    pub has_submodules: bool,
    /// CONTRACT-A addendum: detection only, never a support claim.
    pub shallow: bool,
    pub sparse_checkout: bool,
    pub git_version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GitRepoState {
    NoGit,
    NoRepo { root: String },
    Ready { repo: GitRepoInfo },
    Blocked { reason: GitBlockReason, repo: Option<GitRepoInfo> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
    Untracked,
    Conflicted,
    Ignored,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub kind: GitChangeKind,
    pub staged: bool,
    pub unstaged: bool,
    pub binary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggest_skip: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub repo: GitRepoInfo,
    pub changes: Vec<GitChange>,
    pub state_token: String,
    pub truncated: bool,
    /// CONTRACT-A addendum: staged changes outside the project subtree. Never committed.
    pub staged_outside_prefix: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffBase {
    Head,
    Index,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffTarget {
    Index,
    Worktree,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    pub binary: bool,
    #[serde(rename = "base")]
    pub base: DiffBase,
    pub target: DiffTarget,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unified: Option<String>,
    pub too_large: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCommitRequest {
    pub paths: Vec<String>,
    pub subject: String,
    #[serde(default)]
    pub body: Option<String>,
    pub state_token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitVersion {
    pub sha: String,
    pub subject: String,
    pub body: String,
    pub author_name: String,
    pub time: i64,
    pub parents: Vec<String>,
    pub changed_files: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitLogRequest {
    pub limit: u32,
    #[serde(default)]
    pub before: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRestoreRequest {
    pub sha: String,
    pub state_token: String,
    #[serde(default)]
    pub paths: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRestoreResult {
    pub safety_copy: Option<GitVersion>,
    pub new_version: GitVersion,
}

// ---------------------------------------------------------------- trust store (app config, not the repo)

#[derive(Clone, Debug, Default)]
pub struct TrustStore {
    path: PathBuf,
    roots: BTreeSet<String>,
}

#[derive(Deserialize)]
struct TrustFile {
    #[serde(rename = "trustedRoots")]
    trusted_roots: Vec<String>,
}

impl TrustStore {
    pub fn load(path: &Path) -> GResult<Self> {
        if !path.exists() {
            return Ok(Self { path: path.to_path_buf(), roots: BTreeSet::new() });
        }
        let bytes = std::fs::read(path)
            .map_err(|_| GitError::new(GitErrorCode::Io, "Could not read the trusted-repo list"))?;
        if bytes.len() > 200_000 {
            return Err(GitError::new(GitErrorCode::Io, "Trusted-repo list is too large"));
        }
        let parsed: TrustFile = serde_json::from_slice(&bytes)
            .map_err(|_| GitError::new(GitErrorCode::Io, "Trusted-repo list is corrupt"))?;
        let roots: BTreeSet<String> =
            parsed.trusted_roots.into_iter().filter(|r| r.len() <= 4096).take(1000).collect();
        Ok(Self { path: path.to_path_buf(), roots })
    }
    pub fn is_trusted(&self, repo_root: &str) -> bool {
        self.roots.contains(repo_root)
    }
    pub fn trust(&mut self, repo_root: &str) {
        self.roots.insert(repo_root.to_string());
    }
    pub fn save(&self) -> GResult<()> {
        #[derive(Serialize)]
        struct Out<'a> {
            #[serde(rename = "trustedRoots")]
            trusted_roots: &'a BTreeSet<String>,
        }
        let json = serde_json::to_vec(&Out { trusted_roots: &self.roots })
            .map_err(|_| GitError::new(GitErrorCode::Io, "Could not encode the trusted-repo list"))?;
        let dir = self
            .path
            .parent()
            .ok_or_else(|| GitError::new(GitErrorCode::Io, "Invalid app config path"))?;
        std::fs::create_dir_all(dir)
            .map_err(|_| GitError::new(GitErrorCode::Io, "Could not create the app config directory"))?;
        let tmp = self.path.with_extension("tmp");
        {
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create(true).truncate(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut f = options
                .open(&tmp)
                .map_err(|_| GitError::new(GitErrorCode::Io, "Could not write the trusted-repo list"))?;
            f.write_all(&json)
                .and_then(|_| f.sync_all())
                .map_err(|_| GitError::new(GitErrorCode::Io, "Could not write the trusted-repo list"))?;
        }
        #[cfg(windows)]
        if self.path.exists() {
            std::fs::remove_file(&self.path)
                .map_err(|_| GitError::new(GitErrorCode::Io, "Could not replace the trusted-repo list"))?;
        }
        std::fs::rename(&tmp, &self.path)
            .map_err(|_| GitError::new(GitErrorCode::Io, "Could not replace the trusted-repo list"))?;
        Ok(())
    }
}

// ---------------------------------------------------------------- path validation

/// Project-relative API paths: forward slashes, no absolute, no `..`, no NUL,
/// no backslash/drive letters, no Windows-reserved names. Reuses the file service rules.
pub fn validate_api_path(path: &str) -> GResult<PathBuf> {
    crate::service::validate_path(path)
        .map_err(|_| GitError::detail(GitErrorCode::PathRejected, "Path rejected", path))
}

fn to_repo_relative(prefix: &str, project_path: &str) -> String {
    if prefix.is_empty() {
        project_path.to_string()
    } else {
        format!("{prefix}/{project_path}")
    }
}

fn strip_prefix<'a>(prefix: &str, repo_path: &'a str) -> Option<&'a str> {
    if prefix.is_empty() {
        Some(repo_path)
    } else {
        repo_path.strip_prefix(prefix).and_then(|rest| rest.strip_prefix('/'))
    }
}

// ---------------------------------------------------------------- process runner

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Read,
    Write,
}

struct GitOutput {
    code: Option<i32>,
    stdout: Vec<u8>,
    stderr: String,
    /// True when retained stdout hit MAX_STDOUT (rest drained and dropped).
    capped: bool,
}

fn sanitize_stderr(bytes: &[u8]) -> String {
    let lossy = String::from_utf8_lossy(bytes);
    let flat: String = lossy.chars().filter(|c| *c != '\r').take(MAX_STDERR_DETAIL).collect();
    flat.trim().to_string()
}

fn whitelist_env(cmd: &mut Command) {
    cmd.env_clear();
    const PASS: &[&str] = &[
        "PATH",
        "HOME",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "SystemRoot",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
    ];
    for key in PASS {
        if let Some(v) = std::env::var_os(key) {
            cmd.env(key, v);
        }
    }
    cmd.env("LC_ALL", "C");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
}

/// Runs git with an argv array. Never a shell. Timeout kills the child.
/// `stdin_bytes` feeds the child stdin (commit messages, pathspec files).
fn run_git(
    cwd: &Path,
    args: &[&OsStr],
    mode: Mode,
    timeout: Duration,
    stdin_bytes: Option<&[u8]>,
    extra_env: &[(&str, &OsStr)],
) -> GResult<GitOutput> {
    let mut cmd = Command::new("git");
    whitelist_env(&mut cmd);
    if mode == Mode::Read {
        cmd.env("GIT_OPTIONAL_LOCKS", "0");
    }
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    cmd.current_dir(cwd)
        .arg("-c")
        .arg("core.quotepath=false")
        .arg("-c")
        .arg("core.longpaths=true")
        .args(args)
        .stdin(if stdin_bytes.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            GitError::new(GitErrorCode::GitMissing, "The git executable was not found")
        } else {
            GitError::detail(GitErrorCode::Io, "Could not start git", e.to_string())
        }
    })?;
    if let Some(bytes) = stdin_bytes {
        if let Some(mut stdin) = child.stdin.take() {
            // A closed pipe (child exited early) is fine; the exit status decides.
            let _ = stdin.write_all(bytes);
        }
    }
    let mut out_handle = child.stdout.take();
    let mut err_handle = child.stderr.take();
    let out_thread = std::thread::spawn(move || -> (Vec<u8>, bool) {
        let mut retained = Vec::new();
        let mut capped = false;
        let mut buf = [0u8; 64 * 1024];
        if let Some(ref mut r) = out_handle {
            loop {
                match r.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if retained.len() < MAX_STDOUT {
                            let room = MAX_STDOUT - retained.len();
                            retained.extend_from_slice(&buf[..n.min(room)]);
                            if n > room {
                                capped = true;
                            }
                        } else {
                            capped = true;
                        }
                    }
                }
            }
        }
        (retained, capped)
    });
    let err_thread = std::thread::spawn(move || -> Vec<u8> {
        let mut retained = Vec::new();
        let mut buf = [0u8; 16 * 1024];
        if let Some(ref mut r) = err_handle {
            loop {
                match r.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if retained.len() < MAX_STDERR_DETAIL * 2 {
                            let room = MAX_STDERR_DETAIL * 2 - retained.len();
                            retained.extend_from_slice(&buf[..n.min(room)]);
                        }
                    }
                }
            }
        }
        retained
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = out_thread.join();
                    let _ = err_thread.join();
                    return Err(GitError::new(
                        GitErrorCode::Timeout,
                        "The git call took too long and was stopped",
                    ));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = out_thread.join();
                let _ = err_thread.join();
                return Err(GitError::detail(GitErrorCode::Io, "Could not wait for git", e.to_string()));
            }
        }
    };
    let (stdout, capped) = out_thread.join().unwrap_or_default();
    let stderr_raw = err_thread.join().unwrap_or_default();
    Ok(GitOutput { code: status.code(), stdout, stderr: sanitize_stderr(&stderr_raw), capped })
}

/// Read-mode call expecting exit code 0.
fn git_ok(cwd: &Path, args: &[&OsStr], timeout: Duration) -> GResult<GitOutput> {
    let out = run_git(cwd, args, Mode::Read, timeout, None, &[])?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "A git read failed", out.stderr));
    }
    Ok(out)
}

fn git_version() -> GResult<String> {
    let out = run_git(
        std::path::Path::new("."),
        &[OsStr::new("--version")],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(text.strip_prefix("git version ").unwrap_or(&text).to_string())
}

// ---------------------------------------------------------------- porcelain v2 parsing

#[derive(Clone, Debug)]
struct RawChange {
    repo_path: String,
    old_repo_path: Option<String>,
    x: char,
    y: char,
    untracked: bool,
    conflicted: bool,
    ignored: bool,
    head_hash: Option<String>,
    index_hash: Option<String>,
}

impl RawChange {
    fn staged(&self) -> bool {
        !self.untracked && self.x != '.'
    }
    fn unstaged(&self) -> bool {
        self.untracked || self.y != '.'
    }
    fn kind(&self) -> GitChangeKind {
        if self.conflicted {
            return GitChangeKind::Conflicted;
        }
        if self.untracked {
            return GitChangeKind::Untracked;
        }
        if self.ignored {
            return GitChangeKind::Ignored;
        }
        let letter = if self.staged() { self.x } else { self.y };
        match letter {
            'A' => GitChangeKind::Added,
            'M' => GitChangeKind::Modified,
            'D' => GitChangeKind::Deleted,
            'R' => GitChangeKind::Renamed,
            'C' => GitChangeKind::Copied,
            'T' => GitChangeKind::Typechange,
            'U' => GitChangeKind::Conflicted,
            _ => GitChangeKind::Modified,
        }
    }
}

#[derive(Default, Clone, Debug)]
struct BranchHeader {
    oid: Option<String>,
    head: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
}

fn text(rec: &[u8]) -> String {
    String::from_utf8_lossy(rec).into_owned()
}

/// Parses `git status --porcelain=v2 -z --branch` output.
/// In -z mode rename records are `<new path>\0<old path>\0` (verified against git 2.34).
fn parse_status_v2(bytes: &[u8]) -> (BranchHeader, Vec<RawChange>) {
    let mut header = BranchHeader::default();
    let mut changes = Vec::new();
    let records: Vec<&[u8]> = bytes.split(|b| *b == 0).collect();
    let mut i = 0;
    while i < records.len() {
        let rec = records[i];
        i += 1;
        if rec.is_empty() {
            continue;
        }
        if rec.starts_with(b"# ") {
            let line = text(&rec[2..]);
            if let Some(v) = line.strip_prefix("branch.oid ") {
                header.oid = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("branch.head ") {
                header.head = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("branch.upstream ") {
                header.upstream = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("branch.ab ") {
                for part in v.split_whitespace() {
                    if let Some(a) = part.strip_prefix('+') {
                        header.ahead = a.parse().unwrap_or(0);
                    } else if let Some(b) = part.strip_prefix('-') {
                        header.behind = b.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        let s = text(rec);
        if let Some(rest) = s.strip_prefix("1 ") {
            let f: Vec<&str> = rest.splitn(8, ' ').collect();
            if f.len() == 8 {
                let mut xy = f[0].chars();
                let (x, y) = (xy.next().unwrap_or('.'), xy.next().unwrap_or('.'));
                changes.push(RawChange {
                    repo_path: f[7].to_string(),
                    old_repo_path: None,
                    x,
                    y,
                    untracked: false,
                    conflicted: x == 'U' || y == 'U',
                    ignored: false,
                    head_hash: Some(f[5].to_string()),
                    index_hash: Some(f[6].to_string()),
                });
            }
        } else if let Some(rest) = s.strip_prefix("2 ") {
            let f: Vec<&str> = rest.splitn(9, ' ').collect();
            if f.len() == 9 {
                let mut xy = f[0].chars();
                let (x, y) = (xy.next().unwrap_or('.'), xy.next().unwrap_or('.'));
                let old = records.get(i).filter(|r| !r.is_empty()).map(|r| text(r));
                if old.is_some() {
                    i += 1;
                }
                changes.push(RawChange {
                    repo_path: f[8].to_string(),
                    old_repo_path: old,
                    x,
                    y,
                    untracked: false,
                    conflicted: false,
                    ignored: false,
                    head_hash: Some(f[5].to_string()),
                    index_hash: Some(f[6].to_string()),
                });
            }
        } else if let Some(rest) = s.strip_prefix("u ") {
            let f: Vec<&str> = rest.splitn(10, ' ').collect();
            if f.len() == 10 {
                let mut xy = f[0].chars();
                let (x, y) = (xy.next().unwrap_or('.'), xy.next().unwrap_or('.'));
                changes.push(RawChange {
                    repo_path: f[9].to_string(),
                    old_repo_path: None,
                    x,
                    y,
                    untracked: false,
                    conflicted: true,
                    ignored: false,
                    head_hash: None,
                    index_hash: None,
                });
            }
        } else if let Some(path) = s.strip_prefix("? ") {
            changes.push(RawChange {
                repo_path: path.to_string(),
                old_repo_path: None,
                x: '.',
                y: '?',
                untracked: true,
                conflicted: false,
                ignored: false,
                head_hash: None,
                index_hash: None,
            });
        } else if let Some(path) = s.strip_prefix("! ") {
            changes.push(RawChange {
                repo_path: path.to_string(),
                old_repo_path: None,
                x: '.',
                y: '!',
                untracked: false,
                conflicted: false,
                ignored: true,
                head_hash: None,
                index_hash: None,
            });
        }
    }
    (header, changes)
}

// ---------------------------------------------------------------- detect

struct RepoProbe {
    root: PathBuf,
    prefix: String, // repo-relative, forward slashes, no trailing slash; "" at repo root
    git_dir: PathBuf,
    common_dir: PathBuf,
}

fn probe(project_root: &Path) -> GResult<RepoProbe> {
    let out = run_git(
        project_root,
        &[
            OsStr::new("rev-parse"),
            OsStr::new("--show-prefix"),
            OsStr::new("--absolute-git-dir"),
            OsStr::new("--git-common-dir"),
        ],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )?;
    if out.code != Some(0) {
        if out.stderr.contains("not a git repository") {
            return Err(GitError::new(GitErrorCode::NotARepo, "The project folder is not in a repository"));
        }
        return Err(GitError::detail(GitErrorCode::Blocked, "The repository cannot be read", "invalid-repo"));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut lines = stdout.split('\n');
    let prefix_raw = lines.next().unwrap_or("").trim_end_matches('\n').to_string();
    let git_dir = lines.next().unwrap_or("").trim().to_string();
    let common_dir = lines.next().unwrap_or("").trim().to_string();
    if git_dir.is_empty() || common_dir.is_empty() {
        return Err(GitError::detail(GitErrorCode::Blocked, "The repository cannot be read", "invalid-repo"));
    }
    let prefix = prefix_raw.trim_end_matches('/').to_string();
    // Repo root = project root with the prefix components stripped. The caller
    // passes a canonical project root, so this survives symlinked repo paths.
    let mut root = project_root.to_path_buf();
    for _ in prefix.split('/').filter(|s| !s.is_empty()) {
        if !root.pop() {
            return Err(GitError::detail(GitErrorCode::Blocked, "The repository cannot be read", "invalid-repo"));
        }
    }
    // --git-common-dir may be relative (".git" in a normal repo); --absolute-git-dir
    // never is. Absolutize against the cwd we spawned git in before comparing.
    let common_abs = {
        let c = PathBuf::from(&common_dir);
        if c.is_absolute() { c } else { project_root.join(c) }
    };
    let git_dir = PathBuf::from(git_dir).canonicalize()
        .map_err(|_| GitError::new(GitErrorCode::Io, "Could not resolve the Git directory"))?;
    let common_dir = common_abs.canonicalize()
        .map_err(|_| GitError::new(GitErrorCode::Io, "Could not resolve the common Git directory"))?;
    Ok(RepoProbe { root: canonical_project_root(&root), prefix, git_dir, common_dir })
}

fn same_dir(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn blocked_reason(probe: &RepoProbe) -> Option<GitBlockReason> {
    if probe.git_dir.join("index.lock").exists() {
        return Some(GitBlockReason::IndexLock);
    }
    if probe.git_dir.join("MERGE_HEAD").exists() {
        return Some(GitBlockReason::MergeInProgress);
    }
    if probe.git_dir.join("rebase-merge").exists() || probe.git_dir.join("rebase-apply").exists() {
        return Some(GitBlockReason::RebaseInProgress);
    }
    if probe.git_dir.join("CHERRY_PICK_HEAD").exists() {
        return Some(GitBlockReason::CherryPickInProgress);
    }
    None
}

fn gather_info(probe: &RepoProbe, git_version: &str) -> GResult<GitRepoInfo> {
    // Branch headers only; --untracked-files=no keeps this cheap on dirty trees.
    let out = git_ok(
        &probe.root,
        &[
            OsStr::new("status"),
            OsStr::new("--porcelain=v2"),
            OsStr::new("-z"),
            OsStr::new("--branch"),
            OsStr::new("--untracked-files=no"),
        ],
        READ_TIMEOUT,
    )?;
    let (header, _) = parse_status_v2(&out.stdout);
    let oid = header.oid.unwrap_or_default();
    let unborn = oid == "(initial)" || oid.is_empty();
    let head_name = header.head.unwrap_or_default();
    let detached = !unborn && head_name == "(detached)";
    let branch = if detached { None } else { Some(head_name).filter(|s| !s.is_empty()) };
    let head = if unborn { None } else { Some(oid) };
    let lfs_attributes = std::fs::read(probe.root.join(".gitattributes"))
        .map(|b| b.windows(10).any(|w| w == b"filter=lfs"))
        .unwrap_or(false);
    let lfs_config = run_git(
        &probe.root,
        &[OsStr::new("config"), OsStr::new("--local"), OsStr::new("--get"), OsStr::new("filter.lfs.process")],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )
    .map(|o| o.code == Some(0))
    .unwrap_or(false);
    let has_lfs = lfs_attributes || lfs_config;
    let sparse = run_git(
        &probe.root,
        &[OsStr::new("config"), OsStr::new("--bool"), OsStr::new("core.sparseCheckout")],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )
    .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "true")
    .unwrap_or(false);
    Ok(GitRepoInfo {
        root: probe.root.to_string_lossy().into_owned(),
        repo_id: worktrees::identity(&probe.common_dir),
        worktree_id: worktrees::identity(&probe.git_dir),
        git_dir: probe.git_dir.to_string_lossy().into_owned(),
        common_dir: probe.common_dir.to_string_lossy().into_owned(),
        project_prefix: probe.prefix.clone(),
        branch,
        detached,
        unborn,
        head,
        upstream: header.upstream,
        ahead: header.ahead,
        behind: header.behind,
        has_lfs,
        has_submodules: probe.root.join(".gitmodules").is_file(),
        shallow: probe.common_dir.join("shallow").exists(),
        sparse_checkout: sparse,
        git_version: git_version.to_string(),
    })
}

fn canonical_project_root(project_root: &Path) -> PathBuf {
    project_root.canonicalize().unwrap_or_else(|_| project_root.to_path_buf())
}

/// Contract command `git_detect`. Trust decides between `ready` and
/// `blocked/untrusted-repo`; reads work either way (they never run hooks).
pub fn detect(project_root: &Path, trust: Option<&TrustStore>) -> GitRepoState {
    detect_inner(project_root, trust).unwrap_or_else(|state| state)
}

fn detect_inner(project_root: &Path, trust: Option<&TrustStore>) -> Result<GitRepoState, GitRepoState> {
    let root = canonical_project_root(project_root);
    let version = match git_version() {
        Ok(v) => v,
        Err(_) => return Err(GitRepoState::NoGit),
    };
    let probe = match probe(&root) {
        Ok(p) => p,
        Err(e) if e.code == GitErrorCode::NotARepo => {
            return Err(GitRepoState::NoRepo { root: root.to_string_lossy().into_owned() })
        }
        Err(_) => return Err(GitRepoState::Blocked { reason: GitBlockReason::InvalidRepo, repo: None }),
    };
    if let Some(reason) = blocked_reason(&probe) {
        let repo = gather_info(&probe, &version).ok();
        return Err(GitRepoState::Blocked { reason, repo });
    }
    let info = match gather_info(&probe, &version) {
        Ok(i) => i,
        Err(_) => return Err(GitRepoState::Blocked { reason: GitBlockReason::InvalidRepo, repo: None }),
    };
    if let Some(store) = trust {
        if !store.is_trusted(&info.root) {
            return Err(GitRepoState::Blocked { reason: GitBlockReason::UntrustedRepo, repo: Some(info) });
        }
    }
    Ok(GitRepoState::Ready { repo: info })
}

fn block_reason_name(reason: &GitBlockReason) -> &'static str {
    match reason {
        GitBlockReason::IndexLock => "index-lock",
        GitBlockReason::MergeInProgress => "merge-in-progress",
        GitBlockReason::RebaseInProgress => "rebase-in-progress",
        GitBlockReason::CherryPickInProgress => "cherry-pick-in-progress",
        GitBlockReason::InvalidRepo => "invalid-repo",
        GitBlockReason::UntrustedRepo => "untrusted-repo",
        GitBlockReason::UnsupportedWorktree => "unsupported-worktree",
    }
}

/// Maps detect() to the info read/write commands need, or the matching GitError.
fn ready_info(project_root: &Path, trust: Option<&TrustStore>) -> GResult<GitRepoInfo> {
    match detect(project_root, trust) {
        GitRepoState::Ready { repo } => Ok(repo),
        GitRepoState::NoGit => Err(GitError::new(GitErrorCode::GitMissing, "The git executable was not found")),
        GitRepoState::NoRepo { .. } => {
            Err(GitError::new(GitErrorCode::NotARepo, "The project folder is not in a repository"))
        }
        GitRepoState::Blocked { reason, .. } => Err(GitError::detail(
            GitErrorCode::Blocked,
            "The repository state blocks this action",
            block_reason_name(&reason),
        )),
    }
}

// ---------------------------------------------------------------- status collection + state token

struct Collected {
    info: GitRepoInfo,
    changes: Vec<RawChange>, // inside the project prefix only, capped at MAX_CHANGES
    staged_outside: u32,
    truncated: bool,
}

fn collect(project_root: &Path, trust: Option<&TrustStore>) -> GResult<Collected> {
    let info = ready_info(project_root, trust)?;
    let root = PathBuf::from(&info.root);
    let out = git_ok(
        &root,
        &[
            OsStr::new("status"),
            OsStr::new("--porcelain=v2"),
            OsStr::new("-z"),
            OsStr::new("--branch"),
            OsStr::new("--untracked-files=all"),
        ],
        READ_TIMEOUT,
    )?;
    let (_, raw) = parse_status_v2(&out.stdout);
    let mut changes = Vec::new();
    let mut staged_outside = 0u32;
    let mut truncated = false;
    for change in raw {
        match strip_prefix(&info.project_prefix, &change.repo_path) {
            Some(_) => {
                if changes.len() >= MAX_CHANGES {
                    truncated = true;
                    break;
                }
                changes.push(change);
            }
            None => {
                if change.staged() {
                    staged_outside += 1;
                }
            }
        }
    }
    Ok(Collected { info, changes, staged_outside, truncated })
}

/// Hash of HEAD, the index tree and stat/hash of the listed changed files
/// (contract rule 6). Commit and restore recompute it; a mismatch means the
/// worktree moved under the user's review and the UI asks again.
fn compute_state_token(info: &GitRepoInfo, changes: &[RawChange]) -> String {
    let root = PathBuf::from(&info.root);
    let head = info.head.clone().unwrap_or_else(|| "unborn".to_string());
    // write-tree mirrors the index into a tree object; with unmerged entries it
    // fails, in which case the token pins the conflicted state instead.
    let tree = run_git(&root, &[OsStr::new("write-tree")], Mode::Write, READ_TIMEOUT, None, &[])
        .ok()
        .filter(|o| o.code == Some(0))
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unmerged-index".to_string());
    let mut h = Sha256::new();
    h.update(b"somnia-git-state-v2\n");
    h.update(info.root.as_bytes());
    h.update(b"\0");
    h.update(info.branch.as_deref().unwrap_or("detached").as_bytes());
    h.update(b"\0");
    h.update(head.as_bytes());
    h.update(b"\n");
    h.update(tree.as_bytes());
    h.update(b"\n");
    h.update(info.project_prefix.as_bytes());
    h.update(b"\n");
    for c in changes {
        h.update(c.repo_path.as_bytes());
        h.update(b"\t");
        if let Some(old) = &c.old_repo_path {
            h.update(old.as_bytes());
        }
        h.update(b"\t");
        h.update(format!("{}{}", c.x, c.y).as_bytes());
        h.update(b"\t");
        if let Some(hash) = &c.head_hash {
            h.update(hash.as_bytes());
        }
        h.update(b"\t");
        if let Some(hash) = &c.index_hash {
            h.update(hash.as_bytes());
        }
        h.update(b"\t");
        let stat = std::fs::symlink_metadata(root.join(&c.repo_path))
            .ok()
            .and_then(|m| {
                let modified = m.modified().ok()?;
                let since = modified.duration_since(UNIX_EPOCH).ok()?;
                Some(format!("{}:{}:{}", m.len(), since.as_secs(), since.subsec_nanos()))
            })
            .unwrap_or_else(|| "-".to_string());
        h.update(stat.as_bytes());
        let path = root.join(&c.repo_path);
        if let Ok(target) = std::fs::read_link(&path) {
            h.update(target.as_os_str().as_encoded_bytes());
        } else if let Ok(mut file) = std::fs::File::open(&path) {
            let mut buf = [0u8; 65536];
            loop {
                match file.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => h.update(&buf[..n]),
                    Err(_) => { h.update(b"unreadable"); break; }
                }
            }
        }
        h.update(b"\n");
    }
    format!("{:x}", h.finalize())
}

fn suggest_skip(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    matches!(name.as_str(), ".ds_store" | "thumbs.db" | "ehthumbs.db" | "desktop.ini")
}

fn sniff_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|b| *b == 0)
}

/// Parses `git diff --numstat -z` into repo-path -> binary.
fn parse_numstat_z(bytes: &[u8]) -> std::collections::HashMap<String, bool> {
    let mut map = std::collections::HashMap::new();
    let records: Vec<&[u8]> = bytes.split(|b| *b == 0).collect();
    let mut i = 0;
    while i < records.len() {
        let rec = records[i];
        i += 1;
        if rec.is_empty() {
            continue;
        }
        let s = text(rec);
        let f: Vec<&str> = s.splitn(3, '\t').collect();
        if f.len() != 3 {
            continue;
        }
        let binary = f[0] == "-" && f[1] == "-";
        if f[2].is_empty() {
            // Rename: preimage and postimage follow as separate NUL fields.
            if i + 1 < records.len() {
                let new_path = text(records[i + 1]);
                map.insert(new_path, binary);
                i += 2;
            }
        } else {
            map.insert(f[2].to_string(), binary);
        }
    }
    map
}

/// Contract command `git_status`.
pub fn status(project_root: &Path) -> GResult<GitStatus> {
    let collected = collect(project_root, None)?;
    let root = PathBuf::from(&collected.info.root);
    // Binary flags for tracked changes come from numstat against HEAD (empty
    // tree when unborn); untracked files are sniffed from disk.
    let base = collected.info.head.as_deref().unwrap_or(EMPTY_TREE);
    let numstat = run_git(
        &root,
        &[OsStr::new("diff"), OsStr::new("--numstat"), OsStr::new("-z"), OsStr::new(base)],
        Mode::Read,
        READ_TIMEOUT,
        None,
        &[],
    )
    .ok()
    .filter(|o| o.code == Some(0))
    .map(|o| parse_numstat_z(&o.stdout))
    .unwrap_or_default();
    let mut changes = Vec::with_capacity(collected.changes.len());
    for raw in &collected.changes {
        let project_path = strip_prefix(&collected.info.project_prefix, &raw.repo_path)
            .unwrap_or(&raw.repo_path)
            .to_string();
        let old_path = raw.old_repo_path.as_ref().map(|old| {
            strip_prefix(&collected.info.project_prefix, old).unwrap_or(old).to_string()
        });
        let disk = std::fs::symlink_metadata(root.join(&raw.repo_path)).ok();
        let binary = if raw.untracked {
            disk.as_ref()
                .filter(|m| m.is_file())
                .and_then(|_| std::fs::read(root.join(&raw.repo_path)).ok())
                .map(|b| sniff_binary(&b))
                .unwrap_or(false)
        } else {
            numstat.get(&raw.repo_path).copied().unwrap_or(false)
        };
        changes.push(GitChange {
            path: project_path,
            old_path,
            kind: raw.kind(),
            staged: raw.staged(),
            unstaged: raw.unstaged(),
            binary,
            size_bytes: disk.filter(|m| m.is_file()).map(|m| m.len()),
            suggest_skip: if suggest_skip(&raw.repo_path) { Some(true) } else { None },
        });
    }
    let state_token = compute_state_token(&collected.info, &collected.changes);
    Ok(GitStatus {
        repo: collected.info,
        changes,
        state_token,
        truncated: collected.truncated,
        staged_outside_prefix: collected.staged_outside,
    })
}

// ---------------------------------------------------------------- shared write helpers

enum Pathspec {
    Argv(Vec<std::ffi::OsString>),
    StdinFile(Vec<u8>),
}

/// Long selections go through --pathspec-from-file (NUL-separated) to stay
/// under argv limits; short ones stay plain argv.
fn pathspec(paths: &[String]) -> Pathspec {
    let total: usize = paths.iter().map(|p| p.len() + 1).sum();
    if paths.len() <= 200 && total < 60_000 {
        let mut v = vec![std::ffi::OsString::from("--")];
        v.extend(paths.iter().map(std::ffi::OsString::from));
        Pathspec::Argv(v)
    } else {
        let mut b = Vec::with_capacity(total);
        for p in paths {
            b.extend_from_slice(p.as_bytes());
            b.push(0);
        }
        Pathspec::StdinFile(b)
    }
}

fn push_pathspec(args: &mut Vec<std::ffi::OsString>, spec: &Pathspec) {
    match spec {
        Pathspec::Argv(v) => args.extend(v.iter().cloned()),
        Pathspec::StdinFile(_) => {
            args.push(std::ffi::OsString::from("--pathspec-from-file=-"));
            args.push(std::ffi::OsString::from("--pathspec-file-nul"));
        }
    }
}

fn pathspec_stdin(spec: &Pathspec) -> Option<&[u8]> {
    match spec {
        Pathspec::Argv(_) => None,
        Pathspec::StdinFile(b) => Some(b),
    }
}

fn git_write(cwd: &Path, args: &[&OsStr], stdin: Option<&[u8]>, extra_env: &[(&str, &OsStr)]) -> GResult<GitOutput> {
    let out = run_git(cwd, args, Mode::Write, READ_TIMEOUT, stdin, extra_env)?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "A git write failed", out.stderr));
    }
    Ok(out)
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

// ---------------------------------------------------------------- log / version helpers

fn parse_version(fields: &str) -> Option<(String, GitVersion)> {
    let f: Vec<&str> = fields.splitn(6, '\u{1f}').collect();
    if f.len() != 6 {
        return None;
    }
    let version = GitVersion {
        sha: f[0].to_string(),
        author_name: f[1].to_string(),
        time: f[2].trim().parse().unwrap_or(0),
        parents: f[3].split_whitespace().map(|s| s.to_string()).collect(),
        subject: f[4].to_string(),
        body: f[5].trim_end_matches('\n').to_string(),
        changed_files: 0,
    };
    Some((f[0].to_string(), version))
}

fn is_numstat_line(line: &str) -> bool {
    let mut parts = line.split('\t');
    let a = parts.next().unwrap_or("");
    let b = parts.next().unwrap_or("");
    let numeric = |s: &str| s == "-" || s.bytes().all(|c| c.is_ascii_digit());
    !a.is_empty() && numeric(a) && numeric(b) && parts.next().is_some()
}

fn version_record(root: &Path, rev: &str) -> GResult<GitVersion> {
    let meta = git_ok(
        root,
        &[OsStr::new("show"), OsStr::new("-s"), OsStr::new("--format=%H%x1f%an%x1f%at%x1f%P%x1f%s%x1f%b"), OsStr::new(rev)],
        READ_TIMEOUT,
    )?;
    let text = String::from_utf8_lossy(&meta.stdout);
    let (_, mut version) = parse_version(text.trim_end_matches('\n'))
        .ok_or_else(|| GitError::new(GitErrorCode::Unknown, "Could not read the new version"))?;
    let numstat = git_ok(
        root,
        &[OsStr::new("show"), OsStr::new("--numstat"), OsStr::new("--format="), OsStr::new(rev)],
        READ_TIMEOUT,
    )?;
    version.changed_files =
        String::from_utf8_lossy(&numstat.stdout).lines().filter(|l| is_numstat_line(l)).count() as u64;
    Ok(version)
}

fn rev_parse_commit(root: &Path, rev: &str) -> GResult<String> {
    let spec = format!("{rev}^{{commit}}");
    let out = run_git(root, &[OsStr::new("rev-parse"), OsStr::new("--verify"), OsStr::new(&spec)], Mode::Read, READ_TIMEOUT, None, &[])?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "Not a commit", rev));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Contract command `git_log`. Project-scoped; `before` paginates from the
/// first parent of that commit (empty result once the root is reached).
pub fn log(project_root: &Path, req: &GitLogRequest) -> GResult<Vec<GitVersion>> {
    let info = ready_info(project_root, None)?;
    let root = PathBuf::from(&info.root);
    if info.unborn {
        return Ok(Vec::new());
    }
    let limit = req.limit.clamp(1, MAX_LOG_LIMIT).to_string();
    let rev = match &req.before {
        None => "HEAD".to_string(),
        Some(before) => {
            let sha = rev_parse_commit(&root, before)?;
            let parent_spec = format!("{sha}^");
            let parent = run_git(&root, &[OsStr::new("rev-parse"), OsStr::new("--verify"), OsStr::new(&parent_spec)], Mode::Read, READ_TIMEOUT, None, &[])?;
            if parent.code != Some(0) {
                return Ok(Vec::new()); // `before` is the root commit
            }
            String::from_utf8_lossy(&parent.stdout).trim().to_string()
        }
    };
    let scope = if info.project_prefix.is_empty() { ".".to_string() } else { info.project_prefix.clone() };
    let meta = git_ok(
        &root,
        &[
            OsStr::new("log"),
            OsStr::new(&rev),
            OsStr::new("--max-count"),
            OsStr::new(&limit),
            OsStr::new("--format=%x1e%H%x1f%an%x1f%at%x1f%P%x1f%s%x1f%b"),
            OsStr::new("--"),
            OsStr::new(&scope),
        ],
        LOG_TIMEOUT,
    )?;
    let meta_text = String::from_utf8_lossy(&meta.stdout);
    let mut versions: Vec<GitVersion> = Vec::new();
    for seg in meta_text.split('\u{1e}').skip(1) {
        if let Some((_, v)) = parse_version(seg.trim_end_matches('\n')) {
            versions.push(v);
        }
    }
    if versions.is_empty() {
        return Ok(versions);
    }
    let counts = git_ok(
        &root,
        &[
            OsStr::new("log"),
            OsStr::new(&rev),
            OsStr::new("--max-count"),
            OsStr::new(&limit),
            OsStr::new("--format=%x1e%H"),
            OsStr::new("--numstat"),
            OsStr::new("--"),
            OsStr::new(&scope),
        ],
        LOG_TIMEOUT,
    )?;
    let counts_text = String::from_utf8_lossy(&counts.stdout);
    let mut by_sha: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for seg in counts_text.split('\u{1e}').skip(1) {
        let mut lines = seg.lines();
        let sha = lines.next().unwrap_or("").trim().to_string();
        if sha.is_empty() {
            continue;
        }
        by_sha.insert(sha, lines.filter(|l| is_numstat_line(l)).count() as u64);
    }
    for v in &mut versions {
        v.changed_files = by_sha.get(&v.sha).copied().unwrap_or(0);
    }
    Ok(versions)
}

// ---------------------------------------------------------------- diff

fn show_blob(root: &Path, spec: &str) -> Option<Vec<u8>> {
    let out = run_git(root, &[OsStr::new("show"), OsStr::new(spec)], Mode::Read, READ_TIMEOUT, None, &[]).ok()?;
    if out.code == Some(0) {
        // Capped at MAX_STDOUT by the runner; the caller cuts to MAX_DIFF_SIDE.
        Some(out.stdout)
    } else {
        None
    }
}

fn read_worktree(root: &Path, repo_path: &str) -> Option<Vec<u8>> {
    let file = std::fs::File::open(root.join(repo_path)).ok()?;
    let mut limited = file.take((MAX_STDOUT + 1) as u64);
    let mut buf = Vec::new();
    limited.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn cut_side(bytes: Vec<u8>) -> (String, bool) {
    let too_large = bytes.len() > MAX_DIFF_SIDE;
    let cut = if too_large { &bytes[..MAX_DIFF_SIDE] } else { &bytes[..] };
    (String::from_utf8_lossy(cut).into_owned(), too_large)
}

/// Contract command `git_diff_file`.
pub fn diff_file(project_root: &Path, path: &str, base: DiffBase, target: DiffTarget) -> GResult<GitFileDiff> {
    let info = ready_info(project_root, None)?;
    let rel = validate_api_path(path)?;
    let rel_str = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    let repo_path = to_repo_relative(&info.project_prefix, &rel_str);
    let root = PathBuf::from(&info.root);

    let head_spec = info.head.as_deref().unwrap_or(EMPTY_TREE);
    let before_bytes = match base {
        DiffBase::Head => {
            if info.unborn {
                None
            } else {
                show_blob(&root, &format!("{}:{}", info.head.as_deref().unwrap_or(""), repo_path))
            }
        }
        DiffBase::Index => show_blob(&root, &format!(":{repo_path}")),
    };
    let after_bytes = match target {
        DiffTarget::Index => show_blob(&root, &format!(":{repo_path}")),
        DiffTarget::Worktree => read_worktree(&root, &repo_path),
    };
    if before_bytes.is_none() && after_bytes.is_none() {
        return Err(GitError::detail(GitErrorCode::PathRejected, "No such file in either side", path));
    }
    let binary = before_bytes.as_deref().map(sniff_binary).unwrap_or(false)
        || after_bytes.as_deref().map(sniff_binary).unwrap_or(false);

    let mut too_large = false;
    let (before, after) = if binary {
        (None, None)
    } else {
        let b = before_bytes.map(|v| {
            let (s, t) = cut_side(v);
            too_large |= t;
            s
        });
        let a = after_bytes.map(|v| {
            let (s, t) = cut_side(v);
            too_large |= t;
            s
        });
        (b, a)
    };

    if base == DiffBase::Index && target == DiffTarget::Index {
        // Degenerate but representable pair: same side twice, never a diff.
        return Ok(GitFileDiff { path: rel_str, binary, base, target, before, after, unified: None, too_large });
    }
    let unified = if binary {
        None
    } else {
        let mut args: Vec<std::ffi::OsString> = vec!["diff".into()];
        match (base, target) {
            (DiffBase::Head, DiffTarget::Index) => {
                args.push("--cached".into());
                args.push(head_spec.into());
            }
            (DiffBase::Head, DiffTarget::Worktree) => args.push(head_spec.into()),
            (DiffBase::Index, DiffTarget::Worktree) => {}
            (DiffBase::Index, DiffTarget::Index) => {} // returned early above
        }
        args.push("--".into());
        args.push(repo_path.clone().into());
        let refs: Vec<&OsStr> = args.iter().map(|a| a.as_os_str()).collect();
        let out = run_git(&root, &refs, Mode::Read, READ_TIMEOUT, None, &[])?;
        let mut capped_out = out.capped;
        let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
        if out.code == Some(0) && text.is_empty() && after.is_some() && before.is_none() {
            // Untracked file: synthesize the add diff in-process. `git diff
            // --no-index` is avoided: it behaves differently per platform
            // (NUL vs /dev/null, absolute path handling on Windows).
            if let Some(body) = after.as_deref() {
                text = synthesize_add_diff(&rel_str, body);
            }
        }
        if text.len() > MAX_UNIFIED || capped_out {
            // A truncated patch is invalid; omit it and flag the size instead.
            too_large = true;
            None
        } else if text.is_empty() {
            None
        } else {
            Some(text)
        }
    };

    Ok(GitFileDiff { path: rel_str, binary, base, target, before, after, unified, too_large })
}

// ---------------------------------------------------------------- init

/// Unified diff for a brand-new file (all lines added), git format.
fn synthesize_add_diff(path: &str, body: &str) -> String {
    if body.is_empty() {
        return format!("diff --git a/{p} b/{p}\nnew file mode 100644\n", p = path);
    }
    let lines: Vec<&str> = body.split_inclusive('\n').collect();
    let mut out = format!(
        "diff --git a/{p} b/{p}\nnew file mode 100644\n--- /dev/null\n+++ b/{p}\n@@ -0,0 +1,{n} @@\n",
        p = path,
        n = lines.len()
    );
    for l in &lines {
        out.push('+');
        out.push_str(l.trim_end_matches('\n'));
        out.push('\n');
    }
    if !body.ends_with('\n') {
        out.push_str("\\ No newline at end of file\n");
    }
    out
}

/// Contract command `git_init`: creates a repo in the project folder with
/// default branch `main`, adds nothing, idempotent for existing repos.
pub fn init(project_root: &Path, trust: Option<&TrustStore>) -> GResult<GitRepoState> {
    match detect(project_root, trust) {
        GitRepoState::NoGit => {
            return Err(GitError::new(GitErrorCode::GitMissing, "The git executable was not found"))
        }
        GitRepoState::NoRepo { .. } => {}
        state => return Ok(state),
    }
    let root = canonical_project_root(project_root);
    git_write(&root, &[OsStr::new("init")], None, &[])?;
    // Explicit and version-independent: do not rely on init.defaultBranch.
    git_write(&root, &[OsStr::new("symbolic-ref"), OsStr::new("HEAD"), OsStr::new("refs/heads/main")], None, &[])?;
    Ok(detect(project_root, trust))
}

// ---------------------------------------------------------------- commit

fn hooks_dir_active(root: &Path) -> bool {
    let hooks = match probe(root) {
        Ok(p) => p.common_dir.join("hooks"),
        Err(_) => return false,
    };
    std::fs::read_dir(hooks)
        .map(|entries| {
            entries.flatten().any(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                !name.ends_with(".sample")
                    && matches!(name.as_str(), "pre-commit" | "commit-msg" | "prepare-commit-msg" | "post-commit")
            })
        })
        .unwrap_or(false)
}

fn map_commit_error(root: &Path, out: &GitOutput) -> GitError {
    let combined = format!("{}\n{}", out.stderr, String::from_utf8_lossy(&out.stdout)).to_lowercase();
    if combined.contains("please tell me who you are")
        || combined.contains("unable to auto-detect email")
        || combined.contains("empty ident")
    {
        return GitError::new(GitErrorCode::IdentityMissing, "Git identity (user.name/user.email) is not configured");
    }
    if combined.contains("gpg failed to sign")
        || combined.contains("signing failed")
        || (combined.contains("gpg") && combined.contains("sign"))
    {
        return GitError::detail(GitErrorCode::SigningFailed, "Git could not sign the commit", out.stderr.clone());
    }
    if combined.contains("nothing to commit") || combined.contains("no changes added to commit") {
        return GitError::new(GitErrorCode::NothingToCommit, "Nothing to commit");
    }
    if hooks_dir_active(root) {
        return GitError::detail(GitErrorCode::HookFailed, "A git hook declined the commit", out.stderr.clone());
    }
    GitError::detail(GitErrorCode::Unknown, "The commit failed", out.stderr.clone())
}

fn validate_message(subject: &str, body: Option<&str>) -> GResult<String> {
    let subject = subject.trim();
    if subject.is_empty()
        || subject.chars().count() > MAX_SUBJECT
        || subject.contains(['\r', '\n', '\0'])
    {
        return Err(GitError::new(GitErrorCode::Unknown, "Subject must be 1-200 characters on one line"));
    }
    if let Some(b) = body {
        if b.contains('\0') || b.len() > MAX_BODY {
            return Err(GitError::new(GitErrorCode::Unknown, "The message body is invalid"));
        }
    }
    Ok(match body {
        Some(b) if !b.trim().is_empty() => format!("{subject}\n\n{}", b.trim()),
        _ => subject.to_string(),
    })
}

/// Contract command `git_commit`: commits exactly the selected paths.
/// Anything already staged outside the selection stays staged (rule 5).
pub fn commit(project_root: &Path, req: &GitCommitRequest, trust: &TrustStore) -> GResult<GitVersion> {
    let _lock = worktrees::lock_repo(project_root)?;
    let message = validate_message(&req.subject, req.body.as_deref())?;
    if req.paths.is_empty() {
        return Err(GitError::new(GitErrorCode::NothingToCommit, "No paths selected"));
    }
    let mut rel_paths: Vec<String> = Vec::new();
    for p in &req.paths {
        let rel = validate_api_path(p)?;
        let rel_str = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if !rel_paths.contains(&rel_str) {
            rel_paths.push(rel_str);
        }
    }
    let collected = collect(project_root, Some(trust))?;
    let info = &collected.info;
    let token = compute_state_token(info, &collected.changes);
    if token != req.state_token {
        return Err(GitError::new(
            GitErrorCode::StateChanged,
            "The files changed since the review; please look again",
        ));
    }
    let changed: BTreeSet<&str> = collected.changes.iter().map(|c| c.repo_path.as_str()).collect();
    let touched: Vec<String> = rel_paths
        .iter()
        .map(|p| to_repo_relative(&info.project_prefix, p))
        .filter(|rp| changed.contains(rp.as_str()))
        .collect();
    if touched.is_empty() {
        return Err(GitError::new(GitErrorCode::NothingToCommit, "Nothing to commit"));
    }
    let root = PathBuf::from(&info.root);

    let spec = pathspec(&touched);
    let mut add_args: Vec<std::ffi::OsString> = vec!["add".into(), "-A".into()];
    push_pathspec(&mut add_args, &spec);
    let add_refs: Vec<&OsStr> = add_args.iter().map(|a| a.as_os_str()).collect();
    git_write(&root, &add_refs, pathspec_stdin(&spec), &[])?;

    let mut commit_args: Vec<std::ffi::OsString> = vec!["commit".into(), "-F".into(), "-".into()];
    push_pathspec(&mut commit_args, &spec);
    let commit_refs: Vec<&OsStr> = commit_args.iter().map(|a| a.as_os_str()).collect();
    let out = run_git(&root, &commit_refs, Mode::Write, READ_TIMEOUT, Some(message.as_bytes()), &[])?;
    if out.code != Some(0) {
        return Err(map_commit_error(&root, &out));
    }
    version_record(&root, "HEAD")
}

// ---------------------------------------------------------------- restore as new version

fn ls_tree(root: &Path, rev: &str, scope: &[String]) -> GResult<BTreeSet<String>> {
    let mut args: Vec<std::ffi::OsString> =
        vec!["ls-tree".into(), "-r".into(), "-z".into(), "--name-only".into(), rev.into()];
    let spec = pathspec(scope);
    push_pathspec(&mut args, &spec);
    let refs: Vec<&OsStr> = args.iter().map(|a| a.as_os_str()).collect();
    let out = run_git(root, &refs, Mode::Read, READ_TIMEOUT, pathspec_stdin(&spec), &[])?;
    if out.code != Some(0) {
        return Err(GitError::detail(GitErrorCode::Unknown, "Could not list the version's files", out.stderr));
    }
    Ok(out
        .stdout
        .split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .map(|r| String::from_utf8_lossy(r).into_owned())
        .collect())
}

/// Safety copy: one commit on refs/somnia/safety/<unix> from a scratch index.
/// Captures the project subtree including untracked, non-ignored files and
/// leaves the user's index and worktree untouched (contract rule 7).
fn safety_copy(root: &Path, info: &GitRepoInfo, scope: &[String]) -> GResult<(String, GitVersion)> {
    let stamp = unix_now();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    // pid + clock + process-wide counter: parallel callers (and macOS's microsecond clock) must never share a scratch index.
    static INDEX_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = INDEX_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp_index = std::env::temp_dir().join(format!("somnia-git-index-{}-{nanos}-{seq}", std::process::id()));
    let tmp_index_os = tmp_index.clone().into_os_string();
    let env: [(&str, &OsStr); 1] = [("GIT_INDEX_FILE", tmp_index_os.as_os_str())];
    let cleanup = |tmp: &Path| {
        let _ = std::fs::remove_file(tmp);
    };
    let mut rt_args: Vec<std::ffi::OsString> = vec!["read-tree".into()];
    if info.unborn {
        rt_args.push("--empty".into());
    } else {
        rt_args.push("HEAD".into());
    }
    let rt_refs: Vec<&OsStr> = rt_args.iter().map(|a| a.as_os_str()).collect();
    if let Err(e) = git_write(root, &rt_refs, None, &env) {
        cleanup(&tmp_index);
        return Err(e);
    }
    let spec = pathspec(scope);
    let mut add_args: Vec<std::ffi::OsString> = vec!["add".into(), "-A".into()];
    push_pathspec(&mut add_args, &spec);
    let add_refs: Vec<&OsStr> = add_args.iter().map(|a| a.as_os_str()).collect();
    if let Err(e) = git_write(root, &add_refs, pathspec_stdin(&spec), &env) {
        cleanup(&tmp_index);
        return Err(e);
    }
    let tree_out = git_write(root, &[OsStr::new("write-tree")], None, &env);
    cleanup(&tmp_index);
    let tree = String::from_utf8_lossy(&tree_out?.stdout).trim().to_string();
    let mut ct_args: Vec<std::ffi::OsString> = vec!["commit-tree".into(), tree.into()];
    if let Some(head) = &info.head {
        ct_args.push("-p".into());
        ct_args.push(head.clone().into());
    }
    let ct_refs: Vec<&OsStr> = ct_args.iter().map(|a| a.as_os_str()).collect();
    let message = format!("Somnia safety copy {}", stamp);
    let ct = run_git(root, &ct_refs, Mode::Write, READ_TIMEOUT, Some(message.as_bytes()), &[])?;
    if ct.code != Some(0) {
        let combined = format!("{}\n{}", ct.stderr, String::from_utf8_lossy(&ct.stdout)).to_lowercase();
        if combined.contains("unable to auto-detect email") || combined.contains("empty ident") {
            return Err(GitError::new(
                GitErrorCode::IdentityMissing,
                "Git identity (user.name/user.email) is not configured",
            ));
        }
        return Err(GitError::detail(GitErrorCode::Unknown, "Could not create the safety copy", ct.stderr));
    }
    let commit = String::from_utf8_lossy(&ct.stdout).trim().to_string();
    let refname = format!("refs/somnia/safety/{stamp}");
    git_write(
        root,
        &[OsStr::new("update-ref"), OsStr::new(&refname), OsStr::new(&commit)],
        None,
        &[],
    )?;
    let version = version_record(root, &commit)?;
    Ok((refname, version))
}

/// Contract command `git_restore_as_new_version`.
pub fn restore_as_new_version(
    project_root: &Path,
    req: &GitRestoreRequest,
    trust: &TrustStore,
) -> GResult<GitRestoreResult> {
    let _lock = worktrees::lock_repo(project_root)?;
    let collected = collect(project_root, Some(trust))?;
    let info = &collected.info;
    if info.unborn {
        return Err(GitError::new(GitErrorCode::Unknown, "The repository has no versions yet"));
    }
    let root = PathBuf::from(&info.root);
    let target = rev_parse_commit(&root, &req.sha)?;
    let token = compute_state_token(info, &collected.changes);
    if token != req.state_token {
        return Err(GitError::new(
            GitErrorCode::StateChanged,
            "The files changed since the review; please look again",
        ));
    }
    let scope: Vec<String> = match &req.paths {
        Some(paths) if !paths.is_empty() => {
            let mut out = Vec::new();
            for p in paths {
                let rel = validate_api_path(p)?;
                let rel_str = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                out.push(to_repo_relative(&info.project_prefix, &rel_str));
            }
            out
        }
        _ => vec![if info.project_prefix.is_empty() { ".".to_string() } else { info.project_prefix.clone() }],
    };

    // Nothing to do? Refuse before creating a safety copy.
    let mut diff_args: Vec<std::ffi::OsString> = vec!["diff".into(), "--quiet".into(), target.clone().into()];
    let scope_spec = pathspec(&scope);
    push_pathspec(&mut diff_args, &scope_spec);
    let diff_refs: Vec<&OsStr> = diff_args.iter().map(|a| a.as_os_str()).collect();
    let quiet = run_git(&root, &diff_refs, Mode::Read, READ_TIMEOUT, pathspec_stdin(&scope_spec), &[])?;
    if quiet.code == Some(0) {
        return Err(GitError::new(GitErrorCode::NothingToCommit, "The project already matches that version"));
    }

    let (refname, safety_version) = safety_copy(&root, info, &scope)?;
    // Everything after this point keeps the safety copy; failures report it.
    let finish = |result: GResult<GitRestoreResult>| -> GResult<GitRestoreResult> {
        result.map_err(|e| {
            let prefix = e.detail.map(|d| format!("{d}; ")).unwrap_or_default();
            GitError { detail: Some(format!("{prefix}safety copy kept at {refname}")), ..e }
        })
    };

    let inner = (|| -> GResult<GitRestoreResult> {
        let old_files = ls_tree(&root, &target, &scope)?;
        let head_files = ls_tree(&root, "HEAD", &scope)?;
        let deletions: Vec<String> = head_files.difference(&old_files).cloned().collect();
        if !deletions.is_empty() {
            // -f is safe here: the safety copy above captured every byte first.
            let spec = pathspec(&deletions);
            let mut args: Vec<std::ffi::OsString> = vec!["rm".into(), "-q".into(), "-f".into()];
            push_pathspec(&mut args, &spec);
            let refs: Vec<&OsStr> = args.iter().map(|a| a.as_os_str()).collect();
            git_write(&root, &refs, pathspec_stdin(&spec), &[])?;
        }
        let mut co_args: Vec<std::ffi::OsString> = vec!["checkout".into(), target.clone().into()];
        push_pathspec(&mut co_args, &scope_spec);
        let co_refs: Vec<&OsStr> = co_args.iter().map(|a| a.as_os_str()).collect();
        git_write(&root, &co_refs, pathspec_stdin(&scope_spec), &[])?;

        // Commit exactly the restored set; unrelated worktree changes stay out.
        let touched: Vec<String> = old_files.union(&head_files).cloned().collect();
        let spec = pathspec(&touched);
        let subject = format!("Restored version {}", &target[..7.min(target.len())]);
        let message = format!("{subject}\n\nRestored from {target}\nSafety copy: {refname}");
        let mut commit_args: Vec<std::ffi::OsString> = vec!["commit".into(), "-F".into(), "-".into()];
        push_pathspec(&mut commit_args, &spec);
        let commit_refs: Vec<&OsStr> = commit_args.iter().map(|a| a.as_os_str()).collect();
        let out =
            run_git(&root, &commit_refs, Mode::Write, READ_TIMEOUT, Some(message.as_bytes()), &[])?;
        if out.code != Some(0) {
            return Err(map_commit_error(&root, &out));
        }
        let new_version = version_record(&root, "HEAD")?;
        Ok(GitRestoreResult { safety_copy: Some(safety_version), new_version })
    })();
    finish(inner)
}

/// CONTRACT-A addendum command `git_trust_repo`: the user confirmed once for
/// this repo root; stored in app config, never in the repo.
pub fn trust_repo(project_root: &Path, store: &mut TrustStore) -> GResult<GitRepoState> {
    let info = ready_info(project_root, None)?;
    store.trust(&info.root);
    store.save()?;
    Ok(detect(project_root, Some(store)))
}

// ---------------------------------------------------------------- parser unit tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_headers_and_ordinary_changes() {
        let input = b"# branch.oid abc123\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\01 .M N... 100644 100644 100644 h1111111 i2222222 src/a b.txt\0? new file.txt\0";
        let (header, changes) = parse_status_v2(input);
        assert_eq!(header.oid.as_deref(), Some("abc123"));
        assert_eq!(header.head.as_deref(), Some("main"));
        assert_eq!(header.upstream.as_deref(), Some("origin/main"));
        assert_eq!((header.ahead, header.behind), (2, 1));
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0].repo_path, "src/a b.txt");
        assert_eq!(changes[0].kind(), GitChangeKind::Modified);
        assert!(!changes[0].staged());
        assert!(changes[0].unstaged());
        assert_eq!(changes[1].kind(), GitChangeKind::Untracked);
    }

    #[test]
    fn parses_rename_new_then_old_path() {
        // -z order verified against git 2.34: <new path>\0<old path>\0.
        let input = b"2 R. N... 100644 100644 100644 h1111 i2222 R100 renamed.txt\0alpha.txt\0";
        let (_, changes) = parse_status_v2(input);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].repo_path, "renamed.txt");
        assert_eq!(changes[0].old_repo_path.as_deref(), Some("alpha.txt"));
        assert_eq!(changes[0].kind(), GitChangeKind::Renamed);
        assert!(changes[0].staged());
    }

    #[test]
    fn parses_unmerged_and_numstat() {
        let input = b"u UU N... 100644 100644 100644 100644 h1 h2 h3 conflicted.txt\0";
        let (_, changes) = parse_status_v2(input);
        assert_eq!(changes[0].kind(), GitChangeKind::Conflicted);

        let numstat = b"1\t2\tplain.txt\0-\t-\tbin.dat\0";
        let map = parse_numstat_z(numstat);
        assert_eq!(map.get("plain.txt"), Some(&false));
        assert_eq!(map.get("bin.dat"), Some(&true));
    }

    #[test]
    fn numstat_rename_counts_postimage() {
        let numstat = b"3\t1\t\0old name.txt\0new name.txt\0";
        let map = parse_numstat_z(numstat);
        assert_eq!(map.get("new name.txt"), Some(&false));
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn numstat_line_classifier() {
        assert!(is_numstat_line("12\t3\tfile.txt"));
        assert!(is_numstat_line("-\t-\tfile.bin"));
        assert!(!is_numstat_line("commit abc"));
        assert!(!is_numstat_line(""));
    }

    #[test]
    fn path_validation_rejects_traversal() {
        assert!(validate_api_path("src/index.html").is_ok());
        assert!(validate_api_path("../escape").is_err());
        assert!(validate_api_path("/absolute").is_err());
        assert!(validate_api_path("a\\b").is_err());
        assert!(validate_api_path("C:/win").is_err());
        assert!(validate_api_path("con.txt").is_err());
        assert!(validate_api_path("trailing ").is_err());
    }
}
