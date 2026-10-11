//! Windows shell: window, WebView2 bridge, and the real side effects behind the core's `Executor`.
use crate::{assets, handoff};
use serde_json::{json, Value};
use somnia_installer_core::{errors::InstallError, i18n, options::{self, Options}, payload, platform::Platform, runner::{self, Executor, Outcome}};
use std::{borrow::Cow, os::windows::process::CommandExt, path::{Path, PathBuf}, process::{Child, Command}, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, time::Duration};
use tao::{dpi::LogicalSize, event::{Event, WindowEvent}, event_loop::{ControlFlow, EventLoopBuilder}, window::WindowBuilder};
use winreg::{enums::*, RegKey};
use wry::{http::Response, WebViewBuilder};

const PAYLOAD: &[u8] = include_bytes!(env!("SOMNIA_PAYLOAD_PATH"));
const PAYLOAD_SHA: &str = env!("SOMNIA_PAYLOAD_SHA256");
const PAYLOAD_IS_DEV: &str = env!("SOMNIA_PAYLOAD_IS_DEV");
const INSTALLED_BYTES: &str = env!("SOMNIA_INSTALLED_BYTES");
const VERSION: &str = env!("SOMNIA_VERSION");
const LICENSE: &str = include_str!(concat!(env!("OUT_DIR"), "/LICENSE.txt"));
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Somnia";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const NO_WINDOW: u32 = 0x0800_0000;
const OPEN_URL_ALLOW: [&str; 2] = ["https://somnia.philipp-paulik.de/", "https://github.com/philppplik/somnia/"];

#[derive(Debug)]
enum Ui { Ipc(String), Js(String) }

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }
fn log_path() -> PathBuf { std::env::temp_dir().join("somnia-setup.log") }
fn log(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_path()) { let _ = writeln!(f, "{msg}"); }
}
fn user_locale() -> &'static str {
    let mut buf = [0u16; 85];
    let n = unsafe { windows_sys::Win32::Globalization::GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
    if n > 1 { i18n::pick(&String::from_utf16_lossy(&buf[..(n - 1) as usize])) } else { "en" }
}

pub struct WinPlatform;
fn nearest_existing(p: &Path) -> PathBuf {
    let mut c = p.to_path_buf();
    while !c.exists() { if !c.pop() { break; } }
    c
}
impl Platform for WinPlatform {
    fn free_space(&self, path: &Path) -> std::io::Result<u64> {
        let base = nearest_existing(path);
        let w = wide(&base.to_string_lossy());
        let mut free = 0u64; let (mut t, mut f) = (0u64, 0u64);
        let ok = unsafe { windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(w.as_ptr(), &mut free, &mut t, &mut f) };
        if ok == 0 { Err(std::io::Error::last_os_error()) } else { Ok(free) }
    }
    fn drive_label(&self, path: &Path) -> String { path.to_string_lossy().chars().take(2).collect() }
    fn can_write(&self, path: &Path) -> bool {
        let base = nearest_existing(path);
        let probe = base.join(".somnia-write-test");
        let ok = std::fs::write(&probe, b"x").is_ok(); let _ = std::fs::remove_file(&probe); ok
    }
    fn installed_version(&self) -> Option<String> {
        RegKey::predef(HKEY_CURRENT_USER).open_subkey(UNINSTALL_KEY).ok()?.get_value::<String, _>("DisplayVersion").ok()
    }
    fn app_running(&self) -> bool {
        Command::new("tasklist").args(["/FI", "IMAGENAME eq Somnia.exe", "/FO", "CSV", "/NH"]).creation_flags(NO_WINDOW).output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_ascii_lowercase().contains("somnia.exe")).unwrap_or(false)
    }
    fn env(&self, name: &str) -> Option<String> { std::env::var(name).ok() }
}

pub struct WinExecutor { cancel: Arc<AtomicBool>, child: Arc<Mutex<Option<Child>>>, dir_existed: bool, tmp: PathBuf }

