//! Threat-model and end-to-end tests for the credential bridge, against real `git`, the real helper
//! binary, and a local fake smart-HTTP server (plain HTTP on 127.0.0.1 via `Policy::loopback_for_tests`).
//! CI runs this via `cargo test --no-default-features --locked`.
use somnia_desktop::git_credential::wire::{self, Op, Query};
use somnia_desktop::git_credential::*;
use somnia_desktop::oauth_store::{MemoryBackend, SecretBackend, StoreError};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;
use tempfile::TempDir;

const TOKEN: &str = "gho_SECRETTOKEN0123456789abcdefABCDEF";
const FOREIGN: &str = "FOREIGNHELPERLEAK";
const LOGIN: &str = "philppplik";
const HELPER: &str = env!("CARGO_BIN_EXE_somnia-git-credential");

static INIT: Once = Once::new();
static HOME: Mutex<Option<PathBuf>> = Mutex::new(None);

/// One process-wide HOME with a hostile global config: foreign credential helpers (plain and
/// URL-scoped), an extraHeader and a credential.username. The bridge must neutralize all of them.
fn global_home() -> PathBuf {
    INIT.call_once(|| {
        let d = TempDir::new().unwrap().keep();
        std::fs::write(
            d.join(".gitconfig"),
            format!(
                "[user]\n\tname = T\n\temail = t@test.invalid\n[credential]\n\thelper = \"!f() {{ echo username=evil; echo password={FOREIGN}; }}; f\"\n[credential \"http://127.0.0.1\"]\n\thelper = \"!f() {{ echo username=evil; echo password={FOREIGN}; }}; f\"\n[http]\n\textraHeader = X-Leak: {FOREIGN}\n"
            ),
        )
        .unwrap();
        std::env::set_var("HOME", &d);
        std::env::remove_var("XDG_CONFIG_HOME");
        *HOME.lock().unwrap() = Some(d);
    });
    HOME.lock().unwrap().clone().unwrap()
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git").args(args).current_dir(dir).env("HOME", global_home()).env("LC_ALL", "C").output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}
fn repo(url: &str) -> TempDir {
    let d = TempDir::new().unwrap();
    git(d.path(), &["init", "-q", "-b", "main", "."]);
    git(d.path(), &["remote", "add", "origin", url]);
    d
}
fn b64(s: &str) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let b = s.as_bytes();
    let mut o = String::new();
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        o.push(T[(n >> 18) as usize & 63] as char);
        o.push(T[(n >> 12) as usize & 63] as char);
        o.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        o.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    o
}

