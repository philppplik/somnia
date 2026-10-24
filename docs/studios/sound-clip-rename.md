# Sound - Clip rename (Stage I4, schema v9)

Clips carry their own name; empty falls back to the source name.

## What it does

- The clip action row starts with a name field: type to rename, clear to fall back to the source name. The clip block in the lane shows the name when set.
- The name rides on `clip.set` like the other clip properties, one undoable edit per change, and is copied by duplicate, split, copy/paste.
- Arrangement schema moves to version 9: sessions from version 8 migrate by adding an empty name to every clip.

## Schema

- `ArrangeClip.name: string` (max 160 chars, no control characters, may be empty).

## Files

- `src/lib/sound/arrangement.ts` - field, migration v8 to v9, validator.
- `src/lib/sound/arrangeCommands.ts` - `clip.set` accepts `name`.
- `src/components/sound/SoundArrange.tsx` - name input and display.
- `src/locales/sound/*.json` - field label in all 5 locales.

## Test

- `clipName.test.ts` - default, round-trip, control-character and length rejection, v8 migration.
- `arrangeCommands.test.ts` - rename and clear through the command, undo.
- Legacy migration fixtures bumped to version 9.
