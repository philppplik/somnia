use super::pull::*;
use super::push::*;
use super::*;
use std::io::{Read as _, Write as _};
use std::net::TcpListener;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

// ---------------------------------------------------------------- fixtures

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_AUTHOR_NAME", "T")
        .env("GIT_AUTHOR_EMAIL", "t@example.com")
        .env("GIT_COMMITTER_NAME", "T")
        .env("GIT_COMMITTER_EMAIL", "t@example.com")
        .output()
        .expect("git runs");
    assert!(out.status.success(), "git {:?} failed: {}", args, String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn commit_file(dir: &Path, name: &str, content: &str, msg: &str) -> String {
    let p = dir.join(name);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(&p, content).unwrap();
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-q", "-m", msg]);
    git(dir, &["rev-parse", "HEAD"])
}

struct Fx {
    _tmp: tempfile::TempDir,
    bare: PathBuf,
    a: PathBuf,
    b: PathBuf,
}

/// bare remote with one commit on main; `a` is the pusher; `b` is a plain clone (the project under test).
fn fx() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().canonicalize().unwrap();
    let bare = base.join("remote.git");
    std::fs::create_dir_all(&bare).unwrap();
    git(&bare, &["init", "-q", "--bare", "-b", "main"]);
    let a = base.join("a");
    std::fs::create_dir_all(&a).unwrap();
    git(&a, &["init", "-q", "-b", "main"]);
    git(&a, &["remote", "add", "origin", bare.to_str().unwrap()]);
    commit_file(&a, "readme.txt", "hello\n", "first");
    git(&a, &["push", "-q", "origin", "main"]);
    let b = base.join("b");
    git(&base, &["clone", "-q", bare.to_str().unwrap(), "b"]);
    Fx { _tmp: tmp, bare, a, b }
}

struct FakeLease {
    login: String,
    host: String,
    repo: String,
    scopes: Vec<String>,
    expired: bool,
    cfg: Vec<(String, String)>,
    env: Vec<(String, String)>,
}
impl CredentialLease for FakeLease {
    fn account_login(&self) -> &str { &self.login }
    fn host(&self) -> &str { &self.host }
    fn repo_path(&self) -> &str { &self.repo }
    fn scopes(&self) -> &[String] { &self.scopes }
    fn is_expired(&self) -> bool { self.expired }
    fn git_config(&self) -> Vec<(String, String)> { self.cfg.clone() }
    fn env(&self) -> Vec<(String, String)> { self.env.clone() }
}

#[derive(Default)]
struct FakeLeases {
    scopes: Vec<String>,
    expired: bool,
    cfg: Vec<(String, String)>,
    env: Vec<(String, String)>,
    repo_override: Option<String>,
    calls: AtomicUsize,
}
impl LeaseProvider for FakeLeases {
    fn lease(&self, host: &str, repo_path: &str, _p: LeasePurpose) -> RResult<Box<dyn CredentialLease>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(FakeLease {
            login: "tester".into(),
            host: host.into(),
            repo: self.repo_override.clone().unwrap_or_else(|| repo_path.into()),
            scopes: self.scopes.clone(),
            expired: self.expired,
            cfg: self.cfg.clone(),
            env: self.env.clone(),
        }))
    }
}

struct Buffers(Vec<String>);
impl BufferGuard for Buffers {
    fn unsaved_paths(&self, _: &Path) -> Vec<String> { self.0.clone() }
}
struct Grants(Vec<String>);
impl PublishGrants for Grants {
    fn permits(&self, id: &str, _a: GrantAction, _p: &str) -> bool { self.0.iter().any(|g| g == id) }
}

struct T {
    policy: Policy,
    trust: TrustStore,
    leases: FakeLeases,
    buffers: Buffers,
    grants: Grants,
    net: NetCtx,
}
impl T {
    fn new(root: &Path) -> Self {
        let mut trust = TrustStore::default();
        trust.trust(root.canonicalize().unwrap().to_str().unwrap());
        Self { policy: Policy::for_tests(), trust, leases: FakeLeases::default(), buffers: Buffers(vec![]), grants: Grants(vec!["g1".into()]), net: NetCtx::detached() }
    }
    fn env(&self) -> RemoteEnv<'_> {
        RemoteEnv { policy: &self.policy, trust: Some(&self.trust), leases: &self.leases, buffers: &self.buffers, grants: &self.grants, net: &self.net }
    }
}

fn human() -> Authority { Authority::Human { confirmed: true } }
fn pull_req(root: &Path) -> PullPlanRequest { PullPlanRequest { project_root: root.to_str().unwrap().into(), remote: None } }
fn push_req(root: &Path, branch: &str) -> PushPlanRequest {
    PushPlanRequest { project_root: root.to_str().unwrap().into(), remote: None, local_branch: branch.into(), target_branch: None, set_upstream: false }
}
fn fetch_req(root: &Path) -> FetchRequest { FetchRequest { project_root: root.to_str().unwrap().into(), remote: None } }
fn pull_apply_req(root: &Path, id: &str, a: Authority) -> PullApplyRequest { PullApplyRequest { request: pull_req(root), plan_id: id.into(), authority: a } }
fn push_apply_req(root: &Path, branch: &str, id: &str, a: Authority) -> PushApplyRequest { PushApplyRequest { request: push_req(root, branch), plan_id: id.into(), authority: a } }

fn server<F: Fn(std::net::TcpStream) + Send + Sync + 'static>(f: F) -> u16 {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    let f = Arc::new(f);
    std::thread::spawn(move || {
        for s in l.incoming().flatten() {
            let f = f.clone();
            std::thread::spawn(move || f(s));
        }
    });
    port
}

