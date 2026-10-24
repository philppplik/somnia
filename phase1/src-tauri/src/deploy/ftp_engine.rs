//! FTP/FTPS deploy engine for shared hosting: static sites only, behind the same [`DeployEngine`] seam as SSH.
//!
//! What FTP can and cannot do, stated plainly:
//! - There are no symlinks or hard links, so there is no single atomic "switch" like the SSH `current` link.
//!   Instead: every changed file is first uploaded under a temporary name next to its final place (nothing visible
//!   changes), then a short burst of renames puts the files in place, HTML last. The previous version of every
//!   replaced or removed file is renamed (not copied) into `.somnia-deploy/backup/<release>/`.
//! - One level of rollback: the last publish can be undone from those backups. Older releases are not kept.
//! - `.somnia-deploy/state.json` on the server records the SHA-256 of what Somnia published. Only files listed
//!   there are ever removed. Files Somnia does not know are never deleted.
//! - Credentials: the password is read from the keychain at connect time, after the TLS handshake and the
//!   certificate check. Plain FTP exists only with the target's explicit opt-in.
use super::{
    engine::{collect_artifact, Artifact, ObservedKeys, ProjectSource},
    ftp::{ca_fingerprint, leaf_digest, leaf_fingerprint, plain_fingerprint, Ftp, FtpError, FtpOptions, Verify},
    host_keys::{HostKey, HostKeyStore},
    keys::KeyStore,
    manifest::{diff, validate_path, DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest},
    release::release_id,
};
use crate::{
    deploy_guard::{Action, Change, DeployEngine, EngineError, EnginePlan, HostKeyInfo, Outcome, PlanFile, RemoteEntry, RemoteKind},
    deploy_targets::{FtpSecurity, FtpSettings, FtpVerify, Target, TargetKind},
    oauth_store::SecretBackend,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::SystemTime,
};

const META: &str = ".somnia-deploy";
const TMP_SUFFIX: &str = ".somnia-tmp";
const INITIAL: &str = "initial";
const DENY_ALL: &str = "# Written by Somnia. Keeps the deploy state and backups out of the public site (Apache).\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Live {
    release_id: String,
    build_id: String,
    files: Vec<DeployArtifactFile>,
    /// Paths whose previous content now sits in the backup folder of this release.
    backed_up: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Previous {
    release_id: String,
    build_id: String,
    files: Vec<DeployArtifactFile>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    version: u32,
    live: Option<Live>,
    previous: Option<Previous>,
}
fn manifest_of(build_id: &str, files: &[DeployArtifactFile]) -> DeployArtifactManifest {
    DeployArtifactManifest { kind: DeployArtifactKind::Static, files: files.to_vec(), entry: None, engines: None, port: None, build_id: build_id.to_string() }
}
impl State {
    fn validate(&self) -> Result<(), EngineError> {
        if self.version != 1 {
            return Err(EngineError::Preflight);
        }
        let ok_id = |s: &str| super::manifest::valid_id(s);
        if let Some(l) = &self.live {
            if !ok_id(&l.release_id) || !ok_id(&l.build_id) || l.backed_up.iter().any(|p| validate_path(p, DeployArtifactKind::Static).is_err()) {
                return Err(EngineError::Preflight);
            }
            manifest_of(&l.build_id, &l.files).validate().map_err(|_| EngineError::Preflight)?;
        }
        if let Some(p) = &self.previous {
            if !ok_id(&p.release_id) || !ok_id(&p.build_id) {
                return Err(EngineError::Preflight);
            }
            // The pre-Somnia state ("initial") has no files; diffing validates every non-empty manifest anyway.
            if !p.files.is_empty() {
                manifest_of(&p.build_id, &p.files).validate().map_err(|_| EngineError::Preflight)?;
            }
        }
        Ok(())
    }
}

fn join(root: &str, rel: &str) -> String {
    let root = root.trim_end_matches('/');
    let rel = rel.trim_start_matches('/');
    if rel.is_empty() { if root.is_empty() { "/".into() } else { root.to_string() } } else { format!("{root}/{rel}") }
}
fn parent(path: &str) -> &str {
    path.rsplit_once('/').map(|(p, _)| p).unwrap_or("")
}
fn is_html(path: &str) -> bool {
    let l = path.to_ascii_lowercase();
    l.ends_with(".html") || l.ends_with(".htm")
}
fn tmp_of(path: &str) -> String {
    format!("{path}{TMP_SUFFIX}")
}
fn pin_key(host: &str, port: u16) -> String {
    format!("{}:{port}", host.to_ascii_lowercase())
}
fn check_artifact_paths(artifact: &Artifact) -> Result<(), EngineError> {
    if artifact.manifest.kind != DeployArtifactKind::Static {
        return Err(EngineError::Preflight);
    }
    for f in &artifact.manifest.files {
        let first = f.path.split('/').next().unwrap_or("");
        if first == META || f.path.split('/').any(|s| s.ends_with(TMP_SUFFIX)) {
            return Err(EngineError::Preflight);
        }
    }
    Ok(())
}

struct Session {
    ftp: Ftp,
    fingerprint: String,
    root: String,
}
impl Session {
    fn path(&self, rel: &str) -> String {
        join(&self.root, rel)
    }
    fn meta(&self, rel: &str) -> String {
        join(&join(&self.root, META), rel)
    }
}

pub struct FtpEngine<B: SecretBackend> {
    pub keys: Arc<KeyStore<B>>,
    pub pins: Arc<HostKeyStore>,
    pub observed: ObservedKeys,
    pub source: ProjectSource,
    pub options: FtpOptions,
    artifacts: Mutex<BTreeMap<String, Artifact>>,
    active: Mutex<BTreeMap<String, Arc<AtomicBool>>>,
}

