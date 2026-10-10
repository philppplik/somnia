//! Lock-free panic artifact writer. Does not acquire the logger or inspect drafts.
use std::{fs, io::Write, path::PathBuf};
/// Install once during startup, after the incident store exists. No panic payload/location is persisted.
pub fn install(dir: PathBuf, session: String) {
    if !crate::diagnostics_types::safe_identifier(&session) {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let path = dir.join(format!(
            "panic-{}-{}.json",
            std::process::id(),
            stamp.as_nanos()
        ));
        let entry = serde_json::json!({"v":2,"session":session,"source":"rust","seq":stamp.as_millis() as u64,"id":"SOM-APP-009","ts":crate::applog::format_ts(stamp.as_secs() as i64,stamp.subsec_millis()),"fatal":true,"expected":false,"level":"error"});
        if let Ok(mut f) = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
        {
            let _ = f.write_all(entry.to_string().as_bytes());
            let _ = f.sync_all();
        }
        // Do not chain an application hook that takes the logger lock. The default hook may print to stderr.
        let _ = (&previous, info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn panic_artifact_survives_aborting_child() {
        if let Ok(dir) = std::env::var("SOMNIA_PANIC_CHILD") {
            install(PathBuf::from(dir), "child-session".into());
            // Hook must not use the logger lock or persist payload / stack / paths.
            let _ = std::panic::catch_unwind(|| {
                std::panic::panic_any("poison-filename.html sk-secret-never-persist")
            });
            std::process::abort();
        }
        let d = tempfile::tempdir().unwrap();
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "panic_report::tests::panic_artifact_survives_aborting_child",
                "--nocapture",
            ])
            .env("SOMNIA_PANIC_CHILD", d.path())
            .status()
            .unwrap();
        assert!(!status.success());
        let store = crate::incidents::IncidentStore::open(d.path()).unwrap();
        assert_eq!(store.list().len(), 1);
        assert_eq!(
            store.list()[0].kind,
            crate::diagnostics_types::IncidentKind::NativePanic
        );
        for file in std::fs::read_dir(d.path()).unwrap().flatten() {
            let text = std::fs::read_to_string(file.path()).unwrap();
            assert!(!text.contains("poison-filename") && !text.contains("sk-secret"));
        }
    }
}
