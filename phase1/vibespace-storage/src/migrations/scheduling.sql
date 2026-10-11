-- A3 owns only sched_* tables. Runtime runs/events remain authoritative for execution/review.
CREATE TABLE sched_schedules (
 id TEXT PRIMARY KEY NOT NULL,
 studio_id TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
 spec_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 last_planned_ms INTEGER NOT NULL,
 next_run_ms INTEGER NOT NULL,
 created_ms INTEGER NOT NULL
);
CREATE TABLE sched_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 schedule_id TEXT NOT NULL REFERENCES sched_schedules(id) ON DELETE CASCADE,
 planned_ms INTEGER NOT NULL,
 due_ms INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','claimed','running','done','failed','crashed')),
 claimed_by TEXT,
 fencing_token INTEGER NOT NULL DEFAULT 0,
 lease_expires_ms INTEGER,
 heartbeat_ms INTEGER,
 started_ms INTEGER,
 attempt INTEGER NOT NULL DEFAULT 0,
 runtime_run_id TEXT,
 observed_kind TEXT,
 auto_applied INTEGER NOT NULL DEFAULT 0 CHECK(auto_applied IN (0,1)),
 UNIQUE(schedule_id,planned_ms)
);
CREATE INDEX sched_jobs_due ON sched_jobs(state,due_ms);
CREATE TABLE sched_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 schedule_id TEXT NOT NULL REFERENCES sched_schedules(id) ON DELETE CASCADE,
 job_id TEXT REFERENCES sched_jobs(id) ON DELETE CASCADE,
 timestamp_ms INTEGER NOT NULL,
 kind TEXT NOT NULL,
 payload_json TEXT NOT NULL
);
CREATE INDEX sched_events_time ON sched_events(timestamp_ms,seq);
CREATE TRIGGER sched_events_append_only BEFORE UPDATE ON sched_events
BEGIN SELECT RAISE(ABORT,'schedule events are append-only'); END;
