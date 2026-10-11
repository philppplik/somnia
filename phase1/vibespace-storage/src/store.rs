use crate::error::{Error, Result};
use crate::model::*;
use crate::schema::{self, Migration};
use crate::time::{format_millis, now_millis};
use crate::{limits, DTO_SCHEMA_VERSION};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use std::fmt;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Injectable clock (unix milliseconds). Used for leases and tests.
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Recovery {
    /// Do nothing on open.
    None,
    /// Mark claimed/running runs with an expired (or missing) lease as crashed.
    ExpiredLeases,
    /// Mark every claimed/running run as crashed (single-process app restart). Default.
    AllActive,
}

#[derive(Clone)]
pub struct StoreOptions {
    pub recovery: Recovery,
    /// Allow transitions to `paused`. Off by default: pause/resume must be implemented durably first.
    pub enable_paused: bool,
    /// Force the degraded LIKE search path (also used to test the fallback).
    pub disable_fts: bool,
    pub busy_timeout_ms: u64,
    pub clock: Option<Clock>,
}

impl Default for StoreOptions {
    fn default() -> Self {
        StoreOptions { recovery: Recovery::AllActive, enable_paused: false, disable_fts: false, busy_timeout_ms: 10_000, clock: None }
    }
}

pub struct Store {
    pub(crate) conn: Mutex<Connection>,
    pub(crate) enable_paused: bool,
    pub(crate) fts_enabled: bool,
    pub(crate) clock: Clock,
    pub(crate) db_schema_version: i64,
    startup_recovery: RecoveryReport,
}

impl fmt::Debug for Store {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Store").field("db_schema_version", &self.db_schema_version).finish()
    }
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(crate) fn check_text(field: &str, s: &str, max_chars: usize, allow_empty: bool) -> Result<String> {
    let t = s.trim();
    if !allow_empty && t.is_empty() {
        return Err(Error::InvalidInput(format!("{field} must not be empty")));
    }
    if t.chars().count() > max_chars {
        return Err(Error::InvalidInput(format!("{field} exceeds {max_chars} characters")));
    }
    if t.contains('\0') {
        return Err(Error::InvalidInput(format!("{field} contains a NUL character")));
    }
    Ok(t.to_string())
}

pub(crate) fn clamp_limit(limit: usize) -> Result<i64> {
    if limit == 0 {
        return Err(Error::InvalidInput("limit must be at least 1".into()));
    }
    Ok(limit.min(limits::MAX_LIST_LIMIT) as i64)
}

pub(crate) fn enum_col<T>(row: &Row<'_>, idx: usize, parse: fn(&str) -> Option<T>) -> rusqlite::Result<T> {
    let s: String = row.get(idx)?;
    parse(&s).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            idx,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("unknown enum value {s}"))),
        )
    })
}

impl Store {
    pub fn open<P: AsRef<Path>>(path: P, opts: StoreOptions) -> Result<Store> {
        Store::open_with_migrations(path, opts, schema::MIGRATIONS)
    }

    pub fn open_in_memory(opts: StoreOptions) -> Result<Store> {
        let conn = Connection::open_in_memory()?;
        Store::init(conn, opts, schema::MIGRATIONS)
    }

    /// Test/maintenance hook: open with an explicit migration list.
    #[doc(hidden)]
    pub fn open_with_migrations<P: AsRef<Path>>(path: P, opts: StoreOptions, migrations: &[Migration]) -> Result<Store> {
        let conn = Connection::open(path)?;
        Store::init(conn, opts, migrations)
    }

