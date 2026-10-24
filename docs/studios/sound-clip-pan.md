# Sound - Clip pan (Stage E3)

Clips can now be panned individually, on top of the track pan.

## What it does

- The selected-clip fields row gained a **Clip pan** number input (-1 left, 0 center, 1 right, step 0.1); `clip.set` accepts `pan`.
- In the mix, the clip pan adds to the track pan and clamps to [-1, 1], so a clip can never exceed the stereo field. Mono sources use equal-power panning, stereo sources use balance - the same laws as the track pan.
- The rack renderer is unaffected structurally: it renders clips through `renderArrangement` with a neutral track pan, so clip pan is applied inside the clip render and track pan afterwards, exactly like the plain mix.

## Schema v6

- `ArrangeClip` gained `pan: number`; `Arrangement.version` is now 6.
- Migration chain extended: v5 sessions validate by adding `pan: 0` to every clip (v1 -> ... -> v6 in one pass).
- Strict v6 validation rejects clips without the flag; `newClip`, split and duplicate carry the neutral or copied value.

## Files

- `src/lib/sound/arrangement.ts` - field, version, migration, validator, `newClip`.
- `src/lib/sound/mix.ts` - combined, clamped pan.
- `src/lib/sound/arrangeCommands.ts` - `clip.set` handles `pan`.
- `src/components/sound/SoundArrange.tsx` - pan input.
- `src/locales/sound/*.json` - `sound.arrange.clipPan` in all 5 locales.

## Test

- `clipPan.test.ts` - equal-power behavior (center, hard left/right), additive clamping with the track pan, v5 -> v6 migration and strict rejection.
- Migration assertions in the existing clip-mute and gain-curve tests updated for v6.
