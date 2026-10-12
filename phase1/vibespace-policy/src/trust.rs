//! Extension and MCP trust model: publisher, review, content digest and runtime permissions as
//! four separate axes, a pinned minisign catalog for publisher signatures, signed and sequenced
//! revocations, and a restricted default for everything newly installed.
//!
//! None of the axes implies another. A verified publisher says nothing about review state, a
//! review says nothing about runtime permissions, and none of them changes what the policy
//! broker allows: broker consent stays the only path to any effect. Trust data is shown to the
//! user and decides what may be installed, listed or offered at all.
//!
//! Signature format: [minisign](https://jedisct1.github.io/minisign/) payloads. Only the pure
//! Ed25519 algorithm (`Ed`) is accepted; the prehashed variant (`ED`), unknown key numbers and
//! malformed payloads fail closed. Verification uses `ring`.

use crate::action::SkillTrust;
use crate::digest::ArgsDigest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fmt;

/// minisign algorithm tag for pure Ed25519 ("Ed"). The prehashed variant ("ED") is rejected.
const ALG_ED25519: [u8; 2] = [0x45, 0x64];
/// Domain separator for the bytes a revocation signature covers.
const REVOCATION_DOMAIN: &[u8] = b"vibespace-policy/revocation/v1\0";

/// Errors of the trust layer. Fail closed: every malformed input is an error, never a skip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustError {
    /// A base64 payload is malformed or has the wrong length.
    Malformed,
    /// An unsupported algorithm tag (anything but pure Ed25519 `Ed`).
    UnsupportedAlgorithm,
    /// The signature's key number matches no pinned catalog key.
    UnknownKey,
    /// The signature does not verify for the pinned key and message.
    InvalidSignature,
    /// The signing key or the subject was revoked.
    Revoked,
    /// Revocation sequence is not exactly the next expected one (gap or replay).
    Sequence,
    /// A trust string field failed validation.
    InvalidField(&'static str),
}

impl fmt::Display for TrustError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            TrustError::Malformed => "malformed trust payload",
            TrustError::UnsupportedAlgorithm => "unsupported signature algorithm",
            TrustError::UnknownKey => "signature key is not in the pinned catalog",
            TrustError::InvalidSignature => "signature does not verify",
            TrustError::Revoked => "key or subject is revoked",
            TrustError::Sequence => "revocation sequence out of order",
            TrustError::InvalidField(w) => return write!(f, "invalid trust field: {w}"),
        })
    }
}

impl std::error::Error for TrustError {}

// ---------------------------------------------------------------------------
// Axis 1: publisher. Axis 2: review. Axis 3: content digest. Axis 4: permissions.
// ---------------------------------------------------------------------------

/// Axis 1: who signed the artifact. Says nothing about review or permissions.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublisherTrust {
    /// No accepted signature.
    Unverified,
    /// Signature verified against a pinned catalog key; carries the minisign key number.
    Verified {
        /// minisign key number (8 bytes) of the signing key.
        keynum: [u8; 8],
    },
}

/// Axis 2: review state. Set by a review process, never inferred from the publisher axis.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState {
    /// Nobody looked at it. The default.
    #[default]
    Unreviewed,
    /// Automated checks ran and passed. Never a safety guarantee.
    Scanned,
    /// A reviewer accepted this exact version.
    Reviewed,
}

/// Axis 3: the content digest pinned at install or consent time. A changed artifact does not
/// match the pin anymore; callers must drop any approval derived from it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PinnedDigest(pub ArgsDigest);

impl PinnedDigest {
    /// True when the current artifact still matches the pin.
    pub fn matches(&self, current: &ArgsDigest) -> bool {
        &self.0 == current
    }
}

/// One runtime permission an extension or MCP server may be granted. Kept deliberately coarse;
/// the broker's per-effect consent is the real gate, these permissions decide what a runtime may
/// even offer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimePermission {
    /// Spawn a process (only ever via `ProcessExecutor::propose_exec`).
    SpawnProcess,
    /// Reach the network (only ever via `NetworkExecutor::propose_fetch` / `DomainProxy`).
    NetworkEgress,
    /// Read files outside its own package.
    ReadFilesystem,
    /// Write files.
    WriteFilesystem,
    /// Read the clipboard.
    ReadClipboard,
    /// Write the clipboard.
    WriteClipboard,
}