    fn init(mut conn: Connection, opts: StoreOptions, migrations: &[Migration]) -> Result<Store> {
        conn.busy_timeout(Duration::from_millis(opts.busy_timeout_ms))?;
        // 1. Read-only compatibility check first: a newer/foreign DB is never modified.
        schema::check_openable(&conn, migrations)?;
        // 2. Connection settings.
        let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
        conn.execute_batch("PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;")?;
        // 3. Transactional, all-or-nothing migration.
        let version = schema::migrate(&mut conn, migrations)?;
        let fts_ok = conn.query_row("SELECT count(*) FROM memory_fts", [], |r| r.get::<_, i64>(0)).is_ok();
        let clock: Clock = match opts.clock.clone() {
            Some(c) => c,
            None => Arc::new(now_millis),
        };
        let mut store = Store {
            conn: Mutex::new(conn),
            enable_paused: opts.enable_paused,
            fts_enabled: fts_ok && !opts.disable_fts,
            clock,
            db_schema_version: version,
            startup_recovery: RecoveryReport { schema_version: DTO_SCHEMA_VERSION, recovered: vec![] },
        };
        let report = match opts.recovery {
            Recovery::None => None,
            Recovery::ExpiredLeases => Some(store.recover_interrupted(RecoveryMode::ExpiredLeases)?),
            Recovery::AllActive => Some(store.recover_interrupted(RecoveryMode::AllActive)?),
        };
        if let Some(r) = report {
            store.startup_recovery = r;
        }
        Ok(store)
    }

    /// Runs interrupted by the previous process, as found when this handle was opened.
    pub fn startup_recovery(&self) -> &RecoveryReport {
        &self.startup_recovery
    }

    pub fn capabilities(&self) -> Capabilities {
        Capabilities {
            schema_version: DTO_SCHEMA_VERSION,
            db_schema_version: self.db_schema_version,
            fts5: self.fts_enabled,
            search_mode: if self.fts_enabled { SearchMode::Fts5 } else { SearchMode::LikeFallback },
            vector: VectorCapability {
                status: "unavailable".to_string(),
                reason: "no embedding backend is compiled in; no model is ever downloaded automatically".to_string(),
            },
            pause_resume: self.enable_paused,
            limits: LimitsDto {
                max_name_chars: limits::MAX_NAME_CHARS,
                max_goal_chars: limits::MAX_GOAL_CHARS,
                max_memory_content_bytes: limits::MAX_MEMORY_CONTENT_BYTES,
                max_memory_per_space: limits::MAX_MEMORY_PER_SPACE,
                max_event_payload_bytes: limits::MAX_EVENT_PAYLOAD_BYTES,
                max_events_per_run: limits::MAX_EVENTS_PER_RUN,
                max_query_chars: limits::MAX_QUERY_CHARS,
                max_list_limit: limits::MAX_LIST_LIMIT,
            },
        }
    }

    pub(crate) fn now_ms(&self) -> i64 {
        (self.clock)()
    }

    pub(crate) fn now_str(&self) -> String {
        format_millis(self.now_ms())
    }

    /// Run `f` inside an IMMEDIATE transaction; commit on Ok, roll back on Err.
    pub(crate) fn write<T>(&self, f: impl FnOnce(&Transaction<'_>) -> Result<T>) -> Result<T> {
        let mut guard = self.conn.lock().map_err(|_| Error::LockPoisoned)?;
        let tx = guard.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    }

    pub(crate) fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let guard = self.conn.lock().map_err(|_| Error::LockPoisoned)?;
        f(&guard)
    }

    // ------------------------------------------------------------ spaces

    pub fn create_space(&self, req: NewSpace) -> Result<Space> {
        check_version(req.schema_version)?;
        let name = check_text("name", &req.name, limits::MAX_NAME_CHARS, false)?;
        let grant = match (req.scope.kind, &req.scope.folder_grant_id) {
            (ScopeKind::Project, Some(g)) => Some(check_text("folderGrantId", g, 200, false)?),
            (ScopeKind::Project, None) => {
                return Err(Error::InvalidInput("a project space requires folderGrantId".into()));
            }
            (ScopeKind::Personal, Some(_)) => {
                return Err(Error::InvalidInput("a personal space must not carry folderGrantId".into()));
            }
            (ScopeKind::Personal, None) => None,
        };
        let autonomy = req.autonomy.unwrap_or(Autonomy::AskForWrites);
        let id = new_id();
        let now = self.now_str();
        self.write(|tx| {
            tx.execute(
                "INSERT INTO spaces (id, name, scope_kind, folder_grant_id, autonomy, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)",
                params![id, name, req.scope.kind.as_str(), grant, autonomy.as_str(), now],
            )?;
            Ok(())
        })?;
        self.get_space(&id)
    }

    pub fn get_space(&self, id: &str) -> Result<Space> {
        self.read(|c| get_space_conn(c, id))
    }

