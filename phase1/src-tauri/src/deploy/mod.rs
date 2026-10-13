//! Local-first deployment foundations. UI approval and real SSH are separate layers.
//! No operation here opens a socket or executes a shell command.
pub mod artifact;
pub mod host_keys;
pub mod keys;
pub mod manifest;
pub mod redactor;
pub mod release;
pub mod transport;
pub mod ssh;
pub mod bootstrap;
pub mod node_collect;
pub mod node_env;
pub mod node_app;
pub mod node_engine;
pub mod node_admin;
pub mod node_host;
pub mod ftp;
pub mod ftp_engine;
#[cfg(test)]
mod ftp_testkit;
#[cfg(test)]
mod ssh_testkit;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum DeployError {
    #[error("Invalid deployment input")]
    InvalidInput,
    #[error("The deployment artifact failed verification")]
    Integrity,
    #[error("The server operation failed")]
    Transport,
    #[error("The credential store is unavailable")]
    Keychain,
    #[error("The deployment key is missing")]
    KeyMissing,
    #[error("The deployment key already exists")]
    KeyExists,
    #[error("The server identity needs confirmation")]
    UntrustedHost,
    #[error("The server identity has changed")]
    HostKeyChanged,
    #[error("The server identity store is unavailable")]
    HostStore,
    #[error("The release already exists")]
    ReleaseExists,
    #[error("The release is not ready")]
    ReleaseNotReady,
}
pub type Result<T> = std::result::Result<T, DeployError>;

#[cfg(test)]
mod security_tests {
    use super::*;
    #[test]
    fn every_error_is_generic_and_redactable() {
        let canary = "seeded-password-do-not-log";
        let redactor = redactor::Redactor::new([canary.into()]);
        for error in [
            DeployError::InvalidInput,
            DeployError::Integrity,
            DeployError::Transport,
            DeployError::Keychain,
            DeployError::KeyMissing,
            DeployError::KeyExists,
            DeployError::UntrustedHost,
            DeployError::HostKeyChanged,
            DeployError::HostStore,
            DeployError::ReleaseExists,
            DeployError::ReleaseNotReady,
        ] {
            let display = error.to_string();
            assert!(!display.contains(canary));
            let output = redactor.redact(&format!("{error:?}: {display}: {canary}"));
            assert!(!output.contains(canary));
        }
    }
}

pub mod engine;
