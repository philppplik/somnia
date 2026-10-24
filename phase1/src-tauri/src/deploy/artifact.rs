//! Static artifact production: locate the build output of a framework project, walk it without
//! following links, hash every file and produce a `DeployArtifactManifest` of kind `static`.
//! Nothing here runs a process, opens a socket or reads a secret. Errors carry only relative paths.
use super::manifest::{sha256, validate_path, DeployArtifactFile, DeployArtifactKind, DeployArtifactManifest};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

pub const MAX_FILES: usize = 20_000;
pub const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_PACKAGE_JSON: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ArtifactError {
    #[error("frameworks.artifact.noPackage")]
    NoPackage,
    #[error("frameworks.artifact.notStatic")]
    NotStatic,
    #[error("frameworks.artifact.distMissing")]
    DistMissing,
    #[error("frameworks.artifact.noIndex")]
    NoIndex,
    #[error("frameworks.artifact.empty")]
    Empty,
    #[error("frameworks.artifact.tooLarge")]
    TooLarge,
    #[error("frameworks.artifact.tooMany")]
    TooMany,
    #[error("frameworks.artifact.unsafePath")]
    UnsafePath,
    #[error("frameworks.artifact.link:{0}")]
    Link(String),
    #[error("frameworks.artifact.forbidden:{0}")]
    Forbidden(String),
    #[error("frameworks.artifact.io")]
    Io,
}
pub type Result<T> = std::result::Result<T, ArtifactError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Framework {
    React,
    Vue,
    Svelte,
    Solid,
    Astro,
    Next,
    Sveltekit,
    Nuxt,
    /// Any other project whose build writes `dist` or `build` with an index.html.
    Generic,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistLocation {
    pub framework: Framework,
    /// Slash-separated, relative to the project root.
    pub dist: String,
    /// True for client-side routed apps that need a "serve index.html for unknown paths" rule.
    pub spa: bool,
}

fn read_small(path: &Path, limit: u64) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > limit {
        return None;
    }
    fs::read_to_string(path).ok()
}
/// First quoted string after `key` and a colon or equals sign, e.g. `outDir: 'public-out'`.
pub fn quoted_value(src: &str, key: &str) -> Option<String> {
    let mut from = 0;
    while let Some(i) = src[from..].find(key) {
        let at = from + i;
        let rest = src[at + key.len()..].trim_start();
        from = at + key.len();
        let before_ok = at == 0 || !src.as_bytes()[at - 1].is_ascii_alphanumeric();
        let Some(rest) = rest.strip_prefix([':', '=']) else { continue };
        let rest = rest.trim_start();
        let Some(q) = rest.chars().next().filter(|c| matches!(c, '\'' | '"' | '`')) else { continue };
        let body = &rest[1..];
        if let Some(end) = body.find(q) {
            if before_ok {
                return Some(body[..end].to_string());
            }
        }
    }
    None
}
fn config_source(root: &Path, stems: &[&str]) -> String {
    let mut out = String::new();
    for stem in stems {
        for ext in ["ts", "js", "mjs", "mts", "cjs"] {
            if let Some(text) = read_small(&root.join(format!("{stem}.{ext}")), 256 * 1024) {
                out.push_str(&text);
                out.push('\n');
            }
        }
    }
    out
}
fn safe_rel(value: &str) -> Option<String> {
    let value = value.trim().trim_start_matches("./").trim_end_matches('/');
    if value.is_empty() || value.contains('\\') || value.contains(':') {
        return None;
    }
    let p = Path::new(value);
    if p.components().all(|c| matches!(c, Component::Normal(_))) {
        Some(value.to_string())
    } else {
        None
    }
}
fn has_dep(pkg: &serde_json::Value, name: &str) -> bool {
    ["dependencies", "devDependencies"]
        .iter()
        .any(|k| pkg.get(k).and_then(|d| d.get(name)).is_some())
}

