# Native diagnostics and report export (S3)

## Scope and data flow

`errorReport.ts` exports schema-v2 technical events and retains the renderer ring when native collection fails. `log.ts` re-exports that function for compatibility. Legacy free text, exception payloads, filenames, paths, credentials, prompts and document content are not report fields. DOC-002 is a failed rollback; neither exporter generates recovery-success copy.

Native modules:

- `diagnostics_types.rs`: shared DTOs, export projection and atomic replacement.
- `incidents.rs`: incident index, explicit review/delete and retention.
- `panic_report.rs`: lock-free panic artifact writer and next-start ingestion.
- `diagnostics_zip.rs`: immutable, trusted-window-bound snapshots and ZIP writer.
- `diagnostics_commands.rs`: native-window gate, bounded native log collection, native save dialog and adapter functions. The seven Tauri command wrappers use cmd()/cmd_async() and AppCommandError with fixed, path-free messages.

Only these ZIP members can be written: `manifest.json`, `incidents.jsonl`, `logs.jsonl`, `swallow-counters.json`, `health.json`. The package never walks a project, recovery folder or environment. In particular, `recovery_base/locks/` is completely excluded, even though the current persistence design uses only hashed lock filenames. No recursive filesystem export, include-content option or upload exists.

## Projection

Events must have `v:2`, a technical session token, source `ts` or `rust`, nonnegative JavaScript-safe sequence, SOM error ID and UTC timestamp. The merge key is `(session, source, seq, window)`. Timestamp orders records, not their identity. Ring/native echoes retain their original keys. Fatal is exported only if explicitly true. Context is limited to ordinal, size, count, code and cmd. Build/identity strings use the same 64-byte technical-token alphabet as the frontend SafeLogEvent projection. Message, cause, arbitrary context and recovery assertions are discarded.

Legacy records without schema v2 are unavailable for export. They are never copied as free text. Invalid renderer entries produce `renderer-entry-invalid`. Extended logs/details/capability data require their respective selection flags. Counters currently serialize as an empty object: S2 supplies the counter producer; no invented counts are shown.

## Incident lifecycle

Index writes use a same-directory temp file, fsync and atomic replacement (MoveFileExW on Windows, rename on POSIX). Path/ID inputs are not accepted: callers select existing indexed IDs. Artifacts are stored as a safe technical event, not raw exception text. Symlink or corrupt/oversized artifacts remain listed but unavailable. Invalid index metadata is rejected and sets corrupt health.

Retention runs on store startup and every normal artifact write: maximum ten reports, fourteen UTC days, ten MiB total, oldest first. Panic writes cannot lock the index or prune it inside a panic hook; next-start scan imports and prunes them. Exported ZIPs do not count toward retention. Index corruption sets partial health, never authorizes draft restoration.

Opening/listing/exporting does not mark reviewed. Only the mark command changes reviewedAt. Unknown IDs fail before any delete/review. Unclean exit requires APP-010 and is never relabeled native panic. Native panic requires APP-009. Frontend fatal requires an explicit fatal:true event.

All recovery defaults to `[{kind:'unknown'}]`. The shared type also supports draft-present and incident-scoped proofs, but no producer currently exists and neither renderer assertions nor index contents establish recovery evidence. A future trusted persistence producer must verify incident correlation before returning snapshotCorrelated:true. There is no restore/retry capability in this package.

## Snapshot and save lifecycle

One immutable snapshot per trusted window, ten-minute TTL, maximum ten MiB uncompressed, five fixed entries. Refresh replaces the previous snapshot. Cross-window and expired IDs fail with APP-013. JSONL size bounds cut only between complete records; the manifest lists omissions. Preview text and written bytes are the same prepared bytes. Native collection waits at most 500ms before partial fallback.

Save accepts only snapshotId, never a renderer path, grant, content or file list. The adapter validates before native dialog and revalidates after it, without keeping locks during the dialog. Cancel returns `{kind:'cancelled'}` and does not record a failure. Success returns `{kind:'saved',bytes}` only after close/fsync/atomic rename. A failure removes the temp file and returns FS-014. Existing destination replacement is delegated to the OS-native dialog confirmation.

## Integration checklist

1. Register DiagnosticsState under the dedicated app-data incidents directory on startup; this calls startup scan/prune.
2. Install the lock-free panic writer after logger setup. It must replace the old logger-lock panic hook, not chain through it.
3. Manage DiagnosticsState and register seven command wrappers using cmd(): build_diagnostic_zip, write_diagnostic_zip, discard_diagnostic_snapshot, list_crash_reports, mark_crash_reports_reviewed, delete_crash_reports and record_frontend_fatal.
4. Add only those trusted-main-window commands to the default capability. No renderer FS or save-dialog grant is needed.
5. Feed native schema-v2 logs and real swallowed counters through the S2 producer. Old free-text logs are intentionally omitted.
6. Wire UI only through commandContracts/invokeCmd. SaveOutcome uses the canonical `kind` tag.
7. Do not claim that a report proves safety or successful rollback. Recovery remains unknown until a trusted persistence producer is available.

## Verification and limits

Rust tests run in the real crate with `cargo test --no-default-features --lib`: retention on startup/write, explicit reviewed state, unknown-ID rejection, corrupt artifacts, unknown recovery, byte quota, unclean-vs-panic, window isolation, refresh invalidation, expiry, cancellation, exact ZIP/preview bytes, fixed member names, temp cleanup, JSONL boundaries, merge key, fatal opt-in and serde casing/tag.

A child process writes a panic artifact and aborts; the next-start scanner imports it without retaining the panic payload. This exercises a real abort, but a separate release-profile panic=abort executable remains a release/Windows verification task.

Node tests exercise the real report collector and logger, including native failure fallback and poison sentinels. No skipped or parked tests. Desktop compilation in this environment is blocked by missing glib-2.0 development libraries. Full frontend tsc is blocked by the existing missing Slides WASM generated module; scoped S3 typecheck is clean. No Windows save-dialog UI or rendered diagnostics UI was verified here. Those checks belong to the integrator's release gate.


### Current transport compatibility

S2's native event logger supplies typed IDs but currently lacks schema-v2 session/sequence/source fields. Its records are deliberately omitted with native-entry-invalid and partial health until S2 emits the canonical v2 identity. This is a data-availability limitation, not a reason to export raw legacy text. commandContracts.ts now has full diagnostics DTOs and FrontendFatalEntry is an explicitly fatal SafeLogEvent. Crash recording rejects renderer build/recovery claims.

Verified on S1+S2+S3: 117 Rust tests and 157 TypeScript tests passed. The scoped tsc command uses tsconfig.s3-check.json and real dependencies; no fake Slides module is added to hide the full-build blocker.
