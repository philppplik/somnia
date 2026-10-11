//! Error types. Messages never contain file content, token secrets or argument bytes.

use std::fmt;

/// Errors from broker bookkeeping (not policy denials, see [`crate::DenyReason`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyError {
    /// An identifier failed validation.
    InvalidId(&'static str),
    /// A proposal field failed validation.
    InvalidProposal(&'static str),
    /// The run is not registered.
    UnknownRun,
    /// The run id is already registered.
    RunExists,
    /// The pending request does not exist (or already resolved).
    UnknownPending,
    /// The requested decision is not offered for this request (for example AllowForRun on an
    /// always-ask action).
    DecisionNotOffered,
    /// The wire request named a different run than the pending request belongs to.
    RunMismatch,
    /// The run already ended.
    RunNotActive,
    /// Operating system entropy was unavailable. Fail closed.
    Entropy,
    /// Internal lock poisoned by a panic. Fail closed.
    Poisoned,
}

impl fmt::Display for PolicyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PolicyError::InvalidId(w) => write!(f, "invalid identifier: {w}"),
            PolicyError::InvalidProposal(w) => write!(f, "invalid proposal: {w}"),
            PolicyError::UnknownRun => f.write_str("unknown run"),
            PolicyError::RunExists => f.write_str("run already registered"),
            PolicyError::UnknownPending => f.write_str("unknown or already resolved request"),
            PolicyError::DecisionNotOffered => f.write_str("decision not offered for this request"),
            PolicyError::RunMismatch => f.write_str("request does not belong to that run"),
            PolicyError::RunNotActive => f.write_str("run is not active"),
            PolicyError::Entropy => f.write_str("no secure randomness available"),
            PolicyError::Poisoned => f.write_str("policy state unavailable"),
        }
    }
}

impl std::error::Error for PolicyError {}

/// Why a token could not be consumed at execution time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConsumeError {
    /// Token belongs to another broker or proposal that does not exist.
    Unknown,
    /// Secret does not match (fabricated token).
    Forged,
    /// Token was already used.
    AlreadyUsed,
    /// Token was revoked (cancel, finish, grant revoked, or binding mismatch burned it).
    Revoked,
    /// Token lifetime elapsed.
    Expired,
    /// The run was cancelled or finished.
    RunNotActive,
    /// Action, target, arguments, run or scope differ from what was approved.
    BindingMismatch,
    /// Policy state unavailable.
    Poisoned,
}

impl fmt::Display for ConsumeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            ConsumeError::Unknown => "approval token unknown",
            ConsumeError::Forged => "approval token not valid",
            ConsumeError::AlreadyUsed => "approval token already used",
            ConsumeError::Revoked => "approval token revoked",
            ConsumeError::Expired => "approval token expired",
            ConsumeError::RunNotActive => "run is no longer active",
            ConsumeError::BindingMismatch => "approval does not match this action",
            ConsumeError::Poisoned => "policy state unavailable",
        })
    }
}

impl std::error::Error for ConsumeError {}
