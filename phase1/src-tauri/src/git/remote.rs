//! Remote layer, part 2/2: repo picker, clone, fetch, pull plan/apply, push plan/apply,
//! cancel and outcome reconciliation (concept section 5 A2, R1 contracts).
//!
//! Library layer only. It has no Tauri commands. The host (desktop, CLI) wraps each
//! blocking function in a GitJob and passes a [`NetCtx`] (cancel flag + progress sink).
//!
//! Hard rules enforced here (see the tests):
//! - Plan/apply is strict. `*_apply` never trusts a plan object sent by a caller. It takes
//!   the original plan inputs plus the reviewed `plan_id`, recomputes the plan from live
//!   state and refuses with `stale-plan` on any difference.
//! - Tokens never reach argv, URLs, git config files, logs or results. This module never
//!   sees a token: credentials come from a [`CredentialLease`] (S3 contract adapter) that
//!   hands git an opaque credential helper. Global and system git config are disabled for
//!   every network call (no GCM, no `insteadOf` from `~/.gitconfig`).
//! - Every network call targets an explicit, validated, canonical HTTPS GitHub URL and an
//!   explicit refspec. `pushurl` / `insteadOf` are resolved and validated first.
//! - Push never forces, never pushes tags, pushes an exact commit SHA to an explicit ref.
//! - Agent-origin applies need a valid grant and an empty unsaved-buffer set.

use super::{
    detect, git_write, ready_info, run_git, GitError, GitErrorCode, GitOutput, GitRepoInfo,
    GitRepoState, Mode, TrustStore, EMPTY_TREE, READ_TIMEOUT,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

pub mod net;
pub mod pull;
pub mod push;
#[cfg(test)]
mod tests;

pub use net::{classify_transport, redact, CancelRegistry, JobSink, NetCtx, Progress};

pub(crate) const LS_REMOTE_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const FETCH_TIMEOUT: Duration = Duration::from_secs(10 * 60);
pub(crate) const PUSH_TIMEOUT: Duration = Duration::from_secs(15 * 60);
pub(crate) const CLONE_TIMEOUT: Duration = Duration::from_secs(30 * 60);

// ---------------------------------------------------------------- errors

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteErrorCode {
    GitMissing,
    NotARepo,
    Blocked,
    /// Local changes would be overwritten.
    DirtyState,
    /// Unsaved editor buffers: BLOCKER for agent operations and for overlapping files.
    UnsavedBuffers,
    /// Plan inputs changed between review and apply.
    StalePlan,
    Diverged,
    NonFastForward,
    NoRemote,
    NoUpstream,
    UrlRejected,
    /// Missing, expired or rejected credentials: reconnect.
    AuthRequired,
    /// Organization SAML SSO must authorize the token. Never mislabeled as an invalid token.
    SsoRequired,
    PermissionDenied,
    ProtectedBranch,
    WorkflowScopeMissing,
    NotFound,
    RateLimited,
    Offline,
    Timeout,
    Cancelled,
    TooLarge,
    DestinationExists,
    /// No valid human confirmation or agent grant.
    ReviewRequired,
    HookFailed,
    RemoteRejected,
    Io,
    Unknown,
}

/// R1 GitJob outcome taxonomy.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobOutcome {
    Success,
    Failed,
    NeedsInput,
    StalePlan,
    Uncertain,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteError {
    pub code: RemoteErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub type RResult<T> = Result<T, RemoteError>;

impl RemoteError {
    pub(crate) fn new(code: RemoteErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }
    pub(crate) fn detail(code: RemoteErrorCode, message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: Some(redact(&detail.into())) }
    }
    pub fn to_json(&self) -> String {
        serde_json::to_string(self)
            .unwrap_or_else(|_| "{\"code\":\"unknown\",\"message\":\"remote error encoding failed\"}".into())
    }
    /// Which GitJob outcome this error maps to.
    pub fn job_outcome(&self) -> JobOutcome {
        use RemoteErrorCode as C;
        match self.code {
            C::StalePlan => JobOutcome::StalePlan,
            C::AuthRequired
            | C::SsoRequired
            | C::WorkflowScopeMissing
            | C::ReviewRequired
            | C::UnsavedBuffers
            | C::Diverged
            | C::DirtyState
            | C::NoUpstream
            | C::NoRemote => JobOutcome::NeedsInput,
            _ => JobOutcome::Failed,
        }
    }
}

impl std::fmt::Display for RemoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for RemoteError {}

impl From<GitError> for RemoteError {
    fn from(e: GitError) -> Self {
        let code = match e.code {
            GitErrorCode::GitMissing => RemoteErrorCode::GitMissing,
            GitErrorCode::NotARepo => RemoteErrorCode::NotARepo,
            GitErrorCode::Blocked => RemoteErrorCode::Blocked,
            GitErrorCode::HookFailed => RemoteErrorCode::HookFailed,
            GitErrorCode::Timeout => RemoteErrorCode::Timeout,
            GitErrorCode::Cancelled => RemoteErrorCode::Cancelled,
            GitErrorCode::TooLarge => RemoteErrorCode::TooLarge,
            GitErrorCode::Io => RemoteErrorCode::Io,
            _ => RemoteErrorCode::Unknown,
        };
        Self { code, message: e.message, detail: e.detail.map(|d| redact(&d)) }
    }
}

pub(crate) fn friendly(code: RemoteErrorCode) -> &'static str {
    use RemoteErrorCode as C;
    match code {
        C::AuthRequired => "GitHub did not accept the sign-in. Reconnect your GitHub account.",
        C::SsoRequired => "Your organization requires SAML single sign-on for this token. Authorize it for the organization on GitHub, then retry.",
        C::PermissionDenied => "This GitHub account is not allowed to do that on this repository.",
        C::ProtectedBranch => "GitHub refused the push because the branch is protected or a repository rule blocks it.",
        C::WorkflowScopeMissing => "Changing GitHub Actions files needs the extra 'workflow' permission. Reconnect GitHub and allow it.",
        C::NonFastForward => "The remote branch has newer versions. Bring them in first, then publish again.",
        C::NotFound => "GitHub could not find that repository, or this account cannot see it.",
        C::RateLimited => "GitHub is rate limiting this account. Try again later.",
        C::Offline => "Could not reach GitHub. Check the connection.",
        C::Timeout => "GitHub took too long to answer and the call was stopped.",
        C::Cancelled => "The network operation was cancelled.",
        _ => "The remote operation failed.",
    }
}

