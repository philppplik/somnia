//! Broker-owned domain proxy: the ONLY route of the tool network (Policy v2, Welle-B A4).
//!
//! Two hard separations:
//! * Provider/model traffic is NOT tool network. It stays on
//!   [`crate::transport::ModelTransportPolicy`]; nothing here accepts or creates a
//!   `ModelTransportPermit`, and permitting a model host never opens the proxy.
//! * The host network configuration is never touched: no ACL, account or firewall changes,
//!   whatever repo or tool text claims. The proxy is a localhost TCP listener; every
//!   connection re-checks the run's live network grants in the broker. No grant, no relay.
//!
//! Deny by default. A domain enters the ACL only through a consent decision
//! (`AllowForRun` on a `Network` proposal for that exact domain) or an `AllowOnce` fetch
//! performed host-side by [`NetworkExecutor::fetch`] under its request-bound token.
//!
//! SSRF guard: even with a grant, the proxy refuses to dial loopback, private, link-local,
//! multicast and unspecified destinations (an agent-asked grant for `localhost` or
//! `169.254.169.254` must never reach cloud metadata or LAN services). Tests can relax this
//! for `127.0.0.1` fixtures via [`ProxyConfig::allow_private_targets`].

use crate::action::*;
use crate::broker::{AgentHandle, EffectOutcome, ExecutionBinding, ProposeResult, RunControl};
use crate::digest::ArgsDigest;
use crate::error::{ConsumeError, PolicyError};
use crate::token::ApprovalToken;
use std::collections::BTreeSet;
use std::fmt;
use std::io::{Read, Write};
use std::net::{IpAddr, Shutdown, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

mod http;
use http::{read_head, Head};

/// Proxy failures. Never carry payload bytes.
#[derive(Debug)]
pub enum NetError {
    /// The approval was not valid for this request.
    Policy(ConsumeError),
    /// Broker bookkeeping failed while proposing.
    Broker(PolicyError),
    /// Target failed syntactic validation.
    InvalidTarget(&'static str),
    /// Destination resolves to a non-public address (SSRF guard).
    PrivateDestination,
    /// The proxy listener could not start.
    ListenFailed,
    /// Connect or relay failed (class only).
    RelayFailed,
    /// TLS handshake or certificate verification failed (fail closed, no opt-out).
    TlsFailed,
    /// Response exceeded the configured cap.
    TooLarge,
    /// I/O failure (kind only).
    Io(std::io::ErrorKind),
}

impl NetError {
    /// Short fixed word for the audit log.
    pub fn class(&self) -> &'static str {
        match self {
            NetError::Policy(_) => "policy",
            NetError::Broker(_) => "broker",
            NetError::InvalidTarget(_) => "invalid_target",
            NetError::PrivateDestination => "private_destination",
            NetError::ListenFailed => "listen_failed",
            NetError::RelayFailed => "relay_failed",
            NetError::TlsFailed => "tls_failed",
            NetError::TooLarge => "too_large",
            NetError::Io(_) => "io",
        }
    }
}

impl fmt::Display for NetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NetError::Policy(e) => write!(f, "{e}"),
            NetError::Broker(e) => write!(f, "{e}"),
            NetError::InvalidTarget(w) => write!(f, "invalid_target: {w}"),
            NetError::Io(k) => write!(f, "io: {k:?}"),
            e => f.write_str(e.class()),
        }
    }
}
impl std::error::Error for NetError {}
impl From<ConsumeError> for NetError {
    fn from(e: ConsumeError) -> Self {
        NetError::Policy(e)
    }
}
impl From<PolicyError> for NetError {
    fn from(e: PolicyError) -> Self {
        NetError::Broker(e)
    }
}

/// A validated domain target (lowercase, no port, no userinfo, no trailing dot).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Domain(String);

impl Domain {
    /// Validate. Pure host syntax check; allowlisting is the consent broker's job.
    pub fn parse(input: &str) -> Result<Self, NetError> {
        let d = input.trim().trim_end_matches('.').to_ascii_lowercase();
        if d.is_empty()
            || d.len() > 253
            || d.contains('/')
            || d.contains('@')
            || d.contains(':')
            || d.split('.').any(|l| l.is_empty() || l.len() > 63)
            || !d
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
        {
            return Err(NetError::InvalidTarget("domain"));
        }
        Ok(Self(d))
    }

