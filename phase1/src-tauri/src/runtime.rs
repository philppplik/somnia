//! Explicit-consent, pinned Node helper. Never searches PATH or a project for executables.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
pub const VERSION: &str = "24.21.0";
const DOWNLOAD_LIMIT: u64 = 100 * 1024 * 1024;
static INSTALL_LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub installed: bool,
    pub version: &'static str,
    pub download_bytes: u64,
    pub supported: bool,
}
fn platform() -> Option<(&'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some((
            "win-x64.zip",
            "158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541",
        )),
        ("windows", "aarch64") => Some((
            "win-arm64.zip",
            "8779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921",
        )),
        ("linux", "x86_64") => Some((
            "linux-x64.tar.gz",
            "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
        )),
        ("linux", "aarch64") => Some((
            "linux-arm64.tar.gz",
            "724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5",
        )),
        ("macos", "x86_64") => Some((
            "darwin-x64.tar.gz",
            "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
        )),
        ("macos", "aarch64") => Some((
            "darwin-arm64.tar.gz",
            "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
        )),
        _ => None,
    }
}
fn root(base: &Path) -> PathBuf {
    base.join("framework-runtime").join(VERSION)
}
pub fn paths(base: &Path) -> std::result::Result<(PathBuf, PathBuf), String> {
    let root = root(base);
    let node = root.join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    });
    let npm = root.join(if cfg!(windows) {
        "node_modules/npm/bin/npm-cli.js"
    } else {
        "lib/node_modules/npm/bin/npm-cli.js"
    });
    if !root.join("verified.json").is_file() || !node.is_file() || !npm.is_file() {
        return Err("frameworks.helperMissing".into());
    }
    Ok((node, npm))
}
pub fn status(base: &Path) -> RuntimeStatus {
    RuntimeStatus {
        installed: paths(base).is_ok(),
        version: VERSION,
        download_bytes: 40 * 1024 * 1024,
        supported: platform().is_some(),
    }
}
pub fn verify(bytes: &[u8], expected: &str) -> bool {
    format!("{:x}", Sha256::digest(bytes)) == expected
}
fn relative(path: &Path) -> std::result::Result<PathBuf, String> {
    let mut parts = path.components();
    if !matches!(parts.next(), Some(Component::Normal(_))) {
        return Err("frameworks.invalidArchive".into());
    }
    let mut result = PathBuf::new();
    for part in parts {
        match part {
            Component::Normal(p) => result.push(p),
            _ => return Err("frameworks.invalidArchive".into()),
        }
    }
    Ok(result)
}
fn extract(bytes: &[u8], destination: &Path, zip: bool) -> std::result::Result<(), String> {
    let mut total = 0u64;
    let mut count = 0usize;
    let mut save = |path: &Path,
                    size: u64,
                    reader: &mut dyn Read,
                    executable: bool|
     -> std::result::Result<(), String> {
        count += 1;
        total = total.checked_add(size).ok_or("frameworks.invalidArchive")?;
        if count > 20000 || total > 500 * 1024 * 1024 || size > 200 * 1024 * 1024 {
            return Err("frameworks.invalidArchive".into());
        }
        let relative = relative(path)?;
        if relative.as_os_str().is_empty() {
            return Ok(());
        }
        let target = destination.join(relative);
        fs::create_dir_all(target.parent().ok_or("frameworks.invalidArchive")?)
            .map_err(|_| "frameworks.installFailed")?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|_| "frameworks.installFailed")?;
        let written = std::io::copy(&mut reader.take(size + 1), &mut file)
            .map_err(|_| "frameworks.installFailed")?;
        if written != size {
            return Err("frameworks.invalidArchive".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                &target,
                fs::Permissions::from_mode(if executable { 0o755 } else { 0o644 }),
            )
            .map_err(|_| "frameworks.installFailed")?;
        }
        #[cfg(not(unix))]
        let _ = executable;
        Ok(())
    };
    if zip {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|_| "frameworks.invalidArchive")?;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|_| "frameworks.invalidArchive")?;
            if entry.is_dir() {
                continue;
            }
            if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
                continue;
            }
            let path = entry
                .enclosed_name()
                .ok_or("frameworks.invalidArchive")?
                .to_owned();
            let size = entry.size();
            save(&path, size, &mut entry, false)?;
        }
    } else {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
        for entry in archive.entries().map_err(|_| "frameworks.invalidArchive")? {
            let mut entry = entry.map_err(|_| "frameworks.invalidArchive")?;
            if !entry.header().entry_type().is_file() {
                continue;
            } // npm links unnecessary: invoke npm-cli.js directly.
            let path = entry
                .path()
                .map_err(|_| "frameworks.invalidArchive")?
                .into_owned();
            let size = entry.size();
            let executable = entry.header().mode().unwrap_or(0) & 0o111 != 0;
            save(&path, size, &mut entry, executable)?;
        }
    }
    Ok(())
}
#[cfg(feature = "desktop")]
pub fn install(base: &Path) -> std::result::Result<RuntimeStatus, String> {
    let _lock = INSTALL_LOCK.lock().map_err(|_| "frameworks.busy")?;
    if status(base).installed {
        return Ok(status(base));
    }
    let (name, hash) = platform().ok_or("frameworks.unsupported")?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "frameworks.downloadFailed")?;
    let mut response = client
        .get(format!(
            "https://nodejs.org/dist/v{VERSION}/node-v{VERSION}-{name}"
        ))
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| "frameworks.downloadFailed")?;
    if response
        .content_length()
        .is_some_and(|n| n > DOWNLOAD_LIMIT)
    {
        return Err("frameworks.downloadFailed".into());
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(DOWNLOAD_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "frameworks.downloadFailed")?;
    if bytes.len() as u64 > DOWNLOAD_LIMIT || !verify(&bytes, hash) {
        return Err("frameworks.hashMismatch".into());
    }
    let target = root(base);
    let temporary = base
        .join("framework-runtime")
        .join(format!("install-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temporary).map_err(|_| "frameworks.installFailed")?;
    let result = (|| {
        extract(&bytes, &temporary, name.ends_with(".zip"))?;
        fs::File::create(temporary.join("verified.json"))
            .and_then(|mut f| {
                f.write_all(
                    format!("{{\"version\":\"{VERSION}\",\"sha256\":\"{hash}\"}}").as_bytes(),
                )
            })
            .map_err(|_| "frameworks.installFailed")?;
        paths_at(&temporary)?;
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|_| "frameworks.installFailed")?;
        }
        fs::rename(&temporary, target).map_err(|_| "frameworks.installFailed")?;
        Ok(status(base))
    })();
    let _ = fs::remove_dir_all(temporary);
    result
}
fn paths_at(root: &Path) -> std::result::Result<(), String> {
    for path in [
        if cfg!(windows) {
            "node.exe"
        } else {
            "bin/node"
        },
        if cfg!(windows) {
            "node_modules/npm/bin/npm-cli.js"
        } else {
            "lib/node_modules/npm/bin/npm-cli.js"
        },
    ] {
        if !root.join(path).is_file() {
            return Err("frameworks.invalidArchive".into());
        }
    }
    Ok(())
}
pub fn remove(base: &Path) -> std::result::Result<RuntimeStatus, String> {
    let _lock = INSTALL_LOCK.lock().map_err(|_| "frameworks.busy")?;
    let parent = base.join("framework-runtime");
    if parent.exists() {
        fs::remove_dir_all(parent).map_err(|_| "frameworks.removeFailed")?;
    }
    Ok(status(base))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hash_rejects_wrong_and_truncated() {
        let hash = format!("{:x}", Sha256::digest(b"canary"));
        assert!(verify(b"canary", &hash));
        assert!(!verify(b"canar", &hash));
        assert!(!verify(b"wrong", &hash));
    }
    #[test]
    fn archive_paths_are_confined() {
        assert_eq!(
            relative(Path::new("node-v/bin/node")).unwrap(),
            PathBuf::from("bin/node")
        );
        assert!(relative(Path::new("node-v/../evil")).is_err());
        assert!(relative(Path::new("/tmp/evil")).is_err());
    }
    #[test]
    fn absent_runtime_is_not_a_path_fallback() {
        let d = tempfile::tempdir().unwrap();
        assert!(!status(d.path()).installed);
        assert!(paths(d.path()).is_err());
    }
}
