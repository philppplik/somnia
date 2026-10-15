# Sound - Cut range (Stage I5)

Cut range removes the selected output range on every track and closes the gap.

## What it does

- With an output range selected, the Cut range button (command `session.cutRange`) splits clips crossing either boundary (the split fade/gain-curve rules apply: clean cut edges, re-based curves), removes everything inside the range and shifts all later clips left by the cut length.
- Markers inside the range are removed; later markers shift with the timeline. A loop fully after the range shifts too; a loop intersecting the cut is cleared.
- One atomic, undoable edit across all tracks. The button is disabled without a selected range; the command validates the range against the current session length.

## Files

- `src/lib/sound/arrangement.ts` - `cutSessionRange`.
- `src/lib/sound/arrangeCommands.ts` - command `session.cutRange`.
- `src/components/sound/SoundArrange.tsx` - the button next to Split all.
- `src/locales/sound/*.json` - label, hint and command keys in all 5 locales.

## Test

- `cutRange.test.ts` - boundary splits, offsets, fades, curves, markers, loop, rejections.
- `arrangeCommands.test.ts` - cross-track cut, stale-range rejection, undo.