fn http_401(mut s: std::net::TcpStream) {
    let mut buf = [0u8; 4096];
    let _ = s.read(&mut buf);
    let _ = s.write_all(b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"GitHub\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

fn set_remote(root: &Path, url: &str) {
    git(root, &["remote", "set-url", "origin", url]);
}

fn code<T: std::fmt::Debug>(r: RResult<T>) -> RemoteErrorCode {
    r.expect_err("expected an error").code
}

// ---------------------------------------------------------------- URL, redaction, classification

#[test]
fn url_validation_accepts_only_plain_github_https() {
    let p = Policy::github();
    let ok = validate_remote_url(&p, "https://github.com/Octo-Org/my.repo.git").unwrap();
    assert_eq!(ok.canonical, "https://github.com/Octo-Org/my.repo.git");
    assert_eq!(ok.repo_path(), "Octo-Org/my.repo");
    assert_eq!(validate_remote_url(&p, "https://GitHub.com/o/r/").unwrap().canonical, "https://github.com/o/r.git");
    for bad in [
        "http://github.com/o/r.git",
        "https://github.com.evil.example/o/r.git",
        "https://evil.example/o/r.git",
        "https://user:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/o/r.git",
        "https://x@github.com/o/r.git",
        "https://github.com:444/o/r.git",
        "https://github.com/o/r/extra",
        "https://github.com/o",
        "https://github.com/o/r.git?x=1",
        "https://github.com/o/r#frag",
        "https://github.com/o/..",
        "https://github.com/-o/r",
        "git@github.com:o/r.git",
        "ssh://git@github.com/o/r.git",
        "git://github.com/o/r.git",
        "file:///tmp/x",
        "/tmp/some/dir",
        "https://github.com/o/r .git",
        "",
    ] {
        assert_eq!(code(validate_remote_url(&p, bad)), RemoteErrorCode::UrlRejected, "{bad}");
    }
}

#[test]
fn url_error_never_echoes_a_token() {
    let e = validate_remote_url(&Policy::github(), "https://u:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/o/r.git").unwrap_err();
    assert!(!e.to_json().contains("ghp_"));
}

#[test]
fn redact_strips_userinfo_and_token_shapes() {
    let s = redact("fatal: unable to access 'https://user:pw123@github.com/o/r.git/': 403 token ghp_abcdefghijklmnopqrstuvwxyz1234 and github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz");
    assert!(!s.contains("pw123") && !s.contains("ghp_") && !s.contains("github_pat_"), "{s}");
    assert!(s.contains("https://***@github.com"));
    assert_eq!(redact("plain text with ghp_short"), "plain text with ghp_short");
}

#[test]
fn transport_classification_keeps_scope_sso_protection_auth_apart() {
    use RemoteErrorCode as C;
    let cases = [
        ("remote: Resource protected by organization SAML enforcement. You must grant your OAuth token access", C::SsoRequired),
        ("! [remote rejected] main -> main (refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml` without `workflow` scope)", C::WorkflowScopeMissing),
        ("remote: error: GH006: Protected branch update failed for refs/heads/main.", C::ProtectedBranch),
        ("remote: error: GH013: Repository rule violations found for refs/heads/main.", C::ProtectedBranch),
        ("! [rejected] main -> main (fetch first)", C::NonFastForward),
        ("! [rejected] main -> main (non-fast-forward)", C::NonFastForward),
        ("fatal: Authentication failed for 'https://github.com/o/r.git/'", C::AuthRequired),
        ("fatal: could not read Username for 'https://github.com': terminal prompts disabled", C::AuthRequired),
        ("remote: Permission to o/r.git denied to tester.\nfatal: unable to access 'https://github.com/o/r.git/': The requested URL returned error: 403", C::PermissionDenied),
        ("remote: Repository not found.", C::NotFound),
        ("fatal: unable to access 'https://github.com/': Could not resolve host: github.com", C::Offline),
        ("fatal: unable to access 'x': Failed to connect to github.com port 443: Connection refused", C::Offline),
        ("something odd", C::Unknown),
    ];
    for (text, want) in cases {
        assert_eq!(classify_transport(text), want, "{text}");
    }
}

#[test]
fn job_outcome_mapping() {
    assert_eq!(RemoteError::new(RemoteErrorCode::StalePlan, "x").job_outcome(), JobOutcome::StalePlan);
    assert_eq!(RemoteError::new(RemoteErrorCode::SsoRequired, "x").job_outcome(), JobOutcome::NeedsInput);
    assert_eq!(RemoteError::new(RemoteErrorCode::Offline, "x").job_outcome(), JobOutcome::Failed);
}

#[test]
fn plan_hash_is_stable_and_field_sensitive() {
    assert_eq!(plan_hash("push", &["a", "b"]), plan_hash("push", &["a", "b"]));
    assert_ne!(plan_hash("push", &["a", "b"]), plan_hash("push", &["a", "c"]));
    assert_ne!(plan_hash("push", &["a", "b"]), plan_hash("pull", &["a", "b"]));
    assert_ne!(plan_hash("push", &["ab", ""]), plan_hash("push", &["a", "b"]));
}

// ---------------------------------------------------------------- github_repositories

struct Canned(ApiResponse, std::sync::Mutex<Vec<String>>);
impl ApiTransport for Canned {
    fn get(&self, p: &str) -> RResult<ApiResponse> {
        self.1.lock().unwrap().push(p.to_string());
        Ok(self.0.clone())
    }
}

#[test]
fn repositories_parse_filter_and_recompute_clone_url() {
    let body = serde_json::json!([
        {"id":1,"full_name":"me/site","private":true,"fork":false,"archived":false,"default_branch":"main","description":"A\u{7}b","pushed_at":"2026-10-01T00:00:00Z","permissions":{"push":true},"clone_url":"https://evil.example/x.git"},
        {"id":2,"full_name":"org/other","private":false,"permissions":{"push":false}},
        {"id":3,"full_name":"bad name/zzz"},
    ]);
    let resp = ApiResponse { status: 200, headers: vec![("link".into(), "<https://api.github.com/user/repos?page=2>; rel=\"next\"".into())], body: serde_json::to_vec(&body).unwrap() };
    let api = Canned(resp, Default::default());
    let page = github_repositories(&api, &RepoListRequest { query: None, page: Some(1), per_page: Some(500) }).unwrap();
    assert_eq!(page.repos.len(), 2, "invalid names are dropped");
    assert!(page.has_next);
    assert_eq!(page.repos[0].clone_url, "https://github.com/me/site.git", "never the API's clone_url");
    assert!(page.repos[0].can_push && !page.repos[1].can_push);
    assert_eq!(page.repos[0].description.as_deref(), Some("Ab"));
    assert!(api.1.lock().unwrap()[0].contains("per_page=100"), "per_page clamped");
    let f = github_repositories(&api, &RepoListRequest { query: Some("OTHER".into()), page: None, per_page: None }).unwrap();
    assert_eq!(f.repos.len(), 1);
}

#[test]
fn repositories_errors_are_typed() {
    let mk = |status: u16, h: &[(&str, &str)]| {
        let r = ApiResponse { status, headers: h.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect(), body: b"{}".to_vec() };
        github_repositories(&Canned(r, Default::default()), &RepoListRequest { query: None, page: None, per_page: None }).unwrap_err()
    };
    assert_eq!(mk(401, &[]).code, RemoteErrorCode::AuthRequired);
    let sso = mk(403, &[("x-github-sso", "required; url=https://github.com/orgs/acme/sso?authorization_request=abc")]);
    assert_eq!(sso.code, RemoteErrorCode::SsoRequired);
    assert_eq!(sso.detail.as_deref(), Some("https://github.com/orgs/acme/sso?authorization_request=abc"));
    let evil = mk(403, &[("x-github-sso", "required; url=https://evil.example/x")]);
    assert_eq!(evil.code, RemoteErrorCode::SsoRequired);
    assert!(evil.detail.is_none(), "only github.com SSO links are passed on");
    assert_eq!(mk(403, &[("x-ratelimit-remaining", "0")]).code, RemoteErrorCode::RateLimited);
    assert_eq!(mk(403, &[]).code, RemoteErrorCode::PermissionDenied);
    assert_eq!(mk(404, &[]).code, RemoteErrorCode::NotFound);
    assert_eq!(mk(502, &[]).code, RemoteErrorCode::Offline);
}

// ---------------------------------------------------------------- fetch

#[test]
fn fetch_updates_tracking_refs_only() {
    let f = fx();
    let t = T::new(&f.b);
    let a2 = commit_file(&f.a, "a2.txt", "two\n", "second");
    git(&f.a, &["push", "-q", "origin", "main"]);
    let head_before = git(&f.b, &["rev-parse", "HEAD"]);
    let r = fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    assert_eq!(r.remote, "origin");
    assert_eq!(r.updated.len(), 1);
    assert_eq!(r.updated[0].new.as_deref(), Some(a2.as_str()));
    assert_eq!(git(&f.b, &["rev-parse", "refs/remotes/origin/main"]), a2);
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), head_before, "local branch untouched");
    assert!(!f.b.join("a2.txt").exists(), "worktree untouched");
    let r2 = fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    assert!(r2.updated.is_empty());
}

