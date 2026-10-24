//! Node app artifacts: decide from data (package.json, framework config) what a Node project
//! needs on the server, then walk the build output without following links and produce a
//! `DeployArtifactManifest` of kind `node`. No process is run, no socket opened, no secret read.
//! Errors carry only relative paths and stable `frameworks.artifact.*` codes.
use super::artifact::{
    build_id, quoted_value, ArtifactError, CollectedArtifact, CollectedFile, MAX_FILES, MAX_PACKAGE_JSON,
    MAX_TOTAL_BYTES,
};
use super::manifest::{sha256, validate_path, DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum NodeArtifactError {
    #[error("frameworks.artifact.notNode")]
    NotNode,
    #[error("frameworks.artifact.lockMissing")]
    LockMissing,
    #[error("frameworks.artifact.noEntry")]
    NoEntry,
    #[error("{0}")]
    Base(#[from] ArtifactError),
}
type Result<T> = std::result::Result<T, NodeArtifactError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeFramework {
    Next,
    Nuxt,
    Sveltekit,
    Astro,
    /// Express, Fastify, Hono and other plain Node servers.
    Generic,
}

/// One directory (or file) of the project copied into the bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundleRoot {
    /// Slash-separated, relative to the project root.
    pub from: String,
    /// Slash-separated, relative to the artifact root. Empty means the artifact root itself.
    pub to: String,
    /// Missing optional roots are skipped, missing required ones fail the collect.
    pub optional: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodePlan {
    pub framework: NodeFramework,
    /// Slash-separated path of the start file inside the artifact.
    pub entry: String,
    /// True when the server must run `npm ci --omit=dev` before the first start.
    pub install: bool,
    pub roots: Vec<BundleRoot>,
    /// Environment variables the framework reads for host and port, in unit order.
    pub host_var: &'static str,
    pub port_var: &'static str,
    /// SvelteKit needs its public origin to accept form posts.
    pub wants_origin: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeArtifactSummary {
    pub framework: NodeFramework,
    pub entry: String,
    pub install: bool,
    pub manifest: DeployArtifactManifest,
    pub file_count: usize,
    pub total_bytes: u64,
    /// `engines.node` from the project's package.json, shown next to the server's version.
    pub node_range: Option<String>,
    /// Package files under node_modules that carry key-like names are not uploaded. Relative paths, capped.
    pub skipped: Vec<String>,
}

fn read_small(path: &Path, limit: u64) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > limit {
        return None;
    }
    fs::read_to_string(path).ok()
}
fn config_source(root: &Path, stems: &[&str]) -> String {
    let mut out = String::new();
    for stem in stems {
        for ext in ["ts", "js", "mjs", "mts", "cjs"] {
            if let Some(t) = read_small(&root.join(format!("{stem}.{ext}")), 256 * 1024) {
                out.push_str(&t);
                out.push('\n');
            }
        }
    }
    out
}
fn has_dep(pkg: &serde_json::Value, name: &str) -> bool {
    ["dependencies", "devDependencies"].iter().any(|k| pkg.get(k).and_then(|d| d.get(name)).is_some())
}
fn safe_rel(value: &str) -> Option<String> {
    let value = value.trim().trim_start_matches("./").trim_end_matches('/');
    if value.is_empty() || value.contains(['\\', ':']) {
        return None;
    }
    Path::new(value).components().all(|c| matches!(c, Component::Normal(_))).then(|| value.to_string())
}
fn root(from: &str, to: &str, optional: bool) -> BundleRoot {
    BundleRoot { from: from.into(), to: to.into(), optional }
}
fn pkg_files(from: bool) -> Vec<BundleRoot> {
    let mut v = vec![root("package.json", "package.json", false)];
    if from {
        v.push(root("package-lock.json", "package-lock.json", false));
    }
    v
}

/// Read the project's package.json and framework config and say what to ship and how to start it.
pub fn detect_node(project: &Path) -> Result<NodePlan> {
    let raw = read_small(&project.join("package.json"), MAX_PACKAGE_JSON).ok_or(NodeArtifactError::from(ArtifactError::NoPackage))?;
    let pkg: serde_json::Value = serde_json::from_str(&raw).map_err(|_| NodeArtifactError::from(ArtifactError::NoPackage))?;
    let build_script = pkg.pointer("/scripts/build").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let lock = project.join("package-lock.json").is_file();

    if has_dep(&pkg, "next") {
        let cfg = config_source(project, &["next.config"]);
        if quoted_value(&cfg, "output").as_deref() != Some("standalone") {
            return Err(NodeArtifactError::NotNode);
        }
        // Next's standalone folder already contains the traced node_modules and a server.js.
        return Ok(NodePlan {
            framework: NodeFramework::Next,
            entry: "server.js".into(),
            install: false,
            roots: vec![
                root(".next/standalone", "", false),
                root(".next/static", ".next/static", false),
                root("public", "public", true),
            ],
            host_var: "HOSTNAME",
            port_var: "PORT",
            wants_origin: false,
        });
    }
    if has_dep(&pkg, "nuxt") {
        if build_script.contains("generate") || !(build_script.contains("nuxt build") || build_script.contains("nuxi build")) {
            return Err(NodeArtifactError::NotNode);
        }
        return Ok(NodePlan {
            framework: NodeFramework::Nuxt,
            entry: "server/index.mjs".into(),
            install: false,
            roots: vec![root(".output", "", false)],
            host_var: "NITRO_HOST",
            port_var: "NITRO_PORT",
            wants_origin: false,
        });
    }
    if has_dep(&pkg, "@sveltejs/kit") {
        if !has_dep(&pkg, "@sveltejs/adapter-node") {
            return Err(NodeArtifactError::NotNode);
        }
        if !lock {
            return Err(NodeArtifactError::LockMissing);
        }
        let cfg = config_source(project, &["svelte.config"]);
        let out = quoted_value(&cfg, "out").and_then(|o| safe_rel(&o)).unwrap_or_else(|| "build".into());
        let mut roots = pkg_files(true);
        roots.push(root(&out, &out, false));
        return Ok(NodePlan {
            framework: NodeFramework::Sveltekit,
            entry: format!("{out}/index.js"),
            install: true,
            roots,
            host_var: "HOST",
            port_var: "PORT",
            wants_origin: true,
        });
    }
    if has_dep(&pkg, "astro") {
        let cfg = config_source(project, &["astro.config"]);
        if !has_dep(&pkg, "@astrojs/node") || quoted_value(&cfg, "output").as_deref() == Some("static") {
            return Err(NodeArtifactError::NotNode);
        }
        if !lock {
            return Err(NodeArtifactError::LockMissing);
        }
        let out = quoted_value(&cfg, "outDir").and_then(|o| safe_rel(&o)).unwrap_or_else(|| "dist".into());
        let mut roots = pkg_files(true);
        roots.push(root(&out, &out, false));
        return Ok(NodePlan {
            framework: NodeFramework::Astro,
            entry: format!("{out}/server/entry.mjs"),
            install: true,
            roots,
            host_var: "HOST",
            port_var: "PORT",
            wants_origin: false,
        });
    }
    // Plain Node server: package.json `main` is the start file; ship it with the usual source folders.
    let main = pkg.get("main").and_then(|m| m.as_str()).and_then(safe_rel).unwrap_or_else(|| "index.js".into());
    if !project.join(&main).is_file() {
        return Err(NodeArtifactError::NotNode);
    }
    if !lock {
        return Err(NodeArtifactError::LockMissing);
    }
    let mut roots = pkg_files(true);
    if let Some(files) = pkg.get("files").and_then(|f| f.as_array()) {
        for f in files.iter().filter_map(|f| f.as_str()).filter_map(safe_rel).take(64) {
            roots.push(root(&f, &f, true));
        }
        roots.push(root(&main, &main, false));
    } else {
        for d in ["src", "server", "lib", "dist", "build", "public", "views", "routes"] {
            roots.push(root(d, d, true));
        }
        roots.push(root(&main, &main, false));
    }
    let mut seen = BTreeSet::new();
    roots.retain(|r| seen.insert((r.from.clone(), r.to.clone())));
    Ok(NodePlan { framework: NodeFramework::Generic, entry: main, install: true, roots, host_var: "HOST", port_var: "PORT", wants_origin: false })
}

/// Project-wide `engines.node` range, if the author set one.
pub fn node_range(project: &Path) -> Option<String> {
    let raw = read_small(&project.join("package.json"), MAX_PACKAGE_JSON)?;
    let pkg: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let v = pkg.pointer("/engines/node")?.as_str()?.trim().to_string();
    (!v.is_empty() && v.len() <= 128 && !v.chars().any(char::is_control)).then_some(v)
}

struct Found {
    file: CollectedFile,
    mode: u32,
}

fn is_exec(meta: &fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        false
    }
}

const MAX_SKIPPED: usize = 50;

fn walk(dir: &Path, rel_from: &str, rel_to: &str, in_modules: bool, out: &mut Vec<Found>, skipped: &mut Vec<String>) -> Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir).map_err(|_| NodeArtifactError::from(ArtifactError::Io))?.collect::<std::io::Result<_>>().map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().into_string().map_err(|_| NodeArtifactError::from(ArtifactError::UnsafePath))?;
        let child_to = if rel_to.is_empty() { name.clone() } else { format!("{rel_to}/{name}") };
        let child_from = format!("{rel_from}/{name}");
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
        let ft = meta.file_type();
        if ft.is_symlink() {
            return Err(ArtifactError::Link(child_to).into());
        }
        if ft.is_dir() {
            let lower = name.to_ascii_lowercase();
            if lower == ".git" || lower == ".ssh" {
                return Err(ArtifactError::Forbidden(child_to).into());
            }
            // Dependencies that npm installs on the server are not part of a project's own bundle,
            // but a self-contained bundle (Next standalone, Nuxt .output) ships its node_modules.
            walk(&entry.path(), &child_from, &child_to, in_modules || lower == "node_modules", out, skipped)?;
        } else if ft.is_file() {
            if out.len() >= MAX_FILES {
                return Err(ArtifactError::TooMany.into());
            }
            if validate_path(&child_to, DeployArtifactKind::Node).is_err() {
                // Test fixtures and certificates inside a dependency are not the user's secrets and
                // are never needed to start a server; anything outside node_modules stops the publish.
                if in_modules {
                    if skipped.len() < MAX_SKIPPED {
                        skipped.push(child_to);
                    }
                    continue;
                }
                return Err(ArtifactError::Forbidden(child_to).into());
            }
            let mode = if is_exec(&meta) { 0o755 } else { 0o644 };
            out.push(Found { file: CollectedFile { path: child_to, abs: entry.path() }, mode });
        } else {
            return Err(ArtifactError::Link(child_to).into());
        }
    }
    Ok(())
}
fn hash_file(path: &Path) -> Result<(String, u64)> {
    use sha2::{Digest, Sha256};
    let mut f = fs::File::open(path).map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut n = 0u64;
    loop {
        let r = f.read(&mut buf).map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
        if r == 0 {
            break;
        }
        h.update(&buf[..r]);
        n += r as u64;
    }
    Ok((format!("{:x}", h.finalize()), n))
}

