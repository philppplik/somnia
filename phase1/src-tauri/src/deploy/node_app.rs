//! Node tier of the publish engine: run a self-contained Node bundle as a systemd user service of
//! the `somnia` account behind Caddy, with an automatic switch back when the new version does not answer.
//!
//! Everything is generic over `SshTransport + SshExec`, so tests drive it with the in-process mock
//! or the in-process SSH server; there is no network address anywhere in this file. Remote commands
//! are fixed templates whose only variables are validated ids, ports and paths. Server output
//! passes through a redactor seeded with the app's own `.env` values before it can leave this module.
//! The caller owns pinned-host verification and the human approval token (see deploy_guard).
use super::{
    bootstrap::CADDY_RELOAD_COMMAND,
    manifest::{valid_id, DeployArtifactKind, DeployArtifactManifest},
    node_env::{self, EnvError, EnvMap},
    redactor::Redactor,
    release::{release_id, ReleaseLayout},
    ssh::{ExecOutput, SshExec},
    transport::SshTransport,
    DeployError,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;

pub trait NodeRemote: SshTransport + SshExec {}
impl<T: SshTransport + SshExec> NodeRemote for T {}

pub const PORT_MIN: u16 = 20_000;
pub const PORT_MAX: u16 = 29_999;
/// Shown when Node is missing; Somnia never installs it silently.
pub const NODE_INSTALL_HINT: &str = "sudo apt-get install -y nodejs npm";
const LOG_ROTATE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeErrorCode {
    InvalidInput,
    Transport,
    Integrity,
    NotPrepared,
    NodeMissing,
    NodeTooOld,
    PortUnavailable,
    ReleaseExists,
    InstallFailed,
    UnitFailed,
    CaddyInvalid,
    /// New version failed its health check, the previous one runs again.
    HealthFailedRolledBack,
    /// New version failed and the previous one did not come back either.
    HealthFailedRollbackFailed,
    /// First publish failed its health check: nothing to go back to, service stopped.
    HealthFailed,
    NoSuchRelease,
    ReleaseNotReady,
    Env(EnvError),
}
impl NodeErrorCode {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput => "deploy.node.invalidInput",
            Self::Transport => "deploy.node.transport",
            Self::Integrity => "deploy.node.integrity",
            Self::NotPrepared => "deploy.node.notPrepared",
            Self::NodeMissing => "deploy.node.nodeMissing",
            Self::NodeTooOld => "deploy.node.nodeTooOld",
            Self::PortUnavailable => "deploy.node.portUnavailable",
            Self::ReleaseExists => "deploy.node.releaseExists",
            Self::InstallFailed => "deploy.node.installFailed",
            Self::UnitFailed => "deploy.node.unitFailed",
            Self::CaddyInvalid => "deploy.node.caddyInvalid",
            Self::HealthFailedRolledBack => "deploy.node.healthFailedRolledBack",
            Self::HealthFailedRollbackFailed => "deploy.node.healthFailedRollbackFailed",
            Self::HealthFailed => "deploy.node.healthFailed",
            Self::NoSuchRelease => "deploy.node.noSuchRelease",
            Self::ReleaseNotReady => "deploy.node.releaseNotReady",
            Self::Env(EnvError::BadKey) => "deploy.node.env.badKey",
            Self::Env(EnvError::Reserved) => "deploy.node.env.reserved",
            Self::Env(EnvError::BadValue) => "deploy.node.env.badValue",
            Self::Env(EnvError::TooMany) => "deploy.node.env.tooMany",
            Self::Env(EnvError::TooLarge) => "deploy.node.env.tooLarge",
        }
    }
}
/// Stable code plus an optional, redacted tail of the app or installer log. Never a raw SSH error.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{}", .code.code())]
pub struct NodeError {
    pub code: NodeErrorCode,
    pub log_tail: Vec<String>,
}
impl NodeError {
    fn new(code: NodeErrorCode) -> Self {
        Self { code, log_tail: Vec::new() }
    }
    fn with_log(code: NodeErrorCode, log_tail: Vec<String>) -> Self {
        Self { code, log_tail }
    }
}
impl From<DeployError> for NodeError {
    fn from(e: DeployError) -> Self {
        Self::new(match e {
            DeployError::InvalidInput => NodeErrorCode::InvalidInput,
            DeployError::Integrity => NodeErrorCode::Integrity,
            DeployError::ReleaseExists => NodeErrorCode::ReleaseExists,
            DeployError::ReleaseNotReady => NodeErrorCode::ReleaseNotReady,
            _ => NodeErrorCode::Transport,
        })
    }
}
impl From<EnvError> for NodeError {
    fn from(e: EnvError) -> Self {
        Self::new(NodeErrorCode::Env(e))
    }
}
type Result<T> = std::result::Result<T, NodeError>;

// ---------- pure helpers: versions, units, proxy, health script ----------

/// `v20.11.1` -> `[20, 11, 1]`. Partial versions give fewer parts.
fn parse_parts(s: &str) -> Option<Vec<u64>> {
    let s = s.trim().trim_start_matches(['v', '=']);
    let s = s.split(['-', '+']).next()?;
    let mut parts = Vec::new();
    for p in s.split('.') {
        if matches!(p, "x" | "X" | "*") {
            break;
        }
        parts.push(p.parse::<u64>().ok()?);
        if parts.len() > 3 {
            return None;
        }
    }
    Some(parts)
}
fn triple(p: &[u64]) -> (u64, u64, u64) {
    (*p.first().unwrap_or(&0), *p.get(1).unwrap_or(&0), *p.get(2).unwrap_or(&0))
}
/// Smallest version above everything the partial `p` covers (`20` -> 21.0.0, `20.1` -> 20.2.0).
fn upper(p: &[u64]) -> (u64, u64, u64) {
    match p.len() {
        0 => (u64::MAX, 0, 0),
        1 => (p[0] + 1, 0, 0),
        2 => (p[0], p[1] + 1, 0),
        _ => (p[0], p[1], p[2] + 1),
    }
}
fn comparator_ok(v: (u64, u64, u64), c: &str) -> Option<bool> {
    let c = c.trim();
    if c.is_empty() || c == "*" || c == "x" || c == "latest" {
        return Some(true);
    }
    let (op, rest) = ["<=", ">=", "<", ">", "=", "^", "~"]
        .iter()
        .find_map(|op| c.strip_prefix(op).map(|r| (*op, r)))
        .unwrap_or(("", c));
    let p = parse_parts(rest)?;
    let lo = triple(&p);
    Some(match op {
        ">=" => v >= lo,
        ">" => v >= upper(&p),
        "<" => v < lo,
        "<=" => v < upper(&p),
        "^" => {
            let hi = match p.as_slice() {
                [0, 0, _, ..] if p.len() == 3 => (0, 0, p[2] + 1),
                [0, m, ..] if p.len() >= 2 => (0, m + 1, 0),
                [m, ..] => (m + 1, 0, 0),
                [] => return Some(true),
            };
            v >= lo && v < hi
        }
        "~" => v >= lo && v < if p.len() <= 1 { upper(&p) } else { (p[0], p[1] + 1, 0) },
        _ => v >= lo && v < upper(&p),
    })
}
/// Subset of npm semver ranges used in `engines.node`. An unreadable range does not block a publish.
pub fn node_satisfies(version: &str, range: &str) -> bool {
    let Some(vp) = parse_parts(version) else { return true };
    let v = triple(&vp);
    let mut tokens: Vec<String> = Vec::new();
    // Join "- " hyphen ranges and ">= 18" spacing into single comparators.
    let words: Vec<&str> = range.split_whitespace().collect();
    let mut i = 0;
    while i < words.len() {
        let w = words[i];
        if w == "||" {
            tokens.push("||".into());
        } else if matches!(w, ">=" | ">" | "<=" | "<" | "=" | "^" | "~") && i + 1 < words.len() {
            tokens.push(format!("{w}{}", words[i + 1]));
            i += 1;
        } else if i + 2 < words.len() && words[i + 1] == "-" {
            tokens.push(format!(">={w}"));
            tokens.push(format!("<={}", words[i + 2]));
            i += 2;
        } else {
            tokens.push(w.to_string());
        }
        i += 1;
    }
    let mut any_alt = false;
    for alt in tokens.split(|t| t == "||") {
        let mut ok = true;
        for c in alt {
            match comparator_ok(v, c) {
                Some(true) => {}
                Some(false) => ok = false,
                None => return true,
            }
        }
        any_alt = true;
        if ok {
            return true;
        }
    }
    !any_alt
}

