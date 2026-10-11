//! Model transport is not tool network.
//!
//! Permitting a model endpoint lets the host's model client reach that endpoint. It produces a
//! [`ModelTransportPermit`], a type that nothing else in this crate accepts. A tool's
//! `Network` proposal is a separate action kind, is denied for lack of enforcement, and a model
//! endpoint entry never changes that.

use std::collections::BTreeSet;

/// Allow-list of model endpoint hosts.
#[derive(Debug, Default, Clone)]
pub struct ModelTransportPolicy {
    hosts: BTreeSet<String>,
}

/// Permit to open a model connection. Not convertible to any approval.
#[derive(Debug)]
pub struct ModelTransportPermit {
    host: String,
}

impl ModelTransportPermit {
    /// Permitted host.
    pub fn host(&self) -> &str {
        &self.host
    }
}

impl ModelTransportPolicy {
    /// Empty policy: nothing allowed.
    pub fn new() -> Self {
        Self::default()
    }

    /// Allow a model endpoint host (lower-cased, no scheme or port).
    pub fn allow_model_host(&mut self, host: &str) {
        self.hosts.insert(host.trim().to_ascii_lowercase());
    }

    /// Check a model request to `host`.
    pub fn check(&self, host: &str) -> Option<ModelTransportPermit> {
        let h = host.trim().to_ascii_lowercase();
        self.hosts
            .contains(&h)
            .then_some(ModelTransportPermit { host: h })
    }
}