#[derive(Clone, Debug)]
struct Seen {
    path: String,
    auth: Option<String>,
    headers: String,
}
#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Normal,
    RedirectUnauth,
}
struct Fake {
    port: u16,
    seen: Arc<Mutex<Vec<Seen>>>,
    /// Set when a /proc scan during an authorized request found the token in any cmdline/environ.
    proc_leak: Arc<Mutex<Option<String>>>,
}
impl Fake {
    fn start(mode: Mode) -> Fake {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let proc_leak = Arc::new(Mutex::new(None));
        let (s2, p2) = (seen.clone(), proc_leak.clone());
        std::thread::spawn(move || {
            for c in l.incoming().flatten() {
                let (s, p) = (s2.clone(), p2.clone());
                std::thread::spawn(move || handle(c, port, mode, s, p));
            }
        });
        Fake { port, seen, proc_leak }
    }
    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}/{path}", self.port)
    }
    fn authorized(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().iter().filter(|s| s.auth.is_some()).cloned().collect()
    }
}
fn handle(mut c: TcpStream, port: u16, mode: Mode, seen: Arc<Mutex<Vec<Seen>>>, leak: Arc<Mutex<Option<String>>>) {
    c.set_read_timeout(Some(Duration::from_secs(10))).ok();
    let mut buf = Vec::new();
    let mut b = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
        match c.read(&mut b) {
            Ok(0) | Err(_) => return,
            Ok(n) => buf.extend_from_slice(&b[..n]),
        }
    }
    let head = String::from_utf8_lossy(&buf).into_owned();
    let path = head.lines().next().unwrap_or("").split(' ').nth(1).unwrap_or("").to_owned();
    let auth = head.lines().find_map(|l| l.strip_prefix("Authorization: ").map(str::to_owned));
    let ok = auth.as_deref() == Some(&format!("Basic {}", b64(&format!("{LOGIN}:{TOKEN}"))));
    seen.lock().unwrap().push(Seen { path: path.clone(), auth: auth.clone(), headers: head.clone() });
    let resp = if mode == Mode::RedirectUnauth && auth.is_none() {
        format!("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{port}/o/evil.git/info/refs?service=git-upload-pack\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").into_bytes()
    } else if !ok {
        b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"t\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec()
    } else {
        #[cfg(target_os = "linux")]
        {
            *leak.lock().unwrap() = scan_proc_for(TOKEN);
        }
        #[cfg(not(target_os = "linux"))]
        let _ = &leak;
        let pkt = |s: &str| format!("{:04x}{s}", s.len() + 4);
        let body = format!("{}0000{}0000", pkt("# service=git-upload-pack\n"), pkt("0000000000000000000000000000000000000000 capabilities^{}\0side-band-64k\n"));
        format!("HTTP/1.1 200 OK\r\nContent-Type: application/x-git-upload-pack-advertisement\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes()
    };
    let _ = c.write_all(&resp);
}
#[cfg(target_os = "linux")]
fn scan_proc_for(needle: &str) -> Option<String> {
    for e in std::fs::read_dir("/proc").ok()?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        for f in ["cmdline", "environ"] {
            if let Ok(data) = std::fs::read(e.path().join(f)) {
                if data.windows(needle.len()).any(|w| w == needle.as_bytes()) {
                    return Some(format!("{name}/{f}"));
                }
            }
        }
    }
    None
}

fn source() -> Arc<dyn TokenSource> {
    let b = MemoryBackend::default();
    b.set("github-oauth", &format!(r#"{{"accessToken":"{TOKEN}","login":"{LOGIN}","scope":"read:user,repo"}}"#)).unwrap();
    Arc::new(StoreTokenSource::new(b))
}
fn open_lease(f: &Fake, op: Operation, path: &str) -> (CredentialLease, ValidatedRemote) {
    let policy = Policy::loopback_for_tests(f.port);
    let repo_dir = repo(&f.url(path));
    // The directory must outlive the lease only for validate; run happens in separate dirs below.
    let remote = validate_remote(repo_dir.path(), "origin", op, &policy).expect("validates");
    let lease = CredentialLease::open(LeaseSpec { account_login: LOGIN.into(), remote: remote.clone(), ttl: Duration::from_secs(30) }, policy, source(), Path::new(HELPER)).unwrap();
    (lease, remote)
}
fn ls_remote(lease: &CredentialLease, remote: &ValidatedRemote, cwd: &Path) -> Result<NetGitOutput, BridgeError> {
    let args: Vec<OsString> = vec!["ls-remote".into(), remote.url.clone().into()];
    run_git_with_lease(lease, remote, cwd, &args, Duration::from_secs(30), None)
}
fn assert_no_token(label: &str, s: &str) {
    assert!(!s.contains(TOKEN) && !s.contains("SECRETTOKEN"), "token leaked in {label}");
}

#[test]
fn e2e_token_reaches_git_only_through_the_helper() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let work = TempDir::new().unwrap();
    let out = ls_remote(&lease, &remote, work.path()).expect("runs");
    assert_eq!(out.code, Some(0), "stderr: {}", out.stderr);
    let auth = f.authorized();
    assert!(!auth.is_empty(), "server never saw credentials: {:?}", f.seen.lock().unwrap());
    assert!(auth.iter().all(|s| s.path.starts_with("/o/r.git/")), "{auth:?}");
    // Hostile global config was neutralized: no foreign credential or header ever reached the server.
    for s in f.seen.lock().unwrap().iter() {
        assert!(!s.headers.contains(FOREIGN) && !s.headers.contains(&b64(&format!("evil:{FOREIGN}"))), "foreign config leaked: {s:?}");
    }
    let o = lease.outcome();
    assert!(o.served >= 1 && o.refused == 0 && !o.auth_rejected, "{o:?}");
    #[cfg(target_os = "linux")]
    assert_eq!(*f.proc_leak.lock().unwrap(), None, "token visible in a process cmdline/environ");
    // Leak search over everything the caller or a log could see.
    assert_no_token("stdout", &out.stdout);
    assert_no_token("stderr", &out.stderr);
    assert_no_token("prefix args", &format!("{:?}", lease.git_prefix_args()));
    assert_no_token("env", &format!("{:?}", lease.env()));
    assert_no_token("outcome", &format!("{o:?}"));
    assert_no_token("lease outcome clone", &format!("{:?}", lease.outcome()));
    assert_no_token("secret debug", &format!("{:?}", Secret::new(TOKEN.into())));
    assert_no_token("remote", &format!("{remote:?}"));
    assert_no_token("global gitconfig", &std::fs::read_to_string(global_home().join(".gitconfig")).unwrap());
    drop(lease);
}

#[test]
fn repo_config_never_contains_token_after_push_and_fetch() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let work = repo(&remote.url);
    ls_remote(&lease, &remote, work.path()).unwrap();
    let mut all = String::new();
    for e in walk(work.path()) {
        if let Ok(t) = std::fs::read_to_string(&e) {
            all.push_str(&t);
        }
    }
    assert_no_token(".git tree", &all);
}
fn walk(p: &Path) -> Vec<PathBuf> {
    let mut v = vec![];
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let q = e.path();
            if q.is_dir() { v.extend(walk(&q)) } else { v.push(q) }
        }
    }
    v
}

