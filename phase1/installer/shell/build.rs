use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

// CI passes the stock NSIS setup to embed. A release build without a payload must fail:
// an installer that silently installs nothing is worse than no installer.
fn main() {
    println!("cargo:rerun-if-env-changed=SOMNIA_NSIS_PAYLOAD");
    println!("cargo:rerun-if-env-changed=SOMNIA_INSTALLED_BYTES");
    println!("cargo:rerun-if-env-changed=SOMNIA_VERSION");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let release = env::var("PROFILE").map(|p| p == "release").unwrap_or(false);
    let (path, dev) = match env::var("SOMNIA_NSIS_PAYLOAD") {
        Ok(p) if !p.is_empty() => (fs::canonicalize(&p).unwrap_or_else(|_| panic!("SOMNIA_NSIS_PAYLOAD not found: {p}")), false),
        _ => {
            if release { panic!("release build needs SOMNIA_NSIS_PAYLOAD (path to the stock NSIS setup)"); }
            let p = out.join("dev-empty-payload.bin"); fs::write(&p, b"").unwrap(); (p, true)
        }
    };
    let bytes = fs::read(&path).unwrap();
    let sha: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    println!("cargo:rerun-if-changed={}", path.display());
    println!("cargo:rustc-env=SOMNIA_PAYLOAD_PATH={}", path.display());
    println!("cargo:rustc-env=SOMNIA_PAYLOAD_SHA256={sha}");
    println!("cargo:rustc-env=SOMNIA_PAYLOAD_IS_DEV={}", if dev { "1" } else { "0" });
    let installed = env::var("SOMNIA_INSTALLED_BYTES").ok().filter(|s| s.parse::<u64>().is_ok());
    if release && installed.is_none() { panic!("release build needs SOMNIA_INSTALLED_BYTES (measured installed size)"); }
    println!("cargo:rustc-env=SOMNIA_INSTALLED_BYTES={}", installed.unwrap_or_else(|| "0".into()));
    println!("cargo:rustc-env=SOMNIA_VERSION={}", env::var("SOMNIA_VERSION").unwrap_or_else(|_| "0.0.0-dev".into()));
    // License text comes from the repo LICENSE at build time (license-privacy-spec).
    let lic = fs::read_to_string("../../../LICENSE").expect("repo LICENSE");
    fs::write(out.join("LICENSE.txt"), lic).unwrap();
    println!("cargo:rerun-if-changed=../../../LICENSE");
}
