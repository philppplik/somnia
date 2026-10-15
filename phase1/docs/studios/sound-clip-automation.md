# Sound: clip pan automation

## What it does
Clips automate pan with a `panCurve` next to the existing gain curve. Points are `{at, pan}` pairs in clip-local frames; per sample the automated value is added to the static clip pan and track pan, clamped to -1..1. Stereo clips use balance panning, mono clips equal-power, matching the static clip pan. Clips without a pan curve render through the constant-pan fast path.

## Schema
Session schema v13 adds `panCurve: PanPoint[]` to `ArrangeClip`; v12 sessions migrate with an empty curve. Validation mirrors the clip gain curve: at most `ARRANGE_LIMITS.gainPoints` points, `at` within the clip, `pan` in -1..1, sorted and unique. Trim start/end and split re-base the pan curve exactly like the gain curve (cut edge carries the interpolated pan).

## Files
- `src/lib/sound/arrangement.ts` — `ArrangeClip.panCurve`, migration v12 → v13, validator, re-basing in `trimStartPatch` / `trimEndPatch` / `splitArrangeClip`.
- `src/lib/sound/mix.ts` — per-sample pan factors when a curve exists (shared `panFactors` helper for the stereo/mono rule).
- `src/lib/sound/arrangeCommands.ts` — `clip.panCurve {id, points}` replaces a clip's pan automation, undoable.
- `src/components/sound/SoundArrange.tsx` — the clip curve editor has a level/pan switch (same pattern as the track automation panel): add at playhead, edit value and time, delete points.

## Point retiming
All five point lists (clip gain/pan, track gain/pan, master) edit a point's time via `retimeCurvePoint`: clamped to the curve's span, re-sorted, landing on an existing point rejected. `curveRetime.test.ts` (2).

## Test
`clipPanCurve.test.ts` (3) covers migration and bounds, per-sample stereo-balance and mono equal-power math, and trim/split re-basing; `arrangeCommands.test.ts` covers the command and undo. Full sound suite: 139 pass / 0 fail.

## Note
Glue, freeze, bounce and reverse bake clip curves into their new media like every other clip-level setting. Editing UI follows the same level/pan switch pattern as the track automation panel.
