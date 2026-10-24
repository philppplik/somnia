//! Workspace ownership + GUI-state guard (R4-C2, R5-C6).
//! ASSUMED BRIDGE CONTRACT (desktop must write it): `<repo>/.somnia/gui-state.json`
//! {"schema":1,"generation":N,"unsavedBuffers":[{"path":"rel/path"}],"aiHolds":[{"id":"..","path":"rel/path"}]}
//! Absent file = no GUI owner. Any unsaved buffer under the task's allowed roots, or any AI hold, is a BLOCKER.
use crate::error::{CliError, ErrorKind, Result};
use fs2::FileExt;
use serde::Deserialize;
use std::fs::{self, File};
use std::path::Path;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GuiState {
    #[serde(default)]
    unsaved_buffers: Vec<Buf>,
    #[serde(default)]
    ai_holds: Vec<Hold>,
}
#[derive(Deserialize)]
struct Buf {
    path: String,
}
#[derive(Deserialize)]
struct Hold {
    id: String,
    #[serde(default)]
    path: Option<String>,
}

fn norm(p: &str) -> String {
    p.trim_start_matches("./").trim_end_matches('/').replace('\\', "/")
}

fn under_roots(path: &str, roots: &[String]) -> bool {
    let p = norm(path);
    roots.iter().any(|r| {
        let r = norm(r);
        r.is_empty() || r == "." || p == r || p.starts_with(&format!("{r}/"))
    })
}

pub fn check_gui_state(root: &Path, allowed_roots: &[String]) -> Result<()> {
    let p = root.join(".somnia").join("gui-state.json");
    let Ok(bytes) = fs::read(&p) else { return Ok(()) };
    // An unreadable state file must fail closed: invisible GUI state is exactly what the guard exists to prevent.
    let st: GuiState = serde_json::from_slice(&bytes)
        .map_err(|_| CliError::new(ErrorKind::ReviewRequired, "desktop state file is unreadable; refusing to run against invisible GUI state"))?;
    let buffers: Vec<String> = st.unsaved_buffers.iter().filter(|b| under_roots(&b.path, allowed_roots)).map(|b| norm(&b.path)).collect();
    let holds: Vec<String> = st.ai_holds.iter().filter(|h| h.path.as_deref().map(|p| under_roots(p, allowed_roots)).unwrap_or(true)).map(|h| h.id.clone()).collect();
    if buffers.is_empty() && holds.is_empty() {
        return Ok(());
    }
    Err(CliError::new(ErrorKind::ReviewRequired, "desktop has unsaved buffers or AI holds that need review before an agent run")
        .with_details(serde_json::json!({"unsaved_buffers": buffers, "ai_holds": holds})))
}

/// One owner per workspace: advisory exclusive lock held for the run.
pub struct WorkspaceLock {
    _f: File,
}

impl WorkspaceLock {
    pub fn acquire(root: &Path) -> Result<Self> {
        let dir = root.join(".somnia");
        fs::create_dir_all(&dir)?;
        let f = File::options().create(true).truncate(false).write(true).open(dir.join("workspace.lock"))?;
        f.try_lock_exclusive().map_err(|_| CliError::new(ErrorKind::WorkspaceBusy, "another Somnia run owns this workspace"))?;
        Ok(Self { _f: f })
    }
    pub fn is_free(root: &Path) -> bool {
        match Self::acquire(root) {
            Ok(_) => true,
            Err(_) => false,
        }
    }
}
