# Documents and Sheets retention audit

Audited baseline: `0b0b641` (`origin/int/shell`, 2026-10-13).
Scope: phase 0. No retention fix or safe suspension claim is included here.

## Evidence

| Owner | Accepted edits / history | View cleanup / next mount | Result |
| --- | --- | --- | --- |
| Documents canvas | `session.ts` owns a single engine reference and `UndoStack`; `apply` sets `edited`. Structural history entries use engine-local numeric snapshot handles. | `DocumentsCanvas` disposes the worker on cleanup. The next effect fetches `item.url`, opens original bytes and calls `attachEngine`. `attachEngine` clears history and edited. | Source-backed loss path; deterministic session-double test proves reset on reattachment, not a real WASM remount. |
| Documents UI | Store is module-global, not keyed by document ID. Paragraph field draft is local React state until blur. | Tab change opens another engine; global blocks/history are replaced. Cleanup leaves the module reference pointing to a disposed worker until next attachment. | Per-document ownership and accepted-transaction boundaries are required. |
| Sheets canvas | Worker owns edited workbook and engine history. Local React state owns dirty, draft, sheet, selection, revision. `original` is input bytes, not an edited checkpoint. | Cleanup disposes worker. Dirty effect cleanup calls `setSheetsDirty(item.name,false)`. Mount opens original URL. | Unsaved state has no independent owner. Global dirty set is only a guard, not workbook recovery. |
| Host router | `StudioCanvas` selects a different React host type. | Changing studios unmounts the old host. Media URL changes also run engine effect cleanup. | Studio and tab transitions both need tests. |

## Repeatable characterization

From `phase1`:

```
npx tsx --test test/performance/retention-audit.test.ts
```

Four tests ran on this baseline: accepted Documents edit with undo/redo control,
reattachment reset witness, Documents cleanup source assertion, Sheets cleanup/dirty
witness. These tests intentionally document the unsafe old behavior. They must not
be counted as a zero-data-loss gate. When session ownership changes, replace the
hazard assertions with positive retention invariants rather than preserving the bug.
The document double uses the real session/edit code but no WASM and no React mount.

## Required real-runtime safety gate

The separate Playwright retention spec requires actual built engine artifacts and
asserts the desired behavior without expected failures or mocks. Until that gate runs
and passes, pin dirty Documents/Sheets sessions and do not dispose their engines for
resource savings. A green source characterization is not permission to evict.

Checks must cover accepted UTF-8 text/cell edits, dirty guards while hidden, remount,
undo then redo, a second tab with a distinct file, export/reopen of edited bytes, and
uncommitted drafts with a defined transaction boundary. Current export bytes alone
are insufficient proof of structural undo retention: Documents snapshot IDs are
worker-local and Sheets undo lives in the engine.

## Remaining unverified

- Real React studio/tab switch behavior with Documents and Sheets WASM.
- Native save/recovery, worker crash, interrupted transaction, quota/disk-full.
- Caret/selection/viewport restoration and duplicate filename identity.
- Portable history serialization and source/recovery conflict handling.

No native test or cargo build was run. The checkout contains declarations but lacks
compiled engine JS/WASM; installing npm dependencies does not supply those artifacts.
