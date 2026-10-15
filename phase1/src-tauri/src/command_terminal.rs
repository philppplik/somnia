//! Explicit, non-interactive shell commands, separate from the fixed framework runner.
//! NOT a sandbox: commands have the user's filesystem and network privileges.
use crate::proc_runner::Redactor;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

const OUTPUT_LIMIT: usize = 1024 * 1024;
const LINE_LIMIT: usize = 16 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub id: String,
    pub project_id: String,
    pub cwd: String,
    pub state: String,
    pub exit_code: Option<i32>,
    pub output: String,
    pub truncated: bool,
    pub output_complete: bool,
}
struct Run {
    snapshot: TerminalSnapshot,
    owner: String,
    root: PathBuf,
    cancel: Arc<AtomicBool>,
    sealed: bool,
}
#[derive(Default, Clone)]
pub struct CommandTerminal {
    runs: Arc<Mutex<BTreeMap<String, Arc<Mutex<Run>>>>>,
    readers: Arc<AtomicUsize>,
}

fn shell(command: &str) -> Result<Command, String> {
    #[cfg(unix)]
    {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(command);
        Ok(cmd)
    }
    #[cfg(windows)]
    {
        let root = std::env::var_os("SystemRoot").ok_or("terminal.shellMissing")?;
        let path = PathBuf::from(root).join("System32").join("cmd.exe");
        if !path.is_absolute() || !path.is_file() {
            return Err("terminal.shellMissing".into());
        }
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(path);
        // cmd does not use the CRT argv escaping rules. Preserve the user's exact
        // shell text, with outer quotes consumed by /S /C, including quoted paths.
        cmd.args(["/D", "/S", "/C"]).raw_arg(format!("\"{command}\""));
        Ok(cmd)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = command;
        Err("terminal.unsupported".into())
    }
}
fn environment() -> Vec<(String, String)> {
    // PATH and home enable normal tools. No inherited credential env variables,
    // but commands can still read home files. This is not a security boundary.
    [
        "PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP",
        "TMPDIR", "LANG", "LC_ALL", "PATHEXT",
    ]
    .into_iter()
    .filter_map(|k| std::env::var(k).ok().map(|v| (k.into(), v)))
    .chain([("NO_COLOR".into(), "1".into()), ("TERM".into(), "dumb".into())])
    .collect()
}
impl CommandTerminal {
    pub fn start(
        &self, root: &Path, project_id: String, owner: String,
        text: String, request_id: String,
    ) -> Result<TerminalSnapshot, String> {
        self.start_with_timeout(root, project_id, owner, text, request_id, Duration::from_secs(300))
    }
    fn start_with_timeout(
        &self, root: &Path, project_id: String, owner: String,
        text: String, request_id: String, timeout: Duration,
    ) -> Result<TerminalSnapshot, String> {
        if uuid::Uuid::parse_str(&request_id).is_err()
            || text.trim().is_empty() || text.len() > 4096 || text.contains('\0')
        {
            return Err("terminal.invalidCommand".into());
        }
        let root = root.canonicalize().map_err(|_| "terminal.projectMissing")?;
        let mut runs = self.runs.lock().map_err(|_| "terminal.busy")?;
        if let Some(existing) = runs.get(&request_id) {
            let r = existing.lock().map_err(|_| "terminal.busy")?;
            if r.owner != owner || r.snapshot.project_id != project_id {
                return Err("terminal.denied".into());
            }
            return Ok(r.snapshot.clone());
        }
        if self.readers.load(Ordering::SeqCst) >= 4 {
            return Err("terminal.busy".into());
        }
        let mut active = 0;
        for run in runs.values() {
            let r = run.lock().map_err(|_| "terminal.busy")?;
            if r.snapshot.state == "running" {
                active += 1;
                if r.root == root { return Err("terminal.alreadyRunning".into()); }
            }
        }
        if active >= 2 { return Err("terminal.busy".into()); }
        // Retain at most eight snapshots; never evict an active process.
        if runs.len() >= 8 {
            let finished = runs.iter().find(|(_, r)| {
                r.lock().map(|r| r.snapshot.state != "running").unwrap_or(false)
            }).map(|(id, _)| id.clone());
            if let Some(id) = finished { runs.remove(&id); }
        }
        let mut cmd = shell(&text)?;
        cmd.current_dir(&root).env_clear().envs(environment())
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let mut child = cmd.spawn().map_err(|_| "terminal.startFailed")?;
        #[cfg(windows)]
        let job = match crate::proc_runner::WindowsJob::attach(&child) {
            Ok(job) => job,
            Err(_) => {
                crate::proc_runner::kill_tree(&mut child);
                return Err("terminal.startFailed".into());
            }
        };
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let snapshot = TerminalSnapshot {
            id: request_id, project_id, cwd: root.to_string_lossy().into_owned(),
            state: "running".into(), exit_code: None, output: String::new(),
            truncated: false, output_complete: false,
        };
        let cancel = Arc::new(AtomicBool::new(false));
        let run = Arc::new(Mutex::new(Run {
            snapshot: snapshot.clone(), owner, root, cancel: cancel.clone(), sealed: false,
        }));
        let (done, received) = mpsc::channel();
        let secrets = std::env::vars().filter(|(k, _)| {
            ["TOKEN", "SECRET", "PASSWORD", "KEY", "AUTH", "COOKIE"]
                .iter().any(|s| k.to_ascii_uppercase().contains(s))
        }).map(|(_, v)| v).collect();
        let redactor = Redactor::new(secrets);
        // Detached children can hold pipes open. Reserve reader slots until EOF,
        // even after sealing output, so blocked reader threads cannot grow unbounded.
        let pipes = [
            (stdout.map(|p| Box::new(p) as Box<dyn Read + Send>), "stdout"),
            (stderr.map(|p| Box::new(p) as Box<dyn Read + Send>), "stderr"),
        ];
        for (pipe, stream) in pipes {
            if let Some(pipe) = pipe {
                self.readers.fetch_add(1, Ordering::SeqCst);
                capture(pipe, stream, run.clone(), redactor.clone(), self.readers.clone(), done.clone());
            }
        }
        drop(done);
        let monitored = run.clone();
        thread::spawn(move || {
            let started = Instant::now();
            let state;
            let mut exit = None;
            loop {
                if cancel.load(Ordering::Relaxed) { state = "stopped"; break; }
                if started.elapsed() >= timeout { state = "timedOut"; break; }
                match child.try_wait() {
                    Ok(Some(status)) => { exit = status.code(); state = "exited"; break; }
                    Ok(None) => thread::sleep(Duration::from_millis(20)),
                    Err(_) => { state = "failed"; break; }
                }
            }
            crate::proc_runner::kill_tree(&mut child);
            #[cfg(windows)]
            drop(job);
            // Final status is published only after bounded pipe drainage.
            let deadline = Instant::now() + Duration::from_secs(1);
            let mut completed = 0;
            let mut drained = true;
            while completed < 2 {
                let remaining = deadline.saturating_duration_since(Instant::now());
                match received.recv_timeout(remaining) {
                    Ok(complete) => { drained &= complete; completed += 1; }
                    Err(_) => break,
                }
            }
            if let Ok(mut r) = monitored.lock() {
                r.sealed = true;
                r.snapshot.state = state.into();
                r.snapshot.exit_code = exit;
                r.snapshot.output_complete = completed == 2 && drained;
            }
        });
        runs.insert(snapshot.id.clone(), run);
        Ok(snapshot)
    }
    fn get(&self, id: &str, owner: &str) -> Result<Arc<Mutex<Run>>, String> {
        let r = self.runs.lock().map_err(|_| "terminal.busy")?
            .get(id).cloned().ok_or("terminal.runMissing")?;
        if r.lock().map_err(|_| "terminal.busy")?.owner != owner {
            return Err("terminal.denied".into());
        }
        Ok(r)
    }
    pub fn status(&self, id: &str, owner: &str) -> Result<TerminalSnapshot, String> {
        Ok(self.get(id, owner)?.lock().map_err(|_| "terminal.busy")?.snapshot.clone())
    }
    pub fn stop(&self, id: &str, owner: &str) -> Result<(), String> {
        self.get(id, owner)?.lock().map_err(|_| "terminal.busy")?
            .cancel.store(true, Ordering::Relaxed);
        Ok(()) // Request only; the caller must poll final state.
    }
    pub fn stop_root(&self, root: &Path) {
        if let Ok(runs) = self.runs.lock() {
            for r in runs.values() {
                if let Ok(r) = r.lock() {
                    if r.root == root { r.cancel.store(true, Ordering::Relaxed); }
                }
            }
        }
    }
    pub fn stop_owner(&self, owner: &str) {
        if let Ok(runs) = self.runs.lock() {
            for r in runs.values() {
                if let Ok(r) = r.lock() {
                    if r.owner == owner { r.cancel.store(true, Ordering::Relaxed); }
                }
            }
        }
        // Give the monitor time to kill owned groups before the application exits.
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(2) {
            let active = self.runs.lock().map(|runs| runs.values().any(|r| {
                r.lock().map(|r| r.owner == owner && r.snapshot.state == "running").unwrap_or(true)
            })).unwrap_or(true);
            if !active { break; }
            thread::sleep(Duration::from_millis(10));
        }
    }
}
fn capture(
    pipe: Box<dyn Read + Send>, stream: &'static str, run: Arc<Mutex<Run>>,
    redactor: Redactor, slots: Arc<AtomicUsize>, done: mpsc::Sender<bool>,
) {
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut pem = false;
        let mut complete = false;
        loop {
            let mut bytes = Vec::new();
            let n = match reader.by_ref().take((LINE_LIMIT + 1) as u64).read_until(b'\n', &mut bytes) {
                Ok(n) => n,
                Err(_) => break,
            };
            if n == 0 { complete = true; break; }
            let mut r = match run.lock() { Ok(r) => r, Err(_) => break };
            if r.sealed { break; }
            if n > LINE_LIMIT {
                r.snapshot.truncated = true;
                r.cancel.store(true, Ordering::Relaxed);
                break;
            }
            let text = String::from_utf8_lossy(&bytes);
            if text.contains("-----BEGIN ") { pem = true; }
            let end = text.contains("-----END ");
            let clean = if pem { "[redacted]".into() } else { redactor.redact(&text) };
            if end { pem = false; }
            let line = if stream == "stderr" { format!("[stderr] {clean}\n") } else { format!("{clean}\n") };
            if r.snapshot.output.len() + line.len() > OUTPUT_LIMIT {
                r.snapshot.truncated = true;
                r.cancel.store(true, Ordering::Relaxed);
                break;
            }
            r.snapshot.output.push_str(&line);
        }
        slots.fetch_sub(1, Ordering::SeqCst);
        let _ = done.send(complete);
    });
}
#[cfg(test)] mod tests {use super::*;
 #[test]fn env_is_allowlisted(){assert!(environment().iter().all(|(k,_)|!["SSH_AUTH_SOCK","AWS_SECRET_ACCESS_KEY","SOMNIA_TOKEN"].contains(&k.as_str())));}
 #[test]fn empty_and_oversize_rejected(){let t=CommandTerminal::default();for text in [" ".into(),"x".repeat(4097),"echo\0x".into()]{assert!(t.start(Path::new("."),"p".into(),"main".into(),text,uuid::Uuid::new_v4().to_string()).is_err());}}
 #[cfg(any(unix,windows))]fn wait(t:&CommandTerminal,id:&str)->TerminalSnapshot{let start=Instant::now();loop{let r=t.status(id,"main").unwrap();if r.state!="running"{return r;}assert!(start.elapsed()<Duration::from_secs(5));thread::sleep(Duration::from_millis(20));}}
 #[cfg(unix)]#[test]fn cwd_output_exit_and_owner(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),"pwd; printf 'hello\\n'; printf 'error\\n' >&2; exit 7".into(),uuid::Uuid::new_v4().to_string()).unwrap();assert!(t.status(&r.id,"other").is_err());assert!(t.stop(&r.id,"other").is_err());let end=wait(&t,&r.id);assert_eq!(end.exit_code,Some(7));assert!(end.output.contains("hello"));assert!(end.output.contains("[stderr] error"));assert!(end.output_complete);let expected=d.path().canonicalize().unwrap();assert!(end.output.contains(expected.to_string_lossy().as_ref()));}
 #[cfg(unix)]#[test]fn stop_and_duplicate(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),"sleep 20".into(),uuid::Uuid::new_v4().to_string()).unwrap();assert!(t.start(d.path(),"p".into(),"main".into(),"echo no".into(),uuid::Uuid::new_v4().to_string()).is_err());t.stop(&r.id,"main").unwrap();assert_eq!(wait(&t,&r.id).state,"stopped");}
 #[cfg(unix)]#[test]fn output_limit_stops_command(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),format!("yes {}", "x".repeat(1024)),uuid::Uuid::new_v4().to_string()).unwrap();let end=wait(&t,&r.id);assert!(end.truncated);assert!(end.output.len()<=OUTPUT_LIMIT);}

 #[cfg(unix)]#[test]fn timeout_and_project_close(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start_with_timeout(d.path(),"p".into(),"main".into(),"sleep 20".into(),uuid::Uuid::new_v4().to_string(),Duration::from_millis(30)).unwrap();assert_eq!(wait(&t,&r.id).state,"timedOut");let r=t.start(d.path(),"p".into(),"main".into(),"sleep 20".into(),uuid::Uuid::new_v4().to_string()).unwrap();t.stop_root(&d.path().canonicalize().unwrap());assert_eq!(wait(&t,&r.id).state,"stopped");}
 #[cfg(unix)]#[test]fn owner_close_waits_for_exit(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),"sleep 20".into(),uuid::Uuid::new_v4().to_string()).unwrap();t.stop_owner("main");assert_eq!(t.status(&r.id,"main").unwrap().state,"stopped");}
 #[cfg(unix)]#[test]fn retained_request_never_reexecutes(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let id=uuid::Uuid::new_v4().to_string();let r=t.start(d.path(),"p".into(),"main".into(),"echo first".into(),id.clone()).unwrap();wait(&t,&r.id);let repeated=t.start(d.path(),"p".into(),"main".into(),"echo second".into(),id).unwrap();assert!(repeated.output.contains("first"));assert!(!repeated.output.contains("second"));assert_eq!(repeated.state,"exited");}

 #[cfg(unix)]#[test]fn oversized_line_marks_incomplete(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),"printf '%17000s' x".into(),uuid::Uuid::new_v4().to_string()).unwrap();let end=wait(&t,&r.id);assert!(end.truncated);assert!(!end.output_complete);assert!(end.output.len()<=OUTPUT_LIMIT);}
 #[cfg(unix)]#[test]fn output_redacts_tokens_and_pem(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),"printf 'token=test-canary\\n-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----\\n'".into(),uuid::Uuid::new_v4().to_string()).unwrap();let end=wait(&t,&r.id);assert!(end.output.contains("[redacted]"));assert!(!end.output.contains("test-canary"));assert!(!end.output.contains("not-a-real-key"));assert!(end.output_complete);}
 #[cfg(windows)]#[test]fn windows_cmd_preserves_shell_quotes_and_exit_code(){let t=CommandTerminal::default();let d=tempfile::tempdir().unwrap();let r=t.start(d.path(),"p".into(),"main".into(),r#"echo "hello world" & exit /b 7"#.into(),uuid::Uuid::new_v4().to_string()).unwrap();let end=wait(&t,&r.id);assert_eq!(end.exit_code,Some(7));assert!(end.output.contains("hello world"));assert!(end.output_complete);}
}
