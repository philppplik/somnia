# Imgedit area DS adoption (P31)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/imgedit/` (13 across 2 files: TransformPanel,
SelectionEditor) now render through the geometry-free native control
primitives (`NativeButton`, `NativeInput`, `NativeSelect`, `Textarea`
from `ui/native-controls`). Element-owner swap only; no restyle, no
behavior change. This covers crop/straighten (aspect select, rect inputs,
apply), resize (dimensions, quality), rotate/flip (angle slider, grow
canvas) and the selection editor (tool/mode selects, copy/cut/fill,
alpha). SelectionOverlay and the canvases have no form controls.

- Ratchet: both file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/ImgeditAdoption.test.tsx` (no-raw-
  control source scan per file). The existing imgedit test suites
  (49 tests across components and lib) are unmodified and passing.
- Browser coverage: `test/design-system/imgedit-adoption.spec.ts` drives
  the real panels with plain props via the `?view=imgedit` gallery route,
  plus light/dark production-style screenshots. Before/after pixel
  comparison against the pre-migration tree is identical in both themes
  (the selection marching-ants overlay animates, so a stale capture can
  differ by one animation phase; re-capture is identical).
- Actual app image-editor E2E remains CI-only.