impl<B: SecretBackend> FtpEngine<B> {
    pub fn new(keys: Arc<KeyStore<B>>, pins: Arc<HostKeyStore>, observed: ObservedKeys, source: ProjectSource) -> Self {
        Self { keys, pins, observed, source, options: FtpOptions::default(), artifacts: Default::default(), active: Default::default() }
    }
    fn run<T>(&self, future: impl std::future::Future<Output = Result<T, EngineError>>) -> Result<T, EngineError> {
        // Tauri calls enter on spawn_blocking, never on a Tokio worker.
        tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|_| EngineError::Other)?.block_on(future)
    }
    fn settings(target: &Target) -> Result<&FtpSettings, EngineError> {
        target.validate().map_err(|_| EngineError::Preflight)?;
        if target.kind != TargetKind::Ftp {
            return Err(EngineError::Preflight);
        }
        target.ftp.as_ref().ok_or(EngineError::Preflight)
    }

    /// Connects, checks the server identity, and optionally logs in. The password is read only after the handshake.
    async fn open(&self, target: &Target, login: bool) -> Result<Session, EngineError> {
        let s = Self::settings(target)?;
        let tls = s.security == FtpSecurity::ExplicitTls;
        let verify = match (tls, s.verify) {
            (true, FtpVerify::Pinned) => {
                // Probe-free path: the pin must exist and be a certificate pin. A changed certificate fails the handshake.
                let pinned = self.pins.pinned_key(&target.host, target.port).map_err(|_| EngineError::HostKeyRejected)?.ok_or(EngineError::HostKeyRejected)?;
                if pinned.algorithm != "tls-leaf" {
                    return Err(EngineError::HostKeyRejected);
                }
                Verify::Pinned(leaf_digest(&pinned.fingerprint).ok_or(EngineError::HostKeyRejected)?)
            }
            _ => Verify::Ca,
        };
        self.connect(target, s, tls, verify, login).await
    }
    async fn connect(&self, target: &Target, s: &FtpSettings, tls: bool, verify: Verify, login: bool) -> Result<Session, EngineError> {
        let capture = matches!(verify, Verify::Capture);
        let mut ftp = Ftp::connect(&target.host, target.port, tls, verify, &self.options).await.map_err(map_connect)?;
        let fingerprint = if !tls {
            plain_fingerprint(&target.host)
        } else if s.verify == FtpVerify::Pinned || capture {
            leaf_fingerprint(&ftp.leaf_der().ok_or(EngineError::HostKeyRejected)?)
        } else {
            ca_fingerprint(&target.host)
        };
        if login {
            let password = self.keys.password(&target.id).map_err(|_| EngineError::Auth)?;
            ftp.login(&target.user, &password).await.map_err(map_connect)?;
        }
        Ok(Session { ftp, fingerprint, root: s.remote_path.clone() })
    }

    async fn read_state(sess: &mut Session) -> Result<Option<State>, EngineError> {
        let path = sess.meta("state.json");
        match sess.ftp.retr(&path).await {
            Ok(bytes) => {
                let state: State = serde_json::from_slice(&bytes).map_err(|_| EngineError::Preflight)?;
                state.validate()?;
                Ok(Some(state))
            }
            Err(e) if e.is_not_found() => Ok(None),
            Err(e) => Err(map_op(e)),
        }
    }
    async fn write_state(sess: &mut Session, state: &State) -> Result<(), EngineError> {
        let json = serde_json::to_vec_pretty(state).map_err(|_| EngineError::Other)?;
        let tmp = sess.meta("state.json.tmp");
        let fin = sess.meta("state.json");
        sess.ftp.stor(&tmp, &json).await.map_err(map_op)?;
        replace_file(&mut sess.ftp, &tmp, &fin).await.map_err(map_op)
    }
    async fn ensure_meta(sess: &mut Session) -> Result<(), EngineError> {
        let meta = sess.meta("");
        sess.ftp.mkd_p(&meta).await.map_err(map_op)?;
        // Best effort: only Apache reads it, and only Somnia's own folder is affected.
        if sess.ftp.size(&sess.meta(".htaccess")).await.is_err() {
            let p = sess.meta(".htaccess");
            let _ = sess.ftp.stor(&p, DENY_ALL.as_bytes()).await;
        }
        Ok(())
    }

    /// Files that already exist on the server at paths the artifact would write. Only relevant before the first publish.
    async fn existing_paths(sess: &mut Session, artifact: &Artifact) -> BTreeSet<String> {
        let mut dirs: BTreeSet<String> = BTreeSet::new();
        for f in &artifact.manifest.files {
            dirs.insert(parent(&f.path).to_string());
        }
        let mut found = BTreeSet::new();
        if dirs.len() > 300 {
            return found;
        }
        for dir in dirs {
            let path = sess.path(&dir);
            if let Ok(list) = sess.ftp.list(&path).await {
                for e in list.into_iter().filter(|e| e.kind != RemoteKind::Dir) {
                    found.insert(if dir.is_empty() { e.name } else { format!("{dir}/{}", e.name) });
                }
            }
        }
        found
    }

    async fn make_plan(&self, target: &Target, action: Action, release: Option<&str>) -> Result<EnginePlan, EngineError> {
        let mut sess = self.open(target, true).await?;
        let state = Self::read_state(&mut sess).await?;
        let live = state.as_ref().and_then(|s| s.live.clone());
        let mut files = Vec::new();
        let build_id;
        match action {
            Action::Publish => {
                let artifact = collect_artifact(&self.source)?;
                check_artifact_paths(&artifact)?;
                build_id = artifact.manifest.build_id.clone();
                let old = live.as_ref().map(|l| manifest_of(&l.build_id, &l.files));
                let existing = if state.is_none() { Self::existing_paths(&mut sess, &artifact).await } else { BTreeSet::new() };
                let changes = diff(old.as_ref(), &artifact.manifest).map_err(|_| EngineError::Preflight)?;
                for (kind, list) in [(Change::Added, changes.added), (Change::Changed, changes.changed), (Change::Removed, changes.removed), (Change::Unchanged, changes.unchanged)] {
                    for f in list {
                        let change = if kind == Change::Added && existing.contains(&f.path) { Change::Changed } else { kind };
                        files.push(PlanFile { path: f.path, size: f.size, sha256: f.sha256, change });
                    }
                }
                let mut cache = self.artifacts.lock().map_err(|_| EngineError::Other)?;
                if cache.len() >= 4 {
                    cache.clear();
                }
                cache.insert(target.id.clone(), artifact);
            }
            Action::Rollback => {
                let (state, live) = (state.as_ref().ok_or(EngineError::NoSuchRelease)?, live.as_ref().ok_or(EngineError::NoSuchRelease)?);
                let prev = state.previous.as_ref().filter(|p| Some(p.release_id.as_str()) == release).ok_or(EngineError::NoSuchRelease)?;
                build_id = prev.build_id.clone();
                // Not manifest::diff: the "initial" state has no files, which a manifest refuses.
                let live_by: BTreeMap<&str, &DeployArtifactFile> = live.files.iter().map(|f| (f.path.as_str(), f)).collect();
                let prev_paths: BTreeSet<&str> = prev.files.iter().map(|f| f.path.as_str()).collect();
                let mut push = |f: &DeployArtifactFile, kind: Change| files.push(PlanFile { path: f.path.clone(), size: f.size, sha256: f.sha256.clone(), change: kind });
                for f in &prev.files {
                    match live_by.get(f.path.as_str()) {
                        Some(l) if *l == f => push(f, Change::Unchanged),
                        Some(_) => push(f, Change::Changed),
                        None => push(f, Change::Added),
                    }
                }
                for f in live.files.iter().filter(|f| !prev_paths.contains(f.path.as_str())) {
                    // A file in the live release that replaced an unknown file is restored, not deleted.
                    push(f, if live.backed_up.contains(&f.path) { Change::Changed } else { Change::Removed });
                }
            }
        }
        files.sort_by(|a, b| a.path.cmp(&b.path));
        let fingerprint = sess.fingerprint.clone();
        sess.ftp.quit().await;
        Ok(EnginePlan { fingerprint, build_id, live_release: live.map(|l| l.release_id), files, release_id: release.map(str::to_owned) })
    }

    async fn do_publish(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str), cancel: &AtomicBool) -> Result<Outcome, EngineError> {
        progress("connect");
        let mut sess = self.open(target, true).await?;
        if sess.fingerprint != plan.fingerprint {
            return Err(EngineError::HostKeyRejected);
        }
        progress("check");
        let state = Self::read_state(&mut sess).await?;
        let old_live = state.as_ref().and_then(|s| s.live.clone());
        if old_live.as_ref().map(|l| l.release_id.as_str()) != plan.live_release.as_deref() {
            return Err(EngineError::Preflight);
        }
        let artifact = self.artifacts.lock().map_err(|_| EngineError::Other)?.remove(&target.id).ok_or(EngineError::Preflight)?;
        if artifact.manifest.build_id != plan.build_id {
            return Err(EngineError::Preflight);
        }
        check_artifact_paths(&artifact)?;
        let old_manifest = old_live.as_ref().map(|l| manifest_of(&l.build_id, &l.files));
        let changes = diff(old_manifest.as_ref(), &artifact.manifest).map_err(|_| EngineError::Preflight)?;
        let url = target.domain.as_ref().map(|d| format!("https://{}", d.to_ascii_lowercase()));
        let mut upload: Vec<DeployArtifactFile> = changes.added.iter().chain(&changes.changed).cloned().collect();
        upload.sort_by(|a, b| (is_html(&a.path), &a.path).cmp(&(is_html(&b.path), &b.path)));
        let removed: Vec<String> = changes.removed.iter().map(|f| f.path.clone()).collect();
        if upload.is_empty() && removed.is_empty() {
            return Ok(Outcome { release_id: old_live.map(|l| l.release_id).unwrap_or_else(|| INITIAL.into()), url, rolled_back: false });
        }
        let new_release = release_id(SystemTime::now(), &artifact.manifest).map_err(|_| EngineError::Preflight)?;
        Self::ensure_meta(&mut sess).await?;

        // Phase 1: upload next to the final places under a temporary name. Nothing visible changes.
        let total = upload.len();
        let mut made_dirs: BTreeSet<String> = BTreeSet::new();
        let mut uploaded: Vec<String> = Vec::new();
        for (n, f) in upload.iter().enumerate() {
            progress(&format!("upload:{}/{total}", n + 1));
            if cancel.load(Ordering::SeqCst) {
                Self::drop_tmp(&mut sess, &uploaded).await;
                return Err(EngineError::Cancelled);
            }
            let step: Result<(), FtpError> = async {
                let dir = parent(&f.path).to_string();
                if !dir.is_empty() && made_dirs.insert(dir.clone()) {
                    sess.ftp.mkd_p(&sess.path(&dir)).await?;
                }
                let tmp = tmp_of(&sess.path(&f.path));
                let bytes = artifact.bytes.get(&f.path).ok_or(FtpError::InvalidInput)?;
                sess.ftp.stor(&tmp, bytes).await?;
                uploaded.push(f.path.clone());
                if let Some(size) = sess.ftp.size(&tmp).await? {
                    if size != f.size {
                        return Err(FtpError::Protocol);
                    }
                }
                Ok(())
            }
            .await;
            if let Err(e) = step {
                Self::drop_tmp(&mut sess, &uploaded).await;
                return Err(map_op(e));
            }
        }

        // Phase 2: the short burst of renames. From here on there is no cancel.
        progress("switch");
        let backup_root = sess.meta(&format!("backup/{new_release}"));
        let mut moved: Vec<String> = Vec::new();
        let mut placed: Vec<String> = Vec::new();
        let commit: Result<(), FtpError> = async {
            let mut backup_dirs: BTreeSet<String> = BTreeSet::new();
            for f in &upload {
                let fin = sess.path(&f.path);
                let bak = join(&backup_root, &f.path);
                match Self::backup_move(&mut sess.ftp, &fin, &bak, &mut backup_dirs).await? {
                    true => moved.push(f.path.clone()),
                    false => {}
                }
                sess.ftp.rename(&tmp_of(&fin), &fin).await?;
                placed.push(f.path.clone());
            }
            for path in &removed {
                let fin = sess.path(path);
                let bak = join(&backup_root, path);
                if Self::backup_move(&mut sess.ftp, &fin, &bak, &mut backup_dirs).await? {
                    moved.push(path.clone());
                }
            }
            Ok(())
        }
        .await;
        if commit.is_err() {
            let restored = Self::undo(&mut sess, &backup_root, &moved, &placed).await;
            Self::drop_tmp(&mut sess, &uploaded).await;
            let _ = restored;
            return Err(EngineError::Switch);
        }

        // Verify what is now live (sizes, where the server can say), then record the new state.
        progress("health");
        let verify: Result<(), FtpError> = async {
            for f in &upload {
                if let Some(size) = sess.ftp.size(&sess.path(&f.path)).await? {
                    if size != f.size {
                        return Err(FtpError::Protocol);
                    }
                }
            }
            Ok(())
        }
        .await;
        let previous = Some(match &old_live {
            Some(l) => Previous { release_id: l.release_id.clone(), build_id: l.build_id.clone(), files: l.files.clone() },
            None => Previous { release_id: INITIAL.into(), build_id: INITIAL.into(), files: Vec::new() },
        });
        let new_state = State {
            version: 1,
            live: Some(Live { release_id: new_release.clone(), build_id: artifact.manifest.build_id.clone(), files: artifact.manifest.files.clone(), backed_up: moved.clone() }),
            previous,
        };
        let recorded = match verify {
            Ok(()) => Self::write_state(&mut sess, &new_state).await,
            Err(_) => Err(EngineError::HealthFailed),
        };
        if let Err(e) = recorded {
            let restored = Self::undo(&mut sess, &backup_root, &moved, &placed).await;
            return Err(match (e, restored) {
                (EngineError::HealthFailed, true) => EngineError::HealthFailedRolledBack,
                (EngineError::HealthFailed, false) => EngineError::HealthFailedRollbackFailed,
                (_, true) => EngineError::Switch,
                (_, false) => EngineError::HealthFailedRollbackFailed,
            });
        }
        progress("prune");
        Self::prune_backups(&mut sess, &new_release).await;
        sess.ftp.quit().await;
        Ok(Outcome { release_id: new_release, url, rolled_back: false })
    }

    /// Renames the live file into the backup folder. `Ok(false)`: there was nothing to back up.
    async fn backup_move(ftp: &mut Ftp, fin: &str, bak: &str, made: &mut BTreeSet<String>) -> Result<bool, FtpError> {
        let dir = parent(bak).to_string();
        if made.insert(dir.clone()) {
            ftp.mkd_p(&dir).await?;
        }
        match ftp.rename(fin, bak).await {
            Ok(()) => Ok(true),
            Err(e) if e.is_not_found() => Ok(false),
            Err(e) => Err(e),
        }
    }
    async fn drop_tmp(sess: &mut Session, uploaded: &[String]) {
        for p in uploaded {
            let _ = sess.ftp.dele(&tmp_of(&sess.path(p))).await;
        }
    }
    /// Puts the backed-up files back and removes files this publish created. Returns whether everything went back.
    async fn undo(sess: &mut Session, backup_root: &str, moved: &[String], placed: &[String]) -> bool {
        let mut ok = true;
        for p in placed.iter().rev() {
            let fin = sess.path(p);
            match sess.ftp.dele(&fin).await {
                Ok(()) => {}
                Err(e) if e.is_not_found() => {}
                Err(_) => ok = false,
            }
        }
        for p in moved {
            if sess.ftp.rename(&join(backup_root, p), &sess.path(p)).await.is_err() {
                ok = false;
            }
        }
        ok
    }
    async fn prune_backups(sess: &mut Session, keep: &str) {
        let dir = sess.meta("backup");
        if let Ok(list) = sess.ftp.list(&dir).await {
            for e in list.into_iter().filter(|e| e.kind == RemoteKind::Dir && e.name != keep) {
                let _ = Self::remove_tree(&mut sess.ftp, &join(&dir, &e.name), 0).await;
            }
        }
    }
    fn remove_tree<'a>(ftp: &'a mut Ftp, path: &'a str, depth: u8) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), FtpError>> + 'a>> {
        Box::pin(async move {
            if depth > 16 {
                return Err(FtpError::InvalidInput);
            }
            for e in ftp.list(path).await? {
                let child = join(path, &e.name);
                if e.kind == RemoteKind::Dir {
                    Self::remove_tree(ftp, &child, depth + 1).await?;
                } else {
                    ftp.dele(&child).await?;
                }
            }
            ftp.rmd(path).await
        })
    }

    async fn do_rollback(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        progress("connect");
        let mut sess = self.open(target, true).await?;
        if sess.fingerprint != plan.fingerprint {
            return Err(EngineError::HostKeyRejected);
        }
        progress("check");
        let state = Self::read_state(&mut sess).await?.ok_or(EngineError::NoSuchRelease)?;
        let live = state.live.clone().ok_or(EngineError::NoSuchRelease)?;
        let prev = state.previous.clone().filter(|p| Some(p.release_id.as_str()) == plan.release_id.as_deref()).ok_or(EngineError::NoSuchRelease)?;
        if Some(live.release_id.as_str()) != plan.live_release.as_deref() {
            return Err(EngineError::Preflight);
        }
        progress("switch");
        let backup_root = sess.meta(&format!("backup/{}", live.release_id));
        let result: Result<(), FtpError> = async {
            for p in &live.backed_up {
                let (fin, bak) = (sess.path(p), join(&backup_root, p));
                match replace_file(&mut sess.ftp, &bak, &fin).await {
                    Ok(()) => {}
                    // Already restored by an interrupted earlier attempt.
                    Err(e) if e.is_not_found() => {}
                    Err(e) => return Err(e),
                }
            }
            let prev_paths: BTreeSet<&str> = prev.files.iter().map(|f| f.path.as_str()).collect();
            for f in &live.files {
                if !prev_paths.contains(f.path.as_str()) && !live.backed_up.contains(&f.path) {
                    match sess.ftp.dele(&sess.path(&f.path)).await {
                        Ok(()) => {}
                        Err(e) if e.is_not_found() => {}
                        Err(e) => return Err(e),
                    }
                }
            }
            Ok(())
        }
        .await;
        result.map_err(|_| EngineError::Switch)?;
        let restored = State { version: 1, live: Some(Live { release_id: prev.release_id.clone(), build_id: prev.build_id.clone(), files: prev.files.clone(), backed_up: Vec::new() }), previous: None };
        Self::write_state(&mut sess, &restored).await.map_err(|_| EngineError::Switch)?;
        progress("prune");
        Self::prune_backups(&mut sess, "").await;
        sess.ftp.quit().await;
        Ok(Outcome { release_id: prev.release_id, url: target.domain.as_ref().map(|d| format!("https://{}", d.to_ascii_lowercase())), rolled_back: true })
    }
}

