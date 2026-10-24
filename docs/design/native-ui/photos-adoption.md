# Photos area DS adoption (P29)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/photos/` (6 across 6 files: DevelopPanel,
PhotoExportPopover, PhotosInspector, panels/HistoryPanel,
panels/PresetsPanel, panels/shared) now render through the
geometry-free native control primitives (`NativeButton`, `NativeInput`,
`NativeSelect`, `Textarea` from `ui/native-controls`). Element-owner swap
only; no restyle, no behavior change. The remaining photos files (canvas,
workspace, panels without form controls) already had zero raw controls.

- Ratchet: all 6 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/PhotosAdoption.test.tsx` (no-raw-control
  source scan per file). The existing `lib/photos/*.test.ts` and
  `components/photos/panels/panels.test.tsx` are unmodified and passing
  (76 tests).
- Browser coverage: `test/design-system/photos-adoption.spec.ts` drives
  the real photos inspector, history panel, presets panel and export
  popover on a stubbed-engine session via the `?view=photos` gallery
  route, plus light/dark production-style screenshots. Before/after pixel
  comparison against the pre-migration tree is identical in both themes.
- Actual app photos E2E remains CI-only.
