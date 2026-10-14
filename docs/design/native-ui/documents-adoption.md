# Documents area DS adoption (P26)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/documents/` (33 across 4 files: DocumentsCanvas,
DocumentsExportDialog, DocumentsPanelContents, DocumentsPanels) now render
through the geometry-free native control primitives (`NativeButton`,
`NativeInput`, `NativeSelect`, `Textarea` from `ui/native-controls`).
Element-owner swap only; no restyle, no behavior change.

- Ratchet: all 4 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/DocumentsAdoption.test.tsx` (no-raw-control
  source scan per file). The existing `DocumentsPanelContents.test.tsx`,
  `studios/HeroActionSlot.test.tsx` and `StudioPill.test.tsx` (15 cases
  total) are unmodified and passing.
- Browser coverage: `test/design-system/documents-adoption.spec.ts` drives
  the real find, info, selection and outline panels on a fixture document
  via the `?view=documents` gallery route: find input accepts text, plus
  light/dark production-style screenshots. Before/after pixel comparison
  against the pre-migration tree is identical in both themes.
- DocumentsCanvas and DocumentsExportDialog controls are covered by the
  source scan and ratchet; the gallery proof renders the panel components
  (the canvas needs a live engine).
- Actual app documents E2E remains CI-only.
