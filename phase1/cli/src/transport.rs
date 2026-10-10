//! Same-user local transport (R4-C1). Unix domain socket in a 0700 dir, socket 0600, SO_PEERCRED/getpeereid check.
//! Never an HTTP port. Windows named-pipe transport is NOT built in this slice (see `cfg(not(unix))` stub).
#[cfg(unix)]
pub use unix::*;
#[cfg(not(unix))]
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

#[cfg(not(unix))]
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