#[test]
fn fetch_requires_trusted_repo_and_valid_lease() {
    let f = fx();
    let mut t = T::new(&f.b);
    t.trust = TrustStore::default();
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::Blocked);
    let mut t = T::new(&f.b);
    t.leases.expired = true;
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::AuthRequired);
    let mut t = T::new(&f.b);
    t.leases.repo_override = Some("someone/else".into());
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::UrlRejected, "lease must be scoped to this exact repo");
}

#[test]
fn lease_may_only_set_credential_config_and_somnia_env() {
    let f = fx();
    let mut t = T::new(&f.b);
    t.leases.cfg = vec![("core.sshCommand".into(), "evil".into())];
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::UrlRejected);
    let mut t = T::new(&f.b);
    t.leases.env = vec![("GIT_ASKPASS".into(), "evil".into())];
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::UrlRejected);
    let mut t = T::new(&f.b);
    t.leases.cfg = vec![("credential.helper".into(), "!true".into())];
    t.leases.env = vec![("SOMNIA_PIPE".into(), "/tmp/none".into())];
    assert!(fetch(&t.env(), &fetch_req(&f.b)).is_ok());
}

#[test]
fn url_rewrites_and_foreign_hosts_are_rejected() {
    let f = fx();
    let t = T::new(&f.b);
    // pushurl to a foreign host
    git(&f.b, &["config", "remote.origin.pushurl", "https://evil.example/o/r.git"]);
    assert_eq!(code(push_plan(&t.env(), &push_req(&f.b, "main"))), RemoteErrorCode::UrlRejected);
    git(&f.b, &["config", "--unset", "remote.origin.pushurl"]);
    // insteadOf that rewrites the remote to a foreign host
    git(&f.b, &["config", "url.https://evil.example/.insteadOf", f.bare.parent().unwrap().to_str().unwrap()]);
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::UrlRejected);
    // userinfo token in the URL
    git(&f.b, &["config", "--unset-all", "url.https://evil.example/.insteadof"]);
    set_remote(&f.b, "https://u:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/o/r.git");
    let e = fetch(&t.env(), &fetch_req(&f.b)).unwrap_err();
    assert_eq!(e.code, RemoteErrorCode::UrlRejected);
    assert!(!e.to_json().contains("ghp_"));
    // ssh remote
    set_remote(&f.b, "git@github.com:o/r.git");
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::UrlRejected);
}

