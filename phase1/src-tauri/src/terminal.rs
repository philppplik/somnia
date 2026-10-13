//! Inline terminal sessions: one real PTY per session, a bounded replay buffer per session,
//! and events the trusted editor window renders in the bottom panel.
//!
//! Security model:
//! - Only the trusted main window may spawn, write to, resize or kill sessions. Every Tauri
//!   command below gates on the window label and the editor capability grants `terminal_*`
//!   to the `main` window only.
//! - Sessions are the user's own interactive shells (like the VS Code terminal): they inherit
//!   the app environment on purpose. Background *runners* (npm install, helper packages) stay
//!   on the scrubbed fixed-command path in [`crate::proc_runner`]; this module is not a runner.
//! - Buffers are bounded (REPLAY_LIMIT) and session count is capped (MAX_SESSIONS).
//!
//! Windows: portable-pty uses ConPTY, whose console host never shows a window, so spawning a
//! shell cannot flash a console. This module never uses std::process::Command; the NoWindow
//! trait (no_window.rs) governs the code paths that do.
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

/// Hard cap on concurrent sessions per app run. Bounds reader/waiter threads and memory.
pub const MAX_SESSIONS: usize = 8;
/// Per-session replay buffer in bytes. Older output is dropped and counted so the UI can say so.
pub const REPLAY_LIMIT: usize = 256 * 1024;
/// Single read chunk from the PTY.
const READ_CHUNK: usize = 16 * 1024;
pub const MIN_COLS: u16 = 2;
pub const MAX_COLS: u16 = 400;
pub const MIN_ROWS: u16 = 1;
pub const MAX_ROWS: u16 = 200;

pub const OUTPUT_EVENT: &str = "somnia://terminal-output";
pub const EXIT_EVENT: &str = "somnia://terminal-exit";

/// Host-side notifications about a session. The desktop layer turns these into Tauri events;
/// tests install a recording sink instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalEvent {
    Output { session_id: String, bytes: Arc<Vec<u8>> },
    Exit { session_id: String, exit_code: Option<i32> },
}
pub type OutputSink = Arc<dyn Fn(TerminalEvent) + Send + Sync>;
fn no_sink() -> OutputSink {
    Arc::new(|_| {})
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    pub pid: Option<u32>,
    pub alive: bool,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub info: TerminalInfo,
    /// Base64 of the retained output tail; the renderer decodes before feeding xterm.
    pub data_base64: String,
    pub dropped_bytes: u64,
}

struct Session {
    info: TerminalInfo,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    replay: Vec<u8>,
    dropped_bytes: u64,
}

impl Session {
    fn append(&mut self, chunk: &[u8]) {
        self.replay.extend_from_slice(chunk);
        if self.replay.len() > REPLAY_LIMIT {
            let overflow = self.replay.len() - REPLAY_LIMIT;
            self.replay.drain(..overflow);
            self.dropped_bytes += overflow as u64;
        }
    }
}

/// Registry of live sessions plus the event sink. Managed as Tauri state.
pub struct TerminalManager {
    sessions: Mutex<BTreeMap<String, Arc<Mutex<Session>>>>,
    sink: Mutex<OutputSink>,
}
impl Default for TerminalManager {
    fn default() -> Self {
        Self { sessions: Mutex::new(BTreeMap::new()), sink: Mutex::new(no_sink()) }
    }
}

fn clamp_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(MIN_COLS, MAX_COLS),
        rows: rows.clamp(MIN_ROWS, MAX_ROWS),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Default interactive shell for the platform. No probing processes are spawned: Windows checks
/// the well-known PowerShell path and falls back to COMSPEC/cmd.exe.
pub fn default_shell() -> (PathBuf, String) {
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let powershell = Path::new(&root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        if powershell.is_file() {
            return (powershell, "powershell".into());
        }
        let cmd = std::env::var("COMSPEC").unwrap_or_else(|_| r"C:\Windows\System32\cmd.exe".into());
        return (PathBuf::from(cmd), "cmd".into());
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        let path = PathBuf::from(shell);
        let label = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "sh".into());
        (path, label)
    }
}