/// Decide where a project's static output lives, from package.json and the framework config files.
/// Reads data only; a project script is never run here.
pub fn detect_dist(root: &Path) -> Result<DistLocation> {
    let raw = read_small(&root.join("package.json"), MAX_PACKAGE_JSON).ok_or(ArtifactError::NoPackage)?;
    let pkg: serde_json::Value = serde_json::from_str(&raw).map_err(|_| ArtifactError::NoPackage)?;
    let build_script = pkg
        .pointer("/scripts/build")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let (framework, dist, spa) = if has_dep(&pkg, "next") {
        let cfg = config_source(root, &["next.config"]);
        let exports = quoted_value(&cfg, "output").as_deref() == Some("export");
        if !exports {
            return Err(ArtifactError::NotStatic);
        }
        (Framework::Next, "out".to_string(), false)
    } else if has_dep(&pkg, "nuxt") {
        if !build_script.contains("nuxt generate") && !build_script.contains("nuxi generate") {
            return Err(ArtifactError::NotStatic);
        }
        (Framework::Nuxt, ".output/public".into(), false)
    } else if has_dep(&pkg, "@sveltejs/kit") {
        if !has_dep(&pkg, "@sveltejs/adapter-static") {
            return Err(ArtifactError::NotStatic);
        }
        let cfg = config_source(root, &["svelte.config"]);
        (Framework::Sveltekit, quoted_value(&cfg, "pages").unwrap_or_else(|| "build".into()), false)
    } else if has_dep(&pkg, "astro") {
        let cfg = config_source(root, &["astro.config"]);
        if matches!(quoted_value(&cfg, "output").as_deref(), Some("server")) {
            return Err(ArtifactError::NotStatic);
        }
        (Framework::Astro, quoted_value(&cfg, "outDir").unwrap_or_else(|| "dist".into()), false)
    } else {
        let framework = if has_dep(&pkg, "react") {
            Framework::React
        } else if has_dep(&pkg, "vue") {
            Framework::Vue
        } else if has_dep(&pkg, "svelte") {
            Framework::Svelte
        } else if has_dep(&pkg, "solid-js") {
            Framework::Solid
        } else {
            Framework::Generic
        };
        let cfg = config_source(root, &["vite.config"]);
        let out = quoted_value(&cfg, "outDir");
        let spa = framework != Framework::Generic;
        match out {
            Some(o) => (framework, o, spa),
            None => {
                let pick = ["dist", "build"].into_iter().find(|d| root.join(d).join("index.html").is_file());
                (framework, pick.unwrap_or("dist").to_string(), spa)
            }
        }
    };
    let dist = safe_rel(&dist).ok_or(ArtifactError::UnsafePath)?;
    Ok(DistLocation { framework, dist, spa })
}

#[derive(Debug, Clone)]
pub struct CollectedFile {
    pub path: String,
    pub abs: PathBuf,
}
#[derive(Debug, Clone)]
pub struct CollectedArtifact {
    pub manifest: DeployArtifactManifest,
    pub files: Vec<CollectedFile>,
}

fn walk(dir: &Path, rel: &str, out: &mut Vec<CollectedFile>) -> Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir).map_err(|_| ArtifactError::Io)?.collect::<std::io::Result<_>>().map_err(|_| ArtifactError::Io)?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().into_string().map_err(|_| ArtifactError::UnsafePath)?;
        let child = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| ArtifactError::Io)?;
        let ft = meta.file_type();
        if ft.is_symlink() {
            return Err(ArtifactError::Link(child));
        }
        if ft.is_dir() {
            // Source maps and dev files are allowed; secret-looking names are checked per path below.
            let lower = name.to_ascii_lowercase();
            if lower == ".git" || lower == ".ssh" || lower == "node_modules" {
                return Err(ArtifactError::Forbidden(child));
            }
            walk(&entry.path(), &child, out)?;
        } else if ft.is_file() {
            if out.len() >= MAX_FILES {
                return Err(ArtifactError::TooMany);
            }
            validate_path(&child, DeployArtifactKind::Static).map_err(|_| ArtifactError::Forbidden(child.clone()))?;
            out.push(CollectedFile { path: child, abs: entry.path() });
        } else {
            return Err(ArtifactError::Link(child));
        }
    }
    Ok(())
}
fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut f = fs::File::open(path).map_err(|_| ArtifactError::Io)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut n = 0u64;
    loop {
        let r = f.read(&mut buf).map_err(|_| ArtifactError::Io)?;
        if r == 0 {
            break;
        }
        h.update(&buf[..r]);
        n += r as u64;
    }
    Ok((format!("{:x}", h.finalize()), n))
}
/// Stable id from content only: same files give the same id on every machine.
pub fn build_id(files: &[DeployArtifactFile]) -> String {
    let mut sorted: Vec<_> = files.iter().collect();
    sorted.sort_by(|a, b| a.path.cmp(&b.path));
    let mut text = String::new();
    for f in sorted {
        text.push_str(&format!("{}\0{}\0{}\n", f.path, f.sha256, f.size));
    }
    sha256(text.as_bytes())[..32].to_string()
}

