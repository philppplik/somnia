# Svgedit area DS adoption (P25)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/svgedit/` (34 across 6 files: GradientEditor,
SnapPanel, SvgEditor, SvgInspector, SvgOptionsBar, SvgSidebar) now render
through the geometry-free native control primitives (`NativeButton`,
`NativeInput`, `NativeSelect`, `Textarea` from `ui/native-controls`).
Element-owner swap only; no restyle, no behavior change. `SvgFooter.tsx`
already had zero raw controls.

- Ratchet: all 6 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/SvgeditAdoption.test.tsx` (no-raw-control
  source scan per file). The existing
  `studios/StudioShellRegressions.test.tsx` (5 cases, exercises SvgInspector
  and SnapPanel through the code shell) is unmodified and passing.
- Browser coverage: `test/design-system/svgedit-adoption.spec.ts` drives the
  real options bar, sidebar and inspector (with embedded snap panel) on a
  fixture document via the `?view=svgedit` gallery route: document width
  edit, panel visibility, plus light/dark production-style screenshots.
  Before/after pixel comparison against the pre-migration tree is identical
  in both themes (one flaky light capture was reproduced identical on
  re-run).
- Actual app svgedit E2E remains CI-only.
