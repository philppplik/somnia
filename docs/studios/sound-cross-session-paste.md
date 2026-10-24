# Sound - Cross-session paste (Stage K4)

Paste works across sessions: a copied clip brings its source back.

## What it does

- Copy now stores the full source reference alongside the clip. When a paste lands in a session that lost the source (new or loaded session), the media item is reopened from the library, verified against the copied reference (frames, rate, channels) and uploaded under the original id - the pasted clip renders without a relink round-trip.
- If the media item is gone or its audio changed since the copy, the paste fails with a clear error and changes nothing.
- Same-session paste behaves exactly as before; both paths stay one undoable edit.

## Files

- `src/lib/sound/arrangement.ts` - `ClipBoardEntry` and `restorePaste` (track lookup first, atomic rejection).
- `src/lib/sound/arrangeStore.ts` - `ensureClipboardSource`.
- `src/lib/sound/arrangeCommands.ts` - copy stores the source; paste restores it when needed.

## Test

- `pasteRestore.test.ts` - source restore, no duplicates, explicit target track, atomic rejection. The media-library reopen and worker upload follow the reverse/bounce path (CI/device).
