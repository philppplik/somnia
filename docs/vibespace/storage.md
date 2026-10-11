# Vibe Space storage (`somnia-vibespace-storage`)

> **STATUS: UNVERIFIED DRAFT.** This crate was written without a Rust toolchain or network.
> It has never been compiled and no test has run. Expect small compile fixes. Nothing below
> is a claim that a behavior is verified; the test list says what each test is meant to prove.

Standalone crate at `phase1/vibespace-storage` (own `[workspace]`, no Tauri/desktop deps).
Run: `cargo test --manifest-path phase1/vibespace-storage/Cargo.toml`

Dependencies: `rusqlite 0.32` (`bundled`, includes FTS5), `serde`, `serde_json`, `uuid` (v4); dev: `tempfile`.
If a newer `rusqlite` is wanted, only `Connection`/`Transaction` basics are used, so a bump should be mechanical.

## Design rules

- IDs are UUID v4 strings. Timestamps are UTC, fixed-width RFC3339 with milliseconds (`2026-10-11T13:04:10.123Z`), so string order is time order.
- **Execution state and review status are separate columns and separate enums.** No UI state machine here.
- The raw `Connection` is never exposed. `Store` holds it behind a `Mutex`; every write is one `BEGIN IMMEDIATE` transaction.
- DTOs: camelCase fields, snake_case enum values (matches `docs/vibespace/wire-contract.md`). Request DTOs use `deny_unknown_fields` and accept optional `schemaVersion` (must be 1). Output DTOs carry `schemaVersion: 1`.
- No keys/tokens anywhere: `ModelRef` is `{provider, model, locality}`; events are redacted before they are stored.

## API (all on `Store`)

```rust
use somnia_vibespace_storage::*;

let store = Store::open("vibespace.db", StoreOptions::default())?;   // migrates, then recovers (see below)
let caps: Capabilities = store.capabilities();                        // fts5, searchMode, vector=unavailable, limits

// Spaces (default autonomy = ask_for_writes). Project scope needs a native folder grant id.
let space = store.create_space(NewSpace::project("My project", "grant-123"))?;
let personal = store.create_space(NewSpace::personal("Notes"))?;
store.list_spaces(50)?; store.get_space(&space.id)?; store.set_autonomy(&space.id, Autonomy::AskForEverything)?;

// Studios and runs
let studio = store.create_studio(NewStudio { schema_version: 1, space_id: space.id.clone(), goal: "Refactor X".into(),
    model: ModelRef { provider: "ollama".into(), model: "qwen3.5:9b".into(), locality: ModelLocality::Local } })?;
// Idempotent start (wire StartRun {studioId, requestId, retryOfRunId}). requestId = UUID per user firing.
let out = store.start_run(StartRunRequest { schema_version: 1, studio_id: studio.id.clone(),
    request_id: "3f2b8c1e-6a4d-4f57-9a0e-1c2d3e4f5a6b".into(), retry_of_run_id: None })?;
let run = out.run;                                       // out.created=false on a replay of the same requestId
store.get_run_by_request("3f2b8c1e-...")?;              // reconcile after a command timeout (Option<Run>)
// explicit retry: NEW requestId + retry_of_run_id = failed/stopped/crashed run of the same studio -> new run
// store.create_run(&studio.id) is a convenience that uses a fresh requestId.
store.list_runs(&space.id, None, 50)?;                   // optionally filter by studio
store.list_attention_runs(&space.id, 50)?;               // interrupted, crashed, failed, review ready/conflict

// Claim with a lease and fencing token (exactly one concurrent claimer wins)
let claimed = store.claim_run(&run.id, "instance-1", 60_000)?;           // claimed, fencingToken = 1
store.heartbeat(&run.id, claimed.run.fencing_token, 60_000)?;

// Atomic state change + event (one transaction; error => nothing changes, no event)
store.transition_run(&run.id, TransitionRequest::execution(ExecutionState::Running))?;
let mut done = TransitionRequest::execution(ExecutionState::Done);
done.review = Some(ReviewState::Ready);                  // execution and review in the same transaction
done.result = Some(serde_json::json!({"summary": "ok"}));
done.fencing_token = Some(claimed.run.fencing_token);
let out: TransitionOutcome = store.transition_run(&run.id, done)?;
let mut apply = TransitionRequest::review(ReviewState::Applied);
apply.expected_review_revision = Some(out.run.review_revision);   // optimistic check against the reviewed baseline
store.transition_run(&run.id, apply)?;

// Event log
let ev = store.append_event(&run.id, "tool.call", &serde_json::json!({"name": "write_file"}), Some(1))?;
let wire: WireRunEvent = ev.wire();                      // exactly the 6 envelope fields for somnia://vibespace-run
let page = store.list_events(&run.id, /*after_sequence*/ 0, 200)?;

// Checkpoint references (opaque content address, never a path) + same-transaction event
store.add_checkpoint(NewCheckpoint { schema_version: 1, space_id: space.id.clone(), run_id: run.id.clone(),
    kind: CheckpointKind::Baseline, label: "checkpoint 0".into(), content_ref: format!("sha256:{}", "ab".repeat(32)) })?;
store.list_checkpoints(&space.id, Some(&run.id), 50)?;

// Memory: every call takes an explicit space_id. There is no global memory.
let m = store.add_memory(NewMemory { schema_version: 1, space_id: space.id.clone(), kind: MemoryKind::Preference,
    title: Some("Style".into()), content: "Prefer tabs".into(), source: MemorySource::User, source_ref: None,
    consent: MemoryConsent::UserExplicit })?;
store.list_memory(&space.id, &MemoryListOptions::default())?;
let res: SearchResponse = store.search_memory(&space.id, "tabs", &SearchOptions::default())?;  // res.mode, res.fallback_reason
store.delete_memory(&space.id, &m.id)?;                  // false if the id is not in that space
```

