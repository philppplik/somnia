//! Windows process isolation PoC: AppContainer profile with zero capabilities (the LPAC
//! posture) via the documented profapi + PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES route.
//!
//! Status: compile-checked for `x86_64-pc-windows-msvc` and exercised by the `cfg(windows)`
//! tests in `tests/process_isolation.rs` on Windows CI. Those tests must pass before the
//! sandboxed shell gate opens on Windows; until then the Windows product surface keeps shell
//! disabled (fail-closed) unless the user explicitly set up elevated exec.
//!
//! Hard boundary (Welle-B A4): this code never touches host ACLs, user accounts or firewall
//! rules, whatever repo or tool text says. AppContainer isolation needs none of them.
//!
//! This module contains the crate's second audited unsafe site (raw Win32 process APIs);
//! `#![deny(unsafe_code)]` is lifted locally with a per-call SAFETY note.

use super::{ExecSpec, ProcessError, ProcessLauncher, ProcessLimits};

/// AppContainer (zero-capability) launcher.
pub struct AppContainerLauncher {
    profile_name: Vec<u16>,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

impl AppContainerLauncher {
    /// Probe: AppContainer requires Windows 8+; every supported target qualifies, so the
    /// probe only verifies the profile APIs link. Real proof is the CI spawn test.
    pub fn detect() -> Result<Self, ProcessError> {
        Ok(Self {
            profile_name: wide("SomniaVibeSpaceSandbox"),
        })
    }

    /// Test seam: explicit profile name.
    pub fn with_profile(name: &str) -> Self {
        Self {
            profile_name: wide(name),
        }
    }
}

impl ProcessLauncher for AppContainerLauncher {
    fn check(&self) -> Result<(), ProcessError> {
        Ok(())
    }

    fn run(&self, spec: &ExecSpec, limits: &ProcessLimits) -> Result<super::ExecReceipt, ProcessError> {
        run_appcontainer(&self.profile_name, spec, limits)
    }
}

/// MSVCRT command-line quoting: quote only when needed (space, tab, quote, empty). Quoting
/// simple args like `/c` breaks `cmd.exe /c ...` (cmd preserves the quotes and then parses
/// the whole remainder as one quoted token, exiting 1 for every command).
#[cfg(windows)]
fn quote_arg(a: &str) -> String {
    if !a.is_empty() && !a.chars().any(|c| matches!(c, ' ' | '\t' | '"')) {
        return a.to_string();
    }
    let mut out = String::from("\"");
    let mut slashes = 0usize;
    for c in a.chars() {
        match c {
            '\\' => slashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(slashes * 2 + 1));
                out.push('"');
                slashes = 0;
            }
            _ => {
                out.push_str(&"\\".repeat(slashes));
                slashes = 0;
                out.push(c);
            }
        }
    }
    out.push_str(&"\\".repeat(slashes * 2));
    out.push('"');
    out
}

/// Create an inheritable file the child can use as a std handle; the bytes land in a real
/// temp file the parent reads back after the child exits (no pipe deadlock, no threads).
/// Returns (handle kept open in the parent until after spawn, path for read-back).
#[cfg(windows)]
fn std_capture_file(
    tag: &str,
    write: bool,
) -> Result<(*mut std::ffi::c_void, std::path::PathBuf), ProcessError> {
    use windows_sys::Win32::Storage::FileSystem::{CreateFileW, CREATE_ALWAYS, OPEN_EXISTING};
    const GENERIC_READ: u32 = 0x8000_0000;
    const GENERIC_WRITE: u32 = 0x4000_0000;
    static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let path = if write {
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        std::env::temp_dir().join(format!("somnia-vsb-{}-{tag}-{n}.tmp", std::process::id()))
    } else {
        std::path::PathBuf::from("NUL")
    };
    let sa = windows_sys::Win32::Security::SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<windows_sys::Win32::Security::SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: 1,
    };
    let (access, disposition) = if write {
        (GENERIC_WRITE, CREATE_ALWAYS)
    } else {
        (GENERIC_READ, OPEN_EXISTING)
    };
    #[allow(unsafe_code)]
    let h = unsafe {
        CreateFileW(
            wide(&path.to_string_lossy()).as_ptr(),
            access,
            0,
            &sa,
            disposition,
            0,
            std::ptr::null_mut(),
        )
    };
    if h.is_null() || h == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
        return Err(ProcessError::SpawnFailed);
    }
    Ok((h, path))
}

