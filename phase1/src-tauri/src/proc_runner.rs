//! Fixed executable runner: no shell, no inherited credentials, bounded redacted logs.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};
pub const LOG_LIMIT: usize = 5 * 1024 * 1024;
const LINE_LIMIT: usize = 16 * 1024;
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RunKind {
    Install,
    Dev,
    Build,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerHandle {
    pub id: String,
    pub project_id: String,
    pub kind: RunKind,
    pub state: String,
    pub port: Option<u16>,
    pub preview_token: Option<String>,
    pub url: Option<String>,
    pub exit_code: Option<i32>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub sequence: u64,
    pub stream: String,
    pub text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogReply {
    pub lines: Vec<LogLine>,
    pub next_sequence: u64,
    pub truncated: bool,
}
struct Run {
    handle: RunnerHandle,
    root: PathBuf,
    logs: Vec<LogLine>,
    bytes: usize,
    sequence: u64,
    truncated: bool,
    cancel: Arc<AtomicBool>,
}
#[derive(Default, Clone)]
pub struct ProcessRunner {
    runs: Arc<Mutex<BTreeMap<String, Arc<Mutex<Run>>>>>,
}
#[derive(Clone)]
pub struct Redactor {
    secrets: Vec<String>,
}
impl Redactor {
    pub fn new(secrets: Vec<String>) -> Self {
        let mut secrets: Vec<_> = secrets.into_iter().filter(|s| s.len() >= 4).collect();
        secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
        Self { secrets }
    }
    pub fn redact(&self, line: &str) -> String {
        let mut text = line.to_string();
        for secret in &self.secrets {
            text = text.replace(secret, "[redacted]");
        }
        static PATTERN: OnceLock<regex::Regex> = OnceLock::new();
        let pattern = PATTERN.get_or_init(|| regex::Regex::new(r"(?i)(?:bearer\s+[^\s]+|(?:password|passwd|token|secret|api[_-]?key|authorization|private[_-]?key)\s*[:=]\s*[^\s,;]+|(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]{12,})|(?:https?://)[^\s/@]+:[^\s/@]+@)").unwrap());
        text = pattern.replace_all(&text, "[redacted]").into_owned();
        text.chars()
            .filter(|c| !c.is_control() || *c == '\t')
            .collect()
    }
}
pub fn safe_environment(node: &Path) -> Vec<(String, String)> {
    let mut environment = Vec::new();
    // Allowlist rather than a denylist: all SOMNIA_*, SSH_*, cloud, proxy and auth env stays out.
    for key in [
        "SystemRoot",
        "WINDIR",
        "COMSPEC",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "NUMBER_OF_PROCESSORS",
    ] {
        if let Ok(value) = std::env::var(key) {
            environment.push((key.into(), value));
        }
    }
    environment.push((
        "PATH".into(),
        node.parent()
            .unwrap_or(Path::new("."))
            .to_string_lossy()
            .into_owned(),
    ));
    environment.push(("NO_COLOR".into(), "1".into()));
    environment
}
fn inherited_secrets() -> Vec<String> {
    std::env::vars()
        .filter(|(k, _)| {
            let k = k.to_ascii_uppercase();
            [
                "TOKEN", "SECRET", "PASSWORD", "KEY", "AUTH", "COOKIE", "PROXY",
            ]
            .iter()
            .any(|s| k.contains(s))
        })
        .map(|(_, v)| v)
        .collect()
}
#[derive(Deserialize)]
struct Template {
    framework: String,
}
fn fixed_args(
    project: &Path,
    npm: &Path,
    kind: RunKind,
    port: Option<u16>,
) -> Result<Vec<String>, String> {
    if !project.join("somnia.template.json").is_file() {
        return Err("frameworks.templateMissing".into());
    }
    if kind == RunKind::Install {
        if !project.join("package-lock.json").is_file() {
            return Err("frameworks.lockfileMissing".into());
        }
        return Ok(vec![
            npm.to_string_lossy().into_owned(),
            "ci".into(),
            "--ignore-scripts".into(),
            "--no-audit".into(),
            "--no-fund".into(),
            "--userconfig".into(),
            String::new(),
        ]);
    }
    if kind == RunKind::Dev && !project.join("somnia-preview.mjs").is_file() {
        return Err("frameworks.pluginMissing".into());
    }
    let bytes = std::fs::read(project.join("somnia.template.json"))
        .map_err(|_| "frameworks.templateMissing")?;
    if bytes.len() > 64 * 1024 {
        return Err("frameworks.templateMissing".into());
    }
    let template: Template =
        serde_json::from_slice(&bytes).map_err(|_| "frameworks.templateMissing")?;
    let executable = match template.framework.as_str() {
        "react" | "vue" | "svelte" | "solid" | "preact" | "vanilla" | "vanilla-ts" | "vite" => {
            "vite/bin/vite.js"
        }
        "astro" => "astro/astro.js",
        "next" => "next/dist/bin/next",
        "sveltekit" => "vite/bin/vite.js",
        "nuxt" => "nuxt/bin/nuxt.mjs",
        _ => return Err("frameworks.unsupportedProject".into()),
    };
    let executable = project
        .join("node_modules")
        .join(executable)
        .canonicalize()
        .map_err(|_| "frameworks.packagesMissing")?;
    if !executable.starts_with(project) {
        return Err("frameworks.unsafePath".into());
    }
    let mut args = vec![executable.to_string_lossy().into_owned()];
    if kind == RunKind::Build {
        args.push("build".into());
    } else {
        let port = port.ok_or("frameworks.startFailed")?;
        match template.framework.as_str() {
            "next" => args.extend([
                "dev".into(),
                "--hostname".into(),
                "127.0.0.1".into(),
                "--port".into(),
                port.to_string(),
            ]),
            "astro" | "nuxt" => args.extend([
                "dev".into(),
                "--host".into(),
                "127.0.0.1".into(),
                "--port".into(),
                port.to_string(),
            ]),
            _ => args.extend([
                "--host".into(),
                "127.0.0.1".into(),
                "--port".into(),
                port.to_string(),
                "--strictPort".into(),
            ]),
        }
    }
    Ok(args)
}
impl ProcessRunner {
    pub fn start(
        &self,
        base: &Path,
        project: &Path,
        project_id: String,
        kind: RunKind,
        parent_origin: String,
    ) -> Result<RunnerHandle, String> {
        let root = project
            .canonicalize()
            .map_err(|_| "frameworks.unsafePath")?;
        let (node, npm) = crate::runtime::paths(base)?;
        let mut runs = self.runs.lock().map_err(|_| "frameworks.busy")?;
        let mut active = 0;
        for run in runs.values() {
            let run = run.lock().map_err(|_| "frameworks.busy")?;
            if matches!(run.handle.state.as_str(), "running" | "starting") {
                active += 1;
                if run.root == root {
                    return Err("frameworks.alreadyRunning".into());
                }
            }
        }
        if active >= 2 {
            return Err("frameworks.limitReached".into());
        }
        // Bound retained completed runs too. Current active handles are never evicted.
        if runs.len() >= 32 {
            let finished = runs
                .iter()
                .find(|(_, r)| {
                    r.lock()
                        .map(|r| !matches!(r.handle.state.as_str(), "running" | "starting"))
                        .unwrap_or(false)
                })
                .map(|(id, _)| id.clone());
            if let Some(id) = finished {
                runs.remove(&id);
            }
        }
        let port = if kind == RunKind::Dev {
            Some(
                std::net::TcpListener::bind(("127.0.0.1", 0))
                    .and_then(|l| l.local_addr())
                    .map_err(|_| "frameworks.startFailed")?
                    .port(),
            )
        } else {
            None
        };
        let token = port.map(|_| {
            format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            )
        });
        let mut args = fixed_args(&root, &npm, kind, port)?;
        let isolated = base
            .join("framework-runs")
            .join(uuid::Uuid::new_v4().to_string());
        if isolated
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("frameworks.unsafePath".into());
        }
        std::fs::create_dir_all(&isolated).map_err(|_| "frameworks.startFailed")?;
        std::fs::write(
            isolated.join("empty.npmrc"),
            b"ignore-scripts=true\naudit=false\nfund=false\n",
        )
        .map_err(|_| "frameworks.startFailed")?;
        if kind == RunKind::Install {
            if let Some(arg) = args.last_mut() {
                *arg = isolated.join("empty.npmrc").to_string_lossy().into_owned();
            }
        }
        std::fs::write(isolated.join("global.npmrc"), b"ignore-scripts=true\n")
            .map_err(|_| "frameworks.startFailed")?;
        let cleanup = isolated.clone();
        let mut env = safe_environment(&node);
        env.extend([
            ("HOME".into(), isolated.to_string_lossy().into_owned()),
            (
                "USERPROFILE".into(),
                isolated.to_string_lossy().into_owned(),
            ),
            (
                "npm_config_cache".into(),
                base.join("framework-cache").to_string_lossy().into_owned(),
            ),
            ("npm_config_ignore_scripts".into(), "true".into()),
            (
                "npm_config_globalconfig".into(),
                isolated.join("global.npmrc").to_string_lossy().into_owned(),
            ),
        ]);
        if let (Some(port), Some(token)) = (port, &token) {
            env.extend([
                ("SOMNIA_PREVIEW_PORT".into(), port.to_string()),
                ("SOMNIA_PREVIEW_TOKEN".into(), token.clone()),
                ("SOMNIA_PARENT_ORIGIN".into(), parent_origin),
            ]);
        }
        let mut command = Command::new(node);
        command
            .args(args)
            .current_dir(&root)
            .env_clear()
            .envs(env)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| "frameworks.startFailed")?;
        #[cfg(windows)]
        let job = match WindowsJob::attach(&child) {
            Ok(job) => job,
            Err(error) => {
                kill_tree(&mut child);
                return Err(error);
            }
        };
        let stdout = child.stdout.take().ok_or("frameworks.startFailed")?;
        let stderr = child.stderr.take().ok_or("frameworks.startFailed")?;
        let handle = RunnerHandle {
            id: uuid::Uuid::new_v4().to_string(),
            project_id,
            kind,
            state: if kind == RunKind::Dev {
                "starting"
            } else {
                "running"
            }
            .into(),
            port,
            preview_token: token.clone(),
            url: port.map(|p| {
                format!(
                    "http://127.0.0.1:{p}/?somnia-preview-token={}",
                    token.as_deref().unwrap_or("")
                )
            }),
            exit_code: None,
        };
        let cancel = Arc::new(AtomicBool::new(false));
        let run = Arc::new(Mutex::new(Run {
            handle: handle.clone(),
            root,
            logs: Vec::new(),
            bytes: 0,
            sequence: 0,
            truncated: false,
            cancel: cancel.clone(),
        }));
        let mut secrets = inherited_secrets();
        if let Some(token) = token {
            secrets.push(token);
        }
        let redactor = Redactor::new(secrets);
        capture(stdout, "stdout", run.clone(), redactor.clone());
        capture(stderr, "stderr", run.clone(), redactor);
        let monitor = run.clone();
        if let Some(port) = port {
            let ready = run.clone();
            let token = handle.preview_token.clone().unwrap_or_default();
            thread::spawn(move || {
                let start = Instant::now();
                loop {
                    if ready
                        .lock()
                        .map(|r| r.handle.state != "starting")
                        .unwrap_or(true)
                    {
                        break;
                    }
                    if start.elapsed() > Duration::from_secs(60) {
                        if let Ok(r) = ready.lock() {
                            r.cancel.store(true, Ordering::Relaxed);
                        }
                        break;
                    }
                    if loopback_ready(port, &token) {
                        if let Ok(mut r) = ready.lock() {
                            if r.handle.state == "starting" {
                                r.handle.state = "running".into();
                            }
                        }
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            });
        }

        thread::spawn(move || {
            let timeout = match kind {
                RunKind::Install => Some(Duration::from_secs(600)),
                RunKind::Build => Some(Duration::from_secs(300)),
                RunKind::Dev => None,
            };
            monitor_child(&mut child, &monitor, &cancel, timeout);
            #[cfg(windows)]
            drop(job);
            let _ = std::fs::remove_dir_all(cleanup);
        });
        runs.insert(handle.id.clone(), run);
        Ok(handle)
    }
    fn get(&self, id: &str) -> Result<Arc<Mutex<Run>>, String> {
        self.runs
            .lock()
            .map_err(|_| "frameworks.busy")?
            .get(id)
            .cloned()
            .ok_or("frameworks.runMissing".into())
    }
    pub fn root(&self, id: &str) -> Result<PathBuf, String> {
        Ok(self
            .get(id)?
            .lock()
            .map_err(|_| "frameworks.busy")?
            .root
            .clone())
    }
    pub fn status(&self, id: &str) -> Result<RunnerHandle, String> {
        Ok(self
            .get(id)?
            .lock()
            .map_err(|_| "frameworks.busy")?
            .handle
            .clone())
    }
    pub fn logs(&self, id: &str, after: u64) -> Result<LogReply, String> {
        let run = self.get(id)?;
        let r = run.lock().map_err(|_| "frameworks.busy")?;
        let lines = r
            .logs
            .iter()
            .filter(|l| l.sequence > after)
            .take(256)
            .cloned()
            .collect::<Vec<_>>();
        let next_sequence = lines.last().map(|l| l.sequence).unwrap_or(after);
        Ok(LogReply {
            lines,
            next_sequence,
            truncated: r.truncated,
        })
    }
    pub fn stop(&self, id: &str) -> Result<(), String> {
        self.get(id)?
            .lock()
            .map_err(|_| "frameworks.busy")?
            .cancel
            .store(true, Ordering::Relaxed);
        Ok(())
    }
    pub fn stop_root(&self, root: &Path) {
        if let Ok(runs) = self.runs.lock() {
            for run in runs.values() {
                if let Ok(r) = run.lock() {
                    if r.root == root {
                        r.cancel.store(true, Ordering::Relaxed);
                    }
                }
            }
        }
    }
    pub fn stop_all(&self) {
        if let Ok(runs) = self.runs.lock() {
            for run in runs.values() {
                if let Ok(r) = run.lock() {
                    r.cancel.store(true, Ordering::Relaxed);
                }
            }
        }
        let start = Instant::now();
        while self.active() && start.elapsed() < Duration::from_secs(2) {
            thread::sleep(Duration::from_millis(10));
        }
    }
    pub fn active(&self) -> bool {
        self.runs
            .lock()
            .map(|runs| {
                runs.values().any(|r| {
                    r.lock()
                        .map(|r| matches!(r.handle.state.as_str(), "running" | "starting"))
                        .unwrap_or(true)
                })
            })
            .unwrap_or(true)
    }
}
fn capture(
    pipe: impl Read + Send + 'static,
    stream: &'static str,
    run: Arc<Mutex<Run>>,
    redactor: Redactor,
) {
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut pem = false;
        loop {
            let mut bytes = Vec::new();
            let n = reader
                .by_ref()
                .take((LINE_LIMIT + 1) as u64)
                .read_until(b'\n', &mut bytes)
                .unwrap_or(0);
            if n == 0 {
                break;
            }
            if n > LINE_LIMIT {
                if let Ok(mut r) = run.lock() {
                    r.truncated = true;
                    r.cancel.store(true, Ordering::Relaxed);
                }
                break;
            }
            let text = String::from_utf8_lossy(&bytes);
            if text.contains("-----BEGIN ") {
                pem = true;
            }
            let end = text.contains("-----END ");
            let text = if pem {
                "[redacted]".into()
            } else {
                redactor.redact(&text)
            };
            if end {
                pem = false;
            }
            if let Ok(mut r) = run.lock() {
                if r.bytes + text.len() > LOG_LIMIT {
                    r.truncated = true;
                    r.cancel.store(true, Ordering::Relaxed);
                    break;
                }
                r.bytes += text.len();
                r.sequence += 1;
                let sequence = r.sequence;
                r.logs.push(LogLine {
                    sequence,
                    stream: stream.into(),
                    text,
                });
            }
        }
    });
}
fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
}
#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for WindowsJob {}
#[cfg(windows)]
impl WindowsJob {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err("frameworks.startFailed".into());
            }
            let job = Self(handle);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as _) == 0
            {
                return Err("frameworks.startFailed".into());
            }
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn secret_redaction() {
        let r = Redactor::new(vec!["canary-secret-1234".into()]);
        let text=r.redact("canary-secret-1234 token=abc password=bad Bearer xxx sk-123456789012345 https://me:bad@example.com");
        for bad in [
            "canary-secret-1234",
            "abc",
            "bad",
            "xxx",
            "sk-123456789012345",
            "me:",
        ] {
            assert!(!text.contains(bad), "{text}");
        }
    }
    #[test]
    fn environment_is_allowlisted() {
        let env = safe_environment(Path::new("/runtime/bin/node"));
        assert!(env.iter().all(
            |(k, _)| !["HOME", "SSH_AUTH_SOCK", "HTTP_PROXY", "SOMNIA_TOKEN"].contains(&k.as_str())
        ));
        assert_eq!(
            env.iter().find(|(k, _)| k == "PATH").unwrap().1,
            "/runtime/bin"
        );
    }
    #[test]
    fn captures_are_bounded() {
        let run = Arc::new(Mutex::new(Run {
            handle: RunnerHandle {
                id: "x".into(),
                project_id: "p".into(),
                kind: RunKind::Build,
                state: "running".into(),
                port: None,
                preview_token: None,
                url: None,
                exit_code: None,
            },
            root: PathBuf::new(),
            logs: vec![],
            bytes: 0,
            sequence: 0,
            truncated: false,
            cancel: Arc::new(AtomicBool::new(false)),
        }));
        capture(
            std::io::Cursor::new(vec![b'x'; LINE_LIMIT + 2]),
            "stdout",
            run.clone(),
            Redactor::new(vec![]),
        );
        thread::sleep(Duration::from_millis(100));
        let r = run.lock().unwrap();
        assert!(r.truncated);
        assert!(r.cancel.load(Ordering::Relaxed));
        assert!(r.logs.is_empty());
    }
    #[test]
    fn scripts_are_not_read() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            d.path().join("package.json"),
            r#"{"scripts":{"build":"evil"}}"#,
        )
        .unwrap();
        assert!(fixed_args(d.path(), Path::new("npm.js"), RunKind::Build, None).is_err());
    }
}