pub fn valid_domain(d: &str) -> bool {
    let labels: Vec<&str> = d.split('.').collect();
    d.len() <= 253
        && labels.len() >= 2
        && labels.iter().all(|l| {
            !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-') && l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
        && !labels.last().is_some_and(|l| l.bytes().all(|b| b.is_ascii_digit()))
}
fn valid_node_path(p: &str) -> bool {
    p.starts_with('/') && p.len() <= 200 && !p.contains("//") && p.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._+-".contains(&b))
}
fn valid_entry(p: &str) -> bool {
    !p.is_empty() && p.len() <= 200 && !p.starts_with('/') && !p.split('/').any(|s| s.is_empty() || s == "." || s == "..") && p.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b))
}
pub fn valid_health_path(p: &str) -> bool {
    p.starts_with('/') && p.len() <= 200 && p.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._~-".contains(&b))
}

/// What the unit needs to know about the running bundle. Stored next to each release so that a
/// rollback to an older release starts it the way it was published.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLaunch {
    pub entry: String,
    pub install: bool,
    pub host_var: String,
    pub port_var: String,
    pub wants_origin: bool,
}
impl NodeLaunch {
    fn validate(&self) -> Result<()> {
        let var_ok = |v: &str| matches!(v, "HOST" | "HOSTNAME" | "PORT" | "NITRO_HOST" | "NITRO_PORT");
        if !valid_entry(&self.entry) || !var_ok(&self.host_var) || !var_ok(&self.port_var) {
            return Err(NodeError::new(NodeErrorCode::InvalidInput));
        }
        Ok(())
    }
}

pub fn unit_name(site: &str) -> String {
    format!("somnia-{site}.service")
}
pub fn unit_path(site: &str) -> String {
    format!("/srv/somnia/{site}/{}", unit_name(site))
}
pub fn log_path(site: &str) -> String {
    format!("/srv/somnia/{site}/shared/app.log")
}

pub fn render_unit(site: &str, node_path: &str, launch: &NodeLaunch, port: u16, domain: &str) -> Result<String> {
    launch.validate()?;
    if !valid_id(site) || !valid_node_path(node_path) || !(PORT_MIN..=PORT_MAX).contains(&port) || !valid_domain(domain) {
        return Err(NodeError::new(NodeErrorCode::InvalidInput));
    }
    let origin = if launch.wants_origin { format!("Environment=ORIGIN=https://{domain}\n") } else { String::new() };
    // The env file comes first so the Environment= lines below always win over it.
    Ok(format!(
        "[Unit]\nDescription=Somnia app {site}\nAfter=network.target\nStartLimitIntervalSec=60\nStartLimitBurst=5\n\n\
[Service]\nType=simple\nWorkingDirectory=/srv/somnia/{site}/current\nEnvironmentFile=-/srv/somnia/{site}/shared/.env\n\
Environment=NODE_ENV=production\nEnvironment={hv}=127.0.0.1\nEnvironment={pv}={port}\n{origin}\
ExecStart={node_path} /srv/somnia/{site}/current/{entry}\nRestart=on-failure\nRestartSec=2\nNoNewPrivileges=true\n\
StandardOutput=append:{log}\nStandardError=inherit\n\n[Install]\nWantedBy=default.target\n",
        hv = launch.host_var,
        pv = launch.port_var,
        entry = launch.entry,
        log = log_path(site),
    ))
}

pub fn render_caddyfile(domain: &str, port: u16) -> Result<String> {
    if !valid_domain(domain) || !(PORT_MIN..=PORT_MAX).contains(&port) {
        return Err(NodeError::new(NodeErrorCode::InvalidInput));
    }
    let names = if domain.split('.').count() == 2 { format!("{domain}, www.{domain}") } else { domain.to_string() };
    Ok(format!(
        "{names} {{\n    encode zstd gzip\n    header {{\n        Strict-Transport-Security \"max-age=31536000\"\n        X-Content-Type-Options nosniff\n    }}\n    reverse_proxy 127.0.0.1:{port}\n    handle_errors {{\n        respond \"The app is restarting. Try again in a moment.\" 503\n    }}\n}}\n"
    ))
}

const HEALTH_SCRIPT: &str = "const http=require('http');\
const req=http.get({host:'127.0.0.1',port:Number(process.env.SOMNIA_HC_PORT),path:process.env.SOMNIA_HC_PATH||'/',timeout:4000},res=>{res.resume();console.log('SOMNIA_HEALTH '+res.statusCode);process.exit(0)});\
req.on('timeout',()=>{req.destroy();console.log('SOMNIA_HEALTH timeout');process.exit(0)});\
req.on('error',()=>{console.log('SOMNIA_HEALTH down');process.exit(0)});\n";

fn user_systemctl(args: &str) -> String {
    format!("export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus; systemctl --user {args}")
}
fn marker<'a>(out: &'a ExecOutput, key: &str) -> Option<&'a str> {
    out.markers
        .iter()
        .map(String::as_str)
        .chain(out.stdout.lines())
        .find_map(|l| {
            let l = l.trim_end();
            if l == key {
                Some("")
            } else {
                l.strip_prefix(key).and_then(|r| r.strip_prefix(' '))
            }
        })
        .map(str::trim)
}
fn tail(text: &str, n: usize, redactor: &Redactor) -> Vec<String> {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let from = lines.len().saturating_sub(n);
    lines[from..]
        .iter()
        .map(|l| redactor.redact(&l.chars().take(300).collect::<String>()))
        .collect()
}

