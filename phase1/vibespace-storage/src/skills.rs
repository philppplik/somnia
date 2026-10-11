//! Skills registry (data model only). A skill is an Agent Skills `SKILL.md` folder.
//!
//! Hard limits of this package, enforced here and covered by tests:
//! * Installing never executes anything. There is no run/execute API and no "scripts enabled" state.
//! * `allowed-tools` is stored as `requested_tools` for display. No field or API can turn it into a pre-approval.
//! * `verified` can only be set for first-party `builtin` skills (the verified seed). A new version
//!   never inherits `verified`; it is parked as `latest` until the user accepts the update diff.

use crate::error::{Error, Result};
use crate::store::{check_text, ensure_space, new_id, Store};
use crate::DTO_SCHEMA_VERSION;
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

pub const MAX_SKILL_FILES: usize = 200;
pub const MAX_SKILL_FILE_BYTES: usize = 256 * 1024;
pub const MAX_SKILL_TOTAL_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SKILLS_PER_SCOPE: i64 = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillScope {
    Space,
    User,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillSource {
    Local,
    Github,
    Index,
    Builtin,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillTrust {
    Unreviewed,
    Scanned,
    Verified,
}
macro_rules! s {
    ($t:ident { $($v:ident => $s:literal),+ }) => {
        impl $t {
            pub fn as_str(&self) -> &'static str { match self { $($t::$v => $s),+ } }
            pub fn parse(x: &str) -> Option<$t> { match x { $($s => Some($t::$v),)+ _ => None } }
        }
    };
}
s!(SkillScope { Space => "space", User => "user" });
s!(SkillSource { Local => "local", Github => "github", Index => "index", Builtin => "builtin" });
s!(SkillTrust { Unreviewed => "unreviewed", Scanned => "scanned", Verified => "verified" });

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SkillFile {
    /// Relative, `/`-separated, no `..`, no absolute path.
    pub path: String,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFinding {
    pub rule: String,
    /// `high` | `medium` | `info`
    pub severity: String,
    pub file: String,
    pub line: usize,
    pub excerpt: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub findings: Vec<ScanFinding>,
    /// True when no `high` finding exists. Never a safety guarantee.
    pub passed: bool,
    pub scanner_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewSkillVersion {
    pub scope: SkillScope,
    pub space_id: Option<String>,
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    pub source_ref: Option<String>,
    pub pinned_commit: Option<String>,
    pub skill_md: String,
    pub files: Vec<SkillFile>,
    pub scan: ScanReport,
    /// Parsed `allowed-tools` (display only).
    pub requested_tools: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub schema_version: u32,
    pub id: String,
    pub scope: SkillScope,
    pub space_id: Option<String>,
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    pub source_ref: Option<String>,
    pub pinned_commit: Option<String>,
    pub trust: SkillTrust,
    pub active_version: i64,
    pub latest_version: i64,
    pub update_pending: bool,
    pub scripts_runnable: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillVersion {
    pub version: i64,
    pub content_hash: String,
    pub skill_md: String,
    pub files: Vec<SkillFile>,
    pub scan: ScanReport,
    pub requested_tools: Vec<String>,
    pub created_at: String,
}

const COLS: &str = "id, scope, space_id, name, description, source_kind, source_ref, pinned_commit, trust, active_version, latest_version, created_at, updated_at";

fn bad(i: usize, s: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(i, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, s)))
}
fn summary(r: &Row<'_>) -> rusqlite::Result<SkillSummary> {
    let g = |i: usize| -> rusqlite::Result<String> { r.get(i) };
    let active: i64 = r.get(9)?;
    let latest: i64 = r.get(10)?;
    Ok(SkillSummary {
        schema_version: DTO_SCHEMA_VERSION,
        id: g(0)?,
        scope: SkillScope::parse(&g(1)?).ok_or_else(|| bad(1, "scope".into()))?,
        space_id: r.get(2)?,
        name: g(3)?,
        description: g(4)?,
        source: SkillSource::parse(&g(5)?).ok_or_else(|| bad(5, "source".into()))?,
        source_ref: r.get(6)?,
        pinned_commit: r.get(7)?,
        trust: SkillTrust::parse(&g(8)?).ok_or_else(|| bad(8, "trust".into()))?,
        active_version: active,
        latest_version: latest,
        update_pending: latest > active,
        scripts_runnable: false,
        created_at: g(11)?,
        updated_at: g(12)?,
    })
}

fn hash(skill_md: &str, files: &[SkillFile]) -> String {
    // FNV-1a 64 over a canonical form; change detection, not a security boundary.
    let mut h: u64 = 0xcbf29ce484222325;
    let mut feed = |b: &[u8]| {
        for x in b {
            h ^= *x as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h ^= 0xff;
        h = h.wrapping_mul(0x100000001b3);
    };
    feed(skill_md.as_bytes());
    let mut sorted: Vec<&SkillFile> = files.iter().collect();
    sorted.sort_by(|a, b| a.path.cmp(&b.path));
    for f in sorted {
        feed(f.path.as_bytes());
        feed(f.content.as_bytes());
    }
    format!("{h:016x}")
}

fn check_files(files: &[SkillFile]) -> Result<()> {
    if files.len() > MAX_SKILL_FILES {
        return Err(Error::LimitExceeded(format!("a skill has at most {MAX_SKILL_FILES} files")));
    }
    let mut total = 0;
    let mut seen = std::collections::HashSet::new();
    for f in files {
        let p = &f.path;
        if p.is_empty() || p.starts_with('/') || p.contains('\\') || p.contains('\0') || p.split('/').any(|c| c == ".." || c == "." || c.is_empty()) {
            return Err(Error::InvalidInput(format!("unsafe skill file path: {p:?}")));
        }
        if !seen.insert(p.clone()) {
            return Err(Error::InvalidInput(format!("duplicate skill file path: {p}")));
        }
        if f.content.len() > MAX_SKILL_FILE_BYTES {
            return Err(Error::LimitExceeded(format!("{p} exceeds {MAX_SKILL_FILE_BYTES} bytes")));
        }
        total += f.content.len();
    }
    if total > MAX_SKILL_TOTAL_BYTES {
        return Err(Error::LimitExceeded("skill bundle too large".into()));
    }
    Ok(())
}

fn trust_from_scan(scan: &ScanReport) -> SkillTrust {
    if scan.passed {
        SkillTrust::Scanned
    } else {
        SkillTrust::Unreviewed
    }
}

impl Store {
    /// Installs a new skill (version 1) or adds a new LATEST version to an existing one.
    /// Install never executes anything. A new version of an existing skill does not become active
    /// until `accept_skill_update`; the user sees the diff first. Returns the summary.
    pub fn install_skill(&self, req: NewSkillVersion) -> Result<SkillSummary> {
        let name = check_text("name", &req.name, 64, false)?;
        let description = check_text("description", &req.description, 1024, false)?;
        match (req.scope, &req.space_id) {
            (SkillScope::Space, None) => return Err(Error::InvalidInput("a space-scoped skill needs spaceId".into())),
            (SkillScope::User, Some(_)) => return Err(Error::InvalidInput("a user-scoped skill must not carry spaceId".into())),
            _ => {}
        }
        if req.skill_md.len() > MAX_SKILL_FILE_BYTES {
            return Err(Error::LimitExceeded("SKILL.md too large".into()));
        }
        check_files(&req.files)?;
        let h = hash(&req.skill_md, &req.files);
        let files_json = serde_json::to_string(&req.files)?;
        let scan_json = serde_json::to_string(&serde_json::json!({"report": req.scan, "requestedTools": req.requested_tools}))?;
        let now = self.now_str();
        let trust = trust_from_scan(&req.scan);
        let id = self.write(|tx| {
            if let Some(sp) = &req.space_id {
                ensure_space(tx, sp)?;
            }
            let existing: Option<(String, i64, i64)> = tx
                .query_row(
                    "SELECT id, active_version, latest_version FROM skills WHERE scope=?1 AND COALESCE(space_id,'')=COALESCE(?2,'') AND name=?3",
                    params![req.scope.as_str(), req.space_id, name],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?;
            match existing {
                None => {
                    let n: i64 = tx.query_row(
                        "SELECT count(*) FROM skills WHERE scope=?1 AND COALESCE(space_id,'')=COALESCE(?2,'')",
                        params![req.scope.as_str(), req.space_id],
                        |r| r.get(0),
                    )?;
                    if n >= MAX_SKILLS_PER_SCOPE {
                        return Err(Error::LimitExceeded("too many skills in this scope".into()));
                    }
                    let id = new_id();
                    tx.execute(
                        "INSERT INTO skills (id, scope, space_id, name, description, source_kind, source_ref, pinned_commit, trust, active_version, latest_version, created_at, updated_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,1,?10,?10)",
                        params![id, req.scope.as_str(), req.space_id, name, description, req.source.as_str(), req.source_ref, req.pinned_commit, trust.as_str(), now],
                    )?;
                    tx.execute(
                        "INSERT INTO skill_versions (skill_id, version, content_hash, skill_md, files_json, scan_json, created_at) VALUES (?1,1,?2,?3,?4,?5,?6)",
                        params![id, h, req.skill_md, files_json, scan_json, now],
                    )?;
                    Ok(id)
                }
                Some((id, _active, latest)) => {
                    let same: bool = tx.query_row(
                        "SELECT content_hash = ?3 FROM skill_versions WHERE skill_id=?1 AND version=?2",
                        params![id, latest, h],
                        |r| r.get(0),
                    )?;
                    if same {
                        return Err(Error::Conflict("this exact version is already installed".into()));
                    }
                    let v = latest + 1;
                    tx.execute(
                        "INSERT INTO skill_versions (skill_id, version, content_hash, skill_md, files_json, scan_json, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                        params![id, v, h, req.skill_md, files_json, scan_json, now],
                    )?;
                    tx.execute(
                        "UPDATE skills SET latest_version=?2, pinned_commit=COALESCE(?3, pinned_commit), updated_at=?4 WHERE id=?1",
                        params![id, v, req.pinned_commit, now],
                    )?;
                    Ok(id)
                }
            }
        })?;
        self.get_skill(&id)?.ok_or(Error::NotFound { entity: "skill", id })
    }

    pub fn get_skill(&self, id: &str) -> Result<Option<SkillSummary>> {
        self.read(|c| Ok(c.query_row(&format!("SELECT {COLS} FROM skills WHERE id=?1"), params![id], summary).optional()?))
    }

    /// Skills visible to a space: its own plus user-wide ones. `space_id=None` lists user-wide only.
    /// Project skills of other spaces are never returned.
    pub fn list_skills(&self, space_id: Option<&str>) -> Result<Vec<SkillSummary>> {
        self.read(|c| {
            if let Some(sp) = space_id {
                ensure_space(c, sp)?;
            }
            let mut st = c.prepare(&format!(
                "SELECT {COLS} FROM skills WHERE scope='user' OR (scope='space' AND space_id=?1) ORDER BY scope DESC, name"
            ))?;
            let rows = st.query_map(params![space_id], summary)?;
            let mut out = Vec::new();
            for r in rows {
                out.push(r?);
            }
            Ok(out)
        })
    }

    pub fn get_skill_version(&self, id: &str, version: i64) -> Result<Option<SkillVersion>> {
        self.read(|c| {
            let row = c
                .query_row(
                    "SELECT version, content_hash, skill_md, files_json, scan_json, created_at FROM skill_versions WHERE skill_id=?1 AND version=?2",
                    params![id, version],
                    |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?)),
                )
                .optional()?;
            let Some((version, content_hash, skill_md, files_json, scan_json, created_at)) = row else { return Ok(None) };
            let v: serde_json::Value = serde_json::from_str(&scan_json)?;
            Ok(Some(SkillVersion {
                version,
                content_hash,
                skill_md,
                files: serde_json::from_str(&files_json)?,
                scan: serde_json::from_value(v["report"].clone())?,
                requested_tools: serde_json::from_value(v["requestedTools"].clone())?,
                created_at,
            }))
        })
    }

    /// The user accepted the shown update diff. Trust is recomputed from the NEW version's scan:
    /// `verified` is never carried over (only builtin skills can be re-verified by the app).
    pub fn accept_skill_update(&self, id: &str) -> Result<SkillSummary> {
        let now = self.now_str();
        self.write(|tx| {
            let (latest, active, source): (i64, i64, String) = tx
                .query_row("SELECT latest_version, active_version, source_kind FROM skills WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .optional()?
                .ok_or(Error::NotFound { entity: "skill", id: id.to_string() })?;
            if latest <= active {
                return Err(Error::Conflict("no pending update".into()));
            }
            let scan_json: String = tx.query_row("SELECT scan_json FROM skill_versions WHERE skill_id=?1 AND version=?2", params![id, latest], |r| r.get(0))?;
            let v: serde_json::Value = serde_json::from_str(&scan_json)?;
            let rep: ScanReport = serde_json::from_value(v["report"].clone())?;
            let mut trust = trust_from_scan(&rep);
            if source == "builtin" && rep.passed {
                trust = SkillTrust::Verified;
            }
            tx.execute("UPDATE skills SET active_version=?2, trust=?3, updated_at=?4 WHERE id=?1", params![id, latest, trust.as_str(), now])?;
            Ok(())
        })?;
        self.get_skill(id)?.ok_or(Error::NotFound { entity: "skill", id: id.to_string() })
    }

    /// Drops a pending (not yet accepted) update.
    pub fn reject_skill_update(&self, id: &str) -> Result<SkillSummary> {
        self.write(|tx| {
            let (latest, active): (i64, i64) = tx
                .query_row("SELECT latest_version, active_version FROM skills WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?
                .ok_or(Error::NotFound { entity: "skill", id: id.to_string() })?;
            if latest <= active {
                return Err(Error::Conflict("no pending update".into()));
            }
            tx.execute("DELETE FROM skill_versions WHERE skill_id=?1 AND version>?2", params![id, active])?;
            tx.execute("UPDATE skills SET latest_version=?2 WHERE id=?1", params![id, active])?;
            Ok(())
        })?;
        self.get_skill(id)?.ok_or(Error::NotFound { entity: "skill", id: id.to_string() })
    }

    /// Only first-party `builtin` skills whose active scan passed can become `verified`.
    pub fn mark_skill_verified(&self, id: &str) -> Result<SkillSummary> {
        let now = self.now_str();
        self.write(|tx| {
            let (source, trust): (String, String) = tx
                .query_row("SELECT source_kind, trust FROM skills WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?
                .ok_or(Error::NotFound { entity: "skill", id: id.to_string() })?;
            if source != "builtin" {
                return Err(Error::Unsupported("only first-party builtin skills can be verified in this version".into()));
            }
            if trust == "unreviewed" {
                return Err(Error::Conflict("a skill must pass the scan before it can be verified".into()));
            }
            tx.execute("UPDATE skills SET trust='verified', updated_at=?2 WHERE id=?1", params![id, now])?;
            Ok(())
        })?;
        self.get_skill(id)?.ok_or(Error::NotFound { entity: "skill", id: id.to_string() })
    }

    pub fn uninstall_skill(&self, id: &str) -> Result<bool> {
        self.write(|tx| Ok(tx.execute("DELETE FROM skills WHERE id=?1", params![id])? > 0))
    }
}
