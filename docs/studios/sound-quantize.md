# Sound - Quantize selection (Stage K2)

The Quantize button snaps the selected clips' starts to the active grid.

## What it does

- Command `clips.quantize` rounds every selected clip's start to the nearest multiple of the given grid step - the top bar passes the active grid (0.1 s, beat or bar, per the grid selector and bpm) - and clamps at 0.
- One atomic, undoable edit; an invalid grid or unknown clip rejects unchanged.

## Files

- `src/lib/sound/arrangeCommands.ts` - the command.
- `src/components/sound/SoundArrange.tsx` - top-bar button next to Normalize.
- `src/locales/sound/*.json` - label, hint and command keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - nearest-point snapping, clamping, grid validation, atomic rejection, undo.
