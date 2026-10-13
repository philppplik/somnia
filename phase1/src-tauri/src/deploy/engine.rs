//! The real deployment engine. Credentials stay in KeyStore, sockets stay in Rust.
//! Every write is reached only through DeployService's one-time approval guard.
use super::{
    artifact::{collect_static, detect_dist},
    bootstrap::CADDY_RELOAD_COMMAND,
    host_keys::{HostKey, HostKeyStore},
    keys::KeyStore,
    manifest::{diff, sha256, DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest},
    release::{release_id, ReleaseLayout},
    ssh::{
        self, ConnectFailure, ConnectOptions, Credential, FailureKind, RusshTransport, SshExec,
        SshTarget,
    },
    transport::SshTransport,
};
use crate::{
    deploy_guard::{
        Action, Change, DeployEngine, EngineError, EnginePlan, HostKeyInfo, Outcome, PlanFile,
    },
    deploy_targets::{Target, TargetKind},
    oauth_store::SecretBackend,
};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};

pub type ProjectSource = Arc<Mutex<Option<PathBuf>>>;
pub type ObservedKeys = Arc<Mutex<BTreeMap<String, HostKey>>>;
#[derive(Clone)]
struct Artifact {
    manifest: DeployArtifactManifest,
    bytes: BTreeMap<String, Vec<u8>>,
}
#[derive(Clone, Copy)]
enum Operation {
    Upload { cancelled: bool },
    Switching,
}
pub struct LiveDeployEngine<B: SecretBackend> {
    pub keys: Arc<KeyStore<B>>,
    pub pins: Arc<HostKeyStore>,
    pub observed: ObservedKeys,
    pub source: ProjectSource,
    pub options: ConnectOptions,
    artifacts: Mutex<BTreeMap<String, Artifact>>,
    active: Mutex<BTreeMap<String, Operation>>,
    /// D6 supplies the separate Node pipeline; absence is an explicit fail-closed result.
    node: Option<Box<dyn DeployEngine>>,
}
impl<B: SecretBackend> LiveDeployEngine<B> {
    pub fn new(
        keys: Arc<KeyStore<B>>,
        pins: Arc<HostKeyStore>,
        observed: ObservedKeys,
        source: ProjectSource,
    ) -> Self {
        Self {
            keys,
            pins,
            observed,
            source,
            options: ConnectOptions::default(),
            artifacts: Default::default(),
            active: Default::default(),
            node: None,
        }
    }
    pub fn with_node_engine(mut self, node: Box<dyn DeployEngine>) -> Self {
        self.node = Some(node);
        self
    }
    fn run<T>(
        &self,
        future: impl std::future::Future<Output = Result<T, EngineError>>,
    ) -> Result<T, EngineError> {
        // All Tauri calls enter on spawn_blocking, never on a Tokio worker.
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| EngineError::Other)?
            .block_on(future)
    }
    async fn connect(&self, target: &Target) -> Result<RusshTransport, EngineError> {
        target.validate().map_err(|_| EngineError::Preflight)?;
        let key = self.keys.load(&target.id).map_err(|_| EngineError::Auth)?;
        RusshTransport::connect(
            &SshTarget::new(&target.host, target.port, &target.user),
            self.pins.clone(),
            Credential::Key(&key),
            self.options.clone(),
            [],
        )
        .await
        .map_err(connect_error)
    }
    fn artifact(&self) -> Result<Artifact, EngineError> {
        let root = self
            .source
            .lock()
            .map_err(|_| EngineError::Other)?
            .clone()
            .ok_or(EngineError::Preflight)?;
        let artifact = if root.join("package.json").exists() {
            let dist = detect_dist(&root).map_err(|_| EngineError::Preflight)?;
            let collected =
                collect_static(&root, &dist.dist).map_err(|_| EngineError::Preflight)?;
            let bytes = collected
                .files
                .iter()
                .map(|f| {
                    Ok((
                        f.path.clone(),
                        read_bounded(&f.abs, fsize(&collected.manifest, &f.path)?)?,
                    ))
                })
                .collect::<Result<BTreeMap<_, _>, EngineError>>()?;
            Artifact {
                manifest: collected.manifest,
                bytes,
            }
        } else {
            collect_plain(&root)?
        };
        artifact
            .manifest
            .verify_bytes(&artifact.bytes)
            .map_err(|_| EngineError::Preflight)?;
        Ok(artifact)
    }
    async fn make_plan(
        &self,
        target: &Target,
        action: Action,
        release: Option<&str>,
    ) -> Result<EnginePlan, EngineError> {
        if target.kind == TargetKind::Node {
            return Err(EngineError::Preflight);
        }
        let mut ssh = self.connect(target).await?;
        let layout = ReleaseLayout::new(&target.id).map_err(|_| EngineError::Preflight)?;
        if !ssh
            .exists(&layout.releases())
            .await
            .map_err(|_| EngineError::Preflight)?
        {
            return Err(EngineError::ServerNotPrepared);
        }
        let live = layout
            .current_release(&mut ssh)
            .await
            .map_err(|_| EngineError::Preflight)?;
        let old = match &live {
            Some(id) => Some(
                layout
                    .read_manifest(&mut ssh, id)
                    .await
                    .map_err(|_| EngineError::Preflight)?,
            ),
            None => None,
        };
        let manifest = match action {
            Action::Publish => {
                let artifact = self.artifact()?;
                let manifest = artifact.manifest.clone();
                let mut cache = self.artifacts.lock().map_err(|_| EngineError::Other)?;
                let incoming = artifact.bytes.values().map(|b| b.len()).sum::<usize>();
                if cache.len() >= 8
                    || cache
                        .values()
                        .map(|a| a.bytes.values().map(|b| b.len()).sum::<usize>())
                        .sum::<usize>()
                        .saturating_add(incoming)
                        > 512 * 1024 * 1024
                {
                    cache.clear();
                }
                cache.insert(target.id.clone(), artifact);
                manifest
            }
            Action::Rollback => layout
                .read_manifest(&mut ssh, release.ok_or(EngineError::NoSuchRelease)?)
                .await
                .map_err(|_| EngineError::NoSuchRelease)?,
        };
        let changes = diff(old.as_ref(), &manifest).map_err(|_| EngineError::Preflight)?;
        let mut files = Vec::new();
        for (kind, list) in [
            (Change::Added, changes.added),
            (Change::Changed, changes.changed),
            (Change::Removed, changes.removed),
            (Change::Unchanged, changes.unchanged),
        ] {
            files.extend(list.into_iter().map(|f| PlanFile {
                path: f.path,
                size: f.size,
                sha256: f.sha256,
                change: kind,
            }));
        }
        files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(EnginePlan {
            fingerprint: ssh.pinned_host_key().fingerprint.clone(),
            build_id: manifest.build_id,
            live_release: live,
            files,
            release_id: release.map(str::to_owned),
        })
    }
    fn check_cancel(&self, id: &str) -> super::Result<()> {
        match self
            .active
            .lock()
            .map_err(|_| super::DeployError::Transport)?
            .get(id)
        {
            Some(Operation::Upload { cancelled: true }) => Err(super::DeployError::Transport),
            _ => Ok(()),
        }
    }
    fn begin_switch(&self, id: &str) -> Result<(), EngineError> {
        let mut active = self.active.lock().map_err(|_| EngineError::Other)?;
        if matches!(active.get(id), Some(Operation::Upload { cancelled: true })) {
            return Err(EngineError::Cancelled);
        }
        active.insert(id.into(), Operation::Switching);
        Ok(())
    }
    async fn preflight(
        &self,
        ssh: &mut RusshTransport,
        target: &Target,
        layout: &ReleaseLayout,
        bytes: u64,
    ) -> Result<(), EngineError> {
        // No user-supplied command fragments: id is validated by Target and ReleaseLayout.
        let root = layout.root();
        if !ssh
            .exists(&layout.releases())
            .await
            .map_err(|_| EngineError::Preflight)?
            || !ssh
                .exists(&format!("{root}/shared"))
                .await
                .map_err(|_| EngineError::Preflight)?
        {
            return Err(EngineError::ServerNotPrepared);
        }
        let checks = if target.kind == TargetKind::UploadOnly {
            ""
        } else {
            " && command -v curl >/dev/null && command -v sha256sum >/dev/null && test -S /run/somnia/caddy-admin.sock"
        };
        let command = format!("test -d '{root}/releases' && test -d '{root}/shared' && test -w '{root}/releases'{checks} && df -Pk '{root}' | tail -n 1 | awk '{{print $4}}'");
        let result = ssh
            .exec(&command, None)
            .await
            .map_err(|_| EngineError::Preflight)?;
        let free = result
            .stdout
            .trim()
            .parse::<u64>()
            .ok()
            .and_then(|n| n.checked_mul(1024));
        if !result.success() || free.is_none_or(|n| n < bytes.saturating_add(1024 * 1024)) {
            return Err(EngineError::Preflight);
        }
        if target.kind != TargetKind::UploadOnly && target.domain.is_none() {
            return Err(EngineError::Preflight);
        }
        Ok(())
    }
    async fn execute(
        &self,
        target: &Target,
        plan: &EnginePlan,
        rollback: bool,
        progress: &dyn Fn(&str),
    ) -> Result<Outcome, EngineError> {
        progress("connect");
        self.check_cancel(&target.id)
            .map_err(|_| EngineError::Cancelled)?;
        let mut ssh = self.connect(target).await?;
        if ssh.pinned_host_key().fingerprint != plan.fingerprint {
            return Err(EngineError::HostKeyRejected);
        }
        let layout = ReleaseLayout::new(&target.id).map_err(|_| EngineError::Preflight)?;
        if layout
            .current_release(&mut ssh)
            .await
            .map_err(|_| EngineError::Preflight)?
            != plan.live_release
        {
            return Err(EngineError::Preflight);
        }
        let artifact = if rollback {
            None
        } else {
            Some(
                self.artifacts
                    .lock()
                    .map_err(|_| EngineError::Other)?
                    .get(&target.id)
                    .cloned()
                    .ok_or(EngineError::Preflight)?,
            )
        };
        if artifact
            .as_ref()
            .is_some_and(|a| a.manifest.build_id != plan.build_id)
        {
            return Err(EngineError::Preflight);
        }
        progress("check");
        let total = artifact
            .as_ref()
            .map_or(0, |a| a.manifest.files.iter().map(|f| f.size).sum());
        self.preflight(&mut ssh, target, &layout, total).await?;
        let id = if rollback {
            plan.release_id.clone().ok_or(EngineError::NoSuchRelease)?
        } else {
            let artifact = artifact.as_ref().unwrap();
            // Fresh UUID suffix avoids same-second collision while retaining chronological order.
            let id = format!(
                "{}-{}",
                release_id(SystemTime::now(), &artifact.manifest)
                    .map_err(|_| EngineError::Other)?,
                &uuid::Uuid::new_v4().simple().to_string()[..8]
            );
            let tick = |n, m| {
                self.check_cancel(&target.id)?;
                progress(&format!("upload:{n}/{m}"));
                Ok(())
            };
            layout
                .cleanup_partials(&mut ssh)
                .await
                .map_err(|_| EngineError::Upload)?;
            if layout
                .stage_progress(&mut ssh, &id, &artifact.manifest, &artifact.bytes, &tick)
                .await
                .is_err()
            {
                self.check_cancel(&target.id)
                    .map_err(|_| EngineError::Cancelled)?;
                return Err(EngineError::Upload);
            }
            id
        };
        let config_path = format!("{}/Caddyfile", layout.root());
        let old_config = if target.kind == TargetKind::UploadOnly {
            None
        } else if ssh
            .exists(&config_path)
            .await
            .map_err(|_| EngineError::Preflight)?
        {
            Some(
                ssh.read(&config_path)
                    .await
                    .map_err(|_| EngineError::Preflight)?,
            )
        } else {
            None
        };
        self.begin_switch(&target.id)?;
        progress("switch");
        let previous = layout
            .activate(&mut ssh, &id)
            .await
            .map_err(|_| EngineError::Switch)?;
        // From the switch onwards every failure restores the old link and config.
        let attempt = async {
            if target.kind != TargetKind::UploadOnly {
                let config = caddy_config(target, &layout)?;
                let pending = format!("{}/Caddyfile.new", layout.root());
                ssh.write(&pending, config.as_bytes(), 0o644)
                    .await
                    .map_err(|_| EngineError::Switch)?;
                ssh.rename(&pending, &config_path)
                    .await
                    .map_err(|_| EngineError::Switch)?;
                if !ssh
                    .exec(CADDY_RELOAD_COMMAND, None)
                    .await
                    .map_err(|_| EngineError::Switch)?
                    .success()
                {
                    return Err(EngineError::Switch);
                }
            }
            progress("health");
            self.health(&mut ssh, target, &layout, &id).await
        }
        .await;
        if attempt.is_err() {
            let restore = async {
                match &previous {
                    Some(old) => {
                        layout.activate(&mut ssh, old).await?;
                    }
                    None => ssh.remove_tree(&layout.current()).await?,
                }
                if target.kind != TargetKind::UploadOnly {
                    match old_config {
                        Some(bytes) => {
                            let tmp = format!("{}/Caddyfile.restore", layout.root());
                            ssh.write(&tmp, &bytes, 0o644).await?;
                            ssh.rename(&tmp, &config_path).await?;
                        }
                        None => {
                            if ssh.exists(&config_path).await? {
                                ssh.remove_tree(&config_path).await?;
                            }
                        }
                    }
                    if !ssh.exec(CADDY_RELOAD_COMMAND, None).await?.success() {
                        return Err(super::DeployError::Transport);
                    }
                }
                Ok::<_, super::DeployError>(())
            }
            .await;
            return Err(if restore.is_ok() {
                EngineError::HealthFailedRolledBack
            } else {
                EngineError::HealthFailedRollbackFailed
            });
        }
        // Retention is best effort after success; it cannot turn a healthy publish into a failure.
        let _ = layout.prune(&mut ssh, 5).await;
        Ok(Outcome {
            release_id: id,
            url: if target.kind == TargetKind::UploadOnly {
                None
            } else {
                target
                    .domain
                    .as_ref()
                    .map(|d| format!("https://{}", d.to_ascii_lowercase()))
            },
            rolled_back: rollback,
        })
    }
    async fn health(
        &self,
        ssh: &mut RusshTransport,
        target: &Target,
        layout: &ReleaseLayout,
        id: &str,
    ) -> Result<(), EngineError> {
        let manifest = layout
            .read_manifest(ssh, id)
            .await
            .map_err(|_| EngineError::Switch)?;
        for file in &manifest.files {
            if ssh
                .hash(&format!(
                    "{}/{}",
                    layout.release(id).map_err(|_| EngineError::Switch)?,
                    file.path
                ))
                .await
                .map_err(|_| EngineError::Switch)?
                != file.sha256
            {
                return Err(EngineError::Switch);
            }
        }
        if target.kind == TargetKind::UploadOnly {
            return Ok(());
        }
        let domain = target.domain.as_deref().ok_or(EngineError::Preflight)?;
        // TLS stays verified; never -k, never a real-host test. Return only status/hash markers.
        let command = format!("set -eu; f=$(mktemp); trap 'rm -f \"$f\"' EXIT; code=$(curl --silent --show-error --location --max-redirs 3 --max-time 20 --proto '=https' --proto-redir '=https' --output \"$f\" --write-out '%{{http_code}}' 'https://{domain}/'); case \"$code\" in 2??|3??) ;; *) exit 1;; esac; sha256sum \"$f\" | cut -d ' ' -f 1");
        let result = ssh
            .exec(&command, None)
            .await
            .map_err(|_| EngineError::Switch)?;
        let index = manifest
            .files
            .iter()
            .find(|f| f.path == "index.html")
            .ok_or(EngineError::Preflight)?;
        if !result.success() || result.stdout.trim() != index.sha256 {
            return Err(EngineError::Switch);
        }
        Ok(())
    }
    fn with_operation(
        &self,
        target: &Target,
        f: impl FnOnce() -> Result<Outcome, EngineError>,
    ) -> Result<Outcome, EngineError> {
        {
            let mut active = self.active.lock().map_err(|_| EngineError::Other)?;
            if active.contains_key(&target.id) {
                return Err(EngineError::Other);
            }
            active.insert(target.id.clone(), Operation::Upload { cancelled: false });
        }
        let result = f();
        if let Ok(mut active) = self.active.lock() {
            active.remove(&target.id);
        }
        result
    }
}
fn connect_error(error: ConnectFailure) -> EngineError {
    match error.kind {
        FailureKind::HostKeyChanged | FailureKind::HostKeyUntrusted => EngineError::HostKeyRejected,
        FailureKind::AuthRejected => EngineError::Auth,
        _ => EngineError::Connect,
    }
}
fn caddy_config(target: &Target, layout: &ReleaseLayout) -> Result<String, EngineError> {
    target.validate().map_err(|_| EngineError::Preflight)?;
    let domain = target
        .domain
        .as_deref()
        .ok_or(EngineError::Preflight)?
        .to_ascii_lowercase();
    let spa = if target.spa {
        "    try_files {path} /index.html\n"
    } else {
        ""
    };
    Ok(format!("{domain} {{\n    root * {}\n    encode zstd gzip\n{spa}    file_server\n    header {{\n        Strict-Transport-Security \"max-age=31536000\"\n        X-Content-Type-Options nosniff\n    }}\n}}\n", layout.current()))
}
fn fsize(manifest: &DeployArtifactManifest, path: &str) -> Result<u64, EngineError> {
    manifest
        .files
        .iter()
        .find(|f| f.path == path)
        .map(|f| f.size)
        .ok_or(EngineError::Preflight)
}
fn read_bounded(path: &Path, size: u64) -> Result<Vec<u8>, EngineError> {
    use std::io::Read;
    let metadata = std::fs::symlink_metadata(path).map_err(|_| EngineError::Preflight)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || size > super::artifact::MAX_TOTAL_BYTES
    {
        return Err(EngineError::Preflight);
    }
    let file = std::fs::File::open(path).map_err(|_| EngineError::Preflight)?;
    let mut bytes = Vec::new();
    file.take(size.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| EngineError::Preflight)?;
    if bytes.len() as u64 != size {
        return Err(EngineError::Preflight);
    }
    Ok(bytes)
}
fn collect_plain(root: &Path) -> Result<Artifact, EngineError> {
    let root = root.canonicalize().map_err(|_| EngineError::Preflight)?;
    let mut bytes = BTreeMap::new();
    let mut total = 0u64;
    // Respect the project's ignore files even outside a Git repository. Never read global ignores.
    let mut builder = ignore::WalkBuilder::new(&root);
    builder
        .hidden(false)
        .follow_links(false)
        .max_depth(Some(64))
        .git_global(false)
        .parents(false)
        .require_git(false);
    for entry in builder.build() {
        let entry = entry.map_err(|_| EngineError::Preflight)?;
        if entry.depth() == 0 {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| EngineError::Preflight)?;
        let path = rel
            .to_str()
            .ok_or(EngineError::Preflight)?
            .replace('\\', "/");
        if super::manifest::validate_path(&path, DeployArtifactKind::Static).is_err()
            || path.split('/').any(|s| {
                matches!(
                    s,
                    "target"
                        | "dist"
                        | ".somnia"
                        | "somnia.template.json"
                        | ".gitignore"
                        | ".ignore"
                )
            })
        {
            continue;
        }
        let metadata =
            std::fs::symlink_metadata(entry.path()).map_err(|_| EngineError::Preflight)?;
        if metadata.file_type().is_symlink() {
            return Err(EngineError::Preflight);
        }
        if metadata.is_dir() {
            continue;
        }
        if !metadata.is_file() {
            return Err(EngineError::Preflight);
        }
        total = total
            .checked_add(metadata.len())
            .ok_or(EngineError::Preflight)?;
        if total > super::artifact::MAX_TOTAL_BYTES || bytes.len() >= super::artifact::MAX_FILES {
            return Err(EngineError::Preflight);
        }
        bytes.insert(path, read_bounded(entry.path(), metadata.len())?);
    }
    if !bytes.contains_key("index.html") {
        return Err(EngineError::Preflight);
    }
    let files: Vec<_> = bytes
        .iter()
        .map(|(path, b)| DeployArtifactFile {
            path: path.clone(),
            sha256: sha256(b),
            size: b.len() as u64,
            mode: 0o644,
        })
        .collect();
    let manifest = DeployArtifactManifest {
        build_id: super::artifact::build_id(&files),
        kind: DeployArtifactKind::Static,
        files,
        entry: None,
        engines: None,
        port: None,
    };
    Ok(Artifact { manifest, bytes })
}
impl<B: SecretBackend> DeployEngine for LiveDeployEngine<B> {
    fn plan(
        &self,
        target: &Target,
        action: Action,
        release: Option<&str>,
    ) -> Result<EnginePlan, EngineError> {
        if target.kind == TargetKind::Node {
            return self
                .node
                .as_ref()
                .ok_or(EngineError::Preflight)?
                .plan(target, action, release);
        }
        self.run(self.make_plan(target, action, release))
    }
    fn probe_host_key(&self, target: &Target) -> Result<HostKeyInfo, EngineError> {
        self.run(async {
            let key = ssh::probe_host_key(
                &SshTarget::new(&target.host, target.port, &target.user),
                &self.options,
            )
            .await
            .map_err(connect_error)?;
            self.observed
                .lock()
                .map_err(|_| EngineError::Other)?
                .insert(
                    format!("{}:{}", target.host.to_ascii_lowercase(), target.port),
                    key.clone(),
                );
            Ok(HostKeyInfo {
                algorithm: key.algorithm,
                fingerprint: key.fingerprint,
            })
        })
    }
    fn publish(
        &self,
        t: &Target,
        p: &EnginePlan,
        progress: &dyn Fn(&str),
    ) -> Result<Outcome, EngineError> {
        if t.kind == TargetKind::Node {
            return self
                .node
                .as_ref()
                .ok_or(EngineError::Preflight)?
                .publish(t, p, progress);
        }
        self.with_operation(t, || self.run(self.execute(t, p, false, progress)))
    }
    fn rollback(
        &self,
        t: &Target,
        p: &EnginePlan,
        progress: &dyn Fn(&str),
    ) -> Result<Outcome, EngineError> {
        if t.kind == TargetKind::Node {
            return self
                .node
                .as_ref()
                .ok_or(EngineError::Preflight)?
                .rollback(t, p, progress);
        }
        self.with_operation(t, || self.run(self.execute(t, p, true, progress)))
    }
    fn live_release(&self, t: &Target) -> Result<Option<String>, EngineError> {
        if t.kind == TargetKind::Node {
            return self
                .node
                .as_ref()
                .ok_or(EngineError::Preflight)?
                .live_release(t);
        }
        self.run(async {
            let mut ssh = self.connect(t).await?;
            ReleaseLayout::new(&t.id)
                .map_err(|_| EngineError::Preflight)?
                .current_release(&mut ssh)
                .await
                .map_err(|_| EngineError::Preflight)
        })
    }
    fn releases(&self, t: &Target) -> Result<Vec<String>, EngineError> {
        if t.kind == TargetKind::Node {
            return self
                .node
                .as_ref()
                .ok_or(EngineError::Preflight)?
                .releases(t);
        }
        self.run(async {
            let mut ssh = self.connect(t).await?;
            let layout = ReleaseLayout::new(&t.id).map_err(|_| EngineError::Preflight)?;
            let mut ids = ssh
                .list(&layout.releases())
                .await
                .map_err(|_| EngineError::Preflight)?;
            ids.retain(|id| super::manifest::valid_id(id));
            ids.sort();
            ids.reverse();
            let mut kept = Vec::new();
            for id in ids {
                if layout.read_manifest(&mut ssh, &id).await.is_ok() {
                    kept.push(id);
                }
            }
            Ok(kept)
        })
    }
    fn cancel(&self, t: &Target) -> bool {
        if t.kind == TargetKind::Node {
            return self.node.as_ref().is_some_and(|n| n.cancel(t));
        }
        if let Ok(mut active) = self.active.lock() {
            if let Some(Operation::Upload { cancelled }) = active.get_mut(&t.id) {
                *cancelled = true;
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        deploy::ssh_testkit::TestServer,
        deploy_guard::{DeployError, DeployService},
        deploy_runtime::{RuntimeKeys, RuntimePins},
        deploy_targets::{key_slot_for, MemoryTargets},
        oauth_store::MemoryBackend,
    };
    struct Fixture {
        server: TestServer,
        service: Arc<DeployService>,
        engine: Arc<LiveDeployEngine<MemoryBackend>>,
        project: tempfile::TempDir,
    }
    struct SharedEngine(Arc<LiveDeployEngine<MemoryBackend>>);
    impl DeployEngine for SharedEngine {
        fn plan(&self, t: &Target, a: Action, r: Option<&str>) -> Result<EnginePlan, EngineError> {
            self.0.plan(t, a, r)
        }
        fn probe_host_key(&self, t: &Target) -> Result<HostKeyInfo, EngineError> {
            self.0.probe_host_key(t)
        }
        fn publish(
            &self,
            t: &Target,
            p: &EnginePlan,
            g: &dyn Fn(&str),
        ) -> Result<Outcome, EngineError> {
            self.0.publish(t, p, g)
        }
        fn rollback(
            &self,
            t: &Target,
            p: &EnginePlan,
            g: &dyn Fn(&str),
        ) -> Result<Outcome, EngineError> {
            self.0.rollback(t, p, g)
        }
        fn releases(&self, t: &Target) -> Result<Vec<String>, EngineError> {
            self.0.releases(t)
        }
        fn live_release(&self, t: &Target) -> Result<Option<String>, EngineError> {
            self.0.live_release(t)
        }
        fn cancel(&self, t: &Target) -> bool {
            self.0.cancel(t)
        }
    }
    async fn fixture() -> Fixture {
        let server = TestServer::start().await;
        assert!(
            server.addr.ip().is_loopback(),
            "test must never reach a real host"
        );
        std::fs::create_dir_all(server.path("/srv/somnia/site/releases")).unwrap();
        std::fs::create_dir_all(server.path("/srv/somnia/site/shared")).unwrap();
        let project = tempfile::tempdir().unwrap();
        std::fs::write(project.path().join("index.html"), b"old page").unwrap();
        let keys = Arc::new(KeyStore::new(MemoryBackend::default()));
        let pins = Arc::new(HostKeyStore::default());
        let observed = ObservedKeys::default();
        let source = Arc::new(Mutex::new(Some(project.path().to_path_buf())));
        let engine = Arc::new(LiveDeployEngine::new(
            keys.clone(),
            pins.clone(),
            observed.clone(),
            source,
        ));
        let service = Arc::new(DeployService::new(
            Box::new(MemoryTargets::default()),
            Box::new(RuntimePins {
                store: pins,
                observed,
            }),
            Box::new(RuntimeKeys(keys.clone())),
            Box::new(SharedEngine(engine.clone())),
        ));
        service
            .target_save(Target {
                id: "site".into(),
                name: "Site".into(),
                host: "127.0.0.1".into(),
                port: server.addr.port(),
                user: "somnia".into(),
                domain: Some("example.test".into()),
                kind: TargetKind::Static,
                key_slot: key_slot_for("site"),
                spa: true,
                app_port: None,
            })
            .unwrap();
        service.key_create("site").unwrap();
        server.authorize(keys.load("site").unwrap().private_key().public_key());
        let svc = service.clone();
        let fp = server.host_fingerprint();
        tokio::task::spawn_blocking(move || svc.hostkey_trust("site", &fp))
            .await
            .unwrap()
            .unwrap();
        let jail = server.state.jail.clone();
        server.set_exec(move |cmd, _| {
            if cmd.contains("df -Pk") {
                return (0, "1048576\n".into(), String::new());
            }
            if cmd.starts_with("set -eu; f=$(mktemp)") {
                let path = jail.join("srv/somnia/site/current/index.html");
                return (
                    0,
                    sha256(&std::fs::read(path).unwrap_or_default()),
                    String::new(),
                );
            }
            if cmd == CADDY_RELOAD_COMMAND {
                return (0, String::new(), String::new());
            }
            (1, String::new(), String::new())
        });
        Fixture {
            server,
            service,
            engine,
            project,
        }
    }
    async fn publish(f: &Fixture) -> Outcome {
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            svc.publish("site", &p.plan_hash, &token, 2, &|_| {})
                .unwrap()
        })
        .await
        .unwrap()
    }
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn real_ssh_publish_diff_progress_live_readout_and_rollback() {
        let f = fixture().await;
        let svc = f.service.clone();
        let (first, progress) = tokio::task::spawn_blocking(move || {
            let plan = svc.plan("site").unwrap();
            assert!(plan.live_release.is_none());
            assert_eq!(plan.files[0].change, Change::Added);
            let token = svc.confirm_issue(&plan.plan_hash, 1).unwrap();
            let progress = Mutex::new(Vec::new());
            let out = svc
                .publish("site", &plan.plan_hash, &token, 2, &|s| {
                    progress.lock().unwrap().push(s.to_string())
                })
                .unwrap();
            (out, progress.into_inner().unwrap())
        })
        .await
        .unwrap();
        assert_eq!(
            progress,
            [
                "connect",
                "check",
                "upload:0/1",
                "upload:1/1",
                "switch",
                "health"
            ]
        );
        assert!(
            std::fs::read_to_string(f.server.path("/srv/somnia/site/Caddyfile"))
                .unwrap()
                .contains("try_files {path} /index.html")
        );
        std::fs::write(f.project.path().join("index.html"), b"new page").unwrap();
        std::fs::write(f.project.path().join("added.css"), b"body{}").unwrap();
        let second = publish(&f).await;
        assert_ne!(first.release_id, second.release_id);
        let svc = f.service.clone();
        let old = first.release_id.clone();
        let new = second.release_id.clone();
        tokio::task::spawn_blocking(move || {
            assert_eq!(svc.live_release("site").unwrap(), Some(new));
            assert_eq!(svc.releases("site").unwrap().len(), 2);
            let p = svc.plan_rollback("site", &old).unwrap();
            assert!(p
                .files
                .iter()
                .any(|f| f.path == "added.css" && f.change == Change::Removed));
            let token = svc.confirm_issue(&p.plan_hash, 3).unwrap();
            let result = svc
                .rollback("site", &old, &p.plan_hash, &token, 4, &|_| {})
                .unwrap();
            assert!(result.rolled_back);
            assert_eq!(svc.live_release("site").unwrap(), Some(old));
        })
        .await
        .unwrap();
        assert_eq!(
            std::fs::read(f.server.path("/srv/somnia/site/current/index.html")).unwrap(),
            b"old page"
        );
        assert!(!f
            .server
            .state
            .commands
            .lock()
            .unwrap()
            .iter()
            .any(|s| s.contains("sudo") || s.contains("apt-get")));
    }
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn health_failure_restores_previous_release_and_config() {
        let f = fixture().await;
        let first = publish(&f).await;
        let old_config = std::fs::read(f.server.path("/srv/somnia/site/Caddyfile")).unwrap();
        std::fs::write(f.project.path().join("index.html"), b"bad page").unwrap();
        f.server.set_exec(|cmd, _| {
            if cmd.contains("df -Pk") {
                (0, "1048576".into(), String::new())
            } else if cmd == CADDY_RELOAD_COMMAND {
                (0, String::new(), String::new())
            } else {
                (1, String::new(), "SEEDED-SECRET-MUST-NOT-ESCAPE".into())
            }
        });
        let svc = f.service.clone();
        let error = tokio::task::spawn_blocking(move || {
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            svc.publish("site", &p.plan_hash, &token, 2, &|_| {})
                .unwrap_err()
        })
        .await
        .unwrap();
        assert_eq!(
            error,
            DeployError::Engine(EngineError::HealthFailedRolledBack)
        );
        assert!(!error.to_string().contains("SEEDED"));
        let svc = f.service.clone();
        assert_eq!(
            tokio::task::spawn_blocking(move || svc.live_release("site"))
                .await
                .unwrap()
                .unwrap(),
            Some(first.release_id)
        );
        assert_eq!(
            std::fs::read(f.server.path("/srv/somnia/site/Caddyfile")).unwrap(),
            old_config
        );
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn approval_rejects_modified_artifact_and_target() {
        let f = fixture().await;
        let svc = f.service.clone();
        let plan = tokio::task::spawn_blocking(move || svc.plan("site"))
            .await
            .unwrap()
            .unwrap();
        std::fs::write(
            f.project.path().join("index.html"),
            b"changed after approval",
        )
        .unwrap();
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            let token = svc.confirm_issue(&plan.plan_hash, 1).unwrap();
            assert_eq!(
                svc.publish("site", &plan.plan_hash, &token, 2, &|_| {})
                    .unwrap_err(),
                DeployError::PlanChanged
            );
        })
        .await
        .unwrap();
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            let plan = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&plan.plan_hash, 1).unwrap();
            let mut target = svc.targets_list().unwrap()[0].target.clone();
            target.spa = false;
            svc.target_save(target).unwrap();
            assert_eq!(
                svc.publish("site", &plan.plan_hash, &token, 2, &|_| {})
                    .unwrap_err(),
                DeployError::PlanChanged
            );
        })
        .await
        .unwrap();
        assert!(!f.server.path("/srv/somnia/site/current").exists());
    }
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancellation_is_allowed_during_upload_not_after_switch() {
        let f = fixture().await;
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            assert!(!svc.cancel("site").unwrap());
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            let err = svc
                .publish("site", &p.plan_hash, &token, 2, &|step| {
                    if step == "upload:0/1" {
                        assert!(svc.cancel("site").unwrap());
                    }
                })
                .unwrap_err();
            assert_eq!(err, DeployError::Engine(EngineError::Cancelled));
            assert!(!svc.cancel("site").unwrap());
        })
        .await
        .unwrap();
        assert!(!f.server.path("/srv/somnia/site/current").exists());
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            svc.publish("site", &p.plan_hash, &token, 2, &|s| {
                if s == "switch" || s == "health" {
                    assert!(!svc.cancel("site").unwrap());
                }
            })
            .unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn changed_host_key_stops_before_credentials_and_writes() {
        let f = fixture().await;
        let other = TestServer::start().await;
        let mut target = f.service.targets_list().unwrap()[0].target.clone();
        target.port = other.addr.port();
        let pins = f.engine.pins.clone();
        pins.trust_new(
            &target.host,
            target.port,
            &HostKey::from_public_key(f.server.host_key.public_key()),
        )
        .unwrap();
        let engine = f.engine.clone();
        let error =
            tokio::task::spawn_blocking(move || engine.plan(&target, Action::Publish, None))
                .await
                .unwrap()
                .unwrap_err();
        assert_eq!(error, EngineError::HostKeyRejected);
        assert_eq!(
            other
                .state
                .auth_attempts
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
        assert_eq!(
            other
                .state
                .sftp_ops
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }
    #[test]
    fn plain_site_respects_ignore_and_excludes_secrets() {
        let dir = tempfile::tempdir().unwrap();
        for (name, value) in [
            ("index.html", "safe"),
            (".env", "SECRET"),
            ("secret.pem", "SECRET"),
            ("ignored.txt", "do not upload"),
            (".gitignore", "ignored.txt\n"),
        ] {
            std::fs::write(dir.path().join(name), value).unwrap();
        }
        let artifact = collect_plain(dir.path()).unwrap();
        assert_eq!(
            artifact.bytes.keys().cloned().collect::<Vec<_>>(),
            ["index.html"]
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("index.html", dir.path().join("link.html")).unwrap();
            assert!(collect_plain(dir.path()).is_err());
        }
    }
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn first_publish_health_failure_leaves_no_live_site() {
        let f = fixture().await;
        f.server.set_exec(|cmd, _| {
            if cmd.contains("df -Pk") {
                (0, "1048576".into(), String::new())
            } else if cmd == CADDY_RELOAD_COMMAND {
                (0, String::new(), String::new())
            } else {
                (1, String::new(), String::new())
            }
        });
        let svc = f.service.clone();
        let error = tokio::task::spawn_blocking(move || {
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            svc.publish("site", &p.plan_hash, &token, 2, &|_| {})
                .unwrap_err()
        })
        .await
        .unwrap();
        assert_eq!(
            error,
            DeployError::Engine(EngineError::HealthFailedRolledBack)
        );
        assert!(std::fs::symlink_metadata(f.server.path("/srv/somnia/site/current")).is_err());
        assert!(!f.server.path("/srv/somnia/site/Caddyfile").exists());
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn disk_shortage_and_missing_layout_do_not_write() {
        let f = fixture().await;
        f.server.set_exec(|_, _| (0, "0".into(), String::new()));
        let svc = f.service.clone();
        tokio::task::spawn_blocking(move || {
            let p = svc.plan("site").unwrap();
            let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
            assert_eq!(
                svc.publish("site", &p.plan_hash, &token, 2, &|_| {})
                    .unwrap_err(),
                DeployError::Engine(EngineError::Preflight)
            );
        })
        .await
        .unwrap();
        assert_eq!(
            std::fs::read_dir(f.server.path("/srv/somnia/site/releases"))
                .unwrap()
                .count(),
            0
        );
        std::fs::remove_dir(f.server.path("/srv/somnia/site/releases")).unwrap();
        let svc = f.service.clone();
        assert_eq!(
            tokio::task::spawn_blocking(move || svc.plan("site"))
                .await
                .unwrap()
                .unwrap_err(),
            DeployError::Engine(EngineError::ServerNotPrepared)
        );
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn rejected_auth_is_secret_free_and_has_no_sftp_operations() {
        let f = fixture().await;
        f.server.state.authorized.lock().unwrap().clear();
        let svc = f.service.clone();
        let error = tokio::task::spawn_blocking(move || svc.plan("site"))
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(error, DeployError::Engine(EngineError::Auth));
        assert_eq!(
            f.server
                .state
                .sftp_ops
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn rollback_failure_is_distinguished_from_successful_recovery() {
        let f = fixture().await;
        publish(&f).await;
        std::fs::write(f.project.path().join("index.html"), b"bad").unwrap();
        let reloads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        f.server.set_exec(move |cmd, _| {
            if cmd.contains("df -Pk") {
                return (0, "1048576".into(), String::new());
            }
            if cmd == CADDY_RELOAD_COMMAND
                && reloads.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0
            {
                return (0, String::new(), String::new());
            }
            (1, String::new(), String::new())
        });
        let svc = f.service.clone();
        assert_eq!(
            tokio::task::spawn_blocking(move || {
                let p = svc.plan("site").unwrap();
                let token = svc.confirm_issue(&p.plan_hash, 1).unwrap();
                svc.publish("site", &p.plan_hash, &token, 2, &|_| {})
                    .unwrap_err()
            })
            .await
            .unwrap(),
            DeployError::Engine(EngineError::HealthFailedRollbackFailed)
        );
    }
}
