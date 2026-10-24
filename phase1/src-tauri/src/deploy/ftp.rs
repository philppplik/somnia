//! Minimal FTP/FTPS client for static-site uploads (explicit TLS, passive mode).
//!
//! Written in-house instead of pulling a client crate: certificate checking, the pin, the order
//! "TLS first, credentials second" and the passive-address rule are the security-relevant parts and
//! stay readable in one file.
//!
//! - `AUTH TLS` then `PBSZ 0` and `PROT P`. If the server refuses, the connection fails. There is no silent
//!   downgrade to plain FTP.
//! - Credentials are sent only after the TLS handshake and its certificate check (or, for plain FTP, only
//!   when the caller opted in). A credential-free [`Ftp::connect`] without `login` is how the probe works.
//! - Data connections always go to the IP of the control connection. The address in a `PASV` reply is
//!   ignored, which closes the FTP bounce and the "server reports its private address" problems.
//! - Errors are a closed enum. No server text, no path and no credential ends up in an error value.
use super::manifest::sha256_bytes;
use crate::deploy_guard::{RemoteEntry, RemoteKind};
use base64::Engine as _;
use std::{
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    net::TcpStream,
    time::timeout,
};
use tokio_rustls::{
    rustls::{
        self,
        client::{
            danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
            WebPkiServerVerifier,
        },
        crypto::{ring, CryptoProvider},
        pki_types::{CertificateDer, ServerName, UnixTime},
        CertificateError, ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme,
    },
    TlsConnector,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FtpError {
    Io,
    Timeout,
    Protocol,
    /// The server answered with a 4xx/5xx code. Only the number is kept.
    Rejected(u16),
    Auth,
    /// The server does not offer explicit TLS (and TLS was required).
    NoTls,
    /// Certificate chain, host name or pin check failed.
    Cert,
    TooLarge,
    InvalidInput,
}
impl FtpError {
    pub fn is_not_found(&self) -> bool {
        matches!(self, Self::Rejected(550) | Self::Rejected(450))
    }
}
pub type Result<T> = std::result::Result<T, FtpError>;

/// How the server certificate is checked during the handshake.
#[derive(Clone, Debug)]
pub enum Verify {
    /// Chain and host name against the system roots (plus `extra_roots`).
    Ca,
    /// The leaf certificate must have exactly this SHA-256. The handshake signature is still verified.
    Pinned([u8; 32]),
    /// Accept anything and report the leaf. Only for the credential-free probe that shows the fingerprint to the person.
    Capture,
}
#[derive(Clone)]
pub struct FtpOptions {
    pub connect_timeout: Duration,
    pub io_timeout: Duration,
    /// Additional trust anchors. Empty in production; tests use it for their own CA.
    pub extra_roots: Vec<CertificateDer<'static>>,
    pub max_download: usize,
}
impl Default for FtpOptions {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(15),
            io_timeout: Duration::from_secs(30),
            extra_roots: Vec::new(),
            max_download: 4 * 1024 * 1024,
        }
    }
}

/// Fingerprint strings shared with the host pin store (`SHA256:` plus 43 base64 characters).
fn fp(bytes: [u8; 32]) -> String {
    format!("SHA256:{}", base64::engine::general_purpose::STANDARD_NO_PAD.encode(bytes))
}
pub fn leaf_fingerprint(der: &[u8]) -> String {
    fp(sha256_bytes(der))
}
pub fn leaf_digest(fingerprint: &str) -> Option<[u8; 32]> {
    let raw = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(fingerprint.strip_prefix("SHA256:")?)
        .ok()?;
    raw.try_into().ok()
}
/// Stable pin for "the certificate must chain to a trusted CA and match this host name".
pub fn ca_fingerprint(host: &str) -> String {
    fp(sha256_bytes(format!("somnia-ftps-ca:{}", host.to_ascii_lowercase()).as_bytes()))
}
/// Stable pin for "the person accepted unencrypted FTP to this host".
pub fn plain_fingerprint(host: &str) -> String {
    fp(sha256_bytes(format!("somnia-ftp-plain:{}", host.to_ascii_lowercase()).as_bytes()))
}

