# Sound: master volume automation

## What it does
The session carries a master gain curve (`masterCurve`) in session frames: `{at, db}` points, linear in dB, flat outside the outermost ones. It applies per sample after the master rack, so a curve can fade the whole song out. Sessions without a curve render unchanged.

## Schema
Session schema v14 adds `masterCurve: GainPoint[]` at the root; v13 sessions migrate with an empty curve. Validation mirrors the track curve: at most `ARRANGE_LIMITS.gainPoints` points, `at` within the timeline budget, `db` in -60..12, sorted and unique.

## Files
- `src/lib/sound/arrangement.ts` — `Arrangement.masterCurve`, migration v13 → v14, validator.
- `src/lib/sound/rackRender.ts` — applies the curve per sample after the master rack; range renders evaluate it at `range.start + i`.
- `src/lib/sound/mix.ts` — the legacy renderer refuses sessions with master automation, like active inserts: use the rack renderer.
- `src/lib/sound/analysisSource.ts` — single-track sessions (analysis, freeze, glue, stems) clear the master curve: they are pre-master renders.
- `src/lib/sound/arrangeCommands.ts` — `session.masterCurve {points}` replaces the curve, undoable.

## Test
`masterAutomation.test.ts` (3) covers migration and bounds, per-sample gain math including range offset and the legacy-renderer refusal, and pre-master single-track sessions; `arrangeCommands.test.ts` covers the command and undo. Full sound suite: 143 pass / 0 fail.

- `src/components/sound/SoundArrange.tsx` — an "A" toggle in the render row opens the master point list (same pattern as track and clip automation, including point retiming).

## Note
The master curve applies after the master rack; the mastering preview measures the rendered mix including the curve.
