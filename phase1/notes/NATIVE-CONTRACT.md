# Module B integration

Copy src-tauri/ and .github/workflows/desktop-build.yml into the new Phase 1 app, not proto/. No repository was modified during preparation.

Bridge commands (camelCase invoke args):
- choose_project: no arguments, native picker; returns {projectId,name} or null.
- list_files: {projectId}, returns relative paths.
- read_file: {projectId,path}, returns {content:string|null,revision:{exists,hash},status}.
- stage_edit: {projectId,path,content,clientRevision}. Revision must strictly increase per document/session. Journal is flushed before accepting. Rejected requests must leave the UI dirty, not saved.
- save_file: {projectId,path,expectedRevision:{exists,hash}}. Never pass stale expectedRevision or fake a force boolean. For conflicts read disk, show comparison, then stage the reviewed merged content and save against that read's revision.
- recovery_list / recovery_read / recovery_restore / recovery_discard: projectId, plus path where relevant; restore also takes clientRevision. Recovery is offered, never silently restored.
- close_project: {projectId,keepRecovery}. Dirty documents require keepRecovery:true; close the native window only after all projects are closed. close-blocked event requests the Save / Keep recovery / Cancel UI.

Listen to somnia://file-state. Payload: projectId,path,clientRevision,state,savedHash,diskRevision,error,durability. Only clear UI dirty for a saved event matching the current edit revision. Clean external changes change diskRevision without changing clientRevision: read and reload through an ExternalFile transaction, not a user history entry. Dirty external changes become conflict and keep both bytes on disk and recovery.

Backend ticks every 250ms, autosaves after 1s quiet / max 5s continuous edits. Recommended watcher is advisory; full hashes every 2s catch missed events. 8MiB/file, 64 tracked documents/project, 4 projects, 20k explorer files, max depth32. Recovery lives under platform app_local_data_dir/recovery-v1/<root-hash>, not .somnia/history yet. One live snapshot/document, bounded by document count and size. Native chosen directory is opened as a cap-std capability; project APIs never accept ambient roots. Symlinks, traversal, Windows alternate streams/devices and metadata/build-dependency directories are denied. Preview iframes must remain sandboxed without same-origin access to the app; do not add IPC to project previews.

Atomic save: sibling temp + flushed bytes + permissions + second hash comparison + rename + directory fsync on Unix + readback. Windows reports directory flush unavailable rather than full power-loss durability. A noncooperating writer can still change the file between last hash and rename; portable rename is NOT a conditional filesystem compare-and-swap. Hard links, hostile same-root processes, network/removable filesystems and platform rename semantics require additional validation before a security/product release. Failed writes retain recovery and stop automatic retries until a new stage or explicit save.

Core is network-free. Tauri CSP denies network except local dev HMR and IPC. No shell/fs/http plugin permissions. Native dialog is called only from choose_project. AppManifest generates explicit command permissions.

Validation: 15 Linux fs-tests passed before the later error-state patch/3 extra tests; inspect attached latest core-test log to determine final status. cargo fmt/clippy were attempted. Full Linux desktop blocked on missing GLib/GTK/WebKit development packages. Windows cross-check was attempted but overwhelmed the environment and is NOT a verified target. macOS/Windows GUI, signing, installer/performance budgets, real crash/power loss and CI matrix are unverified. Build matrix creates internal unsigned binaries only (bundle.active:false); public signed installers/updater are deliberately not configured. Root app must supply pnpm-lock.yaml, pnpm build/dev/tauri scripts, Vite port1420 and @tauri-apps/api/cli 2.x. Commit Cargo.lock with integration. Owner must choose product license and audit transitive licenses before distribution.
