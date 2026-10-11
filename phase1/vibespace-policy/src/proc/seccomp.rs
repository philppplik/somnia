//! Minimal cBPF seccomp filter for the sandboxed child, handed to bubblewrap via
//! `--seccomp FD` (bwrap >= 0.5). Default-ALLOW with a denylist of kernel-attack-surface
//! syscalls (bubblewrap already provides the namespace isolation; this filter is the second
//! barrier). An architecture mismatch or the x32 ABI kills the process.
//!
//! If the filter cannot be built or handed over, exec fails closed: we never run a child
//! without the declared filter.

/// One BPF instruction (`struct sock_filter`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(C)]
struct SockFilter {
    code: u16,
    jt: u8,
    jf: u8,
    k: u32,
}

const BPF_LD_W_ABS: u16 = 0x20; // BPF_LD | BPF_W | BPF_ABS
const BPF_JMP_JEQ: u16 = 0x15; // BPF_JMP | BPF_JEQ | BPF_K
const BPF_JMP_JSET: u16 = 0x45; // BPF_JMP | BPF_JSET | BPF_K
const BPF_RET: u16 = 0x06; // BPF_RET | BPF_K

const RET_KILL_PROCESS: u32 = 0x8000_0000;
const RET_ERRNO_EPERM: u32 = 0x0005_0001; // SECCOMP_RET_ERRNO | EPERM
const RET_ALLOW: u32 = 0x7fff_0000;

#[cfg(target_arch = "x86_64")]
const AUDIT_ARCH_NATIVE: u32 = 0xC000_003E; // AUDIT_ARCH_X86_64
#[cfg(target_arch = "aarch64")]
const AUDIT_ARCH_NATIVE: u32 = 0xC000_00B7; // AUDIT_ARCH_AARCH64

/// Syscalls denied with EPERM inside the sandbox. Numbers come from libc for the compile
/// target, so the filter matches the architecture it is built for.
fn denied_syscalls() -> Vec<u32> {
    [
        libc::SYS_mount,
        libc::SYS_umount2,
        libc::SYS_ptrace,
        libc::SYS_kexec_load,
        libc::SYS_init_module,
        libc::SYS_finit_module,
        libc::SYS_delete_module,
        libc::SYS_bpf,
        libc::SYS_perf_event_open,
        libc::SYS_userfaultfd,
        libc::SYS_pivot_root,
        libc::SYS_swapon,
        libc::SYS_swapoff,
        libc::SYS_reboot,
        libc::SYS_acct,
        libc::SYS_setns,
        libc::SYS_unshare,
    ]
    .into_iter()
    .map(|n| n as u32)
    .collect()
}

/// Build the filter program (arch guard, x32 guard on x86_64, denylist, default ALLOW).
/// Unsupported target architectures yield no program: exec then fails closed.
pub fn build_filter() -> Option<Vec<u8>> {
    build_filter_for(&denied_syscalls())
}

/// Test seam: the default denylist plus extra syscall numbers.
pub fn build_filter_with_extra(extra: &[u32]) -> Option<Vec<u8>> {
    let mut d = denied_syscalls();
    d.extend_from_slice(extra);
    build_filter_for(&d)
}

fn build_filter_for(denied: &[u32]) -> Option<Vec<u8>> {
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    {
        let _ = denied;
        return None;
    }
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    {
        let mut p: Vec<SockFilter> = Vec::with_capacity(denied.len() * 2 + 8);
        let st = |code, k| SockFilter { code, jt: 0, jf: 0, k };
        // [0] load arch, [1] match -> [3] (continue), mismatch -> [2] kill
        p.push(st(BPF_LD_W_ABS, 4));
        p.push(SockFilter { code: BPF_JMP_JEQ, jt: 1, jf: 0, k: AUDIT_ARCH_NATIVE });
        p.push(st(BPF_RET, RET_KILL_PROCESS));
        // [3] load syscall nr
        p.push(st(BPF_LD_W_ABS, 0));
        #[cfg(target_arch = "x86_64")]
        {
            // x32 ABI syscalls (nr | 0x40000000) bypass per-number rules: kill.
            p.push(SockFilter { code: BPF_JMP_JSET, jt: 0, jf: 1, k: 0x4000_0000 });
            p.push(st(BPF_RET, RET_KILL_PROCESS));
        }
        for nr in denied {
            p.push(SockFilter { code: BPF_JMP_JEQ, jt: 0, jf: 1, k: *nr });
            p.push(st(BPF_RET, RET_ERRNO_EPERM));
        }
        p.push(st(BPF_RET, RET_ALLOW));
        let len = p.len() * 8;
        // SAFETY-free byte view: SockFilter is repr(C) POD; build it byte-wise instead.
        let mut out = Vec::with_capacity(len);
        for f in &p {
            out.extend_from_slice(&f.code.to_ne_bytes());
            out.push(f.jt);
            out.push(f.jf);
            out.extend_from_slice(&f.k.to_ne_bytes());
        }
        Some(out)
    }
}

/// Write the filter to a fresh pipe whose read end is inheritable, returning the read-end
/// fd number to pass to `bwrap --seccomp`. This is the single audited unsafe site of the
/// Linux launcher: Rust std has no safe API for an inheritable pipe.
pub fn filter_fd(program: &[u8]) -> std::io::Result<InheritableFd> {
    let mut fds = [0i32; 2];
    // SAFETY: `fds` points to two valid i32 slots; pipe2 with flags 0 creates a plain pipe.
    #[allow(unsafe_code)]
    let rc = unsafe { libc::pipe2(fds.as_mut_ptr(), 0) };
    if rc != 0 {
        return Err(std::io::Error::last_os_error());
    }
    let (r, w) = (fds[0], fds[1]);
    let mut buf = program;
    while !buf.is_empty() {
        // SAFETY: `w` is a live pipe write end; `buf` is a valid slice.
        #[allow(unsafe_code)]
        let n = unsafe { libc::write(w, buf.as_ptr().cast(), buf.len()) };
        if n <= 0 {
            // SAFETY: closing fds we own.
            #[allow(unsafe_code)]
            unsafe {
                libc::close(w);
                libc::close(r);
            }
            return Err(std::io::Error::last_os_error());
        }
        buf = &buf[n as usize..];
    }
    // SAFETY: closing the write end we own; `r` stays open and inheritable for the child.
    #[allow(unsafe_code)]
    unsafe {
        libc::close(w);
    }
    Ok(InheritableFd(r))
}

/// An inheritable fd owned by this process; closed on drop. The child must not outlive the
/// spawn call that consumed it.
pub struct InheritableFd(i32);

impl InheritableFd {
    /// Raw fd number for `--seccomp N`.
    pub fn as_raw(&self) -> i32 {
        self.0
    }
}

impl Drop for InheritableFd {
    fn drop(&mut self) {
        // SAFETY: closing an fd this value owns; it is never used afterwards.
        #[allow(unsafe_code)]
        unsafe {
            libc::close(self.0);
        }
    }
}
