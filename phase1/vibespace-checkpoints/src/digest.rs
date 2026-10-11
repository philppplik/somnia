//! SHA-256 digest newtype.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest as _, Sha256};
use std::fmt;

/// A SHA-256 digest. Serialized as 64 lowercase hex characters.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Digest([u8; 32]);

/// Checkpoints are identified by the digest of their record object.
pub type CheckpointId = Digest;

impl Digest {
    pub fn of(bytes: &[u8]) -> Digest {
        let mut h = Sha256::new();
        h.update(bytes);
        Digest(h.finalize().into())
    }

    pub(crate) fn from_hasher(h: Sha256) -> Digest {
        Digest(h.finalize().into())
    }

    pub fn to_hex(&self) -> String {
        let mut s = String::with_capacity(64);
        for b in self.0 {
            s.push(char::from_digit((b >> 4) as u32, 16).unwrap());
            s.push(char::from_digit((b & 15) as u32, 16).unwrap());
        }
        s
    }

    pub fn from_hex(s: &str) -> Option<Digest> {
        let b = s.as_bytes();
        if b.len() != 64 {
            return None;
        }
        let mut out = [0u8; 32];
        for i in 0..32 {
            let hi = (b[2 * i] as char).to_digit(16)?;
            let lo = (b[2 * i + 1] as char).to_digit(16)?;
            // reject uppercase so that the textual form is canonical
            if b[2 * i].is_ascii_uppercase() || b[2 * i + 1].is_ascii_uppercase() {
                return None;
            }
            out[i] = (hi * 16 + lo) as u8;
        }
        Some(Digest(out))
    }
}

impl fmt::Display for Digest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_hex())
    }
}
impl fmt::Debug for Digest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Digest({})", self.to_hex())
    }
}
impl Serialize for Digest {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_hex())
    }
}
impl<'de> Deserialize<'de> for Digest {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Digest::from_hex(&s).ok_or_else(|| serde::de::Error::custom("invalid digest"))
    }
}
