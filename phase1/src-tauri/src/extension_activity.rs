//! Host-owned audit history. Archives are never purged, including on disable/uninstall.
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

pub const ROTATE_BYTES: u64 = 10 * 1024 * 1024;
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id.split('.').all(|p| {
            !p.is_empty()
                && p.as_bytes()[0].is_ascii_alphanumeric()
                && p.bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        })
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivityEvent {
    pub id: String,
    pub ts: String,
    pub extension_id: String,
    pub extension_name: String,
    pub api: String,
    pub target: Option<String>,
    pub decision: Decision,
    pub kind: Kind,
    pub latency_ms: Option<u64>,
    pub scope: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    Allowed,
    Denied,
    Prompted,
    Changed,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Permission,
    Network,
    Lifecycle,
    Consent,
}
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivityFilter {
    pub extension_id: Option<String>,
    pub decision: Option<Decision>,
    pub kind: Option<Kind>,
    pub search: Option<String>,
    pub before: Option<String>,
    pub after: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPage {
    pub events: Vec<ActivityEvent>,
    pub next_offset: Option<usize>,
    pub total: usize,
}

/// Host passes concrete paths/hosts, never RPC argument blobs. Strip credentials/query/fragment,
/// redact recognised secrets, and bound strings before BOTH persistence and export.
pub fn sanitize(value: &str, max: usize) -> String {
    let value = value.split(['?', '#']).next().unwrap_or("");
    let value = if let Some((scheme, tail)) = value.split_once("://") {
        let end = tail.find('/').unwrap_or(tail.len());
        let authority = tail[..end].rsplit('@').next().unwrap_or("");
        format!("{scheme}://{authority}{}", &tail[end..])
    } else {
        value.to_string()
    };
    crate::applog::redact(&value)
        .chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect()
}
fn clean(mut event: ActivityEvent) -> Result<ActivityEvent, String> {
    if !valid_id(&event.extension_id) {
        return Err("Invalid extension id".into());
    }
    event.id = uuid::Uuid::new_v4().to_string();
    event.ts = crate::applog::timestamp();
    if event.api.is_empty()
        || event.api.len() > 120
        || !event
            .api
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-'))
    {
        return Err("Invalid activity API".into());
    }
    event.extension_name = sanitize(&event.extension_name, 100);
    event.target = event.target.map(|s| sanitize(&s, 2048));
    event.scope = event.scope.map(|s| sanitize(&s, 280));
    Ok(event)
}
pub struct ActivityStore {
    root: PathBuf,
    rotate_bytes: u64,
    lock: Mutex<()>,
}
impl ActivityStore {
    pub fn new(app_data: &Path) -> Self {
        Self {
            root: app_data.join("extensions"),
            rotate_bytes: ROTATE_BYTES,
            lock: Mutex::new(()),
        }
    }
    pub fn append(&self, event: ActivityEvent) -> Result<ActivityEvent, String> {
        let _guard = self.lock.lock().map_err(|_| "Activity store lock failed")?;
        let event = clean(event)?;
        let dir = self.root.join(&event.extension_id);
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        if fs::symlink_metadata(&self.root)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Activity root is a symlink".into());
        }
        if let Ok(meta) = fs::symlink_metadata(&dir) {
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err("Activity directory is not a regular directory".into());
            }
        }
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("activity.jsonl");
        if let Ok(meta) = fs::symlink_metadata(&path) {
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err("Activity log is not a regular file".into());
            }
        }
        let mut bytes = serde_json::to_vec(&event).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        if path
            .metadata()
            .map(|m| m.len() + bytes.len() as u64 > self.rotate_bytes)
            .unwrap_or(false)
        {
            fs::rename(
                &path,
                dir.join(format!("activity-{}.jsonl", uuid::Uuid::new_v4())),
            )
            .map_err(|e| e.to_string())?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(event)
    }
    fn read(&self, filter: &ActivityFilter) -> Result<Vec<ActivityEvent>, String> {
        if let Some(id) = &filter.extension_id {
            if !valid_id(id) {
                return Err("Invalid extension id".into());
            }
        }
        let mut events = Vec::new();
        if let Ok(meta) = fs::symlink_metadata(&self.root) {
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err("Activity root is not a regular directory".into());
            }
        }
        let dirs = match fs::read_dir(&self.root) {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(events),
            Err(e) => return Err(e.to_string()),
        };
        for dir in dirs {
            let dir = dir.map_err(|e| e.to_string())?;
            if !dir.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let name = dir.file_name().to_string_lossy().to_string();
            if !valid_id(&name) || filter.extension_id.as_ref().is_some_and(|id| id != &name) {
                continue;
            }
            for entry in fs::read_dir(dir.path()).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let n = entry.file_name().to_string_lossy().to_string();
                if !(n == "activity.jsonl" || (n.starts_with("activity-") && n.ends_with(".jsonl")))
                {
                    continue;
                }
                if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
                    return Err("Activity segment is not a regular file".into());
                }
                for line in
                    BufReader::new(fs::File::open(entry.path()).map_err(|e| e.to_string())?).lines()
                {
                    let mut e: ActivityEvent =
                        serde_json::from_str(&line.map_err(|e| e.to_string())?)
                            .map_err(|_| "Activity history is incomplete or unreadable")?;
                    if e.extension_id != name {
                        return Err("Activity segment identity mismatch".into());
                    }
                    // Also sanitize legacy/imported rows before query/search/export.
                    e.target = e.target.map(|s| sanitize(&s, 2048));
                    e.scope = e.scope.map(|s| sanitize(&s, 280));
                    e.extension_name = sanitize(&e.extension_name, 100);
                    if filter.decision.as_ref().is_some_and(|v| v != &e.decision)
                        || filter.kind.as_ref().is_some_and(|v| v != &e.kind)
                        || filter.before.as_ref().is_some_and(|v| &e.ts >= v)
                        || filter.after.as_ref().is_some_and(|v| &e.ts < v)
                    {
                        continue;
                    }
                    if let Some(q) = &filter.search {
                        let text = format!(
                            "{} {} {}",
                            e.api,
                            e.target.as_deref().unwrap_or(""),
                            e.extension_name
                        )
                        .to_lowercase();
                        if !text.contains(&q.to_lowercase()) {
                            continue;
                        }
                    }
                    events.push(e);
                }
            }
        }
        events.sort_by(|a, b| b.ts.cmp(&a.ts).then(b.id.cmp(&a.id)));
        Ok(events)
    }
    pub fn query(
        &self,
        filter: &ActivityFilter,
        offset: usize,
        limit: usize,
    ) -> Result<ActivityPage, String> {
        let _guard = self.lock.lock().map_err(|_| "Activity store lock failed")?;
        if !(1..=500).contains(&limit) {
            return Err("Activity page size must be 1 to 500".into());
        }
        let events = self.read(filter)?;
        let total = events.len();
        let end = offset.saturating_add(limit).min(total);
        let page = events.into_iter().skip(offset).take(limit).collect();
        Ok(ActivityPage {
            events: page,
            next_offset: if end < total { Some(end) } else { None },
            total,
        })
    }
    /// Export returns sanitized JSONL only. The caller chooses a local destination via a save dialog.
    pub fn export(&self, filter: &ActivityFilter) -> Result<String, String> {
        let _guard = self.lock.lock().map_err(|_| "Activity store lock failed")?;
        let mut out = String::new();
        for event in self.read(filter)? {
            out.push_str(&serde_json::to_string(&event).map_err(|e| e.to_string())?);
            out.push('\n');
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn event() -> ActivityEvent {
        ActivityEvent {
            id: String::new(),
            ts: String::new(),
            extension_id: "svg-optimizer".into(),
            extension_name: "SVG Optimizer".into(),
            api: "net.fetch".into(),
            target: Some("https://user:password@example.org/api?token=secret#x".into()),
            decision: Decision::Allowed,
            kind: Kind::Network,
            latency_ms: Some(12),
            scope: None,
        }
    }
    #[test]
    fn rotation_restart_filters_export() {
        let d = tempfile::tempdir().unwrap();
        let mut s = ActivityStore::new(d.path());
        s.rotate_bytes = 1;
        for _ in 0..4 {
            s.append(event()).unwrap();
        }
        let s = ActivityStore::new(d.path());
        let f = ActivityFilter {
            kind: Some(Kind::Network),
            search: Some("example.org".into()),
            ..Default::default()
        };
        let p = s.query(&f, 0, 2).unwrap();
        assert_eq!(p.total, 4);
        assert_eq!(p.next_offset, Some(2));
        assert_eq!(s.query(&f, 2, 2).unwrap().events.len(), 2);
        let text = s.export(&f).unwrap();
        assert_eq!(text.lines().count(), 4);
        assert!(!text.contains("password"));
        assert!(!text.contains("token="));
    }
    #[test]
    fn corrupt_history_is_error_not_empty() {
        let d = tempfile::tempdir().unwrap();
        let s = ActivityStore::new(d.path());
        s.append(event()).unwrap();
        fs::write(
            d.path().join("extensions/svg-optimizer/activity.jsonl"),
            "{broken",
        )
        .unwrap();
        assert!(s.query(&ActivityFilter::default(), 0, 10).is_err());
    }
    #[test]
    fn permission_and_lifecycle_filters_use_saved_names() {
        let d = tempfile::tempdir().unwrap();
        let s = ActivityStore::new(d.path());
        let mut e = event();
        e.kind = Kind::Lifecycle;
        e.decision = Decision::Changed;
        e.api = "extension.blocked".into();
        s.append(e).unwrap();
        s.append(event()).unwrap();
        let f = ActivityFilter {
            decision: Some(Decision::Changed),
            kind: Some(Kind::Lifecycle),
            search: Some("SVG Optimizer".into()),
            ..Default::default()
        };
        assert_eq!(s.query(&f, 0, 100).unwrap().total, 1);
        assert_eq!(s.export(&f).unwrap().lines().count(), 1);
        let f = ActivityFilter {
            extension_id: Some("other".into()),
            ..Default::default()
        };
        assert_eq!(s.query(&f, 0, 100).unwrap().total, 0);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_rejected_on_write_and_read() {
        use std::os::unix::fs::symlink;
        let d = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), d.path().join("extensions")).unwrap();
        let s = ActivityStore::new(d.path());
        assert!(s.append(event()).is_err());
        assert!(s.query(&ActivityFilter::default(), 0, 10).is_err());
    }
    #[test]
    fn invalid_ids_and_limits() {
        let d = tempfile::tempdir().unwrap();
        let s = ActivityStore::new(d.path());
        let mut e = event();
        e.extension_id = "../escape".into();
        assert!(s.append(e).is_err());
        assert!(s.query(&ActivityFilter::default(), 0, 0).is_err());
        assert!(valid_id("acme.svg"));
        assert!(!valid_id("a..b"));
    }
}
