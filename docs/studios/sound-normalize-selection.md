# Sound - Normalize selection (Stage J4)

The Normalize button in the top bar normalizes every selected clip individually.

## What it does

- Command `clips.normalize` applies the same per-clip peak math as the single-clip normalize to the whole selection: each clip's gain moves so its own region peaks at the target (default 0 dBFS).
- Two-pass and atomic: a missing source waveform or a silent clip rejects the whole batch unchanged. The button is disabled until every selected clip's source peaks are ready.

## Files

- `src/lib/sound/arrangement.ts` - `normalizeSelection`.
- `src/lib/sound/arrangeCommands.ts` - command `clips.normalize`.
- `src/components/sound/SoundArrange.tsx` - top-bar button next to Glue.
- `src/locales/sound/*.json` - hint and command keys in all 5 locales.

## Test

- `normalize.test.ts` - per-clip gains, custom target, atomic rejections (missing peaks, silence), empty selection. The command is a thin wrapper; its rejection path mirrors the tested single-clip command.
