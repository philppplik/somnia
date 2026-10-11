//! Runs, the sequenced event log, atomic transitions, leases, crash recovery and checkpoints.

use crate::error::{Error, Result};
use crate::model::*;
use crate::redact::sanitize_payload;
use crate::store::{check_text, clamp_limit, enum_col, ensure_space, get_studio_conn, new_id, Store};
use crate::time::format_millis;
use crate::{limits, DTO_SCHEMA_VERSION, PROTOCOL_VERSION};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde_json::{json, Value};

const RUN_COLS: &str = "id, studio_id, space_id, execution_state, review_state, review_revision, claimed_by, fencing_token, \
lease_expires_at, interrupted, interrupted_reason, last_sequence, result_json, created_at, updated_at, started_at, finished_at";

fn run_from_row(r: &Row<'_>) -> rusqlite::Result<Run> {
    let result_json: Option<String> = r.get(12)?;
    let result = match result_json {
        Some(s) => serde_json::from_str::<Value>(&s).ok(),
        None => None,
    };
    let interrupted: i64 = r.get(9)?;
    Ok(Run {
        schema_version: DTO_SCHEMA_VERSION,
        id: r.get(0)?,
        studio_id: r.get(1)?,
        space_id: r.get(2)?,
        execution: enum_col(r, 3, ExecutionState::parse)?,
        review: enum_col(r, 4, ReviewState::parse)?,
        review_revision: r.get(5)?,
        claimed_by: r.get(6)?,
        fencing_token: r.get(7)?,
        lease_expires_at: r.get(8)?,
        interrupted: interrupted != 0,
        interrupted_reason: r.get(10)?,
        last_sequence: r.get(11)?,
        result,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
        started_at: r.get(15)?,
        finished_at: r.get(16)?,
    })
}

fn get_run_conn(c: &Connection, id: &str) -> Result<Run> {
    c.query_row(&format!("SELECT {RUN_COLS} FROM runs WHERE id=?1"), params![id], run_from_row)
        .optional()?
        .ok_or_else(|| Error::NotFound { entity: "run", id: id.to_string() })
}

fn valid_kind(kind: &str) -> bool {
    !kind.is_empty()
        && kind.len() <= 64
        && kind.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '.' | ':' | '-'))
}

/// Appends one event inside the caller's transaction. The sequence is allocated by
/// bumping `runs.last_sequence` under the IMMEDIATE write lock, so sequences per run are
/// strictly increasing and gap-free; a rollback of the transaction rolls the bump back too.
fn append_event_tx(tx: &Transaction<'_>, run_id: &str, kind: &str, payload: &Value, ts: &str, reserve: bool) -> Result<RunEventRecord> {
    if !valid_kind(kind) {
        return Err(Error::InvalidInput(format!("invalid event kind {kind:?}")));
    }
    let (clean, truncated) = sanitize_payload(payload, limits::MAX_EVENT_PAYLOAD_BYTES);
    let n = tx.execute("UPDATE runs SET last_sequence = last_sequence + 1 WHERE id = ?1", params![run_id])?;
    if n == 0 {
        return Err(Error::NotFound { entity: "run", id: run_id.to_string() });
    }
    let seq: i64 = tx.query_row("SELECT last_sequence FROM runs WHERE id = ?1", params![run_id], |r| r.get(0))?;
    let cap = limits::MAX_EVENTS_PER_RUN + if reserve { limits::EVENT_RESERVE } else { 0 };
    if seq > cap {
        return Err(Error::LimitExceeded(format!("run {run_id} reached {} events", limits::MAX_EVENTS_PER_RUN)));
    }
    tx.execute(
        "INSERT INTO run_events (run_id, sequence, timestamp_utc, kind, payload_json, truncated) VALUES (?1,?2,?3,?4,?5,?6)",
        params![run_id, seq, ts, kind, clean.to_string(), truncated as i64],
    )?;
    Ok(RunEventRecord {
        schema_version: DTO_SCHEMA_VERSION,
        protocol_version: PROTOCOL_VERSION,
        run_id: run_id.to_string(),
        sequence: seq,
        timestamp_utc: ts.to_string(),
        kind: kind.to_string(),
        payload: clean,
        truncated,
    })
}

