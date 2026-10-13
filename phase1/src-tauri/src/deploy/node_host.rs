//! Production `NodeHost`: the persistent host-key store, the keychain key of the target and the
//! project folder. Connections succeed only for a pinned host key and a key held in the keychain.
use super::{
    host_keys::HostKeyStore,
    keys::KeyStore,
    node_collect::{detect_node, collect_node, CollectedNode, NodePlan},
    node_engine::{NodeHost, PublicCheck},
    ssh::{ConnectOptions, Credential, FailureKind, RusshTransport, SshTarget},
    DeployError,
};
use crate::deploy_guard::EngineError;
use crate::deploy_targets::Target;
use crate::oauth_store::SecretBackend;
use std::path::PathBuf;
use std::sync::Arc;

pub type ProjectRoot = Box<dyn Fn(&Target) -> Option<PathBuf> + Send + Sync>;

pub struct DesktopNodeHost<B: SecretBackend> {
    pub keys: Arc<KeyStore<B>>,
    pub pins: Arc<HostKeyStore>,
    /// Folder of the project a target publishes. The host never guesses it from the target.
    pub project_root: ProjectRoot,
    pub options: ConnectOptions,
    /// Blocking HTTPS request to the public address. The desktop build passes [`https_probe`].
    pub public_probe: Box<dyn Fn(&str) -> PublicCheck + Send + Sync>,
}

impl<B: SecretBackend + Send + Sync> NodeHost for DesktopNodeHost<B> {
    type Remote = RusshTransport;
    fn collect(&self, target: &Target) -> Result<(NodePlan, CollectedNode), EngineError> {
        let root = (self.project_root)(target).ok_or(EngineError::Preflight)?;
        let plan = detect_node(&root).map_err(|_| EngineError::Preflight)?;
        let collected = collect_node(&root, &plan).map_err(|_| EngineError::Preflight)?;
        Ok((plan, collected))
    }
    async fn connect(&self, target: &Target) -> Result<RusshTransport, EngineError> {
        let key = self.keys.load(&target.id).map_err(|e| match e {
            DeployError::KeyMissing => EngineError::Auth,
            _ => EngineError::Connect,
        })?;
        RusshTransport::connect(
            &SshTarget::new(target.host.clone(), target.port, target.user.clone()),
            self.pins.clone(),
            Credential::Key(&key),
            self.options.clone(),
            [],
        )
        .await
        .map_err(|f| match f.kind {
            FailureKind::HostKeyUntrusted | FailureKind::HostKeyChanged => EngineError::HostKeyRejected,
            FailureKind::AuthRejected => EngineError::Auth,
            _ => EngineError::Connect,
        })
    }
    fn fingerprint(&self, remote: &RusshTransport) -> String {
        remote.pinned_host_key().fingerprint.clone()
    }
    fn public_check(&self, domain: &str) -> PublicCheck {
        (self.public_probe)(domain)
    }
}

