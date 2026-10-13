//! `DeployEngine` for Node targets, to be plugged into the live engine's node hook. It owns the
//! flow around [`NodeDeployer`]: build the bundle, diff against the live release, check the host
//! key the connection used, and map failures to the closed `EngineError` set.
//!
//! The pieces that depend on the app (where the project lives, how a pinned connection is opened)
//! come in through [`NodeHost`], so tests run on the in-process remote and the desktop supplies
//! the keychain key and the persistent host-key store. Nothing here talks to a real server on its own.
use super::{
    manifest::{diff, DeployArtifactKind},
    node_app::{valid_domain, NodeDeployer, NodeErrorCode, NodeLaunch, NodeOptions, NodeRemote, PublishRequest},
    node_collect::{detect_node, CollectedNode, NodePlan},
    release::ReleaseLayout,
    transport::SshTransport,
    DeployError,
};
use crate::deploy_guard::{Action, Change, DeployEngine, EngineError, EnginePlan, HostKeyInfo, Outcome, PlanFile};
use crate::deploy_targets::{Target, TargetKind};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::SystemTime;

/// Result of asking the public address after a publish.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PublicCheck {
    /// HTTPS answered with 2xx or 3xx.
    Healthy,
    /// DNS, firewall or the certificate are not ready yet. Caddy keeps retrying on its own.
    NotReachableYet,
    /// The site answered, with an error status.
    Unhealthy(u16),
}

/// What the desktop layer provides to the node engine.
#[allow(async_fn_in_trait)]
pub trait NodeHost: Send + Sync {
    type Remote: NodeRemote;
    /// Build the Node bundle of the target's project (the project root is the host's business).
    fn collect(&self, target: &Target) -> Result<(NodePlan, CollectedNode), EngineError>;
    /// Open an authenticated connection that only succeeds for the pinned host key.
    /// Runs on the engine's runtime, which must also own the connection's tasks.
    async fn connect(&self, target: &Target) -> Result<Self::Remote, EngineError>;
    /// Fingerprint the connection was verified against.
    fn fingerprint(&self, remote: &Self::Remote) -> String;
    /// Blocking request to `https://<domain>/`; called outside the engine's runtime.
    fn public_check(&self, domain: &str) -> PublicCheck;
}

pub struct NodeEngine<H: NodeHost> {
    host: H,
    rt: tokio::runtime::Runtime,
    opts: NodeOptions,
    clock: Box<dyn Fn() -> SystemTime + Send + Sync>,
}

pub fn engine_error(code: NodeErrorCode) -> EngineError {
    match code {
        NodeErrorCode::Transport => EngineError::Connect,
        NodeErrorCode::NodeMissing => EngineError::NodeMissing,
        NodeErrorCode::NodeTooOld => EngineError::NodeTooOld,
        NodeErrorCode::InstallFailed => EngineError::InstallFailed,
        NodeErrorCode::HealthFailed => EngineError::HealthFailed,
        NodeErrorCode::NotPrepared
        | NodeErrorCode::PortUnavailable
        | NodeErrorCode::InvalidInput
        | NodeErrorCode::Env(_) => EngineError::Preflight,
        NodeErrorCode::Integrity | NodeErrorCode::ReleaseExists => EngineError::Upload,
        NodeErrorCode::UnitFailed | NodeErrorCode::CaddyInvalid => EngineError::Switch,
        NodeErrorCode::HealthFailedRolledBack => EngineError::HealthFailedRolledBack,
        NodeErrorCode::HealthFailedRollbackFailed => EngineError::HealthFailedRollbackFailed,
        NodeErrorCode::NoSuchRelease | NodeErrorCode::ReleaseNotReady => EngineError::NoSuchRelease,
    }
}

