# Somnia architecture

Technical reference for the Somnia app as it exists on the `somnia-agent` branch (Somnia 11.0.0 alpha line). It describes what the code does. Design drafts and plans are marked as such and live in their own documents.

Related documents: [Agent architecture](agent/ARCHITECTURE.md), [Logging](LOGGING.md), [Window background](WINDOW-BACKGROUND.md), [Build, CI and release](BUILD-AND-RELEASE.md), [Extension SDK](extensions/README.md), [Relay](../relay/README.md), [Roadmap](ROADMAP.md), decisions in [`phase1/notes/`](../phase1/notes/).

## 1. Overview

Somnia is a local-first visual web editor. The design canvas and the code editor work on the same source text. Edits are patches on the real HTML and CSS, never a regenerated document.

```text
+------------------------------ Tauri window "main" (WebView2 / WKWebView / WebKitGTK) ------------------------------+
|  React 19 UI  --  appStore  --  EditorProject (editor-core: parse5, stable IDs, history)                            |
|     |                |                 |                                                                           |
|  Canvas / Code / Panels   FileAdapter (save, recovery, conflict)    Agent subsystem    Extensions    Collab (Yjs)   |
|                              |  FilePort                                  |                |             |        |
+------------------------------|--------------------------------------------|----------------|-------------|--------+
        desktop: Tauri IPC     |   web: File System Access API (webFsPort)  | HTTPS / HTTP   | Worker      | WS
+------------------------------v--------------------------+          OpenRouter / Ollama       sandbox    LAN host / relay
|  Rust backend (src-tauri): commands, Project service,   |
|  recovery journal, watcher, drop grants, LAN host, log  |
+---------------------------------------------------------+
```

Two build targets share one frontend:

- **Desktop** (`phase1/src-tauri`): the frontend runs in a Tauri webview and talks to the Rust backend over IPC. All disk access goes through the backend.
- **Web** (`somnia.philipp-paulik.de`): the same bundle runs in a browser. `webFsPort.ts` implements the same storage port over the File System Access API (ADR-002). Firefox and unsupported browsers fall back to a ZIP working copy (`zipWorkingCopy.ts`).

## 2. Repository layout

| Path | Content |
| --- | --- |
| `phase1/` | The app. `src/` frontend, `src-tauri/` Rust backend, `packages/editor-core/` document model, `tests/` Playwright specs, `scripts/` build helpers, `templates/` and `examples/` for extensions, `msix/` Store packaging, `notes/` ADRs and feature notes. |
| `relay/` | `somnia-relay`, the blind WebSocket relay for internet collaboration. Rust crate, also a path dependency of the desktop crate. |
| `docs/` | Documentation and the project site (`index.html`, `about/`, `app.p*.js`). |
| `proto/` | Phase 0 browser prototype. Frozen, not part of the current app. |
| `.github/workflows/` | `phase1-core-bootstrap.yml` (validation and bundles) and `relay.yml`. |

## 3. Rust backend (`phase1/src-tauri`)

Crate `somnia-desktop` (`lib` + `cdylib` + `staticlib`, binary `somnia-desktop`, feature `desktop` on by default). Without the `desktop` feature the crate builds as a plain library so `cargo test --no-default-features` runs the service tests on any CI image without GTK/WebKit.

| Module | Role |
| --- | --- |
| `main.rs` / `lib.rs` | Entry point; `lib.rs` exposes `service`, `applog`, `lan_host` always and `desktop`, `drop_grant` under the feature. |
| `desktop.rs` | Tauri wiring: command handlers, window events, the 250 ms tick thread, window background effect. |
| `service.rs` | `Project`: sandboxed file service, autosave state machine, recovery journal, conflict detection, `AppError`. No network, no shell. |
| `drop_grant.rs` | One-shot, 120 s capability for paths delivered by an OS drag and drop. |
| `lan_host.rs` | Explicit, session-scoped LAN collaboration host built on `somnia-relay`. No listener exists before `start`. |
| `applog.rs` | Structured rotating log, redaction, panic hook. Std-only. See [LOGGING.md](LOGGING.md). |

### 3.1 Process state

`run()` builds the app with the dialog, updater and process plugins and manages two states:

- `Shared = Arc<Mutex<Backend>>` with `Backend { projects: BTreeMap<String, Project>, drop_grant: Option<DropGrant> }`.
- `LanHost` (tokio mutex around the optional running relay).

Blocking file work never runs on the async runtime: `work()` moves each command body into `spawn_blocking`, takes the backend lock, and logs failures as `warn` (`rust.service`).