// ---------------------------------------------------------------- pull

#[test]
fn pull_fast_forward_flow() {
    let f = fx();
    let t = T::new(&f.b);
    let old = git(&f.b, &["rev-parse", "HEAD"]);
    let p0 = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(p0.status, PullStatus::UpToDate);
    let a2 = commit_file(&f.a, "a2.txt", "two\n", "second");
    git(&f.a, &["push", "-q", "origin", "main"]);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(plan.status, PullStatus::FastForward);
    assert_eq!((plan.ahead, plan.behind), (0, 1));
    assert_eq!(plan.target, a2);
    assert_eq!(plan.commits.len(), 1);
    assert_eq!(plan.commits[0].subject, "second");
    assert_eq!(plan.files[0].path, "a2.txt");
    assert!(!f.b.join("a2.txt").exists(), "plan writes nothing");
    let r = pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human())).unwrap();
    assert_eq!((r.old_head.as_str(), r.new_head.as_str()), (old.as_str(), a2.as_str()));
    assert!(f.b.join("a2.txt").exists());
    assert_eq!(git(&f.b, &["rev-parse", &r.safety_ref]), old, "safety ref points at the previous head");
    assert!(git(&f.b, &["status", "--porcelain"]).is_empty());
    assert_eq!(pull_plan(&t.env(), &pull_req(&f.b)).unwrap().status, PullStatus::UpToDate);
}

#[test]
fn pull_apply_needs_the_reviewed_plan_and_authority() {
    let f = fx();
    let t = T::new(&f.b);
    commit_file(&f.a, "a2.txt", "two\n", "second");
    git(&f.a, &["push", "-q", "origin", "main"]);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    // wrong id
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, "deadbeef", human()))), RemoteErrorCode::StalePlan);
    // not confirmed
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, Authority::Human { confirmed: false }))), RemoteErrorCode::ReviewRequired);
    // agent without / with wrong grant
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, Authority::Agent { grant_id: "nope".into() }))), RemoteErrorCode::ReviewRequired);
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, Authority::Agent { grant_id: "".into() }))), RemoteErrorCode::ReviewRequired);
    assert!(!f.b.join("a2.txt").exists());
    // target moves after review -> stale
    commit_file(&f.a, "a3.txt", "three\n", "third");
    git(&f.a, &["push", "-q", "origin", "main"]);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human()))), RemoteErrorCode::StalePlan);
    // an agent with a grant and no unsaved buffers may apply a fresh plan
    let fresh = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert!(pull_apply(&t.env(), &pull_apply_req(&f.b, &fresh.plan_id, Authority::Agent { grant_id: "g1".into() })).is_ok());
}

#[test]
fn pull_unsaved_buffers_block_agents_and_overlapping_files() {
    let f = fx();
    commit_file(&f.a, "a2.txt", "two\n", "second");
    git(&f.a, &["push", "-q", "origin", "main"]);
    let mut t = T::new(&f.b);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    // agent + any unsaved buffer = blocker
    t.buffers = Buffers(vec!["unrelated.txt".into()]);
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, Authority::Agent { grant_id: "g1".into() }))), RemoteErrorCode::UnsavedBuffers);
    // human + overlapping unsaved buffer = blocker
    t.buffers = Buffers(vec!["a2.txt".into()]);
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human()))), RemoteErrorCode::UnsavedBuffers);
    assert!(!f.b.join("a2.txt").exists());
    // human + unrelated unsaved buffer: allowed, reported
    t.buffers = Buffers(vec!["unrelated.txt".into()]);
    let r = pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human())).unwrap();
    assert_eq!(r.unsaved_buffers_elsewhere, vec!["unrelated.txt".to_string()]);
}

#[test]
fn pull_blocks_on_overlapping_local_changes_but_not_unrelated_ones() {
    let f = fx();
    let t = T::new(&f.b);
    commit_file(&f.a, "a2.txt", "two\n", "second");
    git(&f.a, &["push", "-q", "origin", "main"]);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    std::fs::write(f.b.join("a2.txt"), "my own\n").unwrap(); // untracked, collides
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(plan.status, PullStatus::Blocked);
    assert_eq!(plan.blocked_code, Some(RemoteErrorCode::DirtyState));
    assert_eq!(plan.blocked_by_local_changes, vec!["a2.txt".to_string()]);
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human()))), RemoteErrorCode::DirtyState);
    assert_eq!(std::fs::read_to_string(f.b.join("a2.txt")).unwrap(), "my own\n");
    std::fs::remove_file(f.b.join("a2.txt")).unwrap();
    std::fs::write(f.b.join("readme.txt"), "edited locally\n").unwrap(); // unrelated change survives
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(plan.status, PullStatus::FastForward);
    pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human())).unwrap();
    assert_eq!(std::fs::read_to_string(f.b.join("readme.txt")).unwrap(), "edited locally\n");
    assert!(f.b.join("a2.txt").exists());
}