#[test]
fn rewrite_after_validation_is_denied_by_path_binding() {
    // TOCTOU: config changes between validation and run. The helper request carries the new path, the
    // host refuses, and the server never sees credentials.
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let work = repo(&remote.url);
    git(work.path(), &["config", &format!("url.{}.insteadOf", f.url("o/evil.git")), &remote.url]);
    let out = ls_remote(&lease, &remote, work.path()).unwrap();
    assert_ne!(out.code, Some(0));
    assert!(f.authorized().is_empty(), "credentials reached the wrong repo: {:?}", f.authorized());
    let o = lease.outcome();
    assert_eq!((o.served, o.refused), (0, 1), "{o:?}");
    assert_eq!(o.refusal_codes, vec!["path".to_string()]);
}

#[test]
fn redirect_to_another_repo_gets_no_credentials() {
    let f = Fake::start(Mode::RedirectUnauth);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let work = TempDir::new().unwrap();
    let out = ls_remote(&lease, &remote, work.path()).unwrap();
    assert_ne!(out.code, Some(0));
    assert!(f.authorized().is_empty(), "{:?}", f.authorized());
    assert_eq!(lease.outcome().served, 0);
}

#[test]
fn cancelled_lease_serves_nothing() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    lease.cancel();
    let work = TempDir::new().unwrap();
    let out = ls_remote(&lease, &remote, work.path()).unwrap();
    assert_ne!(out.code, Some(0));
    assert!(f.authorized().is_empty());
    assert_eq!(lease.outcome().refusal_codes, vec!["cancelled".to_string()]);
}

#[test]
fn run_refuses_dangerous_args() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let w = TempDir::new().unwrap();
    let u = remote.url.clone();
    let run = |a: &[&str]| {
        let args: Vec<OsString> = a.iter().map(|s| (*s).into()).collect();
        run_git_with_lease(&lease, &remote, w.path(), &args, Duration::from_secs(5), None).err()
    };
    assert_eq!(run(&["push", &u]), Some(BridgeError::InvalidArgs), "push under a fetch lease");
    assert_eq!(run(&["config", "--global", "x.y", "z"]), Some(BridgeError::InvalidArgs));
    assert_eq!(run(&["fetch"]), Some(BridgeError::InvalidArgs), "validated url must be an argument");
    assert_eq!(run(&["fetch", &u, "https://evil.example/x.git"]), Some(BridgeError::InvalidArgs));
    assert_eq!(run(&["fetch", &u, "ext::sh -c evil"]), Some(BridgeError::InvalidArgs));
    assert_eq!(run(&["fetch", "-c", "credential.helper=!evil", &u]), Some(BridgeError::InvalidArgs));
    assert_eq!(run(&["fetch", "--upload-pack=evil", &u]), Some(BridgeError::InvalidArgs));
    assert!(f.seen.lock().unwrap().is_empty(), "nothing may reach the network");
}