Setup initialises the logger (`<app data dir>/logs`) and starts a thread that every 250 ms locks the backend, calls `Project::tick()` on every project and emits the resulting state events on `somnia://file-state`.

### 3.2 Command surface and ACL

Every command begins with `gate(window)`: only the window labelled `main` may call it, otherwise `AppError::Denied`. The same list must appear in three places, and `src/lib/tauriPermissions.test.ts` fails CI when one is missing:

1. `#[tauri::command]` in `desktop.rs` and registration in `generate_handler!`
2. `build.rs` (`AppManifest::commands`), which generates one `allow-<name>` permission per command
3. `capabilities/editor.json` (identifier `editor`, `local: true`, window `main`)

The capability also grants a short list of core window and event permissions (listen/unlisten, close, destroy, drag, minimize, maximize, size and position, decorations, always-on-top), `updater:default` and `process:allow-restart`. There is no filesystem, shell, HTTP or opener plugin permission and no remote origin.

| Command | Arguments | Result | Purpose |
| --- | --- | --- | --- |
| `choose_project` | `createSubfolder?` | `{projectId, name}` or `null` | Native folder picker. With `createSubfolder` creates exactly one validated child folder (no separators, reserved characters, trailing dot or space, max 100 chars) and opens it. |
| `choose_file` | none | `{projectId, name}` or `null` | Native file picker. Opens one file in place (single-file project rooted at its folder, only that file visible). |
| `open_dropped_project` | `token` | `{projectId, name}` | Consumes a drop grant holding exactly one folder or file. |
| `read_dropped_files` | `token` | files with `text` or `base64` | Consumes a drop grant for loose files added to the current project. |
| `is_store_package` | none | `bool` | True when the executable path contains `\windowsapps\` (MS Store build). Disables the in-app updater UI. |
| `list_files` | `projectId` | relative paths | Text and media files, depth limit 32, max 20 000 entries. |
| `read_file` | `projectId, path` | `{content, revision, status}` | Reads one text file (see encoding below) and registers it as a tracked document. |
| `read_media` | `projectId, path` | bytes | PNG, JPEG or PDF up to 25 MB, for preview. |
| `hold_autosave` | `projectId, paths` | none | Stops native autosave for these paths until an explicit save. Used by the agent apply path. |
| `stage_edit` | `projectId, path, content, clientRevision` | `StateEvent` | Journals the editor text, marks the document dirty. |
| `save_file` | `projectId, path, expectedRevision` | `StateEvent` | Atomic compare-and-replace save. |
| `delete_file` | `projectId, path, expectedRevision` | none | Deletes only if the disk still has the revision the editor saw. |
| `open_external` | `url` | none | Opens the system browser, only for `https://github.com/philppplik/somnia` and sub-paths (max 300 chars, printable ASCII). |
| `recovery_list` / `recovery_read` / `recovery_restore` / `recovery_discard` | `projectId` (+ `path`, `revision`) | records / event / none | Journal access. Recovery is offered, never restored silently. |
| `close_project` | `projectId, keepRecovery` | none | Drops the project. `Dirty` error unless `keepRecovery` is true. |
| `collab_lan_start` / `collab_lan_stop` / `collab_lan_status` | `lan, port, roomId?` | `LanHostInfo` | Session-scoped relay on loopback or LAN (section 8). |
| `set_window_background` | `glass, dark` | `bool` (effect active) | Native acrylic/vibrancy. See [WINDOW-BACKGROUND.md](WINDOW-BACKGROUND.md). |
| `log_write` / `log_tail` / `log_dir` | level, source, message, context / `lines?` | none / text / path | Frontend access to the log file. |

Window events handled in `desktop.rs`: `DragDrop::Drop` creates a `DropGrant` and emits `somnia://os-drop {token, count, media}`; `CloseRequested` is prevented when any project has dirty documents and `somnia://close-blocked` is emitted so the UI can run its Save / Keep recovery / Cancel flow. `somnia://file-state` carries all state changes. The frontend also listens for `somnia://menu`, but the backend has no native menu and emits nothing on it today.

Limits: 4 open projects, 2048 tracked documents per project, 8 MiB per file, 20 000 listed files.

### 3.3 Project service

Roots come only from the native picker or a drop grant, never from a renderer-supplied string. Opening a project:

1. Canonicalise the root; the recovery directory is `<app_local_data_dir>/recovery-v1/<sha256(root path)>` (mode 0700 on Unix).
2. Take an exclusive `session.lock` there (`fs2`). A second Somnia process gets `AppError::Locked`.
3. Open the root and the recovery directory as `cap_std::fs::Dir` handles and start a recursive `notify` watcher (non-recursive for a single-file project).

