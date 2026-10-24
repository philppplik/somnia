//! Real SSH/SFTP transport (russh, russh-sftp). Rust side only: the renderer never sees a key,
//! a passphrase, a password or a socket.
//!
//! Guarantees:
//! - Host keys are checked against the app-owned [`HostKeyStore`] during the handshake. An unknown
//!   or changed key aborts the connection before any credential is sent.
//! - Keys come from the keychain via [`DeploymentKey`]; passwords exist only for one connection
//!   and are never stored.
//! - Every SFTP path is confined to the transport root (default `/srv/somnia`), must not contain
//!   `.`/`..`/empty components and must not have a symlink in any ancestor.
//! - Errors are the generic [`DeployError`]; [`ConnectFailure`] adds a coarse, non-sensitive kind
//!   so the UI can pick a plain sentence. Command output is passed through the [`Redactor`].
//! - Nothing here shells out to a local `ssh` binary and no secret is ever placed in argv.
use super::{
    host_keys::{HostKey, HostKeyStatus, HostKeyStore},
    keys::DeploymentKey,
    manifest::{sha256, valid_id},
    redactor::Redactor,
    transport::SshTransport,
    DeployError, Result,
};
use russh::{
    client::{self, Handle},
    keys::{PrivateKeyWithHashAlg, PublicKey},
    ChannelMsg, Disconnect,
};
use russh_sftp::{
    client::{error::Error as SftpError, RawSftpSession},
    protocol::{FileAttributes, OpenFlags, Packet, StatusCode},
};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    time::Duration,
};
use zeroize::Zeroizing;

pub const DEFAULT_ROOT: &str = "/srv/somnia";
const POSIX_RENAME: &str = "posix-rename@openssh.com";
const HARDLINK: &str = "hardlink@openssh.com";
const CHUNK: usize = 32 * 1024;
const WINDOW: usize = 16;
const MAX_FILE: u64 = 256 * 1024 * 1024;
const MAX_OUTPUT: usize = 1024 * 1024;
const MAX_COMMAND: usize = 8 * 1024;
const MAX_TREE_DEPTH: usize = 64;

/// Coarse, non-sensitive reason for a failed connection. Safe to map to a plain sentence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    InvalidInput,
    Unreachable,
    Timeout,
    HostKeyUntrusted,
    HostKeyChanged,
    AuthRejected,
    Protocol,
}

/// Why a connection could not be established. Carries the observed host key when the failure is
/// about trust, so the UI can show the fingerprint (it is not secret).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectFailure {
    pub error: DeployError,
    pub kind: FailureKind,
    pub observed: Option<HostKey>,
    pub pinned: Option<HostKey>,
}
impl ConnectFailure {
    fn new(error: DeployError, kind: FailureKind) -> Self {
        Self {
            error,
            kind,
            observed: None,
            pinned: None,
        }
    }
}
impl std::fmt::Display for ConnectFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.error, f)
    }
}
impl std::error::Error for ConnectFailure {}

#[derive(Debug, Clone)]
pub struct SshTarget {
    pub host: String,
    pub port: u16,
    pub user: String,
}
impl SshTarget {
    pub fn new(host: impl Into<String>, port: u16, user: impl Into<String>) -> Self {
        Self {
            host: host.into(),
            port,
            user: user.into(),
        }
    }
    fn validate(&self) -> std::result::Result<(), ConnectFailure> {
        let host_ok = !self.host.is_empty()
            && self.host.len() <= 253
            && !self.host.starts_with('-')
            && self
                .host
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'));
        let user_ok = !self.user.is_empty()
            && self.user.len() <= 32
            && self
                .user
                .bytes()
                .next()
                .is_some_and(|b| b.is_ascii_lowercase() || b == b'_')
            && self
                .user
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'-'));
        if self.port == 0 || !host_ok || !user_ok {
            return Err(ConnectFailure::new(
                DeployError::InvalidInput,
                FailureKind::InvalidInput,
            ));
        }
        Ok(())
    }
}

/// How to authenticate. A password is only for first-time setup and lives for one connection.
pub enum Credential<'a> {
    Key(&'a DeploymentKey),
    Password(&'a Zeroizing<String>),
}

#[derive(Debug, Clone)]
pub struct ConnectOptions {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub exec_timeout: Duration,
    /// Every SFTP path must live under this directory.
    pub root: String,
}
impl Default for ConnectOptions {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(15),
            request_timeout: Duration::from_secs(30),
            exec_timeout: Duration::from_secs(300),
            root: DEFAULT_ROOT.into(),
        }
    }
}

#[derive(Debug, Clone, Default)]
enum Observation {
    #[default]
    None,
    Trusted,
    Unknown(HostKey),
    Changed {
        pinned: HostKey,
        observed: HostKey,
    },
    Rejected,
}

struct Client {
    host: String,
    port: u16,
    store: Option<Arc<HostKeyStore>>,
    seen: Arc<Mutex<Observation>>,
    observed: Arc<Mutex<Option<HostKey>>>,
}
impl client::Handler for Client {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        key: &russh::keys::PublicKeyOrCertificate,
    ) -> std::result::Result<bool, Self::Error> {
        // Certificates would need a CA trust model; only plain pinned keys are accepted.
        let public: &PublicKey = match key {
            russh::keys::PublicKeyOrCertificate::PublicKey { key, .. } => key,
            _ => {
                *self.seen.lock().unwrap() = Observation::Rejected;
                return Ok(false);
            }
        };
        let observed = HostKey::from_public_key(public);
        *self.observed.lock().unwrap() = Some(observed.clone());
        let Some(store) = &self.store else {
            // Probe mode: record, never continue to authentication.
            *self.seen.lock().unwrap() = Observation::Unknown(observed);
            return Ok(false);
        };
        let verdict = match store.check(&self.host, self.port, &observed) {
            Ok(HostKeyStatus::Trusted) => (Observation::Trusted, true),
            Ok(HostKeyStatus::Unknown { observed }) => (Observation::Unknown(observed), false),
            Ok(HostKeyStatus::Changed { pinned, observed }) => {
                (Observation::Changed { pinned, observed }, false)
            }
            Err(_) => (Observation::Rejected, false),
        };
        *self.seen.lock().unwrap() = verdict.0;
        Ok(verdict.1)
    }
}

fn client_config(opts: &ConnectOptions) -> Arc<client::Config> {
    Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        inactivity_timeout: Some(opts.exec_timeout.max(Duration::from_secs(600))),
        ..Default::default()
    })
}

struct Handshake {
    handle: Handle<Client>,
    observed: Arc<Mutex<Option<HostKey>>>,
}

async fn handshake(
    target: &SshTarget,
    store: Option<Arc<HostKeyStore>>,
    opts: &ConnectOptions,
) -> std::result::Result<Handshake, ConnectFailure> {
    target.validate()?;
    let seen = Arc::new(Mutex::new(Observation::None));
    let observed = Arc::new(Mutex::new(None));
    let client = Client {
        host: target.host.clone(),
        port: target.port,
        store,
        seen: seen.clone(),
        observed: observed.clone(),
    };
    let result = tokio::time::timeout(
        opts.connect_timeout,
        client::connect(
            client_config(opts),
            (target.host.as_str(), target.port),
            client,
        ),
    )
    .await;
    let snapshot = seen.lock().unwrap().clone();
    match (result, snapshot) {
        (Ok(Ok(handle)), Observation::Trusted) => Ok(Handshake { handle, observed }),
        (_, Observation::Changed { pinned, observed }) => Err(ConnectFailure {
            error: DeployError::HostKeyChanged,
            kind: FailureKind::HostKeyChanged,
            observed: Some(observed),
            pinned: Some(pinned),
        }),
        (_, Observation::Unknown(observed)) => Err(ConnectFailure {
            error: DeployError::UntrustedHost,
            kind: FailureKind::HostKeyUntrusted,
            observed: Some(observed),
            pinned: None,
        }),
        (Err(_), _) => Err(ConnectFailure::new(
            DeployError::Transport,
            FailureKind::Timeout,
        )),
        (Ok(Err(_)), Observation::None) => Err(ConnectFailure::new(
            DeployError::Transport,
            FailureKind::Unreachable,
        )),
        (Ok(_), _) => Err(ConnectFailure::new(
            DeployError::Transport,
            FailureKind::Protocol,
        )),
    }
}