/// Axis 4: explicitly granted runtime permissions. The default is restricted: empty.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimePermissions(BTreeSet<RuntimePermission>);

impl RuntimePermissions {
    /// The restricted default: nothing granted.
    pub fn restricted() -> Self {
        Self(BTreeSet::new())
    }
    /// Grant one permission. Granting is an explicit host/user act; nothing calls this on
    /// install by default.
    pub fn grant(&mut self, p: RuntimePermission) {
        self.0.insert(p);
    }
    /// True only when `p` was explicitly granted.
    pub fn permits(&self, p: RuntimePermission) -> bool {
        self.0.contains(&p)
    }
    /// Number of granted permissions.
    pub fn len(&self) -> usize {
        self.0.len()
    }
    /// True when restricted (no permissions).
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// The four trust axes of one installed extension or MCP server. Constructing the default gives
/// the restricted posture: unverified publisher, unreviewed, no pinned digest, no permissions.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrustPosture {
    /// Axis 1.
    pub publisher: PublisherTrust,
    /// Axis 2.
    pub review: ReviewState,
    /// Axis 3: digest pinned at install/consent. `None` until pinned.
    pub digest: Option<PinnedDigest>,
    /// Axis 4.
    pub permissions: RuntimePermissions,
}

impl Default for PublisherTrust {
    fn default() -> Self {
        PublisherTrust::Unverified
    }
}

