# Package C: history and safety

Base: somnia-agent, 77cd526f4dc544fdc7353f19c2d3fc9f4d256a29.
Branch: agent/git-git-history-safety. No dependencies, remote mutations or runtime network calls added. Git contract/types unchanged; git.rs untouched.

## Integration

Mount `HistoryTab` in the Versions host's History tab. Import `src/components/versions/history.css` once at the host (not imported by component, so Node SSR tests remain supported).

Create a stable `HistoryController(gitBackend, recoveryBackend, hasUnsavedBuffers)` per open project. Dispose by unmounting the host on project switch; do not reuse one controller across projects. `GitBackend` is the existing contract, with fake implementations in tests. `createRecoveryBackend(port, projectId, nextRevision)` uses the current granted file port and the SAME monotonically increasing revision counter as `fileAdapter`; never create another counter.

`onRestored(outcome)` is required:
- Git: reload the affected project from disk without discarding editor buffers. Save/flush outstanding native edits BEFORE opening review, and prevent edits/project-switch while restore is running. `hasUnsavedBuffers` must include dirty buffers, in-flight saves and pending autosave work. Git only operates on disk and verifies the reviewed stateToken in package A.
- Recovery: mirror result.content/event into the editor's model and saved/staged/revision tracking, keeping the restored file dirty. DO NOT re-stage via the normal autosave subscriber, which would clear the safety hold. Keep native autosave held until explicit Save. Use an internal/suppressed model update, then explicit Save using event.diskRevision. The callback must be connected before exposing restore to users.
- On callback failure the dialog closes and reports restore succeeded but reload failed; it never offers an automatic retry.

This package deliberately does not modify App, fileAdapter or the Changes host owned elsewhere. It is not an enabled end-to-end feature until the integrator wires the callbacks above. Old command-palette recovery_restore/discard behavior remains legacy and outside this component. Do not route History actions through those commands.

## Recovery extension (not Git contract changes)

Two new gated commands, wired in desktop.rs, build.rs, capabilities/editor.json:
- recovery_history_list(projectId): [{id, kind: recovery|safety, record: RecoveryRecord}]. Uses recovery_list for existing journal snapshots and adds immutable `.safety` records in the existing private per-project recovery directory.
- recovery_restore_safe(projectId,id,path,clientRevision,expectedRevision): {event,content,safetyIds}.

Journal identities hash full serialized contents: stale selected snapshots fail, rather than silently restoring a changed journal. Disk revision and client revision are checked before archiving. Selected target, current disk and current journal are archived BEFORE stage replaces the journal. This includes a reopened journal even when there is no pending in-memory Rust document. Restored content is held from native autosave until explicit Save. All existing safe_path/single-file/symlink guards apply. No delete/eviction action is exposed. Limit is 2048 entries; restore fails rather than removing history. Safety records survive journal cleanup/save/reopen. If a later archive or stage fails, earlier safety records remain discoverable in the timeline; disk stays untouched.

## Git safety limitation in current contract

Git safety copies returned by restoreAsNewVersion are shown as Safety copy in this controller's session, and can be restored through their SHA. git_log has no hidden-ref inclusion option. Persistent listing of refs/somnia/safety after reopening needs a future coordinated package A/contract extension. This patch does not pretend that standard branch log lists hidden refs.

## Tests and verification

- npm ci --ignore-scripts: completed; existing audit reports 1 low + 3 moderate vulnerabilities, no dependencies changed.
- npm run build: passed (existing chunk-size/dynamic-import warnings).
- npm run typecheck: passed.
- Focused history/SSR tests: 13 passed, 0 failed.
- Full npm run test:core: 1476 tests, 1432 pass, 0 fail, 18 skip, 26 todo. Initial run hit execution timeout; complete rerun exited 0.
- cargo test --no-default-features --test recovery_history --test file_service: 4 new tests + 24 existing tests passed, 0 failed. Rust toolchain installed only in scratch workspace, not project dependencies.
- Visual browser check at 460x820: light/dark timeline, wrapped long Unicode filename, restore dialog; Escape closes and restores focus. Screenshots delivered with handover. Visual harness is temporary and is not in patch.
- Desktop-feature Tauri build, signed releases, end-to-end native callback integration and Windows/macOS behavior are NOT verified here.

Locale JSON changes are additive versions.history.* key unions in all five locales. package.json test:core appends only this package's explicit globs. Rust command lists/capabilities must merge by union with package A. Merge service.rs additions around existing RecoveryRecord/recovery_discard without replacing unrelated changes.
