//! Arguments digest: a domain-separated, length-prefixed SHA-256 over the action kind, the
//! canonical target and the effect arguments. Equal digests mean equal arguments.

use crate::action::ActionKind;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// SHA-256 digest of the arguments an approval is bound to.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ArgsDigest([u8; 32]);

impl ArgsDigest {
    /// Start a digest for `kind` and canonical `target`.
    pub fn builder(kind: ActionKind, target: &str) -> ArgsDigestBuilder {
        let mut h = Sha256::new();
        h.update(b"vibespace-policy/args/v1\0");
        h.update(kind.as_str().as_bytes());
        h.update([0u8]);
        let mut b = ArgsDigestBuilder { h };
        b.raw(target.as_bytes());
        b
    }

    /// Raw bytes.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Lower-case hex.
    pub fn to_hex(&self) -> String {
        let mut s = String::with_capacity(64);
        for b in self.0 {
            s.push_str(&format!("{b:02x}"));
        }
        s
    }

    /// First 8 hex chars, for audit lines and compact UI.
    pub fn short(&self) -> String {
        self.to_hex()[..8].to_string()
    }

    /// Parse 64 hex chars.
    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 64 || !s.is_ascii() {
            return None;
        }
        let mut out = [0u8; 32];
        for (i, o) in out.iter_mut().enumerate() {
            *o = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok()?;
        }
        Some(Self(out))
    }
}

impl fmt::Debug for ArgsDigest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ArgsDigest({})", self.short())
    }
}

impl Serialize for ArgsDigest {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for ArgsDigest {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        ArgsDigest::from_hex(&s).ok_or_else(|| serde::de::Error::custom("expected 64 hex chars"))
    }
}

/// Incremental digest builder.
pub struct ArgsDigestBuilder {
    h: Sha256,
}

impl ArgsDigestBuilder {
    fn raw(&mut self, bytes: &[u8]) {
        self.h.update((bytes.len() as u64).to_be_bytes());
        self.h.update(bytes);
    }

    /// Add a labelled argument. Label and value are length-prefixed, so
    /// `("a","bc")` and `("ab","c")` never collide.
    pub fn part(mut self, label: &str, value: &[u8]) -> Self {
        self.raw(label.as_bytes());
        self.raw(value);
        self
    }

    /// Finish.
    pub fn finish(self) -> ArgsDigest {
        ArgsDigest(self.h.finalize().into())
    }
}

/// SHA-256 of arbitrary bytes (used to bind file content).
pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

pub(crate) fn random<const N: usize>() -> Result<[u8; N], crate::error::PolicyError> {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).map_err(|_| crate::error::PolicyError::Entropy)?;
    Ok(buf)
}

/// Constant-time equality for secrets.
pub(crate) fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut d = 0u8;
    for (x, y) in a.iter().zip(b) {
        d |= x ^ y;
    }
    d == 0
}