trait Io: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Io for T {}
type BoxIo = Box<dyn Io>;

#[derive(Debug)]
struct Verifier {
    mode: Verify,
    inner: Option<Arc<WebPkiServerVerifier>>,
    provider: Arc<CryptoProvider>,
    seen: Arc<Mutex<Option<Vec<u8>>>>,
}
impl ServerCertVerifier for Verifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp: &[u8],
        now: UnixTime,
    ) -> std::result::Result<ServerCertVerified, rustls::Error> {
        if let Ok(mut slot) = self.seen.lock() {
            *slot = Some(end_entity.as_ref().to_vec());
        }
        match &self.mode {
            Verify::Capture => Ok(ServerCertVerified::assertion()),
            Verify::Pinned(expected) => {
                if constant_eq(&sha256_bytes(end_entity.as_ref()), expected) {
                    Ok(ServerCertVerified::assertion())
                } else {
                    Err(rustls::Error::InvalidCertificate(CertificateError::ApplicationVerificationFailure))
                }
            }
            Verify::Ca => self
                .inner
                .as_ref()
                .ok_or(rustls::Error::InvalidCertificate(CertificateError::UnknownIssuer))?
                .verify_server_cert(end_entity, intermediates, server_name, ocsp, now),
        }
    }
    fn verify_tls12_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }
    fn verify_tls13_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}
fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn tls_config(verify: &Verify, opts: &FtpOptions, seen: Arc<Mutex<Option<Vec<u8>>>>) -> Result<Arc<ClientConfig>> {
    let provider = Arc::new(ring::default_provider());
    let inner = if matches!(verify, Verify::Ca) {
        let mut roots = RootCertStore::empty();
        for cert in rustls_native_certs::load_native_certs().certs {
            let _ = roots.add(cert);
        }
        for cert in &opts.extra_roots {
            roots.add(cert.clone()).map_err(|_| FtpError::Cert)?;
        }
        if roots.is_empty() {
            return Err(FtpError::Cert);
        }
        Some(
            WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider.clone())
                .build()
                .map_err(|_| FtpError::Cert)?,
        )
    } else {
        None
    };
    let verifier = Arc::new(Verifier { mode: verify.clone(), inner, provider: provider.clone(), seen });
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|_| FtpError::Cert)?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    Ok(Arc::new(config))
}

struct Tls {
    connector: TlsConnector,
    name: ServerName<'static>,
}
#[derive(Debug, Clone)]
struct Reply {
    code: u16,
    text: String,
}

pub struct Ftp {
    rd: BufReader<BoxIo>,
    opts: FtpOptions,
    peer: IpAddr,
    tls: Option<Tls>,
    leaf: Arc<Mutex<Option<Vec<u8>>>>,
}

fn bad_arg(s: &str) -> bool {
    s.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
}

impl Ftp {
    /// Opens the control connection. With `tls` the handshake and the certificate check happen here, before any
    /// credential could be sent. Does not log in.
    pub async fn connect(host: &str, port: u16, tls: bool, verify: Verify, opts: &FtpOptions) -> Result<Ftp> {
        if host.is_empty() || bad_arg(host) {
            return Err(FtpError::InvalidInput);
        }
        let addr = timeout(opts.connect_timeout, tokio::net::lookup_host((host, port)))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?
            .next()
            .ok_or(FtpError::Io)?;
        let tcp = timeout(opts.connect_timeout, TcpStream::connect(addr))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?;
        let _ = tcp.set_nodelay(true);
        let leaf = Arc::new(Mutex::new(None));
        let mut ftp = Ftp { rd: BufReader::new(Box::new(tcp)), opts: opts.clone(), peer: addr.ip(), tls: None, leaf: leaf.clone() };
        let banner = ftp.reply().await?;
        if banner.code != 220 {
            return Err(FtpError::Rejected(banner.code));
        }
        if tls {
            let config = tls_config(&verify, opts, leaf)?;
            let name = ServerName::try_from(host.to_string()).map_err(|_| FtpError::InvalidInput)?;
            let r = ftp.cmd("AUTH TLS").await?;
            if r.code != 234 {
                return Err(FtpError::NoTls);
            }
            let connector = TlsConnector::from(config);
            let Ftp { rd, opts: o, peer, leaf, .. } = ftp;
            let secured = timeout(o.connect_timeout, connector.connect(name.clone(), rd.into_inner()))
                .await
                .map_err(|_| FtpError::Timeout)?
                .map_err(|_| FtpError::Cert)?;
            ftp = Ftp { rd: BufReader::new(Box::new(secured)), opts: o, peer, tls: Some(Tls { connector, name }), leaf };
            ftp.expect("PBSZ 0", 200).await?;
            ftp.expect("PROT P", 200).await?;
        }
        Ok(ftp)
    }

