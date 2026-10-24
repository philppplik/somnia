//! In-process SSH + SFTP server for tests. Listens on 127.0.0.1 only, serves a temp directory
//! as the whole filesystem (client path `/srv/somnia/x` maps to `<jail>/srv/somnia/x`), and
//! behaves like OpenSSH where it matters: `posix-rename@openssh.com`, `hardlink@openssh.com`
//! and the (target, linkpath) wire order of SFTP symlink. No real server is ever involved.
#![allow(dead_code)]
use russh::{
    keys::{Algorithm, PrivateKey, PublicKey},
    server::{self, Auth, Msg, Server as _, Session},
    Channel, ChannelId,
};
use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Packet, Status, StatusCode, Version,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

pub type ExecFn = dyn Fn(&str, &[u8]) -> (u32, String, String) + Send + Sync;

pub struct ServerState {
    pub jail: PathBuf,
    pub authorized: Mutex<Vec<String>>,
    pub password: Mutex<Option<String>>,
    pub auth_attempts: AtomicUsize,
    pub commands: Mutex<Vec<String>>,
    pub stdins: Mutex<Vec<Vec<u8>>>,
    pub exec: Mutex<Box<ExecFn>>,
    pub exec_delay_ms: AtomicUsize,
    pub posix_rename: std::sync::atomic::AtomicBool,
    pub hardlink: std::sync::atomic::AtomicBool,
    pub sftp_ops: AtomicUsize,
    /// 1-based SFTP request number that fails (and every later one when `fail_from_then_on`).
    pub fail_sftp_op: AtomicUsize,
}

pub struct TestServer {
    pub addr: SocketAddr,
    pub state: Arc<ServerState>,
    pub host_key: PrivateKey,
    _dir: tempfile::TempDir,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl TestServer {
    pub async fn start() -> Self {
        Self::start_with_key(PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap())
            .await
    }
    pub async fn start_with_key(host_key: PrivateKey) -> Self {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("srv/somnia")).unwrap();
        let state = Arc::new(ServerState {
            jail: dir.path().to_path_buf(),
            authorized: Mutex::new(vec![]),
            password: Mutex::new(None),
            auth_attempts: AtomicUsize::new(0),
            commands: Mutex::new(vec![]),
            stdins: Mutex::new(vec![]),
            exec: Mutex::new(Box::new(|_, _| (0, String::new(), String::new()))),
            exec_delay_ms: AtomicUsize::new(0),
            posix_rename: true.into(),
            hardlink: true.into(),
            sftp_ops: AtomicUsize::new(0),
            fail_sftp_op: AtomicUsize::new(0),
        });
        let config = Arc::new(server::Config {
            keys: vec![host_key.clone()],
            auth_rejection_time: std::time::Duration::from_millis(1),
            auth_rejection_time_initial: Some(std::time::Duration::from_millis(1)),
            ..Default::default()
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let mut factory = Factory(state.clone());
        let task = tokio::spawn(async move {
            let _ = factory.run_on_socket(config, &listener).await;
        });
        Self {
            addr,
            state,
            host_key,
            _dir: dir,
            task,
        }
    }
    pub fn authorize(&self, key: &PublicKey) {
        self.state
            .authorized
            .lock()
            .unwrap()
            .push(key.fingerprint(russh::keys::HashAlg::Sha256).to_string());
    }
    pub fn set_password(&self, pw: &str) {
        *self.state.password.lock().unwrap() = Some(pw.into());
    }
    pub fn set_exec(
        &self,
        f: impl Fn(&str, &[u8]) -> (u32, String, String) + Send + Sync + 'static,
    ) {
        *self.state.exec.lock().unwrap() = Box::new(f);
    }
    pub fn path(&self, client_path: &str) -> PathBuf {
        self.state.jail.join(client_path.trim_start_matches('/'))
    }
    pub fn host_fingerprint(&self) -> String {
        self.host_key
            .public_key()
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string()
    }
}

struct Factory(Arc<ServerState>);
impl server::Server for Factory {
    type Handler = Conn;
    fn new_client(&mut self, _: Option<SocketAddr>) -> Conn {
        Conn {
            state: self.0.clone(),
            channels: HashMap::new(),
            pending: HashMap::new(),
        }
    }
}

struct Conn {
    state: Arc<ServerState>,
    channels: HashMap<ChannelId, Channel<Msg>>,
    pending: HashMap<ChannelId, (String, Vec<u8>)>,
}
impl server::Handler for Conn {
    type Error = russh::Error;
    async fn auth_publickey(&mut self, _user: &str, key: &PublicKey) -> Result<Auth, Self::Error> {
        self.state.auth_attempts.fetch_add(1, Ordering::SeqCst);
        let fp = key.fingerprint(russh::keys::HashAlg::Sha256).to_string();
        Ok(if self.state.authorized.lock().unwrap().contains(&fp) {
            Auth::Accept
        } else {
            Auth::reject()
        })
    }
    async fn auth_password(&mut self, _user: &str, password: &str) -> Result<Auth, Self::Error> {
        self.state.auth_attempts.fetch_add(1, Ordering::SeqCst);
        Ok(
            if self.state.password.lock().unwrap().as_deref() == Some(password) {
                Auth::Accept
            } else {
                Auth::reject()
            },
        )
    }
    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: russh::server::ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }
    async fn subsystem_request(
        &mut self,
        id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        if name == "sftp" {
            if let Some(channel) = self.channels.remove(&id) {
                session.channel_success(id)?;
                russh_sftp::server::run(channel.into_stream(), Sftp::new(self.state.clone())).await;
                return Ok(());
            }
        }
        session.channel_failure(id)?;
        Ok(())
    }
    async fn exec_request(
        &mut self,
        id: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.pending
            .insert(id, (String::from_utf8_lossy(data).into_owned(), Vec::new()));
        session.channel_success(id)?;
        Ok(())
    }
    async fn data(
        &mut self,
        id: ChannelId,
        data: &[u8],
        _: &mut Session,
    ) -> Result<(), Self::Error> {
        if let Some((_, stdin)) = self.pending.get_mut(&id) {
            stdin.extend_from_slice(data);
        }
        Ok(())
    }
    async fn channel_eof(
        &mut self,
        id: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        if let Some((command, stdin)) = self.pending.remove(&id) {
            self.state.commands.lock().unwrap().push(command.clone());
            self.state.stdins.lock().unwrap().push(stdin.clone());
            let delay = self.state.exec_delay_ms.load(Ordering::SeqCst);
            if delay > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(delay as u64)).await;
            }
            let (status, out, err) = (self.state.exec.lock().unwrap())(&command, &stdin);
            if !out.is_empty() {
                session.data(id, out.into_bytes())?;
            }
            if !err.is_empty() {
                session.extended_data(id, 1, err.into_bytes())?;
            }
            session.exit_status_request(id, status)?;
            session.eof(id)?;
            session.close(id)?;
        }
        Ok(())
    }
}

