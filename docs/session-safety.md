# Session safety: verified checkpoints for Documents and Sheets

Status: the library (`phase1/src/lib/sessionSafety/`) is wired into the Documents and Sheets session registries, the
close guards and the real-engine e2e acceptance tests (branch `feat/session-safety-wiring`). Only the lifecycle manager
registration is still open; see [beta.5 wiring status](#beta5-wiring-status). Implements section 4 and the "first safety gate" of
[concepts/performance-resource-architecture.md](concepts/performance-resource-architecture.md).

## Problem

- Unsaved Documents and Sheets edits live only in memory (engine/worker plus per-file session registry).
  A crash, a killed worker, a page reload or a session eviction loses them.
- Recovery therefore needs a durable, verified copy of the edited bytes that survives the app itself,
  written before the engine goes away, and never trusted unless it verifies.

## What is here (`phase1/src/lib/sessionSafety/`)

| Module | Purpose |
| --- | --- |
| `snapshot.ts` | Versioned container (`SOMS` magic, header JSON, payload). SHA-256 over header+payload. Detects truncation, bit flips, size mismatch, unknown schema. View state must be plain data (no `blob:` URLs, no credential-like keys). |
| `recoveryStore.ts` | `RecoveryStore` over a `ByteStore` (IndexedDB in the app, memory in tests/fallback). A new snapshot goes to a new generation slot, is read back and verified, and only then are older slots pruned (two kept). Load picks the newest slot that verifies, so a crash mid-write falls back to the previous good one. Quota errors surface as `StorageFullError`. |
| `recoveryIndex.ts` | Synchronous index of committed/released snapshots and live sessions, so lifecycle-style questions (`hasUnsavedChanges`, pin reasons) can be answered without awaiting the store. |
| `checkpointer.ts` | `SessionCheckpointer`: debounced (1.5 s) plus bounded (10 s max) checkpoints during editing, single-flight, safe-boundary `quiesce` hook, revision recheck after capture and after the verified write, pin with reason on failure, `prepareSuspend()` + synchronous `disposeIfSafe()`, deduplicated `resume()` with source-fingerprint conflict detection and stale-generation rejection, `releaseAfterSave()`. |
| `flush.ts` | `flushOnTeardown()` writes a last verified checkpoint from frozen state when a view/session goes away, before the engine is terminated. `whenFlushed()` makes a remount wait for it. `discardSession()` is the explicit discard path. `recoveryDataCount()`/`clearRecoveryData()` back a guarded "clear recovery data" settings action. |
| `lifecycleBridge.ts` | Seam to the Lifecycle subsystem, which is not ported to beta.5 yet: the slice of the lifecycle contract this package needs (snapshot-reference type, hooks, checksum, adapter registration) as a small interface with a no-op default host. See below. |

## Studio specifics

- **Documents:** snapshot payload is `engine.save()` (the edited package). History is the host-side undo journal
  (`UndoStack.exportJournal()` in `lib/documents/edit.ts`). Entries that depend on an engine snapshot id
  (split/merge steps) cannot survive a restart, so the journal keeps only entries above the newest structural step
  and marks itself truncated. A digest of all paragraph texts is stored (`lib/documents/recovery.ts`); history is
  reused only if the restored document has identical text, otherwise text is kept and history is reset.
- **Sheets:** snapshot payload is `engine.save()`. Undo/redo lives inside the WASM engine and is not part of the
  saved workbook, so history is not restored (`historyRestorable: false`). The selected sheet and cell are restored
  (`lib/sheets/recovery.ts` validates the view state).

## Lifecycle hooks (additive, for the lifecycle port)

`SessionCheckpointer` takes the lifecycle inputs as options and does not import the coordinator:

- `hasLease()` - wire the job scheduler's `hasLease(resourceId)`; a leased session is never disposed.
- `quiesce()` - wait for a transaction boundary (Documents waits for the edit queue).
- `prepareSuspend({pressure})` -> `{ok, historyLost, generation}` or a pin reason. Dirty sessions need a verified
  checkpoint of the current revision. If history would be lost it refuses unless `pressure` is set (edits are never
  given up, only undo history).
- `disposeIfSafe(dispose)` - last synchronous gate: rechecks revision and lease, bumps the generation, then runs `dispose`.
- `resume(restore, currentSourceFingerprint)` - one in-flight promise; throws `StaleGenerationError` if the session
  was suspended again meanwhile; reports `source-changed` instead of overwriting.
- `onPin(reason, detail)` - surface in Problems; heavy admission can be limited while pinned.

## Lifecycle manager integration and the beta.5 seam

In beta.4, `lifecycleAdapter.ts` imported `checksumParts` from `lib/lifecycle/checksum` and the adapter types from
`lib/lifecycle/types`, and each studio registered it through `registerLifecycleAdapter`. The Lifecycle subsystem is
not part of the beta.5 line, so the adapter now sits behind `lifecycleBridge.ts`:

- `LifecycleHost` declares what the package needs: a `checksum` function and `registerAdapter(studioId, hooks)`.
- The default host is a no-op: registration goes nowhere, and checksums fall back to `checksumPartsLocal`, which is
  byte-for-byte the FNV-1a algorithm of beta.4's `lib/lifecycle/checksum.ts`, so reference checksums stay comparable.
- `createRecoveryLifecycleAdapter(studioId)` returns plain hooks and works the same under any host: the lifecycle
  checkpoint is a **reference list** (session id, revision, snapshot checksum), never a second copy of the bytes.
- **TODO(lifecycle wiring):** when the Lifecycle subsystem lands on beta.5, call `setLifecycleHost()` once at app
  start with `checksumParts` and `registerLifecycleAdapter` from that package, then call
  `registerRecoveryLifecycleAdapter('documents'|'sheets')`. No other code changes are needed in this package.

Adapter semantics (unchanged from beta.4):

- `hasUnsavedChanges()` is true while a live session is dirty or the recovery store holds a snapshot for the studio
  (the synchronous `recoveryIndex.ts` mirrors commits, releases and discards). The manager therefore never evicts
  such a studio.
- `snapshot()` waits for teardown flushes, runs a checkpoint for each live dirty session, and returns `null`
  (refuse) if one fails. `pinReasons()` reports `checkpoint-pinned:<reason>` for pinned checkpointers.
- `suspend()` waits for flushes; engines belong to the views/sessions, whose teardown already flushed.
- `resume()` verifies the reference checksum and that every referenced snapshot still exists with the same checksum;
  otherwise it throws so the manager reports a failed resume. The real restore happens when the view mounts
  (`SessionCheckpointer.resume`).
- `resourceIds()` returns `studio:<id>` and `<id>:session:<name>` for job-lease lookups.

## Lifecycle of a recovery snapshot

1. Edit -> `noteEdit()` -> debounced verified checkpoint.
2. Session ends while dirty -> `flushOnTeardown` writes, verifies, then the engine is terminated.
3. Open of the same file name -> waits for any pending flush -> `resume()`; if the file bytes still match the
   snapshot's source fingerprint, the edited state is restored and the document is marked unsaved with a notice.
   Nothing is written to the file.
4. Source changed on disk -> snapshot kept, original opened, user told. No silent replacement.
5. Closing the media item (the user's explicit discard) deletes the snapshots. A saved copy releases them
   (`releaseAfterSave`).

## beta.5 wiring status

### Wired

| Where | What happens |
| --- | --- |
| `lib/documents/session.ts` | Every file session (`Entry`) owns a `SessionCheckpointer`. Each accepted edit, undo and redo bumps the store revision while the document is ready and edited, which is one checkpoint revision (`noteEdit`, debounced 1.5 s, at most 10 s). Switching away and back is not an edit. `capture()` runs `engine.save()` behind the edit queue and exports the undo journal plus a digest of all paragraph texts. |
| `switchDocument` (open) | Loads the file, fingerprints it, waits for a pending flush, then `resume()`s the newest verified snapshot of the same file. The snapshot bytes replace the file bytes, the document is marked edited, the undo journal is reused only when the paragraph digest matches (`recovered`) and otherwise dropped (`recoveredNoHistory`). A changed file opens as it is, the snapshot is kept and the user sees `recoverySourceChanged`. A restored session writes a new checkpoint of itself. Nothing is written to the file. |
| `evictExtra` | Before a dirty session past `MAX_LIVE_SESSIONS` loses its engine, a verified checkpoint is written (best effort). The existing in-memory `working` copy stays the fast path. |
| `discardDocument(key)` | The user's explicit close: stops checkpointing and deletes the snapshots. `discardDocument(key, {keepRecovery: true})` is used when the file was replaced (different `url`), when a live session is rebuilt and in tests that simulate a lost engine. |
| `lib/sheets/session.ts` | `acquireSheetsSession` builds the checkpointer once the file bytes are loaded (engines without `save`, such as test fakes, get none). `setSheetsDirty(name, true)` is the single edit hook: it bumps the revision and calls `noteEdit`. On open, a verified snapshot of the same file is opened instead of the file bytes, the selected sheet and cell are restored, the workbook is marked unsaved and the view shows `sheets.recovered`. |
| Saved copies (Sheets) | `noteSheetsSaveStart` before serializing and `sheetsSaved` after a native save: the dirty flag is cleared, and the snapshots released, only if no edit arrived in between. Edits typed while the save dialog was open keep the workbook dirty. |
| `endSheetsSession` / `releaseSheetsSession` | `endSheetsSession` (dead engine, replaced file, failed open) keeps the recovery copy. `releaseSheetsSession` is the media-close cleanup and deletes it. |
| Close guards | `sessionSafety/closeRisk.ts` + `documents/guards.ts` and `sheets/guards.ts` register a window-close guard with `registerCloseGuard`. Nothing dirty: no prompt. Dirty and every checkpoint current: "kept as a recovery copy, offered when you reopen the file". A stale or pinned checkpoint: "latest edits are not backed up yet and will be lost". Closing a single file keeps its existing discard confirm. |
| `tests/session-safety.spec.ts` | Unskipped. Both tests run against the real engines: the edit survives a studio switch, then (after the verified checkpoint landed) a lost session is simulated and the restored edit plus notice are checked. |
| Unit tests | `documents/session.recovery.test.ts`, `sheets/sessionRecovery.test.ts`, `sessionSafety/closeRisk.test.ts`. |

### Still open

| beta.4 hook | beta.5 location to wire |
| --- | --- |
| `registerLifecycleAdapter('documents'/'sheets', ...)` | `setLifecycleHost()` + `registerRecoveryLifecycleAdapter()` once the Lifecycle subsystem is ported (see above). Sessions already register with `registerActiveSession`, so the adapter sees them. |
| Settings > Performance "Clear saved studio checkpoints" button | `recoveryDataCount()`/`clearRecoveryData()` in `flush.ts` are ready; the settings UI belongs to the Lifecycle settings port. |

## Retention and clearing (encryption option 1)

- `RecoveryStore` enforces a 7-day TTL (by snapshot creation time) and a 256 MiB total cap (`DEFAULT_RETENTION`).
  A TTL sweep runs once per app start (`defaultRecoveryStore()`). Live sessions are never pruned or evicted.
- Before each commit the store makes room: it evicts whole other sessions, oldest snapshot first. If the new
  snapshot still does not fit it throws `StorageFullError`; the checkpointer pins the session with `storage-full`
  and the previous snapshot of that session stays.
- `recoveryDataCount()` and `clearRecoveryData()` implement the guarded delete (live views are kept). A recovery
  copy can be the only copy of unsaved edits, so callers must confirm with the user first.
- Still plain, local, unencrypted: see [session-safety-encryption.md](session-safety-encryption.md).

## Known limits

- `IndexedDbByteStore` has no unit tests (no IndexedDB in node); needs a browser/e2e run.
- The recovery store is unencrypted local storage (open decision in the concept).
- The Playwright spec (`tests/session-safety.spec.ts`) needs the built WASM engines and runs in CI; it simulates a lost engine by ending the session while keeping its recovery copy.
- A recovery copy of a file whose window was closed (not the file) stays until the next open of that name or the 7-day TTL. A session replaced by a different file with the same name keeps the old copy and reports `source-changed`; the first new checkpoints do not touch it, but older slots are pruned after two newer ones.
- Sheets: undo history is not restored (it lives inside the engine) and a typed-but-not-committed cell draft is not part of the checkpoint.
- Documents: "Save a copy" does not clear the edited flag in beta.5, so the recovery copy stays until the file is closed or the TTL passes.
- The unit tests exercise memory stores and injected clocks only; no real WASM engine, no native Tauri build.
- An uncommitted Sheets cell draft (typed but not Enter) is only part of the checkpoint when the view passes it in.
- Timeouts that kill an engine still lose it; the last debounced checkpoint is the recovery point.
