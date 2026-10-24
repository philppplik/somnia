//! Rust-owned scheduling. No engine loop, process runner, automatic daemon or policy bypass.
//! All times are UTC epoch milliseconds; cron is evaluated as local wall time.
mod manager;
use chrono::{DateTime, LocalResult, TimeZone, Utc};
use chrono_tz::Tz;
use croner::Cron;
pub use manager::*;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid schedule: {0}")]
    Invalid(String),
    #[error("scheduler storage error")]
    Sql(#[from] rusqlite::Error),
    #[error("scheduler storage migration error")]
    Storage(#[from] somnia_vibespace_storage::Error),
    #[error("scheduler serialization error")]
    Json(#[from] serde_json::Error),
    #[error("runtime ownership is not available")]
    Ownership,
    #[error("lease expired or fencing token changed")]
    Fenced,
    #[error("auto-apply requires explicit opt-in and in-scope consent")]
    AutoApplyDenied,
    #[error("runtime port rejected the request")]
    Runtime,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MisfirePolicy {
    Skip,
    #[default]
    Coalesce,
    CatchUp {
        cap: usize,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConsentLevel {
    AskForEverything,
    AskForWrites,
    AutonomousInScope,
}
impl Default for ConsentLevel {
    fn default() -> Self {
        Self::AskForWrites
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduleSpec {
    pub name: String,
    pub studio_id: String,
    pub cron_expr: String,
    pub timezone: String,
    #[serde(default)]
    pub misfire_policy: MisfirePolicy,
    #[serde(default)]
    pub consent_level: ConsentLevel,
    // Neither autonomy nor a serialized skill can enable this implicitly.
    #[serde(default)]
    pub auto_apply: bool,
}
impl ScheduleSpec {
    pub fn validate(&self) -> Result<()> {
        if self.name.trim().is_empty()
            || self.name.chars().count() > 200
            || self.name.contains('\0')
            || self.studio_id.is_empty()
            || self.studio_id.len() > 200
        {
            return Err(Error::Invalid("name or studio id".into()));
        }
        cron(&self.cron_expr)?;
        zone(&self.timezone)?;
        if let MisfirePolicy::CatchUp { cap } = self.misfire_policy {
            if !(1..=100).contains(&cap) {
                return Err(Error::Invalid("catch-up cap must be 1..100".into()));
            }
        }
        if self.auto_apply && self.consent_level != ConsentLevel::AutonomousInScope {
            return Err(Error::AutoApplyDenied);
        }
        Ok(())
    }
}
fn zone(s: &str) -> Result<Tz> {
    Tz::from_str(s).map_err(|_| Error::Invalid("unknown IANA timezone".into()))
}
fn cron(s: &str) -> Result<Cron> {
    if s.len() > 200 || s.split_whitespace().count() != 5 {
        return Err(Error::Invalid(
            "use a five-field minute cron expression".into(),
        ));
    }
    Cron::from_str(s).map_err(|_| Error::Invalid("invalid cron expression".into()))
}
pub fn timestamp(ms: i64) -> Result<DateTime<Utc>> {
    Utc.timestamp_millis_opt(ms)
        .single()
        .ok_or_else(|| Error::Invalid("timestamp out of range".into()))
}
/// Find local wall-clock matches first, then resolve them through IANA tz rules.
/// Missing local times are skipped. Ambiguous times use the FIRST occurrence only.
/// This deliberately does not depend on croner's timezone traversal semantics.
pub fn next_occurrence(expr: &str, tz: &str, after_ms: i64) -> Result<i64> {
    let cron = cron(expr)?;
    let tz = zone(tz)?;
    let local = timestamp(after_ms)?.with_timezone(&tz).naive_local();
    let mut cursor = DateTime::<Utc>::from_naive_utc_and_offset(local, Utc);
    // Include the current wall-clock minute when a caller is in the second fold.
    // UTC comparison below prevents re-firing its already-past first occurrence.
    for _ in 0..10_000 {
        let wall = cron
            .find_next_occurrence(&cursor, false)
            .map_err(|_| Error::Invalid("no cron occurrence in supported range".into()))?;
        let resolved = match tz.from_local_datetime(&wall.naive_utc()) {
            LocalResult::Single(t) => Some(t),
            LocalResult::Ambiguous(first, second) => Some(first.min(second)),
            LocalResult::None => None,
        };
        if let Some(t) = resolved {
            if t.timestamp_millis() > after_ms {
                return Ok(t.timestamp_millis());
            }
        }
        cursor = wall;
    }
    Err(Error::Invalid("cron search limit reached".into()))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub description: String,
    pub next_fire_times: Vec<i64>,
    pub app_must_be_open: bool,
}
pub fn preview(spec: &ScheduleSpec, now_ms: i64) -> Result<Preview> {
    spec.validate()?;
    let mut t = now_ms;
    let mut times = Vec::new();
    for _ in 0..3 {
        t = next_occurrence(&spec.cron_expr, &spec.timezone, t)?;
        times.push(t);
    }
    Ok(Preview {
        description: describe(&spec.cron_expr, &spec.timezone),
        next_fire_times: times,
        app_must_be_open: true,
    })
}
#[derive(Debug, PartialEq, Eq)]
pub struct MisfirePlan {
    pub enqueue: Vec<i64>,
    pub missed: usize,
    pub omitted: usize,
}
/// Grace separates a slightly late live tick from a genuine missed slot.
/// Even Skip runs a live slot. Coalesce chooses the latest missed slot.
pub fn plan_misfires(
    slots: &[i64],
    now: i64,
    grace_ms: i64,
    policy: &MisfirePolicy,
) -> MisfirePlan {
    let (missed, live): (Vec<_>, Vec<_>) = slots.iter().copied().partition(|t| *t < now - grace_ms);
    let mut selected = match policy {
        MisfirePolicy::Skip => vec![],
        MisfirePolicy::Coalesce => missed.last().copied().into_iter().collect(),
        MisfirePolicy::CatchUp { cap } => missed
            .iter()
            .rev()
            .take(*cap)
            .copied()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect(),
    };
    let omitted = missed.len() - selected.len();
    selected.extend(live);
    MisfirePlan {
        enqueue: selected,
        missed: missed.len(),
        omitted,
    }
}

/// Plain description is produced next to the authoritative parser. UI does not
/// approximate cron or calculate its own next fires.
pub fn describe(expr: &str, tz: &str) -> String {
    let fields = expr.split_whitespace().collect::<Vec<_>>();
    if fields.len() != 5 {
        return format!("Cron {expr} ({tz})");
    }
    let (m, h, d, mo, w) = (fields[0], fields[1], fields[2], fields[3], fields[4]);
    if expr == "* * * * *" {
        return format!("Every minute ({tz})");
    }
    if d == "*" && mo == "*" {
        if let (Ok(min), Ok(hour)) = (m.parse::<u8>(), h.parse::<u8>()) {
            if w == "*" {
                return format!("Every day at {hour:02}:{min:02} ({tz})");
            }
            let day = match w {
                "0" | "7" | "SUN" => Some("Sunday"),
                "1" | "MON" => Some("Monday"),
                "2" | "TUE" => Some("Tuesday"),
                "3" | "WED" => Some("Wednesday"),
                "4" | "THU" => Some("Thursday"),
                "5" | "FRI" => Some("Friday"),
                "6" | "SAT" => Some("Saturday"),
                _ => None,
            };
            if let Some(day) = day {
                return format!("Every {day} at {hour:02}:{min:02} ({tz})");
            }
        }
    }
    format!("Minute {m}; hour {h}; day {d}; month {mo}; weekday {w} ({tz})")
}
