# Sound: clip playback rate (tape-style time stretch)

## What it does
Every clip has a playback `rate` from 0.25 to 4 (default 1). The clip reads its source faster or slower while its length on the timeline stays unchanged: at 2x a 5-second clip plays the first 10 seconds of its source. This is tape-style: pitch shifts with the rate (2x is one octave up, 0.5x one octave down) - there is no pitch preservation. Fades, the gain curve and slip stay in clip-local frames. Rendering uses the same linear interpolation as the rest of the mixer.

## Schema
Session schema v12 adds `rate: number` to `ArrangeClip`; v11 sessions migrate with `rate: 1`. Validation enforces 0.25..4 and stretches the source-bounds check: a clip may use at most `offset + length * rate` source frames.

## Files
- `src/lib/sound/arrangement.ts` — `ArrangeClip.rate`, migration v11 → v12, validator, and rate-aware `trimStartPatch` / `splitArrangeClip` (offset follows the cut at the clip rate) and `clipRegionPeak` (normalize measures the stretched region).
- `src/lib/sound/mix.ts` — the single clip read site: `pos = (clip.offset + local * clip.rate) * sampleRate / 48000`. The rack renderer delegates clip rendering here, so rate applies everywhere (mix, freeze, glue, stems, analysis).
- `src/lib/sound/arrangeCommands.ts` — `clip.set` accepts `rate`.

## Test
`clipRate.test.ts` (4) covers migration and validation bounds, the tape-style read math, rate-aware trim/split offsets, and the stretched normalize region. Full sound suite: 135 pass / 0 fail.

## Note
Freeze, glue, bounce and reverse bake the current rate into their new media item (the new clip is rate 1). Rate editing UI is a separate slice.
