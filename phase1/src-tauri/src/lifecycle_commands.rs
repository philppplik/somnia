//! Native memory sampling for the studio lifecycle pressure probe.
//!
//! `lifecycle_memory_sample` returns the process RSS and the system memory
//! pair the renderer's `src/lib/lifecycle/probe.ts` consumes. Read-only: it
//! touches no user data, no paths and no document content, so the main-window
//! gate plus the `allow-lifecycle-memory-sample` capability are the whole
//! authorization boundary. The caller treats any error as "native probing
//! unavailable" and degrades to the JS heap signal, so failures here are
//! expected on unusual platforms and are logged once by `cmd()`.
use serde::Serialize;

/// Wire shape consumed by `probe.ts` (`parseNativeSample`): camelCase, with
/// `usedBytes <= totalBytes` and `totalBytes > 0` - the pair the pressure
/// ratio is computed from. The remaining fields ride along for telemetry.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleMemorySample {
    /// System memory in use (total minus available).
    pub used_bytes: u64,
    /// Total physical system memory.
    pub total_bytes: u64,
    /// Memory the OS can hand out without swapping (Linux `MemAvailable`,
    /// macOS free + inactive pages, Windows `AvailPhys`).
    pub available_bytes: u64,
    /// Resident set of this process (Linux `VmRSS`, macOS
    /// `rusage_info_v2.ri_resident_size`, Windows `WorkingSetSize`).
    pub process_rss_bytes: u64,
    /// Peak resident set of this process (Linux `VmHWM`, macOS
    /// `getrusage().ru_maxrss` in bytes, Windows `PeakWorkingSetSize`).
    pub process_peak_rss_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleError {
    /// Caller window is not the trusted main window.
    Denied,
    /// The OS sample could not be read on this platform/run.
    SampleUnavailable,
}

impl LifecycleError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Denied => "SOM-APP-016",
            Self::SampleUnavailable => "SOM-APP-015",
        }
    }
}

type Result<T> = std::result::Result<T, LifecycleError>;

impl From<LifecycleError> for crate::app_command_error::AppCommandError {
    fn from(e: LifecycleError) -> Self {
        let (code, message) = match e {
            LifecycleError::Denied => ("lifecycle_denied", "The lifecycle request was rejected."),
            LifecycleError::SampleUnavailable => (
                "lifecycle_memory_sample_unavailable",
                "A system memory sample is unavailable right now.",
            ),
        };
        Self::new(e.code(), code, message, false)
    }
}

fn gate(window: &tauri::WebviewWindow) -> Result<()> {
    if window.label() != "main" {
        return Err(LifecycleError::Denied);
    }
    Ok(())
}

#[tauri::command]
pub fn lifecycle_memory_sample(
    window: tauri::WebviewWindow,
) -> std::result::Result<LifecycleMemorySample, crate::app_command_error::AppCommandError> {
    crate::cmd::cmd("lifecycle_memory_sample", Some(window.label()), || {
        gate(&window)?;
        sample().map_err(Into::into)
    })
}

/// Shared invariant check: the probe's parser rejects `used > total` and
/// `total == 0`, so clamp/validate here instead of leaking a rejected shape.
#[cfg(any(target_os = "linux", target_os = "macos", windows, test))]
fn finish(total_bytes: u64, available_bytes: u64, rss: u64, peak: u64) -> Result<LifecycleMemorySample> {
    if total_bytes == 0 || available_bytes > total_bytes {
        return Err(LifecycleError::SampleUnavailable);
    }
    Ok(LifecycleMemorySample {
        used_bytes: total_bytes - available_bytes,
        total_bytes,
        available_bytes,
        process_rss_bytes: rss,
        process_peak_rss_bytes: peak,
    })
}

// ---------------------------------------------------------------------------
// Linux: /proc/self/status (VmRSS/VmHWM) and /proc/meminfo (MemTotal/
// MemAvailable), both in kB. Kept as pure parsers so unit tests cover the
// real formats without a platform gate.
// ---------------------------------------------------------------------------

