# Sound - Split at markers (Stage J5)

Split at markers cuts every clip at every marker in one edit.

## What it does

- The button (command `session.splitAtMarkers`) splits every clip that strictly contains a marker frame, for all markers in order, across all tracks - the usual split rules apply (clean cut edges, gain curves re-based).
- Several markers inside one clip produce several pieces; a marker exactly on a clip edge splits nothing.
- One atomic, undoable edit. The command rejects with no markers or when no marker sits inside any clip, leaving the session unchanged.

## Files

- `src/lib/sound/arrangeCommands.ts` - the command.
- `src/components/sound/SoundArrange.tsx` - top-bar button next to Split all.
- `src/locales/sound/*.json` - label, hint and command keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - multi-marker splits with offsets, edge markers, undo, both rejection paths.