fn site_of(target: &Target) -> Result<String, EngineError> {
    if target.kind != TargetKind::Node {
        return Err(EngineError::Other);
    }
    Ok(target.id.clone())
}
fn domain_of(target: &Target) -> Result<String, EngineError> {
    target.domain.as_deref().map(str::to_ascii_lowercase).filter(|d| valid_domain(d)).ok_or(EngineError::Preflight)
}
fn launch_of(plan: &NodePlan) -> NodeLaunch {
    NodeLaunch {
        entry: plan.entry.clone(),
        install: plan.install,
        host_var: plan.host_var.into(),
        port_var: plan.port_var.into(),
        wants_origin: plan.wants_origin,
    }
}
fn plan_files(d: &super::manifest::DeployArtifactDiff) -> Vec<PlanFile> {
    let mut v = Vec::new();
    for (list, change) in [(&d.added, Change::Added), (&d.changed, Change::Changed), (&d.removed, Change::Removed), (&d.unchanged, Change::Unchanged)] {
        v.extend(list.iter().map(|f| PlanFile { path: f.path.clone(), size: f.size, sha256: f.sha256.clone(), change }));
    }
    v.sort_by(|a, b| a.path.cmp(&b.path));
    v
}
fn read_bytes(c: &CollectedNode) -> Result<BTreeMap<String, Vec<u8>>, EngineError> {
    let mut out = BTreeMap::new();
    for f in &c.artifact.files {
        out.insert(f.path.clone(), std::fs::read(&f.abs).map_err(|_| EngineError::Preflight)?);
    }
    Ok(out)
}

impl<H: NodeHost> NodeEngine<H> {
    pub fn new(host: H, opts: NodeOptions) -> Result<Self, DeployError> {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_| DeployError::Transport)?;
        Ok(Self { host, rt, opts, clock: Box::new(SystemTime::now) })
    }
    fn admin_remote<'f, T>(&self, target: &Target, f: impl for<'a> FnOnce(NodeDeployer<'a, H::Remote>) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, EngineError>> + 'a>> + 'f) -> Result<T, EngineError> {
        site_of(target)?;
        self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            let d = self.deployer(&mut remote, target)?;
            f(d).await
        })
    }
    pub fn env_keys(&self, target: &Target) -> Result<Vec<String>, EngineError> {
        self.admin_remote(target, |mut d| Box::pin(async move { d.env_keys().await.map_err(|e| engine_error(e.code)) }))
    }
    pub fn env_apply(&self, target: &Target, set: Vec<(String, zeroize::Zeroizing<String>)>, remove: Vec<String>) -> Result<Vec<String>, EngineError> {
        self.admin_remote(target, move |mut d| Box::pin(async move { d.env_apply(set, &remove).await.map_err(|e| engine_error(e.code)) }))
    }
    pub fn log_tail(&self, target: &Target, lines: usize) -> Result<Vec<String>, EngineError> {
        self.admin_remote(target, |mut d| Box::pin(async move { d.log_tail(lines).await.map_err(|e| engine_error(e.code)) }))
    }
    pub fn status(&self, target: &Target) -> Result<super::node_app::NodeStatus, EngineError> {
        self.admin_remote(target, |mut d| Box::pin(async move { d.status().await.map_err(|e| engine_error(e.code)) }))
    }
    /// What the next publish would ship. Local only: no connection is made.
    pub fn artifact_summary(&self, target: &Target) -> Result<super::node_collect::NodeArtifactSummary, EngineError> {
        site_of(target)?;
        Ok(self.host.collect(target)?.1.summary)
    }
    /// Replace the clock that stamps release ids (tests; releases are ordered by it).
    pub fn with_clock(mut self, clock: impl Fn() -> SystemTime + Send + Sync + 'static) -> Self {
        self.clock = Box::new(clock);
        self
    }
    fn deployer<'a>(&self, remote: &'a mut H::Remote, target: &Target) -> Result<NodeDeployer<'a, H::Remote>, EngineError> {
        NodeDeployer::new(remote, &site_of(target)?, self.opts.clone()).map_err(|e| engine_error(e.code))
    }
}

