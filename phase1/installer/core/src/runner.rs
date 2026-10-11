//! Install orchestration. Progress is derived from real work only: completed steps and,
//! inside the unpack step, bytes actually written vs. the manifest size. No timers.
use crate::errors::InstallError;
use crate::options::{self, Options};
use crate::platform::Platform;
use serde::Serialize;

pub const STEPS: [&str; 5] = ["unpack", "shortcuts", "assoc", "updater", "finish"];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Progress {
    pub step: usize,          // 0-based index into STEPS
    pub steps_total: usize,
    /// None = indeterminate (nothing measurable yet); never a guessed value.
    pub fraction: Option<f32>,
    pub cancellable: bool,
}

/// Side effects, implemented by the Windows shell and by test doubles.
pub trait Executor {
    /// Run the embedded NSIS setup silently (`/S /D=<dir>`); `on_bytes(written)` reports real disk growth.
    fn unpack(&mut self, dir: &std::path::Path, on_bytes: &mut dyn FnMut(u64)) -> Result<(), InstallError>;
    fn shortcuts(&mut self, o: &Options) -> Result<(), InstallError>;
    fn associations(&mut self, exts: &[&str]) -> Result<(), InstallError>;
    /// Persist autostart + auto-update-check into the app's own updater config.
    fn app_config(&mut self, o: &Options) -> Result<(), InstallError>;
    fn finish(&mut self, o: &Options) -> Result<(), InstallError>;
    fn rollback(&mut self, dir: &std::path::Path);
    fn cancel_requested(&self) -> bool { false }
}

#[derive(Debug, PartialEq)]
pub enum Outcome { Success, Failed(InstallError), Cancelled }

pub fn preflight(p: &dyn Platform, o: &Options, required: u64) -> Result<std::path::PathBuf, InstallError> {
    if p.app_running() { return Err(InstallError::AppRunning); }
    options::validate(p, o, required).map_err(|e| e.into_install_error())
}

pub fn run(p: &dyn Platform, ex: &mut dyn Executor, o: &Options, required: u64,
           report: &mut dyn FnMut(Progress)) -> Outcome {
    let dir = match preflight(p, o, required) { Ok(d) => d, Err(e) => return Outcome::Failed(e) };
    let total = STEPS.len();
    let mk = |step: usize, fraction: Option<f32>| Progress { step, steps_total: total, fraction, cancellable: step < total - 1 };
    report(mk(0, None));
    {
        // Real measurement only: bytes written by the unpack step vs. the manifest size.
        let mut on_bytes = |w: u64| {
            if required > 0 { report(mk(0, Some((w as f32 / required as f32).min(1.0) / total as f32))); }
        };
        if let Err(e) = ex.unpack(&dir, &mut on_bytes) { ex.rollback(&dir); return Outcome::Failed(e); }
    }
    for idx in 1..total {
        if ex.cancel_requested() && idx < total - 1 { ex.rollback(&dir); return Outcome::Cancelled; }
        report(mk(idx, Some(idx as f32 / total as f32)));
        let r = match idx {
            1 => if o.start_menu || o.desktop_shortcut { ex.shortcuts(o) } else { Ok(()) },
            2 => if o.file_associations { ex.associations(options::FILE_ASSOC_ALLOWLIST) } else { Ok(()) },
            3 => ex.app_config(o),
            _ => ex.finish(o),
        };
        if let Err(e) = r { ex.rollback(&dir); return Outcome::Failed(e); }
    }
    Outcome::Success
}