    /// DER of the leaf certificate the server presented, when TLS was used.
    pub fn leaf_der(&self) -> Option<Vec<u8>> {
        self.leaf.lock().ok().and_then(|g| g.clone())
    }
    pub fn is_tls(&self) -> bool {
        self.tls.is_some()
    }

    async fn read_line(&mut self) -> Result<String> {
        let mut buf = Vec::new();
        let n = timeout(self.opts.io_timeout, (&mut self.rd).take(4097).read_until(b'\n', &mut buf))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?;
        if n == 0 {
            return Err(FtpError::Io);
        }
        if !buf.ends_with(b"\n") {
            return Err(FtpError::Protocol);
        }
        Ok(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string())
    }
    async fn reply(&mut self) -> Result<Reply> {
        let first = self.read_line().await?;
        let code: u16 = first.get(..3).and_then(|c| c.parse().ok()).ok_or(FtpError::Protocol)?;
        let mut text = first.get(4..).unwrap_or("").to_string();
        if first.as_bytes().get(3) == Some(&b'-') {
            let end = format!("{code} ");
            for _ in 0..500 {
                let line = self.read_line().await?;
                if line.starts_with(&end) {
                    return Ok(Reply { code, text });
                }
                text.push('\n');
                text.push_str(&line);
            }
            return Err(FtpError::Protocol);
        }
        Ok(Reply { code, text })
    }
    async fn send(&mut self, line: &str) -> Result<()> {
        let mut out = Vec::with_capacity(line.len() + 2);
        out.extend_from_slice(line.as_bytes());
        out.extend_from_slice(b"\r\n");
        let io = self.rd.get_mut();
        timeout(self.opts.io_timeout, async {
            io.write_all(&out).await?;
            io.flush().await
        })
        .await
        .map_err(|_| FtpError::Timeout)?
        .map_err(|_| FtpError::Io)
    }
    async fn cmd(&mut self, line: &str) -> Result<Reply> {
        if bad_arg(line) {
            return Err(FtpError::InvalidInput);
        }
        self.send(line).await?;
        self.reply().await
    }
    async fn expect(&mut self, line: &str, code: u16) -> Result<Reply> {
        let r = self.cmd(line).await?;
        if r.code == code {
            Ok(r)
        } else {
            Err(FtpError::Rejected(r.code))
        }
    }
    async fn expect_class(&mut self, line: &str, class: u16) -> Result<Reply> {
        let r = self.cmd(line).await?;
        if r.code / 100 == class {
            Ok(r)
        } else {
            Err(FtpError::Rejected(r.code))
        }
    }

    /// Credentials go out only here. For TLS targets the certificate check has already passed.
    pub async fn login(&mut self, user: &str, password: &str) -> Result<()> {
        if bad_arg(user) || bad_arg(password) {
            return Err(FtpError::InvalidInput);
        }
        let r = self.cmd(&format!("USER {user}")).await?;
        match r.code {
            230 => {}
            331 | 332 => {
                let r = self.cmd(&format!("PASS {password}")).await?;
                if r.code != 230 && r.code != 202 {
                    return Err(if matches!(r.code, 530 | 430 | 503) { FtpError::Auth } else { FtpError::Rejected(r.code) });
                }
            }
            530 | 430 => return Err(FtpError::Auth),
            c => return Err(FtpError::Rejected(c)),
        }
        self.expect("TYPE I", 200).await?;
        Ok(())
    }
    pub async fn quit(mut self) {
        let _ = timeout(Duration::from_secs(3), self.cmd("QUIT")).await;
    }