impl WinExecutor {
    fn programs_dir() -> Option<PathBuf> { std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs")) }
    fn desktop_dir() -> Option<PathBuf> { std::env::var_os("USERPROFILE").map(|a| PathBuf::from(a).join("Desktop")) }
    fn exe(dir: &Path) -> PathBuf { let a = dir.join("Somnia.exe"); if a.exists() { a } else { dir.join("somnia.exe") } }
    fn dir_size(p: &Path) -> u64 {
        std::fs::read_dir(p).map(|rd| rd.flatten().map(|e| match e.metadata() { Ok(m) if m.is_dir() => Self::dir_size(&e.path()), Ok(m) => m.len(), _ => 0 }).sum()).unwrap_or(0)
    }
}

impl Executor for WinExecutor {
    fn unpack(&mut self, dir: &Path, on_bytes: &mut dyn FnMut(u64)) -> Result<(), InstallError> {
        if PAYLOAD_IS_DEV == "1" { return Err(InstallError::Generic { detail: "development build without embedded payload".into() }); }
        payload::verify_sha256(PAYLOAD, PAYLOAD_SHA)?;
        self.dir_existed = dir.exists();
        std::fs::create_dir_all(&self.tmp).map_err(|e| InstallError::Generic { detail: e.to_string() })?;
        let exe = self.tmp.join("payload.exe");
        std::fs::write(&exe, PAYLOAD).map_err(|e| InstallError::Generic { detail: e.to_string() })?;
        // NSIS: /S silent, /D must be the last argument and unquoted.
        let child = Command::new(&exe).raw_arg("/S").raw_arg(format!("/D={}", dir.display())).creation_flags(NO_WINDOW).spawn()
            .map_err(|e| InstallError::Generic { detail: format!("spawn: {e}") })?;
        *self.child.lock().unwrap() = Some(child);
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                if let Some(c) = self.child.lock().unwrap().as_mut() { let _ = c.kill(); let _ = c.wait(); }
                return Ok(()); // runner sees cancel_requested() and rolls back
            }
            let st = self.child.lock().unwrap().as_mut().and_then(|c| c.try_wait().ok()).flatten();
            on_bytes(Self::dir_size(dir)); // real bytes on disk, never a timer
            if let Some(s) = st {
                log(&format!("nsis exit: {s}"));
                return if s.success() { Ok(()) } else { Err(InstallError::Generic { detail: format!("NSIS exit {s}") }) };
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }
    fn shortcuts(&mut self, o: &Options) -> Result<(), InstallError> {
        // The stock NSIS creates both; remove what the user did not ask for. Only Somnia-named links, nothing else.
        let rm = |base: Option<PathBuf>, subdirs: &[&str]| {
            if let Some(b) = base { for s in subdirs { let p = b.join(s); if p.is_file() { let _ = std::fs::remove_file(&p); log(&format!("removed {}", p.display())); } } }
        };
        if !o.desktop_shortcut { rm(Self::desktop_dir(), &["Somnia.lnk"]); }
        if !o.start_menu { rm(Self::programs_dir(), &["Somnia.lnk", r"Somnia\Somnia.lnk"]); }
        Ok(())
    }
    fn associations(&mut self, exts: &[&str]) -> Result<(), InstallError> {
        // Register Somnia as an "Open with" candidate only. Never touch the default handler (options-spec).
        let dir = self.install_dir_hint();
        let exe = Self::exe(&dir);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let g = |e: std::io::Error| InstallError::Generic { detail: format!("registry: {e}") };
        let (prog, _) = hkcu.create_subkey(r"Software\Classes\Somnia.File").map_err(g)?;
        prog.set_value("", &"Somnia document").map_err(g)?;
        let (cmd, _) = prog.create_subkey(r"shell\open\command").map_err(g)?;
        cmd.set_value("", &format!("\"{}\" \"%1\"", exe.display())).map_err(g)?;
        for e in exts {
            let (k, _) = hkcu.create_subkey(format!(r"Software\Classes\{e}\OpenWithProgids")).map_err(g)?;
            k.set_raw_value("Somnia.File", &winreg::RegValue { vtype: REG_NONE, bytes: vec![] }).map_err(g)?;
        }
        Ok(())
    }
    fn app_config(&mut self, o: &Options) -> Result<(), InstallError> {
        let g = |e: std::io::Error| InstallError::Generic { detail: format!("config: {e}") };
        handoff::save(o, VERSION).map_err(g)?;
        let (run, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY).map_err(g)?;
        if o.launch_at_signin { run.set_value("Somnia", &format!("\"{}\"", Self::exe(&self.install_dir_hint()).display())).map_err(g)?; }
        else { let _ = run.delete_value("Somnia"); }
        Ok(())
    }
    fn finish(&mut self, _o: &Options) -> Result<(), InstallError> { let _ = std::fs::remove_dir_all(&self.tmp); Ok(()) }
    fn rollback(&mut self, dir: &Path) {
        if let Some(c) = self.child.lock().unwrap().as_mut() { let _ = c.kill(); let _ = c.wait(); }
        if !self.dir_existed && dir.exists() { let _ = std::fs::remove_dir_all(dir); }
        let _ = std::fs::remove_dir_all(&self.tmp);
        log("rolled back");
    }
    fn cancel_requested(&self) -> bool { self.cancel.load(Ordering::SeqCst) }
}
impl WinExecutor {
    fn install_dir_hint(&self) -> PathBuf { INSTALL_DIR.lock().unwrap().clone().unwrap_or_default() }
}
static INSTALL_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

fn error_json(e: &InstallError) -> Value {
    let mut v = serde_json::to_value(e).unwrap_or(json!({"kind": "generic"}));
    v["code"] = json!(e.code());
    v
}

fn webview2_present() -> bool {
    const ID: &str = r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let check = |hive, key: String| RegKey::predef(hive).open_subkey(key).ok().and_then(|k| k.get_value::<String, _>("pv").ok()).map(|v| !v.is_empty() && v != "0.0.0.0").unwrap_or(false);
    check(HKEY_LOCAL_MACHINE, format!(r"Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\{}", &ID[ID.rfind('\\').unwrap() + 1..]))
        || check(HKEY_LOCAL_MACHINE, ID.into()) || check(HKEY_CURRENT_USER, ID.into())
}

fn message_box(title: &str, body: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONWARNING, MB_OK};
    unsafe { MessageBoxW(0, wide(body).as_ptr(), wide(title).as_ptr(), MB_OK | MB_ICONWARNING); }
}
fn open_shell(target: &str) {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    unsafe { ShellExecuteW(0, wide("open").as_ptr(), wide(target).as_ptr(), std::ptr::null(), std::ptr::null(), 1); }
}

