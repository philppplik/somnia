//! The one wrapper every migrated Tauri command goes through.
//!
//! ```ignore
//! #[tauri::command]
//! fn get_intake_policy(window: tauri::WebviewWindow) -> Result<IntakePolicy, AppCommandError> {
//!     crate::cmd::cmd("get_intake_policy", Some(window.label()), || { gate(&window)?; Ok(policy()) })
//! }
//! ```
//! On `Err` it writes exactly ONE typed log line (id/code/cmd/window/dur_ms, no paths), mints the
//! incident id for unexpected failures and stores it in `AppCommandError::incident_id`. Frames below the
//! command must not log the same failure again.
use crate::app_command_error::AppCommandError;
use crate::applog::{self, EventSink, EventSpec};
use serde_json::json;
use std::{future::Future, time::Instant};

pub fn cmd<T>(name: &'static str, window: Option<&str>, f: impl FnOnce() -> Result<T, AppCommandError>) -> Result<T, AppCommandError> {
    cmd_with(&applog::Global, name, window, f)
}

pub async fn cmd_async<T, Fut>(name: &'static str, window: Option<&str>, fut: Fut) -> Result<T, AppCommandError>
where
    Fut: Future<Output = Result<T, AppCommandError>>,
{
    let started = Instant::now();
    let result = fut.await;
    finish(&applog::Global, name, window, started, result)
}

/// Same as [`cmd`] with an explicit sink (unit tests use a temp-dir `Logger`).
pub fn cmd_with<T>(sink: &dyn EventSink, name: &'static str, window: Option<&str>, f: impl FnOnce() -> Result<T, AppCommandError>) -> Result<T, AppCommandError> {
    let started = Instant::now();
    let result = f();
    finish(sink, name, window, started, result)
}

fn finish<T>(sink: &dyn EventSink, name: &'static str, window: Option<&str>, started: Instant, result: Result<T, AppCommandError>) -> Result<T, AppCommandError> {
    let mut err = match result {
        Ok(v) => return Ok(v),
        Err(e) => e,
    };
    let context = json!({ "cmd": name, "window": window, "code": err.code, "dur_ms": started.elapsed().as_millis() as u64 });
    let incident = sink.event(&EventSpec {
        id: &err.id,
        level: err.level(),
        source: "rust.cmd",
        message: &err.message,
        context: Some(&context),
        expected: err.expected,
        corr: None,
    });
    // A caller that already minted/logged (nested cmd) keeps its incident id: same cause, one occurrence.
    if err.incident_id.is_empty() {
        if let Some(i) = incident {
            err.incident_id = i.into_string();
        }
    }
    Err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::applog::Logger;
    use crate::service::AppError;
    fn logger(name: &str) -> Logger {
        let d = std::env::temp_dir().join(format!("somnia-cmd-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        Logger::new(d)
    }
    #[test]
    fn ok_path_logs_nothing() {
        let l = logger("ok");
        assert_eq!(cmd_with(&l, "x", Some("main"), || Ok::<_, AppCommandError>(7)).unwrap(), 7);
        assert_eq!(l.tail(10), "");
    }
    #[test]
    fn unexpected_error_logs_once_with_incident() {
        let l = logger("unexpected");
        let e = cmd_with(&l, "save_file", Some("main"), || Err::<(), _>(AppError::Io("C:\\secret".into()).into())).unwrap_err();
        assert_eq!(e.incident_id.len(), 26);
        let t = l.tail(10);
        assert_eq!(t.lines().count(), 1);
        assert!(t.contains(&e.incident_id) && t.contains("\"id\":\"SOM-FS-003\"") && t.contains("\"cmd\":\"save_file\""));
        assert!(!t.contains("secret"));
    }
    #[test]
    fn expected_error_logs_info_and_has_no_incident() {
        let l = logger("expected");
        let e = cmd_with(&l, "open", None, || Err::<(), _>(AppError::Locked.into())).unwrap_err();
        assert!(e.expected && e.incident_id.is_empty());
        let t = l.tail(10);
        assert_eq!(t.lines().count(), 1);
        assert!(t.contains("\"level\":\"info\"") && t.contains("\"expected\":true") && !t.contains("incident_id"));
    }
    #[test]
    fn question_mark_converts_app_error_inside_closure() {
        let l = logger("q");
        let e = cmd_with(&l, "gate", Some("ext"), || {
            let r: crate::service::Result<()> = Err(AppError::Denied("x".into()));
            r?;
            Ok(())
        })
        .unwrap_err();
        assert_eq!(e.code, "denied");
    }
    #[test]
    fn nested_incident_id_is_kept() {
        let l = logger("nested");
        let mut inner = AppCommandError::from(AppError::NoEdit);
        inner.incident_id = "01INNERINCIDENT00000000000".into();
        let e = cmd_with(&l, "outer", None, || Err::<(), _>(inner)).unwrap_err();
        assert_eq!(e.incident_id, "01INNERINCIDENT00000000000");
    }
    #[test]
    fn incident_id_is_a_26_char_ulid_and_sorts_by_time() {
        let a = applog::IncidentId::from_parts(1_000, [1; 16]);
        let b = applog::IncidentId::from_parts(2_000, [0; 16]);
        assert_eq!(a.as_str().len(), 26);
        assert!(a.as_str() < b.as_str());
        assert!(a.as_str().bytes().all(|c| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&c)));
    }
}
