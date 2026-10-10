pub mod cli;
pub mod engine;
pub mod error;
pub mod gitops;
pub mod guard;
pub mod protocol;
pub mod record;
pub mod runner;
pub mod server;
pub mod transport;

#[cfg(test)]
mod tests {
    use crate::error::*;
    use crate::protocol::*;

    fn req(extra: &str) -> String {
        format!(r#"{{"protocol":1,"request_id":"r1","capability":"read","body":{{"type":"attach","task_id":"t-1"}}{extra}}}"#)
    }

    #[test]
    fn valid_request_parses() {
        assert!(parse_request(&req("")).is_ok());
    }
    #[test]
    fn version_mismatch_is_typed_even_for_future_shapes() {
        let e = parse_request(r#"{"protocol":2,"request_id":"r","whatever":true}"#).unwrap_err();
        assert_eq!(e.kind, ErrorKind::VersionMismatch);
    }
    #[test]
    fn credential_fields_are_rejected_at_any_depth() {
        for extra in [r#","token":"x""#, r#","extra":{"Authorization":"x"}"#] {
            let e = parse_request(&req(extra)).unwrap_err();
            assert_eq!(e.kind, ErrorKind::BadRequest, "{extra}");
        }
        let nested = r#"{"protocol":1,"request_id":"r1","capability":"read","body":{"type":"attach","task_id":"t","list":[{"password":"p"}]}}"#;
        assert_eq!(parse_request(nested).unwrap_err().kind, ErrorKind::BadRequest);
    }
    #[test]
    fn unknown_fields_and_capability_mismatch_rejected() {
        assert!(parse_request(&req(r#","surprise":1"#)).is_err());
        let cancel_as_read = r#"{"protocol":1,"request_id":"r1","capability":"read","body":{"type":"cancel","task_id":"t"}}"#;
        assert_eq!(parse_request(cancel_as_read).unwrap_err().kind, ErrorKind::BadRequest);
    }
    #[test]
    fn error_kind_names_are_stable() {
        let names: Vec<String> = [
            ErrorKind::GitMissing, ErrorKind::IdentityMissing, ErrorKind::Auth, ErrorKind::Sso, ErrorKind::Protection,
            ErrorKind::StalePlan, ErrorKind::DirtyWorktree, ErrorKind::Diverged, ErrorKind::UncertainOutcome, ErrorKind::ReviewRequired,
        ].iter().map(|k| serde_json::to_value(k).unwrap().as_str().unwrap().to_string()).collect();
        assert_eq!(names, ["git-missing","identity-missing","auth","sso","protection","stale-plan","dirty-worktree","diverged","uncertain-outcome","review-required"]);
    }
    #[test]
    fn git_layer_refuses_network_subcommands() {
        let d = std::env::temp_dir();
        for s in ["push", "fetch", "pull", "clone", "remote"] {
            assert!(crate::gitops::git(&d, &[s], None).is_err());
        }
    }
    #[test]
    fn exit_codes() {
        use crate::record::Status::*;
        assert_eq!([Done.exit_code(), Failed.exit_code(), Review.exit_code(), WaitingInput.exit_code(), Cancelled.exit_code()], [0, 1, 2, 2, 1]);
    }
}
