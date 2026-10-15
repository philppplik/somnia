# Sound - Clip mute (Stage E2)

Individual clips can now be muted, in addition to whole-track mute/solo.

## What it does

- The selected-clip action row gained a **Mute / Unmute** toggle (`clip.set` with `muted`). Muted clips render dimmed (45% opacity) in the Arrange view.
- `renderArrangement` skips muted clips, so the offline mix, range export, loop preview and the rack renderer (which delegates clip rendering to `renderArrangement`) all honor the flag.
- Track-level behavior is unchanged: missing media still fails loudly even when everything is muted.

## Schema v5

- `ArrangeClip` gained `muted: boolean`; `Arrangement.version` is now 5.
- Migration chain extended: v4 sessions validate by adding `muted: false` to every clip (v1 -> v2 -> v3 -> v4 -> v5, still chained in one pass).
- Strict v5 validation rejects clips without the flag; `clip.set` accepts an optional `muted` boolean.
- Split and duplicate keep the flag (both spread the clip).

## Files

- `src/lib/sound/arrangement.ts` - field, version, migration, validator, `newClip`.
- `src/lib/sound/mix.ts` - muted clips skipped.
- `src/lib/sound/arrangeCommands.ts` - `clip.set` handles `muted`.
- `src/components/sound/SoundArrange.tsx` - toggle button with `aria-pressed`, dimmed rendering.
- `src/locales/sound/*.json` - `sound.arrange.mute` / `sound.arrange.unmute` in all 5 locales.

## Test

- `clipMute.test.ts` - mix silence vs. signal, v4->v5 migration plus strict v5 rejection, split preserving the flag.
- Existing gain-curve migration test updated for the v5 chain.