    async fn passive(&mut self) -> Result<SocketAddr> {
        let r = self.cmd("EPSV").await?;
        if r.code == 229 {
            let port = r
                .text
                .split('(')
                .nth(1)
                .and_then(|s| s.split(')').next())
                .map(|s| s.trim_matches('|'))
                .and_then(|s| s.parse::<u16>().ok())
                .filter(|p| *p != 0)
                .ok_or(FtpError::Protocol)?;
            return Ok(SocketAddr::new(self.peer, port));
        }
        if self.peer.is_ipv6() {
            return Err(FtpError::Rejected(r.code));
        }
        let r = self.cmd("PASV").await?;
        if r.code != 227 {
            return Err(FtpError::Rejected(r.code));
        }
        let nums: Vec<u16> = r
            .text
            .split('(')
            .nth(1)
            .and_then(|s| s.split(')').next())
            .ok_or(FtpError::Protocol)?
            .split(',')
            .map(|n| n.trim().parse::<u16>().map_err(|_| FtpError::Protocol))
            .collect::<Result<_>>()?;
        if nums.len() != 6 || nums.iter().any(|n| *n > 255) {
            return Err(FtpError::Protocol);
        }
        let port = nums[4] * 256 + nums[5];
        if port == 0 {
            return Err(FtpError::Protocol);
        }
        // The address in the reply is deliberately ignored.
        Ok(SocketAddr::new(self.peer, port))
    }
    async fn data_start(&mut self, line: &str) -> Result<BoxIo> {
        let addr = self.passive().await?;
        let tcp = timeout(self.opts.connect_timeout, TcpStream::connect(addr))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?;
        let _ = tcp.set_nodelay(true);
        let r = self.cmd(line).await?;
        if r.code / 100 != 1 {
            return Err(FtpError::Rejected(r.code));
        }
        match &self.tls {
            None => Ok(Box::new(tcp)),
            Some(tls) => {
                let s = timeout(self.opts.connect_timeout, tls.connector.connect(tls.name.clone(), tcp))
                    .await
                    .map_err(|_| FtpError::Timeout)?
                    .map_err(|_| FtpError::Cert)?;
                Ok(Box::new(s))
            }
        }
    }
    async fn data_end(&mut self) -> Result<()> {
        let r = self.reply().await?;
        if r.code / 100 == 2 {
            Ok(())
        } else {
            Err(FtpError::Rejected(r.code))
        }
    }

