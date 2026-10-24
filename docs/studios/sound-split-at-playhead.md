# Sound - Split all clips at the playhead (Stage F4)

One command splits every clip under the playhead across all tracks.

## What it does

- New command `sound.arrange.session.splitAt {frame}` runs the existing split (source position, gain, fades and gain-curve re-basing included) on every clip containing the frame, in a single undoable edit.
- With no clip under the frame the command fails atomically - no half-split session.
- The transport row gained a Split-all button that is disabled when the playhead is over empty space.

## Files

- `src/lib/sound/arrangeCommands.ts` - `session.splitAt`.
- `src/components/sound/SoundArrange.tsx` - button.
- `src/locales/sound/*.json` - command, catalog and label/hint keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - multi-track split geometry (clips before the playhead keep their tail, later clips untouched), atomic failure on empty space, single-undo restore.