    /// Borrow the domain.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Proxy configuration.
#[derive(Clone, Debug)]
pub struct ProxyConfig {
    /// Destination ports the proxy will dial.
    pub allowed_ports: BTreeSet<u16>,
    /// Max bytes of a host-side response body.
    pub max_response_bytes: usize,
    /// Connect timeout.
    pub connect_timeout: Duration,
    /// Test seam: also allow loopback/private destinations. Never set in production.
    pub allow_private_targets: bool,
    /// TLS root store for host-side https fetches. `None` uses the bundled webpki
    /// roots. Test seam / custom-CA environments; certificate verification is always on.
    pub tls_roots: Option<rustls::RootCertStore>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            allowed_ports: [80u16, 443u16].into_iter().collect(),
            max_response_bytes: 8 * 1024 * 1024,
            connect_timeout: Duration::from_secs(10),
            allow_private_targets: false,
            tls_roots: None,
        }
    }
}

/// Is an IP publicly routable (the SSRF guard).
pub fn is_public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_documentation()
                || o[0] == 100 && (64..=127).contains(&o[1]) // CGNAT
                || o[0] == 192 && o[1] == 0 && o[2] == 0 // IETF protocol assignments
                || o[0] == 198 && (18..=19).contains(&o[1]) // benchmarking
                || o[0] >= 240)
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback() || v6.is_multicast() || v6.is_unspecified())
                && (v6.segments()[0] & 0xfe00) != 0x0200 // documentation 2001:db8 handled below
                && !is_v6_special(v6)
        }
    }
}

fn is_v6_special(v6: &std::net::Ipv6Addr) -> bool {
    let s = v6.segments();
    let doc = s[0] == 0x2001 && s[1] == 0x0db8;
    let ula = (s[0] & 0xfe00) == 0xfc00;
    let link_local = (s[0] & 0xffc0) == 0xfe80;
    let v4_mapped = s[0] == 0 && s[1] == 0 && s[2] == 0 && s[3] == 0 && s[4] == 0xffff;
    doc || ula || link_local
        || v4_mapped && !is_public_ip(&IpAddr::V4(std::net::Ipv4Addr::new(
            (s[6] >> 8) as u8,
            s[6] as u8,
            (s[7] >> 8) as u8,
            s[7] as u8,
        )))
}

/// The broker-owned domain proxy for one run. Binds localhost only; every admitted
/// connection re-reads the run's network grants from the broker.
pub struct DomainProxy {
    run_id: RunId,
    runs: RunControl,
    addr: SocketAddr,
    cfg: ProxyConfig,
    stop: Arc<AtomicBool>,
    seeds: Arc<Mutex<BTreeSet<String>>>,
    join: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl DomainProxy {
    /// Attach network enforcement to the run scope and start the listener. Until this
    /// succeeds the broker denies every `Network` proposal (`no_enforcement`).
    pub fn attach(
        agent: &AgentHandle,
        runs: &RunControl,
        run_id: RunId,
        scope_id: ScopeId,
        cfg: ProxyConfig,
    ) -> Result<Self, NetError> {
        let listener = TcpListener::bind((IpAddr::from([127, 0, 0, 1]), 0))
            .map_err(|_| NetError::ListenFailed)?;
        listener
            .set_nonblocking(true)
            .map_err(|e| NetError::Io(e.kind()))?;
        let addr = listener.local_addr().map_err(|e| NetError::Io(e.kind()))?;
        agent.attach_network_enforcement(&run_id, &scope_id)?;
        let stop = Arc::new(AtomicBool::new(false));
        let p = Self {
            run_id: run_id.clone(),
            runs: runs.clone(),
            addr,
            cfg,
            stop: stop.clone(),
            seeds: Arc::new(Mutex::new(BTreeSet::new())),
            join: Mutex::new(None),
        };
        let handle = p.serve(listener, stop);
        *p.join.lock().map_err(|_| NetError::ListenFailed)? = Some(handle);
        Ok(p)
    }

    /// Loopback endpoint clients connect to.
    pub fn endpoint(&self) -> SocketAddr {
        self.addr
    }

    /// Seed the ACL (for example persisted grants re-applied after restart). Live grants are
    /// always re-read from the broker per connection; seeds only widen, never narrow.
    pub fn seed_domain(&self, domain: &Domain) {
        if let Ok(mut s) = self.seeds.lock() {
            s.insert(domain.as_str().to_string());
        }
    }

    fn serve(&self, listener: TcpListener, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<()> {
        let view = ProxyView {
            run_id: self.run_id.clone(),
            runs: self.runs.clone(),
            seeds: self.seeds.clone(),
            cfg: self.cfg.clone(),
        };
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let mut v = view.clone();
                        std::thread::spawn(move || v.handle(stream));
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => break,
                }
            }
        })
    }
}

