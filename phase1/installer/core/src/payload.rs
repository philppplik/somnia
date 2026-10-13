use crate::errors::InstallError;
use sha2::{Digest, Sha256};

/// Verify embedded payload bytes against the SHA256 baked into the bootstrapper at build time.
pub fn verify_sha256(bytes: &[u8], expected_hex: &str) -> Result<(), InstallError> {
    let got = hex(&Sha256::digest(bytes));
    if got.eq_ignore_ascii_case(expected_hex.trim()) {
        Ok(())
    } else {
        Err(InstallError::CorruptPayload)
    }
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Where the payload comes from. v1 ships Embedded only; Download is v2 (owner decision),
/// its error path (SOM-NET-01) is implemented and testable via `Source::Download` + a failing fetcher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    Embedded,
    Download { url: String },
}

pub trait Fetcher {
    fn fetch(&self, url: &str) -> Result<Vec<u8>, ()>;
}

pub fn obtain(
    src: &Source,
    embedded: &[u8],
    fetcher: &dyn Fetcher,
) -> Result<Vec<u8>, InstallError> {
    match src {
        Source::Embedded => Ok(embedded.to_vec()),
        Source::Download { url } => fetcher.fetch(url).map_err(|_| InstallError::Download),
    }
}
