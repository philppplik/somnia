# Vibe Space Core - Adversarial Integration QA

Review of the native runtime composition (`somnia-vibespace-core`) against
snapshot `feat/vibespace` HEAD 4687285 plus patches:

1. `refactor(vibespace): expose host adapter types through core boundary`
2. `fix(vibespace): audit consent before execution and revoke failed or stopped runs`
3. `fix(vibespace): bind review revision to current project and partial apply state`

## Method

Composed integration tests only (`phase1/vibespace-core/tests/security_review.rs`):
the real `Runtime`, the real goose `StateMachine` (`GooseBackend`) with a
deterministic in-process `ModelTransport`, the real SQLite store, the real
checkpoint vault and the real consent broker. No custom agent loop, no cloud
transport, no runtime-file changes (tests + this doc only).

Evidence: Linux x86_64, Rust 1.95.0, `cargo test` in `phase1/vibespace-core`.
Pre-existing suites stay green (11 unit + 4 effect_port + 5 runtime).
The review suite is deterministic across repeated runs (3x identical):
**13 green, 3 red**. Windows: compile-only; no native Windows runtime evidence
exists (`enable_files` stays off there by design).

Run: `cargo test --test security_review`

## RED - reproducible blockers (failing tests, no TODO-green camouflage)

### (a) Orphaned `pending` run survives recovery, wedges the studio forever

`blocker_pending_run_is_unrecoverable_and_wedges_studio`

A crash between `start_run` (row persisted, state `pending`) and `claim_run`
leaves a pending run. `Recovery::AllActive` only covers `claimed`/`running`,
so after restart the run stays `pending` forever. `studio_summary` counts any
non-terminal execution as busy: `can_start=false` permanently, `start()` fails
with "Studio has an active or unreviewed run", and there is no abort/delete
path. Observed: `state=Pending, can_start=false, start()=Some("Studio has an
active or unreviewed run")`.

Direction: recovery must also terminalize `pending` runs that were never
claimed (they performed no effects, so `crashed`/`failed` is safe), or claim
must be folded into the same transaction as run creation.

### (b) Apply commits originals, then DB failure leaves no reconcile path

`blocker_apply_db_failure_after_commit_leaves_no_reconcile_path`

`Runtime::apply` order: `vault.explicit_apply` (commits originals) -> `store.
add_checkpoint(PreApply)` -> review transition. When the first DB write after
the commit fails (reproduced deterministically by exhausting the event budget
`MAX_EVENTS_PER_RUN + EVENT_RESERVE` via the public store API), the outcome is:

- original file already contains the agent edit (`file="after"`),
- run keeps `review=ready`, **no** "Before Apply (Undo)" checkpoint recorded,
- a blind retry fails again (`retry=Some(Some("storage operation failed"))`),
- `can_start=false` forever: the studio is wedged with divergent journals.

Direction: the apply needs an operation/reconcile journal that binds the vault
commit to the DB transition (e.g. record the pending apply in the DB *before*
committing originals and reconcile on next open/apply), plus a reconcile path
that recognizes "already applied" and finishes the state transition. A blind
retry must never be the answer.

### (c-new) Broken review projection wedges the run - no discard/abort path

`blocker_broken_review_projection_cannot_be_discarded_wedges_studio`

When `review_projection` errors (reproduced by deleting the isolated copy;
also reachable via any vault/read error), BOTH `apply` and `discard` fail,
because `discard` also routes through `review_projection` - although discarding
needs no review (it only deletes the copy, which is already gone). Result:
`review=ready` forever, `can_start=false` forever, no runtime API to abort the
run. Observed: `discard=Some("checkpoint operation failed; originals may
require recovery"), can_start=false`.

Direction: `discard` must not require a successful review projection (resolve
the isolated copy id from the persisted `core.prepared` event and delete it),
and/or the runtime needs a run-abort transition for wedged reviews.

## GREEN - invariants verified by composed tests

- **crash/restart**: `crash_restart_marks_active_run_crashed_and_unblocks_studio`
  (running run -> `crashed` + `interrupted_run`, handles/capabilities cleared,
  studio startable, originals untouched, fresh run completes),
  `crash_with_pending_consent_leaves_no_dangling_effect_path` (no dangling
  consent after crash mid-consent).
- **stop**: `stopped_run_leaves_no_active_handle_or_effect_path` (second stop
  and steer report inactive, no handle leak, project byte-identical). Combined
  with the pre-existing `stop_with_pending_consent_never_writes_late` and
  `stop_during_inference_revokes_and_preserves_project`.
- **terminal/projection consistency**: `terminal_event_and_projection_consistency`
  (terminal run rejects late persisted events, broadcast stream is
  run-scoped/monotonic and ends exactly at the full-read sequence, transcript/
  usage/timestamps derive from the persisted log).
- **scope containment**: `root_vault_overlap_is_rejected_in_both_directions`
  (vault-inside-selection, selection-inside-vault-parent, selection-is-vault;
  nothing persisted on rejection).