impl Drop for DomainProxy {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Nudge the accept loop.
        let _ = TcpStream::connect(self.addr);
        if let Ok(mut j) = self.join.lock() {
            if let Some(h) = j.take() {
                let _ = h.join();
            }
        }
    }
}

#[derive(Clone)]
struct ProxyView {
    run_id: RunId,
    runs: RunControl,
    seeds: Arc<Mutex<BTreeSet<String>>>,
    cfg: ProxyConfig,
}

impl ProxyView {
    fn allowed(&self, host: &str) -> bool {
        let host = host.trim_end_matches('.').to_ascii_lowercase();
        if let Ok(s) = self.seeds.lock() {
            if s.contains(&host) {
                return true;
            }
        }
        self.runs
            .grants(&self.run_id)
            .map(|gs| {
                gs.iter()
                    .any(|g| g.kind == ActionKind::Network && g.target == host)
            })
            .unwrap_or(false)
    }

    fn handle(&mut self, mut stream: TcpStream) {
        let stream = &mut stream;
        let cfg = &self.cfg;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
        let head = match read_head(stream, 16 * 1024) {
            Ok(h) => h,
            Err(_) => return,
        };
        let (host, port) = match head.target_host_port() {
            Some(hp) => hp,
            None => {
                let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
                return;
            }
        };
        if !cfg.allowed_ports.contains(&port) {
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
            return;
        }
        if !self.allowed(&host) {
            // Deny by default: no grant, no relay. No error detail beyond the refusal.
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
            return;
        }
        if relay(stream, &head, &host, port, &cfg).is_err() {
            // Refusal before any relayed bytes (for example the SSRF guard) gets a visible
            // 403; after an established tunnel this line is harmless post-close garbage.
            let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
        }
    }
}

fn relay(
    client: &mut TcpStream,
    head: &Head,
    host: &str,
    port: u16,
    cfg: &ProxyConfig,
) -> Result<(), NetError> {
    let addr = resolve_checked(host, port, cfg)?;
    let mut upstream = TcpStream::connect_timeout(&addr, cfg.connect_timeout)
        .map_err(|_| NetError::RelayFailed)?;
    let _ = upstream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = upstream.set_write_timeout(Some(Duration::from_secs(30)));
    if head.is_connect {
        client
            .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
            .map_err(|e| NetError::Io(e.kind()))?;
    } else {
        // Plain-HTTP forward: re-issue the request as origin-form.
        let mut out = head.origin_form();
        out.push_str("Connection: close\r\n\r\n");
        upstream
            .write_all(out.as_bytes())
            .and_then(|_| upstream.write_all(&head.body))
            .map_err(|e| NetError::Io(e.kind()))?;
    }
    let mut c1 = client.try_clone().map_err(|e| NetError::Io(e.kind()))?;
    let mut u1 = upstream.try_clone().map_err(|e| NetError::Io(e.kind()))?;
    let t = std::thread::spawn(move || {
        let _ = std::io::copy(&mut u1, &mut c1);
        let _ = c1.shutdown(Shutdown::Write);
    });
    let _ = std::io::copy(client, &mut upstream);
    let _ = upstream.shutdown(Shutdown::Write);
    let _ = t.join();
    Ok(())
}

/// Resolve and apply the SSRF guard: every resolved address must be public.
pub fn resolve_checked(host: &str, port: u16, cfg: &ProxyConfig) -> Result<SocketAddr, NetError> {
    // IP literals skip DNS but not the guard.
    let addrs: Vec<SocketAddr> = match host.parse::<IpAddr>() {
        Ok(ip) => vec![SocketAddr::new(ip, port)],
        Err(_) => (host, port)
            .to_socket_addrs()
            .map_err(|_| NetError::RelayFailed)?
            .collect(),
    };
    let addr = addrs.first().ok_or(NetError::RelayFailed)?;
    if !cfg.allow_private_targets && !is_public_ip(&addr.ip()) {
        return Err(NetError::PrivateDestination);
    }
    Ok(*addr)
}