Everything returns `Result<_, Error>`. `Error::code()` gives a stable string and `Error::to_dto()` an `ErrorDto {schemaVersion, code, message}`.
Codes: `sqlite json newer_schema foreign_database migration_failed not_found invalid_input invalid_transition unsupported limit_exceeded fencing_mismatch conflict unsupported_dto_version lock_poisoned`.

### Mapping to the candidate native verbs
| Verb | Storage call |
|---|---|
| `vibespace_list_spaces` / `create_space` | `list_spaces` / `create_space` (adapter turns `folderGrantId` into `NewSpace::project`) |
| `vibespace_create_studio` / `list_studios` | `create_studio` / `list_studios` |
| `vibespace_get_run` | `get_run` + `list_events` |
| `vibespace_start_run` | `start_run` (idempotent, persists requestId->run in the same transaction as the run and event #1), then `claim_run`, then `transition_run(Running)`. On timeout call `get_run_by_request`, never mint a new id |
| `vibespace_stop_run` | `transition_run(Stopped)` (valid from pending/claimed/running) |
| `vibespace_decide_consent` | not stored here beyond events (`append_event` with kind e.g. `consent.decided`); the broker owns the proposal |
| `vibespace_review_run` / `apply_run` / `discard_run` | `transition_run` review axis (`ready`, `applied`, `discarded`, `conflict`) with `expected_review_revision` |
| `vibespace_list_checkpoints` / `restore_checkpoint` | `list_checkpoints`; restore itself is a file operation outside this crate (record it with `add_checkpoint`/events) |
| `vibespace_list_memory` / `add_memory` / `delete_memory` | same names, explicit `spaceId` |
| `vibespace_choose_folder`, `steer_run` | not storage concerns |

## Start and retry semantics
`runs.request_id` is UNIQUE. `start_run` looks the id up inside the IMMEDIATE transaction: found => returns that run with `created=false` and writes nothing; found with different `studioId`/`retryOfRunId` => `conflict`; otherwise it inserts the run (+ `retry_of_run_id`) and event #1 `run.created` (payload has requestId and retryOfRunId) atomically. Concurrent starts with one id yield exactly one run. A retry requires a failed/stopped/crashed run in the SAME studio (else `conflict`/`invalid_input`), never mutates the old run, and needs a new requestId. Checkpoint 0 / isolated copy / AgentBackend.start happen outside this crate, after `start_run` returned.

## State machines

Execution (terminal states have no exits; a retry is a new run):
```
pending  -> claimed | stopped
claimed  -> running | pending (release) | stopped | failed | crashed
running  -> paused* | stopped | done | failed | crashed
paused*  -> running | stopped | failed | crashed
```
`*paused` is rejected with `Unsupported` unless `StoreOptions.enable_paused` is set (the wire contract says pause is only offered after durable pause/resume exists). `claimed` is only reachable through `claim_run`.

Review (independent of execution): `none -> ready -> applied | discarded | conflict`, `conflict -> ready | discarded`. `ready` requires the (resulting) execution state to be `done` or `stopped`. Each review change bumps `reviewRevision`.

## Event log

- `run_events(run_id, sequence, timestamp_utc, kind, payload_json, truncated)`, primary key `(run_id, sequence)`, append-only (an UPDATE trigger aborts).
- The sequence is allocated by incrementing `runs.last_sequence` inside the same IMMEDIATE transaction as the insert. Per run it is strictly increasing and gap-free; a rolled-back transaction rolls the counter back.
- Caller kinds match `[a-z0-9_.:-]{1,64}`; kinds starting with `run.` are reserved (`run.created`, `run.state_changed`, `run.interrupted`, `run.checkpoint_created`).
- Payloads are redacted (sensitive key names such as apiKey/token/secret/password/authorization/cookie, and well-known secret shapes like `sk-...`, `Bearer ...`, `ghp_...`, PEM private keys; numbers and booleans are never redacted) and bounded to 16 KiB. Larger payloads are replaced by `{truncated:true, originalBytes, preview}` and flagged `truncated`. Redaction is best effort: do not put secrets into events.
- At most 10,000 events per run (+64 reserved for state/interrupt/checkpoint events). Past that, `append_event` returns `limit_exceeded`.
- Persist before publish: publish `RunEventRecord::wire()` only after the storage call returned.
- Terminal runs reject `append_event` (`conflict`). A non-None `fencingToken` must equal the run's current token.

## Crash recovery

`recover_interrupted(mode)` marks `claimed`/`running` runs as `crashed`, sets `interrupted = true` with `interruptedReason` (`process_restart` or `lease_expired`), and appends `run.interrupted` with `effectsReplayed:false`. It never resumes, requeues, or re-executes anything, and `crashed` has no outgoing transitions. Review state is not touched. `list_attention_runs` surfaces these runs.
`StoreOptions.recovery` runs it on open: `AllActive` (default; single-process app restart), `ExpiredLeases`, or `None`. **Do not open a second handle with `AllActive` while another live process owns runs on the same file**; use `ExpiredLeases` or `None` there. `Store::startup_recovery()` returns the report for the "while you were away" card. `paused` runs are left as they are.

## Memory and search

- `memory_items` + external-content FTS5 table `memory_fts(title, content)` (unicode61, diacritics folded) kept in sync by triggers (insert/update/delete); deleting an item removes it from the index in the same transaction.
- Every query includes `space_id = ?`; the FTS hit set is joined to `memory_items` and filtered by space. Unknown space => `not_found`.
- Query handling: free text is split into alphanumeric tokens (max 16), each token quoted for FTS5, last token is a prefix match, all bound as parameters. FTS operators in user text are inert.
- Ranking: `bm25(memory_fts, 5.0, 1.0)` (title weighted); `score = -bm25` (higher is better).
- **Explicit fallback:** if FTS5 is disabled/unavailable, FTS errors, or the query has no searchable tokens, the store runs an escaped literal `LIKE` search and returns `mode: "like_fallback"` with `fallbackReason` (`fts5_unavailable_or_disabled`, `no_searchable_tokens`, or `fts5_error: ...`). Fallback hits have `score: null`. A normal FTS query with zero hits is `mode: "fts5"` with no hits (no silent widening).
- Provenance (`source`, `sourceRef`, `consent`) lives in its own object. `instructionAuthority` is always `"none"`: memory content is untrusted data and must not be placed in a system/instruction channel. `pending_review` items are hidden from list/search unless `include_pending`. Content that looks like a credential is rejected.
- **Vector search is not implemented.** `Capabilities.vector = {status:"unavailable", ...}`. There is no `fastembed`/`sqlite-vec` feature in this version, no model download, and nothing may report embeddings as ready until a backend plus tests exist. A later opt-in feature must add its own table (migration v2) and never touch the FTS path.

## Schema and migrations

`PRAGMA user_version` is the schema version (`SCHEMA_VERSION = 1`). Tables: `spaces, studios, runs, run_events, checkpoints, memory_items, memory_fts (+ triggers)`; full DDL is `V1` in `src/schema.rs`. Foreign keys are on; state/enum columns have `CHECK` constraints.

Open sequence: (1) read-only check: `user_version` greater than supported => `NewerSchema` (nothing written); version 0 with existing tables => `ForeignDatabase`; (2) set WAL, `synchronous=FULL`, `foreign_keys=ON`; (3) apply all pending migrations in ONE `BEGIN IMMEDIATE` transaction, re-reading `user_version` inside it (safe for concurrent openers); any failure rolls back DDL and version (`Migration` error). Migrations must be contiguous from 1. Add a new one by appending `Migration { version: N+1, sql }` and bumping `SCHEMA_VERSION`.

## Limits
| Item | Limit |
|---|---|
| name / title / model fields / checkpoint label | 200 chars |
| studio goal | 20,000 chars |
| memory content | 16 KiB |
| memory items per space | 10,000 |
| event payload | 16 KiB (then truncated) |
| events per run | 10,000 (+64 reserved) |
| search query | 512 chars, max 16 tokens |
| list/search page | 1..=500, default 50 |
| lease TTL | 1 ms .. 1 h |
All text rejects NUL. `contentRef` must be `algo:hex` (16..128 lowercase hex).

## Tests (`tests/*.rs`, plus unit tests in `src/`)
- `persistence`: idempotent start_run, retry rules, concurrent same-requestId start; temp-file DB reopened after drop; UUID v4 ids; defaults (ask_for_writes, pending/none); validation; capabilities.
- `memory`: space isolation (list/search/get/delete), FTS ranking and prefix, FTS delete, SQL/FTS injection and LIKE-wildcard arguments, explicit fallback, provenance/pending, limits and secret guard.
- `events`: monotonic gap-free sequences, redaction/truncation/kind validation, wire envelope keys, failed transition leaves state and log unchanged, fencing, 8 concurrent writers on separate connections (unique contiguous sequences), concurrent claim has one winner.
- `transitions`: full execution matrix (every from/to pair), pause gating, review axis and revisions, DB CHECK and append-only trigger.
- `recovery`: restart marks interrupted runs visibly, never resumes, durable flag, idempotent second restart; lease-based recovery with injected clock.
- `migration`: fresh/idempotent, v1->v2 upgrade keeps data, failing migration rolls back, newer schema rejected without modification, foreign/garbage files rejected, non-contiguous list rejected.
- `dto`: enum strings, camelCase, unknown-field rejection, schemaVersion, roundtrip.

## Risks and open points for the integrator
1. **Never compiled.** Likely first fixes: rusqlite API details (`query_map` closure types, `Transaction` deref coercions), unused imports, version of `rusqlite`/`uuid`.
2. SQL `bm25()` in a join with `memory_fts MATCH` and the `ESCAPE '\'` string are the most SQL-sensitive spots; `memory` tests cover them.
3. Default `Recovery::AllActive` is only right for a single owning process (see above).
4. One `Mutex<Connection>` per `Store`: reads serialize within a handle. Use several handles for parallelism (WAL allows it); the concurrency tests do this.
5. Autonomy values beyond `ask_for_writes` are placeholders; the consent broker must define their meaning (extend `Autonomy` and the `CHECK` in a migration).
6. Redaction is heuristic. Consent proposals/arguments should not be stored in events unredacted by design.
7. Checkpoint restore and file isolation are outside this crate: it stores references and events only.
8. `delete_space` does not exist yet (cascades are in the schema); add it with the Space lifecycle work.
9. Paused state is storable but gated off; do not enable it before the orchestrator implements durable pause/resume.