impl TrustPosture {
    /// The posture every new extension or MCP server starts with.
    pub fn restricted() -> Self {
        Self::default()
    }
    /// True when the pinned digest still matches the current artifact. Without a pin, or after
    /// any change, false: approvals derived from the pin must not be honoured.
    pub fn digest_intact(&self, current: &ArgsDigest) -> bool {
        self.digest.map(|d| d.matches(current)).unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Pinned minisign catalog.
// ---------------------------------------------------------------------------

/// Strict base64 (standard alphabet, padding required, no whitespace, no URL-safe chars).
fn b64_decode(s: &str) -> Result<Vec<u8>, TrustError> {
    let bytes = s.as_bytes();
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return Err(TrustError::Malformed);
    }
    let val = |b: u8| -> Result<u8, TrustError> {
        match b {
            b'A'..=b'Z' => Ok(b - b'A'),
            b'a'..=b'z' => Ok(b - b'a' + 26),
            b'0'..=b'9' => Ok(b - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(TrustError::Malformed),
        }
    };
    let pad = bytes.iter().rev().take_while(|&&b| b == b'=').count();
    if pad > 2 || bytes[..bytes.len() - pad].contains(&b'=') {
        return Err(TrustError::Malformed);
    }
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for chunk in bytes.chunks(4) {
        let mut acc = 0u32;
        for (i, &b) in chunk.iter().enumerate() {
            let v = if i >= 4 - pad && pad > 0 && b == b'=' { 0 } else { val(b)? as u32 };
            acc = (acc << 6) | v;
        }
        out.push((acc >> 16) as u8);
        if !(pad == 2 && chunk[3] == b'=') {
            out.push((acc >> 8) as u8);
        }
        if !(pad >= 1 && chunk[3] == b'=') {
            out.push(acc as u8);
        }
    }
    Ok(out)
}

/// One pinned catalog key: a minisign Ed25519 public key with its 8-byte key number.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CatalogKey {
    /// minisign key number.
    pub keynum: [u8; 8],
    /// Ed25519 public key (32 bytes).
    public_key: [u8; 32],
}

impl CatalogKey {
    /// Parse the base64 payload line of a minisign public key file (`Ed` || keynum || key).
    pub fn from_minisign_public(payload_b64: &str) -> Result<Self, TrustError> {
        let raw = b64_decode(payload_b64)?;
        if raw.len() != 42 || raw[..2] != ALG_ED25519 {
            return Err(if raw.len() >= 2 && raw[..2] != ALG_ED25519 {
                TrustError::UnsupportedAlgorithm
            } else {
                TrustError::Malformed
            });
        }
        let mut keynum = [0u8; 8];
        let mut public_key = [0u8; 32];
        keynum.copy_from_slice(&raw[2..10]);
        public_key.copy_from_slice(&raw[10..42]);
        Ok(Self { keynum, public_key })
    }
}

/// A parsed minisign signature payload, verified to belong to a pinned key.
struct ParsedSignature {
    keynum: [u8; 8],
    signature: [u8; 64],
}

fn parse_signature(payload_b64: &str) -> Result<ParsedSignature, TrustError> {
    let raw = b64_decode(payload_b64)?;
    if raw.len() != 74 {
        return Err(TrustError::Malformed);
    }
    if raw[..2] != ALG_ED25519 {
        // Covers the prehashed "ED" variant and anything else: fail closed.
        return Err(TrustError::UnsupportedAlgorithm);
    }
    let mut keynum = [0u8; 8];
    let mut signature = [0u8; 64];
    keynum.copy_from_slice(&raw[2..10]);
    signature.copy_from_slice(&raw[10..74]);
    Ok(ParsedSignature { keynum, signature })
}

/// The pinned set of trusted minisign keys. Keys are embedded by the host (never loaded from a
/// server or an artifact), so an artifact cannot smuggle in its own trust anchor.
#[derive(Clone, Debug, Default)]
pub struct PinnedCatalog {
    keys: Vec<CatalogKey>,
    revocation_keynums: BTreeSet<[u8; 8]>,
}

impl PinnedCatalog {
    /// Empty catalog: verifies nothing. Every verify call fails closed with `UnknownKey`.
    pub fn new() -> Self {
        Self::default()
    }
    /// Add one pinned key.
    pub fn add_key(&mut self, key: CatalogKey) {
        if !self.keys.iter().any(|k| k.keynum == key.keynum) {
            self.keys.push(key);
        }
    }
    /// Mark a pinned key as a revocation authority. Only these keys may sign revocations.
    pub fn trust_for_revocations(&mut self, keynum: [u8; 8]) {
        self.revocation_keynums.insert(keynum);
    }
    /// True when `keynum` is pinned and allowed to sign revocations.
    pub fn is_revocation_key(&self, keynum: &[u8; 8]) -> bool {
        self.revocation_keynums.contains(keynum)
    }
    fn key(&self, keynum: &[u8; 8]) -> Option<&CatalogKey> {
        self.keys.iter().find(|k| &k.keynum == keynum)
    }
    /// Verify `signature_b64` (minisign signature payload) over `message` against the pinned
    /// keys. Returns the signer on success. Revocation state is checked by the caller
    /// (`assess_publisher`, `RevocationList::apply`) which has the list.
    pub fn verify(&self, message: &[u8], signature_b64: &str) -> Result<PublisherTrust, TrustError> {
        let sig = parse_signature(signature_b64)?;
        let key = self.key(&sig.keynum).ok_or(TrustError::UnknownKey)?;
        let pk = ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, key.public_key);
        pk.verify(message, &sig.signature)
            .map_err(|_| TrustError::InvalidSignature)?;
        Ok(PublisherTrust::Verified { keynum: sig.keynum })
    }
}

/// Verify a publisher signature, honouring revocations: a revoked key never verifies.
pub fn assess_publisher(
    catalog: &PinnedCatalog,
    revocations: &RevocationList,
    message: &[u8],
    signature_b64: &str,
) -> Result<PublisherTrust, TrustError> {
    let signer = catalog.verify(message, signature_b64)?;
    if let PublisherTrust::Verified { keynum } = signer {
        if revocations.publisher_key_revoked(&keynum) {
            return Err(TrustError::Revoked);
        }
    }
    Ok(signer)
}