/// Parses a `VmRSS:`/`VmHWM:` style value: `  12345 kB` -> `12345`.
#[cfg(any(target_os = "linux", test))]
fn parse_kb_field(value: &str) -> Option<u64> {
    value.trim().strip_suffix("kB")?.trim().parse().ok()
}

/// (VmRSS, VmHWM) in kB from /proc/self/status content.
#[cfg(any(target_os = "linux", test))]
fn parse_proc_status(content: &str) -> Option<(u64, u64)> {
    let mut rss = None;
    let mut hwm = None;
    for line in content.lines() {
        if let Some(v) = line.strip_prefix("VmRSS:") {
            rss = parse_kb_field(v);
        } else if let Some(v) = line.strip_prefix("VmHWM:") {
            hwm = parse_kb_field(v);
        }
    }
    Some((rss?, hwm?))
}

/// (MemTotal, MemAvailable) in kB from /proc/meminfo content.
#[cfg(any(target_os = "linux", test))]
fn parse_meminfo(content: &str) -> Option<(u64, u64)> {
    let mut total = None;
    let mut available = None;
    for line in content.lines() {
        if let Some(v) = line.strip_prefix("MemTotal:") {
            total = parse_kb_field(v);
        } else if let Some(v) = line.strip_prefix("MemAvailable:") {
            available = parse_kb_field(v);
        }
    }
    Some((total?, available?))
}

#[cfg(target_os = "linux")]
fn sample() -> Result<LifecycleMemorySample> {
    let status = std::fs::read_to_string("/proc/self/status").map_err(|_| LifecycleError::SampleUnavailable)?;
    let meminfo = std::fs::read_to_string("/proc/meminfo").map_err(|_| LifecycleError::SampleUnavailable)?;
    let (rss_kb, peak_kb) = parse_proc_status(&status).ok_or(LifecycleError::SampleUnavailable)?;
    let (total_kb, available_kb) = parse_meminfo(&meminfo).ok_or(LifecycleError::SampleUnavailable)?;
    finish(
        total_kb.saturating_mul(1024),
        available_kb.saturating_mul(1024),
        rss_kb.saturating_mul(1024),
        peak_kb.saturating_mul(1024),
    )
}

// ---------------------------------------------------------------------------
// macOS: current RSS from libproc (`proc_pid_rusage`, RUSAGE_INFO_V2), peak
// RSS from getrusage (ru_maxrss is bytes on macOS, unlike Linux), system
// totals from sysctl hw.memsize plus free + inactive pages from
// host_statistics64. libc only, no mach2 dependency.
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn sysctl_u64(name: &'static [u8]) -> Result<u64> {
    let mut value: u64 = 0;
    let mut len = std::mem::size_of::<u64>();
    let rc = unsafe {
        libc::sysctlbyname(
            name.as_ptr() as *const libc::c_char,
            &mut value as *mut _ as *mut libc::c_void,
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if rc != 0 {
        return Err(LifecycleError::SampleUnavailable);
    }
    Ok(value)
}

#[cfg(target_os = "macos")]
fn sample() -> Result<LifecycleMemorySample> {
    let mut info: libc::rusage_info_v2 = unsafe { std::mem::zeroed() };
    let rc = unsafe {
        libc::proc_pid_rusage(
            libc::getpid(),
            libc::RUSAGE_INFO_V2,
            &mut info as *mut _ as *mut libc::c_void,
        )
    };
    if rc != 0 {
        return Err(LifecycleError::SampleUnavailable);
    }
    let mut ru: libc::rusage = unsafe { std::mem::zeroed() };
    let peak = if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut ru) } == 0 {
        ru.ru_maxrss as u64
    } else {
        info.ri_resident_size
    };
    let total = sysctl_u64(b"hw.memsize\0")?;
    let page = sysctl_u64(b"hw.pagesize\0")?;
    let mut vm: libc::vm_statistics64_data_t = unsafe { std::mem::zeroed() };
    // HOST_VM_INFO64_COUNT without relying on the constant: the macro is
    // sizeof(vm_statistics64_data_t) / sizeof(integer_t).
    let mut count =
        (std::mem::size_of::<libc::vm_statistics64_data_t>() / std::mem::size_of::<libc::integer_t>())
            as libc::mach_msg_type_number_t;
    let kr = unsafe {
        libc::host_statistics64(
            libc::mach_host_self(),
            libc::HOST_VM_INFO64,
            &mut vm as *mut _ as libc::host_info64_t,
            &mut count,
        )
    };
    if kr != libc::KERN_SUCCESS {
        return Err(LifecycleError::SampleUnavailable);
    }
    let available = (vm.free_count as u64)
        .saturating_add(vm.inactive_count as u64)
        .saturating_mul(page);
    finish(total, available, info.ri_resident_size, peak)
}

