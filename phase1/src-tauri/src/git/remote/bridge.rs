//! Adapter: S3's `git_credential::CredentialLease` as this layer's [`CredentialLease`] / [`LeaseProvider`].
//!
//! The token stays inside the bridge (private socket + helper binary). This adapter only forwards
//! the lease's `-c` prefix and environment, which `run_net` re-checks against its allow-list.

use super::{CredentialLease, LeaseProvider, LeasePurpose, RResult, RemoteError, RemoteErrorCode};
use crate::git_credential::{
    validate_clone_url, BridgeError, CredentialLease as Lease, LeaseSpec, Operation, Policy as BridgePolicy, TokenSource,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct BridgeLease {
    inner: Lease,
    login: String,
    host: String,
    repo: String,
    scopes: Vec<String>,
    deadline: Instant,
}

impl CredentialLease for BridgeLease {
    fn account_login(&self) -> &str { &self.login }
    fn host(&self) -> &str { &self.host }
    fn repo_path(&self) -> &str { &self.repo }
    fn scopes(&self) -> &[String] { &self.scopes }
    fn is_expired(&self) -> bool { Instant::now() >= self.deadline }
    fn git_config(&self) -> Vec<(String, String)> {
        let args = self.inner.git_prefix_args();
        let mut out = Vec::new();
        let mut it = args.iter();
        while let (Some(flag), Some(kv)) = (it.next(), it.next()) {
            if flag.to_str() != Some("-c") {
                continue;
            }
            if let Some((k, v)) = kv.to_str().and_then(|s| s.split_once('=')) {
                out.push((k.to_string(), v.to_string()));
            }
        }
        out
    }
    fn env(&self) -> Vec<(String, String)> {
        self.inner
            .env()
            .into_iter()
            .filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?)))
            .collect()
    }
    fn cancel(&self) { self.inner.cancel() }
    fn auth_rejected(&self) -> bool { self.inner.outcome().auth_rejected }
}

/// Opens one bridge lease per job for the selected account.
pub struct BridgeLeases {
    pub source: Arc<dyn TokenSource>,
    pub helper: PathBuf,
    pub account_login: String,
    /// OAuth scopes of the stored token (from the account record). Empty = unknown.
    pub scopes: Vec<String>,
    pub ttl: Duration,
    pub policy: BridgePolicy,
}

fn map_bridge(e: BridgeError) -> RemoteError {
    let code = match e {
        BridgeError::NeedsInput | BridgeError::NotConnected | BridgeError::AccountMismatch => RemoteErrorCode::AuthRequired,
        BridgeError::ScopeUpgradeNeeded => RemoteErrorCode::WorkflowScopeMissing,
        BridgeError::Cancelled => RemoteErrorCode::Cancelled,
        BridgeError::Timeout => RemoteErrorCode::Timeout,
        BridgeError::HelperMissing | BridgeError::Endpoint => RemoteErrorCode::Io,
        _ => RemoteErrorCode::UrlRejected,
    };
    RemoteError::detail(code, super::friendly(code), format!("{e:?}"))
}

impl LeaseProvider for BridgeLeases {
    fn lease(&self, host: &str, repo_path: &str, purpose: LeasePurpose) -> RResult<Box<dyn CredentialLease>> {
        let scheme = self.policy.scheme();
        let url = format!("{scheme}://{host}/{repo_path}.git");
        let mut remote = validate_clone_url(&url, &self.policy).map_err(map_bridge)?;
        remote.operation = match purpose {
            LeasePurpose::Read => Operation::Fetch,
            LeasePurpose::Write => Operation::Push,
        };
        let spec = LeaseSpec { account_login: self.account_login.clone(), remote, ttl: self.ttl };
        let inner = Lease::open(spec, self.policy.clone(), self.source.clone(), &self.helper).map_err(map_bridge)?;
        Ok(Box::new(BridgeLease {
            inner,
            login: self.account_login.clone(),
            host: host.to_string(),
            repo: repo_path.to_string(),
            scopes: self.scopes.clone(),
            deadline: Instant::now() + self.ttl,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::remote::net::{allowed_lease_config, allowed_lease_env};
    use crate::git_credential::Secret;

    struct Src;
    impl TokenSource for Src {
        fn preflight(&self, login: &str) -> Result<(), BridgeError> {
            if login == "me" { Ok(()) } else { Err(BridgeError::AccountMismatch) }
        }
        fn token(&self, _login: &str) -> Result<Secret, BridgeError> {
            Ok(Secret::new("ghp_testtoken_should_never_appear_anywhere_123456".into()))
        }
    }

    fn provider(login: &str) -> BridgeLeases {
        BridgeLeases {
            source: Arc::new(Src),
            helper: std::env::current_exe().unwrap(),
            account_login: login.into(),
            scopes: vec!["repo".into()],
            ttl: Duration::from_secs(120),
            policy: BridgePolicy::loopback_for_tests(9),
        }
    }

    #[test]
    fn bridge_lease_passes_this_layers_allow_list_and_carries_no_token() {
        let p = provider("me");
        let lease = p.lease("127.0.0.1:9", "o/r", LeasePurpose::Write);
        let lease = match lease {
            Ok(l) => l,
            Err(e) => panic!("lease: {}", e.to_json()),
        };
        assert_eq!(lease.account_login(), "me");
        assert!(!lease.is_expired());
        let cfg = lease.git_config();
        assert!(cfg.iter().any(|(k, v)| k == "credential.helper" && !v.is_empty()));
        for (k, v) in &cfg {
            assert!(allowed_lease_config(k, v), "{k}={v}");
        }
        let env = lease.env();
        assert!(!env.is_empty());
        for (k, v) in &env {
            assert!(allowed_lease_env(k, v), "{k}");
        }
        let all = format!("{cfg:?}{env:?}");
        assert!(!all.contains("ghp_") && !all.contains("testtoken"), "token must not appear in config or env");
        assert!(!lease.auth_rejected());
        lease.cancel();
    }

    #[test]
    fn wrong_account_needs_input() {
        let e = provider("someone-else").lease("127.0.0.1:9", "o/r", LeasePurpose::Read).err().unwrap();
        assert_eq!(e.code, RemoteErrorCode::AuthRequired);
        assert_eq!(e.job_outcome(), super::super::JobOutcome::NeedsInput);
    }
}