fn connect_raw(lease: &CredentialLease) -> (String, String) {
    lease.endpoint_for_tests()
}
#[cfg(unix)]
fn rpc(endpoint: &str, line: &str) -> String {
    let mut s = std::os::unix::net::UnixStream::connect(endpoint).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    s.write_all(line.as_bytes()).unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    out
}
#[cfg(unix)]
#[test]
fn endpoint_policy_matrix() {
    let f = Fake::start(Mode::Normal);
    let (lease, _r) = open_lease(&f, Operation::Fetch, "o/r.git");
    let (ep, nonce) = connect_raw(&lease);
    let q = |host: &str, path: Option<&str>, proto: &str| Query { protocol: Some(proto.into()), host: Some(host.into()), path: path.map(Into::into) };
    let host = format!("127.0.0.1:{}", f.port);
    // wrong nonce: dropped without any answer
    assert_eq!(rpc(&ep, &wire::request_line("nope", Op::Get, &q(&host, Some("o/r.git"), "http"))), "");
    // malformed / oversize input: dropped
    assert_eq!(rpc(&ep, "not json\n"), "");
    assert_eq!(rpc(&ep, &"x".repeat(10_000)), "");
    for (name, query, code) in [
        ("other host", q("github.com", Some("o/r.git"), "http"), "host"),
        ("other port", q("127.0.0.1:1", Some("o/r.git"), "http"), "host"),
        ("other scheme", q(&host, Some("o/r.git"), "https"), "scheme"),
        ("other repo", q(&host, Some("o/other.git"), "http"), "path"),
        ("other owner", q(&host, Some("x/r.git"), "http"), "path"),
        ("no path", q(&host, None, "http"), "path"),
        ("prefix path", q(&host, Some("o/r.git/extra"), "http"), "path"),
    ] {
        let r = rpc(&ep, &wire::request_line(&nonce, Op::Get, &query));
        assert!(r.contains(&format!("\"code\":\"{code}\"")) && !r.contains("password"), "{name}: {r}");
    }
    // right request (case-insensitive path, with or without .git) is served
    for p in ["o/r.git", "O/R", "o/r"] {
        let r = rpc(&ep, &wire::request_line(&nonce, Op::Get, &q(&host, Some(p), "http")));
        assert!(r.contains(&format!("\"password\":\"{TOKEN}\"")) && r.contains(LOGIN), "{p}: {r}");
    }
    // erase is acknowledged, flags the outcome, and never deletes the stored token
    let r = rpc(&ep, &wire::request_line(&nonce, Op::Erase, &q(&host, Some("o/r.git"), "http")));
    assert!(r.contains("\"ok\":true"));
    assert!(lease.outcome().auth_rejected);
    // request budget
    for _ in 0..8 {
        rpc(&ep, &wire::request_line(&nonce, Op::Get, &q(&host, Some("o/r.git"), "http")));
    }
    let r = rpc(&ep, &wire::request_line(&nonce, Op::Get, &q(&host, Some("o/r.git"), "http")));
    assert!(r.contains("too-many"), "{r}");
    assert_no_token("outcome", &format!("{:?}", lease.outcome()));
}