enum Open {
    File(std::fs::File),
    Dir(Vec<String>, bool),
}
struct Sftp {
    state: Arc<ServerState>,
    handles: HashMap<String, Open>,
    next: u32,
}
impl Sftp {
    fn new(state: Arc<ServerState>) -> Self {
        Self {
            state,
            handles: HashMap::new(),
            next: 0,
        }
    }
    fn map(&self, path: &str) -> PathBuf {
        self.state.jail.join(path.trim_start_matches('/'))
    }
    /// Counts requests and injects a failure at the configured request number.
    fn tick(&self) -> Result<(), StatusCode> {
        let n = self.state.sftp_ops.fetch_add(1, Ordering::SeqCst) + 1;
        let fail = self.state.fail_sftp_op.load(Ordering::SeqCst);
        if fail != 0 && n == fail {
            return Err(StatusCode::Failure);
        }
        Ok(())
    }
}
fn code(e: std::io::Error) -> StatusCode {
    match e.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}
fn ok(id: u32) -> Status {
    Status {
        id,
        status_code: StatusCode::Ok,
        error_message: "Ok".into(),
        language_tag: "en".into(),
    }
}
fn attrs(path: &Path, follow: bool) -> Result<FileAttributes, StatusCode> {
    let md = if follow {
        std::fs::metadata(path)
    } else {
        std::fs::symlink_metadata(path)
    }
    .map_err(code)?;
    let mut a = FileAttributes::from(&md);
    if md.file_type().is_symlink() {
        a.remove_type(russh_sftp::protocol::FileMode::REG);
        a.set_symlink(true);
    }
    Ok(a)
}
fn read_ssh_strings(mut data: &[u8]) -> Option<Vec<String>> {
    let mut out = vec![];
    while !data.is_empty() {
        let len = u32::from_be_bytes(data.get(..4)?.try_into().ok()?) as usize;
        out.push(String::from_utf8(data.get(4..4 + len)?.to_vec()).ok()?);
        data = &data[4 + len..];
    }
    Some(out)
}

