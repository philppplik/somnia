//! Glue for `deploy_artifact_collect`: turns a finished build run into a static artifact summary.
//! The rules live in [`crate::deploy::artifact`]; this file only checks the run state.
//! The result carries relative paths, hashes and sizes only. File bytes never cross IPC.
use crate::deploy::artifact::{collect_static, detect_dist, spa_rules, ArtifactError, Framework, SpaRules};
use crate::deploy::manifest::DeployArtifactManifest;
use crate::deploy::node_collect::{collect_node, detect_node, NodeFramework};
use crate::proc_runner::{RunKind, RunnerHandle};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactSummary {
    pub framework: Framework,
    pub dist: String,
    pub manifest: DeployArtifactManifest,
    pub file_count: usize,
    pub total_bytes: u64,
    /// Present for single-page apps only.
    pub spa_rules: Option<SpaRules>,
    /// Present for Node (server) bundles only, see [`crate::deploy::node_collect`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<NodeInfo>,
}

pub fn summarize_parts(is_build: bool, state: &str, exit_code: Option<i32>, root: &Path) -> Result<ArtifactSummary, String> {
    if !is_build {
        return Err("frameworks.artifact.notBuild".into());
    }
    if state != "exited" || exit_code != Some(0) {
        return Err("frameworks.artifact.buildNotFinished".into());
    }
    let to_code = |e: ArtifactError| e.to_string();
    let loc = detect_dist(root).map_err(to_code)?;
    let art = collect_static(root, &loc.dist).map_err(to_code)?;
    let total_bytes = art.manifest.files.iter().map(|f| f.size).sum();
    Ok(ArtifactSummary {
        framework: loc.framework,
        file_count: art.manifest.files.len(),
        total_bytes,
        spa_rules: loc.spa.then(spa_rules),
        node: None,
        dist: loc.dist,
        manifest: art.manifest,
    })
}
/// Server bundle facts for the UI. Relative names only, no bytes, no local paths.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub entry: String,
    /// True when the server runs `npm ci --omit=dev` before the first start.
    pub install: bool,
    pub node_range: Option<String>,
    /// Package files that were left out because they look like keys. Capped by the collector.
    pub skipped: Vec<String>,
}
fn framework_of(f: NodeFramework) -> Framework {
    match f {
        NodeFramework::Next => Framework::Next,
        NodeFramework::Nuxt => Framework::Nuxt,
        NodeFramework::Sveltekit => Framework::Sveltekit,
        NodeFramework::Astro => Framework::Astro,
        NodeFramework::Generic => Framework::Generic,
    }
}
/// Same gate as [`summarize_parts`], for server builds: only a finished, successful build run is read.
/// The rules live in [`crate::deploy::node_collect`].
pub fn summarize_node_parts(is_build: bool, state: &str, exit_code: Option<i32>, root: &Path) -> Result<ArtifactSummary, String> {
    if !is_build {
        return Err("frameworks.artifact.notBuild".into());
    }
    if state != "exited" || exit_code != Some(0) {
        return Err("frameworks.artifact.buildNotFinished".into());
    }
    let plan = detect_node(root).map_err(|e| e.to_string())?;
    let done = collect_node(root, &plan).map_err(|e| e.to_string())?;
    let s = done.summary;
    Ok(ArtifactSummary {
        framework: framework_of(s.framework),
        file_count: s.file_count,
        total_bytes: s.total_bytes,
        spa_rules: None,
        node: Some(NodeInfo { entry: s.entry, install: s.install, node_range: s.node_range, skipped: s.skipped }),
        dist: plan.roots.first().map(|r| r.from.clone()).unwrap_or_default(),
        manifest: done.artifact.manifest,
    })
}
pub fn summarize_node(handle: &RunnerHandle, root: &Path) -> Result<ArtifactSummary, String> {
    summarize_node_parts(handle.kind == RunKind::Build, &handle.state, handle.exit_code, root)
}
pub fn summarize(handle: &RunnerHandle, root: &Path) -> Result<ArtifactSummary, String> {
    summarize_parts(handle.kind == RunKind::Build, &handle.state, handle.exit_code, root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn project() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("package.json"), r#"{"dependencies":{"react":"19"},"scripts":{"build":"vite build"}}"#).unwrap();
        fs::create_dir(d.path().join("dist")).unwrap();
        fs::write(d.path().join("dist/index.html"), "<p>x</p>").unwrap();
        d
    }
    #[test]
    fn finished_successful_build_yields_summary_with_spa_rules() {
        let d = project();
        let s = summarize_parts(true, "exited", Some(0), d.path()).unwrap();
        assert_eq!((s.file_count, s.total_bytes, s.dist.as_str()), (1, 8, "dist"));
        assert!(s.spa_rules.is_some());
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"buildId\"") && json.contains("\"spaRules\"") && !json.contains(d.path().to_str().unwrap()));
    }
    #[test]
    fn refuses_dev_runs_failed_builds_and_running_builds() {
        let d = project();
        assert_eq!(summarize_parts(false, "exited", Some(0), d.path()).unwrap_err(), "frameworks.artifact.notBuild");
        for (st, code) in [("exited", Some(1)), ("running", None), ("timedOut", None), ("stopped", None), ("exited", None)] {
            assert_eq!(summarize_parts(true, st, code, d.path()).unwrap_err(), "frameworks.artifact.buildNotFinished");
        }
    }
    fn nuxt_project() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("package.json"), r#"{"dependencies":{"nuxt":"4"},"scripts":{"build":"nuxt build"}}"#).unwrap();
        fs::create_dir_all(d.path().join(".output/server")).unwrap();
        fs::write(d.path().join(".output/server/index.mjs"), "x").unwrap();
        d
    }
    #[test]
    fn node_summary_carries_a_node_manifest_and_no_local_paths() {
        let d = nuxt_project();
        let s = summarize_node_parts(true, "exited", Some(0), d.path()).unwrap();
        assert_eq!((s.spa_rules.is_none(), s.framework), (true, Framework::Nuxt));
        assert_eq!(s.manifest.kind, crate::deploy::manifest::DeployArtifactKind::Node);
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"kind\":\"node\"") && json.contains("\"entry\":\"server/index.mjs\"") && json.contains("\"install\":false"));
        assert!(!json.contains(d.path().to_str().unwrap()));
        // The static summary never carries the node block.
        assert!(!serde_json::to_string(&summarize_parts(true, "exited", Some(0), &project().path().to_path_buf()).unwrap()).unwrap().contains("\"node\""));
    }
    #[test]
    fn node_collector_refuses_dev_runs_unfinished_builds_and_static_projects() {
        let d = nuxt_project();
        assert_eq!(summarize_node_parts(false, "exited", Some(0), d.path()).unwrap_err(), "frameworks.artifact.notBuild");
        for (st, code) in [("exited", Some(1)), ("running", None), ("timedOut", None), ("stopped", None)] {
            assert_eq!(summarize_node_parts(true, st, code, d.path()).unwrap_err(), "frameworks.artifact.buildNotFinished");
        }
        assert_eq!(summarize_node_parts(true, "exited", Some(0), project().path()).unwrap_err(), "frameworks.artifact.notNode");
    }
}