    pub async fn stor(&mut self, path: &str, bytes: &[u8]) -> Result<()> {
        if bad_arg(path) {
            return Err(FtpError::InvalidInput);
        }
        let mut data = self.data_start(&format!("STOR {path}")).await?;
        let io_timeout = self.opts.io_timeout;
        for chunk in bytes.chunks(64 * 1024) {
            timeout(io_timeout, data.write_all(chunk)).await.map_err(|_| FtpError::Timeout)?.map_err(|_| FtpError::Io)?;
        }
        let _ = timeout(io_timeout, data.flush()).await;
        let _ = timeout(io_timeout, data.shutdown()).await;
        drop(data);
        self.data_end().await
    }
    pub async fn retr(&mut self, path: &str) -> Result<Vec<u8>> {
        if bad_arg(path) {
            return Err(FtpError::InvalidInput);
        }
        let mut data = self.data_start(&format!("RETR {path}")).await?;
        let mut out = Vec::new();
        let max = self.opts.max_download;
        timeout(self.opts.io_timeout * 4, (&mut data).take(max as u64 + 1).read_to_end(&mut out))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?;
        drop(data);
        if out.len() > max {
            return Err(FtpError::TooLarge);
        }
        self.data_end().await?;
        Ok(out)
    }
    /// Directory listing. `MLSD` when the server has it, the Unix/DOS `LIST` format otherwise.
    pub async fn list(&mut self, path: &str) -> Result<Vec<RemoteEntry>> {
        if bad_arg(path) {
            return Err(FtpError::InvalidInput);
        }
        let arg = if path.is_empty() { String::new() } else { format!(" {path}") };
        let (raw, mlsd) = match self.list_raw(&format!("MLSD{arg}")).await {
            Ok(raw) => (raw, true),
            Err(FtpError::Rejected(500 | 501 | 502 | 504)) => (self.list_raw(&format!("LIST{arg}")).await?, false),
            Err(e) => return Err(e),
        };
        let mut out: Vec<RemoteEntry> = raw.lines().filter_map(|l| if mlsd { parse_mlsd(l) } else { parse_list(l) }).collect();
        out.truncate(5000);
        Ok(out)
    }
    async fn list_raw(&mut self, line: &str) -> Result<String> {
        let mut data = self.data_start(line).await?;
        let mut out = Vec::new();
        timeout(self.opts.io_timeout * 2, (&mut data).take(4 * 1024 * 1024).read_to_end(&mut out))
            .await
            .map_err(|_| FtpError::Timeout)?
            .map_err(|_| FtpError::Io)?;
        drop(data);
        self.data_end().await?;
        Ok(String::from_utf8_lossy(&out).into_owned())
    }
    pub async fn mkd(&mut self, path: &str) -> Result<()> {
        self.expect(&format!("MKD {path}"), 257).await.map(|_| ())
    }
    /// Creates every missing directory of `path` (absolute, `/`-separated). Existing ones are fine.
    pub async fn mkd_p(&mut self, path: &str) -> Result<()> {
        let mut cur = String::new();
        for seg in path.split('/').filter(|s| !s.is_empty()) {
            cur.push('/');
            cur.push_str(seg);
            match self.mkd(&cur).await {
                Ok(()) | Err(FtpError::Rejected(550 | 521 | 553)) => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }
    pub async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        self.expect(&format!("RNFR {from}"), 350).await?;
        self.expect_class(&format!("RNTO {to}"), 2).await.map(|_| ())
    }
    pub async fn dele(&mut self, path: &str) -> Result<()> {
        self.expect_class(&format!("DELE {path}"), 2).await.map(|_| ())
    }
    pub async fn rmd(&mut self, path: &str) -> Result<()> {
        self.expect_class(&format!("RMD {path}"), 2).await.map(|_| ())
    }
    /// `None` when the server has no SIZE command.
    pub async fn size(&mut self, path: &str) -> Result<Option<u64>> {
        let r = self.cmd(&format!("SIZE {path}")).await?;
        match r.code {
            213 => Ok(r.text.trim().parse().ok()),
            500 | 501 | 502 | 504 => Ok(None),
            c => Err(FtpError::Rejected(c)),
        }
    }
}

/// `type=file;size=12;modify=20261013093000; name`
fn parse_mlsd(line: &str) -> Option<RemoteEntry> {
    let (facts, name) = line.split_once(' ')?;
    if !safe_name(name) {
        return None;
    }
    let mut kind = RemoteKind::File;
    let (mut size, mut modified) = (None, None);
    for fact in facts.split(';').filter(|f| !f.is_empty()) {
        let (k, v) = fact.split_once('=')?;
        match k.to_ascii_lowercase().as_str() {
            "type" => match v.to_ascii_lowercase().as_str() {
                "dir" => kind = RemoteKind::Dir,
                "file" => kind = RemoteKind::File,
                "os.unix=slink" | "os.unix=symlink" => kind = RemoteKind::Link,
                _ => return None,
            },
            "size" => size = v.parse().ok(),
            "modify" if v.len() >= 12 && v.bytes().take(12).all(|b| b.is_ascii_digit()) => {
                modified = Some(format!("{}-{}-{} {}:{}", &v[0..4], &v[4..6], &v[6..8], &v[8..10], &v[10..12]));
            }
            _ => {}
        }
    }
    Some(RemoteEntry { name: name.to_string(), size: if kind == RemoteKind::Dir { None } else { size }, kind, modified })
}
/// Unix `ls -l` and DOS/IIS styles. Names with spaces survive.
fn parse_list(line: &str) -> Option<RemoteEntry> {
    let line = line.trim_end();
    if line.is_empty() || line.starts_with("total ") {
        return None;
    }
    let first = line.split_whitespace().next()?;
    let (kind, size, name) = if matches!(first.as_bytes().first(), Some(b'd' | b'-' | b'l')) && first.len() >= 10 {
        let mut rest = line;
        let mut fields = Vec::new();
        for _ in 0..8 {
            rest = rest.trim_start();
            let end = rest.find(char::is_whitespace)?;
            fields.push(&rest[..end]);
            rest = &rest[end..];
        }
        let name = rest.trim_start();
        let kind = match first.as_bytes()[0] {
            b'd' => RemoteKind::Dir,
            b'l' => RemoteKind::Link,
            _ => RemoteKind::File,
        };
        let name = if kind == RemoteKind::Link { name.split(" -> ").next().unwrap_or(name) } else { name };
        (kind, fields[4].parse::<u64>().ok(), name.to_string())
    } else {
        let mut parts = line.splitn(4, char::is_whitespace).filter(|s| !s.is_empty());
        let _date = parts.next()?;
        let rest = line.split_whitespace().skip(2).collect::<Vec<_>>();
        let marker = *rest.first()?;
        let idx = line.find(marker)? + marker.len();
        let name = line[idx..].trim_start().to_string();
        if marker == "<DIR>" { (RemoteKind::Dir, None, name) } else { (RemoteKind::File, marker.replace(',', "").parse().ok(), name) }
    };
    if !safe_name(&name) {
        return None;
    }
    Some(RemoteEntry { name, kind, size: if kind == RemoteKind::Dir { None } else { size }, modified: None })
}
fn safe_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && name.len() <= 255 && !name.chars().any(|c| c.is_control() || c == '/' || c == '\\')
}