Path safety (`validate_path`, `Project::safe_path`): paths are root-relative with `/` separators; empty, `.` and `..` segments, backslash, colon, NUL, Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) and trailing dot or space are rejected. Every existing path component is checked with `symlink_metadata`, symlinks are refused, and the deepest existing ancestor must canonicalise inside the root.

Document state machine per tracked file: `Saved`, `Dirty`, `Saving`, `Conflict`, `Error`.

```text
read_file        -> Saved (base = observed = disk revision)
stage_edit       -> Dirty   (journal write first; failure rejects the stage, UI stays dirty)
tick (quiet 1 s or 5 s of continuous edits) -> save attempt (autosave, skipped for held paths)
save_file        -> Saving -> Saved | Conflict | Error
disk changed, no pending edit -> Saved with new base
disk changed, pending edit    -> Conflict (both versions preserved)
```

- `Revision { exists, hash }` with SHA-256 over bytes. `stage_edit` requires a strictly increasing `clientRevision` per document, otherwise `StaleRevision`.
- **Journal**: each staged edit is written atomically as `<sha256(path)>.json` (`RecoveryRecord { schema, path, baseRevision, clientRevision, content, updatedAtMs }`). One live record per document. It is removed after a successful save; a cleanup failure is reported in the event, not treated as a failed save.
- **Atomic save**: compare the disk revision with `expectedRevision`, write a temp file in the target directory (`.somnia-write-<uuid>.tmp`, mode 0600, fsync), copy the target's permissions, compare again, rename over the target, fsync the directory (Unix; Windows reports `file_synced_directory_flush_unavailable`), read back and verify the hash. The event carries a `durability` string. A non-cooperating writer can still win the race between the last compare and the rename; rename is not a conditional compare-and-swap.
- **Change detection**: watcher events set a flag; the tick also hashes every tracked document every 2 s so missed events are caught.
- **Encoding**: reads strip a UTF-8 BOM, decode UTF-16 with BOM, and fall back to Windows-1252 when the bytes are not valid UTF-8. Files are always saved as UTF-8.

### 3.4 Errors

`AppError` serialises as `{code, message}` with snake_case codes: `io`, `denied`, `conflict`, `no_edit`, `stale_revision`, `limit`, `locked`, `unknown_project`, `invalid`, `dirty`. Commands return `Result<T, AppError>`; `log_*` and the LAN and window commands return string errors. Service errors are logged once at `warn` by `work()`.

## 4. Frontend (`phase1/src`)

Stack: React 19, Tailwind 4 with restyled shadcn sources on Base UI, CodeMirror 6, Vadivam icons (`lib/icons.tsx`, inline SVG with lucide-compatible export names). State is one external store, no router.

| Area | Where |
| --- | --- |
| Entry | `main.tsx` installs global error handlers and locale, restores the last draft (or starts blank), applies look and UI prefs, installs the storage adapter (desktop, File System Access or ZIP fallback), registers the LAN host and store detection under Tauri, then renders `ErrorBoundary > App`. `App.tsx` lays out the bento shell: title bar, icon rails, left panel, canvas/code, inspector or Agent panel, status bar. |
| Store | `store/appStore.ts`: `AppState`, `patchState`, `useAppStore` (`useSyncExternalStore`), `connectEditorProject`, `applyOperations`, `applyHistory`, `getProjectGeneration` (bumps on every project switch; async work compares it to drop stale results). |
| Document model | `packages/editor-core`: `EditorProject` over parse5. Operations (`replaceSource`, `createFile`, text, attribute and structure operations) run in transactions with an `Origin` of `canvas`, `code`, `history`, `external` or `internal`, optional `expectedRevision` and a history `group`. Stable node IDs survive edits. `persistence.ts` holds `SaveCoordinator`. `markdown.ts` converts HTML to Markdown for export. |
| Storage port | `lib/fileAdapter.ts` (`FilePort`), `lib/desktopAdapter.ts` (Tauri), `lib/webFsPort.ts` (browser), `lib/zipWorkingCopy.ts` (ZIP fallback), `lib/saveFlow.ts`, `lib/closeFlow.ts`. |
| Editor surfaces | `components/Canvas.tsx`, `DesignCanvas.tsx` (sandboxed preview frame), `SourceEditor.tsx` (CodeMirror), `DiffSplit.tsx`, panels for layers, files, search, assets, components, CSS, inspector, problems. Commands and shortcuts: `lib/commands.ts`, `components/CommandPalette.tsx`. |
| Cross-cutting | `lib/log.ts`, `lib/i18n.ts` plus `locales/{en,de,es,fr,pt-BR}.json`, `lib/look.ts` and `lib/uiPrefs.ts` (themes, accent, density), `lib/windowBackground.ts`, `lib/updates.ts` and `selfUpdate.ts`, `lib/welcome.ts`. |
| Subsystems | `lib/agent/` ([Agent architecture](agent/ARCHITECTURE.md)), `lib/extensions/` ([SDK](extensions/README.md)), `lib/collab/` (section 8). |

