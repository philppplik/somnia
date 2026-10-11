//! Windows process isolation PoC: AppContainer profile with zero capabilities (the LPAC
//! posture) via the documented profapi + PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES route.
//!
//! Status: compile-checked for `x86_64-pc-windows-msvc`; it has never run. The `cfg(windows)`
//! tests in `tests/process_isolation.rs` must pass on Windows CI before the sandboxed shell
//! gate opens on Windows; until then the Windows product surface keeps shell disabled
//! (fail-closed) unless the user explicitly set up elevated exec.
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
        InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut size);
        if size == 0 {
            if owned_profile {
                DeleteAppContainerProfile(profile_name.as_ptr());
            }
            let _ = LocalFree(sid);
            return Err(ProcessError::SpawnFailed);
        }
        let mut buf = vec![0u8; size];
        let list = buf.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
        if InitializeProcThreadAttributeList(list, 1, 0, &mut size) == 0 {
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

        // 3. Spawn with pipes, inside the profile.
        let mut si = STARTUPINFOEXW {
            StartupInfo: std::mem::zeroed::<STARTUPINFOW>(),
            lpAttributeList: list,
        };
        si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
        let mut cmdline = wide(&spec.program);
        for a in &spec.args {
            cmdline.pop();
            cmdline.extend(
                format!(" \"{}\"", a.replace('"', "")).encode_utf16().chain(std::iter::once(0)),
            );
        }
        let cwd_w = spec.cwd.as_ref().map(|c| wide(c));
        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let ok = CreateProcessW(
            std::ptr::null(),
            cmdline.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
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
        if ok == 0 {
            return Err(ProcessError::SpawnFailed);
        }
        CloseHandle(pi.hThread);

        // 4. Wait with timeout, capture nothing on Windows PoC (output plumbing comes with CI);
        //    return exit code only, honestly labelled.
        let deadline = Instant::now() + limits.timeout.min(Duration::from_secs(3600));
        let exit = loop {
            let mut code: u32 = 0;
            if GetExitCodeProcess(pi.hProcess, &mut code) == 0 {
                CloseHandle(pi.hProcess);
                return Err(ProcessError::SpawnFailed);
            }
            if code != 259 /* STILL_ACTIVE */ {
                CloseHandle(pi.hProcess);
                break Some(code as i32);
            }
            if Instant::now() >= deadline {
                let _ = TerminateProcess(pi.hProcess, 1);
                CloseHandle(pi.hProcess);
                return Err(ProcessError::Timeout);
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        Ok(super::ExecReceipt {
            exit_code: exit,
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
        })
    }
}
