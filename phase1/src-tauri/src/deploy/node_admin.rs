//! App settings for Node targets: env key names, env values (write-only), log tail, status and a
//! dry artifact summary. Thin layer over [`NodeEngine`]; values never come back out.
use super::node_app::{HealthRecord, NodeStatus};
use super::node_collect::NodeFramework;
use super::node_engine::{NodeEngine, NodeHost};
use crate::deploy_guard::DeployError;
use crate::deploy_targets::{Target, TargetStore};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use zeroize::Zeroizing;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatusView {
    pub active: String,
    pub restarts: u32,
    pub port: Option<u16>,
    pub current: Option<String>,
    pub node_version: Option<String>,
    pub last_health: Option<HealthView>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthView {
    pub release: String,
    pub status: String,
    pub at: u64,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactView {
    pub framework: String,
    pub entry: String,
    pub install: bool,
    pub file_count: usize,
    pub total_bytes: u64,
    pub node_range: Option<String>,
    pub build_id: String,
}
/// One env change from the renderer. `value` is consumed and wiped; it is never echoed.
#[derive(Deserialize)]
pub struct EnvSet {
    pub key: String,
    pub value: String,
}

fn view(s: NodeStatus) -> NodeStatusView {
    NodeStatusView {
        active: s.active,
        restarts: s.restarts,
        port: s.port,
        current: s.current,
        node_version: s.node_version,
        last_health: s.last_health.map(|HealthRecord { release, status, at }| HealthView { release, status, at }),
    }
}
fn framework_name(f: &NodeFramework) -> String {
    format!("{f:?}").to_ascii_lowercase()
}

pub struct NodeAdmin<H: NodeHost> {
    pub engine: Arc<NodeEngine<H>>,
    pub targets: Box<dyn TargetStore>,
}
impl<H: NodeHost> NodeAdmin<H> {
    fn target(&self, id: &str) -> Result<Target, DeployError> {
        self.targets.get(id).map_err(|_| DeployError::TargetNotFound)
    }
    fn node_target(&self, id: &str) -> Result<Target, DeployError> {
        let t = self.target(id)?;
        if t.kind != crate::deploy_targets::TargetKind::Node {
            return Err(DeployError::InvalidInput("not a node target"));
        }
        Ok(t)
    }
    pub fn env_keys(&self, id: &str) -> Result<Vec<String>, DeployError> {
        let t = self.node_target(id)?;
        self.engine.env_keys(&t).map_err(DeployError::Engine)
    }
    /// Returns the key names after the change. Values are validated before anything is written.
    pub fn env_apply(&self, id: &str, set: Vec<EnvSet>, remove: Vec<String>) -> Result<Vec<String>, DeployError> {
        let t = self.node_target(id)?;
        let set = set.into_iter().map(|e| (e.key, Zeroizing::new(e.value))).collect();
        self.engine.env_apply(&t, set, remove).map_err(DeployError::Engine)
    }
    pub fn logs(&self, id: &str, lines: usize) -> Result<Vec<String>, DeployError> {
        let t = self.node_target(id)?;
        self.engine.log_tail(&t, lines).map_err(DeployError::Engine)
    }
    pub fn status(&self, id: &str) -> Result<NodeStatusView, DeployError> {
        let t = self.node_target(id)?;
        self.engine.status(&t).map(view).map_err(DeployError::Engine)
    }
    pub fn artifact(&self, id: &str) -> Result<ArtifactView, DeployError> {
        let t = self.node_target(id)?;
        let s = self.engine.artifact_summary(&t).map_err(DeployError::Engine)?;
        Ok(ArtifactView {
            framework: framework_name(&s.framework),
            entry: s.entry,
            install: s.install,
            file_count: s.file_count,
            total_bytes: s.total_bytes,
            node_range: s.node_range,
            build_id: s.manifest.build_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deploy::node_engine::tests::{engine, target};
    use crate::deploy_targets::MemoryTargets;

    #[test]
    fn env_is_write_only_and_status_reads_back() {
        let (engine, mut t) = (engine("v1"), target(Some("example.com")));
        t.app_port = Some(3000);
        let targets = MemoryTargets::default();
        targets.save(&t).unwrap();
        let admin = NodeAdmin { engine: Arc::new(engine), targets: Box::new(targets) };
        assert!(admin.env_keys(&t.id).unwrap().is_empty());
        let keys = admin.env_apply(&t.id, vec![EnvSet { key: "DATABASE_URL".into(), value: "postgres://u:p@h/db".into() }], vec![]).unwrap();
        assert_eq!(keys, vec!["DATABASE_URL"]);
        assert_eq!(admin.env_keys(&t.id).unwrap(), vec!["DATABASE_URL"]);
        let bad = admin.env_apply(&t.id, vec![EnvSet { key: "bad key".into(), value: "x".into() }], vec![]);
        assert!(bad.is_err());
        assert_eq!(admin.env_keys(&t.id).unwrap(), vec!["DATABASE_URL"], "a rejected change writes nothing");
        let keys = admin.env_apply(&t.id, vec![], vec!["DATABASE_URL".into()]).unwrap();
        assert!(keys.is_empty());
        assert!(admin.status(&t.id).is_ok());
        let a = admin.artifact(&t.id).unwrap();
        assert!(a.file_count > 0 && !a.build_id.is_empty());
    }
    #[test]
    fn static_targets_are_refused() {
        let targets = MemoryTargets::default();
        let mut t = target(Some("example.com"));
        t.kind = crate::deploy_targets::TargetKind::Static;
        t.app_port = None;
        targets.save(&t).unwrap();
        let engine = engine("v1");
        let admin = NodeAdmin { engine: Arc::new(engine), targets: Box::new(targets) };
        assert!(matches!(admin.env_keys(&t.id), Err(DeployError::InvalidInput(_))));
    }
}