fn loopback_ready(port: u16, token: &str) -> bool {
    use std::io::Write;
    let Ok(mut socket) = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(200),
    ) else {
        return false;
    };
    let _ = socket.set_read_timeout(Some(Duration::from_millis(200)));
    let _ = socket.set_write_timeout(Some(Duration::from_millis(200)));
    if write!(socket,"GET /__somnia/source-events HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n").is_err(){return false;}
    let mut response = [0u8; 128];
    let Ok(n) = socket.read(&mut response) else {
        return false;
    };
    let s = String::from_utf8_lossy(&response[..n]);
    s.starts_with("HTTP/1.1 2") || s.starts_with("HTTP/1.0 2")
}

fn monitor_child(
    child: &mut Child,
    run: &Arc<Mutex<Run>>,
    cancel: &AtomicBool,
    timeout: Option<Duration>,
) {
    let start = Instant::now();
    loop {
        let expired = timeout.is_some_and(|t| start.elapsed() >= t);
        if expired || cancel.load(Ordering::Relaxed) {
            kill_tree(child);
            if let Ok(mut r) = run.lock() {
                r.handle.state = if expired { "timedOut" } else { "stopped" }.into();
            }
            break;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                kill_tree(child);
                if let Ok(mut r) = run.lock() {
                    r.handle.state = "exited".into();
                    r.handle.exit_code = status.code();
                }
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                kill_tree(child);
                if let Ok(mut r) = run.lock() {
                    r.handle.state = "stopped".into();
                }
                break;
            }
        }
    }
}
#[cfg(all(test, unix))]
mod lifecycle_tests {
    use super::*;
    fn test_run() -> Arc<Mutex<Run>> {
        Arc::new(Mutex::new(Run {
            handle: RunnerHandle {
                id: "x".into(),
                project_id: "p".into(),
                kind: RunKind::Build,
                state: "running".into(),
                port: None,
                preview_token: None,
                url: None,
                exit_code: None,
            },
            root: PathBuf::from("/tmp"),
            logs: vec![],
            bytes: 0,
            sequence: 0,
            truncated: false,
            cancel: Arc::new(AtomicBool::new(false)),
        }))
    }
    #[test]
    fn timeout_kills_group_and_child() {
        use std::os::unix::process::CommandExt;
        let mut child = Command::new("/bin/sleep")
            .arg("20")
            .process_group(0)
            .spawn()
            .unwrap();
        let run = test_run();
        let cancel = AtomicBool::new(false);
        monitor_child(&mut child, &run, &cancel, Some(Duration::from_millis(30)));
        assert_eq!(run.lock().unwrap().handle.state, "timedOut");
        assert!(child.try_wait().unwrap().is_some());
    }
    #[test]
    fn cancel_kills_child() {
        use std::os::unix::process::CommandExt;
        let mut child = Command::new("/bin/sleep")
            .arg("20")
            .process_group(0)
            .spawn()
            .unwrap();
        let run = test_run();
        let cancel = AtomicBool::new(true);
        monitor_child(&mut child, &run, &cancel, None);
        assert_eq!(run.lock().unwrap().handle.state, "stopped");
        assert!(child.try_wait().unwrap().is_some());
    }
    #[test]
    fn private_key_lines_are_redacted() {
        let run = test_run();
        capture(std::io::Cursor::new(b"-----BEGIN PRIVATE KEY-----\ncanary-secret-pem\n-----END PRIVATE KEY-----\nnormal\n"),"stderr",run.clone(),Redactor::new(vec![]));
        thread::sleep(Duration::from_millis(100));
        let r = run.lock().unwrap();
        assert_eq!(r.logs.len(), 4);
        assert!(r.logs.iter().all(|l| !l.text.contains("canary")));
        assert_eq!(r.logs.last().unwrap().text, "normal");
    }
    #[test]
    fn stop_all_waits_for_exit() {
        use std::os::unix::process::CommandExt;
        let runner = ProcessRunner::default();
        let run = test_run();
        let cancel = run.lock().unwrap().cancel.clone();
        runner.runs.lock().unwrap().insert("x".into(), run.clone());
        let monitor = run.clone();
        let mut child = Command::new("/bin/sleep")
            .arg("20")
            .process_group(0)
            .spawn()
            .unwrap();
        thread::spawn(move || monitor_child(&mut child, &monitor, &cancel, None));
        runner.stop_all();
        assert!(!runner.active());
        assert_eq!(run.lock().unwrap().handle.state, "stopped");
    }
}
