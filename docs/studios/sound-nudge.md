# Sound - Clip nudge (Stage E5)

Clips can be moved in fixed 0.1 s steps without dragging.

## What it does

- The selected-clip action row gained left/right nudge buttons; the left one disables at the session start.
- A focused clip also responds to ArrowLeft / ArrowRight with the same step (stopPropagation, so fade-handle keys and the global shortcuts are untouched).
- Both paths call `clip.set`; the validator rejects negative starts atomically, and the UI clamps to zero anyway.

## Files

- `src/components/sound/SoundArrange.tsx` - buttons and clip key handling.
- `src/locales/sound/*.json` - `sound.arrange.nudgeLeft` / `sound.arrange.nudgeRight` in all 5 locales.

## Test

- `arrangeCommands.test.ts` - negative starts are rejected atomically and the position is preserved.
