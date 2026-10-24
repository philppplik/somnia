# Sound - Auto crossfade (Stage F1)

Overlapping clips on one track can be crossfaded in one undoable step.

## What it does

- New pure helpers in `arrangement.ts`: `findCrossfadePair(session, clipId)` finds a staggered overlap (the earlier clip ends strictly inside the later one) and `applyCrossfade` sets complementary equal-power fades over exactly the overlap: `fadeOut` on the earlier clip, `fadeIn` on the later one.
- New command `sound.arrange.clip.crossfade`; the selected-clip action row shows a Crossfade button that is disabled when no staggered overlap exists (tooltip explains the behavior).
- Containment (one clip fully inside another) and merely touching clips return no pair - there is no honest crossfade region, and the command fails atomically.
- The mix follows the existing sine-law equal-power fades: -3 dB per side mid-overlap, constant power for the pair.

## Files

- `src/lib/sound/arrangement.ts` - `findCrossfadePair`, `applyCrossfade`.
- `src/lib/sound/arrangeCommands.ts` - `clip.crossfade`.
- `src/components/sound/SoundArrange.tsx` - button with disabled state and tooltip.
- `src/locales/sound/*.json` - command, catalog and label/hint keys in all 5 locales.

## Test

- `crossfade.test.ts` - pair detection edge cases (staggered, containment, touching, separate), fade placement and mix levels around the overlap, command atomicity and undo.