#[test]
fn pull_diverged_and_local_ahead_are_not_applied() {
    let f = fx();
    let t = T::new(&f.b);
    commit_file(&f.b, "mine.txt", "mine\n", "local one");
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(plan.status, PullStatus::LocalAhead, "local is ahead of the last fetched tip");
    commit_file(&f.a, "theirs.txt", "theirs\n", "remote one");
    git(&f.a, &["push", "-q", "origin", "main"]);
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    let plan = pull_plan(&t.env(), &pull_req(&f.b)).unwrap();
    assert_eq!(plan.status, PullStatus::Diverged);
    assert_eq!((plan.ahead, plan.behind), (1, 1));
    assert_eq!(code(pull_apply(&t.env(), &pull_apply_req(&f.b, &plan.plan_id, human()))), RemoteErrorCode::Diverged);
    assert!(!f.b.join("theirs.txt").exists());
}

#[test]
fn pull_without_fetch_asks_for_a_fetch() {
    let f = fx();
    let t = T::new(&f.b);
    git(&f.b, &["update-ref", "-d", "refs/remotes/origin/main"]);
    assert_eq!(code(pull_plan(&t.env(), &pull_req(&f.b))), RemoteErrorCode::NoUpstream);
}

// ---------------------------------------------------------------- push

#[test]
fn push_fast_forward_flow_publishes_the_reviewed_sha() {
    let f = fx();
    let t = T::new(&f.b);
    let sha = commit_file(&f.b, "new.txt", "n\n", "add new");
    std::fs::write(f.b.join("dirty.txt"), "x").unwrap();
    let mut req = push_req(&f.b, "main");
    req.set_upstream = true;
    let plan = push_plan(&t.env(), &req).unwrap();
    assert_eq!(plan.status, PushStatus::Ready);
    assert_eq!(plan.relation, PushRelation::FastForward);
    assert_eq!(plan.local_sha, sha);
    assert_eq!(plan.commits_total, 1);
    assert_eq!(plan.files[0].path, "new.txt");
    assert_eq!(plan.account, "tester");
    assert_eq!(plan.uncommitted_files, 1);
    assert!(plan.warnings.iter().any(|w| w.contains("not saved as a version")));
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), plan.remote_tip.clone().unwrap(), "plan wrote nothing");
    let res = push_apply(&t.env(), &PushApplyRequest { request: req, plan_id: plan.plan_id.clone(), authority: human() }).unwrap();
    assert!(matches!(res.outcome, PushOutcome::Published { verified: true, reconciled: false }), "{:?}", res.outcome);
    assert_eq!(res.job_outcome, JobOutcome::Success);
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), sha);
    assert_eq!(git(&f.b, &["rev-parse", "refs/remotes/origin/main"]), sha, "tracking ref refreshed");
    assert_eq!(git(&f.b, &["rev-parse", "--abbrev-ref", "main@{upstream}"]), "origin/main");
    let again = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(again.status, PushStatus::UpToDate);
    assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &again.plan_id, human()))), RemoteErrorCode::Blocked);
}

#[test]
fn push_creates_a_new_branch_and_never_pushes_tags() {
    let f = fx();
    let t = T::new(&f.b);
    git(&f.b, &["checkout", "-q", "-b", "feature"]);
    let sha = commit_file(&f.b, "f.txt", "f\n", "feature work");
    git(&f.b, &["tag", "v1"]);
    let plan = push_plan(&t.env(), &push_req(&f.b, "feature")).unwrap();
    assert_eq!(plan.relation, PushRelation::Create);
    assert_eq!(plan.remote_tip, None);
    assert_eq!(plan.commits_total, 1);
    let res = push_apply(&t.env(), &push_apply_req(&f.b, "feature", &plan.plan_id, human())).unwrap();
    assert!(matches!(res.outcome, PushOutcome::Published { verified: true, .. }));
    assert_eq!(git(&f.bare, &["rev-parse", "feature"]), sha);
    assert_eq!(git(&f.bare, &["tag"]), "", "tags are not pushed");
}

#[test]
fn push_target_branch_can_differ_and_is_explicit() {
    let f = fx();
    let t = T::new(&f.b);
    let sha = commit_file(&f.b, "x.txt", "x\n", "x");
    let mut req = push_req(&f.b, "main");
    req.target_branch = Some("review/x".into());
    let plan = push_plan(&t.env(), &req).unwrap();
    assert_eq!(plan.target_ref, "refs/heads/review/x");
    push_apply(&t.env(), &PushApplyRequest { request: req, plan_id: plan.plan_id, authority: human() }).unwrap();
    assert_eq!(git(&f.bare, &["rev-parse", "review/x"]), sha);
    assert_ne!(git(&f.bare, &["rev-parse", "main"]), sha);
    for bad in ["-x", "a..b", "HEAD", "somnia/x", "a b", ""] {
        let mut r = push_req(&f.b, "main");
        r.target_branch = Some(bad.into());
        assert!(push_plan(&t.env(), &r).is_err(), "{bad}");
    }
}

#[test]
fn push_non_fast_forward_is_blocked_at_plan_and_apply() {
    let f = fx();
    let t = T::new(&f.b);
    commit_file(&f.b, "mine.txt", "m\n", "mine");
    commit_file(&f.a, "theirs.txt", "t\n", "theirs");
    git(&f.a, &["push", "-q", "origin", "main"]);
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(plan.status, PushStatus::Blocked);
    assert_eq!(plan.relation, PushRelation::NonFastForward);
    assert_eq!(plan.blocked_code, Some(RemoteErrorCode::NonFastForward));
    let remote_before = git(&f.bare, &["rev-parse", "main"]);
    assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human()))), RemoteErrorCode::NonFastForward);
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), remote_before);
    // also after a fetch (remote commit known locally, history diverged)
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(plan.relation, PushRelation::NonFastForward);
}

