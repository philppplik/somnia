# Vibe Space native bridge

## Scope and baseline

This adapter was authored against committed snapshot `4687285` of
`feat/vibespace`, plus the coordinator's Core type reexports. It adds only
`phase1/src-tauri/src/vibespace_commands.rs` and this document. It does not edit
manifests, entrypoints, capabilities or workflows and is not wired until the
integration owner completes the steps below.

Business logic, consent, artifact recovery, isolated execution and application
of reviewed changes stay in the Rust Core. There is no renderer agent loop and
no bridge filesystem tool implementation.

## Integration

The coordinator wired the dependency, gated module, once-only setup and all 17 commands. Desktop bindings now read validated native capabilities during each collection refresh, starting with no enabled actions. The headless Desktop check passes; it does not compile this desktop-feature module. Full native compile and tests remain a gate.

1. Add the local `somnia-vibespace-core` dependency to the desktop manifest.
   Core must export `pub use vibespace_engine as engine;` and
   `pub use somnia_vibespace_storage as storage;`. Desktop must not take direct
   SDK/engine/storage dependencies for this adapter.
2. Declare `#[cfg(feature = "desktop")] pub mod vibespace_commands;` in the
   desktop library. The module uses existing desktop-feature Tauri, dialog,
   keyring, serde, serde_json and tokio dependencies.
3. Keep the dialog plugin already registered. In the existing setup closure call
   `vibespace_commands::manage(app.handle(), configured_refs)?` exactly once.
   `configured_refs` is a native-owned `Vec<wire::ModelReference>`. An empty vector
   is valid. It must not come from extension IPC or unverified discovery output.
   An alternative is one root `.manage(VibeSpaceState::new(configured_refs)?)`;
   do not combine both registration routes. No command permits replacing state.
4. Add these functions to the existing `tauri::generate_handler!` list:

```rust
crate::vibespace_commands::vibespace_choose_folder,
crate::vibespace_commands::vibespace_create_space,
crate::vibespace_commands::vibespace_create_studio,
crate::vibespace_commands::vibespace_list_spaces,
crate::vibespace_commands::vibespace_list_studios,
crate::vibespace_commands::vibespace_read_snapshot,
crate::vibespace_commands::vibespace_capabilities,
crate::vibespace_commands::vibespace_start_run,
crate::vibespace_commands::vibespace_stop_run,
crate::vibespace_commands::vibespace_steer_run,
crate::vibespace_commands::vibespace_decide_consent,
crate::vibespace_commands::vibespace_apply_run,
crate::vibespace_commands::vibespace_discard_run,
crate::vibespace_commands::vibespace_restore_checkpoint,
crate::vibespace_commands::vibespace_memory_list,
crate::vibespace_commands::vibespace_memory_add,
crate::vibespace_commands::vibespace_memory_delete,
```

5. Restrict any generated command ACLs to the local `main` webview. Do not grant
   extension or remote-origin command access. Runtime gating independently checks
   both native window and native webview identity and the editor origin. Accepted
   packaged origins are `tauri://localhost` and HTTP(S) `tauri.localhost`; debug
   builds also accept the exact existing dev origin `http://127.0.0.1:1420`.
   No caller supplies the identity. Events target `EventTarget::WebviewWindow`
   for `main`, never an app-wide broadcast.
6. Wire P5 `readSnapshot` to `invoke('vibespace_read_snapshot')`; wire list
   bindings to the two list commands. `readSnapshot` returns exactly
   `{revision, models, runs}`, with runs as Core `SnapshotReply` values.
   `native.ts` supplies the separately read spaces/sessions before validation.
   There is no transaction spanning those separate IPC requests. Collection
   reads double-check their native data and retry at most three times, then
   return a generic `vibespace_read_changed` error rather than invented state.
7. Derive UI action availability from `vibespace_capabilities.actions` and the
   per-run Core capabilities. Do not hardcode every action as available. Never
   treat `transport` as proof of endpoint reachability or model installation.
8. Preserve the existing Problems/diagnostic routing for `AppCommandError` and
   `crate::cmd` logs. Error messages are fixed and raw provider/storage/path
   errors are dropped. `SOM-FS-004` is an existing registry ID; bridge codes carry
   the specific cause. Integration may allocate Vibe Space registry IDs later.

