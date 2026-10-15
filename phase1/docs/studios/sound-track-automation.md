# Sound: track volume automation

## What it does
Every arrange track carries a gain automation curve (`gainCurve`) in addition to its fader (`gainDb`). Points are `{at, db}` pairs in session frames; the rendered track gain is `10 ** ((gainDb + curveDbAt) / 20)` per sample, linear in dB between points and flat outside the outermost ones. Tracks without automation render through the original constant-gain fast path.

## Schema
Session schema v10 adds `gainCurve: GainPoint[]` to `ArrangeTrack`. v9 sessions migrate by appending an empty curve to every track. Validation enforces the shared limits: at most `ARRANGE_LIMITS.gainPoints` points per track, `at` within the timeline budget, `db` in -60..12, sorted and unique.

## Files
- `src/lib/sound/arrangement.ts` — `ArrangeTrack.gainCurve`, generic `curveDbAt(points, at)` (the clip-level `gainCurveAt` now delegates to it), migration v9 → v10, validator track-curve checks.
- `src/lib/sound/rackRender.ts` — applies the curve per sample in session frames; range renders evaluate the curve at `range.start + i`.
- `src/lib/sound/arrangeCommands.ts` — `track.curve {id, points}` replaces a track's automation, undoable like every arrange edit.
- `src/components/sound/SoundArrange.tsx` — the "A" button in each mixer track row opens a point list for that track (same pattern as clip automation): add a point at the playhead, edit each point's dB, delete points.

## Test
`trackAutomation.test.ts` (3) covers round-trip and v9 migration, per-sample gain math including range offset, and curve bounds; `arrangeCommands.test.ts` covers the command and undo. Full sound suite: 122 pass / 0 fail.

## Note
Pan stays a static per-track value; automating it is deliberately out of scope for now.
