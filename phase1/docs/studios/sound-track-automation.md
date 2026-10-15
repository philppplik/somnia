# Sound: track volume and pan automation

## What it does
Every arrange track carries a gain automation curve (`gainCurve`) in addition to its fader (`gainDb`), and a pan automation curve (`panCurve`) in addition to its static pan. Points are `{at, db}` / `{at, pan}` pairs in session frames; the rendered track gain is `10 ** ((gainDb + curveDbAt) / 20)` per sample, linear in dB between points and flat outside the outermost ones. Pan automation is added to the static pan per sample and clamped to -1..1. Tracks without automation render through the original constant-gain fast path.

## Schema
Session schema v10 adds `gainCurve: GainPoint[]` to `ArrangeTrack`, v11 adds `panCurve: PanPoint[]`. v9 and v10 sessions migrate by appending empty curves to every track. Validation enforces the shared limits: at most `ARRANGE_LIMITS.gainPoints` points per track and curve, `at` within the timeline budget, `db` in -60..12, `pan` in -1..1, sorted and unique.

## Files
- `src/lib/sound/arrangement.ts` — `ArrangeTrack.gainCurve`/`panCurve`, generic `curveDbAt(points, at)` (the clip-level `gainCurveAt` now delegates to it) and `curvePanAt`, migrations v9 → v10 → v11, validator track-curve checks.
- `src/lib/sound/rackRender.ts` — applies both curves per sample in session frames; range renders evaluate them at `range.start + i`.
- `src/lib/sound/arrangeCommands.ts` — `track.curve {id, points}` and `track.panCurve {id, points}` replace a track's automation, undoable like every arrange edit.
- `src/components/sound/SoundArrange.tsx` — the "A" button in each mixer track row opens a point list for that track (same pattern as clip automation): a level/pan switch picks the curve, then add a point at the playhead, edit each point's value and time, delete points.

## Test
`trackAutomation.test.ts` (6) covers round-trip and v9/v10 migrations, per-sample gain and pan math including range offset and stereo clamping, and curve bounds; `arrangeCommands.test.ts` covers both commands and undo. Full sound suite: 131 pass / 0 fail.

## Note
Freeze and glue render with the track curves neutralized (`gainCurve: []`, `panCurve: []` in their single-track sessions) so automation stays live on the track and is never baked twice; stems keep the curves so they still sum to the mix.
