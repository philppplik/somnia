//! In-process fake FTP/FTPS server for tests. No real network beyond 127.0.0.1, no real server.
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
};
use tokio_rustls::{
    rustls::{
        crypto::ring,
        pki_types::{CertificateDer, PrivateKeyDer},
        ServerConfig,
    },
    TlsAcceptor,
};

trait Io: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Io for T {}
type BoxIo = Box<dyn Io>;

#[derive(Default)]
pub struct Srv {
    /// Absolute path -> `None` for a directory, `Some(bytes)` for a file.
    pub fs: BTreeMap<String, Option<Vec<u8>>>,
    /// Every command line. `PASS` lines are logged as `PASS` only.
    pub log: Vec<String>,
    pub user: String,
    pub pass: String,
    pub no_epsv: bool,
    pub no_mlsd: bool,
    pub no_size: bool,
    pub bad_size: bool,
    pub pasv_wrong_ip: bool,
    pub rnto_overwrite: bool,
    /// Fail every STOR after this many successful ones.
    pub fail_stor_after: Option<usize>,
    /// Fail one RNTO once this many have succeeded (one-shot).
    pub fail_rnto_after: Option<usize>,
    pub stors: usize,
    pub rntos: usize,
}
impl Srv {
    pub fn files(&self) -> Vec<String> {
        self.fs.iter().filter(|(_, v)| v.is_some()).map(|(k, _)| k.clone()).collect()
    }
    pub fn file(&self, path: &str) -> Option<Vec<u8>> {
        self.fs.get(path).cloned().flatten()
    }
    pub fn put(&mut self, path: &str, bytes: &[u8]) {
        let mut cur = String::new();
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        for seg in &parts[..parts.len().saturating_sub(1)] {
            cur.push('/');
            cur.push_str(seg);
            self.fs.entry(cur.clone()).or_insert(None);
        }
        self.fs.insert(path.to_string(), Some(bytes.to_vec()));
    }
    pub fn logged(&self, word: &str) -> bool {
        self.log.iter().any(|l| l.split(' ').next() == Some(word))
    }
}