// ---------------------------------------------------------------- contracts with other layers

/// Progress and cancellation come from the GitJob engine (S1). See [`net::JobSink`].
///
/// A credential lease (S3 contract). One lease per job: one account, one validated HTTPS
/// host, one canonical repository path, an expiry. The implementer exposes **no token**:
/// it only describes the opaque helper git should call (bundled helper over a private
/// pipe). `git_config` is checked against an allow-list (`credential.*`, empty `core.askPass` /
/// `http.extraHeader`, `http.followRedirects`, `protocol.*.allow`) and `env` only `SOMNIA_*`
/// plus `GIT_TERMINAL_PROMPT=0` / `GCM_INTERACTIVE=never`; anything else is rejected before git starts.
pub trait CredentialLease: Send + Sync {
    fn account_login(&self) -> &str;
    fn host(&self) -> &str;
    /// `owner/repo`, canonical as in the GitHub API.
    fn repo_path(&self) -> &str;
    /// OAuth scopes granted to the token (for example `repo`, `workflow`).
    fn scopes(&self) -> &[String];
    fn is_expired(&self) -> bool;
    /// `credential.helper` entries etc. Applied after a helper-list reset.
    fn git_config(&self) -> Vec<(String, String)>;
    fn env(&self) -> Vec<(String, String)>;
    /// Called when the job is cancelled or times out: stop serving credentials.
    fn cancel(&self) {}
    /// The credential helper saw git report the credential rejected.
    fn auth_rejected(&self) -> bool {
        false
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeasePurpose {
    Read,
    Write,
}

pub trait LeaseProvider: Send + Sync {
    /// Acquire a lease for exactly this repo. `Err(AuthRequired)` when no account is connected.
    fn lease(&self, host: &str, repo_path: &str, purpose: LeasePurpose) -> RResult<Box<dyn CredentialLease>>;
}

/// Unsaved editor buffers (host state; a filesystem watcher cannot see them).
/// Returned paths are repo-relative with forward slashes.
pub trait BufferGuard: Send + Sync {
    fn unsaved_paths(&self, repo_root: &Path) -> Vec<String>;
}

/// Owner or per-task grant validation for agent-origin applies (R5-C2 L2).
pub trait PublishGrants: Send + Sync {
    fn permits(&self, grant_id: &str, action: GrantAction, plan_id: &str) -> bool;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GrantAction {
    PullApply,
    PushApply,
}

/// Who presses apply. A plan id alone is never authority.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Authority {
    /// A person confirmed the reviewed plan in the UI/CLI.
    Human { confirmed: bool },
    /// An agent acting under a grant the owner gave.
    Agent { grant_id: String },
}

/// Where URLs may point. Production: github.com over HTTPS only.
#[derive(Clone, Debug)]
pub struct Policy {
    allow_test_urls: bool,
}

impl Policy {
    pub fn github() -> Self {
        Self { allow_test_urls: false }
    }
    #[cfg(test)]
    pub(crate) fn for_tests() -> Self {
        Self { allow_test_urls: true }
    }
}

pub struct RemoteEnv<'a> {
    pub policy: &'a Policy,
    pub trust: Option<&'a TrustStore>,
    pub leases: &'a dyn LeaseProvider,
    pub buffers: &'a dyn BufferGuard,
    pub grants: &'a dyn PublishGrants,
    pub net: &'a NetCtx,
}

// ---------------------------------------------------------------- URL validation

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedRemote {
    /// Token-free canonical URL handed to git.
    pub canonical: String,
    pub host: String,
    pub owner: String,
    pub repo: String,
}

impl ParsedRemote {
    pub fn repo_path(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }
}

fn valid_owner(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 39
        && !s.starts_with('-')
        && !s.ends_with('-')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn valid_repo(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s != "."
        && s != ".."
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// Strict validation of an effective remote URL. Accepts `https://github.com/<owner>/<repo>[.git]`
/// only. Rejects userinfo (a token in a URL), ports, query, fragment, extra path, SSH, `git://`,
/// `file:` and every other host. Test policy additionally accepts loopback `http://127.0.0.1:<port>/o/r`
/// and absolute local directories.
pub fn validate_remote_url(policy: &Policy, url: &str) -> RResult<ParsedRemote> {
    let reject = |why: &str| Err(RemoteError::detail(RemoteErrorCode::UrlRejected, "This remote is not a supported GitHub HTTPS address", why));
    if url.len() > 300 || url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return reject("malformed");
    }
    if let Some(rest) = url.strip_prefix("https://") {
        if rest.contains('@') {
            return reject("userinfo-in-url");
        }
        let (host, path) = match rest.split_once('/') {
            Some(x) => x,
            None => return reject("no-path"),
        };
        if !host.eq_ignore_ascii_case("github.com") {
            return reject("host-not-github");
        }
        if path.contains('?') || path.contains('#') || path.contains('%') || path.contains('\\') {
            return reject("query-or-escape");
        }
        let segs: Vec<&str> = path.trim_end_matches('/').split('/').collect();
        if segs.len() != 2 {
            return reject("path-shape");
        }
        let owner = segs[0];
        let repo = segs[1].strip_suffix(".git").unwrap_or(segs[1]);
        if !valid_owner(owner) || !valid_repo(repo) {
            return reject("owner-or-repo");
        }
        return Ok(ParsedRemote {
            canonical: format!("https://github.com/{owner}/{repo}.git"),
            host: "github.com".into(),
            owner: owner.to_string(),
            repo: repo.to_string(),
        });
    }
    if url.starts_with("ssh://") || url.starts_with("git@") || url.starts_with("git://") || url.starts_with("http://") && !policy.allow_test_urls {
        return reject("scheme-not-supported");
    }
    if policy.allow_test_urls {
        if let Some(rest) = url.strip_prefix("http://127.0.0.1:") {
            if let Some((port, path)) = rest.split_once('/') {
                let segs: Vec<&str> = path.split('/').collect();
                if port.chars().all(|c| c.is_ascii_digit()) && segs.len() == 2 {
                    let repo = segs[1].strip_suffix(".git").unwrap_or(segs[1]);
                    if valid_owner(segs[0]) && valid_repo(repo) {
                        return Ok(ParsedRemote {
                            canonical: url.to_string(),
                            host: "127.0.0.1".into(),
                            owner: segs[0].to_string(),
                            repo: repo.to_string(),
                        });
                    }
                }
            }
            return reject("test-url-shape");
        }
        if Path::new(url).is_absolute() {
            return Ok(ParsedRemote { canonical: url.to_string(), host: "local".into(), owner: "local".into(), repo: "local".into() });
        }
    }
    reject("unsupported")
}

/// Lease must be for exactly this host and repo, unexpired.
pub(crate) fn check_lease(lease: &dyn CredentialLease, remote: &ParsedRemote) -> RResult<()> {
    if lease.is_expired() {
        return Err(RemoteError::new(RemoteErrorCode::AuthRequired, friendly(RemoteErrorCode::AuthRequired)));
    }
    if !lease.host().eq_ignore_ascii_case(&remote.host)
        || !lease.repo_path().eq_ignore_ascii_case(&remote.repo_path())
    {
        return Err(RemoteError::detail(
            RemoteErrorCode::UrlRejected,
            "The credential is not scoped to this repository",
            "lease-scope-mismatch",
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------- git helpers

pub(crate) fn iso_env() -> Vec<(&'static str, OsString)> {
    let null = if cfg!(windows) { "NUL" } else { "/dev/null" };
    vec![
        ("GIT_CONFIG_GLOBAL", OsString::from(null)),
        ("GIT_CONFIG_NOSYSTEM", OsString::from("1")),
        ("GIT_LFS_SKIP_SMUDGE", OsString::from("1")),
    ]
}

/// Read-mode local git call with isolated (global/system config off) environment.
pub(super) fn gr(root: &Path, args: &[&str]) -> RResult<GitOutput> {
    let os: Vec<&OsStr> = args.iter().map(|a| OsStr::new(*a)).collect();
    let env = iso_env();
    let env_ref: Vec<(&str, &OsStr)> = env.iter().map(|(k, v)| (*k, v.as_os_str())).collect();
    Ok(run_git(root, &os, Mode::Read, READ_TIMEOUT, None, &env_ref)?)
}

pub(super) fn gr_ok(root: &Path, args: &[&str]) -> RResult<GitOutput> {
    let out = gr(root, args)?;
    if out.code != Some(0) {
        return Err(RemoteError::detail(RemoteErrorCode::Unknown, "A git read failed", out.stderr));
    }
    Ok(out)
}

pub(super) fn gr_stdin(root: &Path, args: &[&str], stdin: &[u8]) -> RResult<GitOutput> {
    let os: Vec<&OsStr> = args.iter().map(|a| OsStr::new(*a)).collect();
    let env = iso_env();
    let env_ref: Vec<(&str, &OsStr)> = env.iter().map(|(k, v)| (*k, v.as_os_str())).collect();
    Ok(run_git(root, &os, Mode::Read, Duration::from_secs(120), Some(stdin), &env_ref)?)
}

pub(super) fn gw(root: &Path, args: &[&str]) -> RResult<GitOutput> {
    let os: Vec<&OsStr> = args.iter().map(|a| OsStr::new(*a)).collect();
    Ok(git_write(root, &os, None, &[])?)
}

pub(super) fn text(out: &GitOutput) -> String {
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub(crate) fn sha_of(root: &Path, rev: &str) -> RResult<Option<String>> {
    let out = gr(root, &["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")])?;
    if out.code == Some(0) {
        Ok(Some(text(&out)))
    } else {
        Ok(None)
    }
}

pub(crate) fn tree_of(root: &Path, sha: &str) -> RResult<String> {
    Ok(text(&gr_ok(root, &["rev-parse", "--verify", &format!("{sha}^{{tree}}")])?))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn plan_hash(kind: &str, parts: &[&str]) -> String {
    let mut h = Sha256::new();
    h.update(b"somnia-plan/v1\0");
    h.update(kind.as_bytes());
    for p in parts {
        h.update(b"\0");
        h.update(p.as_bytes());
    }
    hex(&h.finalize())
}

pub(crate) fn valid_remote_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('-')
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// Branch short names: delegate to git's own ref rules, plus a ban on `-`-leading and Somnia internals.
pub(crate) fn valid_branch(root: &Path, name: &str) -> RResult<()> {
    if name.is_empty() || name.len() > 200 || name.starts_with('-') || name.starts_with("somnia/") || name == "HEAD" {
        return Err(RemoteError::new(RemoteErrorCode::Blocked, "That branch name is not allowed"));
    }
    let r = gr(root, &["check-ref-format", &format!("refs/heads/{name}")])?;
    if r.code != Some(0) {
        return Err(RemoteError::new(RemoteErrorCode::Blocked, "That branch name is not valid"));
    }
    Ok(())
}

pub(crate) struct RepoCtx {
    pub root: PathBuf,
    pub info: GitRepoInfo,
}

pub(crate) fn repo_ctx(env: &RemoteEnv, project_root: &Path) -> RResult<RepoCtx> {
    let info = ready_info(project_root, env.trust)?;
    Ok(RepoCtx { root: PathBuf::from(&info.root), info })
}

/// `git config --get`; exit 1 means unset.
pub(crate) fn config_get(root: &Path, key: &str) -> RResult<Option<String>> {
    let out = gr(root, &["config", "--local", "--get", key])?;
    match out.code {
        Some(0) => Ok(Some(text(&out))),
        Some(1) => Ok(None),
        _ => Err(RemoteError::detail(RemoteErrorCode::Unknown, "Could not read git config", out.stderr)),
    }
}

/// Remote name for a branch: explicit request, then `branch.<b>.remote`, then `origin`.
/// The remote must exist.
pub(crate) fn resolve_remote(root: &Path, branch: Option<&str>, requested: Option<&str>) -> RResult<String> {
    let name = match requested {
        Some(r) => r.to_string(),
        None => {
            let configured = match branch {
                Some(b) => config_get(root, &format!("branch.{b}.remote"))?,
                None => None,
            };
            match configured {
                Some(c) if c != "." => c,
                _ => "origin".to_string(),
            }
        }
    };
    if !valid_remote_name(&name) {
        return Err(RemoteError::new(RemoteErrorCode::NoRemote, "That remote name is not valid"));
    }
    let list = text(&gr_ok(root, &["remote"])?);
    if !list.lines().any(|l| l == name) {
        return Err(RemoteError::detail(RemoteErrorCode::NoRemote, "This project has no such GitHub remote", name));
    }
    Ok(name)
}

/// Effective URL (after `pushurl` / `insteadOf` in repo-local config), validated, plus a check
/// that handing the canonical URL to git again cannot be rewritten somewhere else.
pub(crate) fn effective_remote(env: &RemoteEnv, root: &Path, name: &str, push: bool) -> RResult<ParsedRemote> {
    let args: Vec<&str> = if push { vec!["remote", "get-url", "--push", name] } else { vec!["remote", "get-url", name] };
    let out = gr(root, &args)?;
    if out.code != Some(0) {
        return Err(RemoteError::detail(RemoteErrorCode::NoRemote, "This project has no such GitHub remote", out.stderr));
    }
    let raw = text(&out);
    let parsed = validate_remote_url(env.policy, &raw)?;
    ensure_no_rewrite(root, &parsed)?;
    Ok(parsed)
}

pub(crate) fn ensure_no_rewrite(cwd: &Path, parsed: &ParsedRemote) -> RResult<()> {
    let out = gr(cwd, &["ls-remote", "--get-url", &parsed.canonical])?;
    if out.code != Some(0) || text(&out) != parsed.canonical {
        return Err(RemoteError::detail(
            RemoteErrorCode::UrlRejected,
            "A git URL rewrite rule changes where this remote points",
            "url-rewrite",
        ));
    }
    Ok(())
}

/// One mutating remote operation per repository at a time. Never waits.
pub(crate) struct RepoLock {
    key: String,
}

static LOCKS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

impl RepoLock {
    pub(crate) fn acquire(root: &Path) -> RResult<Self> {
        let key = root.canonicalize().unwrap_or_else(|_| root.to_path_buf()).to_string_lossy().to_string();
        let mut g = LOCKS.lock().unwrap_or_else(|e| e.into_inner());
        let set = g.get_or_insert_with(HashSet::new);
        if !set.insert(key.clone()) {
            return Err(RemoteError::detail(RemoteErrorCode::Blocked, "Another Git operation is already running in this project", "operation-in-progress"));
        }
        Ok(Self { key })
    }
}

impl Drop for RepoLock {
    fn drop(&mut self) {
        let mut g = LOCKS.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(set) = g.as_mut() {
            set.remove(&self.key);
        }
    }
}

/// `git ls-remote` for one exact ref. `Ok(None)` = the ref does not exist.
pub(crate) fn observe_remote_ref(
    env: &RemoteEnv,
    root: &Path,
    remote: &ParsedRemote,
    lease: &dyn CredentialLease,
    full_ref: &str,
    cancellable: bool,
) -> RResult<Option<String>> {
    let ctx = if cancellable { env.net.clone() } else { NetCtx::detached() };
    let args: Vec<OsString> = ["ls-remote", "--", remote.canonical.as_str(), full_ref].iter().map(OsString::from).collect();
    let out = net::run_net(root, env.policy, &args, Some(lease), &ctx, LS_REMOTE_TIMEOUT, "Checking GitHub")?;
    if out.cancelled {
        return Err(RemoteError::new(RemoteErrorCode::Cancelled, friendly(RemoteErrorCode::Cancelled)));
    }
    if out.timed_out {
        return Err(RemoteError::new(RemoteErrorCode::Timeout, friendly(RemoteErrorCode::Timeout)));
    }
    if out.code != Some(0) {
        return Err(net::error_from_stderr(&out.stderr));
    }
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some((sha, name)) = line.split_once('\t') {
            if name == full_ref && sha.len() >= 40 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
                return Ok(Some(sha.to_string()));
            }
        }
    }
    Ok(None)
}

pub(crate) fn acquire_lease(
    env: &RemoteEnv,
    remote: &ParsedRemote,
    purpose: LeasePurpose,
) -> RResult<Box<dyn CredentialLease>> {
    let lease = env.leases.lease(&remote.host, &remote.repo_path(), purpose)?;
    check_lease(lease.as_ref(), remote)?;
    Ok(lease)
}

/// Authority gate shared by pull and push apply.
pub(crate) fn check_authority(env: &RemoteEnv, authority: &Authority, action: GrantAction, plan_id: &str) -> RResult<()> {
    match authority {
        Authority::Human { confirmed: true } => Ok(()),
        Authority::Human { confirmed: false } => Err(RemoteError::new(RemoteErrorCode::ReviewRequired, "Review and confirm the plan first")),
        Authority::Agent { grant_id } => {
            if !grant_id.is_empty() && env.grants.permits(grant_id, action, plan_id) {
                Ok(())
            } else {
                Err(RemoteError::new(RemoteErrorCode::ReviewRequired, "An agent needs an owner grant for this action"))
            }
        }
    }
}

pub(crate) fn is_agent(a: &Authority) -> bool {
    matches!(a, Authority::Agent { .. })
}

/// Parsed `git status --porcelain -z` paths (both sides of renames). Whole repo.
pub(crate) fn local_change_paths(root: &Path) -> RResult<Vec<String>> {
    let out = gr_ok(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let mut paths = Vec::new();
    let mut it = out.stdout.split(|b| *b == 0).filter(|s| !s.is_empty());
    while let Some(rec) = it.next() {
        if rec.len() < 4 {
            continue;
        }
        let (x, y) = (rec[0], rec[1]);
        paths.push(String::from_utf8_lossy(&rec[3..]).to_string());
        if x == b'R' || x == b'C' || y == b'R' || y == b'C' {
            if let Some(old) = it.next() {
                paths.push(String::from_utf8_lossy(old).to_string());
            }
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanCommit {
    pub sha: String,
    pub author: String,
    pub time: i64,
    pub subject: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFile {
    /// `A`, `M`, `D`, `R`, `T`...
    pub status: String,
    pub path: String,
}

pub(crate) const MAX_PLAN_COMMITS: usize = 50;
pub(crate) const MAX_PLAN_FILES: usize = 200;

/// Commits in `range` (for example `a..b`), newest first, capped. Returns (list, total).
pub(crate) fn plan_commits(root: &Path, range_args: &[&str]) -> RResult<(Vec<PlanCommit>, usize)> {
    let mut count_args = vec!["rev-list", "--count"];
    count_args.extend_from_slice(range_args);
    let total: usize = text(&gr_ok(root, &count_args)?).parse().unwrap_or(0);
    let max = format!("--max-count={MAX_PLAN_COMMITS}");
    let mut args = vec!["log", max.as_str(), "--format=%H%x1f%an%x1f%at%x1f%s%x1e"];
    args.extend_from_slice(range_args);
    let out = gr_ok(root, &args)?;
    let s = String::from_utf8_lossy(&out.stdout).to_string();
    let mut list = Vec::new();
    for rec in s.split('\u{1e}') {
        let rec = rec.trim_matches(|c| c == '\n' || c == '\r');
        let f: Vec<&str> = rec.split('\u{1f}').collect();
        if f.len() == 4 {
            list.push(PlanCommit {
                sha: f[0].to_string(),
                author: f[1].chars().filter(|c| !c.is_control()).collect(),
                time: f[2].parse().unwrap_or(0),
                subject: f[3].chars().filter(|c| !c.is_control()).take(200).collect(),
            });
        }
    }
    Ok((list, total))
}

/// All changed paths between two trees (name-status, rename detection off so paths stay literal).
pub(crate) fn changed_files(root: &Path, from: &str, to: &str) -> RResult<Vec<PlanFile>> {
    let out = gr_ok(root, &["diff", "--name-status", "-z", "--no-renames", from, to])?;
    let mut files = Vec::new();
    let mut it = out.stdout.split(|b| *b == 0).filter(|s| !s.is_empty());
    while let (Some(st), Some(p)) = (it.next(), it.next()) {
        files.push(PlanFile { status: String::from_utf8_lossy(st).to_string(), path: String::from_utf8_lossy(p).to_string() });
    }
    Ok(files)
}

pub(crate) fn empty_tree() -> &'static str {
    EMPTY_TREE
}

// ---------------------------------------------------------------- github_repositories

#[derive(Clone, Debug)]
pub struct ApiResponse {
    pub status: u16,
    /// Lower-cased header names.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// GitHub REST transport (adapter). The implementer holds the token; this module never does.
/// `path_and_query` always starts with `/` and is built here.
pub trait ApiTransport: Send + Sync {
    fn get(&self, path_and_query: &str) -> RResult<ApiResponse>;
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepoListRequest {
    /// Client-side filter on `owner/name` (substring, case-insensitive).
    #[serde(default)]
    pub query: Option<String>,
    /// 1-based.
    #[serde(default)]
    pub page: Option<u32>,
    #[serde(default)]
    pub per_page: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSummary {
    pub id: u64,
    pub full_name: String,
    pub owner: String,
    pub name: String,
    pub private: bool,
    pub fork: bool,
    pub archived: bool,
    pub default_branch: Option<String>,
    pub description: Option<String>,
    pub updated_at: Option<String>,
    pub can_push: bool,
    /// Recomputed canonical HTTPS URL, never the string from the API.
    pub clone_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoPage {
    pub repos: Vec<RepoSummary>,
    pub page: u32,
    pub has_next: bool,
}

fn header<'a>(r: &'a ApiResponse, name: &str) -> Option<&'a str> {
    r.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
}

pub(crate) fn api_error(r: &ApiResponse) -> RemoteError {
    use RemoteErrorCode as C;
    let code = match r.status {
        401 => C::AuthRequired,
        403 | 429 => {
            if header(r, "x-github-sso").is_some() {
                C::SsoRequired
            } else if header(r, "x-ratelimit-remaining") == Some("0") || r.status == 429 {
                C::RateLimited
            } else {
                C::PermissionDenied
            }
        }
        404 => C::NotFound,
        500..=599 => C::Offline,
        _ => C::Unknown,
    };
    let mut e = RemoteError::new(code, friendly(code));
    if code == C::SsoRequired {
        // X-GitHub-SSO: required; url=https://github.com/orgs/<org>/sso?authorization_request=...
        if let Some(url) = header(r, "x-github-sso").and_then(|v| v.split("url=").nth(1)) {
            if url.starts_with("https://github.com/") {
                e.detail = Some(url.trim().to_string());
            }
        }
    }
    e
}

/// `github_repositories`: one page of repositories the account can reach. Read-only.
pub fn github_repositories(api: &dyn ApiTransport, req: &RepoListRequest) -> RResult<RepoPage> {
    let page = req.page.unwrap_or(1).clamp(1, 100);
    let per_page = req.per_page.unwrap_or(50).clamp(1, 100);
    let path = format!(
        "/user/repos?per_page={per_page}&page={page}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member"
    );
    let resp = api.get(&path)?;
    if resp.status != 200 {
        return Err(api_error(&resp));
    }
    let v: serde_json::Value = serde_json::from_slice(&resp.body)
        .map_err(|_| RemoteError::new(RemoteErrorCode::Unknown, "GitHub sent an unreadable repository list"))?;
    let items = v.as_array().ok_or_else(|| RemoteError::new(RemoteErrorCode::Unknown, "GitHub sent an unreadable repository list"))?;
    let needle = req.query.as_deref().map(|q| q.trim().to_lowercase()).filter(|q| !q.is_empty());
    let policy = Policy::github();
    let mut repos = Vec::new();
    for it in items {
        let full = it.get("full_name").and_then(|x| x.as_str()).unwrap_or("");
        let Ok(parsed) = validate_remote_url(&policy, &format!("https://github.com/{full}")) else { continue };
        if let Some(n) = &needle {
            if !full.to_lowercase().contains(n) {
                continue;
            }
        }
        let s = |k: &str| it.get(k).and_then(|x| x.as_str()).map(|x| x.chars().filter(|c| !c.is_control()).take(300).collect::<String>());
        let b = |k: &str| it.get(k).and_then(|x| x.as_bool()).unwrap_or(false);
        repos.push(RepoSummary {
            id: it.get("id").and_then(|x| x.as_u64()).unwrap_or(0),
            full_name: format!("{}/{}", parsed.owner, parsed.repo),
            owner: parsed.owner.clone(),
            name: parsed.repo.clone(),
            private: b("private"),
            fork: b("fork"),
            archived: b("archived"),
            default_branch: s("default_branch"),
            description: s("description"),
            updated_at: s("pushed_at").or_else(|| s("updated_at")),
            can_push: it.get("permissions").and_then(|p| p.get("push")).and_then(|x| x.as_bool()).unwrap_or(false),
            clone_url: parsed.canonical,
        });
    }
    let has_next = header(&resp, "link").map(|l| l.contains("rel=\"next\"")).unwrap_or(false);
    Ok(RepoPage { repos, page, has_next })
}

// ---------------------------------------------------------------- clone

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloneRequest {
    /// Chosen in the picker (`RepoSummary.clone_url`) or typed. Validated.
    pub url: String,
    /// Final folder. Must not exist or be an empty directory; its parent must exist.
    pub destination: String,
    #[serde(default)]
    pub branch: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneResult {
    pub root: String,
    pub remote: String,
    pub remote_url: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    /// True when the repository has no commits.
    pub empty: bool,
}

/// Clone into a staging folder next to the destination, then move it into place. Cancel,
/// timeout or failure removes only the staging folder. Does not trust the new repo; the
/// host decides that.
pub fn clone(env: &RemoteEnv, req: &CloneRequest) -> RResult<CloneResult> {
    let remote = validate_remote_url(env.policy, &req.url)?;
    let dest = PathBuf::from(&req.destination);
    if !dest.is_absolute() {
        return Err(RemoteError::new(RemoteErrorCode::Io, "The destination must be an absolute folder path"));
    }
    let parent = dest.parent().filter(|p| p.is_dir()).ok_or_else(|| RemoteError::new(RemoteErrorCode::Io, "The destination's parent folder does not exist"))?;
    let leaf = dest.file_name().and_then(|n| n.to_str()).filter(|n| !n.is_empty() && !n.starts_with('-') && !n.starts_with('.')).ok_or_else(|| RemoteError::new(RemoteErrorCode::Io, "The destination folder name is not allowed"))?;
    if dest.exists() {
        let empty = dest.is_dir() && std::fs::read_dir(&dest).map(|mut d| d.next().is_none()).unwrap_or(false);
        if !empty {
            return Err(RemoteError::new(RemoteErrorCode::DestinationExists, "The destination folder already exists and is not empty"));
        }
    }
    if let Some(b) = &req.branch {
        if b.is_empty() || b.starts_with('-') || b.len() > 200 || b.chars().any(|c| c.is_control() || c.is_whitespace() || "~^:?*[\\".contains(c)) {
            return Err(RemoteError::new(RemoteErrorCode::Blocked, "That branch name is not valid"));
        }
    }
    ensure_no_rewrite(parent, &remote)?;
    let lease = acquire_lease(env, &remote, LeasePurpose::Read)?;

    let nonce = hex(&Sha256::digest(format!("{}{:?}{}", std::process::id(), std::time::SystemTime::now(), leaf).as_bytes()))[..12].to_string();
    let staging = parent.join(format!(".somnia-clone-{nonce}"));
    let mut args: Vec<OsString> = vec!["clone".into(), "--progress".into(), "--no-tags".into(), "--no-recurse-submodules".into()];
    if let Some(b) = &req.branch {
        args.push("--branch".into());
        args.push(b.into());
    }
    args.push("--".into());
    args.push(remote.canonical.clone().into());
    args.push(staging.clone().into_os_string());

    let cleanup = |p: &Path| {
        // Only ever our own staging folder.
        if p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with(".somnia-clone-")).unwrap_or(false) {
            let _ = std::fs::remove_dir_all(p);
        }
    };
    let out = net::run_net(parent, env.policy, &args, Some(lease.as_ref()), env.net, CLONE_TIMEOUT, "Downloading");
    let out = match out {
        Ok(o) => o,
        Err(e) => {
            cleanup(&staging);
            return Err(e);
        }
    };
    if out.cancelled || out.timed_out || out.code != Some(0) {
        cleanup(&staging);
        if out.cancelled {
            return Err(RemoteError::new(RemoteErrorCode::Cancelled, friendly(RemoteErrorCode::Cancelled)));
        }
        if out.timed_out {
            return Err(RemoteError::new(RemoteErrorCode::Timeout, friendly(RemoteErrorCode::Timeout)));
        }
        return Err(net::error_from_stderr(&out.stderr));
    }
    // Move into place. An existing empty destination is replaced; anything else raced in is refused.
    let placed = (|| -> std::io::Result<()> {
        if dest.exists() {
            std::fs::remove_dir(&dest)?; // fails when it is no longer empty
        }
        std::fs::rename(&staging, &dest)
    })();
    if placed.is_err() {
        cleanup(&staging);
        return Err(RemoteError::new(RemoteErrorCode::DestinationExists, "The destination folder changed during the download"));
    }
    let canon = dest.canonicalize().unwrap_or(dest);
    let (branch, head, empty) = match detect(&canon, None) {
        GitRepoState::Ready { repo } => (repo.branch.clone(), repo.head.clone(), repo.unborn),
        _ => (None, None, false),
    };
    Ok(CloneResult { root: canon.to_string_lossy().to_string(), remote: "origin".into(), remote_url: remote.canonical, branch, head, empty })
}

// ---------------------------------------------------------------- fetch

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchRequest {
    pub project_root: String,
    #[serde(default)]
    pub remote: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefUpdate {
    pub name: String,
    pub old: Option<String>,
    pub new: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub remote: String,
    pub remote_url: String,
    pub updated: Vec<RefUpdate>,
}

fn tracking_snapshot(root: &Path, remote: &str) -> RResult<std::collections::BTreeMap<String, String>> {
    let prefix = format!("refs/remotes/{remote}/");
    let out = gr_ok(root, &["for-each-ref", "--format=%(objectname) %(refname)", &prefix])?;
    let mut m = std::collections::BTreeMap::new();
    for l in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some((sha, name)) = l.split_once(' ') {
            if name.ends_with("/HEAD") {
                continue;
            }
            m.insert(name.to_string(), sha.to_string());
        }
    }
    Ok(m)
}

/// Fetch branches from the remote into `refs/remotes/<name>/*`. Never touches the worktree
/// or local branches, so it needs no plan. No tags, no submodule recursion, no prune.
pub fn fetch(env: &RemoteEnv, req: &FetchRequest) -> RResult<FetchResult> {
    let ctx = repo_ctx(env, Path::new(&req.project_root))?;
    let name = resolve_remote(&ctx.root, ctx.info.branch.as_deref(), req.remote.as_deref())?;
    let remote = effective_remote(env, &ctx.root, &name, false)?;
    let lease = acquire_lease(env, &remote, LeasePurpose::Read)?;
    let _lock = RepoLock::acquire(&ctx.root)?;
    let before = tracking_snapshot(&ctx.root, &name)?;
    let refspec = format!("+refs/heads/*:refs/remotes/{name}/*");
    let args: Vec<OsString> = ["fetch", "--progress", "--no-tags", "--no-recurse-submodules", "--", remote.canonical.as_str(), refspec.as_str()]
        .iter()
        .map(OsString::from)
        .collect();
    let out = net::run_net(&ctx.root, env.policy, &args, Some(lease.as_ref()), env.net, FETCH_TIMEOUT, "Fetching")?;
    if out.cancelled {
        return Err(RemoteError::new(RemoteErrorCode::Cancelled, friendly(RemoteErrorCode::Cancelled)));
    }
    if out.timed_out {
        return Err(RemoteError::new(RemoteErrorCode::Timeout, friendly(RemoteErrorCode::Timeout)));
    }
    if out.code != Some(0) {
        return Err(net::error_from_stderr(&out.stderr));
    }
    let after = tracking_snapshot(&ctx.root, &name)?;
    let mut updated = Vec::new();
    for (k, v) in &after {
        if before.get(k) != Some(v) {
            updated.push(RefUpdate { name: k.clone(), old: before.get(k).cloned(), new: Some(v.clone()) });
        }
    }
    for (k, v) in &before {
        if !after.contains_key(k) {
            updated.push(RefUpdate { name: k.clone(), old: Some(v.clone()), new: None });
        }
    }
    Ok(FetchResult { remote: name, remote_url: remote.canonical, updated })
}