fn event_from_row(r: &Row<'_>) -> rusqlite::Result<RunEventRecord> {
    let payload: String = r.get(4)?;
    let truncated: i64 = r.get(5)?;
    Ok(RunEventRecord {
        schema_version: DTO_SCHEMA_VERSION,
        protocol_version: PROTOCOL_VERSION,
        run_id: r.get(0)?,
        sequence: r.get(1)?,
        timestamp_utc: r.get(2)?,
        kind: r.get(3)?,
        payload: serde_json::from_str(&payload).unwrap_or(Value::Null),
        truncated: truncated != 0,
    })
}

fn valid_content_ref(s: &str) -> bool {
    if s.len() < 3 || s.len() > 200 {
        return false;
    }
    match s.split_once(':') {
        Some((algo, hex)) => {
            !algo.is_empty()
                && algo.len() <= 16
                && algo.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
                && hex.len() >= 16
                && hex.len() <= 128
                && hex.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        }
        None => false,
    }
}

impl Store {
    /// Creates a pending run for a studio and writes event #1 (`run.created`) atomically.
    pub fn create_run(&self, studio_id: &str) -> Result<Run> {
        let id = new_id();
        let now = self.now_str();
        self.write(|tx| {
            let studio = get_studio_conn(tx, studio_id)?;
            tx.execute(
                "INSERT INTO runs (id, studio_id, space_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
                params![id, studio.id, studio.space_id, now],
            )?;
            append_event_tx(tx, &id, "run.created", &json!({"studioId": studio.id, "spaceId": studio.space_id}), &now, true)?;
            Ok(())
        })?;
        self.get_run(&id)
    }

    pub fn get_run(&self, run_id: &str) -> Result<Run> {
        self.read(|c| get_run_conn(c, run_id))
    }