pub struct Certs {
    pub ca_der: CertificateDer<'static>,
    pub leaf_der: Vec<u8>,
    pub server: Arc<ServerConfig>,
}
fn server_config(leaf: &CertificateDer<'static>, key: Vec<u8>) -> Arc<ServerConfig> {
    Arc::new(
        ServerConfig::builder_with_provider(Arc::new(ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![leaf.clone()], PrivateKeyDer::Pkcs8(key.into()))
            .unwrap(),
    )
}
/// A leaf for `names` signed by a fresh test CA. `ca_der` is the trust anchor to put into `FtpOptions::extra_roots`.
pub fn ca_signed(names: &[&str]) -> Certs {
    let ca_key = rcgen::KeyPair::generate().unwrap();
    let mut ca_params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
    ca_params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    ca_params.distinguished_name.push(rcgen::DnType::CommonName, "Somnia test CA");
    let ca = ca_params.self_signed(&ca_key).unwrap();
    let leaf_key = rcgen::KeyPair::generate().unwrap();
    let params = rcgen::CertificateParams::new(names.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap();
    let leaf = params.signed_by(&leaf_key, &ca, &ca_key).unwrap();
    Certs { ca_der: ca.der().clone(), leaf_der: leaf.der().to_vec(), server: server_config(leaf.der(), leaf_key.serialize_der()) }
}
/// A self-signed leaf that no root vouches for.
pub fn self_signed(names: &[&str]) -> Certs {
    let key = rcgen::KeyPair::generate().unwrap();
    let params = rcgen::CertificateParams::new(names.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap();
    let cert = params.self_signed(&key).unwrap();
    Certs { ca_der: cert.der().clone(), leaf_der: cert.der().to_vec(), server: server_config(cert.der(), key.serialize_der()) }
}

pub struct FakeFtp {
    pub port: u16,
    pub state: Arc<Mutex<Srv>>,
    _rt: tokio::runtime::Runtime,
}
impl FakeFtp {
    /// `tls: None` is a server without AUTH TLS (plain FTP only).
    pub fn start(tls: Option<Arc<ServerConfig>>) -> FakeFtp {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().unwrap();
        let state = Arc::new(Mutex::new(Srv { user: "user".into(), pass: "secret".into(), ..Default::default() }));
        let listener = rt.block_on(TcpListener::bind("127.0.0.1:0")).unwrap();
        let port = listener.local_addr().unwrap().port();
        let st = state.clone();
        rt.spawn(async move {
            loop {
                let Ok((sock, _)) = listener.accept().await else { return };
                let (st, tls) = (st.clone(), tls.clone());
                tokio::spawn(async move {
                    let _ = handle(sock, st, tls).await;
                });
            }
        });
        FakeFtp { port, state, _rt: rt }
    }
    pub fn with<R>(&self, f: impl FnOnce(&mut Srv) -> R) -> R {
        f(&mut self.state.lock().unwrap())
    }
}

fn norm(p: &str) -> String {
    let t = p.trim_end_matches('/');
    if t.is_empty() { "/".into() } else { t.to_string() }
}
fn parent_of(p: &str) -> String {
    match p.rsplit_once('/') {
        Some(("", _)) | None => "/".into(),
        Some((a, _)) => a.to_string(),
    }
}
fn dir_exists(s: &Srv, p: &str) -> bool {
    p == "/" || matches!(s.fs.get(p), Some(None))
}
async fn say(rd: &mut BufReader<BoxIo>, line: &str) -> std::io::Result<()> {
    let io = rd.get_mut();
    io.write_all(format!("{line}\r\n").as_bytes()).await?;
    io.flush().await
}

async fn handle(sock: TcpStream, st: Arc<Mutex<Srv>>, tls: Option<Arc<ServerConfig>>) -> std::io::Result<()> {
    let mut rd: BufReader<BoxIo> = BufReader::new(Box::new(sock));
    let mut secured = false;
    let mut prot_p = false;
    let mut authed = false;
    let mut user = String::new();
    let mut pending: Option<TcpListener> = None;
    let mut rnfr: Option<String> = None;
    say(&mut rd, "220 fake ftp ready").await?;
    loop {
        let mut line = String::new();
        if rd.read_line(&mut line).await? == 0 {
            return Ok(());
        }
        let line = line.trim_end().to_string();
        let (cmd, arg) = line.split_once(' ').map(|(c, a)| (c.to_ascii_uppercase(), a.to_string())).unwrap_or((line.to_ascii_uppercase(), String::new()));
        st.lock().unwrap().log.push(if cmd == "PASS" { "PASS".into() } else { line.clone() });
        match cmd.as_str() {
            "AUTH" => match &tls {
                Some(cfg) => {
                    say(&mut rd, "234 go ahead").await?;
                    let io = std::mem::replace(&mut rd, BufReader::new(Box::new(tokio::io::join(tokio::io::empty(), tokio::io::sink())) as BoxIo)).into_inner();
                    rd = BufReader::new(Box::new(TlsAcceptor::from(cfg.clone()).accept(io).await?));
                    secured = true;
                }
                None => say(&mut rd, "502 no tls").await?,
            },
            "PBSZ" => say(&mut rd, "200 ok").await?,
            "PROT" => {
                prot_p = arg.eq_ignore_ascii_case("P") && secured;
                say(&mut rd, "200 ok").await?
            }
            "USER" => {
                user = arg;
                say(&mut rd, "331 password please").await?
            }
            "PASS" => {
                let ok = { let s = st.lock().unwrap(); user == s.user && arg == s.pass };
                authed = ok;
                say(&mut rd, if ok { "230 logged in" } else { "530 login incorrect" }).await?
            }
            "TYPE" => say(&mut rd, "200 binary").await?,
            "FEAT" => say(&mut rd, "211-Features:\r\n MLSD\r\n SIZE\r\n211 End").await?,
            "QUIT" => {
                say(&mut rd, "221 bye").await?;
                return Ok(());
            }
            "EPSV" | "PASV" => {
                let (no_epsv, wrong) = { let s = st.lock().unwrap(); (s.no_epsv, s.pasv_wrong_ip) };
                if cmd == "EPSV" && no_epsv {
                    say(&mut rd, "500 EPSV not understood").await?;
                    continue;
                }
                let l = TcpListener::bind("127.0.0.1:0").await?;
                let port = l.local_addr()?.port();
                pending = Some(l);
                if cmd == "EPSV" {
                    say(&mut rd, &format!("229 Entering Extended Passive Mode (|||{port}|)")).await?
                } else {
                    let ip = if wrong { "10,255,255,1" } else { "127,0,0,1" };
                    say(&mut rd, &format!("227 Entering Passive Mode ({ip},{},{})", port / 256, port % 256)).await?
                }
            }
            "STOR" | "RETR" | "LIST" | "MLSD" => {
                if !authed {
                    say(&mut rd, "530 login first").await?;
                    continue;
                }
                let path = norm(if arg.is_empty() { "/" } else { &arg });
                // Decide first, so a rejected command never touches the data connection.
                let verdict: Result<Vec<u8>, String> = {
                    let mut s = st.lock().unwrap();
                    match cmd.as_str() {
                        "STOR" => {
                            if !dir_exists(&s, &parent_of(&path)) {
                                Err("550 no such directory".into())
                            } else if s.fail_stor_after.is_some_and(|n| s.stors >= n) {
                                Err("451 local error".into())
                            } else {
                                Ok(vec![])
                            }
                        }
                        "RETR" => match s.fs.get(&path) {
                            Some(Some(b)) => Ok(b.clone()),
                            _ => Err("550 no such file".into()),
                        },
                        _ if cmd == "MLSD" && s.no_mlsd => Err("500 MLSD not understood".into()),
                        _ => {
                            if !dir_exists(&s, &path) {
                                Err("550 no such directory".into())
                            } else {
                                let prefix = if path == "/" { "/".to_string() } else { format!("{path}/") };
                                let mut out = String::new();
                                for (k, v) in s.fs.iter().filter(|(k, _)| k.starts_with(&prefix) && !k[prefix.len()..].contains('/') && k.len() > prefix.len()) {
                                    let name = &k[prefix.len()..];
                                    match (cmd.as_str(), v) {
                                        ("MLSD", None) => out.push_str(&format!("type=dir;modify=20261013093000; {name}\r\n")),
                                        ("MLSD", Some(b)) => out.push_str(&format!("type=file;size={};modify=20261013093000; {name}\r\n", b.len())),
                                        (_, None) => out.push_str(&format!("drwxr-xr-x   2 ftp ftp 4096 Oct 13 09:30 {name}\r\n")),
                                        (_, Some(b)) => out.push_str(&format!("-rw-r--r--   1 ftp ftp {} Oct 13 09:30 {name}\r\n", b.len())),
                                    }
                                }
                                if cmd == "LIST" { out.insert_str(0, "total 8\r\n"); }
                                Ok(out.into_bytes())
                            }
                        }
                    }
                };
                let payload = match verdict {
                    Err(msg) => {
                        say(&mut rd, &msg).await?;
                        continue;
                    }
                    Ok(p) => p,
                };
                let Some(l) = pending.take() else {
                    say(&mut rd, "425 use PASV first").await?;
                    continue;
                };
                say(&mut rd, "150 opening data connection").await?;
                let (data, _) = l.accept().await?;
                let mut data: BoxIo = match (&tls, prot_p) {
                    (Some(cfg), true) => Box::new(TlsAcceptor::from(cfg.clone()).accept(data).await?),
                    _ => Box::new(data),
                };
                if cmd == "STOR" {
                    let mut buf = Vec::new();
                    let _ = data.read_to_end(&mut buf).await;
                    let mut s = st.lock().unwrap();
                    s.put(&path, &buf);
                    s.stors += 1;
                } else {
                    data.write_all(&payload).await?;
                    let _ = data.shutdown().await;
                }
                drop(data);
                say(&mut rd, "226 transfer complete").await?;
            }
            "MKD" => {
                let path = norm(&arg);
                let reply = { let mut s = st.lock().unwrap(); if !authed { "530 login first" } else if s.fs.contains_key(&path) || path == "/" { "550 exists" } else if !dir_exists(&s, &parent_of(&path)) { "550 no parent" } else { s.fs.insert(path.clone(), None); "257 created" } };
                say(&mut rd, reply).await?
            }
            "RMD" | "DELE" => {
                let path = norm(&arg);
                let prefix = format!("{path}/");
                let reply = { let mut s = st.lock().unwrap(); match (cmd.as_str(), s.fs.get(&path).cloned()) {
                    ("DELE", Some(Some(_))) => { s.fs.remove(&path); "250 deleted" }
                    ("RMD", Some(None)) if !s.fs.keys().any(|k| k.starts_with(&prefix)) => { s.fs.remove(&path); "250 removed" }
                    ("RMD", Some(None)) => "550 not empty",
                    _ => "550 no such file",
                } };
                say(&mut rd, reply).await?
            }
            "RNFR" => {
                let path = norm(&arg);
                let exists = st.lock().unwrap().fs.get(&path).is_some_and(|v| v.is_some());
                if exists { rnfr = Some(path); say(&mut rd, "350 ready for RNTO").await? } else { say(&mut rd, "550 no such file").await? }
            }
            "RNTO" => {
                let to = norm(&arg);
                let Some(from) = rnfr.take() else { say(&mut rd, "503 RNFR first").await?; continue };
                let reply = { let mut s = st.lock().unwrap(); let fail = s.fail_rnto_after.is_some_and(|n| s.rntos >= n); if fail { s.fail_rnto_after = None; } if fail { "451 local error" }
                    else if !dir_exists(&s, &parent_of(&to)) { "550 no such directory" }
                    else if s.fs.get(&to).is_some_and(|v| v.is_some()) && !s.rnto_overwrite { "550 target exists" }
                    else { let v = s.fs.remove(&from).flatten().unwrap_or_default(); s.fs.insert(to, Some(v)); s.rntos += 1; "250 renamed" } };
                say(&mut rd, reply).await?
            }
            "SIZE" => {
                let path = norm(&arg);
                let reply = { let s = st.lock().unwrap(); if s.no_size { "502 SIZE not implemented".to_string() } else {
                    match s.fs.get(&path) { Some(Some(b)) => format!("213 {}", b.len() + usize::from(s.bad_size)), _ => "550 no such file".to_string() }
                } };
                say(&mut rd, &reply).await?
            }
            _ => say(&mut rd, "502 not implemented").await?,
        }
    }
}