/// Moves `from` onto `to`. Servers differ on renaming over an existing file, so fall back to delete-then-rename.
async fn replace_file(ftp: &mut Ftp, from: &str, to: &str) -> Result<(), FtpError> {
    match ftp.rename(from, to).await {
        Err(FtpError::Rejected(550 | 553 | 450)) => {
            match ftp.dele(to).await {
                Ok(()) => {}
                Err(e) if e.is_not_found() => {}
                Err(e) => return Err(e),
            }
            ftp.rename(from, to).await
        }
        other => other,
    }
}
fn map_connect(e: FtpError) -> EngineError {
    match e {
        FtpError::Cert => EngineError::HostKeyRejected,
        FtpError::Auth => EngineError::Auth,
        FtpError::NoTls => EngineError::TlsRequired,
        _ => EngineError::Connect,
    }
}
fn map_op(e: FtpError) -> EngineError {
    match e {
        FtpError::Cert => EngineError::HostKeyRejected,
        FtpError::Auth => EngineError::Auth,
        FtpError::NoTls => EngineError::TlsRequired,
        FtpError::InvalidInput | FtpError::TooLarge => EngineError::Preflight,
        _ => EngineError::Upload,
    }
}

impl<B: SecretBackend> DeployEngine for FtpEngine<B> {
    fn plan(&self, target: &Target, action: Action, release_id: Option<&str>) -> Result<EnginePlan, EngineError> {
        self.run(self.make_plan(target, action, release_id))
    }
    fn probe_host_key(&self, target: &Target) -> Result<HostKeyInfo, EngineError> {
        let s = Self::settings(target)?;
        let tls = s.security == FtpSecurity::ExplicitTls;
        // Credential-free: nothing secret is sent before the person has seen and accepted the identity.
        let (algorithm, verify) = match (tls, s.verify) {
            (false, _) => ("plaintext", Verify::Ca),
            (true, FtpVerify::Ca) => ("tls-ca", Verify::Ca),
            (true, FtpVerify::Pinned) => ("tls-leaf", Verify::Capture),
        };
        let sess = self.run(self.connect(target, s, tls, verify, false))?;
        let info = HostKeyInfo { algorithm: algorithm.into(), fingerprint: sess.fingerprint.clone() };
        self.observed.lock().map_err(|_| EngineError::Other)?.insert(pin_key(&target.host, target.port), HostKey { algorithm: info.algorithm.clone(), fingerprint: info.fingerprint.clone() });
        self.run(async move {
            sess.ftp.quit().await;
            Ok(())
        })?;
        Ok(info)
    }
    fn publish(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        let flag = Arc::new(AtomicBool::new(false));
        self.active.lock().map_err(|_| EngineError::Other)?.insert(target.id.clone(), flag.clone());
        let result = self.run(self.do_publish(target, plan, progress, &flag));
        if let Ok(mut a) = self.active.lock() {
            a.remove(&target.id);
        }
        result
    }
    fn rollback(&self, target: &Target, plan: &EnginePlan, progress: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        self.run(self.do_rollback(target, plan, progress))
    }
    fn live_release(&self, target: &Target) -> Result<Option<String>, EngineError> {
        self.run(async {
            let mut sess = self.open(target, true).await?;
            let state = Self::read_state(&mut sess).await?;
            sess.ftp.quit().await;
            Ok(state.and_then(|s| s.live).map(|l| l.release_id))
        })
    }
    fn cancel(&self, target: &Target) -> bool {
        match self.active.lock().ok().and_then(|a| a.get(&target.id).cloned()) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
    fn releases(&self, target: &Target) -> Result<Vec<String>, EngineError> {
        self.run(async {
            let mut sess = self.open(target, true).await?;
            let state = Self::read_state(&mut sess).await?;
            sess.ftp.quit().await;
            Ok(state.and_then(|s| s.previous).map(|p| vec![p.release_id]).unwrap_or_default())
        })
    }
    fn list_remote(&self, target: &Target, path: &str) -> Result<Vec<RemoteEntry>, EngineError> {
        self.run(async {
            let mut sess = self.open(target, true).await?;
            let full = sess.path(path);
            let list = sess.ftp.list(&full).await.map_err(|e| if e.is_not_found() { EngineError::NoSuchRelease } else { map_op(e) });
            sess.ftp.quit().await;
            list
        })
    }
}

/// Chooses the engine by target kind. Everything that is not an FTP target goes to the SSH engine unchanged.
pub struct RoutingEngine {
    pub ssh: Box<dyn DeployEngine>,
    pub ftp: Box<dyn DeployEngine>,
}
impl RoutingEngine {
    fn pick(&self, t: &Target) -> &dyn DeployEngine {
        if t.kind == TargetKind::Ftp { self.ftp.as_ref() } else { self.ssh.as_ref() }
    }
}
impl DeployEngine for RoutingEngine {
    fn plan(&self, t: &Target, a: Action, r: Option<&str>) -> Result<EnginePlan, EngineError> {
        self.pick(t).plan(t, a, r)
    }
    fn probe_host_key(&self, t: &Target) -> Result<HostKeyInfo, EngineError> {
        self.pick(t).probe_host_key(t)
    }
    fn publish(&self, t: &Target, p: &EnginePlan, g: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        self.pick(t).publish(t, p, g)
    }
    fn rollback(&self, t: &Target, p: &EnginePlan, g: &dyn Fn(&str)) -> Result<Outcome, EngineError> {
        self.pick(t).rollback(t, p, g)
    }
    fn live_release(&self, t: &Target) -> Result<Option<String>, EngineError> {
        self.pick(t).live_release(t)
    }
    fn cancel(&self, t: &Target) -> bool {
        self.pick(t).cancel(t)
    }
    fn releases(&self, t: &Target) -> Result<Vec<String>, EngineError> {
        self.pick(t).releases(t)
    }
    fn list_remote(&self, t: &Target, p: &str) -> Result<Vec<RemoteEntry>, EngineError> {
        self.pick(t).list_remote(t, p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::ftp_testkit::{ca_signed, self_signed, FakeFtp};
    use crate::deploy_targets::key_slot_for;
    use crate::oauth_store::MemoryBackend;

    #[derive(Clone, Copy, PartialEq)]
    enum Mode { Ca, Pinned, Plain, NoTls }
    struct Fx { eng: FtpEngine<MemoryBackend>, fake: FakeFtp, target: Target, dir: tempfile::TempDir }
    fn write(dir: &std::path::Path, rel: &str, body: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }
    fn fx(mode: Mode, root: &str) -> Fx {
        let (fake, extra, leaf) = match mode {
            Mode::Ca => { let c = ca_signed(&["127.0.0.1"]); (FakeFtp::start(Some(c.server.clone())), vec![c.ca_der.clone()], None) }
            Mode::Pinned => { let c = self_signed(&["127.0.0.1"]); (FakeFtp::start(Some(c.server.clone())), vec![], Some(c.leaf_der.clone())) }
            Mode::Plain | Mode::NoTls => (FakeFtp::start(None), vec![], None),
        };
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "index.html", "<h1>one</h1>");
        write(dir.path(), "css/site.css", "body{}");
        write(dir.path(), "gone.html", "old page");
        let source: ProjectSource = Arc::new(Mutex::new(Some(dir.path().to_path_buf())));
        let keys = Arc::new(KeyStore::new(MemoryBackend::default()));
        keys.set_password("site", "secret").unwrap();
        let pins = Arc::new(HostKeyStore::default());
        let mut eng = FtpEngine::new(keys, pins.clone(), Default::default(), source);
        eng.options.extra_roots = extra;
        eng.options.io_timeout = std::time::Duration::from_secs(10);
        let settings = FtpSettings {
            security: if mode == Mode::Plain { FtpSecurity::Plain } else { FtpSecurity::ExplicitTls },
            verify: if mode == Mode::Pinned { FtpVerify::Pinned } else { FtpVerify::Ca },
            allow_plain: mode == Mode::Plain,
            remote_path: root.into(),
        };
        let target = Target { id: "site".into(), name: "Site".into(), host: "127.0.0.1".into(), port: fake.port, user: "user".into(), domain: Some("example.com".into()), kind: TargetKind::Ftp, key_slot: key_slot_for("site"), spa: false, app_port: None, ftp: Some(settings) };
        target.validate().unwrap();
        if let Some(der) = leaf {
            pins.trust_new("127.0.0.1", fake.port, &HostKey { algorithm: "tls-leaf".into(), fingerprint: leaf_fingerprint(&der) }).unwrap();
        }
        Fx { eng, fake, target, dir }
    }
    fn publish(f: &Fx) -> Result<Outcome, EngineError> {
        let plan = f.eng.plan(&f.target, Action::Publish, None)?;
        f.eng.publish(&f.target, &plan, &|_| {})
    }
    fn names(f: &Fx) -> Vec<String> { f.fake.with(|s| s.files()) }
    fn no_tmp(f: &Fx) -> bool { names(f).iter().all(|n| !n.contains(TMP_SUFFIX) && !n.ends_with("state.json.tmp")) }

    #[test]
    fn publish_uploads_then_renames_and_records_state() {
        let f = fx(Mode::Ca, "/");
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        assert!(plan.live_release.is_none() && plan.files.iter().all(|p| p.change == Change::Added) && plan.files.len() == 3);
        assert_eq!(f.fake.with(|s| s.files().len()), 0, "planning is read-only");
        let steps = Mutex::new(Vec::new());
        let out = f.eng.publish(&f.target, &plan, &|s| steps.lock().unwrap().push(s.to_string())).unwrap();
        assert_eq!(out.url.as_deref(), Some("https://example.com"));
        let steps = steps.into_inner().unwrap();
        assert!(steps.iter().any(|s| s == "upload:3/3") && steps.iter().any(|s| s == "switch"), "{steps:?}");
        assert!(steps.iter().position(|s| s == "switch") > steps.iter().position(|s| s == "upload:3/3"));
        assert_eq!(f.fake.with(|s| s.file("/index.html")).unwrap(), b"<h1>one</h1>");
        assert!(f.fake.with(|s| s.file("/css/site.css")).is_some() && no_tmp(&f));
        assert!(f.fake.with(|s| s.file("/.somnia-deploy/.htaccess")).is_some());
        assert_eq!(f.eng.live_release(&f.target).unwrap(), Some(out.release_id.clone()));
        // The password crossed only the TLS channel: there is no PASS before AUTH TLS.
        f.fake.with(|s| {
            let auth = s.log.iter().position(|l| l.starts_with("AUTH TLS")).unwrap();
            assert!(s.log.iter().position(|l| l.starts_with("USER")).unwrap() > auth);
        });
        // Second plan: everything unchanged.
        let again = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        assert!(again.files.iter().all(|p| p.change == Change::Unchanged));
        assert_eq!(again.live_release.as_deref(), Some(out.release_id.as_str()));
    }

    #[test]
    fn changes_are_backed_up_removed_files_move_away_and_rollback_restores() {
        let f = fx(Mode::Ca, "/public_html");
        f.fake.with(|s| { s.put("/public_html/keep-me.txt", b"not ours"); });
        let first = publish(&f).unwrap();
        write(f.dir.path(), "index.html", "<h1>two</h1>");
        std::fs::remove_file(f.dir.path().join("gone.html")).unwrap();
        write(f.dir.path(), "new.html", "fresh");
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        let by = |p: &str| plan.files.iter().find(|x| x.path == p).unwrap().change;
        assert_eq!((by("index.html"), by("gone.html"), by("new.html"), by("css/site.css")), (Change::Changed, Change::Removed, Change::Added, Change::Unchanged));
        let second = f.eng.publish(&f.target, &plan, &|_| {}).unwrap();
        assert_ne!(first.release_id, second.release_id);
        assert_eq!(f.fake.with(|s| s.file("/public_html/index.html")).unwrap(), b"<h1>two</h1>");
        assert!(f.fake.with(|s| s.file("/public_html/gone.html")).is_none());
        let bak = format!("/public_html/.somnia-deploy/backup/{}", second.release_id);
        assert_eq!(f.fake.with(|s| s.file(&format!("{bak}/index.html"))).unwrap(), b"<h1>one</h1>");
        assert_eq!(f.fake.with(|s| s.file(&format!("{bak}/gone.html"))).unwrap(), b"old page");
        assert_eq!(f.fake.with(|s| s.file("/public_html/keep-me.txt")).unwrap(), b"not ours", "unknown files are never touched");
        assert_eq!(f.eng.releases(&f.target).unwrap(), vec![first.release_id.clone()]);
        // Roll back to the first release.
        let rp = f.eng.plan(&f.target, Action::Rollback, Some(&first.release_id)).unwrap();
        assert!(rp.files.iter().any(|p| p.path == "new.html" && p.change == Change::Removed));
        let back = f.eng.rollback(&f.target, &rp, &|_| {}).unwrap();
        assert!(back.rolled_back && back.release_id == first.release_id);
        assert_eq!(f.fake.with(|s| s.file("/public_html/index.html")).unwrap(), b"<h1>one</h1>");
        assert_eq!(f.fake.with(|s| s.file("/public_html/gone.html")).unwrap(), b"old page");
        assert!(f.fake.with(|s| s.file("/public_html/new.html")).is_none());
        assert_eq!(f.eng.live_release(&f.target).unwrap(), Some(first.release_id));
        assert!(f.eng.releases(&f.target).unwrap().is_empty());
        assert!(f.fake.with(|s| s.files()).iter().all(|n| !n.contains("/backup/")), "old backups are pruned");
        assert_eq!(f.eng.plan(&f.target, Action::Rollback, Some("20000000000000000000-aaaaaaaaaaaa")).unwrap_err(), EngineError::NoSuchRelease);
    }

    #[test]
    fn existing_unknown_files_show_as_changed_and_come_back_on_rollback() {
        let f = fx(Mode::Ca, "/");
        f.fake.with(|s| { s.put("/index.html", b"their old index"); s.put("/other.html", b"other"); });
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        assert_eq!(plan.files.iter().find(|p| p.path == "index.html").unwrap().change, Change::Changed);
        assert_eq!(plan.files.iter().find(|p| p.path == "gone.html").unwrap().change, Change::Added);
        let out = f.eng.publish(&f.target, &plan, &|_| {}).unwrap();
        assert_eq!(f.fake.with(|s| s.file("/index.html")).unwrap(), b"<h1>one</h1>");
        let rp = f.eng.plan(&f.target, Action::Rollback, Some("initial")).unwrap();
        assert_eq!(rp.files.iter().find(|p| p.path == "index.html").unwrap().change, Change::Changed);
        f.eng.rollback(&f.target, &rp, &|_| {}).unwrap();
        assert_eq!(f.fake.with(|s| s.file("/index.html")).unwrap(), b"their old index");
        assert!(f.fake.with(|s| s.file("/gone.html")).is_none() && f.fake.with(|s| s.file("/other.html")).is_some());
        let _ = out;
    }

    #[test]
    fn failed_upload_leaves_the_live_site_and_no_temp_files() {
        let f = fx(Mode::Ca, "/");
        publish(&f).unwrap();
        let before = names(&f).into_iter().map(|n| (n.clone(), f.fake.with(|s| s.file(&n)))).collect::<Vec<_>>();
        write(f.dir.path(), "index.html", "<h1>two</h1>");
        write(f.dir.path(), "a.js", "1");
        write(f.dir.path(), "b.js", "2");
        f.fake.with(|s| s.fail_stor_after = Some(s.stors + 1));
        assert_eq!(publish(&f).unwrap_err(), EngineError::Upload);
        let after = names(&f).into_iter().map(|n| (n.clone(), f.fake.with(|s| s.file(&n)))).collect::<Vec<_>>();
        assert_eq!(before, after);
    }

    #[test]
    fn failed_rename_burst_is_undone() {
        let f = fx(Mode::Ca, "/");
        publish(&f).unwrap();
        let before = names(&f).into_iter().map(|n| (n.clone(), f.fake.with(|s| s.file(&n)))).collect::<Vec<_>>();
        write(f.dir.path(), "index.html", "<h1>two</h1>");
        write(f.dir.path(), "css/site.css", "body{color:red}");
        write(f.dir.path(), "new.html", "x");
        // Backups use renames too: let the first rename of the burst work, then fail.
        f.fake.with(|s| s.fail_rnto_after = Some(s.rntos + 3));
        let err = publish(&f).unwrap_err();
        assert_eq!(err, EngineError::Switch);
        f.fake.with(|s| s.fail_rnto_after = None);
        let after = names(&f).into_iter().filter(|n| !n.contains("/backup/")).map(|n| (n.clone(), f.fake.with(|s| s.file(&n)))).collect::<Vec<_>>();
        let before: Vec<_> = before.into_iter().filter(|(n, _)| !n.contains("/backup/")).collect();
        assert_eq!(before, after, "site content is exactly the previous version again");
    }

    #[test]
    fn cancel_before_the_switch_changes_nothing() {
        let f = fx(Mode::Ca, "/");
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        let flag = AtomicBool::new(true);
        let r = f.eng.run(f.eng.do_publish(&f.target, &plan, &|_| {}, &flag));
        assert_eq!(r.unwrap_err(), EngineError::Cancelled);
        assert!(f.fake.with(|s| s.files()).iter().all(|n| n.starts_with("/.somnia-deploy/")));
        assert!(!f.eng.cancel(&f.target), "nothing running");
    }

    #[test]
    fn size_mismatch_aborts_and_cleans_up() {
        let f = fx(Mode::Ca, "/");
        f.fake.with(|s| s.bad_size = true);
        assert_eq!(publish(&f).unwrap_err(), EngineError::Upload);
        assert!(f.fake.with(|s| s.files()).iter().all(|n| !n.contains(TMP_SUFFIX) && !n.ends_with(".html")));
    }

    #[test]
    fn works_without_epsv_mlsd_size_and_ignores_the_pasv_address() {
        let f = fx(Mode::Ca, "/");
        f.fake.with(|s| { s.no_epsv = true; s.no_mlsd = true; s.no_size = true; s.pasv_wrong_ip = true; s.rnto_overwrite = true; });
        publish(&f).unwrap();
        write(f.dir.path(), "index.html", "<h1>two</h1>");
        publish(&f).unwrap();
        let list = f.eng.list_remote(&f.target, "").unwrap();
        assert!(list.iter().any(|e| e.name == "index.html" && e.kind == RemoteKind::File && e.size == Some(12)), "{list:?}");
        assert!(list.iter().any(|e| e.name == "css" && e.kind == RemoteKind::Dir));
    }

    #[test]
    fn listing_is_read_only_and_reports_directories_and_sizes() {
        let f = fx(Mode::Ca, "/web");
        f.fake.with(|s| { s.put("/web/a/b.txt", b"12345"); s.put("/web/top.txt", b"1"); });
        let root = f.eng.list_remote(&f.target, "").unwrap();
        assert!(root.iter().any(|e| e.name == "a" && e.kind == RemoteKind::Dir && e.size.is_none()));
        let sub = f.eng.list_remote(&f.target, "a").unwrap();
        assert_eq!(sub.len(), 1);
        assert_eq!((sub[0].name.as_str(), sub[0].size, sub[0].modified.as_deref()), ("b.txt", Some(5), Some("2026-10-13 09:30")));
        assert!(f.eng.list_remote(&f.target, "missing").is_err());
        f.fake.with(|s| assert!(!s.log.iter().any(|l| ["STOR", "DELE", "RNFR", "MKD", "RMD"].contains(&l.split(' ').next().unwrap()))));
    }

    #[test]
    fn ca_mode_checks_chain_and_host_name_before_any_credential() {
        // Self-signed certificate nobody vouches for.
        let c = self_signed(&["127.0.0.1"]);
        let fake = FakeFtp::start(Some(c.server.clone()));
        let mut f = fx(Mode::Ca, "/");
        f.target.port = fake.port;
        assert_eq!(f.eng.probe_host_key(&f.target).unwrap_err(), EngineError::HostKeyRejected);
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::HostKeyRejected);
        fake.with(|s| assert!(!s.logged("USER") && !s.logged("PASS")));
        // Right chain, wrong host name.
        let c = ca_signed(&["other.example"]);
        let fake = FakeFtp::start(Some(c.server.clone()));
        f.eng.options.extra_roots = vec![c.ca_der.clone()];
        f.target.port = fake.port;
        assert_eq!(f.eng.probe_host_key(&f.target).unwrap_err(), EngineError::HostKeyRejected);
        fake.with(|s| assert!(!s.logged("USER")));
    }

