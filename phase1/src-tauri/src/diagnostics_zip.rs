//! Window-bound immutable snapshots and native-destination ZIP output. No uploads.
use crate::{diagnostics_types::*, incidents::IncidentStore};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipWriter};
pub const SNAPSHOT_TTL: Duration = Duration::from_secs(600);
struct Stored {
    created: Instant,
    preview: DiagnosticSnapshot,
    bytes: Vec<Arc<[u8]>>,
}
#[derive(Default)]
pub struct SnapshotStore {
    windows: HashMap<String, Stored>,
}
pub trait SaveDialog {
    fn choose_zip(&self) -> Result<Option<PathBuf>>;
}
pub fn utc(epoch: u64) -> String {
    crate::applog::format_ts(epoch as i64, 0)
}
fn json(v: &Value) -> Result<String> {
    serde_json::to_string(v).map_err(|_| DiagnosticError::InvalidInput)
}
fn jsonl(
    entries: impl IntoIterator<Item = Value>,
    budget: usize,
    omissions: &mut Vec<String>,
) -> Result<String> {
    let mut out = String::new();
    for v in entries {
        let line = json(&v)?;
        if out.len() + line.len() + 1 > budget {
            if !omissions.iter().any(|s| s == "size-limit") {
                omissions.push("size-limit".into());
            }
            break;
        }
        out.push_str(&line);
        out.push('\n');
    }
    Ok(out)
}
impl SnapshotStore {
    pub fn build(
        &mut self,
        window: &str,
        selection: DiagnosticsSelection,
        renderer: &[Value],
        native: &[Value],
        incidents: &IncidentStore,
        native_complete: bool,
    ) -> Result<DiagnosticSnapshot> {
        if !safe_identifier(window) || renderer.len() > 500 {
            return Err(DiagnosticError::InvalidInput);
        }
        let summaries = incidents.list();
        if selection.incident_ids.len() > 10
            || selection
                .incident_ids
                .iter()
                .any(|id| !summaries.iter().any(|m| &m.incident_id == id))
        {
            return Err(DiagnosticError::InvalidInput);
        }
        let mut omissions = vec![];
        if renderer.iter().any(|v| safe_event(v).is_none()) {
            omissions.push("renderer-entry-invalid".into());
        }
        if native.iter().any(|v| safe_event(v).is_none()) {
            omissions.push("native-entry-invalid".into());
        }
        if !native_complete {
            omissions.push("native-tail-unavailable".into());
        }
        if incidents.corrupt {
            omissions.push("incident-store-corrupt".into());
        }
        let incident_entries = if selection.include_incident_details {
            incidents.details(&selection.incident_ids)?
        } else {
            vec![]
        };
        // Cap each JSONL file independently to leave room for manifests, counters and health.
        let incident_text = jsonl(
            incident_entries,
            MAX_EXPORT_BYTES / 2 - 4096,
            &mut omissions,
        )?;
        let log_text = if selection.include_logs {
            jsonl(
                merge_events(native, renderer),
                MAX_EXPORT_BYTES / 2 - 4096,
                &mut omissions,
            )?
        } else {
            String::new()
        };
        let health = if native_complete && !incidents.corrupt && omissions.is_empty() {
            "complete"
        } else {
            "partial"
        };
        let epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let id = Uuid::new_v4().to_string();
        // Never serialize external BuildIdentity/recovery fields here. Persisted metadata is projected.
        let selected:Vec<_>=summaries.iter().filter(|m|selection.incident_ids.contains(&m.incident_id)).map(|m|serde_json::json!({"incidentId":m.incident_id,"kind":m.kind,"occurredAt":m.occurred_at,"errorId":m.error_id,"reviewedAt":m.reviewed_at,"recovery":[{"kind":"unknown"}],"artifacts":m.artifacts})).collect();
        let manifest = json(
            &serde_json::json!({"v":2,"snapshotId":id,"createdAt":utc(epoch),"selection":selection,"incidents":selected,"files":FILE_NAMES,"omissions":omissions}),
        )?;
        let counters = "{}".to_owned();
        let health_text = json(&if selection.include_capability_health {
            serde_json::json!({"collection":health,"prunedIncidents":incidents.pruned,"nativeAvailable":native_complete})
        } else {
            serde_json::json!({"collection":health})
        })?;
        let texts = [manifest, incident_text, log_text, counters, health_text];
        let files: Vec<_> = FILE_NAMES
            .iter()
            .zip(texts.iter())
            .map(|(name, text)| DiagnosticFilePreview {
                name: (*name).into(),
                utf8_bytes: text.len(),
                text: text.clone(),
            })
            .collect();
        let total = files.iter().map(|f| f.utf8_bytes).sum();
        if total > MAX_EXPORT_BYTES {
            return Err(DiagnosticError::InvalidInput);
        }
        let report_text = files
            .iter()
            .map(|f| format!("--- {} ---\n{}\n", f.name, f.text))
            .collect::<Vec<_>>()
            .join("\n");
        let preview = DiagnosticSnapshot {
            snapshot_id: id,
            created_at: utc(epoch),
            selection,
            files,
            report_text,
            total_uncompressed_bytes: total,
            expires_at: utc(epoch + SNAPSHOT_TTL.as_secs()),
            health: health.into(),
            omissions,
        };
        self.windows
            .retain(|_, s| s.created.elapsed() < SNAPSHOT_TTL);
        self.windows.insert(
            window.into(),
            Stored {
                created: Instant::now(),
                preview: preview.clone(),
                bytes: texts.iter().map(|s| Arc::from(s.as_bytes())).collect(),
            },
        );
        Ok(preview)
    }
    fn get(&self, window: &str, id: &str) -> Result<&Stored> {
        self.windows
            .get(window)
            .filter(|s| s.preview.snapshot_id == id && s.created.elapsed() < SNAPSHOT_TTL)
            .ok_or(DiagnosticError::SnapshotUnavailable)
    }
    pub fn validate(&self, window: &str, id: &str) -> Result<()> {
        self.get(window, id).map(|_| ())
    }
    pub fn discard(&mut self, window: &str, id: &str) -> Result<()> {
        self.get(window, id)?;
        self.windows.remove(window);
        Ok(())
    }
    pub fn save(&self, window: &str, id: &str, dialog: &dyn SaveDialog) -> Result<SaveOutcome> {
        self.get(window, id)?;
        let Some(path) = dialog.choose_zip()? else {
            return Ok(SaveOutcome::Cancelled);
        };
        // Revalidate TTL after the user spends time in the dialog. Bytes remain unchanged.
        self.write_to_native_destination(window, id, &path)
    }
    /// Private adapter only: `path` comes from the Rust native dialog, never from IPC.
    pub(super) fn write_to_native_destination(
        &self,
        window: &str,
        id: &str,
        path: &Path,
    ) -> Result<SaveOutcome> {
        let stored = self.get(window, id)?;
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or(DiagnosticError::ZipWriteFailed)?;
        let tmp = parent.join(format!(".somnia-diagnostics-{}.tmp", Uuid::new_v4()));
        let result = (|| {
            let file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp)
                .map_err(|_| DiagnosticError::ZipWriteFailed)?;
            let mut zip = ZipWriter::new(file);
            for (name, bytes) in FILE_NAMES.iter().zip(&stored.bytes) {
                zip.start_file(
                    *name,
                    SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
                )
                .map_err(|_| DiagnosticError::ZipWriteFailed)?;
                zip.write_all(bytes)
                    .map_err(|_| DiagnosticError::ZipWriteFailed)?;
            }
            let file = zip.finish().map_err(|_| DiagnosticError::ZipWriteFailed)?;
            file.sync_all()
                .map_err(|_| DiagnosticError::ZipWriteFailed)?;
            let bytes = file
                .metadata()
                .map_err(|_| DiagnosticError::ZipWriteFailed)?
                .len();
            drop(file);
            // Native-approved destination; atomic replacement never removes it first.
            atomic_replace(&tmp, path).map_err(|_| DiagnosticError::ZipWriteFailed)?;
            Ok(SaveOutcome::Saved { bytes })
        })();
        if result.is_err() {
            let _ = fs::remove_file(tmp);
        }
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    fn entry(source: &str) -> Value {
        serde_json::json!({"v":2,"session":"s","source":source,"seq":1,"id":"SOM-DOC-002","ts":"2026-10-10T16:00:00.000Z","message":"poison-file.html","fatal":false})
    }
    struct Cancel;
    impl SaveDialog for Cancel {
        fn choose_zip(&self) -> Result<Option<PathBuf>> {
            Ok(None)
        }
    }
    #[test]
    fn snapshot_window_binding_replace_ttl_and_cancel() {
        let d = tempfile::tempdir().unwrap();
        let incidents = IncidentStore::open(d.path()).unwrap();
        let mut store = SnapshotStore::default();
        let a = store
            .build(
                "main",
                DiagnosticsSelection::default(),
                &[],
                &[],
                &incidents,
                true,
            )
            .unwrap();
        assert_eq!(
            store.save("main", &a.snapshot_id, &Cancel).unwrap(),
            SaveOutcome::Cancelled
        );
        assert!(store.save("other", &a.snapshot_id, &Cancel).is_err());
        let b = store
            .build(
                "main",
                DiagnosticsSelection::default(),
                &[],
                &[],
                &incidents,
                true,
            )
            .unwrap();
        assert!(store.discard("main", &a.snapshot_id).is_err());
        store.windows.get_mut("main").unwrap().created = Instant::now() - SNAPSHOT_TTL;
        assert!(store.save("main", &b.snapshot_id, &Cancel).is_err());
    }
    #[test]
    fn zip_exact_preview_five_fixed_names_secret_free_and_cleanup() {
        let d = tempfile::tempdir().unwrap();
        let incidents = IncidentStore::open(d.path().join("incidents")).unwrap();
        let mut store = SnapshotStore::default();
        let selection = DiagnosticsSelection {
            include_logs: true,
            ..Default::default()
        };
        let snap = store
            .build(
                "main",
                selection,
                &[entry("ts")],
                &[entry("rust")],
                &incidents,
                true,
            )
            .unwrap();
        assert!(!snap.report_text.contains("poison-file"));
        assert!(!snap.report_text.contains("Rollback successful"));
        let path = d.path().join("report.zip");
        store
            .write_to_native_destination("main", &snap.snapshot_id, &path)
            .unwrap();
        let mut zip = zip::ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
        assert_eq!(zip.len(), 5);
        for f in &snap.files {
            let mut text = String::new();
            zip.by_name(&f.name)
                .unwrap()
                .read_to_string(&mut text)
                .unwrap();
            assert_eq!(text, f.text);
        }
        assert!(store
            .write_to_native_destination(
                "main",
                &snap.snapshot_id,
                &d.path().join("missing/report.zip")
            )
            .is_err());
        assert!(fs::read_dir(d.path())
            .unwrap()
            .flatten()
            .all(|e| !e.file_name().to_string_lossy().ends_with(".tmp")));
    }
    #[test]
    fn bounded_jsonl_never_splits_record() {
        let mut omissions = vec![];
        let text = jsonl(
            [serde_json::json!({"v":1}), serde_json::json!({"v":2})],
            9,
            &mut omissions,
        )
        .unwrap();
        assert_eq!(text.lines().count(), 1);
        assert!(text
            .lines()
            .all(|l| serde_json::from_str::<Value>(l).is_ok()));
        assert_eq!(omissions, vec!["size-limit"]);
    }
    #[test]
    fn merge_original_identity_and_opt_in_fatal() {
        let e = entry("ts");
        let out = merge_events(&[e.clone()], &[e.clone(), entry("rust")]);
        assert_eq!(out.len(), 2);
        assert!(out[0].get("fatal").is_none());
        let mut with_window = e;
        with_window["window"] = "secondary".into();
        assert_eq!(merge_events(&out, &[with_window]).len(), 3);
    }
    #[test]
    fn prefixed_secrets_in_technical_tokens_are_rejected() {
        let mut v = entry("ts");
        v["context"] = serde_json::json!({"cmd":"ghp_abcdefghijklmno12345"});
        v["session"] = "github_pat_abcdefghijklmno12345".into();
        assert!(safe_event(&v).is_none());
        v["session"] = "session-1".into();
        let projected = safe_event(&v).unwrap();
        assert!(!projected.to_string().contains("abcdefghijklmno"));
    }
    #[test]
    fn renderer_sentinels_and_locks_are_never_exported() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir(d.path().join("locks")).unwrap();
        std::fs::write(d.path().join("locks/index.json"), "ABSOLUTE-PATH-SENTINEL").unwrap();
        let incidents = IncidentStore::open(d.path().join("incidents")).unwrap();
        let mut store = SnapshotStore::default();
        let mut v = entry("ts");
        v["context"] = serde_json::json!({"path":"/home/poison/secret.txt","cmd":"secret prompt with spaces","token":"SECRETSENTINEL"});
        v["recovery"] = serde_json::json!({"kind":"incident-scoped","snapshotCorrelated":true});
        let snap = store
            .build(
                "main",
                DiagnosticsSelection {
                    include_logs: true,
                    ..Default::default()
                },
                &[v],
                &[serde_json::json!({"message":"ABSOLUTE-PATH-SENTINEL"})],
                &incidents,
                true,
            )
            .unwrap();
        assert!(!snap.report_text.contains("SECRETSENTINEL"));
        assert!(!snap.report_text.contains("secret prompt"));
        assert!(!snap.report_text.contains("ABSOLUTE-PATH-SENTINEL"));
        assert!(!snap.report_text.contains("snapshotCorrelated"));
        assert!(snap.omissions.contains(&"native-entry-invalid".into()));
    }
    #[test]
    fn casing_tags_and_unknown_fields_contract() {
        let selection:DiagnosticsSelection=serde_json::from_value(serde_json::json!({"incidentIds":[],"includeLogs":false,"includeIncidentDetails":false,"includeCapabilityHealth":false})).unwrap();
        assert!(!selection.include_logs);
        assert!(serde_json::from_value::<DiagnosticsSelection>(serde_json::json!({"incidentIds":[],"includeLogs":false,"includeIncidentDetails":false,"includeCapabilityHealth":false,"path":"x"})).is_err());
        assert_eq!(
            serde_json::to_value(SaveOutcome::Cancelled).unwrap(),
            serde_json::json!({"kind":"cancelled"})
        );
        assert_eq!(
            serde_json::to_value(RecoveryEvidence::DraftPresent {
                count: 2,
                newest_age_sec: 5,
                verified: true
            })
            .unwrap(),
            serde_json::json!({"kind":"draft-present","count":2,"newestAgeSec":5,"verified":true})
        );
    }
}