    pub fn list_spaces(&self, limit: usize) -> Result<Vec<Space>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            let mut st = c.prepare(&format!("SELECT {SPACE_COLS} FROM spaces ORDER BY created_at, id LIMIT ?1"))?;
            let rows = st.query_map(params![lim], space_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    pub fn set_autonomy(&self, space_id: &str, autonomy: Autonomy) -> Result<Space> {
        let now = self.now_str();
        self.write(|tx| {
            let n = tx.execute("UPDATE spaces SET autonomy=?1, updated_at=?2 WHERE id=?3", params![autonomy.as_str(), now, space_id])?;
            if n == 0 {
                return Err(Error::NotFound { entity: "space", id: space_id.to_string() });
            }
            Ok(())
        })?;
        self.get_space(space_id)
    }

    // ------------------------------------------------------------ studios

    pub fn create_studio(&self, req: NewStudio) -> Result<Studio> {
        check_version(req.schema_version)?;
        let goal = check_text("goal", &req.goal, limits::MAX_GOAL_CHARS, false)?;
        let provider = check_text("model.provider", &req.model.provider, limits::MAX_NAME_CHARS, false)?;
        let model = check_text("model.model", &req.model.model, limits::MAX_NAME_CHARS, false)?;
        let id = new_id();
        let now = self.now_str();
        self.write(|tx| {
            ensure_space(tx, &req.space_id)?;
            tx.execute(
                "INSERT INTO studios (id, space_id, goal, model_provider, model_name, model_locality, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![id, req.space_id, goal, provider, model, req.model.locality.as_str(), now],
            )?;
            Ok(())
        })?;
        self.get_studio(&id)
    }

    pub fn get_studio(&self, id: &str) -> Result<Studio> {
        self.read(|c| get_studio_conn(c, id))
    }

    pub fn list_studios(&self, space_id: &str, limit: usize) -> Result<Vec<Studio>> {
        let lim = clamp_limit(limit)?;
        self.read(|c| {
            let mut st = c.prepare(&format!("SELECT {STUDIO_COLS} FROM studios WHERE space_id=?1 ORDER BY created_at, id LIMIT ?2"))?;
            let rows = st.query_map(params![space_id, lim], studio_from_row)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }
}

pub(crate) fn ensure_space(c: &Connection, id: &str) -> Result<()> {
    let n: i64 = c.query_row("SELECT count(*) FROM spaces WHERE id=?1", params![id], |r| r.get(0))?;
    if n == 0 {
        return Err(Error::NotFound { entity: "space", id: id.to_string() });
    }
    Ok(())
}

pub(crate) const SPACE_COLS: &str = "id, name, scope_kind, folder_grant_id, autonomy, created_at, updated_at";

fn space_from_row(r: &Row<'_>) -> rusqlite::Result<Space> {
    Ok(Space {
        schema_version: DTO_SCHEMA_VERSION,
        id: r.get(0)?,
        name: r.get(1)?,
        scope: SpaceScope { kind: enum_col(r, 2, ScopeKind::parse)?, folder_grant_id: r.get(3)? },
        autonomy: enum_col(r, 4, Autonomy::parse)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

fn get_space_conn(c: &Connection, id: &str) -> Result<Space> {
    c.query_row(&format!("SELECT {SPACE_COLS} FROM spaces WHERE id=?1"), params![id], space_from_row)
        .optional()?
        .ok_or_else(|| Error::NotFound { entity: "space", id: id.to_string() })
}

const STUDIO_COLS: &str = "id, space_id, goal, model_provider, model_name, model_locality, created_at";

fn studio_from_row(r: &Row<'_>) -> rusqlite::Result<Studio> {
    Ok(Studio {
        schema_version: DTO_SCHEMA_VERSION,
        id: r.get(0)?,
        space_id: r.get(1)?,
        goal: r.get(2)?,
        model: ModelRef { provider: r.get(3)?, model: r.get(4)?, locality: enum_col(r, 5, ModelLocality::parse)? },
        created_at: r.get(6)?,
    })
}

pub(crate) fn get_studio_conn(c: &Connection, id: &str) -> Result<Studio> {
    c.query_row(&format!("SELECT {STUDIO_COLS} FROM studios WHERE id=?1"), params![id], studio_from_row)
        .optional()?
        .ok_or_else(|| Error::NotFound { entity: "studio", id: id.to_string() })
}