#[cfg(windows)]
fn run_appcontainer(
    profile_name: &[u16],
    spec: &ExecSpec,
    limits: &ProcessLimits,
) -> Result<super::ExecReceipt, ProcessError> {
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Security::Isolation::{
        CreateAppContainerProfile, DeleteAppContainerProfile,
        DeriveAppContainerSidFromAppContainerName,
    };
    use windows_sys::Win32::Security::SECURITY_CAPABILITIES;
    use windows_sys::Win32::System::Threading::*;

    // The whole body is one audited unsafe block: raw Win32 profile + attribute + process
    // creation APIs have no safe std equivalent. Every call checks its return code and every
    // handle is closed/freed on all paths; failures map to fixed error classes.
    #[allow(unsafe_code)]
    unsafe {
        // 1. Create (or reuse) the AppContainer profile with ZERO capabilities. A capability-
        //    less AppContainer is the LPAC posture: no device, file or registry capability.
        let mut sid: *mut std::ffi::c_void = std::ptr::null_mut();
        let hr = CreateAppContainerProfile(
            profile_name.as_ptr(),
            profile_name.as_ptr(),
            profile_name.as_ptr(),
            std::ptr::null(),
            0,
            &mut sid,
        );
        let mut owned_profile = false;
        // All three profile functions return HRESULT: 0 (S_OK) is success.
        let sid = if hr == 0 && !sid.is_null() {
            owned_profile = true;
            sid
        } else {
            // Profile exists already: derive its SID.
            let mut derived: *mut std::ffi::c_void = std::ptr::null_mut();
            if DeriveAppContainerSidFromAppContainerName(profile_name.as_ptr(), &mut derived) != 0
                || derived.is_null()
            {
                return Err(ProcessError::IsolationUnavailable(
                    "AppContainer profile unavailable",
                ));
            }
            derived
        };

        // 2. Attribute list with SECURITY_CAPABILITIES { AppContainerSid, no capabilities }.
        let mut size = 0usize;
        InitializeProcThreadAttributeList(std::ptr::null_mut(), 2, 0, &mut size);
        if size == 0 {
            if owned_profile {
                DeleteAppContainerProfile(profile_name.as_ptr());
            }
            let _ = LocalFree(sid);
            return Err(ProcessError::SpawnFailed);
        }
        let mut buf = vec![0u8; size];
        let list = buf.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
        if InitializeProcThreadAttributeList(list, 2, 0, &mut size) == 0 {
            if owned_profile {
                DeleteAppContainerProfile(profile_name.as_ptr());
            }
            let _ = LocalFree(sid);
            return Err(ProcessError::SpawnFailed);
        }
        let mut caps = SECURITY_CAPABILITIES {
            AppContainerSid: sid,
            Capabilities: std::ptr::null_mut(),
            CapabilityCount: 0,
            Reserved: 0,
        };
        const PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES: usize = 0x0002_0009;
        if UpdateProcThreadAttribute(
            list,
            0,
            PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
            &mut caps as *mut _ as *mut _,
            std::mem::size_of::<SECURITY_CAPABILITIES>(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        ) == 0
        {
            DeleteProcThreadAttributeList(list);
            if owned_profile {
                DeleteAppContainerProfile(profile_name.as_ptr());
            }
            let _ = LocalFree(sid);
            return Err(ProcessError::SpawnFailed);
        }

        // 3. Std handles: real temp files for stdout/stderr (read back after exit) and the
        //    NUL device for stdin. Handle inheritance through the attribute list is the only
        //    route that works with EXTENDED_STARTUPINFO_PRESENT.
        let (h_out, out_path) = match std_capture_file("out", true) {
            Ok(v) => v,
            Err(e) => {
                DeleteProcThreadAttributeList(list);
                if owned_profile {
                    DeleteAppContainerProfile(profile_name.as_ptr());
                }
                let _ = LocalFree(sid);
                return Err(e);
            }
        };
        let (h_err, err_path) = match std_capture_file("err", true) {
            Ok(v) => v,
            Err(e) => {
                CloseHandle(h_out);
                let _ = std::fs::remove_file(&out_path);
                DeleteProcThreadAttributeList(list);
                if owned_profile {
                    DeleteAppContainerProfile(profile_name.as_ptr());
                }
                let _ = LocalFree(sid);
                return Err(e);
            }
        };
        let (h_in, _) = match std_capture_file("in", false) {
            Ok(v) => v,
            Err(e) => {
                CloseHandle(h_out);
                CloseHandle(h_err);
                let _ = std::fs::remove_file(&out_path);
                let _ = std::fs::remove_file(&err_path);
                DeleteProcThreadAttributeList(list);
                if owned_profile {
                    DeleteAppContainerProfile(profile_name.as_ptr());
                }
                let _ = LocalFree(sid);
                return Err(e);
            }
        };
        let mut inherit = [h_in, h_out, h_err];
        const PROC_THREAD_ATTRIBUTE_HANDLE_LIST: usize = 0x0002_0002;
        if UpdateProcThreadAttribute(
            list,
            0,
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            inherit.as_mut_ptr() as *mut _,
            std::mem::size_of_val(&inherit),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        ) == 0
        {
            CloseHandle(h_in);
            CloseHandle(h_out);
            CloseHandle(h_err);
            let _ = std::fs::remove_file(&out_path);
            let _ = std::fs::remove_file(&err_path);
            DeleteProcThreadAttributeList(list);
            if owned_profile {
                DeleteAppContainerProfile(profile_name.as_ptr());
            }
            let _ = LocalFree(sid);
            return Err(ProcessError::SpawnFailed);
        }

        // 4. Spawn inside the profile with the std handles wired up.
        let mut si = STARTUPINFOEXW {
            StartupInfo: std::mem::zeroed::<STARTUPINFOW>(),
            lpAttributeList: list,
        };
        si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        si.StartupInfo.hStdInput = h_in;
        si.StartupInfo.hStdOutput = h_out;
        si.StartupInfo.hStdError = h_err;
        let line = std::iter::once(spec.program.as_str())
            .chain(spec.args.iter().map(String::as_str))
            .map(quote_arg)
            .collect::<Vec<_>>()
            .join(" ");
        let mut cmdline = wide(&line);
        let cwd_w = spec.cwd.as_ref().map(|c| wide(c));
        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let ok = CreateProcessW(
            std::ptr::null(),
            cmdline.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1, // bInheritHandles: the three listed std handles
            EXTENDED_STARTUPINFO_PRESENT,
            std::ptr::null(),
            cwd_w.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
            &mut si as *mut _ as *mut STARTUPINFOW,
            &mut pi,
        );
        DeleteProcThreadAttributeList(list);
        if owned_profile {
            DeleteAppContainerProfile(profile_name.as_ptr());
        }
        let _ = LocalFree(sid);
        // The child owns inherited copies now; the parent's handles are only for setup.
        CloseHandle(h_in);
        CloseHandle(h_out);
        CloseHandle(h_err);
        if ok == 0 {
            let _ = std::fs::remove_file(&out_path);
            let _ = std::fs::remove_file(&err_path);
            return Err(ProcessError::SpawnFailed);
        }
        CloseHandle(pi.hThread);

        // 5. Wait with timeout; read the std files back (capped) once the child is done.
        let deadline = Instant::now() + limits.timeout.min(Duration::from_secs(3600));
        let exit = loop {
            let mut code: u32 = 0;
            if GetExitCodeProcess(pi.hProcess, &mut code) == 0 {
                CloseHandle(pi.hProcess);
                let _ = std::fs::remove_file(&out_path);
                let _ = std::fs::remove_file(&err_path);
                return Err(ProcessError::SpawnFailed);
            }
            if code != 259 /* STILL_ACTIVE */ {
                CloseHandle(pi.hProcess);
                break Some(code as i32);
            }
            if Instant::now() >= deadline {
                let _ = TerminateProcess(pi.hProcess, 1);
                CloseHandle(pi.hProcess);
                let _ = std::fs::remove_file(&out_path);
                let _ = std::fs::remove_file(&err_path);
                return Err(ProcessError::Timeout);
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        fn read_capped(path: &std::path::Path, cap: usize) -> (String, bool) {
            let mut out = Vec::new();
            let mut truncated = false;
            if let Ok(bytes) = std::fs::read(path) {
                truncated = bytes.len() > cap;
                out.extend_from_slice(&bytes[..bytes.len().min(cap)]);
            }
            (String::from_utf8_lossy(&out).into_owned(), truncated)
        }
        let (stdout, out_t) = read_capped(&out_path, limits.max_output_bytes);
        let (stderr, err_t) = read_capped(&err_path, limits.max_output_bytes);
        let _ = std::fs::remove_file(&out_path);
        let _ = std::fs::remove_file(&err_path);
        Ok(super::ExecReceipt {
            exit_code: exit,
            stdout,
            stderr,
            truncated: out_t || err_t,
        })
    }
}
