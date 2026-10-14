# Animation studio, phase P0

Implements phase P0 of `docs/concepts/animation-studio.md`: a pure-data `StudioDef` (id `animation`), a versioned composition document with keyframes, one undo owner, session recovery and a minimal timeline UI. Nothing here claims a file format, an engine or a render path.

## What exists

- `phase1/src/lib/animation/`: `time.ts` (integer ticks, 240000 per second), `model.ts` (document, composition, layer, property, key, strict validation), `interpolate.ts` (hold, linear, temporal cubic Bezier, vec2), `edit.ts` (typed edits, pure reducer, locked layers, cycle and collision checks), `scene.ts` (parent matrices, solo, visibility, timing), `session.ts` (history of 200, drag preview commit once or cancel, view state kept apart from the document), `recovery.ts` (journal with validation), `commands.ts` (`animation.*` command specs).
- `phase1/src/lib/studios/animation.ts`: manifest with left Files and Compositions panels, right inspector (properties, composition, render setup), header hero `Render...` = `animation.render.open`. The hero opens output setup only and never exports.
- `phase1/src/components/animation/`: canvas (viewer plus timeline with scrub, frame step, play, key diamonds with drag, Escape cancels), panels, shell registration and a blank-project factory.
- Strings in `phase1/src/locales/animation/` for en, de, es, fr, pt-BR.

## Deliberately not in P0

- File claims, `.somnia` entry schema, save to disk (open decision in the concept). Recovery uses the browser journal only.
- Footage, raster, precomp layers, masks, effects, expressions, tracking, graph editor, render and export.
- No global studio shortcut (the shortcut inventory has not been checked). Studio `order` is 11 so existing studio shortcuts keep their numbers.
- No EffectCraft code and no new dependencies.

## Tests

`npm run test:core` includes `src/lib/animation/*.test.ts`. App E2E `phase1/tests/animation-p0.spec.ts` is CI-only.