/// Read the server's host key without authenticating and without trusting anything.
/// The caller shows the fingerprint, and only after the user confirms calls
/// [`HostKeyStore::trust_new`]. No credential is sent.
pub async fn probe_host_key(
    target: &SshTarget,
    opts: &ConnectOptions,
) -> std::result::Result<HostKey, ConnectFailure> {
    match handshake(target, None, opts).await {
        Err(ConnectFailure {
            kind: FailureKind::HostKeyUntrusted,
            observed: Some(key),
            ..
        }) => Ok(key),
        Err(other) => Err(other),
        Ok(_) => Err(ConnectFailure::new(
            DeployError::Transport,
            FailureKind::Protocol,
        )),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecOutput {
    /// `None` when the remote side closed without an exit status (killed by a signal).
    pub status: Option<u32>,
    /// Redacted, lossy UTF-8, capped at 1 MiB.
    pub stdout: String,
    pub stderr: String,
    /// Redacted lines starting with `SOMNIA_`, taken from the full raw stream before the display
    /// cap, so a long package-manager log cannot push a result marker out of view.
    pub markers: Vec<String>,
    pub truncated: bool,
}
impl ExecOutput {
    pub fn success(&self) -> bool {
        self.status == Some(0)
    }
}

/// Remote command execution. Callers pass allow-listed command templates, never user text.
#[allow(async_fn_in_trait)]
pub trait SshExec {
    async fn exec(&mut self, command: &str, stdin: Option<&[u8]>) -> Result<ExecOutput>;
}

pub struct RusshTransport {
    handle: Handle<Client>,
    sftp: Option<Arc<RawSftpSession>>,
    extensions: HashSet<String>,
    opts: ConnectOptions,
    redactor: Redactor,
    safe_dirs: HashSet<String>,
    pinned: HostKey,
}
impl std::fmt::Debug for RusshTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RusshTransport([REDACTED])")
    }
}

impl RusshTransport {
    /// Connects to a host whose key is already pinned in `store`. Unknown or changed keys fail
    /// before authentication ([`FailureKind::HostKeyUntrusted`] / [`FailureKind::HostKeyChanged`]).
    /// `secrets` are extra strings to scrub from command output (for example a sudo password).
    pub async fn connect(
        target: &SshTarget,
        store: Arc<HostKeyStore>,
        credential: Credential<'_>,
        opts: ConnectOptions,
        secrets: impl IntoIterator<Item = String>,
    ) -> std::result::Result<Self, ConnectFailure> {
        let Handshake {
            mut handle,
            observed,
        } = handshake(target, Some(store), &opts).await?;
        let auth_failure =
            || ConnectFailure::new(DeployError::Transport, FailureKind::AuthRejected);
        let mut redact: Vec<String> = secrets.into_iter().collect();
        let accepted = match credential {
            Credential::Key(key) => {
                let hash = handle
                    .best_supported_rsa_hash()
                    .await
                    .ok()
                    .flatten()
                    .flatten();
                let with_hash =
                    PrivateKeyWithHashAlg::new(Arc::new(key.private_key().clone()), hash);
                handle
                    .authenticate_publickey(target.user.clone(), with_hash)
                    .await
                    .map_err(|_| {
                        ConnectFailure::new(DeployError::Transport, FailureKind::Protocol)
                    })?
            }
            Credential::Password(password) => {
                redact.push(password.as_str().to_owned());
                handle
                    .authenticate_password(target.user.clone(), password.as_str().to_owned())
                    .await
                    .map_err(|_| {
                        ConnectFailure::new(DeployError::Transport, FailureKind::Protocol)
                    })?
            }
        };
        if !accepted.success() {
            let _ = handle.disconnect(Disconnect::ByApplication, "", "en").await;
            return Err(auth_failure());
        }
        // The handshake only succeeds for a pinned key, so the observed key is the pinned one.
        let pinned =
            observed.lock().unwrap().clone().ok_or_else(|| {
                ConnectFailure::new(DeployError::HostStore, FailureKind::Protocol)
            })?;
        Ok(Self {
            handle,
            sftp: None,
            extensions: HashSet::new(),
            opts,
            redactor: Redactor::new(redact),
            safe_dirs: HashSet::new(),
            pinned,
        })
    }

    /// The pinned host key this connection was verified against (for confirmation dialogs).
    pub fn pinned_host_key(&self) -> &HostKey {
        &self.pinned
    }

    pub fn root(&self) -> &str {
        &self.opts.root
    }

    pub async fn close(self) {
        if let Some(sftp) = &self.sftp {
            let _ = sftp.close_session();
        }
        let _ = self
            .handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await;
    }

    async fn sftp(&mut self) -> Result<Arc<RawSftpSession>> {
        if let Some(s) = &self.sftp {
            return Ok(s.clone());
        }
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|_| DeployError::Transport)?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|_| DeployError::Transport)?;
        let cfg = russh_sftp::client::Config {
            request_timeout_secs: self.opts.request_timeout.as_secs().max(1),
            ..Default::default()
        };
        let session = RawSftpSession::new_with_config(channel.into_stream(), cfg);
        let version = session.init().await.map_err(|_| DeployError::Transport)?;
        self.extensions = version
            .extensions
            .iter()
            .filter(|(_, v)| v.as_str() == "1")
            .map(|(k, _)| k.clone())
            .collect();
        let session = Arc::new(session);
        self.sftp = Some(session.clone());
        Ok(session)
    }

    // ---- path confinement ----

    fn lexical(&self, path: &str) -> Result<Vec<String>> {
        let rest = path
            .strip_prefix(&self.opts.root)
            .and_then(|r| r.strip_prefix('/'))
            .ok_or(DeployError::InvalidInput)?;
        if path.contains(['\\', '\0']) || rest.is_empty() {
            return Err(DeployError::InvalidInput);
        }
        let parts: Vec<String> = rest.split('/').map(str::to_owned).collect();
        if parts.iter().any(|p| p.is_empty() || p == "." || p == "..") {
            return Err(DeployError::InvalidInput);
        }
        Ok(parts)
    }

    /// Lexical check plus: no ancestor (excluding the root and the leaf itself) is a symlink.
    async fn safe(&mut self, path: &str) -> Result<Arc<RawSftpSession>> {
        let parts = self.lexical(path)?;
        let sftp = self.sftp().await?;
        let mut current = self.opts.root.clone();
        for part in &parts[..parts.len() - 1] {
            current.push('/');
            current.push_str(part);
            if self.safe_dirs.contains(&current) {
                continue;
            }
            match lstat(&sftp, &current).await? {
                Some(Kind::Dir) => {
                    self.safe_dirs.insert(current.clone());
                }
                Some(_) => return Err(DeployError::InvalidInput),
                None => break,
            }
        }
        Ok(sftp)
    }

    async fn parent_is_dir(&self, sftp: &RawSftpSession, path: &str) -> Result<()> {
        let parent = path.rsplit_once('/').ok_or(DeployError::InvalidInput)?.0;
        if parent == self.opts.root {
            return Ok(());
        }
        match lstat(sftp, parent).await? {
            Some(Kind::Dir) => Ok(()),
            _ => Err(DeployError::Transport),
        }
    }

    async fn read_range(
        sftp: &Arc<RawSftpSession>,
        handle: &str,
        offset: u64,
        len: usize,
    ) -> Result<Vec<u8>> {
        let mut out = Vec::with_capacity(len);
        while out.len() < len {
            match sftp
                .read(handle, offset + out.len() as u64, (len - out.len()) as u32)
                .await
            {
                Ok(data) if !data.data.is_empty() => out.extend_from_slice(&data.data),
                Ok(_) => break,
                Err(SftpError::Status(s)) if s.status_code == StatusCode::Eof => break,
                Err(_) => return Err(DeployError::Transport),
            }
        }
        Ok(out)
    }

    fn drop_cache(&mut self) {
        self.safe_dirs.clear();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Dir,
    File,
    Symlink,
    Other,
}

