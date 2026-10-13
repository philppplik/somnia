//! Operation-scoped git credential bridge (Remote layer, part 1/2). Contract: docs/git/CREDENTIAL-BRIDGE.md.
//!
//! One [`CredentialLease`] per network git job: account + HTTPS host + canonical repo + expiry +
//! cancellation. A private helper binary ([`wire`], `somnia-git-credential`) asks the host over a
//! same-user-only endpoint for the token; the host answers only for the leased host and repo path.
//! The token never appears in argv, URLs, environment, git config, logs, JSON or the renderer.
//! Pure logic (no Tauri/keyring types): `cargo test --no-default-features` exercises everything.

#[path = "wire.rs"]
pub mod wire;
mod lease;
mod remote;
mod run;

pub use lease::{CredentialLease, LeaseOutcome, LeaseSpec, StoreTokenSource, TokenSource};
pub use remote::{validate_clone_url, validate_remote, Operation, RepoRef, ValidatedRemote};
pub use run::{run_git_with_lease, NetGitOutput};

use serde::Serialize;
use std::fmt;

/// Where git may send credentials. [`Policy::github`] is the only production policy.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Policy {
    pub(crate) scheme: &'static str,
    pub(crate) host: String,
    pub(crate) port: Option<u16>,
}
impl Policy {
    /// HTTPS to `github.com:443`, nothing else. No SSH, no GitHub Enterprise (separate decision).
    pub fn github() -> Self {
        Self { scheme: "https", host: "github.com".into(), port: None }
    }
    /// Plain-HTTP loopback policy for tests against a local fake server. The token can only reach
    /// 127.0.0.1 on this machine. Production code must not call this.
    pub fn loopback_for_tests(port: u16) -> Self {
        Self { scheme: "http", host: "127.0.0.1".into(), port: Some(port) }
    }
    pub fn scheme(&self) -> &'static str {
        self.scheme
    }
    /// `host` or `host:port`, as git reports it in the credential query.
    pub(crate) fn host_header(&self) -> String {
        match self.port {
            Some(p) => format!("{}:{p}", self.host),
            None => self.host.clone(),
        }
    }
}

/// Typed failures, safe to show and to serialize: no variant carries a token, URL userinfo or path.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeError {
    /// Needs the user: credential store locked/unavailable, not connected, scope upgrade, other account.
    NeedsInput,
    NotConnected,
    ScopeUpgradeNeeded,
    AccountMismatch,
    /// Remote URL policy (rejected before any token is provided).
    UnsupportedScheme,
    UnsupportedHost,
    InvalidRemoteUrl,
    UrlHasCredentials,
    MultipleUrls,
    RewriteDetected,
    NoSuchRemote,
    GitFailed,
    HelperMissing,
    Endpoint,
    InvalidArgs,
    Timeout,
    Cancelled,
}
impl BridgeError {
    /// GitJob outcome class (R1): needs-input vs a plain failure.
    pub fn is_needs_input(self) -> bool {
        matches!(self, Self::NeedsInput | Self::NotConnected | Self::ScopeUpgradeNeeded | Self::AccountMismatch)
    }
}
impl fmt::Display for BridgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NeedsInput => "The OS credential store is locked or unavailable",
            Self::NotConnected => "No GitHub account is connected",
            Self::ScopeUpgradeNeeded => "The GitHub account needs to be reconnected with more access",
            Self::AccountMismatch => "The connected GitHub account is not the one selected for this operation",
            Self::UnsupportedScheme => "Only HTTPS GitHub remotes are supported (SSH is a separate route)",
            Self::UnsupportedHost => "Only github.com remotes are supported",
            Self::InvalidRemoteUrl => "The remote URL is not a plain github.com/owner/repo URL",
            Self::UrlHasCredentials => "The remote URL contains credentials",
            Self::MultipleUrls => "The remote has several URLs",
            Self::RewriteDetected => "A URL rewrite (insteadOf/pushInsteadOf) changes the remote and is not supported",
            Self::NoSuchRemote => "No such remote",
            Self::GitFailed => "git could not read the remote configuration",
            Self::HelperMissing => "The credential helper is missing",
            Self::Endpoint => "Could not open the private credential endpoint",
            Self::InvalidArgs => "These git arguments are not allowed for an authenticated operation",
            Self::Timeout => "The git operation took too long and was stopped",
            Self::Cancelled => "The operation was cancelled",
        })
    }
}
impl std::error::Error for BridgeError {}

/// A token in memory. No `Debug` content, no `Serialize`, wiped on drop (best effort).
pub struct Secret(String);
impl Secret {
    pub fn new(s: String) -> Self {
        Self(s)
    }
    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}
impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}
impl Clone for Secret {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}
impl Drop for Secret {
    fn drop(&mut self) {
        // SAFETY: overwriting the bytes of a String we own with zeros keeps it valid UTF-8.
        for b in unsafe { self.0.as_bytes_mut() } {
            unsafe { std::ptr::write_volatile(b, 0) };
        }
    }
}