- **cross-run/cross-space**: `cross_space_and_cross_run_access_is_denied`
  (consent request not decidable under another run id, memory get/search/delete
  invisible across spaces, run listing isolated, checkpoint of run A not
  restorable through run B).
- **memory scopes/deletion**: `memory_recall_is_bounded_and_deletion_effective`
  (recall bounded at 32 items / 16 KiB, pending-review items never recalled,
  deletion effective on next run).
- **stale revision / current edits / partial apply**:
  `partial_apply_with_concurrent_edit_binds_current_project_state` (revision
  moves with partial apply AND with current-project edits; stale revisions
  rejected; conflicted apply never clobbers the user edit; remainder applies
  after revert) - extends the patch-3 test with the current-edit interleave.
  `stale_revision_after_copy_content_change_is_rejected` (review binds live
  isolated bytes; old revision rejected after copy content changes).
- **apply failure paths**: `deleted_isolated_copy_blocks_apply_and_preserves_original`
  (projection degrades to `artifact_review_failed`, apply blocked, original
  preserved), `preparation_failure_persists_failed_run_without_leaks`
  (persisted `Failed` + `preparation_failed`, no broker registration/handle/
  consent leak, studio immediately startable, recovery after folder repair).
- **consent auditing**: `consent_decision_is_one_shot_and_replay_safe`
  (unknown request id rejected, replay of a consumed request rejected).
- **discard**: `discard_is_revision_checked_and_removes_isolated_copy`
  (stale revision rejected, isolated copy removed from disk, review terminal,
  studio freed).

## Review-by-inspection notes (not deterministically testable through Runtime)

- **persist-fail revocation**: `fail_run` revokes broker + SDK (patch 2). The
  SDK cancel uses `handle.try_lock()`: if a `steer`/`stop` holds the handle in
  that instant, the SDK cancel is silently skipped (broker revocation still
  lands, so effects stay blocked; the engine then runs to completion with all
  events dropped). Consider awaiting the lock or cancelling via a stored
  `CancellationToken` clone instead.
- **engine-start failure**: on `backend.start` error the run transitions to
  `Failed`, but `finish_policy` is never called - the broker run registration
  stays `Active`. Not reachable through `Runtime` today because
  `GooseBackend::start` inputs are fully pre-validated by the runtime; latent
  if that ever changes.
- **broker registration leak on late preparation failure**: `register_run`
  happens mid-preparation; a failure after it (e.g. `IsolatedRoot::open`)
  leaves the broker run registered with no finish/cancel. Same reachability
  caveat.
- **`start()` error after handle registration**: a `publish` failure at the
  end of `start` returns `Err` to the caller although the run is live with a
  registered handle. Cosmetic today (publish only fails on projection errors).
- **`ReviewState::Conflict` is projection-only**: nothing ever transitions the
  DB review axis to `conflict`; conflicts live only in the review projection.
  A conflicted run keeps `review=ready` (blocking `can_start`) until discard.
  The `Conflict` arms in `apply` are unreachable. Works, but the UI must not
  wait for a DB `conflict` state.
- **stale full read (edge c)**: `snapshot()` re-reads and binds
  `last_sequence` (up to 5 attempts) and the review revision now digests
  `review + projected files` (patch 3), so stale reads/revisions are rejected.
  Verified green via the partial-apply/current-edit interleave tests.
- **cardinality (edge d)**: storage limits (goal 20k chars, 10k events/run,
  16 KiB/event payload, 500 list limit) vs UI validation (goal 8192, review
  1000) - per coordinator, fixed at the core boundary; not re-tested here.
- **single-process assumption**: `Recovery::AllActive` marks every
  claimed/running run crashed on open; correct for exactly one process. Two
  live processes on the same data dir would crash each other's runs (observed
  while simulating restart); acceptable for the alpha, worth a lockfile later.


## Coordinator repairs after reproduction

The coordinator independently reproduced 13 green / 3 red, then repaired all
three. Current Linux composed suite: 18 green / 0 red plus 20 original tests.

- AllActive recovery includes pending and paused, without replaying effects.
- Discard resolves a persisted, validated private isolated id, not live content.
  Broken projections expose an explicit unavailable review with Apply disabled
  and discard still reachable through UI; its persisted revision epoch is checked.
- Schema 3 adds a durable artifact operation intent. The Vault callback must
  persist intent and an Undo reference before first original write. Intent reserves
  its completion event. Manual checkpoints no longer consume lifecycle reserve.
  Committed Vault receipts survive crash recovery. Open/apply/discard/restore
  reconcile pending operations against verified private receipts without replaying
  writes. Pre-apply references sort first so Undo cannot fall out of bounded reads.

The original event-budget test was changed to require successful Apply with Undo
and a startable Studio: manual checkpoint flooding cannot exhaust commit reserve.
This is not used as evidence of a postcommit failure recovery. Two new SQLite
trigger tests separately force failure before intent insertion (original unchanged,
transaction rolled back, retry safe after repair) and after originals commit
(pending intent + Undo survive, restart finalizes metadata, a later user file stays
untouched, Undo restores original). Independent journal review and full native
Windows/Linux builds remain open gates.