## Exact request shapes

No-argument commands: chooser, spaces list, studios list, read snapshot,
capabilities. The native `window`, `webview` and managed state parameters are
injected by Tauri, not sent in IPC arguments.

All commands below accept a single `request` object. DTOs reject unknown fields,
including nested Core model references. No request accepts endpoints, API keys,
absolute execution roots, arbitrary tool invocations or caller window labels.

| Command suffix | `request` fields |
| --- | --- |
| `create_space` | `name`, `folderGrantId` |
| `create_studio` | `spaceId`, `goal`, `model: {provider, model, locality}` |
| `start_run` | `studioId`, `requestId`, `retryOfRunId` (nullable) |
| `stop_run` | `runId` |
| `steer_run` | `runId`, `message` |
| `decide_consent` | `runId`, `requestId`, `choice` |
| `apply_run` | `runId`, `reviewRevision`, `paths` |
| `discard_run` | `runId`, `reviewRevision`, `paths: []` |
| `restore_checkpoint` | `runId`, `checkpointId` |
| `memory_list` | `spaceId`, optional `includePending` (default false) |
| `memory_add` | `spaceId`, `kind`, nullable `title`, `content` |
| `memory_delete` | `spaceId`, `memoryId` |

Every suffix is prefixed with `vibespace_`. Consent choices are `allow_once`,
`allow_for_run`, `deny`. Apply paths are selected relative entries in the Core
review, not filesystem roots; Core verifies paths and the exact review baseline.
Discard carries an empty `paths` array and discards the whole isolated artifact. Nonempty arrays are rejected by this native bridge. Restore uses
an opaque native checkpoint ID. The chooser returns `null` on cancel or
`{folderGrantId, folder}` after a native selection. `folder` is display-only;
only the Core's window-bound native grant can authorize creating a space.

Memory is space-scoped, never global. Native add fixes provenance to `user` /
`user_explicit`, with no caller-selected authority/source. Memory outputs retain
`instructionAuthority: "none"`. Storage rejects credential-looking content.
The current list is bounded to 500 items, without pagination; it is not a claim
that all 10,000 permitted items are returned. Optional pagination is follow-up
work, not wired here.

## Runtime ownership, recovery and collection revision

One managed state holds a lazy `OnceLock<Result<Arc<Runtime>, ()>>`. First access
opens `app_data_dir()/vibespace`; Core owns directory creation, persistence,
artifact recovery and interrupted-run recovery. The initialization result,
including failure, is cached. Recovery is not retried by every command. A failed
initialization requires resolving the problem and restarting the native app.
A second state registration is rejected. This is in-process ownership; keep the
existing single-instance plugin so another desktop process does not open the
same private runtime directory. The bridge adds no cross-process lock.

`revision` is a native session-monotone collection counter, not a run event
sequence, not the maximum sequence, and not a database schema version. It starts
at zero and resets when the native app restarts. Never compare revisions across
app sessions. Successful mutations and forwarded run events increment it.
A read compares the real collection fingerprint and increments on a changed
projection (including settings/model changes or disk review conflicts). Equal
collections can retain a revision. `elapsedMs` is excluded from the fingerprint
because a ticking clock alone is not a collection mutation. A changed collection
may increment more than once; revisions are monotone, not contiguous operation
IDs. The counter fails instead of exceeding JavaScript's safe integer range.

Each run retains its independent durable Core sequence unchanged. Reads and
forwarded events use Core projections. Existing `requestId` retries return the
same stored run after checking Studio/retry identity, even if credentials were
removed after the original firing. There is no implicit retry with a new run.

The publisher subscribes before any first run can start. A lagged receiver emits
`{resyncRequired: true, problem: AppCommandError}` on `somnia://vibespace-run`,
and records a redacted command incident. This is deliberately not a RunEvent:
there is no fake run ID/sequence. Current P5 `parseEvent` rejects the envelope,
invokes `onError` and blocks actions until the caller reloads full native state.
Closed receivers and emission failures also record a problem. If the main
webview is unavailable, emission cannot be guaranteed; the native incident
still remains. Integration should display its subscription `onError` visibly and
request a full refresh, never suppress it.