/// `https://<domain>/` with a short timeout. Any transport error (DNS, refused, certificate not
/// issued yet) is "not reachable yet", never a failure: Caddy retries issuance on its own.
#[cfg(feature = "desktop")]
pub fn https_probe(domain: &str) -> PublicCheck {
    let Ok(client) = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(10)).redirect(reqwest::redirect::Policy::limited(3)).build() else {
        return PublicCheck::NotReachableYet;
    };
    match client.get(format!("https://{domain}/")).send() {
        Ok(r) if r.status().is_success() || r.status().is_redirection() => PublicCheck::Healthy,
        Ok(r) => PublicCheck::Unhealthy(r.status().as_u16()),
        Err(_) => PublicCheck::NotReachableYet,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::{
        host_keys::HostKey,
        node_app::NodeOptions,
        node_engine::NodeEngine,
        ssh_testkit::TestServer,
    };
    use crate::deploy_guard::{Action, DeployEngine};
    use crate::deploy_targets::{key_slot_for, TargetKind};
    use crate::oauth_store::MemoryBackend;
    use std::sync::Mutex;
    use std::time::Duration;

    fn write(root: &std::path::Path, rel: &str, body: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }

    /// Whole path with real SSH: keychain key authenticates, the pin is enforced, the plan binds
    /// the fingerprint, the publish lands through SFTP and a wrong pin is refused.
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread")]
    async fn keychain_key_pinned_host_plan_and_publish_over_real_ssh() {
        let server = TestServer::start().await;
        for d in ["", "/releases", "/shared"] {
            std::fs::create_dir_all(server.path(&format!("/srv/somnia/shop{d}"))).unwrap();
        }
        let up = Arc::new(Mutex::new(false));
        let (jail, up2) = (server.path("/"), up.clone());
        server.set_exec(move |c, _| {
            let ok = |s: &str| (0u32, s.to_string(), String::new());
            if c.contains("command -v node") {
                ok("SOMNIA_NODE_PATH /usr/bin/node\nSOMNIA_NODE_VERSION v22.1.0\n")
            } else if c.starts_with("ss -H") || c.contains("wc -c") || c.starts_with("tail -n") {
                ok("")
            } else if c.contains(" enable '") {
                ok("SOMNIA_ENABLED\n")
            } else if c.contains(" show somnia-") {
                ok("ActiveState=active\nNRestarts=0\n")
            } else if c.contains(" restart somnia-") {
                let link = std::fs::read_link(jail.join("srv/somnia/shop/current")).unwrap();
                *up2.lock().unwrap() = jail.join("srv/somnia/shop").join(link).join("server.js").is_file();
                ok("SOMNIA_RESTARTED\n")
            } else if c.contains("SOMNIA_HC_PORT") {
                ok(if *up2.lock().unwrap() { "SOMNIA_HEALTH 200\n" } else { "SOMNIA_HEALTH down\n" })
            } else if c.contains("caddy validate") {
                ok("SOMNIA_CADDY_OK\n")
            } else if c.contains("caddy reload") {
                ok("SOMNIA_CADDY_RELOADED\n")
            } else {
                (127, String::new(), String::new())
            }
        });
        let keys = Arc::new(KeyStore::new(MemoryBackend::default()));
        let public = keys.create("shop").unwrap();
        server.authorize(&russh::keys::PublicKey::from_openssh(&public.public_key).unwrap());
        let pins = Arc::new(HostKeyStore::default());
        let real = HostKey::from_public_key(server.host_key.public_key());
        let project = tempfile::tempdir().unwrap();
        write(project.path(), "package.json", r#"{"dependencies":{"next":"15"}}"#);
        write(project.path(), "next.config.js", "module.exports={output:'standalone'}");
        write(project.path(), ".next/standalone/server.js", "x");
        write(project.path(), ".next/static/a.js", "x");
        let root = project.path().to_path_buf();
        let host = DesktopNodeHost { keys, pins: pins.clone(), project_root: Box::new(move |_| Some(root.clone())), options: ConnectOptions::default(), public_probe: Box::new(|_| PublicCheck::NotReachableYet) };
        let engine = NodeEngine::new(host, NodeOptions { health_attempts: 2, health_interval: Duration::ZERO, ..Default::default() }).unwrap();
        let target = Target { id: "shop".into(), name: "Shop".into(), host: "127.0.0.1".into(), port: server.addr.port(), user: "somnia".into(), domain: Some("example.com".into()), kind: TargetKind::Node, key_slot: key_slot_for("shop"), spa: false, app_port: None, ftp: None };
        let t2 = target.clone();
        // Unpinned host: refused before anything is sent.
        let e = tokio::task::spawn_blocking(move || { let r = engine.plan(&t2, Action::Publish, None); (engine, r) }).await.unwrap();
        let (engine, refused) = e;
        assert_eq!(refused.unwrap_err(), EngineError::HostKeyRejected);
        pins.trust_new("127.0.0.1", server.addr.port(), &real).unwrap();
        let t3 = target.clone();
        let out = tokio::task::spawn_blocking(move || {
            let plan = engine.plan(&t3, Action::Publish, None)?;
            let fp = plan.fingerprint.clone();
            let outcome = engine.publish(&t3, &plan, &|_| {})?;
            Ok::<_, EngineError>((fp, outcome))
        })
        .await
        .unwrap()
        .unwrap();
        assert_eq!(out.0, real.fingerprint);
        assert_eq!(out.1.url.as_deref(), Some("https://example.com"));
        assert!(server.path("/srv/somnia/shop/current/server.js").is_file());
    }
}