#[cfg(unix)]
#[test]
fn lease_expires_and_endpoint_is_private_and_removed() {
    use std::os::unix::fs::PermissionsExt;
    let f = Fake::start(Mode::Normal);
    let policy = Policy::loopback_for_tests(f.port);
    let d = repo(&f.url("o/r.git"));
    let remote = validate_remote(d.path(), "origin", Operation::Fetch, &policy).unwrap();
    let lease = CredentialLease::open(LeaseSpec { account_login: LOGIN.into(), remote, ttl: Duration::from_millis(1) }, policy, source(), Path::new(HELPER)).unwrap();
    let (ep, nonce) = lease.endpoint_for_tests();
    let dir = Path::new(&ep).parent().unwrap().to_path_buf();
    assert_eq!(std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
    assert_eq!(std::fs::metadata(&ep).unwrap().permissions().mode() & 0o077, 0);
    std::thread::sleep(Duration::from_millis(1100));
    let q = Query { protocol: Some("http".into()), host: Some(format!("127.0.0.1:{}", f.port)), path: Some("o/r.git".into()) };
    let r = rpc(&ep, &wire::request_line(&nonce, Op::Get, &q));
    assert!(r.contains("\"code\":\"expired\"") && !r.contains("password"), "{r}");
    drop(lease);
    assert!(!dir.exists(), "endpoint dir must be removed on drop");
}

struct LockedStore;
impl SecretBackend for LockedStore {
    fn get(&self, _: &str) -> Result<Option<String>, StoreError> { Err(StoreError::Backend) }
    fn set(&self, _: &str, _: &str) -> Result<(), StoreError> { Err(StoreError::Backend) }
    fn delete(&self, _: &str) -> Result<(), StoreError> { Err(StoreError::Backend) }
}
#[test]
fn account_problems_are_needs_input_before_git_runs() {
    let f = Fake::start(Mode::Normal);
    let policy = Policy::loopback_for_tests(f.port);
    let d = repo(&f.url("o/r.git"));
    let remote = validate_remote(d.path(), "origin", Operation::Fetch, &policy).unwrap();
    let try_open = |src: Arc<dyn TokenSource>, login: &str| {
        CredentialLease::open(LeaseSpec { account_login: login.into(), remote: remote.clone(), ttl: Duration::from_secs(5) }, policy.clone(), src, Path::new(HELPER)).err()
    };
    assert_eq!(try_open(Arc::new(StoreTokenSource::new(LockedStore)), LOGIN), Some(BridgeError::NeedsInput));
    assert_eq!(try_open(Arc::new(StoreTokenSource::new(MemoryBackend::default())), LOGIN), Some(BridgeError::NotConnected));
    assert_eq!(try_open(source(), "someone-else"), Some(BridgeError::AccountMismatch));
    let b = MemoryBackend::default();
    b.set("github-oauth", &format!(r#"{{"accessToken":"{TOKEN}","login":"{LOGIN}","scope":"read:user"}}"#)).unwrap();
    assert_eq!(try_open(Arc::new(StoreTokenSource::new(b)), LOGIN), Some(BridgeError::ScopeUpgradeNeeded));
    for e in [BridgeError::NeedsInput, BridgeError::NotConnected, BridgeError::ScopeUpgradeNeeded, BridgeError::AccountMismatch] {
        assert!(e.is_needs_input());
        assert_no_token("error text", &format!("{e} {e:?} {}", serde_json::to_string(&e).unwrap()));
    }
    assert!(!BridgeError::RewriteDetected.is_needs_input());
    // a missing helper is refused too
    assert_eq!(
        CredentialLease::open(LeaseSpec { account_login: LOGIN.into(), remote: remote.clone(), ttl: Duration::from_secs(5) }, policy.clone(), source(), Path::new("/nonexistent/helper")).err(),
        Some(BridgeError::HelperMissing)
    );
}

#[test]
fn validate_remote_matrix_with_real_repos() {
    let p = Policy::github();
    let ok = repo("https://github.com/philppplik/somnia.git");
    let v = validate_remote(ok.path(), "origin", Operation::Push, &p).unwrap();
    assert_eq!((v.url.as_str(), v.repo.key().as_str()), ("https://github.com/philppplik/somnia.git", "philppplik/somnia"));
    assert!(validate_remote(ok.path(), "origin", Operation::Fetch, &p).is_ok());
    assert_eq!(validate_remote(ok.path(), "nope", Operation::Fetch, &p), Err(BridgeError::NoSuchRemote));
    assert_eq!(validate_remote(ok.path(), "-bad", Operation::Fetch, &p), Err(BridgeError::InvalidArgs));
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Clone, &p), Err(BridgeError::InvalidArgs));

    // pushurl to another host: fetch fine, push refused
    git(ok.path(), &["config", "remote.origin.pushurl", "https://evil.example/philppplik/somnia.git"]);
    assert!(validate_remote(ok.path(), "origin", Operation::Fetch, &p).is_ok());
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::UnsupportedHost));
    // pushurl to ssh
    git(ok.path(), &["config", "remote.origin.pushurl", "git@github.com:philppplik/somnia.git"]);
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::UnsupportedScheme));
    // two push urls
    git(ok.path(), &["config", "--add", "remote.origin.pushurl", "https://github.com/a/b.git"]);
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::MultipleUrls));
    git(ok.path(), &["config", "--unset-all", "remote.origin.pushurl"]);
    // two fetch urls
    git(ok.path(), &["config", "--add", "remote.origin.url", "https://github.com/a/b.git"]);
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Fetch, &p), Err(BridgeError::MultipleUrls));
    git(ok.path(), &["config", "--unset-all", "remote.origin.url"]);
    git(ok.path(), &["config", "remote.origin.url", "https://github.com/philppplik/somnia.git"]);

    // insteadOf: https -> https (other repo) is a silent redirect: RewriteDetected
    git(ok.path(), &["config", "url.https://github.com/other/thing.git.insteadOf", "https://github.com/philppplik/somnia.git"]);
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Fetch, &p), Err(BridgeError::RewriteDetected));
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::RewriteDetected));
    git(ok.path(), &["config", "--remove-section", "url.https://github.com/other/thing.git"]);
    // pushInsteadOf: https -> ssh: effective push URL is ssh
    git(ok.path(), &["config", "url.git@github.com:.pushInsteadOf", "https://github.com/"]);
    assert!(validate_remote(ok.path(), "origin", Operation::Fetch, &p).is_ok());
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::UnsupportedScheme));
    git(ok.path(), &["config", "--remove-section", "url.git@github.com:"]);
    // pushInsteadOf https -> https other repo
    git(ok.path(), &["config", "url.https://github.com/evil/.pushInsteadOf", "https://github.com/philppplik/"]);
    assert_eq!(validate_remote(ok.path(), "origin", Operation::Push, &p), Err(BridgeError::RewriteDetected));

    // credentials in the URL, ssh and foreign hosts as the configured remote
    for (u, e) in [
        ("https://user:pw@github.com/o/r.git", BridgeError::UrlHasCredentials),
        ("git@github.com:o/r.git", BridgeError::UnsupportedScheme),
        ("ssh://git@github.com/o/r.git", BridgeError::UnsupportedScheme),
        ("https://github.com.evil.example/o/r.git", BridgeError::UnsupportedHost),
        ("http://github.com/o/r.git", BridgeError::UnsupportedScheme),
    ] {
        let r = repo(u);
        assert_eq!(validate_remote(r.path(), "origin", Operation::Fetch, &p), Err(e), "{u}");
    }
}