Follow-up: Restore now uses the same prewrite intent/Undo callback and durable
commit receipt. A separate real SQLite postcommit Restore failure test verifies
reconciliation retains the terminal review axis and never overwrites later user
edits. RunHandle cancellation is cloned into a lock-independent map; fail_run
can cancel SDK execution even while steer/stop holds the async handle lock.
Current composed Core total: 39 Linux tests (19 adversarial), all pass.

## Independent journal review (99f5f5f + e3680f0)

Reviewed the coordinator's artifact-operation journal repairs against the live
tree (`phase1/vibespace-core/tests/journal_review.rs`, 6 composed tests).
Base note: 99f5f5f was generated against a base containing one unlisted change
(`capabilities.active` bound to `!execution.is_terminal()`); it was hand-merged
faithfully (hunk 7) before review. Verified: Core 39/39 PASS, deterministic
across runs; all prior red blockers ((a) pending recovery, (b) apply DB
failure, broken-projection discard) now pass as green regression tests.

### RED - new reproducible blockers

#### (e) Committed apply op + broken review projection wedges `Runtime::open` forever

`blocker_committed_apply_with_deleted_copy_makes_open_fail_forever`,
`blocker_committed_apply_with_deleted_project_makes_open_fail_forever`

Crash window: originals committed, durable vault receipt written, DB completion
injected to fail (real SQLite trigger on `artifact_operations` UPDATE) - exactly
the state 99f5f5f is designed to reconcile. If the review projection is ALSO
broken when the process comes back (isolated copy deleted, or the user deleted
the broken project folder while down - both realistic, the second not even
adversarial), `reconcile_applies` computes
`complete = committed && self.review_projection(&run)?.files.is_empty()` and the
`?` propagates. `Runtime::open` calls `reconcile_applies()?`, so open fails with
"checkpoint operation failed; originals may require recovery" - permanently, for
the whole data directory, including unrelated spaces. Every
open/apply/discard/restore re-hits it. Only manual DB surgery
(`DELETE FROM artifact_operations`) recovers.

Direction: reconcile must not let a projection READ veto journal COMPLETION.
The vault receipt already proves the commit; on projection error, finish the op
as committed with `complete=false` (review stays `ready`, surfaces as the
existing unavailable-review projection) instead of failing open.

### GREEN - invariants of the repair verified by composed tests

- `crash_between_intent_and_first_write_aborts_and_allows_retry` (crash after
  durable intent+Undo, before op 0: prepared journal rolled back, op aborted,
  originals untouched, no replay, same-revision retry succeeds).
- `crash_mid_plan_rolls_back_partial_original_writes` (crash after first of two
  file writes: partial original write rolled back, op aborted, full retry
  succeeds).
- `broken_projection_exposes_unavailable_review_and_epoch_bound_discard`
  (`N:unavailable` revision, apply capability off, wrong epoch rejected,
  epoch-bound discard works without any content projection).
- `restore_persists_labeled_undo_and_keeps_review_axis` ("Before Restore
  (Undo)" label, restore op never rewrites the review axis, no pending ops
  left).
- Coordinator's own trigger tests cover: precommit INSERT failure (nothing
  written, safe retry), apply/restore postcommit UPDATE failure (pending intent
  + Undo survive, restart reconciles metadata-only, later user edits preserved,
  Undo restores original).

### Review-by-inspection notes on the journal repair

- `begin_artifact_apply` / `finish_artifact_apply` are public `Store` API and
  distinguish apply vs restore by `id.starts_with("restore-")`. Ids are
  vault-generated (`unique_name`), so the runtime path is safe; a host-side
  caller passing a crafted id (e.g. path chars) would make
  `Vault::apply_committed` reject it and wedge `open` the same way as (e).
  Host-only misuse, but the boundary is stringly-typed; consider an op-kind
  column instead of id-prefix checks.
- `apply`'s vault-error path (`recover` + `reconcile`, then `Err(error)`) can
  return an error to the user although reconcile just completed the apply
  (e.g. receipt write or `remove_journal` failed after commit). State is
  consistent; the error is misleading. Rare (filesystem failure after commit).
- `list_checkpoints` ordering changed: `pre_apply` kinds sort first, remaining
  entries newest-first (was oldest-first). UI consumers must not assume
  chronological order.
- Restore after Applied intentionally keeps `review=applied` (pinned by the
  coordinator's restore test). Consequence: the isolated copy with the agent's
  changes has no re-apply/discard path afterwards (both require
  `ready|conflict`). Accepted design; artifact cleanup remains open.

### Repair of independent journal finding (e)

The coordinator reproduced both red cases. Reconciliation now treats projection
read failure as committed/incomplete, not as a veto on journal completion or
Runtime::open. The explicit unavailable review keeps Apply off; the user can
discard it by its persisted epoch. The deleted-copy test now checks that safe
state, then explicitly discards and verifies canStart. It no longer requires
canStart immediately while the unknown proposal intentionally remains Ready.
Typed schema4 operation kind removes id-prefix decisions from DB review-axis
transitions; private id kind/grammar is checked before persistence.