    #[test]
    fn probe_reports_a_stable_ca_pin_and_records_it_for_trust() {
        let f = fx(Mode::Ca, "/");
        let info = f.eng.probe_host_key(&f.target).unwrap();
        assert_eq!((info.algorithm.as_str(), info.fingerprint.as_str()), ("tls-ca", ca_fingerprint("127.0.0.1").as_str()));
        assert!(f.eng.observed.lock().unwrap().contains_key(&pin_key("127.0.0.1", f.target.port)));
        f.fake.with(|s| assert!(!s.logged("USER") && !s.logged("PASS"), "probe is credential-free"));
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        assert_eq!(plan.fingerprint, info.fingerprint);
    }

    #[test]
    fn pinned_mode_accepts_only_the_confirmed_certificate() {
        let f = fx(Mode::Pinned, "/");
        let probe = f.eng.probe_host_key(&f.target).unwrap();
        assert_eq!(probe.algorithm, "tls-leaf");
        f.fake.with(|s| assert!(!s.logged("USER")));
        let plan = f.eng.plan(&f.target, Action::Publish, None).unwrap();
        assert_eq!(plan.fingerprint, probe.fingerprint);
        // Same host and port, other certificate: the handshake fails before USER.
        let other = self_signed(&["127.0.0.1"]);
        let fake2 = FakeFtp::start(Some(other.server.clone()));
        f.eng.pins.replace_confirmed("127.0.0.1", f.target.port, &HostKey { algorithm: "tls-leaf".into(), fingerprint: probe.fingerprint.clone() }, &HostKey { algorithm: "tls-leaf".into(), fingerprint: probe.fingerprint.clone() }).ok();
        f.eng.pins.trust_new("127.0.0.1", fake2.port, &HostKey { algorithm: "tls-leaf".into(), fingerprint: probe.fingerprint.clone() }).unwrap();
        let mut t2 = f.target.clone();
        t2.port = fake2.port;
        assert_eq!(f.eng.plan(&t2, Action::Publish, None).unwrap_err(), EngineError::HostKeyRejected);
        fake2.with(|s| assert!(!s.logged("USER") && !s.logged("PASS")));
    }