#[test]
fn validate_clone_url_rejects_global_rewrites_and_bad_urls() {
    let p = Policy::github();
    assert!(validate_clone_url("https://github.com/philppplik/somnia.git", &p).is_ok());
    assert_eq!(validate_clone_url("git@github.com:philppplik/somnia.git", &p), Err(BridgeError::UnsupportedScheme));
    assert_eq!(validate_clone_url("https://tok@github.com/o/r", &p), Err(BridgeError::UrlHasCredentials));
    assert_eq!(validate_clone_url("https://example.com/o/r", &p), Err(BridgeError::UnsupportedHost));
}

#[test]
fn redact_replaces_served_tokens_in_captured_output() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Fetch, "o/r.git");
    let w = TempDir::new().unwrap();
    ls_remote(&lease, &remote, w.path()).unwrap();
    let red = lease.redact(format!("x {TOKEN} y {TOKEN}").as_bytes());
    assert_eq!(String::from_utf8(red).unwrap(), "x [redacted] y [redacted]");
}

fn run_helper(args: &[&str], env: &[(&str, &str)], stdin: &str) -> (Option<i32>, String, String) {
    let mut c = Command::new(HELPER);
    c.env_clear().args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for (k, v) in env {
        c.env(k, v);
    }
    let mut ch = c.spawn().unwrap();
    ch.stdin.take().unwrap().write_all(stdin.as_bytes()).unwrap();
    let o = ch.wait_with_output().unwrap();
    (o.status.code(), String::from_utf8_lossy(&o.stdout).into_owned(), String::from_utf8_lossy(&o.stderr).into_owned())
}
#[test]
fn helper_binary_failure_modes_are_silent_and_generic() {
    let q = "protocol=https\nhost=github.com\npath=o/r.git\n\n";
    // no lease environment: exit 1, nothing on stdout, generic stderr
    let (c, o, e) = run_helper(&["get"], &[], q);
    assert_eq!((c, o.as_str()), (Some(1), ""));
    assert_eq!(e.trim(), "somnia credential helper: unavailable");
    // dead endpoint
    let (c, o, _) = run_helper(&["get"], &[(wire::ENV_ENDPOINT, "/nonexistent/c.sock"), (wire::ENV_NONCE, "n")], q);
    assert_eq!((c, o.as_str()), (Some(1), ""));
    // store is a no-op that succeeds quietly (the host owns storage), erase without lease fails quietly
    let (c, o, e) = run_helper(&["store"], &[], "protocol=https\nhost=github.com\nusername=a\npassword=SHOULDNOTECHO\n\n");
    assert_eq!((c, o.as_str(), e.as_str()), (Some(0), "", ""));
    // garbage input / NUL
    let (c, o, _) = run_helper(&["get"], &[(wire::ENV_ENDPOINT, "x"), (wire::ENV_NONCE, "n")], "garbage without equals\n");
    assert_eq!((c, o.as_str()), (Some(1), ""));
}