### 4.1 Storage port and save flow

`installFileAdapter(port)` is the only code that talks to storage. `FilePort` has `invoke(command, args)`, `listen(event, handler)` and optional `shell`, `connectNotice`, `volatile`, `canReconnect`. The desktop port forwards to Tauri; the web port implements the same command names against a directory handle, so the adapter does not care which one it has.

Data flow for an edit on desktop:

```text
canvas or code edit
  -> EditorProject.transact (origin canvas/code)
  -> model.subscribe('internal') in attach(): changed files
  -> enqueueStage: invoke stage_edit {path, content, clientRevision}   (serialised promise queue)
  -> Rust journals, state Dirty, event somnia://file-state
  -> backend tick autosaves after 1 s idle / 5 s continuous
  -> StateEvent saved {clientRevision, diskRevision}
  -> handle(): markFileSaved only if the event matches the latest staged revision and the model text is unchanged
```

Rules the adapter enforces: a failed journal write keeps the UI dirty; a `saved` event for an older revision never clears dirty; clean external changes are reloaded through an `internal` transaction (no undo entry); dirty external changes become a conflict and the user resolves it through Tools > Resolve conflict (`DiskComparison`); files removed in the editor are deleted on disk only against the last seen revision; "Save to folder" and "Export to folder" refuse to overwrite existing files. Opening a project keeps the old one alive until the new one is listed, read and parsed.

Memory-only projects and ZIP projects have no backend project, so the Rust close guard cannot see them. `desktopAdapter.ts` and `closeFlow.ts` guard them in the frontend (`somnia.draft.v1` keeps the last unsaved session).

Close flow: native close request -> if dirty, `requestClose('disk' | 'memory')` opens `CloseDialog` with Save / Keep recovery / Cancel -> `close_project` -> `destroy()`. Applied agent changes held back from autosave get an extra confirmation because they are not in the recovery journal.

### 4.2 Client storage

Everything below is in `localStorage` of the app profile; none of it holds file content except the draft and component library.

| Key | Content |
| --- | --- |
| `somnia.draft.v1` | Last unsaved memory project |
| `somnia.window.v1`, `somnia.windowPrefs.v1` | Window size and position, window options |
| `somnia.look.v1`, `somnia.theme`, `somnia.themeChoice`, `somnia.appearance`, `somnia.uiPrefs.v1` | Theme, accent, window background (solid/glass), density, UI size |
| `somnia.editorPrefs.v1`, `somnia.documentPrefs.v1`, `somnia.canvasPrefs.v1`, `somnia.workflowPrefs.v1`, `somnia.format.v1`, `somnia.fastParse.v1` | Editor, document, canvas and workflow settings |
| `somnia.shortcuts.v1` | Shortcut overrides |
| `somnia.panels.v1`, `somnia.panelWidths.v1`, `somnia.split.v1` | Layout |
| `somnia.locale.v1` | UI language |
| `somnia.backupPrefs.v1`, `somnia.projectBackups.v1` | Backup options and records |
| `somnia.components.v1`, `.v2`, `.meta.v1` | Saved components |
| `somnia.extensions.v1`, `.enabled.v1`, `.revoked.v1` | Installed extensions, enabled and revoked state |
| `somnia.agent.cloud-consent.v1` | Cloud AI consent record |
| `somnia.collab.relayUrl` | Custom relay URL |
| `somnia.updatePrefs.v1`, `somnia.updateCheck.v1`, `somnia.updateCheck.last` | Update settings and last check |
| `somnia.welcome.seen.v1` | Last version whose welcome popup was shown |
| `somnia.fixture`, `somnia.section-kit` | Test and example flags (dev builds) |

### 4.3 Preview isolation

