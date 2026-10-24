# Pdf/pdfedit areas DS adoption (P17)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/pdf/` and `phase1/src/components/pdfedit/` (107 across
10 files) now render through the geometry-free native control primitives
(`NativeButton`, `NativeInput`, `NativeSelect`, `Textarea` from
`ui/native-controls`). Bespoke `pdf-edit-*` classes, page-selection and extract
flow, annotation form semantics, form-field editing and viewer toolbar geometry
are preserved unchanged; this is an element-owner swap, not a restyle.

- Ratchet: both area budgets and all 10 file allowances are at zero;
  reintroduction fails `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/PdfAdoption.test.tsx` (5 cases: undo/redo and
  page actions, extraction checkboxes, annotation form primitives, text form
  field through the shared Textarea, no-raw-control source scan). Existing lib
  tests (pdfedit/pdfforms/pdfannotate/pdfview/pdftext: 93 passing, 38 skipped)
  are unmodified.
- Browser coverage: `test/design-system/pdf-adoption.spec.ts` drives the real
  edit inspector on a fixture document (`?view=pdf` gallery route): page
  select, extract flow, annotation submit, field set, disabled toggle, plus
  light/dark production-style screenshots. Before/after pixel comparison
  against the pre-migration tree is identical in both themes.
- Actual app PDF E2E remains CI-only.
