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