// ---------------------------------------------------------------------------
// Signed, sequenced revocations.
// ---------------------------------------------------------------------------

/// What a revocation withdraws.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RevocationSubject {
    /// A publisher key: every artifact signed by it stops verifying.
    PublisherKey {
        /// minisign key number.
        keynum: [u8; 8],
    },
    /// One package of one publisher, all versions.
    Package {
        /// Publisher id (1-64 chars: `a-z 0-9 . - _`).
        publisher: String,
        /// Package id (1-64 chars: `a-z 0-9 . - _`).
        name: String,
    },
    /// One exact version of a package, by content digest.
    Version {
        /// Publisher id.
        publisher: String,
        /// Package id.
        name: String,
        /// Content digest of the revoked artifact.
        digest: ArgsDigest,
    },
}

fn valid_id(s: &str, what: &'static str) -> Result<(), TrustError> {
    let ok = !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'-' | b'_'));
    if ok {
        Ok(())
    } else {
        Err(TrustError::InvalidField(what))
    }
}

impl RevocationSubject {
    fn canonical(&self, out: &mut Vec<u8>) {
        let put = |out: &mut Vec<u8>, s: &str| {
            out.extend_from_slice(&(s.len() as u32).to_be_bytes());
            out.extend_from_slice(s.as_bytes());
        };
        match self {
            RevocationSubject::PublisherKey { keynum } => {
                out.push(1);
                out.extend_from_slice(keynum);
            }
            RevocationSubject::Package { publisher, name } => {
                out.push(2);
                put(out, publisher);
                put(out, name);
            }
            RevocationSubject::Version {
                publisher,
                name,
                digest,
            } => {
                out.push(3);
                put(out, publisher);
                put(out, name);
                out.extend_from_slice(digest.as_bytes());
            }
        }
    }
    fn validate(&self) -> Result<(), TrustError> {
        match self {
            RevocationSubject::PublisherKey { .. } => Ok(()),
            RevocationSubject::Package { publisher, name }
            | RevocationSubject::Version { publisher, name, .. } => {
                valid_id(publisher, "publisher")?;
                valid_id(name, "name")
            }
        }
    }
}

/// One signed revocation. The signature covers `DOMAIN || sequence || canonical subject`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Revocation {
    /// Strict sequence number. The first revocation ever applied is 1.
    pub sequence: u64,
    /// What is revoked.
    pub subject: RevocationSubject,
    /// minisign signature payload (base64) by a pinned revocation key.
    pub signature: String,
}

impl Revocation {
    /// The exact bytes the signature must cover.
    pub fn signed_bytes(sequence: u64, subject: &RevocationSubject) -> Vec<u8> {
        let mut out = Vec::with_capacity(64);
        out.extend_from_slice(REVOCATION_DOMAIN);
        out.extend_from_slice(&sequence.to_be_bytes());
        subject.canonical(&mut out);
        out
    }
}

/// The applied revocation stream. Append-only, strictly sequenced: a gap, a replay or a bad
/// signature is rejected and changes nothing.
#[derive(Clone, Debug, Default)]
pub struct RevocationList {
    next_expected: u64,
    subjects: BTreeSet<RevocationSubject>,
}

