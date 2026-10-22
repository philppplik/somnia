//! Live engine integration test: the real russh transport against a real OpenSSH server.
//!
//! Runs only in the dispatch-only `deploy-ssh-live` workflow, which starts a throwaway
//! sshd on 127.0.0.1:2222 with one-time keys. Ignored everywhere else; never runs against
//! a real user server. Covers transport behavior only - it is not a full deployment proof.

use super::host_keys::HostKeyStore;
use super::keys::DeploymentKey;
use super::ssh::{probe_host_key, ConnectOptions, Credential, RusshTransport, SshExec, SshTarget};
use super::transport::SshTransport;
use std::sync::Arc;

fn env(name: &str) -> String {
    std::env::var(name)
        .unwrap_or_else(|_| panic!("{name} is set by the deploy-ssh-live workflow"))
}

async fn connect() -> RusshTransport {
    let addr = env("SOMNIA_SSH_LIVE_ADDR");
    let (host, port) = addr.rsplit_once(':').expect("SOMNIA_SSH_LIVE_ADDR is host:port");
    let target = SshTarget::new(host, port.parse().expect("port"), env("SOMNIA_SSH_LIVE_USER"));
    let opts = ConnectOptions {
        root: env("SOMNIA_SSH_LIVE_ROOT"),
        ..Default::default()
    };
    // Real discovery path: probe the untrusted host key first, then pin it.
    let observed = probe_host_key(&target, &opts).await.expect("probe host key");
    assert_eq!(observed.algorithm, "ssh-ed25519");
    let store = Arc::new(HostKeyStore::default());
    store.trust_new(host, target.port, &observed).expect("pin host key");
    let pem = std::fs::read(env("SOMNIA_SSH_LIVE_KEY")).expect("read client key");
    let key = DeploymentKey::from_openssh_bytes(&pem).expect("decode client key");
    RusshTransport::connect(&target, store, Credential::Key(&key), opts, [])
        .await
        .expect("connect against OpenSSH")
}

#[tokio::test]
#[ignore = "needs the OpenSSH target from the deploy-ssh-live workflow"]
async fn exec_streams_status_and_stdin_against_openssh() {
    let mut t = connect().await;
    let out = t
        .exec("printf 'stdout-line'; printf 'stderr-line' >&2; exit 3", None)
        .await
        .expect("exec");
    assert_eq!(out.status, Some(3));
    assert_eq!(out.stdout.trim_end(), "stdout-line");
    assert_eq!(out.stderr.trim_end(), "stderr-line");
    assert!(!out.success());
    let echo = t.exec("cat", Some(b"stdin-bytes")).await.expect("exec stdin");
    assert!(echo.success());
    assert_eq!(echo.stdout, "stdin-bytes");
    t.close().await;
}

#[tokio::test]
#[ignore = "needs the OpenSSH target from the deploy-ssh-live workflow"]
async fn sftp_tree_ops_against_openssh() {
    let mut t = connect().await;
    let site = format!("{}/live-check", t.root());
    let _ = t.remove_tree(&site).await;
    t.mkdir(&format!("{site}/a/b")).await.expect("mkdir -p");
    let file = format!("{site}/a/file.txt");
    t.write(&file, b"version-1", 0o644).await.expect("write v1");
    assert_eq!(t.read(&file).await.expect("read v1"), b"version-1");
    assert_eq!(t.hash(&file).await.expect("hash").len(), 64);
    // Atomic replace: rename over an existing target.
    let tmp = format!("{site}/a/.upload.tmp");
    t.write(&tmp, b"version-2", 0o644).await.expect("write v2");
    t.rename(&tmp, &file).await.expect("atomic rename over existing");
    assert_eq!(t.read(&file).await.expect("read v2"), b"version-2");
    // Hard link (OpenSSH hardlink@openssh.com extension).
    let hard = format!("{site}/a/hard.txt");
    t.hard_link(&file, &hard).await.expect("hard link");
    assert_eq!(t.read(&hard).await.expect("read hard link"), b"version-2");
    // Symlink + read_link in the release layout the engine policy requires:
    // targets must be releases/<id>; anything else must be rejected as InvalidInput.
    t.mkdir(&format!("{site}/releases/r-1")).await.expect("mkdir releases");
    let link = format!("{site}/current");
    assert!(t.symlink("a/file.txt", &link).await.is_err(), "policy must reject non-release target");
    t.symlink("releases/r-1", &link).await.expect("symlink");
    assert_eq!(t.read_link(&link).await.expect("read_link").as_deref(), Some("releases/r-1"));
    assert!(t.exists(&file).await.expect("exists"));
    let entries = t.list(&format!("{site}/a")).await.expect("list");
    assert!(entries.iter().any(|e| e.contains("file.txt")), "list: {entries:?}");
    t.remove_tree(&site).await.expect("remove_tree");
    assert!(!t.exists(&site).await.expect("exists after remove"));
    t.close().await;
}
