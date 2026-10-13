use super::{DeployError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MANIFEST_FILE: &str = ".somnia-manifest.json";
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeployArtifactKind {
    Static,
    Node,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeployArtifactFile {
    pub path: String,
    pub sha256: String,
    pub size: u64,
    pub mode: u32,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeployArtifactManifest {
    pub kind: DeployArtifactKind,
    pub files: Vec<DeployArtifactFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engines: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    pub build_id: String,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployArtifactDiff {
    pub added: Vec<DeployArtifactFile>,
    pub changed: Vec<DeployArtifactFile>,
    pub removed: Vec<DeployArtifactFile>,
    pub unchanged: Vec<DeployArtifactFile>,
    pub upload_bytes: u64,
}
pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn sha256_bytes(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
pub fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
/// Reject ambiguity, traversal, Windows paths and secrets before any upload.
pub fn validate_path(path: &str, kind: DeployArtifactKind) -> Result<()> {
    if path.is_empty()
        || path.len() > 4096
        || path.contains(['\\', ':'])
        || path.chars().any(char::is_control)
    {
        return Err(DeployError::InvalidInput);
    }
    let parts: Vec<_> = path.split('/').collect();
    for part in &parts {
        let lower = part.to_ascii_lowercase();
        if part.is_empty()
            || matches!(*part, "." | "..")
            || lower == ".git"
            || lower == ".ssh"
            || lower.starts_with(".env")
            || lower == MANIFEST_FILE
            || lower == ".somnia"
            || matches!(
                lower.as_str(),
                "id_rsa" | "id_ed25519" | "id_ecdsa" | "id_dsa"
            )
            || lower.ends_with(".pem")
            || lower.ends_with(".key")
            || lower.ends_with(".p12")
            || lower.ends_with(".pfx")
            || (kind == DeployArtifactKind::Static && lower == "node_modules")
        {
            return Err(DeployError::InvalidInput);
        }
    }
    Ok(())
}
impl DeployArtifactManifest {
    pub fn validate(&self) -> Result<()> {
        if !valid_id(&self.build_id)
            || self.files.is_empty()
            || self.files.len() > 100_000
            || self.port == Some(0)
        {
            return Err(DeployError::InvalidInput);
        }
        let mut paths = BTreeSet::new();
        let mut total = 0u64;
        for file in &self.files {
            validate_path(&file.path, self.kind)?;
            if !paths.insert(file.path.as_str())
                || file.sha256.len() != 64
                || !file
                    .sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                || !matches!(file.mode, 0o644 | 0o755)
            {
                return Err(DeployError::InvalidInput);
            }
            total = total
                .checked_add(file.size)
                .ok_or(DeployError::InvalidInput)?;
        }
        // A file cannot also be the parent directory of another file.
        for path in &paths {
            for (i, _) in path.match_indices('/') {
                if paths.contains(&path[..i]) {
                    return Err(DeployError::InvalidInput);
                }
            }
        }
        if self.kind == DeployArtifactKind::Node && self.entry.is_none() {
            return Err(DeployError::InvalidInput);
        }
        if let Some(entry) = &self.entry {
            validate_path(entry, self.kind)?;
            if !paths.contains(entry.as_str()) {
                return Err(DeployError::InvalidInput);
            }
        }
        if let Some(engines) = &self.engines {
            if engines.len() > 16
                || engines.iter().any(|(k, v)| {
                    k.is_empty()
                        || k.len() > 64
                        || v.is_empty()
                        || v.len() > 128
                        || k.chars().chain(v.chars()).any(char::is_control)
                })
            {
                return Err(DeployError::InvalidInput);
            }
        }
        Ok(())
    }
    /// Canonical digest for approval binding: independent of file iteration order.
    pub fn digest(&self) -> Result<String> {
        self.validate()?;
        let mut canonical = self.clone();
        canonical.files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(sha256(
            &serde_json::to_vec(&canonical).map_err(|_| DeployError::InvalidInput)?,
        ))
    }
    pub fn verify_bytes(&self, files: &BTreeMap<String, Vec<u8>>) -> Result<()> {
        self.validate()?;
        if files.len() != self.files.len() {
            return Err(DeployError::Integrity);
        }
        for file in &self.files {
            let bytes = files.get(&file.path).ok_or(DeployError::Integrity)?;
            if bytes.len() as u64 != file.size || sha256(bytes) != file.sha256 {
                return Err(DeployError::Integrity);
            }
        }
        Ok(())
    }
}
pub fn diff(
    previous: Option<&DeployArtifactManifest>,
    next: &DeployArtifactManifest,
) -> Result<DeployArtifactDiff> {
    next.validate()?;
    if let Some(old) = previous {
        old.validate()?;
    }
    let mut old: BTreeMap<_, _> = previous
        .into_iter()
        .flat_map(|m| &m.files)
        .map(|f| (f.path.as_str(), f))
        .collect();
    let mut out = DeployArtifactDiff::default();
    let mut files = next.files.iter().collect::<Vec<_>>();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    for file in files {
        match old.remove(file.path.as_str()) {
            Some(prior) if prior == file => out.unchanged.push(file.clone()),
            Some(_) => {
                out.upload_bytes = out
                    .upload_bytes
                    .checked_add(file.size)
                    .ok_or(DeployError::InvalidInput)?;
                out.changed.push(file.clone());
            }
            None => {
                out.upload_bytes = out
                    .upload_bytes
                    .checked_add(file.size)
                    .ok_or(DeployError::InvalidInput)?;
                out.added.push(file.clone());
            }
        }
    }
    out.removed = old.into_values().cloned().collect();
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    pub fn fixture(value: &[u8]) -> DeployArtifactManifest {
        DeployArtifactManifest {
            kind: DeployArtifactKind::Static,
            files: vec![DeployArtifactFile {
                path: "index.html".into(),
                sha256: sha256(value),
                size: value.len() as u64,
                mode: 0o644,
            }],
            entry: None,
            engines: None,
            port: None,
            build_id: "build-1".into(),
        }
    }
    #[test]
    fn rejects_unsafe_paths_and_permissions() {
        for path in [
            "../a",
            "/a",
            "a//b",
            "C:/a",
            "a\\b",
            ".env.production",
            "x/.git/config",
            "id_rsa",
            "a.pem",
            ".somnia-manifest.json",
            "node_modules/a",
            "a\n",
        ] {
            assert!(
                validate_path(path, DeployArtifactKind::Static).is_err(),
                "{path}"
            );
        }
        let mut m = fixture(b"ok");
        m.files[0].mode = 0o4755;
        assert!(m.validate().is_err());
        m.files[0].mode = 0o644;
        m.files.push(m.files[0].clone());
        assert!(m.validate().is_err());
    }
    #[test]
    fn exact_artifact_and_node_entry() {
        let mut m = fixture(b"ok");
        let files = BTreeMap::from([("index.html".into(), b"ok".to_vec())]);
        assert!(m.verify_bytes(&files).is_ok());
        assert!(m
            .verify_bytes(&BTreeMap::from([("index.html".into(), b"no".to_vec())]))
            .is_err());
        m.kind = DeployArtifactKind::Node;
        assert!(m.validate().is_err());
        m.entry = Some("index.html".into());
        assert!(m.validate().is_ok());
    }
    #[test]
    fn diff_hash_mode_and_removal() {
        let old = fixture(b"old");
        let mut next = fixture(b"new");
        assert_eq!(diff(Some(&old), &next).unwrap().changed.len(), 1);
        next = old.clone();
        next.files[0].mode = 0o755;
        assert_eq!(diff(Some(&old), &next).unwrap().changed.len(), 1);
        next.files[0].path = "other.html".into();
        let d = diff(Some(&old), &next).unwrap();
        assert_eq!((d.added.len(), d.removed.len(), d.upload_bytes), (1, 1, 3));
    }
    #[test]
    fn wire_contract_and_canonical_digest() {
        let mut a = fixture(b"ok");
        let mut extra = a.files[0].clone();
        extra.path = "css/a.css".into();
        a.files.push(extra);
        let mut b = a.clone();
        b.files.reverse();
        assert_eq!(a.digest().unwrap(), b.digest().unwrap());
        let json = serde_json::to_value(a).unwrap();
        assert_eq!(json["kind"], "static");
        assert!(json.get("buildId").is_some());
        assert!(json.get("entry").is_none());
    }
}

#[cfg(test)]
mod edge_tests {
    use super::*;
    #[test]
    fn collision_and_secret_artifact_rejected() {
        let file = DeployArtifactFile {
            path: "public".into(),
            sha256: sha256(b"ok"),
            size: 2,
            mode: 0o644,
        };
        let mut child = file.clone();
        child.path = "public/index.html".into();
        let manifest = DeployArtifactManifest {
            kind: DeployArtifactKind::Static,
            files: vec![file, child],
            entry: None,
            engines: None,
            port: None,
            build_id: "build".into(),
        };
        assert!(manifest.validate().is_err());
        assert!(validate_path("node_modules/package/index.js", DeployArtifactKind::Node).is_ok());
        assert!(validate_path("node_modules/package/.env", DeployArtifactKind::Node).is_err());
    }
    #[test]
    fn node_contract_roundtrip() {
        let manifest = DeployArtifactManifest {
            kind: DeployArtifactKind::Node,
            files: vec![DeployArtifactFile {
                path: "server.js".into(),
                sha256: sha256(b"server"),
                size: 6,
                mode: 0o755,
            }],
            entry: Some("server.js".into()),
            engines: Some(BTreeMap::from([("node".into(), ">=22".into())])),
            port: Some(3000),
            build_id: "node-build".into(),
        };
        let bytes = serde_json::to_vec(&manifest).unwrap();
        assert_eq!(
            serde_json::from_slice::<DeployArtifactManifest>(&bytes).unwrap(),
            manifest
        );
        assert!(manifest.validate().is_ok());
    }
}
