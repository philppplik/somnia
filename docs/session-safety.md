# Session safety: verified checkpoints for Documents and Sheets

Status: implemented for Documents and Sheets (branch `perf/session-safety`). Implements section 4 and the "first safety gate" of
[performance-resource-architecture.md](concepts/performance-resource-architecture.md).

## Problem (confirmed in source at 0b0b641)

- `DocumentsCanvas` opened the document from `item.url` in an effect keyed by that URL and terminated the worker on cleanup. Edits and
  undo history lived only in the worker and in `documents/session.ts` (`attachEngine` clears undo), so a view remount reloaded the original file.
- `SheetsCanvas` did the same: the only workbook worker was terminated on cleanup and the dirty registration was cleared.
- Any future "deep sleep" would have made this routine, so the safety layer comes first.

## What was added (`phase1/src/lib/sessionSafety/`)

| Module | Purpose |
| --- | --- |
| `snapshot.ts` | Versioned container (`SOMS` magic, header JSON, payload). SHA-256 over header+payload. Detects truncation, bit flips, size mismatch, unknown schema. View state must be plain data (no `blob:` URLs, no credential-like keys). |
| `recoveryStore.ts` | `RecoveryStore` over a `ByteStore` (IndexedDB in the app, memory in tests/fallback). New snapshot goes to a new generation slot, is read back and verified, and only then are older slots pruned (two kept). Load picks the newest slot that verifies, so a crash mid-write falls back to the previous good one. Quota errors surface as `StorageFullError`. |
| `checkpointer.ts` | `SessionCheckpointer`: debounced (1.5 s) plus bounded (10 s max) checkpoints during editing, single-flight, safe-boundary `quiesce` hook, revision recheck after capture and after the verified write, pin with reason on failure, `prepareSuspend()` + synchronous `disposeIfSafe()`, deduplicated `resume()` with source-fingerprint conflict detection and stale-generation rejection, `releaseAfterSave()`. |
| `flush.ts` | `flushOnTeardown()` writes a last verified checkpoint from frozen state when a view goes away, before the worker is terminated. `whenFlushed()` makes a remount wait for it. `discardSession()` is the explicit discard path. |

## Studio specifics

- **Documents:** snapshot payload is `engine.save()` (the edited package). History is the host-side undo journal. Entries that depend on an
  engine snapshot id (split/merge steps) cannot survive a restart, so the journal keeps only entries above the newest structural step and
  marks itself truncated. A digest of all paragraph texts is stored; history is reused only if the restored document has identical text,
  otherwise text is kept and history is reset (the user is told).
- **Sheets:** snapshot payload is `engine.save()`. Undo/redo lives inside the WASM engine and is not part of the saved workbook, so history
  is not restored (`historyRestorable: false`); the user is told. The selected sheet and cell are restored.

## Lifecycle hooks (additive, for `perf/lifecycle-core`)

`SessionCheckpointer` takes the lifecycle inputs as options and does not import the coordinator:

- `hasLease()` - wire `jobScheduler.hasLease(resourceId)`; a leased session is never disposed.
- `quiesce()` - wait for a transaction boundary (Documents waits for the edit queue).
- `prepareSuspend({pressure})` -> `{ok, historyLost, generation}` or a pin reason. Dirty sessions need a verified checkpoint of the
  current revision. If history would be lost it refuses unless `pressure` is set (edits are never given up, only undo history).
- `disposeIfSafe(dispose)` - last synchronous gate: rechecks revision and lease, bumps the generation, then runs `dispose`.
- `resume(restore, currentSourceFingerprint)` - one in-flight promise; throws `StaleGenerationError` if the session was suspended again
  meanwhile; reports `source-changed` instead of overwriting.
- `onPin(reason, detail)` - surface in Problems; heavy admission can be limited while pinned.

## Lifecycle of a recovery snapshot

1. Edit -> `noteEdit()` -> debounced verified checkpoint.
2. View unmounts while dirty -> `flushOnTeardown` writes, verifies, then the worker is terminated.
3. Open of the same file name -> waits for pending flush -> `resume()`; if the file bytes still match the snapshot's source fingerprint,
   the edited state is restored and the document is marked unsaved with a notice. Nothing is written to the file.
4. Source changed on disk -> snapshot kept, original opened, user told. No silent replacement.
5. Closing the media item (the user's explicit discard) deletes the snapshots. A saved copy in Sheets releases them.

## Known limits

- `IndexedDbByteStore` has no unit tests (no IndexedDB in node); needs a browser/e2e run.
- The recovery store is unencrypted local storage (open decision in the concept).
- Documents have no "discard unsaved edits?" close guard yet (Sheets and Slides do); closing a Documents item discards its edits and snapshots.
- An uncommitted Sheets cell draft (typed but not Enter) is not part of the checkpoint.
- Timeouts that kill a worker still lose the engine; the last debounced checkpoint is the recovery point.
- Not run: Playwright e2e, native Tauri build.