#[derive(Debug, Clone)]
pub struct CollectedNode {
    pub artifact: CollectedArtifact,
    pub summary: NodeArtifactSummary,
}

/// Walk the planned roots under `project` and build the node manifest. Later roots must not
/// overwrite earlier ones: a duplicate target path is an error, not a silent winner.
pub fn collect_node(project: &Path, plan: &NodePlan) -> Result<CollectedNode> {
    let project = project.canonicalize().map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
    let mut found: Vec<Found> = Vec::new();
    let mut skipped = Vec::new();
    for r in &plan.roots {
        let from = safe_rel(&r.from).ok_or(NodeArtifactError::from(ArtifactError::UnsafePath))?;
        let to = if r.to.is_empty() { String::new() } else { safe_rel(&r.to).ok_or(NodeArtifactError::from(ArtifactError::UnsafePath))? };
        let abs = project.join(&from);
        let meta = match fs::symlink_metadata(&abs) {
            Ok(m) => m,
            Err(_) if r.optional => continue,
            Err(_) => return Err(ArtifactError::DistMissing.into()),
        };
        if meta.file_type().is_symlink() {
            return Err(ArtifactError::Link(from).into());
        }
        let canon = abs.canonicalize().map_err(|_| NodeArtifactError::from(ArtifactError::Io))?;
        if !canon.starts_with(&project) || canon == project {
            return Err(ArtifactError::UnsafePath.into());
        }
        if meta.is_dir() {
            walk(&canon, &from, &to, from.split('/').any(|p| p == "node_modules"), &mut found, &mut skipped)?;
        } else if meta.is_file() {
            validate_path(&to, DeployArtifactKind::Node).map_err(|_| NodeArtifactError::from(ArtifactError::Forbidden(to.clone())))?;
            found.push(Found { file: CollectedFile { path: to, abs: canon }, mode: if is_exec(&meta) { 0o755 } else { 0o644 } });
        } else {
            return Err(ArtifactError::Link(from).into());
        }
    }
    let mut seen = BTreeSet::new();
    for f in &found {
        if !seen.insert(f.file.path.clone()) {
            return Err(ArtifactError::Forbidden(f.file.path.clone()).into());
        }
    }
    found.sort_by(|a, b| a.file.path.cmp(&b.file.path));
    if found.is_empty() {
        return Err(ArtifactError::Empty.into());
    }
    if !seen.contains(&plan.entry) {
        return Err(NodeArtifactError::NoEntry);
    }
    if plan.install && !(seen.contains("package.json") && seen.contains("package-lock.json")) {
        return Err(NodeArtifactError::LockMissing);
    }
    let mut total = 0u64;
    let mut files = Vec::with_capacity(found.len());
    for f in &found {
        let (digest, size) = hash_file(&f.file.abs)?;
        total = total.checked_add(size).ok_or(NodeArtifactError::from(ArtifactError::TooLarge))?;
        if total > MAX_TOTAL_BYTES {
            return Err(ArtifactError::TooLarge.into());
        }
        files.push(DeployArtifactFile { path: f.file.path.clone(), sha256: digest, size, mode: f.mode });
    }
    let range = node_range(&project);
    let engines: Option<BTreeMap<String, String>> = range.clone().map(|r| BTreeMap::from([("node".to_string(), r)]));
    let mut id_input = files.clone();
    // The id also covers the start file and install flag so that two different launches never share one.
    id_input.push(DeployArtifactFile { path: format!("\0entry:{}:{}", plan.entry, plan.install), sha256: sha256(b""), size: 0, mode: 0o644 });
    let manifest = DeployArtifactManifest {
        kind: DeployArtifactKind::Node,
        build_id: build_id(&id_input),
        files,
        entry: Some(plan.entry.clone()),
        engines,
        port: None,
    };
    manifest.validate().map_err(|_| NodeArtifactError::from(ArtifactError::UnsafePath))?;
    let collected: Vec<CollectedFile> = found.into_iter().map(|f| f.file).collect();
    let summary = NodeArtifactSummary {
        framework: plan.framework,
        entry: plan.entry.clone(),
        install: plan.install,
        file_count: manifest.files.len(),
        total_bytes: total,
        node_range: range,
        skipped,
        manifest: manifest.clone(),
    };
    Ok(CollectedNode { artifact: CollectedArtifact { manifest, files: collected }, summary })
}