impl<H: NodeHost> DeployEngine for NodeEngine<H> {
    fn plan(&self, target: &Target, action: Action, release_id: Option<&str>) -> Result<EnginePlan, EngineError> {
        let site = site_of(target)?;
        domain_of(target)?;
        let layout = ReleaseLayout::new(&site).map_err(|_| EngineError::Other)?;
        self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            let fingerprint = self.host.fingerprint(&remote);
            let live = layout.current_release(&mut remote).await.map_err(|_| EngineError::Connect)?;
            let live_manifest = match &live {
                Some(id) => Some(layout.read_manifest(&mut remote, id).await.map_err(|_| EngineError::Connect)?),
                None => None,
            };
            match action {
                Action::Publish => {
                    let (_, c) = self.host.collect(target)?;
                    let range = c.artifact.manifest.engines.as_ref().and_then(|e| e.get("node")).cloned();
                    self.deployer(&mut remote, target)?.check_server(range.as_deref()).await.map_err(|e| engine_error(e.code))?;
                    let d = diff(live_manifest.as_ref(), &c.artifact.manifest).map_err(|_| EngineError::Preflight)?;
                    Ok(EnginePlan { fingerprint, build_id: c.artifact.manifest.build_id.clone(), live_release: live, files: plan_files(&d), release_id: None })
                }
                Action::Rollback => {
                    let id = release_id.ok_or(EngineError::NoSuchRelease)?;
                    let ready = layout.release(id).map_err(|_| EngineError::NoSuchRelease)?;
                    if !remote.exists(&ready).await.map_err(|_| EngineError::Connect)? || !remote.exists(&format!("{ready}/.somnia-ready")).await.map_err(|_| EngineError::Connect)? {
                        return Err(EngineError::NoSuchRelease);
                    }
                    let target_manifest = layout.read_manifest(&mut remote, id).await.map_err(|_| EngineError::NoSuchRelease)?;
                    if target_manifest.kind != DeployArtifactKind::Node {
                        return Err(EngineError::NoSuchRelease);
                    }
                    let d = diff(live_manifest.as_ref(), &target_manifest).map_err(|_| EngineError::Preflight)?;
                    Ok(EnginePlan { fingerprint, build_id: target_manifest.build_id, live_release: live, files: plan_files(&d), release_id: Some(id.into()) })
                }
            }
        })
    }

    fn live_release(&self, target: &Target) -> Result<Option<String>, EngineError> {
        let site = site_of(target)?;
        let layout = ReleaseLayout::new(&site).map_err(|_| EngineError::Other)?;
        self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            layout.current_release(&mut remote).await.map_err(|_| EngineError::Connect)
        })
    }

    /// Host-key probing and pinning belong to the live engine; the node hook is never asked.
    fn probe_host_key(&self, _: &Target) -> Result<HostKeyInfo, EngineError> {
        Err(EngineError::Other)
    }

    fn publish(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        let domain = domain_of(target)?;
        let (node_plan, c) = self.host.collect(target)?;
        // The bundle must be the one the human approved.
        if c.artifact.manifest.build_id != plan.build_id {
            return Err(EngineError::Preflight);
        }
        let files = read_bytes(&c)?;
        let req = PublishRequest { manifest: c.artifact.manifest.clone(), files, launch: launch_of(&node_plan), domain: domain.clone(), now: (self.clock)() };
        let outcome = self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            if self.host.fingerprint(&remote) != plan.fingerprint {
                return Err(EngineError::HostKeyRejected);
            }
            self.deployer(&mut remote, target)?.publish(req, progress).await.map_err(|e| engine_error(e.code))
        })?;
        let url = Some(format!("https://{domain}"));
        match self.host.public_check(&domain) {
            PublicCheck::Healthy => progress("public-ok"),
            // The site runs on the server. HTTPS only needs DNS or the certificate to finish.
            PublicCheck::NotReachableYet => progress("public-pending"),
            PublicCheck::Unhealthy(_) => {
                progress("public-failed");
                let Some(previous) = plan.live_release.clone() else { return Err(EngineError::HealthFailed) };
                let back = self.rt.block_on(async {
                    let mut remote = self.host.connect(target).await?;
                    self.deployer(&mut remote, target)?.rollback(&previous, &domain, progress).await.map_err(|e| engine_error(e.code))
                });
                return Err(if back.is_ok() { EngineError::HealthFailedRolledBack } else { EngineError::HealthFailedRollbackFailed });
            }
        }
        Ok(Outcome { release_id: outcome.release_id, url, rolled_back: false })
    }

    fn rollback(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        let domain = domain_of(target)?;
        let id = plan.release_id.as_deref().ok_or(EngineError::NoSuchRelease)?;
        let outcome = self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            if self.host.fingerprint(&remote) != plan.fingerprint {
                return Err(EngineError::HostKeyRejected);
            }
            self.deployer(&mut remote, target)?.rollback(id, &domain, progress).await.map_err(|e| engine_error(e.code))
        })?;
        Ok(Outcome { release_id: outcome.release_id, url: Some(format!("https://{domain}")), rolled_back: true })
    }

    fn releases(&self, target: &Target) -> Result<Vec<String>, EngineError> {
        let site = site_of(target)?;
        let layout = ReleaseLayout::new(&site).map_err(|_| EngineError::Other)?;
        self.rt.block_on(async {
            let mut remote = self.host.connect(target).await?;
            let mut ids = remote.list(&layout.releases()).await.map_err(|_| EngineError::Connect)?;
            ids.retain(|i| !i.ends_with(".partial"));
            let mut ready = Vec::new();
            for id in ids {
                let dir = layout.release(&id).map_err(|_| EngineError::Other)?;
                if remote.exists(&format!("{dir}/.somnia-ready")).await.map_err(|_| EngineError::Connect)? {
                    ready.push(id);
                }
            }
            ready.sort_by(|a, b| b.cmp(a));
            Ok(ready)
        })
    }
}

