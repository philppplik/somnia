# Layers surfaces DS adoption (P32)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in the
raster editor and layers surfaces (8 across 3 files:
`phase1/src/components/RasterEditor.tsx`, `LayersPanel.tsx`,
`LayerContextMenu.tsx`) now render through the geometry-free native
control primitives (`NativeButton`, `NativeInput`, `NativeSelect`,
`Textarea` from `ui/native-controls`). Element-owner swap only; no
restyle, no behavior change. This covers the raster toolbar (format
select, quality slider), the inspector tab strip, the layers/opacity
controls, the design layers tree (filter input, drag label) and the
layer context menu items.

- Ratchet: all 3 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/LayersAdoption.test.tsx` (no-raw-
  control source scan per file). The existing design test suites are
  unmodified and passing.
- Browser coverage: `test/design-system/layers-adoption.spec.ts` drives
  the real raster toolbar and inspector on a decoded PNG via
  `?view=layers`, and the real design layers tree with a fabricated node
  set via `?view=layers-tree` (including the opened context menu), plus
  light/dark production-style screenshots. Before/after pixel comparison
  against the pre-migration tree is identical in both themes (the tree
  capture waits for the context-menu open animation to settle).
- The layer-mode opacity/mask controls behind `startLayered()` are
  covered by the source scan; the layer session needs the full editor
  host. Actual app E2E remains CI-only.
