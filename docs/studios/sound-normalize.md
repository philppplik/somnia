# Sound - Clip normalize (Stage F2)

One-click gain staging: a clip's gain is set so its used region peaks at 0 dBFS.

## What it does

- New pure helpers in `arrangement.ts`: `clipRegionPeak(peaks, offset, length, totalFrames)` reads the clip's used source region from the cached min/max waveform columns (the same peaks the Arrange view draws), and `normalizeGainDb(peak, targetDb)` returns the gain that brings the peak to the target - rounded to 0.1 dB, clamped to the clip gain range (-60..+12 dB), and rejecting silent regions instead of blasting gain into noise.
- New command `sound.arrange.clip.normalize` (optional `targetDb`, default 0). It uses the already-computed source waveform peaks, so no extra decoding pass runs.
- The selected-clip action row shows a Normalize button, disabled while the source peaks are not available yet (tooltip explains).

## Files

- `src/lib/sound/arrangement.ts` - `clipRegionPeak`, `normalizeGainDb`.
- `src/lib/sound/arrangeCommands.ts` - `clip.normalize`.
- `src/components/sound/SoundArrange.tsx` - button.
- `src/locales/sound/*.json` - command, catalog and label/hint keys in all 5 locales.

## Test

- `normalize.test.ts` - region peak reads only the used columns, gain math (target hit, +12 dB clamp, log-law reduction, silence rejection), and the command's atomic failure while peaks are missing.
- The peaks-missing path is covered at command level; the happy path is pure-math covered and uses the same peaks the UI already trusts.