#[test]
fn push_plan_goes_stale_when_remote_or_local_moves() {
    let f = fx();
    let t = T::new(&f.b);
    commit_file(&f.b, "mine.txt", "m\n", "mine");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    // remote moves
    commit_file(&f.a, "theirs.txt", "t\n", "theirs");
    git(&f.a, &["push", "-q", "origin", "main"]);
    let before = git(&f.bare, &["rev-parse", "main"]);
    assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human()))), RemoteErrorCode::StalePlan);
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), before);
    // local moves after a fresh plan
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    git(&f.b, &["reset", "-q", "--hard", "origin/main"]);
    commit_file(&f.b, "m2.txt", "m\n", "m2");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(plan.status, PushStatus::Ready);
    commit_file(&f.b, "m3.txt", "m\n", "m3");
    assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human()))), RemoteErrorCode::StalePlan);
    // sign-in changes (scopes) also invalidate
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    let mut t2 = T::new(&f.b);
    t2.leases.scopes = vec!["repo".into()];
    assert_eq!(code(push_apply(&t2.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human()))), RemoteErrorCode::StalePlan);
}

#[test]
fn push_apply_needs_human_confirmation_or_a_valid_agent_grant() {
    let f = fx();
    let t = T::new(&f.b);
    let sha = commit_file(&f.b, "mine.txt", "m\n", "mine");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    let remote_before = git(&f.bare, &["rev-parse", "main"]);
    for a in [Authority::Human { confirmed: false }, Authority::Agent { grant_id: "unknown".into() }, Authority::Agent { grant_id: String::new() }] {
        assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, a))), RemoteErrorCode::ReviewRequired);
    }
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), remote_before, "nothing was published");
    let res = push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, Authority::Agent { grant_id: "g1".into() })).unwrap();
    assert!(matches!(res.outcome, PushOutcome::Published { .. }));
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), sha);
}

#[test]
fn push_workflow_files_need_the_workflow_scope() {
    let f = fx();
    commit_file(&f.b, ".github/workflows/ci.yml", "name: ci\n", "add ci");
    let mut t = T::new(&f.b);
    t.leases.scopes = vec!["read:user".into(), "repo".into()];
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert!(plan.touches_workflows);
    assert_eq!(plan.status, PushStatus::Blocked);
    assert_eq!(plan.blocked_code, Some(RemoteErrorCode::WorkflowScopeMissing));
    assert_eq!(RemoteError::new(RemoteErrorCode::WorkflowScopeMissing, "x").job_outcome(), JobOutcome::NeedsInput);
    assert_eq!(code(push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human()))), RemoteErrorCode::WorkflowScopeMissing);
    t.leases.scopes = vec!["repo".into(), "workflow".into()];
    assert_eq!(push_plan(&t.env(), &push_req(&f.b, "main")).unwrap().status, PushStatus::Ready);
    t.leases.scopes = vec![];
    let p = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(p.status, PushStatus::Ready, "unknown scopes do not block; GitHub decides");
    assert!(p.warnings.iter().any(|w| w.contains("GitHub Actions")));
}

#[test]
fn push_without_repo_scope_is_blocked() {
    let f = fx();
    commit_file(&f.b, "x.txt", "x\n", "x");
    let mut t = T::new(&f.b);
    t.leases.scopes = vec!["read:user".into()];
    let p = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    assert_eq!(p.blocked_code, Some(RemoteErrorCode::PermissionDenied));
}

fn install_hook(dir: &Path, name: &str, script: &str) {
    let hooks = dir.join("hooks");
    std::fs::create_dir_all(&hooks).unwrap();
    let p = hooks.join(name);
    std::fs::write(&p, script).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
}

fn rejected_by_server(msg: &str) -> (RemoteErrorCode, String, String) {
    let f = fx();
    let t = T::new(&f.b);
    install_hook(&f.bare, "pre-receive", &format!("#!/bin/sh\necho \"{msg}\" >&2\nexit 1\n"));
    let before = git(&f.bare, &["rev-parse", "main"]);
    commit_file(&f.b, "x.txt", "x\n", "x");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    let res = push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human())).unwrap();
    let after = git(&f.bare, &["rev-parse", "main"]);
    assert_eq!(before, after, "a rejected push changes nothing");
    match res.outcome {
        PushOutcome::Rejected { reason, message } => (reason, message, res.job_outcome.to_owned_str()),
        o => panic!("expected rejection, got {o:?}"),
    }
}

trait Name {
    fn to_owned_str(&self) -> String;
}
impl Name for JobOutcome {
    fn to_owned_str(&self) -> String {
        serde_json::to_string(self).unwrap().trim_matches('"').to_string()
    }
}

#[test]
fn push_rejections_are_typed_protection_sso_workflow() {
    let (r, m, j) = rejected_by_server("remote: error: GH006: Protected branch update failed for refs/heads/main.");
    assert_eq!(r, RemoteErrorCode::ProtectedBranch);
    assert!(m.contains("protected"));
    assert_eq!(j, "failed");
    let (r, _, j) = rejected_by_server("Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.");
    assert_eq!(r, RemoteErrorCode::SsoRequired);
    assert_eq!(j, "needs-input");
    let (r, _, j) = rejected_by_server("refusing to allow an OAuth App to create or update workflow .github/workflows/x.yml without workflow scope");
    assert_eq!(r, RemoteErrorCode::WorkflowScopeMissing);
    assert_eq!(j, "needs-input");
    let (r, _, _) = rejected_by_server("remote: Permission to o/r.git denied to tester.");
    assert_eq!(r, RemoteErrorCode::PermissionDenied);
    let (r, _, _) = rejected_by_server("remote: Invalid username or password.");
    assert_eq!(r, RemoteErrorCode::AuthRequired);
}

// ---------------------------------------------------------------- offline, auth failure, cancel