impl russh_sftp::server::Handler for Sftp {
    type Error = StatusCode;
    fn unimplemented(&self) -> StatusCode {
        StatusCode::OpUnsupported
    }
    async fn init(&mut self, _: u32, _: HashMap<String, String>) -> Result<Version, StatusCode> {
        let mut v = Version::new();
        if self.state.posix_rename.load(Ordering::SeqCst) {
            v.extensions
                .insert("posix-rename@openssh.com".into(), "1".into());
        }
        if self.state.hardlink.load(Ordering::SeqCst) {
            v.extensions
                .insert("hardlink@openssh.com".into(), "1".into());
        }
        Ok(v)
    }
    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        a: FileAttributes,
    ) -> Result<Handle, StatusCode> {
        self.tick()?;
        let path = self.map(&filename);
        let mut o = std::fs::OpenOptions::new();
        o.read(pflags.contains(OpenFlags::READ))
            .write(pflags.contains(OpenFlags::WRITE))
            .create(pflags.contains(OpenFlags::CREATE))
            .truncate(pflags.contains(OpenFlags::TRUNCATE));
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            // Like a real server: creation mode is filtered by a umask.
            o.mode(a.permissions.unwrap_or(0o666) & 0o755);
        }
        let file = o.open(path).map_err(code)?;
        self.next += 1;
        let handle = format!("h{}", self.next);
        self.handles.insert(handle.clone(), Open::File(file));
        Ok(Handle { id, handle })
    }
    async fn close(&mut self, id: u32, handle: String) -> Result<Status, StatusCode> {
        self.tick()?;
        self.handles.remove(&handle);
        Ok(ok(id))
    }
    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, StatusCode> {
        self.tick()?;
        use std::io::{Read, Seek, SeekFrom};
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(code)?;
        let mut buf = vec![0u8; len as usize];
        let n = f.read(&mut buf).map_err(code)?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        buf.truncate(n);
        Ok(Data { id, data: buf })
    }
    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, StatusCode> {
        self.tick()?;
        use std::io::{Seek, SeekFrom, Write};
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(code)?;
        f.write_all(&data).map_err(code)?;
        Ok(ok(id))
    }
    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, StatusCode> {
        self.tick()?;
        Ok(Attrs {
            id,
            attrs: attrs(&self.map(&path), false)?,
        })
    }
    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, StatusCode> {
        self.tick()?;
        Ok(Attrs {
            id,
            attrs: attrs(&self.map(&path), true)?,
        })
    }
    async fn setstat(
        &mut self,
        id: u32,
        path: String,
        a: FileAttributes,
    ) -> Result<Status, StatusCode> {
        self.tick()?;
        #[cfg(unix)]
        if let Some(mode) = a.permissions {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                self.map(&path),
                std::fs::Permissions::from_mode(mode & 0o7777),
            )
            .map_err(code)?;
        }
        let _ = a;
        Ok(ok(id))
    }
    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, StatusCode> {
        self.tick()?;
        let mut names = vec![".".to_string(), "..".to_string()];
        for entry in std::fs::read_dir(self.map(&path)).map_err(code)? {
            names.push(
                entry
                    .map_err(code)?
                    .file_name()
                    .to_string_lossy()
                    .into_owned(),
            );
        }
        self.next += 1;
        let handle = format!("h{}", self.next);
        self.handles.insert(handle.clone(), Open::Dir(names, false));
        Ok(Handle { id, handle })
    }
    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, StatusCode> {
        self.tick()?;
        let Some(Open::Dir(names, done)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        if *done {
            return Err(StatusCode::Eof);
        }
        *done = true;
        Ok(Name {
            id,
            files: names.iter().map(|n| File::dummy(n.clone())).collect(),
        })
    }
    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, StatusCode> {
        self.tick()?;
        std::fs::remove_file(self.map(&filename)).map_err(code)?;
        Ok(ok(id))
    }
    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, StatusCode> {
        self.tick()?;
        std::fs::remove_dir(self.map(&path)).map_err(code)?;
        Ok(ok(id))
    }
    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _: FileAttributes,
    ) -> Result<Status, StatusCode> {
        self.tick()?;
        std::fs::create_dir(self.map(&path)).map_err(code)?;
        Ok(ok(id))
    }
    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, StatusCode> {
        Ok(Name {
            id,
            files: vec![File::dummy(path)],
        })
    }
    async fn rename(&mut self, id: u32, old: String, new: String) -> Result<Status, StatusCode> {
        self.tick()?;
        // Plain SFTP rename never replaces an existing target (as in OpenSSH).
        if std::fs::symlink_metadata(self.map(&new)).is_ok() {
            return Err(StatusCode::Failure);
        }
        std::fs::rename(self.map(&old), self.map(&new)).map_err(code)?;
        Ok(ok(id))
    }
    async fn readlink(&mut self, id: u32, path: String) -> Result<Name, StatusCode> {
        self.tick()?;
        let target = std::fs::read_link(self.map(&path)).map_err(code)?;
        Ok(Name {
            id,
            files: vec![File::dummy(target.to_string_lossy().into_owned())],
        })
    }
    /// Wire order is (target, linkpath), like OpenSSH; russh-sftp names the first field `linkpath`.
    async fn symlink(
        &mut self,
        id: u32,
        first: String,
        second: String,
    ) -> Result<Status, StatusCode> {
        self.tick()?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(&first, self.map(&second)).map_err(code)?;
        #[cfg(not(unix))]
        let _ = (first, second);
        Ok(ok(id))
    }
    async fn extended(
        &mut self,
        id: u32,
        request: String,
        data: Vec<u8>,
    ) -> Result<Packet, StatusCode> {
        self.tick()?;
        let args = read_ssh_strings(&data).ok_or(StatusCode::BadMessage)?;
        match (request.as_str(), args.as_slice()) {
            ("posix-rename@openssh.com", [from, to])
                if self.state.posix_rename.load(Ordering::SeqCst) =>
            {
                std::fs::rename(self.map(from), self.map(to)).map_err(code)?;
                Ok(Packet::Status(ok(id)))
            }
            ("hardlink@openssh.com", [from, to]) if self.state.hardlink.load(Ordering::SeqCst) => {
                std::fs::hard_link(self.map(from), self.map(to)).map_err(code)?;
                Ok(Packet::Status(ok(id)))
            }
            _ => Err(StatusCode::OpUnsupported),
        }
    }
}
