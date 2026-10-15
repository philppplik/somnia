# Sound - Track duplicate (Stage E4)

Tracks can be duplicated in one undoable step.

## What it does

- New command `sound.arrange.track.duplicate` copies a track - name, gain, pan, mute/solo, rack and all clips - and inserts the copy right after the original.
- The copy and every copied clip get fresh ids, so repeated duplication never collides with the validator's global id uniqueness.
- The track header gained a duplicate button (glyph, with aria-label and tooltip).
- Undo removes the copy; errors (unknown track) leave the session untouched.

## Files

- `src/lib/sound/arrangeCommands.ts` - `track.duplicate`.
- `src/components/sound/SoundArrange.tsx` - header button.
- `src/locales/sound/*.json` - `sound.arrange.command.track.duplicate`, `cmd.sound.arrange.track.duplicate` and `sound.arrange.duplicateTrack` in all 5 locales.

## Test

- `arrangeCommands.test.ts` - copy placement and content identity, fresh ids under repeated duplication, error atomicity, two-step undo.