/// Detect whether a project folder can be published as a Node app, for the wizard's first step.
pub fn project_is_node(project: &std::path::Path) -> bool {
    detect_node(project).is_ok()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::deploy::{
        node_app::tests::Fake,
        node_collect::collect_node,
        ssh::{ExecOutput, SshExec},
    };
    use crate::deploy_targets::key_slot_for;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[derive(Clone)]
    pub(crate) struct Shared(pub(crate) Arc<Mutex<Fake>>);
    impl SshExec for Shared {
        async fn exec(&mut self, c: &str, i: Option<&[u8]>) -> super::super::Result<ExecOutput> {
            let mut f = self.0.lock().unwrap();
            f.exec(c, i).await
        }
    }
    macro_rules! delegate {
        ($($name:ident($($arg:ident: $ty:ty),*) -> $ret:ty;)*) => {$(
            async fn $name(&mut self, $($arg: $ty),*) -> super::super::Result<$ret> { let mut f = self.0.lock().unwrap(); f.$name($($arg),*).await }
        )*};
    }
    impl SshTransport for Shared {
        delegate! {
            mkdir(path: &str) -> ();
            read(path: &str) -> Vec<u8>;
            write(path: &str, bytes: &[u8], mode: u32) -> ();
            hash(path: &str) -> String;
            hard_link(from: &str, to: &str) -> ();
            rename(from: &str, to: &str) -> ();
            symlink(target: &str, path: &str) -> ();
            read_link(path: &str) -> Option<String>;
            exists(path: &str) -> bool;
            list(path: &str) -> Vec<String>;
            remove_tree(path: &str) -> ();
        }
    }
    pub(crate) struct Host {
        pub(crate) project: tempfile::TempDir,
        server: Shared,
        fingerprint: Mutex<String>,
        public: Mutex<PublicCheck>,
        steps: Mutex<Vec<String>>,
    }
    impl NodeHost for Host {
        type Remote = Shared;
        fn collect(&self, _: &Target) -> Result<(NodePlan, CollectedNode), EngineError> {
            let plan = detect_node(self.project.path()).map_err(|_| EngineError::Preflight)?;
            let c = collect_node(self.project.path(), &plan).map_err(|_| EngineError::Preflight)?;
            Ok((plan, c))
        }
        async fn connect(&self, _: &Target) -> Result<Shared, EngineError> {
            Ok(self.server.clone())
        }
        fn fingerprint(&self, _: &Shared) -> String {
            self.fingerprint.lock().unwrap().clone()
        }
        fn public_check(&self, _: &str) -> PublicCheck {
            *self.public.lock().unwrap()
        }
    }
    fn write(root: &std::path::Path, rel: &str, body: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }
    fn project(version: &str) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", r#"{"dependencies":{"next":"15"},"scripts":{"build":"next build"}}"#);
        write(d.path(), "next.config.mjs", "export default { output: 'standalone' }");
        write(d.path(), ".next/standalone/server.js", &format!("// {version}"));
        write(d.path(), ".next/standalone/package.json", "{}");
        write(d.path(), ".next/static/a.js", "static");
        d
    }
    pub(crate) fn target(domain: Option<&str>) -> Target {
        Target { id: "shop".into(), name: "Shop".into(), host: "example.org".into(), port: 22, user: "somnia".into(), domain: domain.map(Into::into), kind: TargetKind::Node, key_slot: key_slot_for("shop"), spa: false, app_port: None }
    }
    pub(crate) fn engine(version: &str) -> NodeEngine<Host> {
        let host = Host { project: project(version), server: Shared(Arc::new(Mutex::new(Fake::new()))), fingerprint: Mutex::new("SHA256:AAAA".into()), public: Mutex::new(PublicCheck::Healthy), steps: Mutex::default() };
        let tick = std::sync::atomic::AtomicU64::new(1_000);
        NodeEngine::new(host, NodeOptions { health_attempts: 2, health_interval: Duration::ZERO, ..Default::default() })
            .unwrap()
            .with_clock(move || std::time::UNIX_EPOCH + Duration::from_secs(tick.fetch_add(60, std::sync::atomic::Ordering::SeqCst)))
    }
    fn noop(_: &str) {}

    #[test]
    fn plan_publish_replan_and_rollback_through_the_engine_trait() {
        let e = engine("v1");
        let t = target(Some("Example.com"));
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        assert!(plan.files.iter().all(|f| f.change == Change::Added) && plan.files.iter().any(|f| f.path == "server.js"));
        assert_eq!((plan.live_release.clone(), plan.fingerprint.as_str()), (None, "SHA256:AAAA"));
        let one = e.publish(&t, &plan, &noop).unwrap();
        assert_eq!(one.url.as_deref(), Some("https://example.com"));
        assert!(!one.rolled_back);
        // Unchanged project: everything unchanged, and the plan is stable apart from the live release.
        let again = e.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(again.live_release.as_deref(), Some(one.release_id.as_str()));
        assert!(again.files.iter().all(|f| f.change == Change::Unchanged));
        write(e.host.project.path(), ".next/standalone/server.js", "// v2");
        let plan2 = e.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(plan2.files.iter().filter(|f| f.change == Change::Changed).count(), 1);
        let two = e.publish(&t, &plan2, &noop).unwrap();
        assert_eq!(e.releases(&t).unwrap(), vec![two.release_id.clone(), one.release_id.clone()]);
        let rp = e.plan(&t, Action::Rollback, Some(&one.release_id)).unwrap();
        assert_eq!(rp.release_id.as_deref(), Some(one.release_id.as_str()));
        let back = e.rollback(&t, &rp, &noop).unwrap();
        assert!(back.rolled_back && back.release_id == one.release_id);
        assert_eq!(e.plan(&t, Action::Rollback, Some("00000000000000000000-zzz")).unwrap_err(), EngineError::NoSuchRelease);
    }

    #[test]
    fn a_changed_host_key_or_bundle_after_approval_is_refused_before_any_upload() {
        let e = engine("v1");
        let t = target(Some("example.com"));
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        *e.host.fingerprint.lock().unwrap() = "SHA256:BBBB".into();
        assert_eq!(e.publish(&t, &plan, &noop).unwrap_err(), EngineError::HostKeyRejected);
        *e.host.fingerprint.lock().unwrap() = "SHA256:AAAA".into();
        write(e.host.project.path(), ".next/standalone/server.js", "// edited after approval");
        assert_eq!(e.publish(&t, &plan, &noop).unwrap_err(), EngineError::Preflight);
        let fake = e.host.server.0.lock().unwrap();
        assert!(fake.t.operations.iter().all(|o| !matches!(*o, "write" | "rename" | "symlink")), "nothing reached the server");
    }

    #[test]
    fn failures_map_to_the_closed_error_set() {
        let e = engine("BROKEN");
        let t = target(Some("example.com"));
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(e.publish(&t, &plan, &noop).unwrap_err(), EngineError::HealthFailed, "first publish failing has nothing to go back to");
        let e = engine("v1");
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        e.publish(&t, &plan, &noop).unwrap();
        write(e.host.project.path(), ".next/standalone/server.js", "// BROKEN");
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(e.publish(&t, &plan, &noop).unwrap_err(), EngineError::HealthFailedRolledBack);
        e.host.server.0.lock().unwrap().node = None;
        assert_eq!(e.plan(&t, Action::Publish, None).unwrap_err(), EngineError::NodeMissing);
        assert_eq!(e.plan(&target(None), Action::Publish, None).unwrap_err(), EngineError::Preflight, "a Node app needs a domain");
        let mut stat = target(Some("example.com"));
        stat.kind = TargetKind::Static;
        assert_eq!(e.plan(&stat, Action::Publish, None).unwrap_err(), EngineError::Other);
        assert!(project_is_node(e.host.project.path()));
    }

    #[test]
    fn public_check_pending_is_not_a_failure_but_a_bad_answer_goes_back() {
        let e = engine("v1");
        let t = target(Some("example.com"));
        let steps = std::cell::RefCell::new(Vec::new());
        let record = |s: &str| steps.borrow_mut().push(s.to_string());
        *e.host.public.lock().unwrap() = PublicCheck::NotReachableYet;
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        let one = e.publish(&t, &plan, &record).unwrap();
        assert!(steps.borrow().contains(&"public-pending".to_string()));
        assert_eq!(e.releases(&t).unwrap(), vec![one.release_id.clone()]);
        write(e.host.project.path(), ".next/standalone/server.js", "// v2");
        *e.host.public.lock().unwrap() = PublicCheck::Unhealthy(502);
        let plan = e.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(e.publish(&t, &plan, &record).unwrap_err(), EngineError::HealthFailedRolledBack);
        assert!(steps.borrow().contains(&"public-failed".to_string()));
        assert_eq!(e.plan(&t, Action::Publish, None).unwrap().live_release, Some(one.release_id.clone()), "the previous version is live again");
        // A first publish whose public answer is bad has nothing to go back to.
        let first = engine("v1");
        *first.host.public.lock().unwrap() = PublicCheck::Unhealthy(500);
        let plan = first.plan(&t, Action::Publish, None).unwrap();
        assert_eq!(first.publish(&t, &plan, &noop).unwrap_err(), EngineError::HealthFailed);
    }
}

/// Lets the live engine and the app-settings commands share one node engine.
impl<T: DeployEngine + ?Sized> DeployEngine for Arc<T> {
    fn plan(&self, t: &Target, a: Action, r: Option<&str>) -> Result<EnginePlan, EngineError> { (**self).plan(t, a, r) }
    fn probe_host_key(&self, t: &Target) -> Result<HostKeyInfo, EngineError> { (**self).probe_host_key(t) }
    fn publish(&self, t: &Target, p: &EnginePlan, g: &dyn Fn(&str)) -> Result<Outcome, EngineError> { (**self).publish(t, p, g) }
    fn rollback(&self, t: &Target, p: &EnginePlan, g: &dyn Fn(&str)) -> Result<Outcome, EngineError> { (**self).rollback(t, p, g) }
    fn live_release(&self, t: &Target) -> Result<Option<String>, EngineError> { (**self).live_release(t) }
    fn cancel(&self, t: &Target) -> bool { (**self).cancel(t) }
    fn releases(&self, t: &Target) -> Result<Vec<String>, EngineError> { (**self).releases(t) }
}
