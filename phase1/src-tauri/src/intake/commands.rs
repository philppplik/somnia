//! Trusted-window command cores. Tauri adapters must delegate under Backend's
//! existing mutex, never accept renderer paths, and flush native events once.
use super::{
    policy::IntakePolicy,
    queue::{
        AckReply, ClaimReply, GrantRead, IntakeError, ItemOutcome, OpenQueue, OpenRequestSummary,
    },
};

fn gate(window: &str) -> Result<(), IntakeError> {
    if window == "main" {
        Ok(())
    } else {
        Err(IntakeError::denied())
    }
}
pub fn drain_open_requests(
    window: &str,
    queue: &mut OpenQueue,
    now_ms: u64,
) -> Result<Vec<OpenRequestSummary>, IntakeError> {
    gate(window)?;
    queue.reset_stale(now_ms);
    Ok(queue.drain())
}
pub fn claim_open_request(
    window: &str,
    queue: &mut OpenQueue,
    request_id: &str,
    now_ms: u64,
) -> Result<ClaimReply, IntakeError> {
    gate(window)?;
    queue.claim(request_id, now_ms)
}
pub fn read_by_grant(
    window: &str,
    queue: &mut OpenQueue,
    grant: &str,
    now_ms: u64,
) -> Result<GrantRead, IntakeError> {
    gate(window)?;
    queue.read_by_grant(grant, now_ms)
}
pub fn ack_open_request(
    window: &str,
    queue: &mut OpenQueue,
    request_id: &str,
    outcomes: Vec<ItemOutcome>,
    now_ms: u64,
) -> Result<AckReply, IntakeError> {
    gate(window)?;
    queue.ack(request_id, outcomes, now_ms)
}
pub fn release_candidate(
    window: &str,
    queue: &mut OpenQueue,
    request_id: &str,
) -> Result<(), IntakeError> {
    gate(window)?;
    queue.release(request_id)
}
pub fn retry_open_item(
    window: &str,
    queue: &mut OpenQueue,
    request_id: &str,
    ordinal: u32,
    retry_token: &str,
    now_ms: u64,
) -> Result<ClaimReply, IntakeError> {
    gate(window)?;
    queue.retry(request_id, ordinal, retry_token, now_ms)
}
pub fn get_intake_policy(window: &str, queue: &OpenQueue) -> Result<IntakePolicy, IntakeError> {
    gate(window)?;
    Ok(queue.policy())
}
pub fn set_intake_policy(
    window: &str,
    queue: &mut OpenQueue,
    allow_unc: bool,
) -> Result<(), IntakeError> {
    gate(window)?;
    queue.set_policy(IntakePolicy { allow_unc });
    Ok(())
}

/// Drain the queue's native events into the sink exactly once and return the incident id of the
/// event that matches `error` (empty when none). Every path that mutates the queue, including the
/// single-instance callback and cold-start worker, flushes through here so no event is logged twice
/// or dropped, and the command wrapper then sees a nonempty incident_id and does not re-log.
pub fn flush_events(
    sink: &dyn crate::applog::EventSink,
    queue: &mut OpenQueue,
    error: Option<&IntakeError>,
) -> String {
    let mut incident_id = String::new();
    for event in queue.take_events() {
        let context = serde_json::json!({ "ordinal": event.ordinal, "cause": event.cause, "count": event.count,
            "reset_count": if event.id == "SOM-APP-012" { Some(1) } else { None } });
        let incident = sink.event(&crate::applog::EventSpec {
            id: event.id,
            level: if matches!(
                event.id,
                "SOM-APP-008" | "SOM-APP-011" | "SOM-APP-012" | "SOM-FS-006"
            ) {
                "warn"
            } else {
                "error"
            },
            source: "rust.intake",
            message: "Native file intake result",
            context: Some(&context),
            expected: event.expected,
            corr: Some(&event.corr),
            ordinal: event.ordinal.map(u64::from),
        });
        if error.is_some_and(|e| {
            e.id == event.id
                && e.corr == event.corr
                && e.ordinal == event.ordinal
                && e.code == event.cause
        }) {
            if let Some(incident) = incident {
                incident_id = incident.into_string();
            }
        }
    }
    incident_id
}

