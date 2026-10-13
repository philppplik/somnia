//! Same-user local transport (R4-C1). Unix domain socket in a 0700 dir, socket 0600, SO_PEERCRED/getpeereid check.
//! Windows named pipe: name carries the user's SID, DACL grants only the current user, first-instance claim fails
//! closed against squatting, remote clients are rejected at the pipe level, and both ends verify the peer process
//! runs as the same user (process token). Never an HTTP port.
#[cfg(unix)]
pub use unix::*;
#[cfg(windows)]
pub use windows::*;
#[cfg(not(any(unix, windows)))]
pub use stub::*;

#[cfg(unix)]
mod unix {
    use crate::error::{CliError, ErrorKind, Result};
    use std::fs;
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::{Path, PathBuf};

    pub fn runtime_dir() -> Result<PathBuf> {
        let euid = unsafe { libc::geteuid() };
        let dir = match std::env::var_os("XDG_RUNTIME_DIR") {
            Some(d) if !d.is_empty() => PathBuf::from(d).join("somnia"),
            _ => PathBuf::from(format!("/tmp/somnia-{euid}")),
        };
        if !dir.exists() {
            fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir)?;
        }
        let md = fs::symlink_metadata(&dir)?;
        if md.file_type().is_symlink() || md.uid() != euid || md.mode() & 0o077 != 0 {
            return Err(CliError::new(ErrorKind::Internal, "runtime dir is not private to this user; refusing to use it"));
        }
        Ok(dir)
    }

    pub fn socket_path(repo_id: &str, task_id: &str) -> Result<PathBuf> {
        let p = runtime_dir()?.join(format!("{}-{}.sock", &repo_id[..repo_id.len().min(8)], task_id));
        if p.as_os_str().len() > 100 {
            return Err(CliError::new(ErrorKind::Internal, "socket path too long"));
        }
        Ok(p)
    }

    pub struct Listener(pub UnixListener, pub PathBuf);

    pub fn bind(path: &Path) -> Result<Listener> {
        let _ = fs::remove_file(path);
        let l = UnixListener::bind(path)?;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
        Ok(Listener(l, path.to_path_buf()))
    }

    impl Listener {
        /// Accepts one connection and verifies the peer is the same user; foreign peers are dropped silently.
        pub fn accept_same_user(&self) -> Result<Option<UnixStream>> {
            let (s, _) = self.0.accept()?;
            Ok(if peer_is_same_user(&s) { Some(s) } else { None })
        }
    }
    impl Drop for Listener {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.1);
        }
    }

    #[cfg(target_os = "linux")]
    pub fn peer_is_same_user(s: &UnixStream) -> bool {
        use std::os::unix::io::AsRawFd;
        let mut cred = libc::ucred { pid: 0, uid: u32::MAX, gid: 0 };
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        let rc = unsafe { libc::getsockopt(s.as_raw_fd(), libc::SOL_SOCKET, libc::SO_PEERCRED, &mut cred as *mut _ as *mut libc::c_void, &mut len) };
        rc == 0 && cred.uid == unsafe { libc::geteuid() }
    }
    #[cfg(not(target_os = "linux"))]
    pub fn peer_is_same_user(s: &UnixStream) -> bool {
        use std::os::unix::io::AsRawFd;
        let (mut uid, mut gid) = (0 as libc::uid_t, 0 as libc::gid_t);
        unsafe { libc::getpeereid(s.as_raw_fd(), &mut uid, &mut gid) == 0 && uid == libc::geteuid() }
    }

    pub fn connect(path: &Path) -> Result<UnixStream> {
        UnixStream::connect(path).map_err(|e| CliError::new(ErrorKind::NotFound, format!("cannot connect to run socket: {e}")))
    }

    pub fn pid_alive(pid: u32) -> bool {
        unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
    }
    pub type Stream = UnixStream;
}