async fn lstat(sftp: &RawSftpSession, path: &str) -> Result<Option<Kind>> {
    match sftp.lstat(path).await {
        Ok(a) => {
            let t = a.attrs.file_type();
            Ok(Some(if t.is_dir() {
                Kind::Dir
            } else if t.is_symlink() {
                Kind::Symlink
            } else if t.is_file() {
                Kind::File
            } else {
                Kind::Other
            }))
        }
        Err(SftpError::Status(s)) if s.status_code == StatusCode::NoSuchFile => Ok(None),
        Err(_) => Err(DeployError::Transport),
    }
}

async fn lstat_size(sftp: &RawSftpSession, path: &str) -> Result<(Kind, u64)> {
    let a = sftp.lstat(path).await.map_err(|_| DeployError::Transport)?;
    let t = a.attrs.file_type();
    let kind = if t.is_dir() {
        Kind::Dir
    } else if t.is_symlink() {
        Kind::Symlink
    } else if t.is_file() {
        Kind::File
    } else {
        Kind::Other
    };
    Ok((kind, a.attrs.size.unwrap_or(0)))
}

fn ssh_string(value: &str, out: &mut Vec<u8>) {
    out.extend_from_slice(&(value.len() as u32).to_be_bytes());
    out.extend_from_slice(value.as_bytes());
}

fn perms(mode: u32) -> FileAttributes {
    FileAttributes {
        permissions: Some(mode),
        ..Default::default()
    }
}

impl SshTransport for RusshTransport {
    async fn mkdir(&mut self, path: &str) -> Result<()> {
        let parts = self.lexical(path)?;
        let sftp = self.safe(path).await?;
        let mut current = self.opts.root.clone();
        for part in &parts {
            current.push('/');
            current.push_str(part);
            match lstat(&sftp, &current).await? {
                Some(Kind::Dir) => {}
                Some(_) => return Err(DeployError::Transport),
                None => {
                    if sftp.mkdir(current.clone(), perms(0o755)).await.is_err()
                        && lstat(&sftp, &current).await? != Some(Kind::Dir)
                    {
                        return Err(DeployError::Transport);
                    }
                }
            }
        }
        Ok(())
    }

    async fn read(&mut self, path: &str) -> Result<Vec<u8>> {
        let sftp = self.safe(path).await?;
        let (kind, size) = lstat_size(&sftp, path).await?;
        if kind != Kind::File || size > MAX_FILE {
            return Err(DeployError::Transport);
        }
        let handle = sftp
            .open(path, OpenFlags::READ, FileAttributes::default())
            .await
            .map_err(|_| DeployError::Transport)?
            .handle;
        let result = async {
            let mut out = Vec::with_capacity(size as usize);
            let mut offset = 0u64;
            while offset < size {
                let mut set = tokio::task::JoinSet::new();
                let mut starts = Vec::new();
                for i in 0..WINDOW as u64 {
                    let start = offset + i * CHUNK as u64;
                    if start >= size {
                        break;
                    }
                    let len = (size - start).min(CHUNK as u64) as usize;
                    starts.push(start);
                    let (s, h) = (sftp.clone(), handle.clone());
                    set.spawn(async move {
                        (start, RusshTransport::read_range(&s, &h, start, len).await)
                    });
                }
                let mut parts = Vec::new();
                while let Some(joined) = set.join_next().await {
                    let (start, data) = joined.map_err(|_| DeployError::Transport)?;
                    parts.push((start, data?));
                }
                parts.sort_by_key(|(s, _)| *s);
                for (start, data) in parts {
                    let expected = (size - start).min(CHUNK as u64) as usize;
                    if data.len() != expected {
                        return Err(DeployError::Transport);
                    }
                    out.extend_from_slice(&data);
                }
                offset += starts.len() as u64 * CHUNK as u64;
            }
            Ok::<_, DeployError>(out)
        }
        .await;
        let _ = sftp.close(handle).await;
        result
    }

    async fn write(&mut self, path: &str, bytes: &[u8], mode: u32) -> Result<()> {
        if !matches!(mode, 0o600 | 0o644 | 0o755) || bytes.len() as u64 > MAX_FILE {
            // Validate before touching the network, like the mock.
            self.lexical(path)?;
            return Err(DeployError::InvalidInput);
        }
        let sftp = self.safe(path).await?;
        self.parent_is_dir(&sftp, path).await?;
        if matches!(lstat(&sftp, path).await?, Some(Kind::Dir | Kind::Symlink)) {
            return Err(DeployError::InvalidInput);
        }
        let handle = sftp
            .open(
                path,
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE,
                perms(mode),
            )
            .await
            .map_err(|_| DeployError::Transport)?
            .handle;
        let result = async {
            let data: Arc<[u8]> = Arc::from(bytes);
            let mut offset = 0usize;
            while offset < data.len() {
                let mut set = tokio::task::JoinSet::new();
                let mut next = offset;
                for _ in 0..WINDOW {
                    if next >= data.len() {
                        break;
                    }
                    let end = (next + CHUNK).min(data.len());
                    let (s, h, d, start) = (sftp.clone(), handle.clone(), data.clone(), next);
                    set.spawn(
                        async move { s.write(h, start as u64, d[start..end].to_vec()).await },
                    );
                    next = end;
                }
                while let Some(joined) = set.join_next().await {
                    joined
                        .map_err(|_| DeployError::Transport)?
                        .map_err(|_| DeployError::Transport)?;
                }
                offset = next;
            }
            // The server umask may have narrowed the creation mode; set it explicitly.
            sftp.setstat(path, perms(mode))
                .await
                .map_err(|_| DeployError::Transport)?;
            Ok::<_, DeployError>(())
        }
        .await;
        let closed = sftp.close(handle).await.is_ok();
        result?;
        if !closed {
            return Err(DeployError::Transport);
        }
        Ok(())
    }

    async fn hash(&mut self, path: &str) -> Result<String> {
        Ok(sha256(&self.read(path).await?))
    }