// ---------------------------------------------------------------------------
// Windows: process working set via psapi GetProcessMemoryInfo, system totals
// via GlobalMemoryStatusEx. Uses the already-pinned windows-sys crate; adds
// only the ProcessStatus and SystemInformation features, no new dependency.
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn sample() -> Result<LifecycleMemorySample> {
    use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
    counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    if unsafe { GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb) } == 0 {
        return Err(LifecycleError::SampleUnavailable);
    }
    let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut status) } == 0 {
        return Err(LifecycleError::SampleUnavailable);
    }
    finish(
        status.ullTotalPhys,
        status.ullAvailPhys,
        counters.WorkingSetSize as u64,
        counters.PeakWorkingSetSize as u64,
    )
}

/// Every non-desktop target: the command exists but reports unavailable, and
/// the probe degrades to the JS heap signal.
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn sample() -> Result<LifecycleMemorySample> {
    Err(LifecycleError::SampleUnavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proc_status_parses_rss_and_hwm() {
        let content = "Name:\tsomnia\nVmPeak:\t  710000 kB\nVmRSS:\t  318464 kB\nVmHWM:\t  402112 kB\nVmStk:\t     132 kB\n";
        assert_eq!(parse_proc_status(content), Some((318464, 402112)));
    }

    #[test]
    fn proc_status_missing_field_is_none() {
        let content = "Name:\tsomnia\nVmRSS:\t  318464 kB\n";
        assert_eq!(parse_proc_status(content), None);
    }

    #[test]
    fn meminfo_parses_total_and_available() {
        let content = "MemTotal:       16384000 kB\nMemFree:         1024000 kB\nMemAvailable:    8192000 kB\nBuffers:          512000 kB\n";
        assert_eq!(parse_meminfo(content), Some((16384000, 8192000)));
    }

    #[test]
    fn meminfo_without_available_is_none() {
        // Pre-3.14 kernels lack MemAvailable; the sample must fail closed so
        // the probe degrades instead of trusting a MemFree guess.
        let content = "MemTotal:       16384000 kB\nMemFree:         1024000 kB\n";
        assert_eq!(parse_meminfo(content), None);
    }

    #[test]
    fn kb_field_requires_the_suffix() {
        assert_eq!(parse_kb_field("  12345 kB"), Some(12345));
        assert_eq!(parse_kb_field("  12345"), None);
    }

    #[test]
    fn finish_enforces_the_probe_invariants() {
        assert_eq!(finish(0, 0, 1, 1), Err(LifecycleError::SampleUnavailable));
        assert_eq!(finish(100, 101, 1, 1), Err(LifecycleError::SampleUnavailable));
        let ok = finish(100, 40, 10, 12).expect("valid sample");
        assert_eq!(ok.used_bytes, 60);
        assert_eq!(ok.total_bytes, 100);
        assert_eq!(ok.available_bytes, 40);
        assert_eq!(ok.process_rss_bytes, 10);
        assert_eq!(ok.process_peak_rss_bytes, 12);
    }
}
