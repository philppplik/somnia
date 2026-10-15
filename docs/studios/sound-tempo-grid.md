# Sound - Tempo and beat grid (Stage G1)

The Arrange view now speaks beats: session tempo, beat/bar grid lines and musical snapping.

## What it does

- The session gained `bpm` (20..300, default 120). The transport row has a BPM input (command `sound.arrange.session.setBpm`, rounded to 0.1, out-of-range rejected atomically).
- Track lanes draw beat lines every beat and stronger bar lines every 4 beats, replacing the decorative 10% stripes. When beats get denser than 1% of the view the render degrades honestly: bars only, then the old stripes.
- A new Grid select (0.1 s / Beat / Bar) next to Snap chooses the snapping grid for clip drags; magnetic snapping to edges and markers (Stage E1) still wins inside its 8 px attraction range.
- The mix itself is tempo-agnostic; bpm only drives grid and snapping.

## Schema v8

- `Arrangement.version` is now 8; migration v7 -> v8 adds `bpm: 120` (neutral), strict v8 requires the field.
- Existing migration tests now drop `bpm` from their simulated legacy fixtures, matching what old files really contain.

## Files

- `src/lib/sound/arrangement.ts` - field, version, migration, validator.
- `src/lib/sound/arrangeCommands.ts` - `session.setBpm`.
- `src/components/sound/SoundArrange.tsx` - BPM input, grid select, beat/bar lane background, grid-aware drag snap.
- `src/locales/sound/*.json` - grid/bpm/command keys in all 5 locales.

## Test

- `tempo.test.ts` - v7 -> v8 migration and strict rejection, beat-frame math and beat snapping, setBpm rounding/range/undo.
