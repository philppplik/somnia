# Sound - Fade shapes (Stage E6)

Clip fades can now follow a linear or an equal-power curve.

## What it does

- `ArrangeClip` gained `fadeShape: 'linear' | 'equalPower'`, applied to both fade-in and fade-out.
- The selected-clip fields row has a fade curve select; `clip.set` accepts `fadeShape` and rejects unknown values.
- New pure helper `fadeShapeAt(shape, x)` shapes a normalized fade position: linear is `x`, equal-power is `sin(x * pi/2)` (clamped), so equal-power crossfades keep constant power. The mix envelope uses it for both fade ends; the gain-curve automation is unchanged and multiplies on top.

## Schema v7

- `Arrangement.version` is now 7; the migration chain gained v6 -> v7 adding `fadeShape: 'linear'` to every clip, preserving the historical sound exactly.
- Strict v7 validation rejects missing or unknown shapes.

## Files

- `src/lib/sound/arrangement.ts` - field, version, migration, validator, `newClip`, `fadeShapeAt`.
- `src/lib/sound/mix.ts` - envelope shaping.
- `src/lib/sound/arrangeCommands.ts` - `clip.set` handles `fadeShape`.
- `src/components/sound/SoundArrange.tsx` - select.
- `src/locales/sound/*.json` - `sound.arrange.fadeShape` / `fadeLinear` / `fadeEqualPower` in all 5 locales.

## Test

- `fadeShape.test.ts` - sine law and clamping, mix levels at fade midpoint (linear -6 dB vs equal-power -3 dB) and unity at the fade end, v6 -> v7 migration, unknown-shape rejection.