impl TerminalManager {
    /// The desktop layer emits Tauri events; tests record. One sink for the process lifetime.
    pub fn set_sink(&self, sink: OutputSink) {
        *self.sink.lock().unwrap_or_else(|e| e.into_inner()) = sink;
    }
    fn sink(&self) -> OutputSink {
        self.sink.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn list(&self) -> Vec<TerminalInfo> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions
            .values()
            .map(|s| s.lock().unwrap_or_else(|e| e.into_inner()).info.clone())
            .collect()
    }

    fn get(&self, session_id: &str) -> Result<Arc<Mutex<Session>>, String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.get(session_id).cloned().ok_or_else(|| "terminal:unknown-session".to_string())
    }

    /// Spawns the default shell (or an explicit test shell) attached to a new PTY.
    pub fn spawn(&self, cwd: Option<&Path>, cols: u16, rows: u16) -> Result<TerminalInfo, String> {
        let (shell, label) = default_shell();
        self.spawn_shell(&shell, &label, &[], cwd, cols, rows)
    }

    /// Full spawn path, separated so tests can drive a known shell with arguments.
    pub fn spawn_shell(
        &self,
        shell: &Path,
        shell_label: &str,
        args: &[&str],
        cwd: Option<&Path>,
        cols: u16,
        rows: u16,
    ) -> Result<TerminalInfo, String> {
        {
            let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            if sessions.len() >= MAX_SESSIONS {
                return Err("terminal:too-many-sessions".into());
            }
        }
        if !shell.is_file() {
            return Err("terminal:no-shell".into());
        }
        let cwd = match cwd {
            Some(dir) => {
                let canonical = std::fs::canonicalize(dir).map_err(|_| "terminal:cwd".to_string())?;
                if !canonical.is_dir() {
                    return Err("terminal:cwd".into());
                }
                canonical
            }
            None => std::env::current_dir().map_err(|_| "terminal:cwd".to_string())?,
        };
        let size = clamp_size(cols, rows);
        let pair = portable_pty::native_pty_system()
            .openpty(size)
            .map_err(|e| format!("terminal:pty:{e}"))?;
        let mut command = CommandBuilder::new(shell);
        for arg in args {
            command.arg(arg);
        }
        command.cwd(&cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        // Interactive shells read their startup files and prompt because the slave is a real tty.
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("terminal:spawn:{e}"))?;
        drop(pair.slave);
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("terminal:reader:{e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("terminal:writer:{e}"))?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let pid = child.process_id();
        let info = TerminalInfo {
            session_id: session_id.clone(),
            shell: shell_label.to_string(),
            cwd: cwd.to_string_lossy().into_owned(),
            pid,
            alive: true,
            exit_code: None,
        };
        let session = Arc::new(Mutex::new(Session {
            info: info.clone(),
            master: pair.master,
            writer,
            child,
            replay: Vec::new(),
            dropped_bytes: 0,
        }));
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(session_id.clone(), session.clone());

        // Reader: PTY output -> bounded replay buffer + event sink.
        let reader_session = session.clone();
        let reader_sink = self.sink();
        let reader_id = session_id.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; READ_CHUNK];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        let chunk = buffer[..count].to_vec();
                        reader_session
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .append(&chunk);
                        reader_sink(TerminalEvent::Output {
                            session_id: reader_id.clone(),
                            bytes: Arc::new(chunk),
                        });
                    }
                    Err(_) => break,
                }
            }
        });

        // Waiter: exit code -> info + event sink. try_wait keeps the child behind the one mutex.
        let waiter_session = session.clone();
        let waiter_sink = self.sink();
        let waiter_id = session_id.clone();
        thread::spawn(move || loop {
            let done = {
                let mut guard = waiter_session.lock().unwrap_or_else(|e| e.into_inner());
                match guard.child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.exit_code();
                        let exit_code = i32::try_from(code).ok();
                        guard.info.alive = false;
                        guard.info.exit_code = exit_code;
                        Some(exit_code)
                    }
                    Ok(None) => None,
                    Err(_) => {
                        guard.info.alive = false;
                        Some(None)
                    }
                }
            };
            match done {
                Some(code) => {
                    waiter_sink(TerminalEvent::Exit { session_id: waiter_id, exit_code: code });
                    break;
                }
                None => thread::sleep(Duration::from_millis(50)),
            }
        });

        Ok(info)
    }

    /// Current replay tail and counters for a (re)attached view.
    pub fn attach(&self, session_id: &str) -> Result<(TerminalInfo, Vec<u8>, u64), String> {
        let session = self.get(session_id)?;
        let guard = session.lock().unwrap_or_else(|e| e.into_inner());
        Ok((guard.info.clone(), guard.replay.clone(), guard.dropped_bytes))
    }

    pub fn write(&self, session_id: &str, bytes: &[u8]) -> Result<(), String> {
        let session = self.get(session_id)?;
        let mut guard = session.lock().unwrap_or_else(|e| e.into_inner());
        if !guard.info.alive {
            return Err("terminal:exited".into());
        }
        guard
            .writer
            .write_all(bytes)
            .and_then(|()| guard.writer.flush())
            .map_err(|e| format!("terminal:write:{e}"))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self.get(session_id)?;
        let guard = session.lock().unwrap_or_else(|e| e.into_inner());
        guard
            .master
            .resize(clamp_size(cols, rows))
            .map_err(|e| format!("terminal:resize:{e}"))
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let session = self.get(session_id)?;
        {
            let mut guard = session.lock().unwrap_or_else(|e| e.into_inner());
            if guard.info.alive {
                // Child: ChildKiller, so kill() works on the same handle.
                let _ = guard.child.kill();
                guard.info.alive = false;
            }
        }
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(session_id);
        Ok(())
    }

    /// App shutdown path: kill every child so no shell outlives the editor.
    pub fn kill_all(&self) {
        let ids: Vec<String> = self
            .sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .cloned()
            .collect();
        for id in ids {
            let _ = self.kill(&id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn test_sink() -> (OutputSink, mpsc::Receiver<TerminalEvent>) {
        let (tx, rx) = mpsc::channel();
        (Arc::new(move |event| {
            let _ = tx.send(event);
        }), rx)
    }

    #[test]
    fn size_is_clamped() {
        let size = clamp_size(0, 9999);
        assert_eq!(size.cols, MIN_COLS);
        assert_eq!(size.rows, MAX_ROWS);
        let size = clamp_size(120, 30);
        assert_eq!((size.cols, size.rows), (120, 30));
    }

    #[test]
    fn replay_buffer_is_bounded_and_counts_drops() {
        let mut session = Session {
            info: TerminalInfo {
                session_id: "s".into(),
                shell: "sh".into(),
                cwd: "/tmp".into(),
                pid: None,
                alive: true,
                exit_code: None,
            },
            master: portable_pty::native_pty_system()
                .openpty(clamp_size(80, 24))
                .unwrap()
                .master,
            writer: Box::new(std::io::sink()),
            child: Box::new(FakeChild),
            replay: Vec::new(),
            dropped_bytes: 0,
        };
        let big = vec![b'x'; REPLAY_LIMIT + 100];
        session.append(&big);
        assert_eq!(session.replay.len(), REPLAY_LIMIT);
        assert_eq!(session.dropped_bytes, 100);
        session.append(b"tail");
        assert!(session.replay.ends_with(b"tail"));
        assert_eq!(session.dropped_bytes, 104);
    }

    #[derive(Debug)]
    struct FakeChild;
    impl Child for FakeChild {
        fn try_wait(&mut self) -> std::io::Result<Option<portable_pty::ExitStatus>> {
            Ok(None)
        }
        fn wait(&mut self) -> std::io::Result<portable_pty::ExitStatus> {
            unimplemented!()
        }
        fn process_id(&self) -> Option<u32> {
            None
        }
    }
    impl ChildKiller for FakeChild {
        fn kill(&mut self) -> std::io::Result<()> {
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
            Box::new(FakeChild)
        }
    }

    #[test]
    fn session_cap_is_enforced() {
        let manager = TerminalManager::default();
        {
            let mut sessions = manager.sessions.lock().unwrap();
            for i in 0..MAX_SESSIONS {
                sessions.insert(format!("fake-{i}"), Arc::new(Mutex::new(Session {
                    info: TerminalInfo {
                        session_id: format!("fake-{i}"),
                        shell: "sh".into(),
                        cwd: "/tmp".into(),
                        pid: None,
                        alive: true,
                        exit_code: None,
                    },
                    master: portable_pty::native_pty_system()
                        .openpty(clamp_size(80, 24))
                        .unwrap()
                        .master,
                    writer: Box::new(std::io::sink()),
                    child: Box::new(FakeChild),
                    replay: Vec::new(),
                    dropped_bytes: 0,
                })));
            }
        }
        let err = manager.spawn(None, 80, 24).unwrap_err();
        assert_eq!(err, "terminal:too-many-sessions");
    }

    #[test]
    fn unknown_session_is_a_stable_error() {
        let manager = TerminalManager::default();
        assert_eq!(manager.write("nope", b"x").unwrap_err(), "terminal:unknown-session");
        assert_eq!(manager.attach("nope").unwrap_err(), "terminal:unknown-session");
        assert_eq!(manager.resize("nope", 80, 24).unwrap_err(), "terminal:unknown-session");
    }

    #[test]
    fn bad_cwd_is_rejected() {
        let manager = TerminalManager::default();
        let err = manager
            .spawn(Some(Path::new("/definitely/not/a/somnia-dir")), 80, 24)
            .unwrap_err();
        assert_eq!(err, "terminal:cwd");
    }

    /// Round-trip a real PTY: the shell echoes marker text and exits with a chosen code.
    #[test]
    fn pty_roundtrip_echo_and_exit_code() {
        let (shell, args, script): (PathBuf, Vec<&str>, &str) = if cfg!(windows) {
            (
                PathBuf::from(std::env::var("COMSPEC").unwrap_or_else(|_| r"C:\Windows\System32\cmd.exe".into())),
                vec!["/Q"],
                "echo somnia-pty-marker\r\nexit 7\r\n",
            )
        } else {
            (PathBuf::from("/bin/sh"), vec![], "echo somnia-pty-marker; exit 7\n")
        };
        if !shell.is_file() {
            return;
        }
        let manager = TerminalManager::default();
        let (sink, rx) = test_sink();
        manager.set_sink(sink);
        let info = manager.spawn_shell(&shell, "test-shell", &args, None, 80, 24).unwrap();
        manager.write(&info.session_id, script.as_bytes()).unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut output = Vec::new();
        let mut exit_code = None;
        while std::time::Instant::now() < deadline && exit_code.is_none() {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(TerminalEvent::Output { bytes, .. }) => output.extend_from_slice(&bytes[..]),
                Ok(TerminalEvent::Exit { exit_code: code, .. }) => exit_code = Some(code),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let text = String::from_utf8_lossy(&output);
        assert!(text.contains("somnia-pty-marker"), "echo visible in PTY output, got: {text:?}");
        assert_eq!(exit_code, Some(Some(7)), "shell exit code observed");

        let (attached, replay, _) = manager.attach(&info.session_id).unwrap();
        assert!(!attached.alive);
        assert_eq!(attached.exit_code, Some(7));
        assert!(String::from_utf8_lossy(&replay).contains("somnia-pty-marker"));
        assert_eq!(manager.write(&info.session_id, b"x").unwrap_err(), "terminal:exited");

        manager.kill(&info.session_id).unwrap();
        assert!(manager.list().is_empty());
    }

    #[test]
    fn kill_removes_session_and_stops_child() {
        if cfg!(windows) {
            return; // Covered by the roundtrip test on Windows runners.
        }
        let manager = TerminalManager::default();
        let info = manager
            .spawn_shell(Path::new("/bin/sh"), "sh", &[], None, 80, 24)
            .unwrap();
        assert_eq!(manager.list().len(), 1);
        manager.kill(&info.session_id).unwrap();
        assert!(manager.list().is_empty());
    }
}

// ---- Tauri glue (desktop builds only) ----
// Thin like deploy_commands: gate on the trusted editor window, delegate to TerminalManager.
#[cfg(feature = "desktop")]
pub mod glue {
    use super::*;
    use base64::Engine as _;
    use tauri::{AppHandle, Emitter, State, WebviewWindow};

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct OutputPayload {
        pub session_id: String,
        pub data_base64: String,
    }
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ExitPayload {
        pub session_id: String,
        pub exit_code: Option<i32>,
    }

    /// Bridges manager events to Tauri events on the main window. Call once during setup.
    pub fn install_sink(manager: &TerminalManager, app: AppHandle) {
        manager.set_sink(Arc::new(move |event| match event {
            TerminalEvent::Output { session_id, bytes } => {
                let payload = OutputPayload {
                    session_id,
                    data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes[..]),
                };
                let _ = app.emit(OUTPUT_EVENT, payload);
            }
            TerminalEvent::Exit { session_id, exit_code } => {
                let _ = app.emit(EXIT_EVENT, ExitPayload { session_id, exit_code });
            }
        }));
    }

    fn gate(window: &WebviewWindow) -> Result<(), String> {
        if window.label() != "main" {
            return Err("Only the trusted editor window may use the terminal".into());
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn terminal_spawn(
        window: WebviewWindow,
        app: AppHandle,
        state: State<'_, TerminalManager>,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<TerminalInfo, String> {
        gate(&window)?;
        // Default working directory: the open project root, then the process cwd.
        let dir = cwd.map(PathBuf::from).or_else(|| crate::desktop::first_project_root(&app));
        state.spawn(dir.as_deref(), cols, rows)
    }

    #[tauri::command]
    pub async fn terminal_list(
        window: WebviewWindow,
        state: State<'_, TerminalManager>,
    ) -> Result<Vec<TerminalInfo>, String> {
        gate(&window)?;
        Ok(state.list())
    }

    #[tauri::command]
    pub async fn terminal_attach(
        window: WebviewWindow,
        state: State<'_, TerminalManager>,
        session_id: String,
    ) -> Result<TerminalSnapshot, String> {
        gate(&window)?;
        let (info, replay, dropped_bytes) = state.attach(&session_id)?;
        Ok(TerminalSnapshot {
            info,
            data_base64: base64::engine::general_purpose::STANDARD.encode(&replay),
            dropped_bytes,
        })
    }

    #[tauri::command]
    pub async fn terminal_write(
        window: WebviewWindow,
        state: State<'_, TerminalManager>,
        session_id: String,
        data: String,
    ) -> Result<(), String> {
        gate(&window)?;
        state.write(&session_id, data.as_bytes())
    }

    #[tauri::command]
    pub async fn terminal_resize(
        window: WebviewWindow,
        state: State<'_, TerminalManager>,
        session_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        gate(&window)?;
        state.resize(&session_id, cols, rows)
    }

    #[tauri::command]
    pub async fn terminal_kill(
        window: WebviewWindow,
        state: State<'_, TerminalManager>,
        session_id: String,
    ) -> Result<(), String> {
        gate(&window)?;
        state.kill(&session_id)
    }
}
