# Sound - Ripple delete (Stage I2)

Shift+Delete removes the selected clips and closes the gaps they leave.

## What it does

- Delete/Backspace still removes clips and leaves a hole. With Shift held, the new `clips.rippleDelete` command removes the clips and shifts every later clip on the same track left by the total deleted length that fully precedes it.
- Only the owning tracks change: other tracks, markers and the session length stay untouched.
- One undoable, atomic edit for any selection size.

## Files

- `src/lib/sound/arrangement.ts` - `rippleDeleteClips`.
- `src/lib/sound/arrangeCommands.ts` - command `clips.rippleDelete`.
- `src/components/sound/SoundArrange.tsx` - Shift modifier in the Delete handler.
- `src/locales/sound/*.json` - command and catalog keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - per-track gap closing with several deleted clips, other tracks untouched, atomic rejection, undo.