    async fn hard_link(&mut self, from: &str, to: &str) -> Result<()> {
        let sftp = self.safe(from).await?;
        self.lexical(to)?;
        let sftp_to = self.safe(to).await?;
        debug_assert!(Arc::ptr_eq(&sftp, &sftp_to));
        self.parent_is_dir(&sftp, to).await?;
        if !self.extensions.contains(HARDLINK)
            || lstat(&sftp, from).await? != Some(Kind::File)
            || lstat(&sftp, to).await?.is_some()
        {
            return Err(DeployError::Transport);
        }
        sftp.hardlink(from, to)
            .await
            .map_err(|_| DeployError::Transport)?;
        Ok(())
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        let sftp = self.safe(from).await?;
        self.safe(to).await?;
        self.parent_is_dir(&sftp, to).await?;
        // Plain SFTP rename fails when the target exists. Only the OpenSSH extension is a real
        // atomic POSIX rename(2), so there is deliberately no delete-then-rename fallback.
        if !self.extensions.contains(POSIX_RENAME) {
            return Err(DeployError::Transport);
        }
        if lstat(&sftp, from).await?.is_none() || lstat(&sftp, to).await? == Some(Kind::Dir) {
            return Err(DeployError::Transport);
        }
        let mut data = Vec::new();
        ssh_string(from, &mut data);
        ssh_string(to, &mut data);
        let reply = sftp
            .extended(POSIX_RENAME, data)
            .await
            .map_err(|_| DeployError::Transport)?;
        self.drop_cache();
        match reply {
            Packet::Status(s) if s.status_code == StatusCode::Ok => Ok(()),
            _ => Err(DeployError::Transport),
        }
    }

    async fn symlink(&mut self, target: &str, path: &str) -> Result<()> {
        let sftp = self.safe(path).await?;
        self.parent_is_dir(&sftp, path).await?;
        if !target.starts_with("releases/")
            || !valid_id(&target["releases/".len()..])
            || lstat(&sftp, path).await?.is_some()
        {
            return Err(DeployError::InvalidInput);
        }
        // OpenSSH's sftp-server reads (target, linkpath) in that wire order, which is the reverse
        // of the argument names in russh-sftp, so the target goes first.
        sftp.symlink(target, path)
            .await
            .map_err(|_| DeployError::Transport)?;
        self.drop_cache();
        Ok(())
    }

    async fn read_link(&mut self, path: &str) -> Result<Option<String>> {
        let sftp = self.safe(path).await?;
        match lstat(&sftp, path).await? {
            None => Ok(None),
            Some(Kind::Symlink) => {
                let name = sftp
                    .readlink(path)
                    .await
                    .map_err(|_| DeployError::Transport)?;
                Ok(name.files.first().map(|f| f.filename.clone()))
            }
            Some(_) => Err(DeployError::Transport),
        }
    }

    async fn exists(&mut self, path: &str) -> Result<bool> {
        let sftp = self.safe(path).await?;
        Ok(lstat(&sftp, path).await?.is_some())
    }

    async fn list(&mut self, path: &str) -> Result<Vec<String>> {
        let sftp = self.safe(path).await?;
        if lstat(&sftp, path).await? != Some(Kind::Dir) {
            return Err(DeployError::Transport);
        }
        list_dir(&sftp, path).await
    }

    async fn remove_tree(&mut self, path: &str) -> Result<()> {
        let sftp = self.safe(path).await?;
        remove_recursive(&sftp, path, 0).await?;
        self.drop_cache();
        Ok(())
    }
}

async fn list_dir(sftp: &RawSftpSession, path: &str) -> Result<Vec<String>> {
    let handle = sftp
        .opendir(path)
        .await
        .map_err(|_| DeployError::Transport)?
        .handle;
    let mut names = Vec::new();
    let result = loop {
        match sftp.readdir(handle.clone()).await {
            Ok(batch) => names.extend(
                batch
                    .files
                    .into_iter()
                    .map(|f| f.filename)
                    .filter(|n| n != "." && n != ".."),
            ),
            Err(SftpError::Status(s)) if s.status_code == StatusCode::Eof => break Ok(()),
            Err(_) => break Err(DeployError::Transport),
        }
    };
    let _ = sftp.close(handle).await;
    result?;
    if names
        .iter()
        .any(|n| n.is_empty() || n.contains(['/', '\0']))
    {
        return Err(DeployError::Transport);
    }
    names.sort();
    names.dedup();
    Ok(names)
}

fn remove_recursive<'a>(
    sftp: &'a RawSftpSession,
    path: &'a str,
    depth: usize,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        if depth > MAX_TREE_DEPTH {
            return Err(DeployError::Transport);
        }
        match lstat(sftp, path).await? {
            None => Ok(()),
            // Symlinks are removed as links, never followed.
            Some(Kind::File | Kind::Symlink | Kind::Other) => sftp
                .remove(path)
                .await
                .map(|_| ())
                .map_err(|_| DeployError::Transport),
            Some(Kind::Dir) => {
                for name in list_dir(sftp, path).await? {
                    remove_recursive(sftp, &format!("{path}/{name}"), depth + 1).await?;
                }
                sftp.rmdir(path)
                    .await
                    .map(|_| ())
                    .map_err(|_| DeployError::Transport)
            }
        }
    })
}

impl SshExec for RusshTransport {
    async fn exec(&mut self, command: &str, stdin: Option<&[u8]>) -> Result<ExecOutput> {
        if command.is_empty() || command.len() > MAX_COMMAND || command.contains('\0') {
            return Err(DeployError::InvalidInput);
        }
        let mut channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|_| DeployError::Transport)?;
        channel
            .exec(true, command.as_bytes().to_vec())
            .await
            .map_err(|_| DeployError::Transport)?;
        if let Some(input) = stdin {
            channel
                .data_bytes(input.to_vec())
                .await
                .map_err(|_| DeployError::Transport)?;
        }
        // Always close stdin so a command that reads it cannot hang.
        channel.eof().await.map_err(|_| DeployError::Transport)?;
        let collect = async {
            let (mut out, mut err) = (Vec::new(), Vec::new());
            let (mut status, mut truncated) = (None, false);
            while let Some(msg) = channel.wait().await {
                match msg {
                    ChannelMsg::Data { data } => append(&mut out, &data, &mut truncated),
                    ChannelMsg::ExtendedData { data, .. } => {
                        append(&mut err, &data, &mut truncated)
                    }
                    ChannelMsg::ExitStatus { exit_status } => status = Some(exit_status),
                    ChannelMsg::Close => break,
                    _ => {}
                }
            }
            (status, out, err, truncated)
        };
        let (status, out, err, truncated) =
            match tokio::time::timeout(self.opts.exec_timeout, collect).await {
                Ok(v) => v,
                Err(_) => {
                    let _ = channel.close().await;
                    return Err(DeployError::Transport);
                }
            };
        let _ = channel.close().await;
        let raw = String::from_utf8_lossy(&out);
        let markers = raw
            .lines()
            .filter(|l| l.starts_with("SOMNIA_") && l.len() <= 200)
            .take(200)
            .map(|l| self.redactor.redact(l))
            .collect();
        Ok(ExecOutput {
            status,
            markers,
            stdout: self.redactor.redact(&raw),
            stderr: self.redactor.redact(&String::from_utf8_lossy(&err)),
            truncated,
        })
    }
}

