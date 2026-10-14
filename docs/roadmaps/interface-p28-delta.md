# Interface P28 delta — prototype/flow polish

Base: P27 commit (stacked; P27 not yet upstream at build time). Scope check first: back-navigation (Back button, Alt+Left, history) and the per-link transition select (instant/dissolve/slide/push/smart-animate with duration, easing, direction) already existed and were kept. Two genuine gaps were built:

1. **Transition presets per link** (`src/lib/interface/transitionPresets.ts`): one-click preset buttons (Instant / Dissolve / Slide) in the interaction inspector apply a full kind+duration+easing tuple in one undo step. Instant clears the transition; Dissolve sets 200 ms ease; Slide sets 300 ms ease-out from the left. Unknown layers and missing links throw; presets survive the snapshot roundtrip.
2. **Hotspot highlight toggle in the preview player**: a DS Checkbox in the player header ("Highlight hotspots", 5 locales) switches hotspot rects between invisible and accent fill/stroke. Player-local state only — no document, history, or recovery-snapshot writes.

**Bug found via the highlight:** the DS Button default size (`h-9`) forced every hotspot `<rect>` to 36 px tall, so pointer hit areas covered only a strip of each linked layer (keyboard activation was unaffected, which is why earlier specs missed it). Hotspot geometry is now applied imperatively (`el.style` in `useLayoutEffect`, the file's established pattern), so hit areas and the highlight match the layer bounds. The CI spec asserts hit-area height.

Tests: 316 focused tests green (+5: 4 preset lib tests, 1 EN/DE render test). Gates: check:ds, check:ui-commands, check:commands, check:layers all pass. CI-only spec `Interface P28 transition presets apply one undo each and hotspot highlight stays ephemeral` added; acceptance paragraph P28 added. Light/dark screenshots inspected (whole-frame and child hotspots verified against layer bounds).