#[test]
fn offline_remote_is_typed_not_hung() {
    let f = fx();
    let t = T::new(&f.b);
    set_remote(&f.b, "http://127.0.0.1:1/o/r.git");
    commit_file(&f.b, "x.txt", "x\n", "x");
    let start = Instant::now();
    assert_eq!(code(fetch(&t.env(), &fetch_req(&f.b))), RemoteErrorCode::Offline);
    assert_eq!(code(push_plan(&t.env(), &push_req(&f.b, "main"))), RemoteErrorCode::Offline);
    assert!(start.elapsed() < Duration::from_secs(20));
}

#[test]
fn auth_failure_is_typed_and_leaks_nothing() {
    let f = fx();
    let t = T::new(&f.b);
    let port = server(http_401);
    set_remote(&f.b, &format!("http://127.0.0.1:{port}/o/r.git"));
    commit_file(&f.b, "x.txt", "x\n", "x");
    let e = fetch(&t.env(), &fetch_req(&f.b)).unwrap_err();
    assert_eq!(e.code, RemoteErrorCode::AuthRequired);
    assert_eq!(e.job_outcome(), JobOutcome::NeedsInput);
    let e = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap_err();
    assert_eq!(e.code, RemoteErrorCode::AuthRequired);
    let json = e.to_json();
    assert!(!json.contains("ghp_") && !json.contains("password"), "{json}");
}

#[test]
fn cancel_stops_a_hanging_network_call_quickly() {
    let f = fx();
    let t = T::new(&f.b);
    let port = server(|mut s| {
        let mut b = [0u8; 1024];
        let _ = s.read(&mut b);
        std::thread::sleep(Duration::from_secs(60));
    });
    set_remote(&f.b, &format!("http://127.0.0.1:{port}/o/r.git"));
    let ctx = t.net.clone();
    let h = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        ctx.cancel();
    });
    let start = Instant::now();
    let e = fetch(&t.env(), &fetch_req(&f.b)).unwrap_err();
    h.join().unwrap();
    assert_eq!(e.code, RemoteErrorCode::Cancelled);
    assert!(start.elapsed() < Duration::from_secs(10), "{:?}", start.elapsed());
    assert!(RepoLock::acquire(&f.b).is_ok(), "lock released after cancel");
}

#[test]
fn cancel_registry_signals_the_right_job() {
    let reg = CancelRegistry::default();
    let a = reg.register("job-a", None);
    let b = reg.register("job-b", None);
    assert!(reg.cancel("job-a"));
    assert!(a.is_cancelled() && !b.is_cancelled());
    reg.finish("job-a");
    assert!(!reg.cancel("job-a"));
}

#[test]
fn cancelled_push_is_reconciled_as_not_published() {
    let f = fx();
    let mut t = T::new(&f.b);
    commit_file(&f.b, "x.txt", "x\n", "x");
    install_hook(&f.b.join(".git"), "pre-push", "#!/bin/sh\nsleep 30\n");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    let before = git(&f.bare, &["rev-parse", "main"]);
    let net = NetCtx::new(None);
    t.net = net.clone();
    let h = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        net.cancel();
    });
    let start = Instant::now();
    let res = push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human())).unwrap();
    h.join().unwrap();
    assert!(start.elapsed() < Duration::from_secs(15));
    assert!(matches!(res.outcome, PushOutcome::NotPublished { reason: RemoteErrorCode::Cancelled, .. }), "{:?}", res.outcome);
    assert_eq!(res.job_outcome, JobOutcome::Failed);
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), before);
    assert!(res.recovery.contains("Nothing changed"));
}

#[test]
fn interrupted_push_that_did_land_is_reconciled_as_published() {
    let f = fx();
    let mut t = T::new(&f.b);
    let sha = commit_file(&f.b, "x.txt", "x\n", "x");
    // the ref updates, then the server hook keeps the client waiting
    install_hook(&f.bare, "post-receive", "#!/bin/sh\nsleep 30\n");
    let plan = push_plan(&t.env(), &push_req(&f.b, "main")).unwrap();
    let net = NetCtx::new(None);
    t.net = net.clone();
    let h = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        net.cancel();
    });
    let res = push_apply(&t.env(), &push_apply_req(&f.b, "main", &plan.plan_id, human())).unwrap();
    h.join().unwrap();
    assert!(matches!(res.outcome, PushOutcome::Published { verified: true, reconciled: true }), "{:?}", res.outcome);
    assert_eq!(res.job_outcome, JobOutcome::Success);
    assert_eq!(git(&f.bare, &["rev-parse", "main"]), sha);
    assert_eq!(res.remote_tip_after.as_deref(), Some(sha.as_str()));
    assert_eq!(git(&f.b, &["rev-parse", "refs/remotes/origin/main"]), sha, "tracking ref refreshed after reconcile");
}

#[test]
fn push_reconcile_endpoint_reads_the_remote() {
    let f = fx();
    let t = T::new(&f.b);
    let tip = git(&f.bare, &["rev-parse", "main"]);
    let sha = commit_file(&f.b, "x.txt", "x\n", "x");
    let req = |expected: &str, prev: Option<&str>| PushReconcileRequest { request: push_req(&f.b, "main"), expected_sha: expected.into(), previous_remote_tip: prev.map(str::to_string) };
    assert!(matches!(push_reconcile(&t.env(), &req(&sha, Some(&tip))).unwrap(), PushOutcome::NotPublished { .. }));
    assert!(matches!(push_reconcile(&t.env(), &req(&sha, None)).unwrap(), PushOutcome::Uncertain { .. }), "cannot prove unchanged without the previous tip");
    git(&f.b, &["push", "-q", "origin", "main"]);
    assert!(matches!(push_reconcile(&t.env(), &req(&sha, Some(&tip))).unwrap(), PushOutcome::Published { reconciled: true, .. }));
    assert_eq!(code(push_reconcile(&t.env(), &req("zz", None))), RemoteErrorCode::Blocked);
}