// ---------- state on the server ----------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRecord {
    pub release: String,
    pub status: String,
    pub at: u64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeState {
    pub version: u32,
    pub port: u16,
    pub node_path: String,
    pub node_version: String,
    pub last_health: Option<HealthRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerInfo {
    pub node_path: String,
    pub node_version: String,
    pub npm: bool,
}

#[derive(Debug, Clone)]
pub struct NodeOptions {
    pub keep_releases: usize,
    pub health_path: String,
    pub health_attempts: u32,
    pub health_interval: Duration,
}
impl Default for NodeOptions {
    fn default() -> Self {
        Self { keep_releases: 5, health_path: "/".into(), health_attempts: 20, health_interval: Duration::from_secs(1) }
    }
}

pub struct PublishRequest {
    pub manifest: DeployArtifactManifest,
    pub files: BTreeMap<String, Vec<u8>>,
    pub launch: NodeLaunch,
    pub domain: String,
    pub now: SystemTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeOutcome {
    pub release_id: String,
    pub port: u16,
    pub node_version: String,
    pub rolled_back: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeStatus {
    pub active: String,
    pub restarts: u32,
    pub port: Option<u16>,
    pub current: Option<String>,
    pub node_version: Option<String>,
    pub last_health: Option<HealthRecord>,
}

pub struct NodeDeployer<'a, R: NodeRemote> {
    remote: &'a mut R,
    site: String,
    layout: ReleaseLayout,
    opts: NodeOptions,
}

impl<'a, R: NodeRemote> NodeDeployer<'a, R> {
    pub fn new(remote: &'a mut R, site: &str, opts: NodeOptions) -> Result<Self> {
        if !valid_health_path(&opts.health_path) {
            return Err(NodeError::new(NodeErrorCode::InvalidInput));
        }
        Ok(Self { layout: ReleaseLayout::new(site)?, site: site.to_string(), remote, opts })
    }
    fn root(&self) -> String {
        self.layout.root().to_string()
    }
    async fn run(&mut self, command: &str, stdin: Option<&[u8]>) -> Result<ExecOutput> {
        Ok(self.remote.exec(command, stdin).await?)
    }

    // ----- server checks -----

    /// Read-only: is Node there, and does it fit the project's `engines.node`?
    pub async fn check_server(&mut self, range: Option<&str>) -> Result<ServerInfo> {
        if !self.remote.exists(&self.root()).await? {
            return Err(NodeError::new(NodeErrorCode::NotPrepared));
        }
        let out = self
            .run("p=$(command -v node || true); printf 'SOMNIA_NODE_PATH %s\\n' \"$p\"; if [ -n \"$p\" ]; then printf 'SOMNIA_NODE_VERSION %s\\n' \"$(\"$p\" --version)\"; fi; if command -v npm >/dev/null 2>&1; then printf 'SOMNIA_NPM yes\\n'; fi", None)
            .await?;
        let path = marker(&out, "SOMNIA_NODE_PATH").unwrap_or("");
        let version = marker(&out, "SOMNIA_NODE_VERSION").unwrap_or("");
        if path.is_empty() || version.is_empty() {
            return Err(NodeError::new(NodeErrorCode::NodeMissing));
        }
        if !valid_node_path(path) || parse_parts(version).is_none_or(|p| p.is_empty()) {
            return Err(NodeError::new(NodeErrorCode::InvalidInput));
        }
        if let Some(range) = range {
            if !node_satisfies(version, range) {
                return Err(NodeError::new(NodeErrorCode::NodeTooOld));
            }
        }
        Ok(ServerInfo { node_path: path.into(), node_version: version.into(), npm: marker(&out, "SOMNIA_NPM").is_some() })
    }

    async fn load_state(&mut self) -> Result<Option<NodeState>> {
        let path = format!("{}/.somnia/state.json", self.root());
        if !self.remote.exists(&path).await? {
            return Ok(None);
        }
        let raw = self.remote.read(&path).await?;
        Ok(serde_json::from_slice(&raw).ok().filter(|s: &NodeState| s.version == 1 && (PORT_MIN..=PORT_MAX).contains(&s.port)))
    }
    async fn save_state(&mut self, state: &NodeState) -> Result<()> {
        let dir = format!("{}/.somnia", self.root());
        self.remote.mkdir(&dir).await?;
        let tmp = format!("{dir}/state.json.new");
        self.remote.write(&tmp, &serde_json::to_vec(state).map_err(|_| NodeError::new(NodeErrorCode::InvalidInput))?, 0o644).await?;
        self.remote.rename(&tmp, &format!("{dir}/state.json")).await?;
        Ok(())
    }

    /// First free port in 20000-29999, starting from a spot derived from the site id. Ports of
    /// other Somnia sites (even stopped ones) and anything listening on the machine are skipped.
    async fn pick_port(&mut self) -> Result<u16> {
        let mut taken: BTreeSet<u16> = BTreeSet::new();
        for other in self.remote.list("/srv/somnia").await.unwrap_or_default() {
            if other == self.site || !valid_id(&other) {
                continue;
            }
            let p = format!("/srv/somnia/{other}/.somnia/state.json");
            if let Ok(true) = self.remote.exists(&p).await {
                if let Ok(raw) = self.remote.read(&p).await {
                    if let Ok(s) = serde_json::from_slice::<NodeState>(&raw) {
                        taken.insert(s.port);
                    }
                }
            }
        }
        let out = self.run("ss -H -ltn 2>/dev/null || true", None).await?;
        for line in out.stdout.lines() {
            if let Some(port) = line.split_whitespace().nth(3).and_then(|a| a.rsplit(':').next()).and_then(|p| p.parse::<u16>().ok()) {
                taken.insert(port);
            }
        }
        let seed = u32::from_be_bytes(super::manifest::sha256(self.site.as_bytes())[..8].as_bytes()[..4].try_into().unwrap_or([0; 4]));
        let span = u32::from(PORT_MAX - PORT_MIN) + 1;
        (0..span)
            .map(|i| PORT_MIN + ((seed % span + i) % span) as u16)
            .find(|p| !taken.contains(p))
            .ok_or_else(|| NodeError::new(NodeErrorCode::PortUnavailable))
    }

    // ----- app settings -----

    async fn read_env(&mut self) -> Result<EnvMap> {
        let path = format!("{}/shared/.env", self.root());
        if !self.remote.exists(&path).await? {
            return Ok(EnvMap::new());
        }
        let raw = Zeroizing::new(self.remote.read(&path).await?);
        Ok(node_env::parse(&String::from_utf8_lossy(&raw)))
    }
    /// Key names only. A value is never read back to the caller.
    pub async fn env_keys(&mut self) -> Result<Vec<String>> {
        Ok(self.read_env().await?.keys().cloned().collect())
    }
    /// Validate everything first, then replace `shared/.env` atomically with mode 0600.
    pub async fn env_apply(&mut self, set: Vec<(String, Zeroizing<String>)>, remove: &[String]) -> Result<Vec<String>> {
        let merged = node_env::apply(self.read_env().await?, set, remove)?;
        let bytes = node_env::render(&merged)?;
        let dir = format!("{}/shared", self.root());
        self.remote.mkdir(&dir).await?;
        let tmp = format!("{dir}/.env.new");
        self.remote.write(&tmp, &bytes, 0o600).await?;
        self.remote.rename(&tmp, &format!("{dir}/.env")).await?;
        Ok(merged.keys().cloned().collect())
    }
    async fn redactor(&mut self) -> Redactor {
        let values = self.read_env().await.map(|m| node_env::secret_values(&m)).unwrap_or_default();
        Redactor::new(values)
    }
    /// Last lines of the app log, redacted with the app's own settings.
    pub async fn log_tail(&mut self, lines: usize) -> Result<Vec<String>> {
        let lines = lines.clamp(1, 200);
        let out = self.run(&format!("tail -n {lines} '{}' 2>/dev/null; true", log_path(&self.site)), None).await?;
        let r = self.redactor().await;
        Ok(tail(&out.stdout, lines, &r))
    }

    // ----- service control -----

    async fn service_state(&mut self) -> Result<(String, u32)> {
        let out = self.run(&user_systemctl(&format!("show {} -p ActiveState -p NRestarts", unit_name(&self.site))), None).await?;
        let get = |k: &str| out.stdout.lines().find_map(|l| l.strip_prefix(k).and_then(|r| r.strip_prefix('='))).map(str::trim);
        Ok((get("ActiveState").unwrap_or("unknown").to_string(), get("NRestarts").and_then(|v| v.parse().ok()).unwrap_or(0)))
    }
    async fn rotate_log(&mut self) -> Result<()> {
        let f = log_path(&self.site);
        self.run(&format!("f='{f}'; if [ -f \"$f\" ] && [ \"$(wc -c < \"$f\")\" -gt {LOG_ROTATE_BYTES} ]; then mv -f \"$f\" \"$f.1\"; fi; true"), None).await?;
        Ok(())
    }
    async fn restart(&mut self) -> Result<()> {
        self.rotate_log().await?;
        let out = self.run(&format!("{} && {} && printf 'SOMNIA_RESTARTED\\n'", user_systemctl("daemon-reload"), user_systemctl(&format!("restart {}", unit_name(&self.site)))), None).await?;
        if !out.success() || marker(&out, "SOMNIA_RESTARTED").is_none() {
            return Err(NodeError::with_log(NodeErrorCode::UnitFailed, self.log_tail(20).await.unwrap_or_default()));
        }
        Ok(())
    }
    /// Answer on the loopback port within the attempt budget. A crashed unit ends the wait early.
    async fn healthy(&mut self, node_path: &str, port: u16) -> Result<String> {
        let mut last = "down".to_string();
        for attempt in 0..self.opts.health_attempts.max(1) {
            if attempt > 0 && !self.opts.health_interval.is_zero() {
                tokio::time::sleep(self.opts.health_interval).await;
            }
            let (active, _) = self.service_state().await?;
            if active == "failed" {
                return Ok("crashed".into());
            }
            let cmd = format!("SOMNIA_HC_PORT={port} SOMNIA_HC_PATH='{}' '{node_path}' -", self.opts.health_path);
            let out = self.run(&cmd, Some(HEALTH_SCRIPT.as_bytes())).await?;
            last = marker(&out, "SOMNIA_HEALTH").unwrap_or("down").to_string();
            if last.parse::<u16>().is_ok_and(|c| (200..400).contains(&c)) {
                return Ok(last);
            }
        }
        Ok(last)
    }
    fn ok_status(s: &str) -> bool {
        s.parse::<u16>().is_ok_and(|c| (200..400).contains(&c))
    }

    pub async fn status(&mut self) -> Result<NodeStatus> {
        let state = self.load_state().await?;
        let current = self.layout.current_release(self.remote).await?;
        let (active, restarts) = self.service_state().await.unwrap_or(("unknown".into(), 0));
        Ok(NodeStatus {
            active,
            restarts,
            port: state.as_ref().map(|s| s.port),
            current,
            node_version: state.as_ref().map(|s| s.node_version.clone()),
            last_health: state.and_then(|s| s.last_health),
        })
    }

    // ----- publish and rollback -----

    async fn write_unit(&mut self, info: &ServerInfo, launch: &NodeLaunch, port: u16, domain: &str) -> Result<()> {
        let unit = render_unit(&self.site, &info.node_path, launch, port, domain)?;
        let path = unit_path(&self.site);
        let same = self.remote.exists(&path).await? && self.remote.read(&path).await? == unit.as_bytes();
        if !same {
            self.remote.write(&path, unit.as_bytes(), 0o644).await?;
        }
        let out = self.run(&format!("{} && printf 'SOMNIA_ENABLED\\n'", user_systemctl(&format!("enable '{path}'"))), None).await?;
        if !out.success() || marker(&out, "SOMNIA_ENABLED").is_none() {
            return Err(NodeError::new(NodeErrorCode::UnitFailed));
        }
        Ok(())
    }
    async fn ensure_shared(&mut self) -> Result<()> {
        let shared = format!("{}/shared", self.root());
        self.remote.mkdir(&shared).await?;
        let env = format!("{shared}/.env");
        if !self.remote.exists(&env).await? {
            self.remote.write(&env, b"", 0o600).await?;
        }
        Ok(())
    }
    async fn read_launch(&mut self, id: &str) -> Result<NodeLaunch> {
        let raw = self.remote.read(&format!("{}/.somnia-launch.json", self.layout.release(id)?)).await?;
        let l: NodeLaunch = serde_json::from_slice(&raw).map_err(|_| NodeError::new(NodeErrorCode::ReleaseNotReady))?;
        l.validate()?;
        Ok(l)
    }

    /// Put the Caddy file in place, check it with Caddy itself, then reload. A file Caddy rejects is
    /// replaced by the previous one, so a bad config never stays on disk.
    async fn apply_proxy(&mut self, domain: &str, port: u16) -> Result<()> {
        let file = render_caddyfile(domain, port)?;
        let path = format!("{}/Caddyfile", self.root());
        let before = if self.remote.exists(&path).await? { Some(self.remote.read(&path).await?) } else { None };
        if before.as_deref() == Some(file.as_bytes()) {
            return Ok(());
        }
        self.remote.write(&path, file.as_bytes(), 0o644).await?;
        let out = self
            .run("caddy validate --config /etc/somnia/Caddyfile --adapter caddyfile >/dev/null 2>&1 && printf 'SOMNIA_CADDY_OK\\n'", None)
            .await?;
        if marker(&out, "SOMNIA_CADDY_OK").is_none() {
            match before {
                Some(old) => self.remote.write(&path, &old, 0o644).await?,
                None => self.remote.remove_tree(&path).await?,
            }
            return Err(NodeError::new(NodeErrorCode::CaddyInvalid));
        }
        let out = self.run(&format!("{CADDY_RELOAD_COMMAND} >/dev/null 2>&1 && printf 'SOMNIA_CADDY_RELOADED\\n'"), None).await?;
        if marker(&out, "SOMNIA_CADDY_RELOADED").is_none() {
            return Err(NodeError::new(NodeErrorCode::CaddyInvalid));
        }
        Ok(())
    }

    pub async fn publish(&mut self, req: PublishRequest, progress: &dyn Fn(&str)) -> Result<NodeOutcome> {
        let PublishRequest { manifest, files, launch, domain, now } = req;
        manifest.validate()?;
        launch.validate()?;
        if manifest.kind != DeployArtifactKind::Node || manifest.entry.as_deref() != Some(launch.entry.as_str()) || !valid_domain(&domain) {
            return Err(NodeError::new(NodeErrorCode::InvalidInput));
        }
        progress("preflight");
        let range = manifest.engines.as_ref().and_then(|e| e.get("node")).cloned();
        let info = self.check_server(range.as_deref()).await?;
        if launch.install && !info.npm {
            return Err(NodeError::new(NodeErrorCode::NodeMissing));
        }
        let port = match self.load_state().await? {
            Some(s) => s.port,
            None => self.pick_port().await?,
        };
        self.ensure_shared().await?;
        self.layout.cleanup_partials(self.remote).await?;

        let id = release_id(now, &manifest)?;
        progress("upload");
        self.layout.stage(self.remote, &id, &manifest, &files).await?;
        let dir = self.layout.release(&id)?;
        self.remote
            .write(&format!("{dir}/.somnia-launch.json"), &serde_json::to_vec(&launch).map_err(|_| NodeError::new(NodeErrorCode::InvalidInput))?, 0o644)
            .await?;
        if launch.install {
            progress("install");
            let out = self
                .run(&format!("cd '{dir}' && HOME=/var/lib/somnia npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error 2>&1 && printf 'SOMNIA_INSTALL_OK\\n'"), None)
                .await;
            let ok = matches!(&out, Ok(o) if marker(o, "SOMNIA_INSTALL_OK").is_some());
            if !ok {
                let r = self.redactor().await;
                let log = out.map(|o| tail(&o.stdout, 20, &r)).unwrap_or_default();
                // Nothing was switched. The half-installed release must not stay as a rollback target.
                let _ = self.remote.remove_tree(&dir).await;
                return Err(NodeError::with_log(NodeErrorCode::InstallFailed, log));
            }
        }
        self.remote.write(&format!("{dir}/.somnia-ready"), b"1\n", 0o644).await?;

        progress("configure");
        self.write_unit(&info, &launch, port, &domain).await?;
        let state = NodeState {
            version: 1,
            port,
            node_path: info.node_path.clone(),
            node_version: info.node_version.clone(),
            last_health: None,
        };
        let previous = self.layout.current_release(self.remote).await?;
        progress("switch");
        self.layout.activate(self.remote, &id).await?;
        progress("restart");
        let verdict = match self.restart().await {
            Ok(()) => {
                progress("health");
                self.healthy(&info.node_path, port).await?
            }
            Err(e) if e.code == NodeErrorCode::UnitFailed => "crashed".to_string(),
            Err(e) => return Err(e),
        };
        if !Self::ok_status(&verdict) {
            let log = {
                let tail_lines = self.log_tail(30).await.unwrap_or_default();
                tail_lines
            };
            return Err(self.fail_back(previous, &id, &info, port, &domain, log).await);
        }
        progress("proxy");
        let proxied = self.apply_proxy(&domain, port).await;
        let mut state = state;
        state.last_health = Some(HealthRecord { release: id.clone(), status: verdict, at: now.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) });
        self.save_state(&state).await?;
        proxied?;
        progress("cleanup");
        let _ = self.layout.prune(self.remote, self.opts.keep_releases.max(2)).await;
        Ok(NodeOutcome { release_id: id, port, node_version: info.node_version, rolled_back: false })
    }

    /// New version failed: point `current` back, restart, and report honestly whether that worked.
    async fn fail_back(&mut self, previous: Option<String>, failed: &str, info: &ServerInfo, port: u16, domain: &str, log: Vec<String>) -> NodeError {
        let Some(prev) = previous else {
            let _ = self.run(&user_systemctl(&format!("stop {}", unit_name(&self.site))), None).await;
            if let Ok(dir) = self.layout.release(failed) {
                let _ = self.remote.remove_tree(&dir).await;
            }
            return NodeError::with_log(NodeErrorCode::HealthFailed, log);
        };
        let restored = async {
            let launch = self.read_launch(&prev).await?;
            self.write_unit(info, &launch, port, domain).await?;
            self.layout.activate(self.remote, &prev).await?;
            self.restart().await?;
            let status = self.healthy(&info.node_path, port).await?;
            Ok::<bool, NodeError>(Self::ok_status(&status))
        }
        .await;
        match restored {
            Ok(true) => {
                if let Ok(dir) = self.layout.release(failed) {
                    let _ = self.remote.remove_tree(&dir).await;
                }
                NodeError::with_log(NodeErrorCode::HealthFailedRolledBack, log)
            }
            _ => NodeError::with_log(NodeErrorCode::HealthFailedRollbackFailed, log),
        }
    }

    /// Switch to a kept release. Refuses releases that never finished installing.
    pub async fn rollback(&mut self, id: &str, domain: &str, progress: &dyn Fn(&str)) -> Result<NodeOutcome> {
        progress("preflight");
        let dir = self.layout.release(id)?;
        if !self.remote.exists(&dir).await? {
            return Err(NodeError::new(NodeErrorCode::NoSuchRelease));
        }
        if !self.remote.exists(&format!("{dir}/.somnia-ready")).await? {
            return Err(NodeError::new(NodeErrorCode::ReleaseNotReady));
        }
        let manifest = self.layout.read_manifest(self.remote, id).await?;
        let launch = self.read_launch(id).await?;
        let range = manifest.engines.as_ref().and_then(|e| e.get("node")).cloned();
        let info = self.check_server(range.as_deref()).await?;
        let state = self.load_state().await?.ok_or_else(|| NodeError::new(NodeErrorCode::NotPrepared))?;
        let previous = self.layout.current_release(self.remote).await?;
        progress("configure");
        self.write_unit(&info, &launch, state.port, domain).await?;
        progress("switch");
        self.layout.activate(self.remote, id).await?;
        progress("restart");
        let verdict = match self.restart().await {
            Ok(()) => {
                progress("health");
                self.healthy(&info.node_path, state.port).await?
            }
            Err(e) if e.code == NodeErrorCode::UnitFailed => "crashed".into(),
            Err(e) => return Err(e),
        };
        if !Self::ok_status(&verdict) {
            let log = self.log_tail(30).await.unwrap_or_default();
            let Some(prev) = previous.filter(|p| p != id) else {
                return Err(NodeError::with_log(NodeErrorCode::HealthFailed, log));
            };
            let restored = async {
                let launch = self.read_launch(&prev).await?;
                self.write_unit(&info, &launch, state.port, domain).await?;
                self.layout.activate(self.remote, &prev).await?;
                self.restart().await?;
                let s = self.healthy(&info.node_path, state.port).await?;
                Ok::<bool, NodeError>(Self::ok_status(&s))
            }
            .await;
            let code = if matches!(restored, Ok(true)) { NodeErrorCode::HealthFailedRolledBack } else { NodeErrorCode::HealthFailedRollbackFailed };
            return Err(NodeError::with_log(code, log));
        }
        let mut state = state;
        state.last_health = Some(HealthRecord { release: id.into(), status: verdict, at: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) });
        self.save_state(&state).await?;
        Ok(NodeOutcome { release_id: id.into(), port: state.port, node_version: info.node_version, rolled_back: true })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::deploy::{
        manifest::{sha256, DeployArtifactFile},
        transport::{MockSshTransport, RemoteEntry},
    };

    const SITE: &str = "shop";
    const DOMAIN: &str = "example.com";

    /// A server in a box: SFTP side is the in-process mock, exec side answers the fixed command
    /// templates the way a Debian host with systemd and Caddy would.
    pub(crate) struct Fake {
        pub(crate) t: MockSshTransport,
        pub(crate) node: Option<(&'static str, &'static str)>,
        pub(crate) npm: bool,
        pub(crate) install_ok: bool,
        pub(crate) caddy_valid: bool,
        pub(crate) listening: Vec<u16>,
        pub(crate) app_up: bool,
        pub(crate) active: &'static str,
        pub(crate) log: String,
        pub(crate) commands: Vec<String>,
        pub(crate) reloads: usize,
    }
    impl Fake {
        pub(crate) fn new() -> Self {
            let mut t = MockSshTransport::default();
            t.entries.insert("/srv".into(), RemoteEntry::Directory);
            t.entries.insert("/srv/somnia".into(), RemoteEntry::Directory);
            for d in ["", "/releases", "/shared"] {
                t.entries.insert(format!("/srv/somnia/{SITE}{d}"), RemoteEntry::Directory);
            }
            Self { t, node: Some(("/usr/bin/node", "v22.11.0")), npm: true, install_ok: true, caddy_valid: true, listening: vec![22, 80, 443], app_up: false, active: "inactive", log: String::new(), commands: vec![], reloads: 0 }
        }
        fn entry_of_current(&self) -> Option<Vec<u8>> {
            let Some(RemoteEntry::Symlink(target)) = self.t.entries.get(&format!("/srv/somnia/{SITE}/current")) else { return None };
            match self.t.entries.get(&format!("/srv/somnia/{SITE}/{target}/server.js")) {
                Some(RemoteEntry::File { bytes, .. }) => Some(bytes.clone()),
                _ => None,
            }
        }
        fn file(&self, rel: &str) -> Option<(String, u32)> {
            match self.t.entries.get(&format!("/srv/somnia/{SITE}/{rel}")) {
                Some(RemoteEntry::File { bytes, mode }) => Some((String::from_utf8_lossy(bytes).into(), *mode)),
                _ => None,
            }
        }
        fn current(&self) -> Option<String> {
            match self.t.entries.get(&format!("/srv/somnia/{SITE}/current")) {
                Some(RemoteEntry::Symlink(t)) => Some(t.clone()),
                _ => None,
            }
        }
    }
    fn out(status: u32, stdout: &str) -> ExecOutput {
        ExecOutput { status: Some(status), stdout: stdout.into(), stderr: String::new(), markers: stdout.lines().filter(|l| l.starts_with("SOMNIA_")).map(String::from).collect(), truncated: false }
    }
    impl SshExec for Fake {
        async fn exec(&mut self, command: &str, stdin: Option<&[u8]>) -> super::super::Result<ExecOutput> {
            self.commands.push(command.to_string());
            let c = command;
            Ok(if c.contains("command -v node") {
                match self.node {
                    Some((p, v)) => out(0, &format!("SOMNIA_NODE_PATH {p}\nSOMNIA_NODE_VERSION {v}\n{}", if self.npm { "SOMNIA_NPM yes\n" } else { "" })),
                    None => out(0, "SOMNIA_NODE_PATH \n"),
                }
            } else if c.starts_with("ss -H") {
                out(0, &self.listening.iter().map(|p| format!("LISTEN 0 511 127.0.0.1:{p} 0.0.0.0:*\n")).collect::<String>())
            } else if c.contains("npm ci") {
                if self.install_ok { out(0, "added 10 packages\nSOMNIA_INSTALL_OK\n") } else { out(1, "npm ERR! registry token=hunter2hunter2 failed\nnpm ERR! code E404\n") }
            } else if c.contains(" show somnia-") {
                out(0, &format!("ActiveState={}\nNRestarts=0\n", self.active))
            } else if c.contains(" enable '") {
                out(0, "SOMNIA_ENABLED\n")
            } else if c.contains(" restart somnia-") {
                let broken = self.entry_of_current().is_some_and(|b| String::from_utf8_lossy(&b).contains("BROKEN"));
                self.app_up = !broken;
                self.active = if broken { "failed" } else { "active" };
                out(0, "SOMNIA_RESTARTED\n")
            } else if c.contains(" stop somnia-") {
                self.app_up = false;
                self.active = "inactive";
                out(0, "")
            } else if c.contains("SOMNIA_HC_PORT") {
                assert!(String::from_utf8_lossy(stdin.unwrap()).contains("SOMNIA_HEALTH"));
                out(0, if self.app_up { "SOMNIA_HEALTH 200\n" } else { "SOMNIA_HEALTH down\n" })
            } else if c.starts_with("tail -n") {
                out(0, &self.log)
            } else if c.contains("caddy validate") {
                if self.caddy_valid { out(0, "SOMNIA_CADDY_OK\n") } else { out(1, "") }
            } else if c.contains("caddy reload") {
                self.reloads += 1;
                out(0, "SOMNIA_CADDY_RELOADED\n")
            } else if c.contains("wc -c") {
                out(0, "")
            } else {
                panic!("unexpected command: {c}")
            })
        }
    }
    macro_rules! delegate {
        ($($name:ident($($arg:ident: $ty:ty),*) -> $ret:ty;)*) => {$(
            async fn $name(&mut self, $($arg: $ty),*) -> super::super::Result<$ret> { self.t.$name($($arg),*).await }
        )*};
    }
    impl SshTransport for Fake {
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

    fn launch(install: bool) -> NodeLaunch {
        NodeLaunch { entry: "server.js".into(), install, host_var: "HOSTNAME".into(), port_var: "PORT".into(), wants_origin: false }
    }
    pub(crate) fn request(version: &str, secs: u64, install: bool, engines: Option<&str>) -> PublishRequest {
        let server = format!("// {version}\nrequire('http').createServer().listen(process.env.PORT);\n");
        let mut files = BTreeMap::new();
        files.insert("server.js".to_string(), server.into_bytes());
        files.insert("package.json".to_string(), b"{\"name\":\"shop\"}".to_vec());
        if install {
            files.insert("package-lock.json".to_string(), b"{\"lockfileVersion\":3}".to_vec());
        }
        let list = files.iter().map(|(p, b)| DeployArtifactFile { path: p.clone(), sha256: sha256(b), size: b.len() as u64, mode: 0o644 }).collect();
        let manifest = DeployArtifactManifest {
            kind: DeployArtifactKind::Node,
            files: list,
            entry: Some("server.js".into()),
            engines: engines.map(|e| BTreeMap::from([("node".to_string(), e.to_string())])),
            port: None,
            build_id: format!("build-{version}").to_lowercase(),
        };
        PublishRequest { manifest, files, launch: launch(install), domain: DOMAIN.into(), now: UNIX_EPOCH + Duration::from_secs(secs) }
    }
    fn fast() -> NodeOptions {
        NodeOptions { health_attempts: 2, health_interval: Duration::ZERO, ..Default::default() }
    }
    fn noop(_: &str) {}
    async fn publish(f: &mut Fake, req: PublishRequest) -> Result<NodeOutcome> {
        NodeDeployer::new(f, SITE, fast()).unwrap().publish(req, &noop).await
    }

    #[tokio::test]
    async fn first_publish_installs_unit_proxy_state_and_goes_live() {
        let mut f = Fake::new();
        let steps = std::cell::RefCell::new(Vec::new());
        let outcome = NodeDeployer::new(&mut f, SITE, fast()).unwrap().publish(request("v1", 1_000, true, Some(">=20")), &|s| steps.borrow_mut().push(s.to_string())).await.unwrap();
        assert_eq!(steps.into_inner(), ["preflight", "upload", "install", "configure", "switch", "restart", "health", "proxy", "cleanup"]);
        assert!((PORT_MIN..=PORT_MAX).contains(&outcome.port));
        assert!(!outcome.rolled_back);
        assert_eq!(f.current().unwrap(), format!("releases/{}", outcome.release_id));
        let (unit, _) = f.file(&unit_name(SITE)).unwrap();
        assert!(unit.contains(&format!("Environment=PORT={}", outcome.port)) && unit.contains("ExecStart=/usr/bin/node /srv/somnia/shop/current/server.js"));
        assert!(unit.find("EnvironmentFile=").unwrap() < unit.find("Environment=PORT").unwrap(), "fixed variables must come after the env file");
        let (caddy, _) = f.file("Caddyfile").unwrap();
        assert!(caddy.contains(&format!("reverse_proxy 127.0.0.1:{}", outcome.port)) && caddy.contains("example.com, www.example.com"));
        let (env, mode) = f.file("shared/.env").unwrap();
        assert_eq!((env.as_str(), mode), ("", 0o600));
        let state: NodeState = serde_json::from_str(&f.file(".somnia/state.json").unwrap().0).unwrap();
        assert_eq!((state.port, state.last_health.unwrap().status.as_str()), (outcome.port, "200"));
        assert_eq!(f.reloads, 1);
        assert!(f.file(&format!("releases/{}/.somnia-ready", outcome.release_id)).is_some());
        let install = f.commands.iter().find(|c| c.contains("npm ci")).unwrap();
        assert!(install.contains("--omit=dev") && install.contains("--ignore-scripts"));
    }

    #[tokio::test]
    async fn broken_update_goes_back_automatically_and_hides_secrets() {
        let mut f = Fake::new();
        let first = publish(&mut f, request("v1", 1_000, false, None)).await.unwrap();
        NodeDeployer::new(&mut f, SITE, fast()).unwrap().env_apply(vec![("DB_URL".into(), Zeroizing::new("postgres://u:p4ssw0rd-xyz@db/app".into()))], &[]).await.unwrap();
        f.log = "boot ok\nconnecting postgres://u:p4ssw0rd-xyz@db/app\ncrash: TypeError\n".into();
        let err = publish(&mut f, request("BROKEN", 2_000, false, None)).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::HealthFailedRolledBack);
        assert!(!err.log_tail.is_empty() && err.log_tail.iter().all(|l| !l.contains("p4ssw0rd-xyz")), "{:?}", err.log_tail);
        assert_eq!(f.current().unwrap(), format!("releases/{}", first.release_id));
        assert!(f.app_up, "the previous version runs again");
        let releases = f.t.list(&format!("/srv/somnia/{SITE}/releases")).await.unwrap();
        assert_eq!(releases, vec![first.release_id.clone()], "the failed release is not kept as a rollback target");
        let state: NodeState = serde_json::from_str(&f.file(".somnia/state.json").unwrap().0).unwrap();
        assert_eq!(state.last_health.unwrap().release, first.release_id);
        assert_eq!(f.reloads, 1, "the proxy is only touched after a healthy start");
    }

    #[tokio::test]
    async fn failed_first_publish_stops_the_service() {
        let mut f = Fake::new();
        let err = publish(&mut f, request("BROKEN", 1_000, false, None)).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::HealthFailed);
        assert!(!f.app_up);
        assert!(f.commands.iter().any(|c| c.contains(" stop somnia-shop.service")));
        assert_eq!(f.reloads, 0);
    }

    #[tokio::test]
    async fn install_failure_changes_nothing_and_redacts_output() {
        let mut f = Fake::new();
        let first = publish(&mut f, request("v1", 1_000, true, None)).await.unwrap();
        f.install_ok = false;
        let err = publish(&mut f, request("v2", 2_000, true, None)).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::InstallFailed);
        assert!(err.log_tail.iter().any(|l| l.contains("E404")));
        assert!(err.log_tail.iter().all(|l| !l.contains("hunter2hunter2")), "{:?}", err.log_tail);
        assert_eq!(f.current().unwrap(), format!("releases/{}", first.release_id));
        assert_eq!(f.t.list(&format!("/srv/somnia/{SITE}/releases")).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn server_requirements_are_checked_before_anything_is_uploaded() {
        let mut f = Fake::new();
        f.node = None;
        assert_eq!(publish(&mut f, request("v1", 1, false, None)).await.unwrap_err().code, NodeErrorCode::NodeMissing);
        f.node = Some(("/usr/bin/node", "v18.19.0"));
        assert_eq!(publish(&mut f, request("v1", 1, false, Some(">=20"))).await.unwrap_err().code, NodeErrorCode::NodeTooOld);
        f.node = Some(("/usr/bin/node", "v22.1.0"));
        f.npm = false;
        assert_eq!(publish(&mut f, request("v1", 1, true, None)).await.unwrap_err().code, NodeErrorCode::NodeMissing);
        assert!(f.t.operations.iter().all(|o| !matches!(*o, "write" | "rename" | "symlink")), "nothing was written");
        let mut empty = Fake { t: MockSshTransport::default(), ..Fake::new() };
        empty.t.entries.clear();
        assert_eq!(publish(&mut empty, request("v1", 1, false, None)).await.unwrap_err().code, NodeErrorCode::NotPrepared);
    }

    #[tokio::test]
    async fn rollback_switches_back_and_refuses_unfinished_releases() {
        let mut f = Fake::new();
        let one = publish(&mut f, request("v1", 1_000, false, None)).await.unwrap();
        let two = publish(&mut f, request("v2", 2_000, false, None)).await.unwrap();
        assert_eq!(f.current().unwrap(), format!("releases/{}", two.release_id));
        let back = NodeDeployer::new(&mut f, SITE, fast()).unwrap().rollback(&one.release_id, DOMAIN, &noop).await.unwrap();
        assert!(back.rolled_back);
        assert_eq!(f.current().unwrap(), format!("releases/{}", one.release_id));
        assert!(f.app_up);
        let mut d = NodeDeployer::new(&mut f, SITE, fast()).unwrap();
        assert_eq!(d.rollback("0000000000000000000-abc", DOMAIN, &noop).await.unwrap_err().code, NodeErrorCode::NoSuchRelease);
        // A release that never reached the ready marker is not a rollback target.
        let marker = format!("/srv/somnia/{SITE}/releases/{}/.somnia-ready", two.release_id);
        f.t.entries.remove(&marker);
        let err = NodeDeployer::new(&mut f, SITE, fast()).unwrap().rollback(&two.release_id, DOMAIN, &noop).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::ReleaseNotReady);
        assert_eq!(f.current().unwrap(), format!("releases/{}", one.release_id));
    }

    #[tokio::test]
    async fn rollback_to_a_release_that_no_longer_starts_restores_the_live_one() {
        let mut f = Fake::new();
        let one = publish(&mut f, request("v1", 1_000, false, None)).await.unwrap();
        let two = publish(&mut f, request("v2", 2_000, false, None)).await.unwrap();
        // The old release's start file now crashes (for example its dependency vanished).
        let path = format!("/srv/somnia/{SITE}/releases/{}/server.js", one.release_id);
        let new_bytes = b"BROKEN".to_vec();
        // Keep the manifest hash valid so only the start behaviour differs.
        f.t.entries.insert(path, RemoteEntry::File { bytes: new_bytes.clone(), mode: 0o644 });
        let mut manifest_path = format!("/srv/somnia/{SITE}/releases/{}/{}", one.release_id, super::super::manifest::MANIFEST_FILE);
        if let Some(RemoteEntry::File { bytes, .. }) = f.t.entries.get_mut(&manifest_path) {
            let mut m: DeployArtifactManifest = serde_json::from_slice(bytes).unwrap();
            for file in &mut m.files {
                if file.path == "server.js" {
                    file.sha256 = sha256(&new_bytes);
                    file.size = new_bytes.len() as u64;
                }
            }
            *bytes = serde_json::to_vec(&m).unwrap();
        }
        manifest_path.clear();
        let err = NodeDeployer::new(&mut f, SITE, fast()).unwrap().rollback(&one.release_id, DOMAIN, &noop).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::HealthFailedRolledBack);
        assert_eq!(f.current().unwrap(), format!("releases/{}", two.release_id));
        assert!(f.app_up);
    }

    #[tokio::test]
    async fn a_proxy_config_caddy_rejects_never_stays_on_disk() {
        let mut f = Fake::new();
        publish(&mut f, request("v1", 1_000, false, None)).await.unwrap();
        let (good, _) = f.file("Caddyfile").unwrap();
        f.caddy_valid = false;
        let mut r = request("v2", 2_000, false, None);
        r.domain = "other.example.org".into();
        let err = publish(&mut f, r).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::CaddyInvalid);
        assert_eq!(f.file("Caddyfile").unwrap().0, good);
        let reloads = f.reloads;
        assert_eq!(reloads, 1, "no reload for a rejected file");
    }

    #[tokio::test]
    async fn app_settings_are_private_atomic_and_never_read_back() {
        let mut f = Fake::new();
        let secret = "sk_live_9f8e7d6c5b4a";
        let keys = NodeDeployer::new(&mut f, SITE, fast())
            .unwrap()
            .env_apply(vec![("STRIPE_KEY".into(), Zeroizing::new(secret.into())), ("MODE".into(), Zeroizing::new("a \"b\"\nc".into()))], &[])
            .await
            .unwrap();
        assert_eq!(keys, ["MODE", "STRIPE_KEY"]);
        let (text, mode) = f.file("shared/.env").unwrap();
        assert_eq!(mode, 0o600);
        assert!(text.contains("STRIPE_KEY=\"sk_live_9f8e7d6c5b4a\"") && text.contains("MODE=\"a \\\"b\\\"\\nc\""));
        assert!(f.file("shared/.env.new").is_none());
        let mut d = NodeDeployer::new(&mut f, SITE, fast()).unwrap();
        assert_eq!(d.env_keys().await.unwrap(), ["MODE", "STRIPE_KEY"]);
        d.env_apply(vec![], &["MODE".into()]).await.unwrap();
        assert_eq!(d.env_keys().await.unwrap(), ["STRIPE_KEY"]);
        for bad in ["PORT", "bad key", "NODE_ENV"] {
            let e = d.env_apply(vec![(bad.into(), Zeroizing::new("x".into()))], &[]).await.unwrap_err();
            assert!(matches!(e.code, NodeErrorCode::Env(_)));
        }
        assert_eq!(d.env_keys().await.unwrap(), ["STRIPE_KEY"], "a rejected change leaves the file alone");
        assert!(f.commands.iter().all(|c| !c.contains(secret)), "values travel over SFTP only, never in a command line");
        let log_secret = format!("request used {secret} here");
        f.log = log_secret;
        let tail = NodeDeployer::new(&mut f, SITE, fast()).unwrap().log_tail(10).await.unwrap();
        assert!(tail.iter().all(|l| !l.contains(secret)), "{tail:?}");
    }

    #[tokio::test]
    async fn ports_skip_other_sites_and_listeners() {
        let mut f = Fake::new();
        let first = {
            let mut d = NodeDeployer::new(&mut f, SITE, fast()).unwrap();
            d.pick_port().await.unwrap()
        };
        f.listening.push(first);
        f.t.mkdir("/srv/somnia/blog/.somnia").await.unwrap();
        let next = {
            let mut d = NodeDeployer::new(&mut f, SITE, fast()).unwrap();
            d.pick_port().await.unwrap()
        };
        assert_ne!(first, next);
        let state = NodeState { version: 1, port: next, node_path: "/usr/bin/node".into(), node_version: "v22".into(), last_health: None };
        f.t.write("/srv/somnia/blog/.somnia/state.json", &serde_json::to_vec(&state).unwrap(), 0o644).await.unwrap();
        f.listening.clear();
        let third = {
            let mut d = NodeDeployer::new(&mut f, SITE, fast()).unwrap();
            d.pick_port().await.unwrap()
        };
        assert_ne!(third, next, "another site's port is reserved even when its app is stopped");
    }

    #[tokio::test]
    async fn an_interruption_anywhere_never_leaves_current_pointing_at_a_broken_release() {
        let mut base = Fake::new();
        let one = publish(&mut base, request("v1", 1_000, false, None)).await.unwrap();
        let mut ok = Fake { t: MockSshTransport { entries: base.t.entries.clone(), ..Default::default() }, ..Fake::new() };
        publish(&mut ok, request("v2", 2_000, false, None)).await.unwrap();
        let total = ok.t.operations.len();
        for failure in 1..=total {
            let mut f = Fake { t: MockSshTransport { entries: base.t.entries.clone(), fail_on_operation: Some(failure), ..Default::default() }, ..Fake::new() };
            f.app_up = true;
            f.active = "active";
            let r = publish(&mut f, request("v2", 2_000, false, None)).await;
            f.t.fail_on_operation = None;
            let current = f.current().unwrap();
            let id = current.strip_prefix("releases/").unwrap();
            let layout = ReleaseLayout::new(SITE).unwrap();
            let manifest = layout.read_manifest(&mut f.t, id).await.unwrap_or_else(|_| panic!("op {failure}: current {current} has no readable manifest"));
            for file in &manifest.files {
                assert_eq!(f.t.hash(&format!("{}/{}", layout.release(id).unwrap(), file.path)).await.unwrap(), file.sha256, "op {failure}");
            }
            if r.is_err() {
                assert!(id == one.release_id || f.t.exists(&format!("/srv/somnia/{SITE}/releases/{id}/.somnia-ready")).await.unwrap(), "op {failure}");
            }
        }
    }

    #[test]
    fn engines_ranges() {
        for (v, r, want) in [
            ("v22.11.0", ">=20", true),
            ("v18.19.0", ">=20", false),
            ("v20.5.1", "^20.1.0", true),
            ("v21.0.0", "^20.1.0", false),
            ("v20.0.5", "^20.1.0", false),
            ("v20.9.0", "20.x", true),
            ("v22.0.0", "20.x", false),
            ("v20.9.0", "~20.9", true),
            ("v20.10.0", "~20.9", false),
            ("v22.3.0", ">=18 <21 || >=22", true),
            ("v21.3.0", ">=18 <21 || >=22", false),
            ("v18.2.0", ">= 18.0.0", true),
            ("v20.1.0", "18 - 20", true),
            ("v21.1.0", "18 - 20", false),
            ("v22.1.0", "*", true),
            ("v22.1.0", "", true),
            ("v22.1.0", "not a range", true),
            ("v22.1.0", ">20", true),
            ("v20.9.0", ">20", false),
            ("v20.9.0", "<=20", true),
            ("v21.0.0", "<=20", false),
        ] {
            assert_eq!(node_satisfies(v, r), want, "{v} vs {r}");
        }
    }

    #[test]
    fn unit_and_proxy_reject_injection_and_stay_loopback_only() {
        let l = launch(false);
        let ok = render_unit(SITE, "/usr/bin/node", &l, 20_001, DOMAIN).unwrap();
        assert!(ok.contains("HOSTNAME=127.0.0.1") && !ok.contains("0.0.0.0") && ok.contains("NoNewPrivileges=true"));
        for bad_domain in ["a.com\nExecStartPre=/bin/sh", "a b.com", "localhost", "a.com;x", "-a.com", "1.2.3.4"] {
            assert!(render_unit(SITE, "/usr/bin/node", &l, 20_001, bad_domain).is_err(), "{bad_domain}");
            assert!(render_caddyfile(bad_domain, 20_001).is_err(), "{bad_domain}");
        }
        for bad_node in ["node", "/usr/bin/node\nX=1", "/opt/my node/bin/node", "/usr/bin//node"] {
            assert!(render_unit(SITE, bad_node, &l, 20_001, DOMAIN).is_err(), "{bad_node:?}");
        }
        for port in [0, 80, 19_999, 30_000] {
            assert!(render_unit(SITE, "/usr/bin/node", &l, port, DOMAIN).is_err());
            assert!(render_caddyfile(DOMAIN, port).is_err());
        }
        for bad_entry in ["../x.js", "/abs.js", "a b.js", "a%h.js", "", "a//b.js"] {
            let bad = NodeLaunch { entry: bad_entry.into(), ..l.clone() };
            assert!(render_unit(SITE, "/usr/bin/node", &bad, 20_001, DOMAIN).is_err(), "{bad_entry:?}");
        }
        assert!(render_unit("Bad Site", "/usr/bin/node", &l, 20_001, DOMAIN).is_err());
        let origin = render_unit(SITE, "/usr/bin/node", &NodeLaunch { wants_origin: true, ..l }, 20_001, DOMAIN).unwrap();
        assert!(origin.contains("Environment=ORIGIN=https://example.com"));
        assert_eq!(render_caddyfile("app.example.com", 20_001).unwrap().lines().next().unwrap(), "app.example.com {");
    }

    #[test]
    fn every_error_code_is_stable_and_generic() {
        let e = NodeError::with_log(NodeErrorCode::InstallFailed, vec!["x".into()]);
        assert_eq!(e.to_string(), "deploy.node.installFailed");
        assert_eq!(NodeError::from(EnvError::Reserved).to_string(), "deploy.node.env.reserved");
        assert_eq!(NodeError::from(DeployError::UntrustedHost).code, NodeErrorCode::Transport);
    }

    /// Same flow over a real SSH connection and real SFTP into a temporary directory: the
    /// confinement, hard links, atomic renames and file modes are the production ones.
    #[cfg(unix)]
    #[tokio::test]
    async fn publish_and_fail_back_over_real_ssh_and_sftp() {
        use crate::deploy::{
            host_keys::{HostKey, HostKeyStore},
            ssh::{ConnectOptions, Credential, RusshTransport, SshTarget},
            ssh_testkit::TestServer,
        };
        use std::sync::{Arc, Mutex};
        let server = TestServer::start().await;
        server.set_password("pw");
        for d in ["", "/releases", "/shared"] {
            std::fs::create_dir_all(server.path(&format!("/srv/somnia/{SITE}{d}"))).unwrap();
        }
        let app_up = Arc::new(Mutex::new(false));
        let jail = server.path("/");
        let up = app_up.clone();
        server.set_exec(move |c, _| {
            let ok = |s: &str| (0u32, s.to_string(), String::new());
            if c.contains("command -v node") {
                ok("SOMNIA_NODE_PATH /usr/bin/node\nSOMNIA_NODE_VERSION v22.1.0\nSOMNIA_NPM yes\n")
            } else if c.starts_with("ss -H") || c.contains("wc -c") || c.starts_with("tail -n") {
                ok("")
            } else if c.contains(" enable '") {
                ok("SOMNIA_ENABLED\n")
            } else if c.contains(" show somnia-") {
                ok("ActiveState=active\nNRestarts=0\n")
            } else if c.contains(" restart somnia-") {
                let link = std::fs::read_link(jail.join(format!("srv/somnia/{SITE}/current"))).unwrap();
                let body = std::fs::read_to_string(jail.join(format!("srv/somnia/{SITE}")).join(link).join("server.js")).unwrap();
                *up.lock().unwrap() = !body.contains("BROKEN");
                ok("SOMNIA_RESTARTED\n")
            } else if c.contains("SOMNIA_HC_PORT") {
                ok(if *up.lock().unwrap() { "SOMNIA_HEALTH 200\n" } else { "SOMNIA_HEALTH 502\n" })
            } else if c.contains("caddy validate") {
                ok("SOMNIA_CADDY_OK\n")
            } else if c.contains("caddy reload") {
                ok("SOMNIA_CADDY_RELOADED\n")
            } else {
                (127, String::new(), "unexpected".into())
            }
        });
        let store = Arc::new(HostKeyStore::default());
        store.trust_new("127.0.0.1", server.addr.port(), &HostKey::from_public_key(server.host_key.public_key())).unwrap();
        let pw = Zeroizing::new("pw".to_string());
        let mut t = RusshTransport::connect(&SshTarget::new("127.0.0.1", server.addr.port(), "somnia"), store, Credential::Password(&pw), ConnectOptions::default(), []).await.unwrap();
        let mut d = NodeDeployer::new(&mut t, SITE, fast()).unwrap();
        let one = d.publish(request("v1", 1_000, false, None), &noop).await.unwrap();
        d.env_apply(vec![("TOKEN".into(), Zeroizing::new("abc-123-secret".into()))], &[]).await.unwrap();
        let err = d.publish(request("BROKEN", 2_000, false, None), &noop).await.unwrap_err();
        assert_eq!(err.code, NodeErrorCode::HealthFailedRolledBack);
        let site = server.path(&format!("/srv/somnia/{SITE}"));
        assert_eq!(std::fs::read_link(site.join("current")).unwrap().to_str().unwrap(), format!("releases/{}", one.release_id));
        assert_eq!(std::fs::read_dir(site.join("releases")).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(site.join("shared/.env")).unwrap().permissions().mode() & 0o777, 0o600);
        }
        assert!(site.join("Caddyfile").is_file() && site.join(unit_name(SITE)).is_file());
        let commands = server.state.commands.lock().unwrap().clone();
        assert!(commands.iter().all(|c| !c.contains("abc-123-secret")));
    }
}
