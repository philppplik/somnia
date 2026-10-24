# Animation P8: expression-free keyframe modifiers (wiggle and loop)

## Roadmap delta

- Properties carry a bounded, serialised modifier list (`Property.modifiers`). Two expression-free modifiers ship: `wiggle` (deterministic seeded value noise added per channel after evaluation; amplitude and frequency bounded) and `loop` (repeats the keyed range as `cycle`, `pingpong` or `offset`, the last accumulating the keyed delta per cycle). Modifiers stack in order.
- Evaluation lives in `modifiers.ts` (`evaluateMod`, `loopTime`); `scene.ts` applies it to the transform and opacity reads, so preview, PNG/GIF/APNG/WebM exports and the timeline all show the same values. `evaluate` stays pure for editing surfaces (graph editor, key inspection).
- New undoable edits `modifier.add` / `modifier.remove` with full validation (seed integer 0..2^31-1, amplitude 0..10000, frequency 0..100 Hz, loop modes enumerated); `validateDocument` checks stored modifiers, so corrupt snapshots are refused. New commands `animation.modifier.add` and `animation.modifier.remove`, titled in all five locales. No new dependencies, no UI surface changes.

## Limits and non-claims

- Wiggle is single-octave value noise (smoothstep lattice), not Perlin; it is a stylistic jitter, not a physics sim. Loop applies to the whole keyed range only - no partial loops, no loop on unkeyed properties (no-op there). Offset looping accumulates the first-to-last delta, matching the common cycle-with-progress idiom.
- Not in this slice (reported honestly): parent pick-whipping in the timeline UI and per-character text animators. Parenting itself (null-object rigs, keep-world) landed in P6 and is unchanged.
- Full-app, native-shell and WASM gates remain CI-only.

## Validation

- 6 new unit tests (`src/lib/animation/animation-p8.test.ts`): wiggle determinism per seed, amplitude bound, per-channel independence, stacking; loop cycle/pingpong/offset semantics against exact values; no-op without keys and purity of `evaluate`; edit validation, missing-index refusal, undo, JSON round trip and `validateDocument` refusal of a bad seed; `validateModifiers` field bounds. 121 animation tests pass, i18n 28/28, tsc clean, check:ui-commands 301 in sync.
- `check:ds`: the current upstream tip (64624fb) is already red on `src/components/interface.inlineStyle: 16 -> 17` (3D bones commit, outside the animation area; reproduced on a pristine worktree of origin/int/beta5). This slice adds no new design-system debt and touches no component files.