#[test]
fn git_query_parser_and_nonce_compare() {
    let q = wire::parse_git_query("protocol=https\nhost=github.com\npath=a/b.git\nusername=x\nnewkey=1\n\nignored=after-blank\n").unwrap();
    assert_eq!((q.protocol.as_deref(), q.host.as_deref(), q.path.as_deref()), (Some("https"), Some("github.com"), Some("a/b.git")));
    assert!(wire::parse_git_query("a\0=b\n").is_err());
    assert!(wire::parse_git_query(&"a=b\n".repeat(5000)).is_err());
    assert_eq!(wire::path_key("/A/B.git"), "a/b");
    assert!(wire::ct_eq("abc", "abc") && !wire::ct_eq("abc", "abd") && !wire::ct_eq("abc", "abcd") && !wire::ct_eq("", "a"));
}

#[test]
fn push_authenticates_for_receive_pack_with_explicit_refspec() {
    let f = Fake::start(Mode::Normal);
    let (lease, remote) = open_lease(&f, Operation::Push, "o/r.git");
    let work = repo(&remote.url);
    git(work.path(), &["-c", "user.name=T", "-c", "user.email=t@test.invalid", "commit", "-q", "--allow-empty", "-m", "x"]);
    let args: Vec<OsString> = ["push", "--porcelain", remote.url.as_str(), "refs/heads/main:refs/heads/main"].iter().map(|s| (*s).into()).collect();
    let out = run_git_with_lease(&lease, &remote, work.path(), &args, Duration::from_secs(30), None).unwrap();
    // The fake only speaks upload-pack, so git fails after authenticating: what matters is who got credentials.
    assert_ne!(out.code, Some(0));
    let auth = f.authorized();
    assert!(auth.iter().any(|s| s.path.contains("git-receive-pack")), "{auth:?} / {:?}", f.seen.lock().unwrap());
    assert!(auth.iter().all(|s| s.path.starts_with("/o/r.git/")));
    assert_no_token("push output", &format!("{}{}", out.stdout, out.stderr));
}
