# Sound - Trim to playhead (Stage H5)

Two clip actions trim a clip's start or end to the playhead.

## What it does

- "Trim start to playhead" cuts everything before the playhead - the source offset follows, so the material at the playhead stays untouched.
- "Trim end to playhead" cuts everything after the playhead.
- Both follow the split rule: the cut edge is clean (fade-in or fade-out reset to 0), the fade on the other end clamps to the new length, and the gain curve re-bases with the interpolated level at the cut frame.
- The buttons are disabled unless the playhead sits strictly inside the clip.

## Files

- `src/lib/sound/arrangement.ts` - `trimStartPatch` / `trimEndPatch` field patches.
- `src/components/sound/SoundArrange.tsx` - the two clip actions, applied through the undoable `clip.set` command.
- `src/locales/sound/*.json` - labels and hints in all 5 locales.

## Test

- `trim.test.ts` - offset math, clean cut edges, fade clamps, curve re-basing, rejection outside the clip.