/// Detect, then collect. The only entry point the command layer needs.
pub fn collect_project(project: &Path) -> Result<CollectedNode> {
    let plan = detect_node(project)?;
    collect_node(project, &plan)
}

/// Absolute paths are local and never cross IPC; this keeps tests honest about that.
pub fn local_paths(a: &CollectedArtifact) -> Vec<PathBuf> {
    a.files.iter().map(|f| f.abs.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn write(root: &Path, rel: &str, body: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, body).unwrap();
    }
    fn pkg(deps: &str, script: &str) -> String {
        format!(r#"{{"name":"app","engines":{{"node":">=20"}},"scripts":{{"build":"{script}"}},"dependencies":{{{deps}}}}}"#)
    }
    fn paths(c: &CollectedNode) -> Vec<&str> {
        c.summary.manifest.files.iter().map(|f| f.path.as_str()).collect()
    }
    fn next_project() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""next":"15""#, "next build"));
        write(d.path(), "next.config.mjs", "export default { output: 'standalone' }");
        write(d.path(), ".next/standalone/server.js", "require('http')");
        write(d.path(), ".next/standalone/package.json", "{}");
        write(d.path(), ".next/standalone/node_modules/next/index.js", "1");
        write(d.path(), ".next/static/chunks/a.js", "2");
        write(d.path(), "public/logo.svg", "<svg/>");
        write(d.path(), ".env.local", "SECRET=1");
        d
    }
    #[test]
    fn next_standalone_gets_static_and_public_placed_next_to_server() {
        let d = next_project();
        let c = collect_project(d.path()).unwrap();
        assert_eq!(c.summary.framework, NodeFramework::Next);
        assert!(!c.summary.install);
        assert_eq!(c.summary.node_range.as_deref(), Some(">=20"));
        assert_eq!(c.summary.manifest.engines.as_ref().unwrap()["node"], ">=20");
        let p = paths(&c);
        for want in ["server.js", ".next/static/chunks/a.js", "public/logo.svg", "node_modules/next/index.js", "package.json"] {
            assert!(p.contains(&want), "{want} in {p:?}");
        }
        assert!(!p.iter().any(|x| x.contains(".env")), "project .env files are never shipped");
        let json = serde_json::to_string(&c.summary).unwrap();
        assert!(!json.contains(d.path().to_str().unwrap()), "no local paths cross IPC");
        assert_eq!(c.summary.manifest.entry.as_deref(), Some("server.js"));
    }
    #[test]
    fn same_files_same_build_id_and_different_entry_differs() {
        let d = next_project();
        let a = collect_project(d.path()).unwrap().summary.manifest;
        let b = collect_project(d.path()).unwrap().summary.manifest;
        assert_eq!(a, b);
        write(d.path(), ".next/standalone/server.js", "changed");
        assert_ne!(collect_project(d.path()).unwrap().summary.manifest.build_id, a.build_id);
    }
    #[test]
    fn static_exports_and_unready_projects_are_not_node() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""next":"15""#, "next build"));
        write(d.path(), "next.config.js", "module.exports = { output: 'export' }");
        assert_eq!(detect_node(d.path()).unwrap_err(), NodeArtifactError::NotNode);
        let n = tempfile::tempdir().unwrap();
        write(n.path(), "package.json", &pkg(r#""nuxt":"3""#, "nuxt generate"));
        assert_eq!(detect_node(n.path()).unwrap_err(), NodeArtifactError::NotNode);
        let s = tempfile::tempdir().unwrap();
        write(s.path(), "package.json", &pkg(r#""@sveltejs/kit":"2","@sveltejs/adapter-static":"3""#, "vite build"));
        assert_eq!(detect_node(s.path()).unwrap_err(), NodeArtifactError::NotNode);
        let empty = tempfile::tempdir().unwrap();
        assert!(matches!(detect_node(empty.path()).unwrap_err(), NodeArtifactError::Base(ArtifactError::NoPackage)));
        // Next without a build yet: required output is missing.
        let b = tempfile::tempdir().unwrap();
        write(b.path(), "package.json", &pkg(r#""next":"15""#, "next build"));
        write(b.path(), "next.config.js", "module.exports = { output: 'standalone' }");
        assert!(matches!(collect_project(b.path()).err().unwrap(), NodeArtifactError::Base(ArtifactError::DistMissing)));
    }
    #[test]
    fn nuxt_and_astro_and_sveltekit_layouts() {
        let n = tempfile::tempdir().unwrap();
        write(n.path(), "package.json", &pkg(r#""nuxt":"3""#, "nuxt build"));
        write(n.path(), ".output/server/index.mjs", "x");
        write(n.path(), ".output/public/_nuxt/a.js", "x");
        let c = collect_project(n.path()).unwrap();
        assert_eq!((c.summary.framework, c.summary.entry.as_str()), (NodeFramework::Nuxt, "server/index.mjs"));
        assert!(paths(&c).contains(&"public/_nuxt/a.js"));

        let a = tempfile::tempdir().unwrap();
        write(a.path(), "package.json", &pkg(r#""astro":"5","@astrojs/node":"9""#, "astro build"));
        write(a.path(), "astro.config.mjs", "export default { output: 'server' }");
        write(a.path(), "dist/server/entry.mjs", "x");
        write(a.path(), "dist/client/a.css", "x");
        assert_eq!(collect_project(a.path()).unwrap_err(), NodeArtifactError::LockMissing, "install needs a lockfile");
        write(a.path(), "package-lock.json", "{}");
        let c = collect_project(a.path()).unwrap();
        assert!(c.summary.install && c.summary.entry == "dist/server/entry.mjs");
        assert!(paths(&c).contains(&"package-lock.json") && paths(&c).contains(&"dist/client/a.css"));

        let k = tempfile::tempdir().unwrap();
        write(k.path(), "package.json", &pkg(r#""@sveltejs/kit":"2","@sveltejs/adapter-node":"5""#, "vite build"));
        write(k.path(), "package-lock.json", "{}");
        write(k.path(), "build/index.js", "x");
        write(k.path(), "build/handler.js", "x");
        let c = collect_project(k.path()).unwrap();
        assert_eq!((c.summary.entry.as_str(), c.summary.framework), ("build/index.js", NodeFramework::Sveltekit));
        assert!(detect_node(k.path()).unwrap().wants_origin);
    }
    #[test]
    fn generic_express_app_ships_main_and_source_folders_only() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", r#"{"main":"server.js","dependencies":{"express":"5"}}"#);
        write(d.path(), "package-lock.json", "{}");
        write(d.path(), "server.js", "x");
        write(d.path(), "src/routes.js", "x");
        write(d.path(), "views/home.html", "x");
        write(d.path(), ".env", "SECRET=1");
        write(d.path(), "node_modules/express/index.js", "x");
        write(d.path(), "notes.txt", "private");
        let c = collect_project(d.path()).unwrap();
        let p = paths(&c);
        assert_eq!(p, ["package-lock.json", "package.json", "server.js", "src/routes.js", "views/home.html"]);
        write(d.path(), "src/private.pem", "-----BEGIN");
        assert!(matches!(collect_project(d.path()).err().unwrap(), NodeArtifactError::Base(ArtifactError::Forbidden(_))), "key-like files outside node_modules stop the publish");
    }
    #[test]
    fn dependency_fixtures_with_key_names_are_skipped_and_reported() {
        let d = next_project();
        write(d.path(), ".next/standalone/node_modules/some-lib/test/fixture.pem", "x");
        write(d.path(), ".next/standalone/node_modules/some-lib/index.js", "x");
        let c = collect_project(d.path()).unwrap();
        assert_eq!(c.summary.skipped, ["node_modules/some-lib/test/fixture.pem"]);
        assert!(paths(&c).contains(&"node_modules/some-lib/index.js"));
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_and_escapes_are_rejected() {
        let d = next_project();
        std::os::unix::fs::symlink("/etc/hostname", d.path().join(".next/standalone/link")).unwrap();
        assert!(matches!(collect_project(d.path()).err().unwrap(), NodeArtifactError::Base(ArtifactError::Link(_))));
        let e = next_project();
        let outside = tempfile::tempdir().unwrap();
        fs::remove_dir_all(e.path().join("public")).unwrap();
        std::os::unix::fs::symlink(outside.path(), e.path().join("public")).unwrap();
        assert!(matches!(collect_project(e.path()).err().unwrap(), NodeArtifactError::Base(ArtifactError::Link(_))));
    }
    #[cfg(unix)]
    #[test]
    fn executable_bit_is_kept_and_other_modes_are_normalised() {
        use std::os::unix::fs::PermissionsExt;
        let d = next_project();
        let bin = d.path().join(".next/standalone/node_modules/.bin/tool");
        write(d.path(), ".next/standalone/node_modules/.bin/tool", "#!/bin/sh");
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o4755)).unwrap();
        let c = collect_project(d.path()).unwrap();
        let f = c.summary.manifest.files.iter().find(|f| f.path == "node_modules/.bin/tool").unwrap();
        assert_eq!(f.mode, 0o755, "setuid and group bits never reach the server");
    }
    #[test]
    fn plain_project_with_missing_start_file_is_not_a_node_app() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", r#"{"main":"server.js"}"#);
        assert_eq!(detect_node(d.path()).unwrap_err(), NodeArtifactError::NotNode);
    }
}