/// Walk `root/dist` and build the static manifest. `dist` must stay inside `root`.
pub fn collect_static(root: &Path, dist: &str) -> Result<CollectedArtifact> {
    let dist = safe_rel(dist).ok_or(ArtifactError::UnsafePath)?;
    let root = root.canonicalize().map_err(|_| ArtifactError::Io)?;
    let dir = root.join(&dist);
    let meta = fs::symlink_metadata(&dir).map_err(|_| ArtifactError::DistMissing)?;
    if meta.file_type().is_symlink() {
        return Err(ArtifactError::Link(dist));
    }
    if !meta.is_dir() {
        return Err(ArtifactError::DistMissing);
    }
    let dir = dir.canonicalize().map_err(|_| ArtifactError::Io)?;
    if !dir.starts_with(&root) || dir == root {
        return Err(ArtifactError::UnsafePath);
    }
    let mut found = Vec::new();
    walk(&dir, "", &mut found)?;
    if found.is_empty() {
        return Err(ArtifactError::Empty);
    }
    let paths: BTreeSet<&str> = found.iter().map(|f| f.path.as_str()).collect();
    if !paths.contains("index.html") {
        return Err(ArtifactError::NoIndex);
    }
    let mut total = 0u64;
    let mut files = Vec::with_capacity(found.len());
    for f in &found {
        let (digest, size) = hash_file(&f.abs)?;
        total = total.checked_add(size).ok_or(ArtifactError::TooLarge)?;
        if total > MAX_TOTAL_BYTES {
            return Err(ArtifactError::TooLarge);
        }
        files.push(DeployArtifactFile { path: f.path.clone(), sha256: digest, size, mode: 0o644 });
    }
    let manifest = DeployArtifactManifest {
        kind: DeployArtifactKind::Static,
        build_id: build_id(&files),
        files,
        entry: None,
        engines: None,
        port: None,
    };
    manifest.validate().map_err(|_| ArtifactError::UnsafePath)?;
    Ok(CollectedArtifact { manifest, files: found })
}