pub fn run() {
    let locale = user_locale();
    let strings = i18n::table(locale);
    // The UI needs WebView2. Without it we cannot draw our own screens: say so natively (SOM-WV2-07).
    if !webview2_present() {
        message_box(&strings["window.title"], &format!("{}\n\n{}\n\n{}", strings["error.webview2"], strings["error.webview2.body"], "https://go.microsoft.com/fwlink/p/?LinkId=2124703"));
        std::process::exit(7);
    }
    let event_loop = EventLoopBuilder::<Ui>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let window = WindowBuilder::new().with_title(strings["window.title"].clone()).with_decorations(false).with_resizable(false)
        .with_transparent(true).with_inner_size(LogicalSize::new(800.0, 600.0)).build(&event_loop).expect("window");
    if let Some(m) = window.primary_monitor() {
        let (ms, ws) = (m.size(), window.outer_size()); let mp = m.position();
        window.set_outer_position(tao::dpi::PhysicalPosition::new(mp.x + (ms.width as i32 - ws.width as i32) / 2, mp.y + (ms.height as i32 - ws.height as i32) / 2));
    }
    let ipc_proxy = proxy.clone();
    let webview = WebViewBuilder::new().with_transparent(true)
        .with_custom_protocol("somnia-setup".into(), |_id, req| match assets::get(req.uri().path()) {
            Some((ct, body)) => Response::builder().header("Content-Type", ct).header("Cache-Control", "no-store").body(Cow::Borrowed(body)).unwrap(),
            None => Response::builder().status(404).body(Cow::Borrowed(&b""[..])).unwrap(),
        })
        .with_ipc_handler(move |r| { let _ = ipc_proxy.send_event(Ui::Ipc(r.into_body())); })
        .with_url("http://somnia-setup.localhost/")
        .build(&window).expect("webview");

    let cancel = Arc::new(AtomicBool::new(false));
    let running = Arc::new(AtomicBool::new(false));
    let existing = WinPlatform.installed_version();
    let saved = handoff::load();
    let mut current = options::merge_for_upgrade(saved, Options::default(), existing.is_some());
    let required: u64 = INSTALLED_BYTES.parse().unwrap_or(0);
    let dispatch = |wv: &wry::WebView, v: Value| { let _ = wv.evaluate_script(&format!("window.__somniaDispatch({})", v)); };

    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *flow = ControlFlow::Exit,
            Event::UserEvent(Ui::Js(js)) => { let _ = webview.evaluate_script(&format!("window.__somniaDispatch({js})")); }
            Event::UserEvent(Ui::Ipc(msg)) => {
                let Ok(m) = serde_json::from_str::<Value>(&msg) else { return };
                let id = m["id"].clone(); let args = &m["args"];
                let reply = |wv: &wry::WebView, result: Value| dispatch(wv, json!({"id": id, "result": result}));
                match m["method"].as_str().unwrap_or("") {
                    "drag" => { let _ = window.drag_window(); }
                    "init" => reply(&webview, json!({"version": VERSION, "locale": locale, "strings": strings, "existingVersion": existing, "options": current, "licenseText": LICENSE})),
                    "validate" => {
                        let o: Options = serde_json::from_value(args[0].clone()).unwrap_or_default();
                        reply(&webview, match options::validate(&WinPlatform, &o, required) { Ok(_) => json!({"ok": true}), Err(e) => json!({"ok": false, "error": e}) });
                    }
                    "browse" => {
                        let picked = rfd::FileDialog::new().pick_folder().map(|p| p.to_string_lossy().to_string());
                        reply(&webview, json!(picked));
                    }
                    "start" => {
                        let o: Options = serde_json::from_value(args[0].clone()).unwrap_or_default();
                        if running.swap(true, Ordering::SeqCst) { reply(&webview, json!(null)); return; }
                        cancel.store(false, Ordering::SeqCst); current = o.clone();
                        let (p, c, r) = (proxy.clone(), cancel.clone(), running.clone());
                        std::thread::spawn(move || {
                            let send = |v: Value| { let _ = p.send_event(Ui::Js(json!({"event": v}).to_string())); };
                            send(json!({"type": "phase", "phase": "preparing"}));
                            let dir = options::expand(&WinPlatform, &o.install_dir);
                            *INSTALL_DIR.lock().unwrap() = Some(PathBuf::from(&dir));
                            let tmp = std::env::temp_dir().join(format!("somnia-setup-{}", std::process::id()));
                            let mut ex = WinExecutor { cancel: c, child: Arc::new(Mutex::new(None)), dir_existed: false, tmp };
                            log(&format!("start {VERSION} -> {dir}"));
                            let out = runner::run(&WinPlatform, &mut ex, &o, required, &mut |pr| send(json!({"type": "progress", "step": pr.step, "fraction": pr.fraction, "cancellable": pr.cancellable})));
                            match out {
                                Outcome::Success => send(json!({"type": "success"})),
                                Outcome::Cancelled => send(json!({"type": "cancelled"})),
                                Outcome::Failed(e) => { log(&format!("failed: {e:?}")); send(json!({"type": "error", "error": error_json(&e)})); }
                            }
                            r.store(false, Ordering::SeqCst);
                        });
                        reply(&webview, json!(null));
                    }
                    "cancel" => {
                        cancel.store(true, Ordering::SeqCst);
                        if !running.load(Ordering::SeqCst) { dispatch(&webview, json!({"event": {"type": "cancelled"}})); }
                        reply(&webview, json!(null));
                    }
                    "launch" => {
                        if let Some(d) = INSTALL_DIR.lock().unwrap().clone() { let _ = Command::new(WinExecutor::exe(&d)).spawn(); }
                        reply(&webview, json!(null));
                    }
                    "openLog" => { let _ = Command::new("notepad.exe").arg(log_path()).spawn(); reply(&webview, json!(null)); }
                    "openUrl" => {
                        if let Some(u) = args[0].as_str() { if OPEN_URL_ALLOW.iter().any(|a| u.starts_with(a)) { open_shell(u); } }
                        reply(&webview, json!(null));
                    }
                    "close" => *flow = ControlFlow::Exit,
                    _ => reply(&webview, json!(null)),
                }
            }
            _ => {}
        }
    });
}