#[test]
fn repo_lock_refuses_parallel_operations_without_waiting() {
    let f = fx();
    let l1 = RepoLock::acquire(&f.b).unwrap();
    let e = RepoLock::acquire(&f.b).err().unwrap();
    assert_eq!(e.code, RemoteErrorCode::Blocked);
    drop(l1);
    assert!(RepoLock::acquire(&f.b).is_ok());
}

// ---------------------------------------------------------------- clone

#[test]
fn clone_into_staging_then_move() {
    let f = fx();
    let t = T::new(&f.b);
    let dest = f.b.parent().unwrap().join("cloned");
    let r = clone(&t.env(), &CloneRequest { url: f.bare.to_str().unwrap().into(), destination: dest.to_str().unwrap().into(), branch: None }).unwrap();
    assert_eq!(PathBuf::from(&r.root), dest.canonicalize().unwrap());
    assert_eq!(r.branch.as_deref(), Some("main"));
    assert_eq!(r.remote_url, f.bare.to_str().unwrap());
    assert!(dest.join("readme.txt").exists());
    assert_eq!(git(&dest, &["remote", "get-url", "origin"]), f.bare.to_str().unwrap());
    let leftovers: Vec<_> = std::fs::read_dir(dest.parent().unwrap()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(".somnia-clone-")).collect();
    assert!(leftovers.is_empty());
    // existing non-empty destination is refused; empty one is fine
    assert_eq!(code(clone(&t.env(), &CloneRequest { url: f.bare.to_str().unwrap().into(), destination: dest.to_str().unwrap().into(), branch: None })), RemoteErrorCode::DestinationExists);
    let empty = f.b.parent().unwrap().join("empty-dir");
    std::fs::create_dir(&empty).unwrap();
    assert!(clone(&t.env(), &CloneRequest { url: f.bare.to_str().unwrap().into(), destination: empty.to_str().unwrap().into(), branch: Some("main".into()) }).is_ok());
}

#[test]
fn clone_rejects_bad_inputs_before_touching_disk() {
    let f = fx();
    let t = T::new(&f.b);
    let base = f.b.parent().unwrap();
    let req = |url: &str, dest: PathBuf, branch: Option<&str>| CloneRequest { url: url.into(), destination: dest.to_str().unwrap().into(), branch: branch.map(str::to_string) };
    let ok_url = f.bare.to_str().unwrap();
    assert_eq!(code(clone(&t.env(), &req("https://evil.example/o/r.git", base.join("c1"), None))), RemoteErrorCode::UrlRejected);
    assert_eq!(code(clone(&t.env(), &req(ok_url, PathBuf::from("relative/dir"), None))), RemoteErrorCode::Io);
    assert_eq!(code(clone(&t.env(), &req(ok_url, base.join("no-parent/x"), None))), RemoteErrorCode::Io);
    assert_eq!(code(clone(&t.env(), &req(ok_url, base.join("c2"), Some("--upload-pack=evil")))), RemoteErrorCode::Blocked);
    assert!(!base.join("c1").exists() && !base.join("c2").exists());
}

#[test]
fn clone_failure_and_cancel_remove_only_staging() {
    let f = fx();
    let t = T::new(&f.b);
    let base = f.b.parent().unwrap().to_path_buf();
    let port = server(http_401);
    let url = format!("http://127.0.0.1:{port}/o/r.git");
    let dest = base.join("c3");
    let e = clone(&t.env(), &CloneRequest { url: url.clone(), destination: dest.to_str().unwrap().into(), branch: None }).unwrap_err();
    assert_eq!(e.code, RemoteErrorCode::AuthRequired);
    assert!(!dest.exists());
    // cancel against a hanging server
    let hang = server(|mut s| {
        let mut b = [0u8; 1024];
        let _ = s.read(&mut b);
        std::thread::sleep(Duration::from_secs(60));
    });
    let ctx = t.net.clone();
    let h = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));
        ctx.cancel();
    });
    let e = clone(&t.env(), &CloneRequest { url: format!("http://127.0.0.1:{hang}/o/r.git"), destination: base.join("c4").to_str().unwrap().into(), branch: None }).unwrap_err();
    h.join().unwrap();
    assert_eq!(e.code, RemoteErrorCode::Cancelled);
    assert!(!base.join("c4").exists());
    assert!(std::fs::read_dir(&base).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".somnia-clone-")));
    // a user folder next to it is never touched
    assert!(f.b.exists() && f.a.exists());
}

// ---------------------------------------------------------------- progress

#[test]
fn progress_lines_are_parsed_and_not_kept_as_errors() {
    struct Sink(std::sync::Mutex<Vec<Progress>>);
    impl JobSink for Sink {
        fn progress(&self, p: &Progress) { self.0.lock().unwrap().push(p.clone()); }
    }
    let f = fx();
    for i in 0..30 {
        commit_file(&f.a, &format!("f{i}.txt"), &format!("{i}\n"), &format!("c{i}"));
    }
    git(&f.a, &["push", "-q", "origin", "main"]);
    let sink = Arc::new(Sink(Default::default()));
    let mut t = T::new(&f.b);
    t.net = NetCtx::new(Some(sink.clone()));
    // file transport may or may not print progress; the call must succeed either way
    fetch(&t.env(), &fetch_req(&f.b)).unwrap();
    for p in sink.0.lock().unwrap().iter() {
        assert!(p.percent.map(|v| v <= 100).unwrap_or(true));
    }
}