Project HTML, CSS and scripts are untrusted data. The design canvas renders a source-backed copy in a sandboxed frame with scripts removed; node ID markers exist only in the render copy. Preview content gets no Tauri IPC (capabilities bind to the `main` window only). `renderPreview.ts` and `markdownRender.ts` render `.md` and `.svg`; PNG, JPEG and PDF open as tabs through `read_media`.

## 5. Security boundaries

- Webview CSP (`tauri.conf.json`): `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-src 'self' blob:`, `connect-src ipc: http://ipc.localhost https://api.github.com https://raw.githubusercontent.com ws: wss:`. The dev CSP additionally allows the Vite server. Outbound hosts for the agent providers are not in `connect-src`; see [Agent architecture, known gaps](agent/ARCHITECTURE.md#known-gaps).
- ACL: explicit per-command permissions for one window; no fs, shell or http plugin (section 3.2).
- Renderer paths never grant access: roots come from native dialogs and drop grants only.
- `open_external` is an allowlist of one GitHub prefix; the URL is passed as a single process argument, never through a shell.
- Secrets: API keys live in memory for the session. The logger redacts keys and tokens in Rust and TypeScript.
- Extensions run in a Worker with a declared permission set ([07-security](extensions/07-security.md)). Collaboration is end-to-end encrypted and the relay is blind ([collab-security](../phase1/notes/collab-security.md), [relay README](../relay/README.md)).
- Telemetry: none. The only network calls are update checks (GitHub), the user's chosen collaboration hosts and, when the user enables the Agent, the chosen provider.

## 6. Logging and error handling

One path for desktop and web, documented in [LOGGING.md](LOGGING.md): JSON lines in `<app data dir>/logs/somnia.log` (1 MB rotation, 3 backups), 300-entry frontend ring buffer, global error handlers, `ErrorBoundary`, Rust panic hook, redaction on both sides, "Copy error report". New code reports failures with `reportError('area.name', error, {notify})` instead of `console.error` or an empty `catch`.

## 7. Updates

`lib/updates.ts` compares `somniaRelease` with the newest stable GitHub release and shows the green status-bar pill. `selfUpdate.ts` uses `tauri-plugin-updater` against `releases/latest/download/latest.json` (minisign public key in `tauri.conf.json`, Windows `installMode: passive`) and falls back to opening the release page. Store builds (`is_store_package`) hide the updater. Details: [UPDATER.md](../phase1/notes/UPDATER.md), [BUILD-AND-RELEASE.md](BUILD-AND-RELEASE.md).

## 8. Collaboration

Yjs documents with `y-codemirror.next`, in `lib/collab/` (engine `realEngine.ts`, session `session.ts`, project bridge `projectBridge.ts`, media sync `blobSync.ts`, invitations `invite*.ts`, room keys `roomSecurity.ts`, LAN host port `lanHost.ts`). Transports: localhost or LAN through the in-process relay started by `collab_lan_start` (explicit, per session, `lan` chooses loopback or all interfaces), or a self-hosted `somnia-relay` over WebSocket. The relay forwards opaque encrypted frames and stores nothing. The desktop app stays the only disk writer. Design and threat model: `phase1/notes/ADR-005-*.md`, `collab-*.md`.

## 9. Extensions

Manifest-declared extensions run in a Worker (`lib/extensions/runtime.ts`, `workerSource.ts`) behind a permission-checked host API (`host.ts`, `api.ts`), with optional panels in sandboxed HTML (`panelHtml.ts`) and a GitHub-hosted catalog (`catalog.ts`). User documentation is in [`docs/extensions/`](extensions/README.md); keep it as the single source for the SDK.

## 10. Testing

| Suite | Command | Scope |
| --- | --- | --- |
| Core (Node test runner via `tsx`) | `npm run test:core` | editor-core, `src/lib/**`, extensions, collab, agent, components |
| Playwright | `npm run test:e2e` | `phase1/tests/*.spec.ts` against the Vite build (Chromium) |
| Rust | `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked` | service, drop grant, log, LAN host (`tests/file_service.rs`) |
| Benchmarks | `npm run bench` (full and `SOMNIA_INCREMENTAL=1`) | editor-core budgets, see [PERFORMANCE-BUDGETS.md](PERFORMANCE-BUDGETS.md) |
| Updater harness | `npm run test:updater` | `latest.json` generation and validation without secrets |
| Native smoke | `scripts/native-smoke.sh` under Xvfb | Linux keyboard smoke of the built AppImage |

What CI cannot prove: Windows-only behaviour (WebView2 drag and drop, frameless window, acrylic, installer swap), real signatures, and real provider calls. Those are tested by hand on Windows before a version is called stable.