## Model resolver

The saved Studio reference is the only model selected at start. `StartRun`
cannot override it. Newly created Studios and starts must match a reference from
native configuration or the saved non-secret Agent settings. No model is
invented from a provider name. An empty/unconfigured model means no start
capability. References are configurations, not proof that models are installed.

| Provider | Locality | Exact chat-completions endpoint | Credential |
| --- | --- | --- | --- |
| `ollama` | `local` | `http://127.0.0.1:11434/v1/chat/completions` | none |
| `lmstudio` | `local` | `http://127.0.0.1:1234/v1/chat/completions` | none |
| `openai` | `cloud` | `https://api.openai.com/v1/chat/completions` | OS keyring `openai` slot |
| `openrouter` | `cloud` | `https://openrouter.ai/api/v1/chat/completions` | OS keyring `openrouter` slot |

Keyring service is `de.philipp-paulik.somnia.agent`, matching the existing native
Agent key store. Keys are consumed only by the Rust transport and never returned,
serialized or logged. Local providers never read a key. The endpoint mapping
rejects wrong locality, unknown providers, mixed-case aliases, Claude and
Responses-only adapters. A model that needs Responses is not promised to work
through Chat Completions; add a real adapter before exposing that configuration.

Core engine `HttpModel` disables proxies and redirects, never reads environment
credentials, and uses numeric loopback for local providers. The resolver accepts
no caller-selected host. Existing preferences load from
`app_config_dir()/agent-settings.json`; that loader does not currently support
LMStudio, so LMStudio must be supplied through native `configured_refs` until
settings integration adds it. The chooser does not query endpoint catalogs in
this version (`catalog: false`). No installed Qwen model or smoke result is
claimed. A later catalog adapter must verify its fixed endpoint and parse actual
inventory before returning refs.

`transport: true` means at least one explicitly configured ref can instantiate
its supported transport (including a usable keyring key for BYOK). It does not
perform network traffic. Calls still fail honestly for offline servers,
uninstalled local models or provider models incompatible with Chat Completions.
Cloud key retrieval fails closed; OAuth/Claude/Responses are not a fallback.

## Capabilities and platform gates

Pause, resume and catalog are false. Start/retry are included only when native
transport configuration resolves. Apply/restore also require per-run Core
review/checkpoint conditions. On Windows, `files: false` is unconditional in
this patch. Runtime opens with file tools disabled; the bridge additionally
rejects Apply and Restore and forces corresponding read/event capabilities and
checkpoint `restorable` fields false. Discard is still available to clean up an
isolated artifact. No settings option enables Windows file effects. Native
Windows tests and a reviewed gate change are required first.

Creating a Studio is not firing a run. Only explicit `start_run` starts one.
Filesystem effects remain in the Core's isolated workspace/consent broker, never
in this command module.

## Verification status

- Static Rust syntax parse: **PASS**, using tree-sitter-rust (not rustc).
- Patch whitespace/scope checks: **PASS**, only two new files in delivery.
- Tauri API source inspection: **PASS**, against the snapshot lockfile's Tauri
  `2.12.1` source; confirms injected Webview/WebviewWindow, URL/window access,
  `Manager::manage` and private `EventTarget::webview_window` APIs.
- Rust DTO/provider/gate/counter/redaction tests: **NOT RUN**. Tests are included
  in the module and run after integration via
  `cargo test --manifest-path phase1/src-tauri/Cargo.toml --features desktop vibespace_commands`.
- Native full build / clippy / Windows tests: **NOT RUN**. This environment has
  no rustc/cargo and no GTK 3 or WebKitGTK 4.1 development pkg-config entries.
  CI on supported native builders is the compile/test gate. Syntax parsing and
  API inspection are not substitute compile evidence.
- Qwen trial smoke: **NOT RUN**. No local model or real endpoint availability was
  asserted or fabricated.

After wiring, compile first, run the included tests, run Core regressions, then
exercise native folder cancel/grants, restart recovery, duplicate starts,
consent/apply stale revisions, subscription gaps and extension-origin rejection
on actual native platforms. Windows file actions remain off until their native
safety evidence exists.
