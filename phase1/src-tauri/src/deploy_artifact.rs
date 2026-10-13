//! Glue for `deploy_artifact_collect`: turns a finished build run into a static artifact summary.
//! The rules live in [`crate::deploy::artifact`]; this file only checks the run state.
//! The result carries relative paths, hashes and sizes only. File bytes never cross IPC.
use crate::deploy::artifact::{collect_static, detect_dist, spa_rules, ArtifactError, Framework, SpaRules};
use crate::deploy::manifest::DeployArtifactManifest;
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
        dist: loc.dist,
        manifest: art.manifest,
    })
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
}