/// One plain-HTTP request the agent wants the runtime to make host-side.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FetchRequest {
    /// Full URL, `http://` or `https://`. https is terminated on the host with mandatory
    /// certificate verification against the configured root store (fail closed, no
    /// opt-out); the CONNECT relay covers sandbox-side https.
    pub url: String,
}

impl FetchRequest {
    /// Parse and validate.
    pub fn parse(url: &str) -> Result<Self, NetError> {
        let rest = url
            .strip_prefix("http://")
            .or_else(|| url.strip_prefix("https://"))
            .ok_or(NetError::InvalidTarget("only http:// and https://"))?;
        let authority = rest.split('/').next().unwrap_or("");
        if authority.contains('@') {
            return Err(NetError::InvalidTarget("userinfo"));
        }
        let host = authority.split(':').next().unwrap_or("");
        Domain::parse(host)?;
        if url.len() > 4096 || url.chars().any(|c| c.is_control()) {
            return Err(NetError::InvalidTarget("url"));
        }
        Ok(Self {
            url: url.to_string(),
        })
    }

    /// URL scheme: `http` or `https`.
    pub fn scheme(&self) -> &'static str {
        if self.url.starts_with("https://") {
            "https"
        } else {
            "http"
        }
    }

    /// Domain of the URL.
    pub fn domain(&self) -> Domain {
        let rest = self
            .url
            .strip_prefix("http://")
            .or_else(|| self.url.strip_prefix("https://"))
            .unwrap_or("");
        let authority = rest.split('/').next().unwrap_or("");
        Domain(authority.split(':').next().unwrap_or("").to_ascii_lowercase())
    }

    fn digest(&self) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Network, &self.domain().as_str().to_string())
            .part("url", self.url.as_bytes())
            .finish()
    }
}

/// Return the body once the buffered response is complete per its Content-Length.
/// `None` while the head is incomplete, the header is absent, or the body is short.
fn complete_body(buf: &[u8]) -> Option<Vec<u8>> {
    let pos = buf.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = std::str::from_utf8(&buf[..pos]).ok()?;
    let mut len: Option<usize> = None;
    for line in head.split("\r\n").skip(1) {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                len = value.trim().parse().ok();
            }
        }
    }
    let len = len?;
    let body = &buf[pos + 4..];
    (body.len() >= len).then(|| body[..len].to_vec())
}

/// Host-side network executor for one run scope: proposes and performs fetches under
/// request-bound tokens through the same ACL the listener enforces.
pub struct NetworkExecutor {
    agent: AgentHandle,
    run_id: RunId,
    scope_id: ScopeId,
    cfg: ProxyConfig,
}

impl NetworkExecutor {
    /// Bind to a run scope that has an attached [`DomainProxy`].
    pub fn new(agent: &AgentHandle, proxy: &DomainProxy, scope_id: ScopeId) -> Self {
        Self {
            agent: agent.clone(),
            run_id: proxy.run_id.clone(),
            scope_id,
            cfg: proxy.cfg.clone(),
        }
    }

    /// Propose fetching `req`. Target is the domain; the URL is bound via the args digest.
    pub fn propose_fetch(&self, req: &FetchRequest, reason: &str, origin: Origin) -> Result<ProposeResult, NetError> {
        Ok(self.agent.propose(Proposal {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind: ActionKind::Network,
            target: req.domain().as_str().to_string(),
            reason: reason.to_string(),
            args_digest: req.digest(),
            origin,
            declared_impact: Vec::new(),
        })?)
    }

    /// Fetch under an approval. The binding re-derives from the actual URL, so a swapped URL
    /// burns the token. The SSRF guard runs at connect time regardless of the grant.
    pub fn fetch(&self, token: ApprovalToken, req: &FetchRequest) -> Result<Vec<u8>, NetError> {
        let binding = ExecutionBinding {
            run_id: self.run_id.clone(),
            scope_id: self.scope_id.clone(),
            kind: ActionKind::Network,
            target: req.domain().as_str().to_string(),
            args_digest: req.digest(),
        };
        let guard = self.agent.consume(token, &binding)?;
        guard.checkpoint()?;
        match self.fetch_inner(req) {
            Ok(body) => {
                guard.complete(EffectOutcome::Ok {
                    bytes: body.len() as u64,
                });
                Ok(body)
            }
            Err(e) => {
                guard.complete(EffectOutcome::Failed { class: e.class() });
                Err(e)
            }
        }
    }

