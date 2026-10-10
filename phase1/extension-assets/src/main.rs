//! One release per process. Supervisor must supply resource isolation and timeout.
use serde::Deserialize;
use std::io::{Read, Write};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    package_digest: String,
    sources: Vec<somnia_extension_assets::Source>,
}
fn main() {
    let mut bytes = Vec::new();
    let result = std::io::stdin()
        .take(100 * 1_048_576 + 1)
        .read_to_end(&mut bytes);
    if result.is_err() || bytes.len() > 100 * 1_048_576 {
        std::process::exit(2);
    }
    let request: Request = match serde_json::from_slice(&bytes) {
        Ok(r) => r,
        Err(_) => {
            std::process::exit(2);
        }
    };
    let response =
        somnia_extension_assets::convert_release(&request.package_digest, &request.sources);
    // Write one JSON value only, after the complete release validates. Errors do
    // not leak XML/HTML bodies or a partial inventory.
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    if serde_json::to_writer(&mut out, &response).is_err() || out.flush().is_err() {
        std::process::exit(2);
    }
    if response.is_err() {
        std::process::exit(1);
    }
}