impl RevocationList {
    /// Empty list: nothing revoked, expecting sequence 1.
    pub fn new() -> Self {
        Self {
            next_expected: 1,
            subjects: BTreeSet::new(),
        }
    }
    /// The sequence the next applied revocation must carry.
    pub fn next_expected(&self) -> u64 {
        self.next_expected
    }
    /// Verify and apply one revocation. The signer must be a pinned revocation key that is not
    /// itself revoked, and the sequence must be exactly the next expected one.
    pub fn apply(&mut self, rev: &Revocation, catalog: &PinnedCatalog) -> Result<(), TrustError> {
        rev.subject.validate()?;
        if rev.sequence != self.next_expected {
            return Err(TrustError::Sequence);
        }
        let bytes = Revocation::signed_bytes(rev.sequence, &rev.subject);
        let signer = catalog.verify(&bytes, &rev.signature)?;
        let PublisherTrust::Verified { keynum } = signer else {
            return Err(TrustError::InvalidSignature);
        };
        if !catalog.is_revocation_key(&keynum) {
            // A regular publisher key must not mint revocations.
            return Err(TrustError::UnknownKey);
        }
        if self.publisher_key_revoked(&keynum) {
            return Err(TrustError::Revoked);
        }
        self.subjects.insert(rev.subject.clone());
        self.next_expected += 1;
        Ok(())
    }
    /// True when this exact subject was revoked.
    pub fn is_revoked(&self, subject: &RevocationSubject) -> bool {
        self.subjects.contains(subject)
    }
    /// True when a publisher key was revoked.
    pub fn publisher_key_revoked(&self, keynum: &[u8; 8]) -> bool {
        self.subjects
            .contains(&RevocationSubject::PublisherKey { keynum: *keynum })
    }
    /// Number of applied revocations.
    pub fn len(&self) -> usize {
        self.subjects.len()
    }
    /// True when nothing is revoked.
    pub fn is_empty(&self) -> bool {
        self.subjects.is_empty()
    }
}

// ---------------------------------------------------------------------------
// Skill script gate (trust badge logic, concept 4.4).
// ---------------------------------------------------------------------------

/// Whether a skill's scripts may run at all, and under which consent shape. Scripts (if the
/// product ever runs them) execute only as an A4 process grant:
/// `ProcessExecutor::propose_exec` with `Origin::Skill { name, trust }`, one consent per run.
/// This gate is the only mapping from the display tier to behaviour; the skills registry in
/// `vibespace-storage` stays data-only.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillScriptGate {
    /// No script of this skill may run. Proposals are not even offered.
    Disabled,
    /// Every run asks again; no standing approval exists for scripts.
    ConsentPerRun,
}

