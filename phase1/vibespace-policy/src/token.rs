//! The request-bound approval token.
//!
//! A token is a 256-bit random secret created inside the broker. It is not `Clone`, `Copy`,
//! `Serialize` or `Deserialize`, has a redacted `Debug`, and has no public constructor, so
//! model output (text, JSON, tool results) cannot produce one. The broker stores only the
//! SHA-256 of the secret and checks it, plus the exact binding, when the effect executes.

use crate::action::ProposalId;
use std::fmt;

/// Proof that one specific proposal was approved. Consumed (moved) by the executor.
pub struct ApprovalToken {
    pub(crate) proposal_id: ProposalId,
    pub(crate) secret: [u8; 32],
    pub(crate) broker_id: [u8; 16],
}

impl ApprovalToken {
    /// The proposal this token answers (not secret).
    pub fn proposal_id(&self) -> &ProposalId {
        &self.proposal_id
    }
}

impl fmt::Debug for ApprovalToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ApprovalToken({}, <redacted>)", self.proposal_id)
    }
}

impl Drop for ApprovalToken {
    fn drop(&mut self) {
        // Best effort wipe so the secret does not linger in freed memory.
        for b in self.secret.iter_mut() {
            // SAFETY-free volatile-ish write via black_box.
            *b = std::hint::black_box(0);
        }
    }
}

#[cfg(test)]
impl ApprovalToken {
    /// Test only: duplicate a token to model replay by a hostile caller.
    pub(crate) fn dup(&self) -> ApprovalToken {
        ApprovalToken {
            proposal_id: self.proposal_id.clone(),
            secret: self.secret,
            broker_id: self.broker_id,
        }
    }
    /// Test only: a token with the right proposal id but a made-up secret.
    pub(crate) fn forged(&self) -> ApprovalToken {
        ApprovalToken {
            proposal_id: self.proposal_id.clone(),
            secret: [7u8; 32],
            broker_id: self.broker_id,
        }
    }
}
