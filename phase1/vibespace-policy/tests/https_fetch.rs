//! Host-side HTTPS fetch (Welle-B A4): TLS terminated on the host by the broker-owned
//! network executor, token-bound like the http path, certificate verification mandatory
//! (fail closed, no opt-out), SSRF guard unchanged.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;
use vibespace_policy::*;

/// Local TLS server with a self-signed cert for 127.0.0.1. Returns (port, cert DER).
fn local_tls_server(body: &'static [u8]) -> (u16, Vec<u8>) {
    let rcgen::CertifiedKey { cert, key_pair } =
        rcgen::generate_simple_self_signed(vec!["127.0.0.1".to_string()]).unwrap();
    let cert_der = cert.der().to_vec();
    let cfg = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(key_pair.serialize_der()).into(),
        )
        .unwrap();
    let cfg = Arc::new(cfg);
    let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = l.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for s in l.incoming().take(16) {
            if let Ok(tcp) = s {
                let cfg = cfg.clone();
                std::thread::spawn(move || {
                    let Ok(conn) = rustls::ServerConnection::new(cfg) else { return };
                    let mut tls = rustls::StreamOwned::new(conn, tcp);
                    let mut req = Vec::new();
                    let mut byte = [0u8; 1];
                    // Read the request head, then answer; handshake errors just end it.
                    while !req.ends_with(b"\r\n\r\n") {
                        match tls.read(&mut byte) {
                            Ok(0) => return,
                            Ok(_) => req.push(byte[0]),
                            Err(_) => return,
                        }
                        if req.len() > 8192 {
                            return;
                        }
                    }
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    if tls.write_all(head.as_bytes()).is_ok() {
                        let _ = tls.write_all(body);
                        let _ = tls.flush();
                    }
                });
            }
        }
    });
    (port, cert_der)
}

fn broker_with_run(kinds: &[ActionKind]) -> (BrokerHandles, RunId, ScopeId) {
    let b = ConsentBroker::new().unwrap();
    let run = RunId::new(format!("run-{}", std::process::id())).unwrap();
    let scope = ScopeId::new("copy-1").unwrap();
    let mut rs = RunScope::new(run.clone(), scope.clone());
    rs.allowed_kinds = kinds.iter().copied().collect();
    b.runs.register_run(rs).unwrap();
    (b, run, scope)
}

fn test_proxy_cfg(port: u16, roots: Option<rustls::RootCertStore>) -> ProxyConfig {
    ProxyConfig {
        allow_private_targets: true, // 127.0.0.1 fixtures only
        allowed_ports: [80u16, 443u16, port].into_iter().collect(),
        tls_roots: roots,
        ..Default::default()
    }
}

fn fetch_with_grant(nx: &NetworkExecutor, b: &BrokerHandles, req: &FetchRequest) -> Result<Vec<u8>, NetError> {
    let ProposeResult::Pending(id) = nx.propose_fetch(req, "need data", Origin::Model).unwrap() else {
        panic!("expected pending")
    };
    b.ui.decide(&id, UserDecision::AllowOnce).unwrap();
    let PollResult::Approved { token, .. } = b.agent.poll(&id).unwrap() else {
        panic!("expected approved")
    };
    nx.fetch(token, req)
}

#[test]
fn https_fetch_roundtrip_under_token() {
    let (b, _run, scope) = broker_with_run(&[ActionKind::Network]);
    let (port, cert_der) = local_tls_server(b"hello-tls");
    let mut roots = rustls::RootCertStore::empty();
    roots
        .add(rustls::pki_types::CertificateDer::from(cert_der))
        .unwrap();
    let proxy = DomainProxy::attach(&b.agent, &b.runs, _run.clone(), scope.clone(), test_proxy_cfg(port, Some(roots))).unwrap();
    let nx = NetworkExecutor::new(&b.agent, &proxy, scope.clone());
    let req = FetchRequest::parse(&format!("https://127.0.0.1:{port}/data")).unwrap();
    assert_eq!(req.scheme(), "https");
    let body = fetch_with_grant(&nx, &b, &req).unwrap();
    assert_eq!(body, b"hello-tls");
}

#[test]
fn https_untrusted_cert_fails_closed() {
    let (b, run, scope) = broker_with_run(&[ActionKind::Network]);
    let (port, _cert) = local_tls_server(b"x");
    // Empty root store: nothing is trusted, so the self-signed fixture cert must fail.
    let proxy = DomainProxy::attach(
        &b.agent,
        &b.runs,
        run.clone(),
        scope.clone(),
        test_proxy_cfg(port, Some(rustls::RootCertStore::empty())),
    )
    .unwrap();
    let nx = NetworkExecutor::new(&b.agent, &proxy, scope.clone());
    let req = FetchRequest::parse(&format!("https://127.0.0.1:{port}/")).unwrap();
    let err = fetch_with_grant(&nx, &b, &req).expect_err("untrusted cert must fail closed");
    assert_eq!(err.class(), "tls_failed", "audit-visible class, got {err}");
}

#[test]
fn https_url_parse_and_domain() {
    let r = FetchRequest::parse("https://api.example.com/x?q=1").unwrap();
    assert_eq!(r.scheme(), "https");
    assert_eq!(r.domain().as_str(), "api.example.com");
    let r = FetchRequest::parse("http://api.example.com/").unwrap();
    assert_eq!(r.scheme(), "http");
    assert!(FetchRequest::parse("ftp://api.example.com/").is_err());
    assert!(FetchRequest::parse("https://user@api.example.com/").is_err());
}

#[test]
fn ssrf_guard_covers_https_destinations() {
    let cfg = ProxyConfig::default();
    let err = vibespace_policy::net::resolve_checked("127.0.0.1", 443, &cfg)
        .expect_err("loopback must be refused");
    assert_eq!(err.class(), "private_destination");
    let err = vibespace_policy::net::resolve_checked("169.254.169.254", 443, &cfg)
        .expect_err("link-local metadata endpoint must be refused");
    assert_eq!(err.class(), "private_destination");
}
