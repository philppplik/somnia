//! No network, shell execution, or ambient project-path APIs are exposed to IPC.
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use fs2::FileExt;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_DOCS: usize = 64;
const MAX_FILES: usize = 20_000;
const QUIET: Duration = Duration::from_millis(1000);
const MAX_WAIT: Duration = Duration::from_secs(5);
const POLL: Duration = Duration::from_secs(2);

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("I/O failed: {0}")]
    Io(String),
    #[error("Path denied: {0}")]
    Denied(String),
    #[error("The disk file changed; compare or reload before saving")]
    Conflict,
    #[error("No staged edit exists")]
    NoEdit,
    #[error("Stale client revision")]
    StaleRevision,
    #[error("File/project limit exceeded")]
    Limit,
    #[error("Another Somnia process has this project open")]
    Locked,
    #[error("Project is closed or belongs to another window")]
    UnknownProject,
    #[error("Invalid UTF-8 or corrupt recovery record: {0}")]
    Invalid(String),
    #[error("Unsaved edits remain; retain or discard them explicitly")]
    Dirty,
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub exists: bool,
    pub hash: Option<String>,
}
impl Revision {
    fn missing() -> Self {
        Self {
            exists: false,
            hash: None,
        }
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileState {
    Saved,
    Dirty,
    Saving,
    Conflict,
    Error,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateEvent {
    pub project_id: String,
    pub path: String,
    pub client_revision: u64,
    pub state: FileState,
    pub saved_hash: Option<String>,
    pub disk_revision: Revision,
    pub error: Option<String>,
    pub durability: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadReply {
    pub content: Option<String>,
    pub revision: Revision,
    pub status: StateEvent,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    pub schema: u32,
    pub path: String,
    pub base_revision: Revision,
    pub client_revision: u64,
    pub content: String,
    pub updated_at_ms: u64,
}
#[derive(Debug)]
struct Document {
    base: Revision,
    observed: Revision,
    pending: Option<String>,
    client_revision: u64,
    first_edit: Instant,
    last_edit: Instant,
    state: FileState,
    error: Option<String>,
}

pub struct Project {
    pub id: String,
    root: Dir,
    recovery: Dir,
    _lock: fs::File,
    documents: BTreeMap<String, Document>,
    _watcher: Option<RecommendedWatcher>,
    changed: Arc<AtomicBool>,
    last_poll: Instant,
}

/// Only called by the native picker adapter, never with a renderer-supplied root.
impl Project {
    pub fn open(root: &Path, recovery_base: &Path) -> Result<Self> {
        let root_path = root.canonicalize()?;
        if !root_path.is_dir() {
            return Err(AppError::Denied("Not a directory".into()));
        }
        let key = hash(root_path.to_string_lossy().as_bytes());
        let recovery_path = recovery_base.join(key);
        fs::create_dir_all(&recovery_path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&recovery_path, fs::Permissions::from_mode(0o700))?;
        }
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(recovery_path.join("session.lock"))?;
        lock.try_lock_exclusive().map_err(|_| AppError::Locked)?;
        let root = Dir::open_ambient_dir(&root_path, ambient_authority())?;
        let recovery = Dir::open_ambient_dir(&recovery_path, ambient_authority())?;
        let changed = Arc::new(AtomicBool::new(false));
        let flag = changed.clone();
        #[allow(clippy::manual_filter)] // Watch registration requires mutable access.
        let watcher = notify::recommended_watcher(move |_result: notify::Result<notify::Event>| {
            flag.store(true, Ordering::Release);
        })
        .ok()
        .and_then(|mut w| {
            if w.watch(&root_path, RecursiveMode::Recursive).is_ok() {
                Some(w)
            } else {
                None
            }
        });
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            root,
            recovery,
            _lock: lock,
            documents: BTreeMap::new(),
            _watcher: watcher,
            changed,
            last_poll: Instant::now(),
        })
    }

    fn safe_path(&self, path: &str) -> Result<PathBuf> {
        let p = validate_path(path)?;
        let mut prefix = PathBuf::new();
        for component in p.components() {
            prefix.push(component);
            match self.root.symlink_metadata(&prefix) {
                Ok(m) if m.file_type().is_symlink() => {
                    return Err(AppError::Denied("Symbolic links are not editable".into()))
                }
                Ok(_) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.into()),
            }
        }
        Ok(p)
    }
    fn disk(&self, path: &str) -> Result<(Option<String>, Revision)> {
        let p = self.safe_path(path)?;
        match self.root.open(p) {
            Ok(mut file) => {
                if !file.metadata()?.is_file() {
                    return Err(AppError::Denied("Not a regular file".into()));
                }
                let mut bytes = Vec::new();
                Read::by_ref(&mut file)
                    .take((MAX_BYTES + 1) as u64)
                    .read_to_end(&mut bytes)?;
                if bytes.len() > MAX_BYTES {
                    return Err(AppError::Limit);
                }
                let rev = Revision {
                    exists: true,
                    hash: Some(hash(&bytes)),
                };
                Ok((
                    Some(String::from_utf8(bytes).map_err(|e| AppError::Invalid(e.to_string()))?),
                    rev,
                ))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok((None, Revision::missing())),
            Err(e) => Err(e.into()),
        }
    }
    fn event(&self, path: &str) -> StateEvent {
        let doc = &self.documents[path];
        StateEvent {
            project_id: self.id.clone(),
            path: path.into(),
            client_revision: doc.client_revision,
            state: doc.state.clone(),
            saved_hash: doc.base.hash.clone(),
            disk_revision: doc.observed.clone(),
            error: doc.error.clone(),
            durability: None,
        }
    }
    fn ensure_doc(&mut self, path: &str) -> Result<()> {
        if !self.documents.contains_key(path) {
            if self.documents.len() >= MAX_DOCS {
                return Err(AppError::Limit);
            }
            let (_, rev) = self.disk(path)?;
            self.documents.insert(
                path.into(),
                Document {
                    base: rev.clone(),
                    observed: rev,
                    pending: None,
                    client_revision: 0,
                    first_edit: Instant::now(),
                    last_edit: Instant::now(),
                    state: FileState::Saved,
                    error: None,
                },
            );
        }
        Ok(())
    }
    pub fn read(&mut self, path: &str) -> Result<ReadReply> {
        self.ensure_doc(path)?;
        let (content, revision) = self.disk(path)?;
        let doc = self.documents.get_mut(path).unwrap();
        doc.observed = revision.clone();
        if doc.pending.is_some() && doc.base != revision {
            doc.state = FileState::Conflict;
        } else if doc.pending.is_none() {
            doc.base = revision.clone();
        }
        Ok(ReadReply {
            content,
            revision,
            status: self.event(path),
        })
    }
    pub fn stage(
        &mut self,
        path: &str,
        content: String,
        client_revision: u64,
    ) -> Result<StateEvent> {
        self.ensure_doc(path)?;
        if content.len() > MAX_BYTES {
            return Err(AppError::Limit);
        }
        let doc = &self.documents[path];
        if client_revision <= doc.client_revision {
            return Err(AppError::StaleRevision);
        }
        let record = RecoveryRecord {
            schema: 1,
            path: path.into(),
            base_revision: doc.base.clone(),
            client_revision,
            content: content.clone(),
            updated_at_ms: now_ms(),
        };
        // A failed journal write rejects the stage: UI must remain dirty and retry with the same revision.
        atomic_write(
            &self.recovery,
            Path::new(&recovery_name(path)),
            &serde_json::to_vec(&record).map_err(|e| AppError::Invalid(e.to_string()))?,
        )?;
        let doc = self.documents.get_mut(path).unwrap();
        if doc.pending.is_none() {
            doc.first_edit = Instant::now();
        }
        doc.last_edit = Instant::now();
        doc.pending = Some(content);
        doc.client_revision = client_revision;
        doc.error = None;
        if doc.state != FileState::Conflict {
            doc.state = FileState::Dirty;
        }
        Ok(self.event(path))
    }
    pub fn save(&mut self, path: &str, expected: &Revision) -> Result<StateEvent> {
        let result = self.save_inner(path, expected);
        if let Err(ref error) = result {
            if let Some(doc) = self.documents.get_mut(path) {
                doc.state = if matches!(error, AppError::Conflict) {
                    FileState::Conflict
                } else {
                    FileState::Error
                };
                doc.error = Some(error.to_string());
            }
        }
        result
    }
    fn save_inner(&mut self, path: &str, expected: &Revision) -> Result<StateEvent> {
        self.ensure_doc(path)?;
        let pending = self.documents[path]
            .pending
            .clone()
            .ok_or(AppError::NoEdit)?;
        let (_, current) = self.disk(path)?;
        if &current != expected {
            let doc = self.documents.get_mut(path).unwrap();
            doc.observed = current;
            doc.state = FileState::Conflict;
            return Err(AppError::Conflict);
        }
        self.documents.get_mut(path).unwrap().state = FileState::Saving;
        let p = self.safe_path(path)?;
        // Temp file in the target directory; second compare happens AFTER writing/fsyncing temp.
        let parent = self.root.open_dir(
            p.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )?;
        let name = p.file_name().ok_or_else(|| AppError::Denied(path.into()))?;
        let temp = PathBuf::from(format!(".somnia-write-{}.tmp", Uuid::new_v4()));
        let result = (|| {
            write_temp(&parent, &temp, pending.as_bytes())?;
            if let Ok(m) = parent.metadata(name) {
                parent.set_permissions(&temp, m.permissions())?;
            }
            let (_, rechecked) = self.disk(path)?;
            if &rechecked != expected {
                return Err(AppError::Conflict);
            }
            parent.rename(&temp, &parent, name)?;
            sync_dir(&parent)
        })();
        let _ = parent.remove_file(&temp);
        match result {
            Err(e) => {
                let doc = self.documents.get_mut(path).unwrap();
                doc.state = if matches!(e, AppError::Conflict) {
                    FileState::Conflict
                } else {
                    FileState::Error
                };
                doc.error = Some(e.to_string());
                Err(e)
            }
            Ok(durability) => {
                let (_, written) = self.disk(path)?;
                if written.hash != Some(hash(pending.as_bytes())) {
                    let doc = self.documents.get_mut(path).unwrap();
                    doc.observed = written;
                    doc.state = FileState::Conflict;
                    return Err(AppError::Conflict);
                }
                let doc = self.documents.get_mut(path).unwrap();
                doc.base = written.clone();
                doc.observed = written;
                doc.pending = None;
                doc.state = FileState::Saved;
                doc.error = None;
                let mut event = self.event(path);
                event.durability = Some(durability.into());
                // Cleanup failure does not invalidate saved bytes; warn of a possibly stale recovery record.
                if let Err(e) = self.recovery.remove_file(recovery_name(path)) {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        event.error = Some(format!("Saved, but recovery cleanup failed: {e}"));
                    }
                }
                Ok(event)
            }
        }
    }
    /// Call on a background worker. Watcher is a hint; periodic full hashes catch missed events.
    pub fn tick(&mut self) -> Vec<StateEvent> {
        let mut events = Vec::new();
        if self.changed.swap(false, Ordering::AcqRel) || self.last_poll.elapsed() >= POLL {
            self.last_poll = Instant::now();
            for path in self.documents.keys().cloned().collect::<Vec<_>>() {
                match self.disk(&path) {
                    Ok((_, rev)) if rev != self.documents[&path].observed => {
                        let doc = self.documents.get_mut(&path).unwrap();
                        doc.observed = rev.clone();
                        if doc.pending.is_some() {
                            doc.state = FileState::Conflict;
                        } else {
                            doc.base = rev;
                            doc.state = FileState::Saved;
                        }
                        doc.error = None;
                        events.push(self.event(&path));
                    }
                    Err(e) => {
                        let doc = self.documents.get_mut(&path).unwrap();
                        if doc.error.as_deref() != Some(&e.to_string()) {
                            doc.state = FileState::Error;
                            doc.error = Some(e.to_string());
                            events.push(self.event(&path));
                        }
                    }
                    _ => (),
                }
            }
        }
        for path in self.documents.keys().cloned().collect::<Vec<_>>() {
            let doc = &self.documents[&path];
            if doc.pending.is_some()
                && doc.state == FileState::Dirty
                && (doc.last_edit.elapsed() >= QUIET || doc.first_edit.elapsed() >= MAX_WAIT)
            {
                let expected = doc.base.clone();
                let mut saving = self.event(&path);
                saving.state = FileState::Saving;
                events.push(saving);
                match self.save(&path, &expected) {
                    Ok(e) => events.push(e),
                    Err(_) => events.push(self.event(&path)),
                }
            }
        }
        events
    }
    pub fn list_files(&self) -> Result<Vec<String>> {
        let mut files = Vec::new();
        self.walk(Path::new("."), &mut files, 0)?;
        files.sort();
        Ok(files)
    }
    fn walk(&self, relative: &Path, files: &mut Vec<String>, depth: usize) -> Result<()> {
        if depth > 32 {
            return Err(AppError::Limit);
        }
        for entry in self.root.read_dir(relative)? {
            let entry = entry?;
            let kind = entry.file_type()?;
            let name = entry.file_name();
            if reserved(&name.to_string_lossy()) || kind.is_symlink() {
                continue;
            }
            let p = relative.join(name);
            if kind.is_dir() {
                self.walk(&p, files, depth + 1)?;
            } else if kind.is_file() {
                if files.len() >= MAX_FILES {
                    return Err(AppError::Limit);
                }
                if let Some(p) = p.to_str() {
                    let normalized = p.replace('\\', "/");
                    files.push(normalized.strip_prefix("./").unwrap_or(&normalized).to_owned());
                }
            }
        }
        Ok(())
    }
    pub fn recovery_list(&self) -> Result<Vec<RecoveryRecord>> {
        let mut records = Vec::new();
        for entry in self.recovery.entries()? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().ends_with(".json") {
                if records.len() >= MAX_DOCS {
                    return Err(AppError::Limit);
                }
                records.push(self.recovery_read_name(&entry.file_name())?);
            }
        }
        records.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(records)
    }
    fn recovery_read_name(&self, name: &std::ffi::OsStr) -> Result<RecoveryRecord> {
        let mut file = self.recovery.open(name)?;
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take((MAX_BYTES * 6 + 4097) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_BYTES * 6 + 4096 {
            return Err(AppError::Limit);
        }
        let record: RecoveryRecord =
            serde_json::from_slice(&bytes).map_err(|e| AppError::Invalid(e.to_string()))?;
        validate_path(&record.path)?;
        if record.schema != 1
            || record.content.len() > MAX_BYTES
            || name != std::ffi::OsStr::new(&recovery_name(&record.path))
        {
            return Err(AppError::Invalid(
                "Recovery identity/schema mismatch".into(),
            ));
        }
        Ok(record)
    }
    pub fn recovery_read(&self, path: &str) -> Result<RecoveryRecord> {
        self.safe_path(path)?;
        self.recovery_read_name(std::ffi::OsStr::new(&recovery_name(path)))
    }
    pub fn recovery_restore(&mut self, path: &str, revision: u64) -> Result<StateEvent> {
        let record = self.recovery_read(path)?;
        self.ensure_doc(path)?;
        self.documents.get_mut(path).unwrap().base = record.base_revision;
        let event = self.stage(path, record.content, revision)?;
        let (_, disk) = self.disk(path)?;
        let doc = self.documents.get_mut(path).unwrap();
        doc.observed = disk.clone();
        if disk != doc.base {
            doc.state = FileState::Conflict;
            return Ok(self.event(path));
        }
        Ok(event)
    }
    pub fn recovery_discard(&self, path: &str) -> Result<()> {
        self.safe_path(path)?;
        if self
            .documents
            .get(path)
            .is_some_and(|doc| doc.pending.is_some())
        {
            return Err(AppError::Dirty);
        }
        match self.recovery.remove_file(recovery_name(path)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
    pub fn has_dirty(&self) -> bool {
        self.documents.values().any(|d| d.pending.is_some())
    }
}
fn reserved(name: &str) -> bool {
    matches!(name, ".git" | ".somnia" | "node_modules" | ".svn" | ".hg")
        || name.starts_with(".somnia-write-")
}
pub fn validate_path(path: &str) -> Result<PathBuf> {
    if path
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || path.contains(['\\', ':', '\0'])
    {
        return Err(AppError::Denied(path.into()));
    }
    let p = Path::new(path);
    for component in p.components() {
        match component {
            Component::Normal(name) if !reserved(&name.to_string_lossy()) => {
                let name = name.to_string_lossy();
                let stem = name.split('.').next().unwrap_or("").to_uppercase();
                if name.ends_with([' ', '.'])
                    || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                    || (stem.len() == 4
                        && (stem.starts_with("COM") || stem.starts_with("LPT"))
                        && stem.ends_with(['1', '2', '3', '4', '5', '6', '7', '8', '9']))
                {
                    return Err(AppError::Denied(path.into()));
                }
            }
            _ => return Err(AppError::Denied(path.into())),
        }
    }
    Ok(p.to_path_buf())
}
fn recovery_name(path: &str) -> String {
    format!("{}.json", hash(path.as_bytes()))
}
fn write_temp(dir: &Dir, temp: &Path, content: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = dir.open_with(temp, &options)?;
    #[cfg(unix)]
    {
        use cap_std::fs::PermissionsExt;
        file.set_permissions(cap_std::fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(content)?;
    file.sync_all()?;
    Ok(())
}
fn sync_dir(dir: &Dir) -> Result<&'static str> {
    #[cfg(unix)]
    {
        dir.open(".")?.sync_all()?;
        Ok("file_and_directory_synced")
    }
    // Windows has atomic rename + flushed file data; directory flush is not portable here.
    #[cfg(not(unix))]
    {
        let _ = dir;
        Ok("file_synced_directory_flush_unavailable")
    }
}
fn atomic_write(dir: &Dir, path: &Path, content: &[u8]) -> Result<()> {
    let temp = PathBuf::from(format!(".somnia-write-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        write_temp(dir, &temp, content)?;
        dir.rename(&temp, dir, path)?;
        sync_dir(dir)?;
        Ok(())
    })();
    let _ = dir.remove_file(temp);
    result
}