#[cfg(test)]
mod parse_tests {
    use super::*;
    #[test]
    fn parses_mlsd_and_list_styles() {
        let e = parse_mlsd("type=file;size=42;modify=20261013093055; my page.html").unwrap();
        assert_eq!((e.name.as_str(), e.size, e.kind), ("my page.html", Some(42), RemoteKind::File));
        assert_eq!(e.modified.as_deref(), Some("2026-10-13 09:30"));
        assert_eq!(parse_mlsd("type=dir;modify=20261013093055; assets").unwrap().kind, RemoteKind::Dir);
        assert!(parse_mlsd("type=cdir; .").is_none() && parse_mlsd("type=pdir; ..").is_none());
        assert!(parse_mlsd("type=file;size=1; ../evil").is_none());
        let u = parse_list("-rw-r--r--   1 ftp ftp      1234 Oct 13 12:00 index file.html").unwrap();
        assert_eq!((u.name.as_str(), u.size, u.kind), ("index file.html", Some(1234), RemoteKind::File));
        let d = parse_list("drwxr-xr-x   2 ftp ftp      4096 Oct 13  2025 css").unwrap();
        assert_eq!((d.kind, d.size), (RemoteKind::Dir, None));
        let l = parse_list("lrwxrwxrwx   1 ftp ftp         4 Oct 13 12:00 www -> /var/www").unwrap();
        assert_eq!((l.name.as_str(), l.kind), ("www", RemoteKind::Link));
        let w = parse_list("10-13-26  12:00PM       <DIR>          photos").unwrap();
        assert_eq!((w.name.as_str(), w.kind), ("photos", RemoteKind::Dir));
        let f = parse_list("10-13-26  12:00PM                 1,204 a b.txt").unwrap();
        assert_eq!((f.name.as_str(), f.size), ("a b.txt", Some(1204)));
        assert!(parse_list("total 12").is_none());
    }
    #[test]
    fn fingerprints_fit_the_pin_store_format() {
        for f in [leaf_fingerprint(b"x"), ca_fingerprint("Example.com"), plain_fingerprint("example.com")] {
            assert_eq!(f.len(), 7 + 43);
            assert!(f.starts_with("SHA256:"));
        }
        assert_eq!(ca_fingerprint("Example.com"), ca_fingerprint("example.com"));
        assert_ne!(ca_fingerprint("a.com"), plain_fingerprint("a.com"));
        assert_eq!(leaf_digest(&leaf_fingerprint(b"x")).unwrap(), sha256_bytes(b"x"));
    }
}
