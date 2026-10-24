# Imageedit area DS adoption (P30)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/imageedit/` (7 across 3 files: AdjustPanel,
FilterPanel, ImageHistory) now render through the geometry-free native
control primitives (`NativeButton`, `NativeInput`, `NativeSelect`,
`Textarea` from `ui/native-controls`). Element-owner swap only; no
restyle, no behavior change. This covers the adjustments panel (sliders,
curves, reset), the filter preset panel (strength slider, reset) and the
history timeline (jump/toggle/remove buttons).

- Ratchet: all 3 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/ImageeditAdoption.test.tsx` (no-raw-
  control source scan per file). The existing imageedit test suites
  (82 tests across components and lib) are passing; one assertion in
  `FilterPanel.test.tsx` was made attribute-order tolerant
  (`<button\b[^>]*type="button"[^>]*disabled=""`) because the native
  primitives render `data-slot` first - the assertion still requires a
  disabled `type="button"` button.
- Browser coverage: `test/design-system/imageedit-adoption.spec.ts`
  drives the real panels with plain props via the `?view=imageedit`
  gallery route, plus light/dark production-style screenshots.
  Before/after pixel comparison against the pre-migration tree is
  identical in both themes.
- Actual app imageedit E2E remains CI-only.
