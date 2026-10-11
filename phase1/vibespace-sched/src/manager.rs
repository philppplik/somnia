use crate::*;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use std::{collections::BTreeMap, path::Path, sync::Arc, time::Duration};
use uuid::Uuid;

/// Integrator binds this to A1's owner lock. Required on EVERY scheduling write,
/// including heartbeat and finish. Owning a SQLite connection is not ownership.
pub trait OwnershipPort: Send + Sync {
    fn ensure_owner(&self) -> Result<()>;
}
/// Reuses the existing runtime and consent broker. Implementations MUST make start
/// idempotent by request_id, use a fresh isolated copy, and strip desktop/script
/// tools unless separately consented. Schedule consent is not an effect token.
pub trait RunPort {
    fn start(&self, request: &Dispatch) -> Result<String>;
    fn state(&self, run_id: &str) -> Result<RunOutcome>;
    fn stop(&self, run_id: &str) -> Result<()>;
}
#[derive(Clone, Debug)]
pub enum RunOutcome {
    Running,
    NeedsYou,
    Ready,
    Done,
    Failed,
    Crashed,
}
#[derive(Clone, Debug)]
pub struct Dispatch {
    pub request_id: String,
    pub studio_id: String,
    pub schedule_id: String,
    pub planned_ms: i64,
    pub consent_level: ConsentLevel,
    /// This is only a request. Actual apply requires a fresh fence check AND
    /// a native policy token via with_auto_apply. Never apply in RunPort::start.
    pub auto_apply_requested: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub spec: ScheduleSpec,
    pub enabled: bool,
    pub next_run_ms: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claim {
    pub job_id: String,
    pub schedule_id: String,
    pub owner: String,
    pub fencing_token: i64,
    pub lease_expires_ms: i64,
    pub planned_ms: i64,
    pub attempt: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleEvent {
    pub seq: i64,
    pub schedule_id: String,
    pub job_id: Option<String>,
    pub timestamp_ms: i64,
    pub kind: String,
    pub payload: serde_json::Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnCard {
    pub since_seq: i64,
    pub last_seq: i64,
    pub needs_you: Vec<ScheduleEvent>,
    pub failed: Vec<ScheduleEvent>,
    pub done: Vec<ScheduleEvent>,
    pub misfires: Vec<ScheduleEvent>,
}
#[derive(Clone, Debug)]
pub struct Config {
    pub concurrency: usize,
    pub lease_ms: i64,
    pub timeout_ms: i64,
    pub max_attempts: i64,
    pub grace_ms: i64,
    pub lookback_ms: i64,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            concurrency: 2,
            lease_ms: 30_000,
            timeout_ms: 3_600_000,
            max_attempts: 3,
            grace_ms: 60_000,
            lookback_ms: 86_400_000,
        }
    }
}
pub struct Manager {
    conn: Connection,
    owner: Arc<dyn OwnershipPort>,
    config: Config,
}
fn event(
    conn: &Connection,
    schedule: &str,
    job: Option<&str>,
    now: i64,
    kind: &str,
    value: serde_json::Value,
) -> Result<()> {
    conn.execute("INSERT INTO sched_events(schedule_id,job_id,timestamp_ms,kind,payload_json) VALUES (?1,?2,?3,?4,?5)", params![schedule,job,now,kind,serde_json::to_string(&value)?])?;
    Ok(())
}
impl Manager {
    pub fn open(
        path: impl AsRef<Path>,
        owner: Arc<dyn OwnershipPort>,
        config: Config,
    ) -> Result<Self> {
        owner.ensure_owner()?;
        if config.concurrency == 0
            || config.concurrency > 100
            || !(3_000..=3_600_000).contains(&config.lease_ms)
            || config.timeout_ms < config.lease_ms
            || !(1..=10).contains(&config.max_attempts)
            || !(60_000..=86_400_000).contains(&config.lookback_ms)
            || !(0..=60_000).contains(&config.grace_ms)
        {
            return Err(Error::Invalid("scheduler configuration".into()));
        }
        let mut conn = Connection::open(path)?;
        somnia_vibespace_storage::schema::check_openable(
            &conn,
            somnia_vibespace_storage::MIGRATIONS,
        )?;
        conn.busy_timeout(Duration::from_secs(10))?;
        conn.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )?;
        somnia_vibespace_storage::schema::migrate(&mut conn, somnia_vibespace_storage::MIGRATIONS)?;
        Ok(Self {
            conn,
            owner,
            config,
        })
    }
    pub fn heartbeat_interval_ms(&self) -> i64 {
        self.config.lease_ms / 3
    }
    pub fn create(&mut self, spec: ScheduleSpec, now: i64) -> Result<Schedule> {
        self.owner.ensure_owner()?;
        spec.validate()?;
        let next = next_occurrence(&spec.cron_expr, &spec.timezone, now)?;
        let id = Uuid::new_v4().to_string();
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute("INSERT INTO sched_schedules(id,studio_id,spec_json,last_planned_ms,next_run_ms,created_ms) VALUES (?1,?2,?3,?4,?5,?4)",params![id,spec.studio_id,serde_json::to_string(&spec)?,now,next])?;
        event(
            &tx,
            &id,
            None,
            now,
            "schedule_created",
            serde_json::json!({"autoApply":spec.auto_apply}),
        )?;
        tx.commit()?;
        Ok(Schedule {
            id,
            spec,
            enabled: true,
            next_run_ms: next,
        })
    }
    pub fn list(&self) -> Result<Vec<Schedule>> {
        let mut stmt=self.conn.prepare("SELECT id,spec_json,enabled,next_run_ms FROM sched_schedules ORDER BY created_ms,id LIMIT 500")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, bool>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })?;
        rows.map(|row| {
            let (id, spec, enabled, next_run_ms) = row?;
            Ok(Schedule {
                id,
                spec: serde_json::from_str(&spec)?,
                enabled,
                next_run_ms,
            })
        })
        .collect()
    }
    pub fn set_enabled(&mut self, id: &str, enabled: bool, now: i64) -> Result<()> {
        self.owner.ensure_owner()?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if tx.execute(
            "UPDATE sched_schedules SET enabled=?2 WHERE id=?1",
            params![id, enabled],
        )? != 1
        {
            return Err(Error::Invalid("unknown schedule".into()));
        }
        event(
            &tx,
            id,
            None,
            now,
            if enabled {
                "schedule_enabled"
            } else {
                "schedule_disabled"
            },
            serde_json::json!({}),
        )?;
        // Pending work is not run after disabling. Already running work is left for
        // explicit runtime Stop; silently killing it would lose its review state.
        if !enabled {
            let jobs = {
                let mut stmt = tx.prepare(
                    "SELECT id FROM sched_jobs WHERE schedule_id=?1 AND state='pending'",
                )?;
                let rows = stmt.query_map([id], |r| r.get::<_, String>(0))?;
                rows.collect::<std::result::Result<Vec<_>, _>>()?
            };
            tx.execute(
                "UPDATE sched_jobs SET state='failed' WHERE schedule_id=?1 AND state='pending'",
                [id],
            )?;
            for job in jobs {
                event(
                    &tx,
                    id,
                    Some(&job),
                    now,
                    "cancelled",
                    serde_json::json!({"reason":"schedule_disabled"}),
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    /// One transaction advances the planning cursor and records its decisions.
    /// At most 1441 minute slots are scanned (24h lookback). Truncation is visible.
    pub fn plan(&mut self, now: i64) -> Result<usize> {
        self.owner.ensure_owner()?;
        timestamp(now)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let schedules = {
            let mut stmt=tx.prepare("SELECT id,spec_json,last_planned_ms FROM sched_schedules WHERE enabled=1 AND next_run_ms<=?1 ORDER BY next_run_ms LIMIT 500")?;
            let rows = stmt.query_map([now], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        let mut count = 0;
        for (id, json, last) in schedules {
            let spec: ScheduleSpec = serde_json::from_str(&json)?;
            spec.validate()?;
            let floor = now - self.config.lookback_ms;
            if last < floor {
                event(
                    &tx,
                    &id,
                    None,
                    now,
                    "lookback_capped",
                    serde_json::json!({"previousCursorMs":last,"lookbackMs":self.config.lookback_ms}),
                )?;
            }
            let mut t = last.max(floor);
            let mut slots = Vec::new();
            loop {
                let next = next_occurrence(&spec.cron_expr, &spec.timezone, t)?;
                if next > now {
                    break;
                }
                slots.push(next);
                t = next;
                if slots.len() > 1441 {
                    return Err(Error::Invalid("slot bound exceeded".into()));
                }
            }
            let plan = plan_misfires(&slots, now, self.config.grace_ms, &spec.misfire_policy);
            if plan.missed > 0 {
                event(
                    &tx,
                    &id,
                    None,
                    now,
                    "misfire",
                    serde_json::json!({"policy":spec.misfire_policy,"missed":plan.missed,"omitted":plan.omitted,"enqueued":plan.enqueue.len()}),
                )?;
            }
            for planned in plan.enqueue {
                let job = Uuid::new_v4().to_string();
                count+=tx.execute("INSERT OR IGNORE INTO sched_jobs(id,schedule_id,planned_ms,due_ms,state) VALUES (?1,?2,?3,?4,'pending')",params![job,id,planned,now])?;
            }
            let next = next_occurrence(&spec.cron_expr, &spec.timezone, now)?;
            tx.execute(
                "UPDATE sched_schedules SET last_planned_ms=?2,next_run_ms=?3 WHERE id=?1",
                params![id, now, next],
            )?;
        }
        tx.commit()?;
        Ok(count)
    }
    pub fn claim(&mut self, instance: &str, now: i64) -> Result<Option<Claim>> {
        self.owner.ensure_owner()?;
        if instance.is_empty() || instance.len() > 200 {
            return Err(Error::Invalid("instance id".into()));
        }
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let active: i64 = tx.query_row(
            "SELECT count(*) FROM sched_jobs WHERE state IN ('claimed','running')",
            [],
            |r| r.get(0),
        )?;
        if active >= self.config.concurrency as i64 {
            return Ok(None);
        }
        let candidate=tx.query_row("SELECT j.id,j.schedule_id,j.planned_ms,j.fencing_token,j.attempt FROM sched_jobs j JOIN sched_schedules s ON s.id=j.schedule_id WHERE j.state='pending' AND j.due_ms<=?1 AND s.enabled=1 ORDER BY j.due_ms,j.planned_ms,j.id LIMIT 1",[now],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?,r.get::<_,i64>(4)?))).optional()?;
        let Some((job_id, schedule_id, planned_ms, token, attempt)) = candidate else {
            return Ok(None);
        };
        let fencing_token = token.checked_add(1).ok_or(Error::Fenced)?;
        let lease_expires_ms = now + self.config.lease_ms;
        tx.execute("UPDATE sched_jobs SET state='claimed',claimed_by=?2,fencing_token=?3,lease_expires_ms=?4,heartbeat_ms=?5,attempt=attempt+1,started_ms=?5 WHERE id=?1",params![job_id,instance,fencing_token,lease_expires_ms,now])?;
        event(
            &tx,
            &schedule_id,
            Some(&job_id),
            now,
            "claimed",
            serde_json::json!({"fencingToken":fencing_token,"attempt":attempt+1}),
        )?;
        tx.commit()?;
        Ok(Some(Claim {
            job_id,
            schedule_id,
            owner: instance.into(),
            fencing_token,
            lease_expires_ms,
            planned_ms,
            attempt: attempt + 1,
        }))
    }
    pub fn validate_fence(&self, claim: &Claim, now: i64) -> Result<()> {
        self.owner.ensure_owner()?;
        let valid:bool=self.conn.query_row("SELECT EXISTS(SELECT 1 FROM sched_jobs WHERE id=?1 AND claimed_by=?2 AND fencing_token=?3 AND lease_expires_ms>?4 AND state IN ('claimed','running'))",params![claim.job_id,claim.owner,claim.fencing_token,now],|r|r.get(0))?;
        if !valid {
            return Err(Error::Fenced);
        }
        Ok(())
    }
    pub fn heartbeat(&mut self, claim: &Claim, now: i64) -> Result<()> {
        self.validate_fence(claim, now)?;
        let changed=self.conn.execute("UPDATE sched_jobs SET heartbeat_ms=?4,lease_expires_ms=?5 WHERE id=?1 AND claimed_by=?2 AND fencing_token=?3 AND lease_expires_ms>?4 AND state IN ('claimed','running')",params![claim.job_id,claim.owner,claim.fencing_token,now,now+self.config.lease_ms])?;
        if changed != 1 {
            return Err(Error::Fenced);
        }
        Ok(())
    }
    /// Execute an effect while holding the SQLite write lock after fence validation.
    /// Integrator must additionally keep A1 ownership and the native broker's token
    /// alive throughout the callback. No token supplied by an engine can authorize it.
    pub fn with_auto_apply<T>(
        &mut self,
        claim: &Claim,
        now: i64,
        broker_authorized: bool,
        effect: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        self.owner.ensure_owner()?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let spec:String=tx.query_row("SELECT s.spec_json FROM sched_jobs j JOIN sched_schedules s ON s.id=j.schedule_id WHERE j.id=?1 AND j.claimed_by=?2 AND j.fencing_token=?3 AND j.lease_expires_ms>?4 AND j.state='running' AND j.auto_applied=0 AND s.enabled=1",params![claim.job_id,claim.owner,claim.fencing_token,now],|r|r.get(0)).optional()?.ok_or(Error::Fenced)?;
        let spec: ScheduleSpec = serde_json::from_str(&spec)?;
        if !spec.auto_apply
            || spec.consent_level != ConsentLevel::AutonomousInScope
            || !broker_authorized
        {
            return Err(Error::AutoApplyDenied);
        }
        let result = effect()?;
        tx.execute(
            "UPDATE sched_jobs SET auto_applied=1 WHERE id=?1",
            [&claim.job_id],
        )?;
        event(
            &tx,
            &claim.schedule_id,
            Some(&claim.job_id),
            now,
            "auto_applied",
            serde_json::json!({}),
        )?;
        tx.commit()?;
        Ok(result)
    }
    pub fn dispatch(&mut self, claim: &Claim, now: i64, port: &dyn RunPort) -> Result<String> {
        self.validate_fence(claim, now)?;
        let spec: String = self.conn.query_row(
            "SELECT spec_json FROM sched_schedules WHERE id=?1 AND enabled=1",
            [&claim.schedule_id],
            |r| r.get(0),
        )?;
        let spec: ScheduleSpec = serde_json::from_str(&spec)?;
        let request = Dispatch {
            request_id: claim.job_id.clone(),
            studio_id: spec.studio_id,
            schedule_id: claim.schedule_id.clone(),
            planned_ms: claim.planned_ms,
            consent_level: spec.consent_level,
            auto_apply_requested: spec.auto_apply,
        };
        // Durable request_id is the runtime's dedup key if the process dies between
        // start and linkage. Starting must be nonblocking; the runtime owns execution.
        let run = port.start(&request)?;
        self.validate_fence(claim, now)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if tx.execute("UPDATE sched_jobs SET state='running',runtime_run_id=?4 WHERE id=?1 AND claimed_by=?2 AND fencing_token=?3 AND state='claimed' AND lease_expires_ms>?5",params![claim.job_id,claim.owner,claim.fencing_token,run,now])?!=1{return Err(Error::Fenced);}
        event(
            &tx,
            &claim.schedule_id,
            Some(&claim.job_id),
            now,
            "running",
            serde_json::json!({"runId":run}),
        )?;
        tx.commit()?;
        Ok(run)
    }
    pub fn observe_needs_you(&mut self, claim: &Claim, now: i64) -> Result<()> {
        self.validate_fence(claim, now)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (old, run): (Option<String>, Option<String>) = tx.query_row(
            "SELECT observed_kind,runtime_run_id FROM sched_jobs WHERE id=?1",
            [&claim.job_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if old.as_deref() != Some("needs_you") {
            tx.execute(
                "UPDATE sched_jobs SET observed_kind='needs_you' WHERE id=?1",
                [&claim.job_id],
            )?;
            event(
                &tx,
                &claim.schedule_id,
                Some(&claim.job_id),
                now,
                "needs_you",
                serde_json::json!({"runId":run}),
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn finish(&mut self, claim: &Claim, now: i64, outcome: RunOutcome) -> Result<()> {
        self.validate_fence(claim, now)?;
        let (kind, state) = match outcome {
            RunOutcome::Running => return Err(Error::Invalid("run is still running".into())),
            RunOutcome::NeedsYou => ("needs_you", "done"),
            RunOutcome::Ready => ("ready", "done"),
            RunOutcome::Done => ("done", "done"),
            RunOutcome::Failed => ("failed", "failed"),
            RunOutcome::Crashed => ("crashed", "crashed"),
        };
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let run: Option<String> = tx.query_row(
            "SELECT runtime_run_id FROM sched_jobs WHERE id=?1",
            [&claim.job_id],
            |r| r.get(0),
        )?;
        if tx.execute("UPDATE sched_jobs SET state=?4,lease_expires_ms=NULL WHERE id=?1 AND claimed_by=?2 AND fencing_token=?3 AND lease_expires_ms>?5 AND state IN ('claimed','running')",params![claim.job_id,claim.owner,claim.fencing_token,state,now])?!=1{return Err(Error::Fenced);}
        event(
            &tx,
            &claim.schedule_id,
            Some(&claim.job_id),
            now,
            kind,
            serde_json::json!({"runId":run}),
        )?;
        tx.commit()?;
        Ok(())
    }
    /// Expired leases are visible before retries. Retries keep the same request id,
    /// so a still-live runtime cannot spawn a second isolated run accidentally.
    pub fn recover_expired(&mut self, now: i64) -> Result<usize> {
        self.owner.ensure_owner()?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let expired = {
            let mut s=tx.prepare("SELECT id,schedule_id,attempt,fencing_token FROM sched_jobs WHERE state IN ('claimed','running') AND lease_expires_ms<=?1")?;
            let rows = s.query_map([now], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for (job, schedule, attempt, token) in &expired {
            event(
                &tx,
                schedule,
                Some(job),
                now,
                "crashed",
                serde_json::json!({"reason":"lease_expired","attempt":attempt}),
            )?;
            let retry = *attempt < self.config.max_attempts;
            let due = now + 1000_i64 * 2_i64.pow((*attempt as u32).min(10));
            tx.execute("UPDATE sched_jobs SET state=?2,claimed_by=NULL,lease_expires_ms=NULL,fencing_token=?3,due_ms=?4 WHERE id=?1",params![job,if retry{"pending"}else{"failed"},token.checked_add(1).ok_or(Error::Fenced)?,due])?;
            event(
                &tx,
                schedule,
                Some(job),
                now,
                if retry { "retry_queued" } else { "failed" },
                serde_json::json!({"reason":"lease_expired","dueMs":due}),
            )?;
        }
        tx.commit()?;
        Ok(expired.len())
    }
    /// App-open pump. Call at least once per heartbeat_interval_ms. Does not spawn
    /// a daemon or engine loop. Errors propagate to Problems, never fixture fallback.
    pub fn tick(&mut self, instance: &str, now: i64, port: &dyn RunPort) -> Result<usize> {
        self.owner.ensure_owner()?;
        self.recover_expired(now)?;
        self.plan(now)?;
        let active = {
            let mut s=self.conn.prepare("SELECT id,schedule_id,claimed_by,fencing_token,lease_expires_ms,planned_ms,attempt,runtime_run_id,started_ms FROM sched_jobs WHERE state='running' AND claimed_by=?1")?;
            let rows = s.query_map([instance], |r| {
                Ok((
                    Claim {
                        job_id: r.get(0)?,
                        schedule_id: r.get(1)?,
                        owner: r.get(2)?,
                        fencing_token: r.get(3)?,
                        lease_expires_ms: r.get(4)?,
                        planned_ms: r.get(5)?,
                        attempt: r.get(6)?,
                    },
                    r.get::<_, String>(7)?,
                    r.get::<_, i64>(8)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for (claim, run, started) in active {
            if now - started >= self.config.timeout_ms {
                port.stop(&run)?;
                self.finish(&claim, now, RunOutcome::Failed)?;
                event(
                    &self.conn,
                    &claim.schedule_id,
                    Some(&claim.job_id),
                    now,
                    "timeout",
                    serde_json::json!({"runId":run}),
                )?;
            } else {
                match port.state(&run)? {
                    RunOutcome::Running => self.heartbeat(&claim, now)?,
                    RunOutcome::NeedsYou => {
                        self.observe_needs_you(&claim, now)?;
                        self.heartbeat(&claim, now)?;
                    }
                    outcome => self.finish(&claim, now, outcome)?,
                };
            }
        }
        let mut started = 0;
        while let Some(claim) = self.claim(instance, now)? {
            match self.dispatch(&claim, now, port) {
                Ok(_) => started += 1,
                Err(e) => {
                    self.finish(&claim, now, RunOutcome::Failed)?;
                    return Err(e);
                }
            }
        }
        Ok(started)
    }
    pub fn events_since(&self, seq: i64) -> Result<Vec<ScheduleEvent>> {
        let mut s=self.conn.prepare("SELECT seq,schedule_id,job_id,timestamp_ms,kind,payload_json FROM sched_events WHERE seq>?1 ORDER BY seq LIMIT 1000")?;
        let rows = s.query_map([seq], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get::<_, String>(5)?,
            ))
        })?;
        rows.map(|r| {
            let (seq, schedule_id, job_id, timestamp_ms, kind, json) = r?;
            Ok(ScheduleEvent {
                seq,
                schedule_id,
                job_id,
                timestamp_ms,
                kind,
                payload: serde_json::from_str(&json)?,
            })
        })
        .collect()
    }
    /// Durable seq cursor, not timestamps or generated chat prose. Page via last_seq.
    pub fn return_card(&self, since_seq: i64) -> Result<ReturnCard> {
        let events = self.events_since(since_seq)?;
        let mut card = ReturnCard {
            since_seq,
            last_seq: events.last().map(|e| e.seq).unwrap_or(since_seq),
            needs_you: vec![],
            failed: vec![],
            done: vec![],
            misfires: vec![],
        };
        let mut latest = BTreeMap::new();
        for e in events {
            match e.kind.as_str() {
                "misfire" | "lookback_capped" => card.misfires.push(e),
                "crashed" | "timeout" => card.failed.push(e),
                "needs_you" | "ready" | "done" | "auto_applied" | "failed" | "cancelled" => {
                    if let Some(job) = e.job_id.clone() {
                        latest.insert(job, e);
                    }
                }
                _ => {}
            }
        }
        for e in latest.into_values() {
            match e.kind.as_str() {
                "needs_you" | "ready" => card.needs_you.push(e),
                "failed" => card.failed.push(e),
                _ => card.done.push(e),
            }
        }
        card.needs_you.sort_by_key(|e| e.seq);
        card.failed.sort_by_key(|e| e.seq);
        card.done.sort_by_key(|e| e.seq);
        Ok(card)
    }
}