/// Run one intake command while Backend is locked, then emit pending events
/// through the canonical sink exactly once. The outer cmd wrapper must preserve
/// a nonempty incident_id WITHOUT emitting a second causal failure.
#[allow(clippy::result_large_err)] // Canonical command wire DTO, shared with cmd.rs.
pub fn execute_with<T>(
    sink: &dyn crate::applog::EventSink,
    queue: &mut OpenQueue,
    run: impl FnOnce(&mut OpenQueue) -> Result<T, IntakeError>,
) -> Result<T, crate::app_command_error::AppCommandError> {
    let result = run(queue);
    let incident_id = flush_events(sink, queue, result.as_ref().err());
    result.map_err(|error| {
        let mut wire = crate::app_command_error::AppCommandError::new(
            error.id,
            error.code,
            error.message,
            error.expected,
        );
        wire.incident_id = incident_id;
        wire
    })
}
#[allow(clippy::result_large_err)] // Canonical command wire DTO, shared with cmd.rs.
pub fn execute<T>(
    queue: &mut OpenQueue,
    run: impl FnOnce(&mut OpenQueue) -> Result<T, IntakeError>,
) -> Result<T, crate::app_command_error::AppCommandError> {
    execute_with(&crate::applog::Global, queue, run)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod log_tests {
    use super::super::{
        parse::parse_open_args,
        queue::{FailureClass, OpenSource, OutcomeStatus},
    };
    use super::*;
    use crate::applog::Logger;
    use std::{ffi::OsString, fs};
    #[test]
    fn real_sink_claim_fault_one_line_one_incident_corr_and_no_secrets() {
        let dir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(dir.path().to_owned());
        let mut q = OpenQueue::default();
        let error = execute_with(&logger, &mut q, |q| {
            claim_open_request("main", q, "01REQUEST", 0)
        })
        .unwrap_err();
        assert_eq!(error.incident_id.len(), 26);
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("SOM-APP-002"));
        assert!(log.contains("01REQUEST"));
        assert!(q.take_events().is_empty());
    }
    #[test]
    fn real_sink_partial_ack_adds_zero_lines_and_returns_retry_expiry() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("NAME_SENTINEL.md");
        fs::write(&path, b"content").unwrap();
        let logdir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(logdir.path().to_owned());
        let mut q = OpenQueue::default();
        let parsed = parse_open_args(
            [OsString::from("somnia"), path.as_os_str().to_owned()],
            dir.path(),
            &IntakePolicy::default(),
        );
        let id = q
            .enqueue(OpenSource::ColdArgv, parsed, 1)
            .request_id
            .unwrap();
        q.claim(&id, 2).unwrap();
        let failure = execute_with(&logger, &mut q, |q| {
            Err::<(), _>(q.report_item_failure(&id, 0, FailureClass::Io))
        })
        .unwrap_err();
        assert_eq!(failure.incident_id.len(), 26);
        let ack = execute_with(&logger, &mut q, |q| {
            ack_open_request(
                "main",
                q,
                &id,
                vec![ItemOutcome {
                    ordinal: 0,
                    status: OutcomeStatus::Failed,
                    cause: Some(FailureClass::Io),
                }],
                3,
            )
        })
        .unwrap();
        assert_eq!(ack.retry_tokens.len(), 1);
        assert_eq!(ack.retry_tokens[0].expires_at_ms, 60_003);
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(!log.contains("NAME_SENTINEL"));
        assert!(!log.contains(&ack.retry_tokens[0].token));
    }
    #[test]
    fn real_sink_lock_warn_only_fs006_and_release_silent() {
        let dir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(dir.path().to_owned());
        let mut q = OpenQueue::default();
        let error = execute_with(&logger, &mut q, |q| {
            Err::<(), _>(q.report_item_failure("request", 0, FailureClass::Locked))
        })
        .unwrap_err();
        assert_eq!(error.id, "SOM-FS-006");
        assert!(!error.incident_id.is_empty());
        execute_with(&logger, &mut q, |q| release_candidate("main", q, "request")).unwrap();
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("\"level\":\"warn\""));
        assert!(!log.contains("SOM-APP-002"));
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod fault_sink_tests {
    use super::super::{parse::parse_open_args, queue::OpenSource};
    use super::*;
    use crate::applog::Logger;
    use std::{ffi::OsString, fs};
    fn enqueue(q: &mut OpenQueue, path: &std::path::Path, now: u64) -> String {
        let parsed = parse_open_args(
            [OsString::from("somnia"), path.as_os_str().to_owned()],
            path.parent().unwrap(),
            &IntakePolicy::default(),
        );
        q.enqueue(OpenSource::ColdArgv, parsed, now)
            .request_id
            .unwrap()
    }
    #[test]
    fn b7_enqueue_overflow_exactly_one_persisted_event() {
        let dir = tempfile::TempDir::new().unwrap();
        let logdir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(logdir.path().to_owned());
        let mut q = OpenQueue::default();
        for n in 0..9 {
            let path = dir.path().join(format!("{n}.md"));
            fs::write(&path, b"x").unwrap();
            execute_with(&logger, &mut q, |q| Ok(enqueue(q, &path, n * 1_000))).unwrap();
        }
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("SOM-APP-008"));
        assert!(!log.contains("SOM-APP-002"));
    }
    #[test]
    fn b7_grant_reuse_exactly_one_persisted_event() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("sentinel.md");
        fs::write(&path, b"x").unwrap();
        let logdir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(logdir.path().to_owned());
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &path, 0);
        let reply = q.claim(&id, 1).unwrap();
        let token = reply.items[0].grant.as_ref().unwrap();
        execute_with(&logger, &mut q, |q| read_by_grant("main", q, token, 2)).unwrap();
        assert!(execute_with(&logger, &mut q, |q| read_by_grant("main", q, token, 3)).is_err());
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("SOM-APP-002"));
        assert!(!log.contains("sentinel.md"));
        assert!(!log.contains(token));
    }
    #[test]
    fn b7_toctou_delete_exactly_one_persisted_event() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("deleted.md");
        fs::write(&path, b"x").unwrap();
        let logdir = tempfile::TempDir::new().unwrap();
        let logger = Logger::new(logdir.path().to_owned());
        let mut q = OpenQueue::default();
        let id = enqueue(&mut q, &path, 0);
        let reply = q.claim(&id, 1).unwrap();
        let token = reply.items[0].grant.as_ref().unwrap();
        fs::remove_file(path).unwrap();
        assert!(execute_with(&logger, &mut q, |q| read_by_grant("main", q, token, 2)).is_err());
        let log = logger.tail(10);
        assert_eq!(log.lines().count(), 1);
        assert!(log.contains("changed-or-deleted"));
        assert!(log.contains("SOM-APP-002"));
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod outer_wrapper_tests {
    use super::*;
    #[test]
    fn cmd_outer_reuses_logged_incident_without_second_line() {
        let dir = tempfile::TempDir::new().unwrap();
        let logger = crate::applog::Logger::new(dir.path().to_owned());
        let mut queue = OpenQueue::default();
        let error = crate::cmd::cmd_with(
            &logger,
            "claim_open_request",
            Some("main"),
            crate::cmd::CmdCtx::default(),
            || {
                execute_with(&logger, &mut queue, |q| {
                    claim_open_request("main", q, "request", 0)
                })
            },
        )
        .unwrap_err();
        assert_eq!(error.incident_id.len(), 26);
        assert_eq!(logger.tail(10).lines().count(), 1);
    }
}