/// Map a skill's trust tier to its script gate. Unreviewed disables scripts; scanned and
/// verified both still need explicit consent for every run — a badge never pre-approves.
pub fn skill_script_gate(trust: SkillTrust) -> SkillScriptGate {
    match trust {
        SkillTrust::Unreviewed => SkillScriptGate::Disabled,
        SkillTrust::Scanned | SkillTrust::Verified => SkillScriptGate::ConsentPerRun,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::ActionKind;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    fn b64_encode(data: &[u8]) -> String {
        const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::new();
        for chunk in data.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let acc = (b0 << 16) | (b1 << 8) | b2;
            let n = chunk.len();
            out.push(T[(acc >> 18) as usize & 63] as char);
            out.push(T[(acc >> 12) as usize & 63] as char);
            out.push(if n > 1 { T[(acc >> 6) as usize & 63] as char } else { '=' });
            out.push(if n > 2 { T[acc as usize & 63] as char } else { '=' });
        }
        out
    }

    struct TestKey {
        keynum: [u8; 8],
        pair: Ed25519KeyPair,
    }

    impl TestKey {
        fn new(keynum: [u8; 8]) -> Self {
            let rng = ring::rand::SystemRandom::new();
            let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
            Self {
                keynum,
                pair: Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap(),
            }
        }
        fn catalog_key(&self) -> CatalogKey {
            let mut raw = Vec::with_capacity(42);
            raw.extend_from_slice(&ALG_ED25519);
            raw.extend_from_slice(&self.keynum);
            raw.extend_from_slice(self.pair.public_key().as_ref());
            CatalogKey::from_minisign_public(&b64_encode(&raw)).unwrap()
        }
        fn sign(&self, message: &[u8]) -> String {
            let mut raw = Vec::with_capacity(74);
            raw.extend_from_slice(&ALG_ED25519);
            raw.extend_from_slice(&self.keynum);
            raw.extend_from_slice(self.pair.sign(message).as_ref());
            b64_encode(&raw)
        }
    }

    fn digest(tag: u8) -> ArgsDigest {
        ArgsDigest::builder(ActionKind::Network, "example.test")
            .part("t", &[tag])
            .finish()
    }

    #[test]
    fn minisign_roundtrip_and_fail_closed_paths() {
        let key = TestKey::new(*b"testkey1");
        let mut catalog = PinnedCatalog::new();
        catalog.add_key(key.catalog_key());
        let msg = b"extension package v1";
        let sig = key.sign(msg);
        assert_eq!(
            catalog.verify(msg, &sig),
            Ok(PublisherTrust::Verified { keynum: *b"testkey1" })
        );
        // Tampered message.
        assert_eq!(
            catalog.verify(b"extension package v2", &sig),
            Err(TrustError::InvalidSignature)
        );
        // Unknown key number.
        let other = TestKey::new(*b"testkey2");
        assert_eq!(catalog.verify(msg, &other.sign(msg)), Err(TrustError::UnknownKey));
        // Prehashed variant ("ED") is rejected even with a valid key behind it.
        let mut prehashed = Vec::with_capacity(74);
        prehashed.extend_from_slice(&[0x45, 0x44]);
        prehashed.extend_from_slice(&key.keynum);
        prehashed.extend_from_slice(key.pair.sign(msg).as_ref());
        assert_eq!(
            catalog.verify(msg, &b64_encode(&prehashed)),
            Err(TrustError::UnsupportedAlgorithm)
        );
        // Malformed payloads.
        assert_eq!(catalog.verify(msg, "!!!"), Err(TrustError::Malformed));
        assert_eq!(catalog.verify(msg, &b64_encode(&[0x45, 0x64, 1])), Err(TrustError::Malformed));
        // A key parsed from a payload with a wrong algorithm tag is rejected at parse time.
        let mut bad_pub = Vec::new();
        bad_pub.extend_from_slice(&[0x45, 0x44]);
        bad_pub.extend_from_slice(&key.keynum);
        bad_pub.extend_from_slice(key.pair.public_key().as_ref());
        assert_eq!(
            CatalogKey::from_minisign_public(&b64_encode(&bad_pub)),
            Err(TrustError::UnsupportedAlgorithm)
        );
    }

    #[test]
    fn revocations_are_signed_and_strictly_sequenced() {
        let authority = TestKey::new(*b"revoke01");
        let publisher = TestKey::new(*b"pubkey01");
        let mut catalog = PinnedCatalog::new();
        catalog.add_key(authority.catalog_key());
        catalog.add_key(publisher.catalog_key());
        catalog.trust_for_revocations(*b"revoke01");
        let mut list = RevocationList::new();
        assert_eq!(list.next_expected(), 1);

        let subject = RevocationSubject::Package {
            publisher: "acme".into(),
            name: "widget".into(),
        };
        let sign = |seq: u64, subject: &RevocationSubject, key: &TestKey| Revocation {
            sequence: seq,
            subject: subject.clone(),
            signature: key.sign(&Revocation::signed_bytes(seq, subject)),
        };

        // Gap: sequence 2 before 1 is rejected and changes nothing.
        let r2 = sign(2, &subject, &authority);
        assert_eq!(list.apply(&r2, &catalog), Err(TrustError::Sequence));
        assert!(list.is_empty());

        // In order applies.
        let r1 = sign(1, &subject, &authority);
        list.apply(&r1, &catalog).unwrap();
        assert!(list.is_revoked(&subject));
        assert_eq!(list.next_expected(), 2);

        // Replay of 1 is rejected.
        assert_eq!(list.apply(&r1, &catalog), Err(TrustError::Sequence));
        // Now 2 applies.
        let v1 = RevocationSubject::Version {
            publisher: "acme".into(),
            name: "widget".into(),
            digest: digest(1),
        };
        list.apply(&sign(2, &v1, &authority), &catalog).unwrap();

        // A publisher key that is not a revocation authority cannot mint revocations.
        let rogue = sign(3, &subject, &publisher);
        assert_eq!(list.apply(&rogue, &catalog), Err(TrustError::UnknownKey));

        // A bad signature is rejected.
        let forged = Revocation {
            sequence: 3,
            subject: subject.clone(),
            signature: authority.sign(b"different bytes"),
        };
        assert_eq!(list.apply(&forged, &catalog), Err(TrustError::InvalidSignature));

        // Revoking the publisher key makes later publisher verifications fail.
        let key_rev = RevocationSubject::PublisherKey { keynum: *b"pubkey01" };
        list.apply(&sign(3, &key_rev, &authority), &catalog).unwrap();
        let msg = b"package v3";
        assert_eq!(
            assess_publisher(&catalog, &list, msg, &publisher.sign(msg)),
            Err(TrustError::Revoked)
        );
        // Unrevoked keys of the catalog still verify.
        assert!(matches!(
            assess_publisher(&catalog, &list, b"doc", &authority.sign(b"doc")),
            Ok(PublisherTrust::Verified { .. })
        ));
    }

    #[test]
    fn restricted_default_and_axis_independence() {
        let p = TrustPosture::restricted();
        assert_eq!(p.publisher, PublisherTrust::Unverified);
        assert_eq!(p.review, ReviewState::Unreviewed);
        assert!(p.permissions.is_empty());
        for perm in [
            RuntimePermission::SpawnProcess,
            RuntimePermission::NetworkEgress,
            RuntimePermission::ReadFilesystem,
            RuntimePermission::WriteFilesystem,
            RuntimePermission::ReadClipboard,
            RuntimePermission::WriteClipboard,
        ] {
            assert!(!p.permissions.permits(perm));
        }
        assert!(!p.digest_intact(&digest(1)));

        // A verified publisher changes nothing about review or permissions.
        let mut q = TrustPosture {
            publisher: PublisherTrust::Verified { keynum: *b"pubkey01" },
            ..TrustPosture::restricted()
        };
        assert_eq!(q.review, ReviewState::Unreviewed);
        assert!(!q.permissions.permits(RuntimePermission::NetworkEgress));

        // A pin matches only the exact artifact.
        let pin = PinnedDigest(digest(7));
        q.digest = Some(pin);
        assert!(q.digest_intact(&digest(7)));
        assert!(!q.digest_intact(&digest(8)));

        // Granting one permission never grants another.
        q.permissions.grant(RuntimePermission::ReadClipboard);
        assert!(q.permissions.permits(RuntimePermission::ReadClipboard));
        assert!(!q.permissions.permits(RuntimePermission::WriteClipboard));
    }

    #[test]
    fn skill_script_gate_maps_tiers_and_never_preapproves() {
        assert_eq!(skill_script_gate(SkillTrust::Unreviewed), SkillScriptGate::Disabled);
        assert_eq!(skill_script_gate(SkillTrust::Scanned), SkillScriptGate::ConsentPerRun);
        assert_eq!(skill_script_gate(SkillTrust::Verified), SkillScriptGate::ConsentPerRun);
    }

    #[test]
    fn revocation_canonical_bytes_are_domain_separated_and_length_prefixed() {
        let a = Revocation::signed_bytes(
            1,
            &RevocationSubject::Package {
                publisher: "ab".into(),
                name: "c".into(),
            },
        );
        let b = Revocation::signed_bytes(
            1,
            &RevocationSubject::Package {
                publisher: "a".into(),
                name: "bc".into(),
            },
        );
        assert_ne!(a, b);
        assert!(a.starts_with(REVOCATION_DOMAIN));
    }

    #[test]
    fn revocation_subject_ids_are_validated() {
        let mut catalog = PinnedCatalog::new();
        let authority = TestKey::new(*b"revoke02");
        catalog.add_key(authority.catalog_key());
        catalog.trust_for_revocations(*b"revoke02");
        let mut list = RevocationList::new();
        let bad = RevocationSubject::Package {
            publisher: "ACME".into(),
            name: "ok".into(),
        };
        let rev = Revocation {
            sequence: 1,
            subject: bad.clone(),
            signature: authority.sign(&Revocation::signed_bytes(1, &bad)),
        };
        assert_eq!(list.apply(&rev, &catalog), Err(TrustError::InvalidField("publisher")));
    }
}
