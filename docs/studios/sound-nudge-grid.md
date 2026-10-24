# Sound - Nudge buttons follow the grid (Stage J2)

The clip action row nudge buttons step by the active grid.

## What it does

- The left/right nudge buttons in the clip action row move the clip by the current grid step (0.1 s, beat or bar, per the grid selector and bpm), matching the arrow-key nudge from Stage I3. Left still clamps at 0.

## Files

- `src/components/sound/SoundArrange.tsx` - the two buttons.

## Test

- Rides on the tested `clip.set` command; covered by type check and manual/CI runs.