    fn fetch_inner(&self, req: &FetchRequest) -> Result<Vec<u8>, NetError> {
        let (host, port, path) = self.url_parts(req)?;
        let addr = resolve_checked(&host, port, &self.cfg)?;
        let tcp = TcpStream::connect_timeout(&addr, self.cfg.connect_timeout)
            .map_err(|_| NetError::RelayFailed)?;
        tcp.set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| NetError::Io(e.kind()))?;
        if req.scheme() == "https" {
            let mut tls = self.tls_wrap(tcp, &host)?;
            Self::roundtrip(&mut tls, &host, &path, self.cfg.max_response_bytes)
        } else {
            let mut tcp = tcp;
            Self::roundtrip(&mut tcp, &host, &path, self.cfg.max_response_bytes)
        }
    }

    /// Wrap a connected TCP stream in TLS with mandatory certificate verification against
    /// the configured roots (webpki roots by default). The handshake is driven to
    /// completion here, so any certificate or protocol failure is a visible `tls_failed`
    /// before a single request byte leaves the host. There is no verification opt-out.
    fn tls_wrap(
        &self,
        mut tcp: TcpStream,
        host: &str,
    ) -> Result<rustls::StreamOwned<rustls::ClientConnection, TcpStream>, NetError> {
        use std::sync::Arc;
        let roots = match &self.cfg.tls_roots {
            Some(r) => r.clone(),
            None => {
                let mut r = rustls::RootCertStore::empty();
                r.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
                r
            }
        };
        let config = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let name = rustls::pki_types::ServerName::try_from(host.to_string())
            .map_err(|_| NetError::InvalidTarget("dns name"))?;
        let mut conn =
            rustls::ClientConnection::new(Arc::new(config), name).map_err(|_| NetError::TlsFailed)?;
        while conn.is_handshaking() {
            conn.complete_io(&mut tcp).map_err(|_| NetError::TlsFailed)?;
        }
        Ok(rustls::StreamOwned::new(conn, tcp))
    }

    /// One HTTP/1.1 GET over any byte stream; returns only the body, capped.
    fn roundtrip<S: Read + Write>(
        s: &mut S,
        host: &str,
        path: &str,
        max_response_bytes: usize,
    ) -> Result<Vec<u8>, NetError> {
        let req_line = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: somnia-vibespace-proxy/0.1\r\nAccept: */*\r\nConnection: close\r\n\r\n",
            path, host
        );
        s.write_all(req_line.as_bytes())
            .map_err(|e| NetError::Io(e.kind()))?;
        let mut buf = Vec::new();
        let mut chunk = [0u8; 16384];
        loop {
            match s.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    if buf.len() > max_response_bytes {
                        return Err(NetError::TooLarge);
                    }
                    // Stop as soon as a Content-Length-complete body has arrived; TLS
                    // peers that skip close_notify would otherwise surface as errors
                    // after the full response is already in hand.
                    if let Some(body) = complete_body(&buf) {
                        return Ok(body);
                    }
                }
                // A read error after data arrived is treated like EOF: TLS servers that
                // close without close_notify land here (plain TCP close is Ok(0) above).
                Err(_) if !buf.is_empty() => break,
                Err(_) => return Err(NetError::RelayFailed),
            }
        }
        // Split header/body; only the body is returned.
        let pos = buf
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .ok_or(NetError::RelayFailed)?;
        Ok(buf[pos + 4..].to_vec())
    }

    fn url_parts(&self, req: &FetchRequest) -> Result<(String, u16, String), NetError> {
        let default_port: u16 = if req.scheme() == "https" { 443 } else { 80 };
        let rest = req
            .url
            .strip_prefix("http://")
            .or_else(|| req.url.strip_prefix("https://"))
            .ok_or(NetError::InvalidTarget("scheme"))?;
        let (authority, path) = match rest.find('/') {
            Some(i) => (&rest[..i], &rest[i..]),
            None => (rest, "/"),
        };
        let (host, port): (String, u16) = match authority.rsplit_once(':') {
            Some((h, p)) if !h.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => {
                (h.to_string(), p.parse().map_err(|_| NetError::InvalidTarget("port"))?)
            }
            Some((h, _)) if !h.is_empty() => (h.to_string(), default_port),
            _ if !authority.contains(':') => (authority.to_string(), default_port),
            _ => return Err(NetError::InvalidTarget("authority")),
        };
        if !self.cfg.allowed_ports.contains(&port) {
            return Err(NetError::InvalidTarget("port not allowed"));
        }
        Ok((host, port, path.to_string()))
    }
}