    pub fn list_runs(&self, space_id: &str, studio_id: Option<&str>, limit: usize) -> Result<Vec<Run>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            let mut st = c.prepare(&format!(
                "SELECT {RUN_COLS} FROM runs WHERE space_id=?1 AND (?2 IS NULL OR studio_id=?2) ORDER BY created_at DESC, id LIMIT ?3"
            ))?;
            let rows = st.query_map(params![space_id, studio_id, lim], run_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    /// Runs that need the user: interrupted/crashed/failed runs and runs with review ready or in conflict.
    /// Source for the "while you were away" card.
    pub fn list_attention_runs(&self, space_id: &str, limit: usize) -> Result<Vec<Run>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            let mut st = c.prepare(&format!(
                "SELECT {RUN_COLS} FROM runs WHERE space_id=?1 AND (interrupted=1 OR execution_state IN ('crashed','failed') \
                 OR review_state IN ('ready','conflict')) ORDER BY updated_at DESC, id LIMIT ?2"
            ))?;
            let rows = st.query_map(params![space_id, lim], run_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    /// Appends one agent/core event. `run.`-prefixed kinds are reserved for the store.
    /// Rejected for terminal runs and for a stale fencing token.
    pub fn append_event(&self, run_id: &str, kind: &str, payload: &Value, fencing_token: Option<i64>) -> Result<RunEventRecord> {
        if kind.starts_with("run.") {
            return Err(Error::InvalidInput("event kinds starting with \"run.\" are reserved".into()));
        }
        let now = self.now_str();
        self.write(|tx| {
            let run = get_run_conn(tx, run_id)?;
            if let Some(t) = fencing_token {
                if t != run.fencing_token {
                    return Err(Error::FencingMismatch);
                }
            }
            if run.execution.is_terminal() {
                return Err(Error::Conflict(format!("run is {}; no more events accepted", run.execution.as_str())));
            }
            append_event_tx(tx, run_id, kind, payload, &now, false)
        })
    }

    /// Events with `sequence > after_sequence`, ascending.
    pub fn list_events(&self, run_id: &str, after_sequence: i64, limit: usize) -> Result<Vec<RunEventRecord>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            get_run_conn(c, run_id)?;
            let mut st = c.prepare(
                "SELECT run_id, sequence, timestamp_utc, kind, payload_json, truncated FROM run_events \
                 WHERE run_id=?1 AND sequence>?2 ORDER BY sequence LIMIT ?3",
            )?;
            let rows = st.query_map(params![run_id, after_sequence, lim], event_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    /// Claims a pending run: pending -> claimed, new fencing token, lease. One winner under concurrency.
    pub fn claim_run(&self, run_id: &str, instance_id: &str, lease_ttl_ms: i64) -> Result<TransitionOutcome> {
        let instance = check_text("instanceId", instance_id, 200, false)?;
        if lease_ttl_ms < 1 || lease_ttl_ms > limits::MAX_LEASE_TTL_MS {
            return Err(Error::InvalidInput("leaseTtlMs out of range".into()));
        }
        let now_ms = self.now_ms();
        let now = format_millis(now_ms);
        let lease = format_millis(now_ms + lease_ttl_ms);
        let outcome = self.write(|tx| {
            let run = get_run_conn(tx, run_id)?;
            if !run.execution.can_transition_to(ExecutionState::Claimed) {
                return Err(Error::InvalidTransition {
                    axis: "execution",
                    from: run.execution.as_str().into(),
                    to: "claimed".into(),
                });
            }
            let token = run.fencing_token + 1;
            tx.execute(
                "UPDATE runs SET execution_state='claimed', claimed_by=?1, fencing_token=?2, lease_expires_at=?3, updated_at=?4 WHERE id=?5",
                params![instance, token, lease, now, run_id],
            )?;
            let ev = append_event_tx(
                tx,
                run_id,
                "run.state_changed",
                &json!({"execution": {"from": run.execution.as_str(), "to": "claimed"}, "review": null,
                        "detail": {"claimedBy": instance, "fencingToken": token, "leaseExpiresAt": lease}}),
                &now,
                true,
            )?;
            Ok(ev)
        })?;
        Ok(TransitionOutcome { run: self.get_run(run_id)?, event: outcome })
    }

    /// Extends the lease of a claimed/running/paused run. No event is written.
    pub fn heartbeat(&self, run_id: &str, fencing_token: i64, lease_ttl_ms: i64) -> Result<Run> {
        if lease_ttl_ms < 1 || lease_ttl_ms > limits::MAX_LEASE_TTL_MS {
            return Err(Error::InvalidInput("leaseTtlMs out of range".into()));
        }
        let now_ms = self.now_ms();
        let lease = format_millis(now_ms + lease_ttl_ms);
        let now = format_millis(now_ms);
        self.write(|tx| {
            let run = get_run_conn(tx, run_id)?;
            if fencing_token != run.fencing_token {
                return Err(Error::FencingMismatch);
            }
            if !matches!(run.execution, ExecutionState::Claimed | ExecutionState::Running | ExecutionState::Paused) {
                return Err(Error::Conflict(format!("run is {}; no lease to extend", run.execution.as_str())));
            }
            tx.execute("UPDATE runs SET lease_expires_at=?1, updated_at=?2 WHERE id=?3", params![lease, now, run_id])?;
            Ok(())
        })?;
        self.get_run(run_id)
    }

    /// Atomically validates and applies an execution and/or review transition and appends
    /// one `run.state_changed` event. On any error nothing is changed and no event is written.
    pub fn transition_run(&self, run_id: &str, req: TransitionRequest) -> Result<TransitionOutcome> {
        check_version(req.schema_version)?;
        if req.execution.is_none() && req.review.is_none() {
            return Err(Error::InvalidInput("a transition needs execution and/or review".into()));
        }
        if req.execution == Some(ExecutionState::Claimed) {
            return Err(Error::InvalidInput("use claim_run to claim a run".into()));
        }
        if req.execution == Some(ExecutionState::Paused) && !self.enable_paused {
            return Err(Error::Unsupported("pause/resume is not enabled in this store".into()));
        }
        let now = self.now_str();
        let ev = self.write(|tx| {
            let run = get_run_conn(tx, run_id)?;
            if let Some(exp) = req.expected_execution {
                if exp != run.execution {
                    return Err(Error::Conflict(format!("expected execution {}, found {}", exp.as_str(), run.execution.as_str())));
                }
            }
            if let Some(t) = req.fencing_token {
                if t != run.fencing_token {
                    return Err(Error::FencingMismatch);
                }
            }
            let mut exec = run.execution;
            let mut claimed_by = run.claimed_by.clone();
            let mut lease = run.lease_expires_at.clone();
            let mut started = run.started_at.clone();
            let mut finished = run.finished_at.clone();
            let mut exec_change = Value::Null;
            if let Some(to) = req.execution {
                if !run.execution.can_transition_to(to) {
                    return Err(Error::InvalidTransition { axis: "execution", from: run.execution.as_str().into(), to: to.as_str().into() });
                }
                exec_change = json!({"from": run.execution.as_str(), "to": to.as_str()});
                exec = to;
                if to == ExecutionState::Running && started.is_none() {
                    started = Some(now.clone());
                }
                if to == ExecutionState::Pending {
                    claimed_by = None;
                    lease = None;
                }
                if to.is_terminal() {
                    finished = Some(now.clone());
                    lease = None;
                }
            }
            let mut review = run.review;
            let mut revision = run.review_revision;
            let mut review_change = Value::Null;
            if let Some(to) = req.review {
                if !run.review.can_transition_to(to) {
                    return Err(Error::InvalidTransition { axis: "review", from: run.review.as_str().into(), to: to.as_str().into() });
                }
                if let Some(exp) = req.expected_review_revision {
                    if exp != run.review_revision {
                        return Err(Error::Conflict(format!("expected review revision {exp}, found {}", run.review_revision)));
                    }
                }
                if to == ReviewState::Ready && !matches!(exec, ExecutionState::Done | ExecutionState::Stopped) {
                    return Err(Error::Conflict("review can only become ready after the run is done or stopped".into()));
                }
                review_change = json!({"from": run.review.as_str(), "to": to.as_str()});
                review = to;
                revision += 1;
            } else if req.expected_review_revision.is_some_and(|e| e != run.review_revision) {
                return Err(Error::Conflict("stale review revision".into()));
            }
            let result_json: Option<String> = match &req.result {
                Some(v) => Some(sanitize_payload(v, limits::MAX_EVENT_PAYLOAD_BYTES).0.to_string()),
                None => None,
            };
            tx.execute(
                "UPDATE runs SET execution_state=?1, review_state=?2, review_revision=?3, claimed_by=?4, lease_expires_at=?5, \
                 started_at=?6, finished_at=?7, result_json=COALESCE(?8, result_json), updated_at=?9 WHERE id=?10",
                params![exec.as_str(), review.as_str(), revision, claimed_by, lease, started, finished, result_json, now, run_id],
            )?;
            let payload = json!({
                "execution": exec_change,
                "review": review_change,
                "detail": req.detail.clone().unwrap_or(Value::Null),
            });
            append_event_tx(tx, run_id, "run.state_changed", &payload, &now, true)
        })?;
        Ok(TransitionOutcome { run: self.get_run(run_id)?, event: ev })
    }

    /// Marks interrupted runs `crashed` (visible, `interrupted = true`) and writes a
    /// `run.interrupted` event for each. It NEVER resumes or re-runs anything: effects are
    /// not replayed, and a crashed run is terminal (a retry is a new, user-initiated run).
    pub fn recover_interrupted(&self, mode: RecoveryMode) -> Result<RecoveryReport> {
        let now_ms = self.now_ms();
        let now = format_millis(now_ms);
        self.write(|tx| {
            let sql = match mode {
                RecoveryMode::AllActive => "SELECT id, space_id, execution_state FROM runs WHERE execution_state IN ('claimed','running') ORDER BY created_at, id",
                RecoveryMode::ExpiredLeases => {
                    "SELECT id, space_id, execution_state FROM runs WHERE execution_state IN ('claimed','running') \
                     AND (lease_expires_at IS NULL OR lease_expires_at < ?1) ORDER BY created_at, id"
                }
            };
            let mut found: Vec<(String, String, String)> = Vec::new();
            {
                let mut st = tx.prepare(sql)?;
                let map = |r: &Row<'_>| -> rusqlite::Result<(String, String, String)> { Ok((r.get(0)?, r.get(1)?, r.get(2)?)) };
                let rows = match mode {
                    RecoveryMode::AllActive => st.query_map([], map)?,
                    RecoveryMode::ExpiredLeases => st.query_map(params![now], map)?,
                };
                for r in rows {
                    found.push(r?);
                }
            }
            let reason = match mode {
                RecoveryMode::AllActive => "process_restart",
                RecoveryMode::ExpiredLeases => "lease_expired",
            };
            let mut recovered = Vec::new();
            for (id, space_id, prev) in found {
                let previous = ExecutionState::parse(&prev).unwrap_or(ExecutionState::Running);
                tx.execute(
                    "UPDATE runs SET execution_state='crashed', interrupted=1, interrupted_reason=?1, finished_at=?2, \
                     lease_expires_at=NULL, updated_at=?2 WHERE id=?3",
                    params![reason, now, id],
                )?;
                append_event_tx(
                    tx,
                    &id,
                    "run.interrupted",
                    &json!({"reason": reason, "previousState": prev, "effectsReplayed": false,
                            "note": "run was not resumed and no effect was re-executed"}),
                    &now,
                    true,
                )?;
                recovered.push(RecoveredRun { run_id: id, space_id, previous_state: previous, reason: reason.to_string() });
            }
            Ok(RecoveryReport { schema_version: DTO_SCHEMA_VERSION, recovered })
        })
    }

    // ------------------------------------------------------------ checkpoints

    /// Stores a checkpoint REFERENCE (opaque content address) and writes a
    /// `run.checkpoint_created` event in the same transaction. No file content is stored here.
    pub fn add_checkpoint(&self, req: NewCheckpoint) -> Result<Checkpoint> {
        check_version(req.schema_version)?;
        let label = check_text("label", &req.label, limits::MAX_NAME_CHARS, false)?;
        if !valid_content_ref(&req.content_ref) {
            return Err(Error::InvalidInput("contentRef must be `algo:hex` (16-128 lowercase hex chars)".into()));
        }
        let id = new_id();
        let now = self.now_str();
        self.write(|tx| {
            ensure_space(tx, &req.space_id)?;
            let run = get_run_conn(tx, &req.run_id)?;
            if run.space_id != req.space_id {
                return Err(Error::NotFound { entity: "run", id: req.run_id.clone() });
            }
            let ev = append_event_tx(
                tx,
                &req.run_id,
                "run.checkpoint_created",
                &json!({"checkpointId": id, "kind": req.kind.as_str(), "contentRef": req.content_ref}),
                &now,
                true,
            )?;
            tx.execute(
                "INSERT INTO checkpoints (id, space_id, run_id, kind, label, content_ref, event_sequence, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![id, req.space_id, req.run_id, req.kind.as_str(), label, req.content_ref, ev.sequence, now],
            )?;
            Ok(())
        })?;
        self.get_checkpoint(&req.space_id, &id)
    }

    pub fn get_checkpoint(&self, space_id: &str, id: &str) -> Result<Checkpoint> {
        self.read(|c| {
            c.query_row(
                &format!("SELECT {CP_COLS} FROM checkpoints WHERE id=?1 AND space_id=?2"),
                params![id, space_id],
                cp_from_row,
            )
            .optional()?
            .ok_or_else(|| Error::NotFound { entity: "checkpoint", id: id.to_string() })
        })
    }

    pub fn list_checkpoints(&self, space_id: &str, run_id: Option<&str>, limit: usize) -> Result<Vec<Checkpoint>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            ensure_space(c, space_id)?;
            let mut st = c.prepare(&format!(
                "SELECT {CP_COLS} FROM checkpoints WHERE space_id=?1 AND (?2 IS NULL OR run_id=?2) ORDER BY created_at, event_sequence, id LIMIT ?3"
            ))?;
            let rows = st.query_map(params![space_id, run_id, lim], cp_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }
}

const CP_COLS: &str = "id, space_id, run_id, kind, label, content_ref, event_sequence, created_at";

fn cp_from_row(r: &Row<'_>) -> rusqlite::Result<Checkpoint> {
    Ok(Checkpoint {
        schema_version: DTO_SCHEMA_VERSION,
        id: r.get(0)?,
        space_id: r.get(1)?,
        run_id: r.get(2)?,
        kind: enum_col(r, 3, CheckpointKind::parse)?,
        label: r.get(4)?,
        content_ref: r.get(5)?,
        event_sequence: r.get(6)?,
        created_at: r.get(7)?,
    })
}