#[cfg(windows)]
mod windows {
    //! Named-pipe transport. Security model, mirroring the Unix socket rules:
    //!
    //! 1. The pipe name includes the current user's SID, so two users on one machine never share a name.
    //! 2. The first instance is created with `FILE_FLAG_FIRST_PIPE_INSTANCE`: if the name already exists
    //!    (squatted by anyone), bind fails closed instead of talking to a stranger's pipe.
    //! 3. Every instance carries a DACL (`D:P(A;;GA;;;<sid>)`) that grants generic-all to the current user
    //!    only. `PIPE_REJECT_REMOTE_CLIENTS` blocks anything off-machine: this is local IPC, never a network.
    //! 4. The server verifies the client process token (`GetNamedPipeClientProcessId` + token user) and the
    //!    client verifies the server the same way; a mismatch drops/refuses the connection.
    use crate::error::{CliError, ErrorKind, Result};
    use std::io;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use windows_sys::core::PWSTR;
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Security::Authorization::{ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW};
    use windows_sys::Win32::Security::*;
    use windows_sys::Win32::Storage::FileSystem::*;
    use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
    use windows_sys::Win32::System::Pipes::*;
    use windows_sys::Win32::System::Threading::*;

    const PIPE_BUF: u32 = 64 * 1024;
    const MAX_INSTANCES: u32 = 16;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// The current user's SID in string form ("S-1-5-21-..."). Basis for pipe names and DACLs.
    pub fn current_user_sid() -> Result<String> {
        unsafe {
            let mut tok: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut tok) == 0 {
                return Err(CliError::new(ErrorKind::Internal, format!("cannot open own process token: {}", io::Error::last_os_error())));
            }
            let r = token_user_sid(tok);
            CloseHandle(tok);
            r
        }
    }

    /// SID string of the user that owns the process token, or Err (fail closed).
    fn token_user_sid(token: HANDLE) -> Result<String> {
        unsafe {
            let mut need: u32 = 0;
            GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut need);
            if need == 0 {
                return Err(CliError::new(ErrorKind::Internal, format!("cannot size token user: {}", io::Error::last_os_error())));
            }
            // u64 backing so the TOKEN_USER read is aligned.
            let mut buf = vec![0u64; (need as usize + 7) / 8];
            if GetTokenInformation(token, TokenUser, buf.as_mut_ptr() as *mut _, need, &mut need) == 0 {
                return Err(CliError::new(ErrorKind::Internal, format!("cannot read token user: {}", io::Error::last_os_error())));
            }
            let user = &*(buf.as_ptr() as *const TOKEN_USER);
            let mut text: PWSTR = std::ptr::null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut text) == 0 {
                return Err(CliError::new(ErrorKind::Internal, format!("cannot format SID: {}", io::Error::last_os_error())));
            }
            let len = (0..).take_while(|&i| *text.add(i) != 0).count();
            let s = String::from_utf16_lossy(std::slice::from_raw_parts(text as *const u16, len));
            LocalFree(text as HLOCAL);
            Ok(s)
        }
    }

    /// Protected DACL granting generic-all to the current user and nobody else (SDDL).
    pub fn pipe_sddl() -> Result<String> {
        Ok(format!("D:P(A;;GA;;;{})", current_user_sid()?))
    }

    fn build_security_descriptor(sddl: &str) -> Result<Vec<u8>> {
        unsafe {
            let w = wide(sddl);
            let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(w.as_ptr(), 1 /* SDDL_REVISION_1 */, &mut sd, std::ptr::null_mut()) == 0 {
                return Err(CliError::new(ErrorKind::Internal, format!("cannot build pipe security descriptor: {}", io::Error::last_os_error())));
            }
            let len = GetSecurityDescriptorLength(sd) as usize;
            let bytes = std::slice::from_raw_parts(sd as *const u8, len).to_vec();
            LocalFree(sd as HLOCAL);
            Ok(bytes)
        }
    }

    struct PipeHandle(HANDLE);
    impl Drop for PipeHandle {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0); }
        }
    }
    unsafe impl Send for PipeHandle {}
    unsafe impl Sync for PipeHandle {}

    fn create_instance(name: &[u16], sd: &[u8], first: bool) -> Result<PipeHandle> {
        unsafe {
            let sa = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sd.as_ptr() as *mut _,
                bInheritHandle: 0,
            };
            let open_mode = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | if first { FILE_FLAG_FIRST_PIPE_INSTANCE } else { 0 };
            let h = CreateNamedPipeW(
                name.as_ptr(),
                open_mode,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                MAX_INSTANCES,
                PIPE_BUF,
                PIPE_BUF,
                0,
                &sa,
            );
            if h == INVALID_HANDLE_VALUE {
                let e = io::Error::last_os_error();
                return Err(CliError::new(ErrorKind::Internal, format!("cannot create named pipe (the name may be squatted by another process; failing closed): {e}")));
            }
            Ok(PipeHandle(h))
        }
    }

    /// One duplex byte pipe instance, addressable like the Unix `Stream` (Read/Write, clone, read timeout).
    pub struct PipeStream {
        inner: Arc<Inner>,
    }
    struct Inner {
        handle: PipeHandle,
        read_lock: Mutex<()>,
        write_lock: Mutex<()>,
        read_timeout_ms: Mutex<Option<u32>>,
    }

    impl PipeStream {
        fn from_handle(h: PipeHandle) -> Self {
            Self { inner: Arc::new(Inner { handle: h, read_lock: Mutex::new(()), write_lock: Mutex::new(()), read_timeout_ms: Mutex::new(None) }) }
        }
        pub fn set_read_timeout(&self, t: Option<Duration>) -> io::Result<()> {
            let ms = t.map(|d| (d.as_millis().clamp(1, (u32::MAX - 1) as u128)) as u32);
            *self.inner.read_timeout_ms.lock().unwrap() = ms;
            Ok(())
        }
        pub fn try_clone(&self) -> io::Result<PipeStream> {
            Ok(PipeStream { inner: Arc::clone(&self.inner) })
        }
    }

    /// EOF for the pipe-closed family, error otherwise.
    fn read_result(err: u32) -> io::Result<usize> {
        match err {
            ERROR_BROKEN_PIPE | ERROR_PIPE_NOT_CONNECTED | ERROR_NO_DATA => Ok(0),
            e => Err(io::Error::from_raw_os_error(e as i32)),
        }
    }

    fn read_impl(inner: &Arc<Inner>, buf: &mut [u8]) -> io::Result<usize> {
        let _guard = inner.read_lock.lock().unwrap();
        let timeout = *inner.read_timeout_ms.lock().unwrap();
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            if event.is_null() {
                return Err(io::Error::last_os_error());
            }
            let r = (|| {
                let mut ov: OVERLAPPED = std::mem::zeroed();
                ov.hEvent = event;
                let mut n: u32 = 0;
                if ReadFile(inner.handle.0, buf.as_mut_ptr() as *mut _, buf.len() as u32, &mut n, &mut ov) != 0 {
                    return Ok(n as usize);
                }
                let err = GetLastError();
                if err != ERROR_IO_PENDING {
                    return read_result(err);
                }
                let wait = WaitForSingleObject(event, timeout.unwrap_or(INFINITE));
                if wait == WAIT_TIMEOUT {
                    CancelIoEx(inner.handle.0, &ov);
                    // Block until the cancelled op retires so `ov` and `buf` are never touched after return.
                    let mut t: u32 = 0;
                    if GetOverlappedResult(inner.handle.0, &mut ov, &mut t, 1) != 0 && t > 0 {
                        return Ok(t as usize); // the read completed just before the cancel
                    }
                    return Err(io::Error::new(io::ErrorKind::TimedOut, "pipe read timed out"));
                }
                if wait != WAIT_OBJECT_0 {
                    return Err(io::Error::last_os_error());
                }
                let mut t: u32 = 0;
                if GetOverlappedResult(inner.handle.0, &mut ov, &mut t, 1) != 0 {
                    Ok(t as usize)
                } else {
                    read_result(GetLastError())
                }
            })();
            CloseHandle(event);
            r
        }
    }

    fn write_impl(inner: &Arc<Inner>, buf: &[u8]) -> io::Result<usize> {
        let _guard = inner.write_lock.lock().unwrap();
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            if event.is_null() {
                return Err(io::Error::last_os_error());
            }
            let r = (|| {
                let mut ov: OVERLAPPED = std::mem::zeroed();
                ov.hEvent = event;
                let mut n: u32 = 0;
                if WriteFile(inner.handle.0, buf.as_ptr() as *const _, buf.len() as u32, &mut n, &mut ov) != 0 {
                    return Ok(n as usize);
                }
                if GetLastError() != ERROR_IO_PENDING {
                    return Err(io::Error::last_os_error());
                }
                let mut t: u32 = 0;
                if GetOverlappedResult(inner.handle.0, &mut ov, &mut t, 1) != 0 {
                    Ok(t as usize)
                } else {
                    Err(io::Error::last_os_error())
                }
            })();
            CloseHandle(event);
            r
        }
    }

    impl io::Read for PipeStream {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            read_impl(&self.inner, buf)
        }
    }
    impl io::Read for &PipeStream {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            read_impl(&self.inner, buf)
        }
    }
    impl io::Write for PipeStream {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            write_impl(&self.inner, buf)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl io::Write for &PipeStream {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            write_impl(&self.inner, buf)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    pub struct Listener {
        wide_name: Vec<u16>,
        sd: Vec<u8>,
        first: Mutex<Option<PipeHandle>>,
    }

    pub fn bind(path: &Path) -> Result<Listener> {
        let sddl = pipe_sddl()?;
        let sd = build_security_descriptor(&sddl)?;
        let wide_name = wide(&path.to_string_lossy());
        let first = create_instance(&wide_name, &sd, true)?;
        Ok(Listener { wide_name, sd, first: Mutex::new(Some(first)) })
    }

    impl Listener {
        /// Waits for one client, then checks the client process runs as this user. Foreign peers are dropped
        /// silently (the DACL should already keep them out; this is the second gate, like SO_PEERCRED).
        pub fn accept_same_user(&self) -> Result<Option<PipeStream>> {
            let h = match self.first.lock().unwrap().take() {
                Some(h) => h,
                None => create_instance(&self.wide_name, &self.sd, false)?,
            };
            let connected = unsafe {
                let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
                if event.is_null() {
                    return Err(io::Error::last_os_error().into());
                }
                let mut ov: OVERLAPPED = std::mem::zeroed();
                ov.hEvent = event;
                let r = if ConnectNamedPipe(h.0, &mut ov) != 0 {
                    Ok(())
                } else {
                    match GetLastError() {
                        ERROR_PIPE_CONNECTED => Ok(()),
                        ERROR_IO_PENDING => {
                            WaitForSingleObject(event, INFINITE);
                            let mut t: u32 = 0;
                            if GetOverlappedResult(h.0, &mut ov, &mut t, 1) != 0 {
                                Ok(())
                            } else {
                                read_result(GetLastError()).map(|_| ())
                            }
                        }
                        e => read_result(e).map(|_| ()),
                    }
                };
                CloseHandle(event);
                r
            };
            match connected {
                Ok(()) => {
                    let s = PipeStream::from_handle(h);
                    Ok(if peer_is_same_user(&s) { Some(s) } else { None })
                }
                // Client connected and vanished before the pipe settled: drop the instance, keep serving.
                // Unknown errors stay errors (fail closed); only the vanished-client family is tolerated.
                Err(e) if e.raw_os_error().map(|c| [ERROR_BROKEN_PIPE, ERROR_NO_DATA, ERROR_PIPE_NOT_CONNECTED].contains(&(c as u32))).unwrap_or(false) => Ok(None),
                Err(e) => Err(e.into()),
            }
        }
    }

    /// Compares the user of a process (by pid) against the current user. Fail closed on any error.
    fn process_user_is_current(pid: u32) -> bool {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut tok: HANDLE = std::ptr::null_mut();
            let ok = OpenProcessToken(h, TOKEN_QUERY, &mut tok);
            CloseHandle(h);
            if ok == 0 {
                return false;
            }
            let sid = token_user_sid(tok);
            CloseHandle(tok);
            matches!((sid, current_user_sid()), (Ok(a), Ok(b)) if a == b)
        }
    }

    pub fn peer_is_same_user(s: &PipeStream) -> bool {
        unsafe {
            let mut pid: u32 = 0;
            if GetNamedPipeClientProcessId(s.inner.handle.0, &mut pid) == 0 {
                return false;
            }
            process_user_is_current(pid)
        }
    }

    fn server_is_current_user(s: &PipeStream) -> bool {
        unsafe {
            let mut pid: u32 = 0;
            if GetNamedPipeServerProcessId(s.inner.handle.0, &mut pid) == 0 {
                return false;
            }
            process_user_is_current(pid)
        }
    }

    pub fn socket_path(repo_id: &str, task_id: &str) -> Result<PathBuf> {
        let sid = current_user_sid()?;
        let clean: String = task_id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
        Ok(PathBuf::from(format!(r"\\.\pipe\somnia-cli-{}-{}-{}", sid, &repo_id[..repo_id.len().min(8)], clean)))
    }

    pub fn connect(path: &Path) -> Result<PipeStream> {
        let name = wide(&path.to_string_lossy());
        let mut last: Option<io::Error> = None;
        for _ in 0..50 {
            unsafe {
                // SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION: the server may never impersonate this client.
                let h = CreateFileW(
                    name.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
                    std::ptr::null_mut(),
                );
                if h != INVALID_HANDLE_VALUE {
                    let s = PipeStream::from_handle(PipeHandle(h));
                    if !server_is_current_user(&s) {
                        return Err(CliError::new(ErrorKind::Auth, "run pipe is owned by a different user; refusing to connect"));
                    }
                    return Ok(s);
                }
                let e = io::Error::last_os_error();
                let code = e.raw_os_error().unwrap_or(0) as u32;
                last = Some(e);
                match code {
                    ERROR_PIPE_BUSY => {
                        WaitNamedPipeW(name.as_ptr(), 200);
                    }
                    ERROR_FILE_NOT_FOUND => {
                        std::thread::sleep(Duration::from_millis(100)); // listener not up yet
                    }
                    _ => break, // e.g. ACCESS_DENIED from a foreign-owned pipe: fail closed
                }
            }
        }
        let e = last.map(|e| e.to_string()).unwrap_or_else(|| "unknown".into());
        Err(CliError::new(ErrorKind::NotFound, format!("cannot connect to run socket: {e}")))
    }

    pub fn pid_alive(pid: u32) -> bool {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return false;
            }
            let mut code: u32 = 0;
            let alive = GetExitCodeProcess(h, &mut code) != 0 && code == STILL_ACTIVE as u32;
            CloseHandle(h);
            alive
        }
    }

    pub type Stream = PipeStream;
}

#[cfg(not(any(unix, windows)))]
mod stub {
    use crate::error::{CliError, ErrorKind, Result};
    use std::path::{Path, PathBuf};
    pub type Stream = std::net::TcpStream; // never constructed
    pub struct Listener;
    fn unsupported<T>() -> Result<T> {
        Err(CliError::new(ErrorKind::EngineUnavailable, "named-pipe transport is not implemented in this build"))
    }
    pub fn socket_path(_: &str, _: &str) -> Result<PathBuf> { unsupported() }
    pub fn bind(_: &Path) -> Result<Listener> { unsupported() }
    pub fn connect(_: &Path) -> Result<Stream> { unsupported() }
    pub fn pid_alive(_: u32) -> bool { false }
}
