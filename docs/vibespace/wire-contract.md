# Vibe Space wire contract v1

The normalized native boundary lives in `phase1/vibespace-core/src/wire.rs`.
Provider/SDK types never cross it. Rust event payloads are redacted and bounded
before publication; the renderer never decides tool permission or executes a run.

## Encoding

Request/response field names use camelCase. Enum values use snake_case. Unknown
request fields are rejected. IDs are strings; production IDs are UUIDs. UTC
instant strings use RFC3339. Each run event carries `protocolVersion: 1`,
`runId`, durable increasing `sequence`, `timestampUtc`, `kind`, `payload`.

Execution and review are separate:

- Execution: pending, claimed, running, paused, stopped, done, failed, crashed.
- Review: none, ready, applied, discarded, conflict.
- Consent choices: allow_once, allow_for_run, deny.
- Model locality: local, cloud.

`paused` is only offered after a durable pause/resume implementation exists. The
presence of a DTO variant does not imply backend support. Capabilities must be
reported rather than inferred from enum variants.

## Requests

- Create Space: `{name, folderGrantId}`. The native folder chooser creates the
  grant. A frontend string is not proof of filesystem access permission.
- Create Studio: `{spaceId, goal, model: {provider, model, locality}}`.
- Consent decision: `{runId, requestId, choice}`. It carries no replacement scope,
  path, arguments or autonomy. The broker looks up the original proposal.
- Actions targeting an existing run: explicit runId, never current selection.
- Review Apply: runId and selected paths, or explicit all, with expected review
  revision/baseline. This command needs frontend confirmation and native conflict
  checks; it is not a generic engine tool.

API keys/OAuth tokens are never DTO fields or events. The core resolves a model
reference with the existing secure credential store. The model endpoint is part
of configured model transport and never implicitly approves network tools.

## Candidate native commands

P5 may build its adapter around these names; integration validates final args:

`vibespace_list_spaces`, `vibespace_choose_folder`, `vibespace_create_space`,
`vibespace_create_studio`, `vibespace_list_studios`, `vibespace_get_run`,
`vibespace_start_run`, `vibespace_stop_run`, `vibespace_steer_run`,
`vibespace_decide_consent`, `vibespace_review_run`, `vibespace_apply_run`,
`vibespace_discard_run`, `vibespace_list_checkpoints`, `vibespace_restore_checkpoint`,
`vibespace_list_memory`, `vibespace_add_memory`, `vibespace_delete_memory`.

Event channel: `somnia://vibespace-run`. Never catch native-command failures and
switch to a fixture provider. An explicit fixture-only test environment may use
the same interface with a visible fixture indicator.

## Cost

Display a positive finite cloud cost only. Hide zero and local-model cost. Retain
input/output/cache token counts and the price source. An estimate is labelled
as an estimate, and an absent price is not displayed as zero.

## Tests

`cargo test --locked --manifest-path phase1/vibespace-core/Cargo.toml`

These tests currently verify encoding, rejection of credential/scope-extension
fields and cost-display rules. They do not validate a composed run or native UI.

## Native folder grants

`FolderGrants` is a one-shot, main-window-bound registry for results of the
native directory picker. It expires after 120 seconds and holds at most 16
pending grants. Root directories, missing directories and symlink selections
are rejected. An unknown or cross-window token does not consume the real grant.
After consumption, the caller uses the selected folder only as a scope anchor;
all file operations still require the policy/checkpoint confinement mechanism.
Canonicalization is not a sandbox or a race-free directory handle.

## Full run projection

`run_snapshot` carries the entire `RunSnapshot` defined in `wire.rs`. The full
read reply is `{protocolVersion, sequence, snapshot}` using the same persisted
sequence as the event envelope. Nested DTOs for messages, consent, checkpoints,
review files/checks, failures and capabilities are defined in the same module.
Absent values are null; empty collections are arrays. No guessed state is added.

P5 uses injected `readSnapshot` and `reviewRequest` bindings. The integrator maps
the actual package APIs to these projections, not a raw SDK or storage response.

Reject incompatible versions and mismatched envelope/payload run IDs. Ignore
sequence values at or below the last accepted value. On a gap, suspend effect
controls and reconcile with `readSnapshot`; do not apply partial events blindly.
An initial/reconciliation read only replaces state if its sequence is at least
the last accepted value. Fixture mode cannot substitute for failed native reads.

## Create versus start and retry

Creating a Studio persists the session only and does not call the model. An
explicit `vibespace_start_run` takes `{studioId, requestId, retryOfRunId: null}`.
The caller generates one requestId for that user firing. The native service
persists the request-to-run mapping and returns the same run on an ambiguous
transport retry. Checkpoint 0 and the isolated copy precede AgentBackend.start,
which itself starts the SDK run immediately.

Retry takes the same studioId, a new requestId and retryOfRunId referring to a
failed/stopped/crashed run in that studio. It creates a new run and fresh isolated
copy, preserving prior history. It never mutates/reuses the failed run's identity.
Do not advertise Start/Retry until the composed implementation exists.

Review files also carry bounded currentText/null, currentBytes and conflict for a
current-project versus proposed comparison. Binary contents stay out of text
fields. Selected files are the initial alpha unit; selected-hunk support and
preview URLs require actual native implementation before controls are enabled.

## Draft studios and spaces

`listStudios(spaceId)` returns normalized `StudioSummary[]`. `createStudio`
returns a StudioSummary and the frontend reconciles with listStudios. A fresh
studio has latestRunId null, not a fictitious pending run snapshot. canStart is
computed by the native composed core, not inferred by the frontend from a goal.
SpaceSummary holds spaceId, name, scopeLabel, autonomy and studioCount. Initial
autonomy is ask_for_writes. scopeLabel is display-only, never an access grant.

## Engine-to-policy composition

`ScopedEffectPort` binds one SDK run and its isolated root to the native
FileExecutor. Only read_file/write_file/delete_file with strictly parsed argument
objects are installed. Approvals stay in a private map and bind the exact tool
proposal; execute consumes them once, rechecks the run/root and delegates all IO
to the policy executor. There are no detached file tasks, raw std::fs tools,
shell/MCP/network effects or model-visible UiHandle. Cancellation must revoke the
broker run as well as the SDK handle before reporting a stopped native run.

Four Linux composition tests verify denied-before-effect, argument substitution,
one-shot reads/writes, cancellation before commit, and protected/unknown tools.
The full native orchestrator and real model remain separate gates.

## Runtime composition evidence and limits

The single native Runtime composes storage, checkpoints, goose StateMachine,
scoped memory, held broker consent, confined effects, full run projections and
explicit selected-file Apply/Discard/Restore. Native folder anchors persist in
schema v2. It recovers artifact journals before starting and crashes interrupted
runs without replay. Its ModelTransport argument must come from native model
settings resolution, never from the renderer. File tools remain unavailable on
Windows until the native Windows test gate is met.

Two deterministic-provider tests run the actual SDK and native services through
checkpoint/memory/consent/edit/review/apply/undo/restart and concurrent-user-edit
conflict/discard. These are composition tests, not a real Qwen model evaluation
or a native Tauri UI test. Pause/resume, schedules, shell, network tools and MCP
are not exposed by this runtime slice. Runtime ownership must be exclusive;
additional database handles must not trigger AllActive recovery.
