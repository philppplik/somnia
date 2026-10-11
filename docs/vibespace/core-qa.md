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