fn append(buffer: &mut Vec<u8>, data: &[u8], truncated: &mut bool) {
    let room = MAX_OUTPUT.saturating_sub(buffer.len());
    if data.len() > room {
        *truncated = true;
    }
    buffer.extend_from_slice(&data[..data.len().min(room)]);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::{
        host_keys::HostKeyStore,
        keys::KeyStore,
        manifest::{DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest},
        release::ReleaseLayout,
        ssh_testkit::TestServer,
    };
    use crate::oauth_store::SecretBackend;
    use std::{collections::BTreeMap, sync::atomic::Ordering};

    /// In-memory keychain so key loading goes through the real `KeyStore`.
    #[derive(Default)]
    struct Mem(Mutex<BTreeMap<String, String>>);
    impl SecretBackend for Mem {
        fn get(
            &self,
            slot: &str,
        ) -> std::result::Result<Option<String>, crate::oauth_store::StoreError> {
            Ok(self.0.lock().unwrap().get(slot).cloned())
        }
        fn set(
            &self,
            slot: &str,
            value: &str,
        ) -> std::result::Result<(), crate::oauth_store::StoreError> {
            self.0.lock().unwrap().insert(slot.into(), value.into());
            Ok(())
        }
        fn delete(&self, slot: &str) -> std::result::Result<(), crate::oauth_store::StoreError> {
            self.0.lock().unwrap().remove(slot);
            Ok(())
        }
    }

    struct Fixture {
        server: TestServer,
        store: Arc<HostKeyStore>,
        key: DeploymentKey,
        target: SshTarget,
    }
    async fn fixture() -> Fixture {
        let server = TestServer::start().await;
        let keys = KeyStore::new(Mem::default());
        keys.create("site").unwrap();
        let key = keys.load("site").unwrap();
        server.authorize(key.private_key().public_key());
        let store = Arc::new(HostKeyStore::default());
        let target = SshTarget::new("127.0.0.1", server.addr.port(), "somnia");
        Fixture {
            server,
            store,
            key,
            target,
        }
    }
    async fn trusted(f: &Fixture) -> RusshTransport {
        let observed = HostKey::from_public_key(f.server.host_key.public_key());
        f.store
            .trust_new("127.0.0.1", f.target.port, &observed)
            .unwrap();
        RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&f.key),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap()
    }
    const SITE: &str = "/srv/somnia/site";

    #[tokio::test]
    async fn probe_reads_the_fingerprint_and_never_authenticates() {
        let f = fixture().await;
        let key = probe_host_key(&f.target, &ConnectOptions::default())
            .await
            .unwrap();
        assert_eq!(key.fingerprint, f.server.host_fingerprint());
        assert_eq!(key.algorithm, "ssh-ed25519");
        assert_eq!(f.server.state.auth_attempts.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn unknown_host_stops_before_any_credential_is_sent() {
        let f = fixture().await;
        let err = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&f.key),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap_err();
        assert_eq!(err.error, DeployError::UntrustedHost);
        assert_eq!(err.kind, FailureKind::HostKeyUntrusted);
        assert_eq!(
            err.observed.unwrap().fingerprint,
            f.server.host_fingerprint()
        );
        assert_eq!(f.server.state.auth_attempts.load(Ordering::SeqCst), 0);
        // After the user pins the key the same call works.
        let t = trusted(&f).await;
        assert_eq!(t.pinned_host_key().fingerprint, f.server.host_fingerprint());
        t.close().await;
    }

    #[tokio::test]
    async fn changed_host_key_is_a_hard_stop_with_both_fingerprints() {
        let f = fixture().await;
        let other =
            russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)
                .unwrap();
        f.store
            .trust_new(
                "127.0.0.1",
                f.target.port,
                &HostKey::from_public_key(other.public_key()),
            )
            .unwrap();
        let err = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&f.key),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap_err();
        assert_eq!(err.kind, FailureKind::HostKeyChanged);
        assert_eq!(err.error, DeployError::HostKeyChanged);
        assert_eq!(
            err.pinned.unwrap().fingerprint,
            HostKey::from_public_key(other.public_key()).fingerprint
        );
        assert_eq!(
            err.observed.unwrap().fingerprint,
            f.server.host_fingerprint()
        );
        assert_eq!(f.server.state.auth_attempts.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn rejected_key_and_wrong_password_are_auth_failures() {
        let f = fixture().await;
        let stranger = KeyStore::new(Mem::default());
        stranger.create("x").unwrap();
        let stranger = stranger.load("x").unwrap();
        f.store
            .trust_new(
                "127.0.0.1",
                f.target.port,
                &HostKey::from_public_key(f.server.host_key.public_key()),
            )
            .unwrap();
        let e = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&stranger),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap_err();
        assert_eq!(e.kind, FailureKind::AuthRejected);
        f.server.set_password("right");
        let wrong = Zeroizing::new("wrong".to_owned());
        let e = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Password(&wrong),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap_err();
        assert_eq!(e.kind, FailureKind::AuthRejected);
        assert!(!format!("{e:?}{e}").contains("wrong"));
    }

    #[tokio::test]
    async fn unreachable_and_invalid_targets_fail_fast() {
        let store = Arc::new(HostKeyStore::default());
        let keys = KeyStore::new(Mem::default());
        keys.create("a").unwrap();
        let key = keys.load("a").unwrap();
        // Port 1 on loopback refuses immediately; nothing real is contacted.
        let e = RusshTransport::connect(
            &SshTarget::new("127.0.0.1", 1, "somnia"),
            store.clone(),
            Credential::Key(&key),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap_err();
        assert_eq!(e.kind, FailureKind::Unreachable);
        for target in [
            SshTarget::new("-oProxyCommand=x", 22, "somnia"),
            SshTarget::new("host name", 22, "somnia"),
            SshTarget::new("example.com", 0, "somnia"),
            SshTarget::new("example.com", 22, "Root"),
            SshTarget::new("example.com", 22, "a;b"),
        ] {
            let e = RusshTransport::connect(
                &target,
                store.clone(),
                Credential::Key(&key),
                ConnectOptions::default(),
                [],
            )
            .await
            .unwrap_err();
            assert_eq!(e.kind, FailureKind::InvalidInput, "{target:?}");
        }
    }

    #[tokio::test]
    async fn files_round_trip_with_pipelined_io_and_modes() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        t.mkdir(&format!("{SITE}/releases/r-1/assets"))
            .await
            .unwrap();
        t.mkdir(&format!("{SITE}/releases/r-1/assets"))
            .await
            .unwrap(); // idempotent
                       // Odd size across many chunks and several pipeline windows.
        let big: Vec<u8> = (0..(32 * 1024 * 40 + 777))
            .map(|i| (i * 31 % 251) as u8)
            .collect();
        let p = format!("{SITE}/releases/r-1/assets/big.bin");
        t.write(&p, &big, 0o644).await.unwrap();
        assert_eq!(t.read(&p).await.unwrap(), big);
        assert_eq!(
            t.hash(&p).await.unwrap(),
            crate::deploy::manifest::sha256(&big)
        );
        t.write(&format!("{SITE}/releases/r-1/empty"), b"", 0o600)
            .await
            .unwrap();
        assert_eq!(
            t.read(&format!("{SITE}/releases/r-1/empty")).await.unwrap(),
            b""
        );
        t.write(&p, b"short", 0o755).await.unwrap(); // overwrite truncates
        assert_eq!(t.read(&p).await.unwrap(), b"short");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = |c: &str| {
                std::fs::metadata(f.server.path(c))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777
            };
            assert_eq!(mode(&p), 0o755);
            assert_eq!(mode(&format!("{SITE}/releases/r-1/empty")), 0o600);
        }
        assert_eq!(
            t.list(&format!("{SITE}/releases/r-1")).await.unwrap(),
            ["assets", "empty"]
        );
        assert!(t.exists(&p).await.unwrap());
        assert!(!t.exists(&format!("{SITE}/nope")).await.unwrap());
        // Same rejections as the mock.
        assert!(t.write(&p, b"x", 0o777).await.is_err());
        assert!(t
            .write(&format!("{SITE}/no-parent/x"), b"x", 0o644)
            .await
            .is_err());
        assert!(t
            .write(&format!("{SITE}/releases/r-1/assets"), b"x", 0o644)
            .await
            .is_err());
        assert!(t
            .read(&format!("{SITE}/releases/r-1/assets"))
            .await
            .is_err());
        assert!(t.list(&p).await.is_err());
        t.close().await;
    }

    #[tokio::test]
    async fn paths_outside_the_root_never_reach_the_server() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        std::fs::write(f.server.path("/outside.txt"), b"keep").unwrap();
        for path in [
            "/etc/passwd",
            "/srv/somnia",
            "/srv/somnia/",
            "/srv/somnia2/x",
            "/srv/somnia/../outside.txt",
            "/srv/somnia/site/../../outside.txt",
            "/srv/somnia/site/./x",
            "/srv/somnia//x",
            "/srv/somnia/x\\y",
            "/srv/somnia/x\0y",
            "relative/path",
        ] {
            assert_eq!(
                t.write(path, b"never", 0o644).await.unwrap_err(),
                DeployError::InvalidInput,
                "{path:?}"
            );
            assert!(t.read(path).await.is_err());
            assert!(t.mkdir(path).await.is_err());
            assert!(t.remove_tree(path).await.is_err());
            assert!(t.exists(path).await.is_err());
        }
        assert_eq!(
            std::fs::read(f.server.path("/outside.txt")).unwrap(),
            b"keep"
        );
        assert_eq!(
            std::fs::read_dir(f.server.path("/srv/somnia"))
                .unwrap()
                .count(),
            0
        );
        assert!(t
            .symlink("../../etc", &format!("{SITE}/evil"))
            .await
            .is_err());
        assert!(t
            .symlink("releases/a/../../b", &format!("{SITE}/evil"))
            .await
            .is_err());
        t.close().await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn symlinked_ancestors_are_rejected_even_when_created_behind_our_back() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        t.mkdir(&format!("{SITE}/releases/r-1")).await.unwrap();
        t.symlink("releases/r-1", &format!("{SITE}/current"))
            .await
            .unwrap();
        for path in [
            format!("{SITE}/current/index.html"),
            format!("{SITE}/current/sub/x"),
        ] {
            assert!(t.write(&path, b"never", 0o644).await.is_err());
            assert!(t.read(&path).await.is_err());
            assert!(t.mkdir(&path).await.is_err());
        }
        // A directory swapped for a symlink after we cached it is caught again after mutations.
        std::fs::create_dir_all(f.server.path("/outside")).unwrap();
        t.mkdir(&format!("{SITE}/releases/r-2/inner"))
            .await
            .unwrap();
        t.write(&format!("{SITE}/releases/r-2/inner/ok"), b"ok", 0o644)
            .await
            .unwrap();
        t.remove_tree(&format!("{SITE}/releases/r-2/inner"))
            .await
            .unwrap();
        std::os::unix::fs::symlink(
            "/outside",
            f.server.path(&format!("{SITE}/releases/r-2/inner")),
        )
        .unwrap();
        assert!(t
            .write(&format!("{SITE}/releases/r-2/inner/pwn"), b"never", 0o644)
            .await
            .is_err());
        assert!(!f.server.path("/outside/pwn").exists());
        t.close().await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn symlink_switch_is_a_real_atomic_posix_rename() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        for id in ["r-1", "r-2"] {
            t.mkdir(&format!("{SITE}/releases/{id}")).await.unwrap();
        }
        let current = format!("{SITE}/current");
        assert_eq!(t.read_link(&current).await.unwrap(), None);
        t.symlink("releases/r-1", &current).await.unwrap();
        assert_eq!(
            t.read_link(&current).await.unwrap().as_deref(),
            Some("releases/r-1")
        );
        // Replacing an existing symlink by rename must work and never leave `current` absent.
        t.symlink("releases/r-2", &format!("{current}.new"))
            .await
            .unwrap();
        t.rename(&format!("{current}.new"), &current).await.unwrap();
        assert_eq!(
            t.read_link(&current).await.unwrap().as_deref(),
            Some("releases/r-2")
        );
        assert!(!t.exists(&format!("{current}.new")).await.unwrap());
        // Bad targets and existing paths are refused.
        assert!(t.symlink("releases/r-1", &current).await.is_err());
        assert!(t.symlink("/etc", &format!("{SITE}/x")).await.is_err());
        assert!(t
            .symlink("releases/UPPER", &format!("{SITE}/x"))
            .await
            .is_err());
        // Renaming onto an existing directory is refused, not merged.
        assert!(t
            .rename(
                &format!("{SITE}/releases/r-1"),
                &format!("{SITE}/releases/r-2")
            )
            .await
            .is_err());
        assert!(t.read_link(&format!("{SITE}/releases/r-1")).await.is_err());
        t.close().await;
    }

    #[tokio::test]
    async fn rename_never_degrades_to_non_atomic_when_the_extension_is_missing() {
        let f = fixture().await;
        f.server.state.posix_rename.store(false, Ordering::SeqCst);
        let mut t = trusted(&f).await;
        t.mkdir(&format!("{SITE}/a")).await.unwrap();
        t.write(&format!("{SITE}/a/f"), b"1", 0o644).await.unwrap();
        assert_eq!(
            t.rename(&format!("{SITE}/a"), &format!("{SITE}/b"))
                .await
                .unwrap_err(),
            DeployError::Transport
        );
        assert!(t.exists(&format!("{SITE}/a/f")).await.unwrap());
        t.close().await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn hard_links_share_the_inode_and_refuse_overwrites() {
        use std::os::unix::fs::MetadataExt;
        let f = fixture().await;
        let mut t = trusted(&f).await;
        t.mkdir(&format!("{SITE}/releases/r-1")).await.unwrap();
        t.mkdir(&format!("{SITE}/releases/r-2")).await.unwrap();
        let (a, b) = (
            format!("{SITE}/releases/r-1/f"),
            format!("{SITE}/releases/r-2/f"),
        );
        t.write(&a, b"data", 0o644).await.unwrap();
        t.hard_link(&a, &b).await.unwrap();
        assert_eq!(
            std::fs::metadata(f.server.path(&a)).unwrap().ino(),
            std::fs::metadata(f.server.path(&b)).unwrap().ino()
        );
        assert!(t.hard_link(&a, &b).await.is_err());
        assert!(t
            .hard_link(
                &format!("{SITE}/releases/r-1"),
                &format!("{SITE}/releases/r-2/d")
            )
            .await
            .is_err());
        f.server.state.hardlink.store(false, Ordering::SeqCst);
        let mut t2 = trusted_again(&f).await;
        assert!(t2
            .hard_link(&a, &format!("{SITE}/releases/r-2/g"))
            .await
            .is_err());
        t.close().await;
        t2.close().await;
    }
    async fn trusted_again(f: &Fixture) -> RusshTransport {
        RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&f.key),
            ConnectOptions::default(),
            [],
        )
        .await
        .unwrap()
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn remove_tree_removes_links_without_following_them() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        std::fs::create_dir_all(f.server.path("/precious")).unwrap();
        std::fs::write(f.server.path("/precious/keep"), b"keep").unwrap();
        t.mkdir(&format!("{SITE}/releases/r-1.partial/deep/er"))
            .await
            .unwrap();
        t.write(
            &format!("{SITE}/releases/r-1.partial/deep/er/f"),
            b"x",
            0o644,
        )
        .await
        .unwrap();
        std::os::unix::fs::symlink(
            "/precious",
            f.server
                .path(&format!("{SITE}/releases/r-1.partial/deep/link")),
        )
        .unwrap();
        t.remove_tree(&format!("{SITE}/releases/r-1.partial"))
            .await
            .unwrap();
        assert!(!t
            .exists(&format!("{SITE}/releases/r-1.partial"))
            .await
            .unwrap());
        assert_eq!(
            std::fs::read(f.server.path("/precious/keep")).unwrap(),
            b"keep"
        );
        t.remove_tree(&format!("{SITE}/releases/missing"))
            .await
            .unwrap(); // absent is fine
        t.close().await;
    }

    fn artifact(value: &[u8]) -> (DeployArtifactManifest, BTreeMap<String, Vec<u8>>) {
        (
            DeployArtifactManifest {
                kind: DeployArtifactKind::Static,
                files: vec![DeployArtifactFile {
                    path: "index.html".into(),
                    sha256: sha256(value),
                    size: value.len() as u64,
                    mode: 0o644,
                }],
                entry: None,
                engines: None,
                port: None,
                build_id: "build".into(),
            },
            BTreeMap::from([("index.html".into(), value.to_vec())]),
        )
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn full_release_cycle_over_ssh_with_reuse_rollback_and_prune() {
        let f = fixture().await;
        let mut t = trusted(&f).await;
        let l = ReleaseLayout::new("site").unwrap();
        let (m1, f1) = artifact(b"old");
        let (m2, f2) = artifact(b"new");
        l.stage(&mut t, "r-1", &m1, &f1).await.unwrap();
        assert_eq!(l.activate(&mut t, "r-1").await.unwrap(), None);
        let diff = l.stage(&mut t, "r-2", &m2, &f2).await.unwrap();
        assert_eq!(diff.changed.len() + diff.added.len(), 1);
        assert_eq!(l.activate(&mut t, "r-2").await.unwrap(), Some("r-1".into()));
        assert_eq!(
            std::fs::read(f.server.path(&format!("{SITE}/current/index.html"))).unwrap(),
            b"new"
        );
        l.activate(&mut t, "r-1").await.unwrap(); // rollback re-verifies hashes
        assert_eq!(
            std::fs::read(f.server.path(&format!("{SITE}/current/index.html"))).unwrap(),
            b"old"
        );
        // Unchanged content is hard-linked from the live release instead of re-uploaded.
        l.stage(&mut t, "r-3", &m1, &f1).await.unwrap();
        use std::os::unix::fs::MetadataExt;
        assert_eq!(
            std::fs::metadata(f.server.path(&format!("{SITE}/releases/r-1/index.html")))
                .unwrap()
                .ino(),
            std::fs::metadata(f.server.path(&format!("{SITE}/releases/r-3/index.html")))
                .unwrap()
                .ino()
        );
        assert_eq!(l.prune(&mut t, 1).await.unwrap().len(), 2);
        t.close().await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn every_interrupted_sftp_request_leaves_the_live_release_serving() {
        // Same sweep as the mock test, but the failure is injected on the server side at every
        // single SFTP request while a second release is staged and switched.
        let l = ReleaseLayout::new("site").unwrap();
        let (old, of) = artifact(b"old");
        let (new, nf) = artifact(b"new");
        let probe = fixture().await;
        let mut t = trusted(&probe).await;
        l.stage(&mut t, "r-1", &old, &of).await.unwrap();
        l.activate(&mut t, "r-1").await.unwrap();
        let before = probe.server.state.sftp_ops.load(Ordering::SeqCst);
        l.stage(&mut t, "r-2", &new, &nf).await.unwrap();
        l.activate(&mut t, "r-2").await.unwrap();
        let total = probe.server.state.sftp_ops.load(Ordering::SeqCst) - before;
        assert!(total > 10);
        t.close().await;
        for failure in 1..=total {
            let f = fixture().await;
            let mut t = trusted(&f).await;
            l.stage(&mut t, "r-1", &old, &of).await.unwrap();
            l.activate(&mut t, "r-1").await.unwrap();
            let base = f.server.state.sftp_ops.load(Ordering::SeqCst);
            f.server
                .state
                .fail_sftp_op
                .store(base + failure, Ordering::SeqCst);
            if l.stage(&mut t, "r-2", &new, &nf).await.is_ok() {
                let _ = l.activate(&mut t, "r-2").await;
            }
            let link = std::fs::read_link(f.server.path(&format!("{SITE}/current"))).unwrap();
            let live = link.to_string_lossy().into_owned();
            let expect_new = live == "releases/r-2";
            assert!(
                live == "releases/r-1" || expect_new,
                "failure {failure}: {live}"
            );
            let body = std::fs::read(f.server.path(&format!("{SITE}/current/index.html"))).unwrap();
            assert_eq!(
                body,
                if expect_new { &b"new"[..] } else { &b"old"[..] },
                "failure {failure}"
            );
            t.close().await;
        }
    }

    #[tokio::test]
    async fn exec_returns_status_streams_and_always_closes_stdin() {
        let f = fixture().await;
        f.server.set_exec(|cmd, stdin| match cmd {
            "echo-stdin" => (
                0,
                String::from_utf8_lossy(stdin).into_owned(),
                "warn\n".into(),
            ),
            "fail" => (7, String::new(), "boom\n".into()),
            "huge" => (0, "x".repeat(MAX_OUTPUT + 10), String::new()),
            "noisy" => (
                0,
                format!("{}\nSOMNIA_DONE\n", "log line\n".repeat(20_000)),
                String::new(),
            ),
            _ => (0, String::new(), String::new()),
        });
        let mut t = trusted(&f).await;
        let r = t.exec("echo-stdin", Some(b"hello")).await.unwrap();
        assert_eq!(
            (r.status, r.stdout.as_str(), r.stderr.as_str()),
            (Some(0), "hello", "warn\n")
        );
        let r = t.exec("fail", None).await.unwrap();
        assert_eq!(r.status, Some(7));
        assert!(!r.success());
        let r = t.exec("huge", None).await.unwrap();
        assert!(r.truncated, "not truncated");
        assert!(r.stdout.len() <= 64 * 1024); // the redactor caps what is displayed
        let r = t.exec("noisy", None).await.unwrap();
        assert!(r.stdout.len() <= 64 * 1024 && !r.stdout.contains("SOMNIA_DONE"));
        assert_eq!(r.markers, ["SOMNIA_DONE"]);
        for bad in ["", "a\0b", &"x".repeat(MAX_COMMAND + 1)] {
            assert_eq!(
                t.exec(bad, None).await.unwrap_err(),
                DeployError::InvalidInput
            );
        }
        t.close().await;
    }

    #[tokio::test]
    async fn exec_times_out_instead_of_hanging() {
        let f = fixture().await;
        f.server.state.exec_delay_ms.store(5000, Ordering::SeqCst);
        let observed = HostKey::from_public_key(f.server.host_key.public_key());
        f.store
            .trust_new("127.0.0.1", f.target.port, &observed)
            .unwrap();
        let opts = ConnectOptions {
            exec_timeout: Duration::from_millis(300),
            ..Default::default()
        };
        let mut t = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Key(&f.key),
            opts,
            [],
        )
        .await
        .unwrap();
        assert_eq!(
            t.exec("sleep", None).await.unwrap_err(),
            DeployError::Transport
        );
        t.close().await;
    }

    #[tokio::test]
    async fn seeded_secrets_never_surface_in_output_debug_or_errors() {
        let f = fixture().await;
        let canary = "seeded-password-do-not-log";
        f.server.set_password(canary);
        f.server
            .set_exec(move |_, _| (0, format!("out {canary}"), format!("err {canary}")));
        let observed = HostKey::from_public_key(f.server.host_key.public_key());
        f.store
            .trust_new("127.0.0.1", f.target.port, &observed)
            .unwrap();
        let pw = Zeroizing::new(canary.to_owned());
        let mut t = RusshTransport::connect(
            &f.target,
            f.store.clone(),
            Credential::Password(&pw),
            ConnectOptions::default(),
            ["extra-secret".to_owned()],
        )
        .await
        .unwrap();
        let r = t.exec("x", None).await.unwrap();
        assert!(!format!("{r:?}{t:?}").contains(canary));
        assert!(!r.stdout.contains(canary) && !r.stderr.contains(canary));
        let err = t
            .read(&format!("{SITE}/missing/{canary}"))
            .await
            .unwrap_err();
        assert!(!format!("{err:?} {err}").contains(canary));
        t.close().await;
    }

    /// Runs the transport against a real OpenSSH `sshd` + `sftp-server` on loopback (a throwaway
    /// instance in a temp dir, as the current user). Skipped when OpenSSH is not installed.
    /// This is the ground truth for the wire details the in-process server imitates.
    #[cfg(unix)]
    #[tokio::test]
    async fn real_openssh_agrees_on_symlink_posix_rename_and_hardlink() {
        use std::os::unix::fs::MetadataExt;
        let sshd = ["/usr/sbin/sshd", "/usr/bin/sshd"]
            .into_iter()
            .find(|p| std::path::Path::new(p).exists());
        let sftp = [
            "/usr/lib/openssh/sftp-server",
            "/usr/libexec/openssh/sftp-server",
            "/usr/lib/ssh/sftp-server",
        ]
        .into_iter()
        .find(|p| std::path::Path::new(p).exists());
        let (Some(sshd), Some(sftp)) = (sshd, sftp) else {
            eprintln!("skipped: OpenSSH sshd/sftp-server not installed");
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let host =
            russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)
                .unwrap();
        let host_path = d.join("host_key");
        std::fs::write(
            &host_path,
            host.to_openssh(russh::keys::ssh_key::LineEnding::LF)
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
        let keys = KeyStore::new(Mem::default());
        keys.create("real").unwrap();
        let key = keys.load("real").unwrap();
        let authorized = d.join("authorized_keys");
        std::fs::write(
            &authorized,
            format!("{}\n", key.private_key().public_key().to_openssh().unwrap()),
        )
        .unwrap();
        let port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let user = String::from_utf8(
            std::process::Command::new("id")
                .arg("-un")
                .output()
                .unwrap()
                .stdout,
        )
        .unwrap()
        .trim()
        .to_owned();
        let config = format!(
            "Port {port}\nListenAddress 127.0.0.1\nHostKey {}\nAuthorizedKeysFile {}\nPidFile {}\nStrictModes no\nUsePAM no\nPasswordAuthentication no\nPubkeyAuthentication yes\nSubsystem sftp {sftp}\nLogLevel ERROR\n",
            host_path.display(), authorized.display(), d.join("pid").display()
        );
        std::fs::write(d.join("sshd_config"), config).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&host_path, std::fs::Permissions::from_mode(0o600)).unwrap();
        struct Kill(std::process::Child);
        impl Drop for Kill {
            fn drop(&mut self) {
                let _ = self.0.kill();
            }
        }
        let child = std::process::Command::new(sshd)
            .args(["-D", "-e", "-f"])
            .arg(d.join("sshd_config"))
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        let Ok(child) = child else {
            eprintln!("skipped: sshd did not start");
            return;
        };
        let _guard = Kill(child);
        let target = SshTarget::new("127.0.0.1", port, user);
        let mut opts = ConnectOptions {
            root: d.join("root").display().to_string(),
            ..Default::default()
        };
        std::fs::create_dir_all(&opts.root).unwrap();
        let mut found = None;
        for _ in 0..50 {
            if let Ok(k) = probe_host_key(&target, &opts).await {
                found = Some(k);
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let Some(observed) = found else {
            eprintln!("skipped: sshd not reachable in this sandbox");
            return;
        };
        assert_eq!(
            observed.fingerprint,
            HostKey::from_public_key(host.public_key()).fingerprint
        );
        let store = Arc::new(HostKeyStore::default());
        store.trust_new("127.0.0.1", port, &observed).unwrap();
        opts.root = std::fs::canonicalize(&opts.root)
            .unwrap()
            .display()
            .to_string();
        let root = opts.root.clone();
        let mut t = RusshTransport::connect(&target, store, Credential::Key(&key), opts, [])
            .await
            .unwrap();
        for id in ["r-1", "r-2"] {
            t.mkdir(&format!("{root}/site/releases/{id}"))
                .await
                .unwrap();
        }
        t.write(&format!("{root}/site/releases/r-1/f"), b"data", 0o644)
            .await
            .unwrap();
        assert_eq!(
            t.read(&format!("{root}/site/releases/r-1/f"))
                .await
                .unwrap(),
            b"data"
        );
        t.hard_link(
            &format!("{root}/site/releases/r-1/f"),
            &format!("{root}/site/releases/r-2/f"),
        )
        .await
        .unwrap();
        assert_eq!(
            std::fs::metadata(format!("{root}/site/releases/r-1/f"))
                .unwrap()
                .ino(),
            std::fs::metadata(format!("{root}/site/releases/r-2/f"))
                .unwrap()
                .ino()
        );
        let current = format!("{root}/site/current");
        t.symlink("releases/r-1", &current).await.unwrap();
        // The link text must be the relative target, which proves the wire order matches OpenSSH.
        assert_eq!(
            std::fs::read_link(&current).unwrap().to_string_lossy(),
            "releases/r-1"
        );
        assert_eq!(
            t.read_link(&current).await.unwrap().as_deref(),
            Some("releases/r-1")
        );
        t.symlink("releases/r-2", &format!("{current}.new"))
            .await
            .unwrap();
        t.rename(&format!("{current}.new"), &current).await.unwrap();
        assert_eq!(
            std::fs::read_link(&current).unwrap().to_string_lossy(),
            "releases/r-2"
        );
        assert!(t
            .write(&format!("{current}/x"), b"never", 0o644)
            .await
            .is_err());
        assert_eq!(
            t.list(&format!("{root}/site/releases")).await.unwrap(),
            ["r-1", "r-2"]
        );
        t.remove_tree(&format!("{root}/site/releases/r-1"))
            .await
            .unwrap();
        assert!(!t
            .exists(&format!("{root}/site/releases/r-1"))
            .await
            .unwrap());
        let out = t
            .exec("echo hi; echo err 1>&2; exit 3", None)
            .await
            .unwrap();
        assert_eq!(
            (out.status, out.stdout.as_str(), out.stderr.as_str()),
            (Some(3), "hi\n", "err\n")
        );
        let out = t.exec("cat", Some(b"piped")).await.unwrap();
        assert_eq!(out.stdout, "piped");
        t.close().await;
    }
}
