//! Baseline always-ask classification. Only ever adds restrictions: declared tags from tool
//! metadata are merged with heuristics on the kind and target, because the model controls
//! target strings and cannot be trusted to label its own actions.

use crate::action::{ActionKind, HighImpact};
use std::collections::BTreeSet;

const CREDENTIAL_NAMES: &[&str] = &[
    ".env",
    ".npmrc",
    ".netrc",
    ".pgpass",
    ".git-credentials",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "id_dsa",
    ".ssh",
    ".aws",
    ".gnupg",
    ".kube",
    ".docker",
    "credentials",
    "known_hosts",
];
const CREDENTIAL_EXT: &[&str] = &[".pem", ".key", ".p12", ".pfx", ".kdbx", ".jks", ".keystore"];
const CREDENTIAL_WORDS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "credential",
    "api_key",
    "apikey",
    "api-key",
    "token",
    "private_key",
];
const SEND_WORDS: &[&str] = &[
    "send",
    "email",
    "e-mail",
    "mail",
    "sms",
    "tweet",
    "publish",
    "post_message",
    "notify",
    "reply",
    "forward",
];
const PURCHASE_WORDS: &[&str] = &[
    "purchase",
    "buy",
    "checkout",
    "order_",
    "place_order",
    "subscribe",
];
const PAYMENT_WORDS: &[&str] = &[
    "payment",
    "pay_",
    "_pay",
    "card_number",
    "iban",
    "cvv",
    "wire_transfer",
    "transfer_funds",
];

fn any(hay: &str, words: &[&str]) -> bool {
    words.iter().any(|w| hay.contains(w))
}

/// Merge declared tags with heuristics. `Delete` kind always carries [`HighImpact::Delete`].
pub fn classify(kind: ActionKind, target: &str, declared: &[HighImpact]) -> BTreeSet<HighImpact> {
    let mut set: BTreeSet<HighImpact> = declared.iter().copied().collect();
    let t = target.to_ascii_lowercase();
    if kind == ActionKind::Delete {
        set.insert(HighImpact::Delete);
    }
    match kind {
        ActionKind::Read | ActionKind::Write | ActionKind::Delete => {
            for comp in t.split(['/', '\\']) {
                let is_env_variant = comp.starts_with(".env.");
                if CREDENTIAL_NAMES.contains(&comp)
                    || is_env_variant
                    || CREDENTIAL_EXT.iter().any(|e| comp.ends_with(e))
                    || any(comp, CREDENTIAL_WORDS)
                {
                    set.insert(HighImpact::Credential);
                }
            }
        }
        ActionKind::Shell | ActionKind::Network | ActionKind::Mcp | ActionKind::Desktop => {
            if any(&t, SEND_WORDS) {
                set.insert(HighImpact::Send);
            }
            if any(&t, PURCHASE_WORDS) {
                set.insert(HighImpact::Purchase);
            }
            if any(&t, PAYMENT_WORDS) {
                set.insert(HighImpact::Payment);
            }
            if any(&t, CREDENTIAL_WORDS) {
                set.insert(HighImpact::Credential);
            }
        }
    }
    set
}
