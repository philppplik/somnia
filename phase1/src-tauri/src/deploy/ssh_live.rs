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
    connect_with_root(env("SOMNIA_SSH_LIVE_ROOT")).await
}

async fn connect_with_root(root: String) -> RusshTransport {
    let addr = env("SOMNIA_SSH_LIVE_ADDR");
    let (host, port) = addr.rsplit_once(':').expect("SOMNIA_SSH_LIVE_ADDR is host:port");
    let target = SshTarget::new(host, port.parse().expect("port"), env("SOMNIA_SSH_LIVE_USER"));
    let opts = ConnectOptions {
        root,
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

/// Full static-site deploy through the real ReleaseLayout pipeline against OpenSSH:
/// hash-verified stage with hard-link reuse, atomic activate, retention prune.
/// Root "/" confines to the throwaway server; the served-path check uses exec,
/// because the SFTP path confinement deliberately rejects reading through the
/// `current` symlink (symlink ancestors are rejected by design).
#[tokio::test]
#[ignore = "needs the OpenSSH target from the deploy-ssh-live workflow"]
async fn full_static_deploy_against_openssh() {
    use super::manifest::{sha256, DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest};
    use super::release::ReleaseLayout;
    use std::collections::BTreeMap;

    let artifact = |files: &[(&str, &[u8])], build: &str| {
        let manifest = DeployArtifactManifest {
            kind: DeployArtifactKind::Static,
            files: files
                .iter()
                .map(|(p, b)| DeployArtifactFile {
                    path: (*p).to_string(),
                    sha256: sha256(b),
                    size: b.len() as u64,
                    mode: 0o644,
                })
                .collect(),
            entry: None,
            engines: None,
            port: None,
            build_id: build.into(),
        };
        let bytes: BTreeMap<String, Vec<u8>> =
            files.iter().map(|(p, b)| ((*p).to_string(), b.to_vec())).collect();
        (manifest, bytes)
    };

    // Root "/srv/somnia": the production ReleaseLayout prefix; the workflow
    // prepares it as a runner-owned directory on the throwaway server.
    let mut t = connect_with_root("/srv/somnia".to_string()).await;
    let layout = ReleaseLayout::new("livecheck").expect("layout");
    let root = layout.root().to_string();
    let _ = t.remove_tree(&root).await;

    // Release 1: stage two files, then activate atomically.
    let (m1, f1) = artifact(&[("index.html", b"<h1>v1</h1>"), ("assets/app.css", b"body{v:1}")], "b1");
    layout.stage(&mut t, "r-1", &m1, &f1).await.expect("stage r-1");
    assert_eq!(layout.current_release(&mut t).await.expect("current before activate"), None);
    assert_eq!(layout.activate(&mut t, "r-1").await.expect("activate r-1"), None);
    assert_eq!(layout.current_release(&mut t).await.expect("current r-1").as_deref(), Some("r-1"));
    let served = t.exec("cat /srv/somnia/livecheck/current/index.html", None).await.expect("exec cat v1");
    assert_eq!(served.stdout, "<h1>v1</h1>");

    // Release 2: index changed, css reused via hard link, activated over the old release.
    let (m2, f2) = artifact(&[("index.html", b"<h1>v2</h1>"), ("assets/app.css", b"body{v:1}")], "b2");
    let changes = layout.stage(&mut t, "r-2", &m2, &f2).await.expect("stage r-2");
    assert_eq!(changes.unchanged.len(), 1, "unchanged css must be hard-linked, not re-uploaded");
    assert_eq!(changes.changed.len(), 1, "index must count as changed");
    assert_eq!(layout.activate(&mut t, "r-2").await.expect("activate r-2").as_deref(), Some("r-1"));
    assert_eq!(layout.current_release(&mut t).await.expect("current r-2").as_deref(), Some("r-2"));
    let served = t.exec("cat /srv/somnia/livecheck/current/index.html", None).await.expect("exec cat v2");
    assert_eq!(served.stdout, "<h1>v2</h1>", "atomic switch must serve the new release");
    let served = t.exec("cat /srv/somnia/livecheck/current/assets/app.css", None).await.expect("exec cat css");
    assert_eq!(served.stdout, "body{v:1}");

    // Retention: prune keeps the current release and removes the old one.
    assert_eq!(layout.prune(&mut t, 1).await.expect("prune"), vec!["r-1".to_string()]);
    assert!(!t.exists(&format!("{root}/releases/r-1")).await.expect("r-1 exists check"));
    let served = t.exec("cat /srv/somnia/livecheck/current/index.html", None).await.expect("exec cat after prune");
    assert_eq!(served.stdout, "<h1>v2</h1>", "current must keep serving after prune");

    let _ = t.remove_tree(&root).await;
    t.close().await;
}
