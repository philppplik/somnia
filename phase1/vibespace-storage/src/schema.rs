//! Schema versioning (`PRAGMA user_version`) and transactional migrations.

use crate::{Error, Result};
use rusqlite::{Connection, TransactionBehavior};

#[derive(Clone, Copy, Debug)]
pub struct Migration {
    pub version: i64,
    pub sql: &'static str,
}

pub const SCHEMA_VERSION: i64 = 5;

pub const SCHEDULING_SQL: &str = include_str!("migrations/scheduling.sql");

pub const MIGRATIONS: &[Migration] = &[
    Migration { version: 1, sql: V1 },
    Migration { version: 2, sql: "CREATE TABLE native_scope_anchors (space_id TEXT PRIMARY KEY NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, canonical_root TEXT NOT NULL);" },
    Migration { version: 3, sql: "CREATE TABLE artifact_operations (id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL REFERENCES runs(id), review_revision INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('prepared','committed','aborted')), created_at TEXT NOT NULL); CREATE UNIQUE INDEX idx_one_pending_artifact ON artifact_operations(run_id) WHERE state='prepared';" },
    Migration { version: 4, sql: "ALTER TABLE artifact_operations ADD COLUMN kind TEXT NOT NULL DEFAULT 'apply' CHECK(kind IN ('apply','restore')); UPDATE artifact_operations SET kind='restore' WHERE id LIKE 'restore-%';" },
    Migration { version: 5, sql: SCHEDULING_SQL },
];

const V1: &str = r#"
CREATE TABLE spaces (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    scope_kind      TEXT NOT NULL CHECK (scope_kind IN ('project','personal')),
    folder_grant_id TEXT,
    autonomy        TEXT NOT NULL DEFAULT 'ask_for_writes'
                    CHECK (autonomy IN ('ask_for_everything','ask_for_writes','autonomous_in_scope')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE studios (
    id             TEXT PRIMARY KEY NOT NULL,
    space_id       TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    goal           TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_name     TEXT NOT NULL,
    model_locality TEXT NOT NULL CHECK (model_locality IN ('local','cloud')),
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_studios_space ON studios(space_id);

CREATE TABLE runs (
    id                 TEXT PRIMARY KEY NOT NULL,
    studio_id          TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    space_id           TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    request_id         TEXT NOT NULL UNIQUE,
    retry_of_run_id    TEXT REFERENCES runs(id),
    execution_state    TEXT NOT NULL DEFAULT 'pending'
                       CHECK (execution_state IN ('pending','claimed','running','paused','stopped','done','failed','crashed')),
    review_state       TEXT NOT NULL DEFAULT 'none'
                       CHECK (review_state IN ('none','ready','applied','discarded','conflict')),
    review_revision    INTEGER NOT NULL DEFAULT 0,
    claimed_by         TEXT,
    fencing_token      INTEGER NOT NULL DEFAULT 0,
    lease_expires_at   TEXT,
    interrupted        INTEGER NOT NULL DEFAULT 0,
    interrupted_reason TEXT,
    last_sequence      INTEGER NOT NULL DEFAULT 0,
    result_json        TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    started_at         TEXT,
    finished_at        TEXT
);
CREATE INDEX idx_runs_space ON runs(space_id, created_at);
CREATE INDEX idx_runs_studio ON runs(studio_id, created_at);
CREATE INDEX idx_runs_exec ON runs(execution_state);

CREATE TABLE run_events (
    run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    sequence      INTEGER NOT NULL CHECK (sequence >= 1),
    timestamp_utc TEXT NOT NULL,
    kind          TEXT NOT NULL,
    payload_json  TEXT NOT NULL,
    truncated     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, sequence)
) WITHOUT ROWID;
CREATE TRIGGER run_events_append_only BEFORE UPDATE ON run_events
BEGIN SELECT RAISE(ABORT, 'run_events are append-only'); END;

CREATE TABLE checkpoints (
    id             TEXT PRIMARY KEY NOT NULL,
    space_id       TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    run_id         TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL CHECK (kind IN ('baseline','auto','pre_apply','manual')),
    label          TEXT NOT NULL,
    content_ref    TEXT NOT NULL,
    event_sequence INTEGER NOT NULL,
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_checkpoints_space_run ON checkpoints(space_id, run_id, created_at);

CREATE TABLE memory_items (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('fact','preference','note')),
    title      TEXT,
    content    TEXT NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('user','agent','imported','skill')),
    source_ref TEXT,
    consent    TEXT NOT NULL CHECK (consent IN ('user_explicit','user_approved','pending_review')),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_memory_space ON memory_items(space_id, created_at);

CREATE VIRTUAL TABLE memory_fts USING fts5(
    title, content,
    content='memory_items', content_rowid='seq',
    tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER memory_fts_ai AFTER INSERT ON memory_items BEGIN
    INSERT INTO memory_fts(rowid, title, content) VALUES (new.seq, COALESCE(new.title,''), new.content);
END;
CREATE TRIGGER memory_fts_ad AFTER DELETE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, title, content) VALUES ('delete', old.seq, COALESCE(old.title,''), old.content);
END;
CREATE TRIGGER memory_fts_au AFTER UPDATE ON memory_items BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, title, content) VALUES ('delete', old.seq, COALESCE(old.title,''), old.content);
    INSERT INTO memory_fts(rowid, title, content) VALUES (new.seq, COALESCE(new.title,''), new.content);
END;
"#;

fn latest(migrations: &[Migration]) -> i64 {
    migrations.last().map(|m| m.version).unwrap_or(0)
}

fn user_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?)
}

/// Read-only checks run BEFORE any pragma/DDL write, so a rejected database is not modified.
pub fn check_openable(conn: &Connection, migrations: &[Migration]) -> Result<()> {
    let latest = latest(migrations);
    let uv = user_version(conn)?;
    if uv > latest {
        return Err(Error::NewerSchema {
            found: uv,
            supported: latest,
        });
    }
    if uv == 0 {
        let n: i64 = conn.query_row(
            "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )?;
        if n > 0 {
            return Err(Error::ForeignDatabase);
        }
    }
    Ok(())
}

/// Applies all pending migrations in ONE immediate transaction (all-or-nothing).
/// Re-checks the version inside the transaction so concurrent openers are safe.
pub fn migrate(conn: &mut Connection, migrations: &[Migration]) -> Result<i64> {
    let mut expected = 0;
    for m in migrations {
        expected += 1;
        if m.version != expected {
            return Err(Error::Migration {
                version: m.version,
                message: "migration versions must be contiguous from 1".into(),
            });
        }
    }
    let latest = latest(migrations);
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cur = user_version(&tx)?;
    if cur > latest {
        return Err(Error::NewerSchema {
            found: cur,
            supported: latest,
        });
    }
    for m in migrations.iter().filter(|m| m.version > cur) {
        tx.execute_batch(m.sql).map_err(|e| Error::Migration {
            version: m.version,
            message: e.to_string(),
        })?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", m.version))
            .map_err(|e| Error::Migration {
                version: m.version,
                message: e.to_string(),
            })?;
    }
    tx.commit()?;
    Ok(latest)
}
