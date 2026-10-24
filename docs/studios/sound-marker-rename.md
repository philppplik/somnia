# Sound - Marker rename (Stage F5)

Markers can be renamed in place instead of delete-and-recreate.

## What it does

- New command `sound.arrange.marker.set {id, name}` renames a marker atomically; empty names and unknown ids are rejected with the session untouched (the validator enforces trimmed, non-empty names).
- The marker chips in the transport row are now an inline name input plus a separate delete button.

## Files

- `src/lib/sound/arrangeCommands.ts` - `marker.set`.
- `src/components/sound/SoundArrange.tsx` - editable marker chips.
- `src/locales/sound/*.json` - command, catalog and label keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - rename, rejection of empty names and unknown ids, undo restore.