/// Server rules for single-page apps. Shown to the user in the confirmation, never written silently.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaRules {
    pub nginx: String,
    pub apache: String,
}
pub fn spa_rules() -> SpaRules {
    SpaRules {
        nginx: "location / {\n    try_files $uri $uri/ /index.html;\n}\n".into(),
        apache: "RewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^ /index.html [L]\n".into(),
    }
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
        format!(r#"{{"scripts":{{"build":"{script}"}},"dependencies":{{{deps}}}}}"#)
    }
    #[test]
    fn vite_react_defaults_to_dist_and_is_spa() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""react":"19""#, "vite build"));
        let loc = detect_dist(d.path()).unwrap();
        assert_eq!((loc.framework, loc.dist.as_str(), loc.spa), (Framework::React, "dist", true));
    }
    #[test]
    fn vite_config_outdir_is_honoured_and_traversal_is_not() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""vue":"3""#, "vite build"));
        write(d.path(), "vite.config.ts", "export default { build: { outDir: 'public_html' } }");
        assert_eq!(detect_dist(d.path()).unwrap().dist, "public_html");
        write(d.path(), "vite.config.ts", "export default { build: { outDir: '../outside' } }");
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::UnsafePath));
        write(d.path(), "vite.config.ts", "export default { build: { outDir: '/etc' } }");
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::UnsafePath));
    }
    #[test]
    fn svelte_solid_astro_static() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""svelte":"5""#, "vite build"));
        assert_eq!(detect_dist(d.path()).unwrap().framework, Framework::Svelte);
        write(d.path(), "package.json", &pkg(r#""solid-js":"1""#, "vite build"));
        assert_eq!(detect_dist(d.path()).unwrap().framework, Framework::Solid);
        write(d.path(), "package.json", &pkg(r#""astro":"5""#, "astro build"));
        let a = detect_dist(d.path()).unwrap();
        assert_eq!((a.framework, a.dist.as_str(), a.spa), (Framework::Astro, "dist", false));
        write(d.path(), "astro.config.mjs", "export default defineConfig({ outDir: './site' })");
        assert_eq!(detect_dist(d.path()).unwrap().dist, "site");
        write(d.path(), "astro.config.mjs", "export default defineConfig({ output: 'server' })");
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NotStatic));
    }
    #[test]
    fn next_needs_export_and_uses_out() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""next":"15","react":"19""#, "next build"));
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NotStatic));
        write(d.path(), "next.config.mjs", "export default { output: 'export' }");
        let n = detect_dist(d.path()).unwrap();
        assert_eq!((n.framework, n.dist.as_str()), (Framework::Next, "out"));
    }
    #[test]
    fn sveltekit_needs_static_adapter_and_nuxt_needs_generate() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "package.json", &pkg(r#""@sveltejs/kit":"2""#, "vite build"));
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NotStatic));
        write(d.path(), "package.json", &pkg(r#""@sveltejs/kit":"2","@sveltejs/adapter-static":"3""#, "vite build"));
        assert_eq!(detect_dist(d.path()).unwrap().dist, "build");
        write(d.path(), "package.json", &pkg(r#""nuxt":"3""#, "nuxt build"));
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NotStatic));
        write(d.path(), "package.json", &pkg(r#""nuxt":"3""#, "nuxt generate"));
        assert_eq!(detect_dist(d.path()).unwrap().dist, ".output/public");
    }
    #[test]
    fn missing_or_hostile_package_json() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NoPackage));
        write(d.path(), "package.json", "{not json");
        assert_eq!(detect_dist(d.path()), Err(ArtifactError::NoPackage));
    }
    #[test]
    fn collects_sorted_hashed_stable_manifest() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "dist/index.html", "<h1>hi</h1>");
        write(d.path(), "dist/assets/app.js", "console.log(1)");
        write(d.path(), "dist/.well-known/security.txt", "x");
        let a = collect_static(d.path(), "dist").unwrap();
        let paths: Vec<_> = a.manifest.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, [".well-known/security.txt", "assets/app.js", "index.html"]);
        let idx = a.manifest.files.iter().find(|f| f.path == "index.html").unwrap();
        assert_eq!(idx.sha256, sha256(b"<h1>hi</h1>"));
        assert_eq!((idx.size, idx.mode), (11, 0o644));
        assert_eq!(a.manifest.kind, DeployArtifactKind::Static);
        let again = collect_static(d.path(), "dist").unwrap();
        assert_eq!(again.manifest.build_id, a.manifest.build_id);
        assert_eq!(a.manifest.digest().unwrap(), again.manifest.digest().unwrap());
        let bytes = a.files.iter().map(|f| (f.path.clone(), fs::read(&f.abs).unwrap())).collect();
        a.manifest.verify_bytes(&bytes).unwrap();
        write(d.path(), "dist/index.html", "<h1>bye</h1>");
        assert_ne!(collect_static(d.path(), "dist").unwrap().manifest.build_id, a.manifest.build_id);
    }
    #[test]
    fn rejects_missing_empty_and_indexless_dist() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(collect_static(d.path(), "dist").unwrap_err(), ArtifactError::DistMissing);
        fs::create_dir(d.path().join("dist")).unwrap();
        assert_eq!(collect_static(d.path(), "dist").unwrap_err(), ArtifactError::Empty);
        write(d.path(), "dist/a.js", "1");
        assert_eq!(collect_static(d.path(), "dist").unwrap_err(), ArtifactError::NoIndex);
        assert_eq!(collect_static(d.path(), "../x").unwrap_err(), ArtifactError::UnsafePath);
        assert_eq!(collect_static(d.path(), ".").unwrap_err(), ArtifactError::UnsafePath);
    }
    #[test]
    fn refuses_secret_looking_files_and_git() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "dist/index.html", "x");
        write(d.path(), "dist/.env.production", "TOKEN=1");
        assert_eq!(collect_static(d.path(), "dist").unwrap_err(), ArtifactError::Forbidden(".env.production".into()));
        fs::remove_file(d.path().join("dist/.env.production")).unwrap();
        write(d.path(), "dist/deploy.pem", "k");
        assert!(matches!(collect_static(d.path(), "dist"), Err(ArtifactError::Forbidden(_))));
        fs::remove_file(d.path().join("dist/deploy.pem")).unwrap();
        write(d.path(), "dist/.git/config", "c");
        assert!(matches!(collect_static(d.path(), "dist"), Err(ArtifactError::Forbidden(_))));
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_inside_and_as_dist() {
        use std::os::unix::fs::symlink;
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "dist/index.html", "x");
        write(d.path(), "secret.txt", "s");
        symlink(d.path().join("secret.txt"), d.path().join("dist/link.txt")).unwrap();
        assert_eq!(collect_static(d.path(), "dist").unwrap_err(), ArtifactError::Link("link.txt".into()));
        let e = tempfile::tempdir().unwrap();
        write(e.path(), "real/index.html", "x");
        symlink(e.path().join("real"), e.path().join("dist")).unwrap();
        assert_eq!(collect_static(e.path(), "dist").unwrap_err(), ArtifactError::Link("dist".into()));
    }
    #[test]
    fn error_text_never_holds_absolute_paths() {
        let d = tempfile::tempdir().unwrap();
        let err = collect_static(d.path(), "dist").unwrap_err().to_string();
        assert!(!err.contains(d.path().to_str().unwrap()));
    }
    #[test]
    fn spa_rules_have_the_fallback() {
        let r = spa_rules();
        assert!(r.nginx.contains("try_files $uri $uri/ /index.html"));
        assert!(r.apache.contains("RewriteRule ^ /index.html [L]"));
    }
    #[test]
    fn quoted_value_ignores_lookalike_keys() {
        assert_eq!(quoted_value("myoutDir: 'a' ; outDir = \"b\"", "outDir").as_deref(), Some("b"));
        assert_eq!(quoted_value("outDir: computed()", "outDir"), None);
    }
}