    #[test]
    fn explicit_tls_never_downgrades_to_plain() {
        let f = fx(Mode::NoTls, "/");
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::TlsRequired);
        assert_eq!(f.eng.probe_host_key(&f.target).unwrap_err(), EngineError::TlsRequired);
        f.fake.with(|s| assert!(!s.logged("USER") && !s.logged("PASS")));
    }

    #[test]
    fn plain_ftp_works_only_as_an_explicit_opt_in() {
        let f = fx(Mode::Plain, "/");
        let info = f.eng.probe_host_key(&f.target).unwrap();
        assert_eq!((info.algorithm.as_str(), info.fingerprint.as_str()), ("plaintext", plain_fingerprint("127.0.0.1").as_str()));
        publish(&f).unwrap();
        assert!(f.fake.with(|s| s.file("/index.html")).is_some());
        let mut t = f.target.clone();
        t.ftp.as_mut().unwrap().allow_plain = false;
        assert!(t.validate().is_err(), "plain FTP needs allowPlain");
        t.ftp.as_mut().unwrap().allow_plain = true;
        t.ftp.as_mut().unwrap().verify = FtpVerify::Pinned;
        assert!(t.validate().is_err());
    }

    #[test]
    fn wrong_password_is_an_auth_error_and_secrets_stay_out_of_errors() {
        let f = fx(Mode::Ca, "/");
        f.eng.keys.set_password("site", "wrong-password-canary").unwrap();
        let err = f.eng.plan(&f.target, Action::Publish, None).unwrap_err();
        assert_eq!(err, EngineError::Auth);
        assert!(!format!("{err:?}").contains("canary"));
        f.eng.keys.delete("site").unwrap();
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::Auth);
    }

    #[test]
    fn hostile_state_files_and_reserved_names_are_rejected() {
        let f = fx(Mode::Ca, "/");
        f.fake.with(|s| s.put("/.somnia-deploy/state.json", br#"{"version":1,"live":{"releaseId":"20261013","buildId":"b","files":[],"backedUp":["../../etc/passwd"]},"previous":null}"#));
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::Preflight);
        f.fake.with(|s| s.put("/.somnia-deploy/state.json", b"{not json"));
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::Preflight);
        let f = fx(Mode::Ca, "/");
        write(f.dir.path(), ".somnia-deploy/state.json", "{}");
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::Preflight);
        let f = fx(Mode::Ca, "/");
        write(f.dir.path(), "x.html.somnia-tmp", "{}");
        assert_eq!(f.eng.plan(&f.target, Action::Publish, None).unwrap_err(), EngineError::Preflight);
    }

    #[test]
    fn routing_sends_only_ftp_targets_to_the_ftp_engine() {
        let f = fx(Mode::Ca, "/");
        struct Marker;
        impl DeployEngine for Marker {
            fn plan(&self, _: &Target, _: Action, _: Option<&str>) -> Result<EnginePlan, EngineError> { Err(EngineError::Switch) }
            fn probe_host_key(&self, _: &Target) -> Result<HostKeyInfo, EngineError> { Err(EngineError::Switch) }
            fn publish(&self, _: &Target, _: &EnginePlan, _: &dyn Fn(&str)) -> Result<Outcome, EngineError> { Err(EngineError::Switch) }
            fn rollback(&self, _: &Target, _: &EnginePlan, _: &dyn Fn(&str)) -> Result<Outcome, EngineError> { Err(EngineError::Switch) }
            fn releases(&self, _: &Target) -> Result<Vec<String>, EngineError> { Err(EngineError::Switch) }
        }
        let router = RoutingEngine { ssh: Box::new(Marker), ftp: Box::new(f.eng) };
        assert!(router.probe_host_key(&f.target).is_ok());
        let mut ssh = f.target.clone();
        ssh.kind = TargetKind::Static;
        ssh.ftp = None;
        assert_eq!(router.probe_host_key(&ssh).unwrap_err(), EngineError::Switch);
        assert_eq!(router.list_remote(&ssh, "").unwrap_err(), EngineError::Other);
    }
}
