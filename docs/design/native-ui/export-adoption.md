# Export and conversion dialogs DS adoption (P33)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in the
project export dialog and the image conversion dialog (14 across 2
files: `phase1/src/components/ExportDialog.tsx`,
`ImageConversionDialog.tsx`) now render through the geometry-free
native control primitives (`NativeButton`, `NativeInput`,
`NativeSelect`, `Textarea` from `ui/native-controls`). Element-owner
swap only; no restyle, no behavior change. This covers the export kind
radios, page select, inline CSS/JS checkboxes and close button, and the
conversion file input, format select, width/height inputs, proportions
checkbox, quality slider, background color input and close button.
Note: ExportDialog is the app-wide project export (zip/folder/single
file/markdown); the photo-specific export lives in PhotoExportPopover
(P29) and the raster toolbar save (P32).

- Ratchet: both file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/ExportAdoption.test.tsx` (no-raw-
  control source scan per file). No existing suites needed changes.
- Browser coverage: `test/design-system/export-adoption.spec.ts` opens
  the real export dialog with a fabricated project (`?view=export`,
  switched to Single HTML file so page select and checkboxes show) and
  the real conversion dialog through its `somnia:convert-image` window
  event with a decoded PNG (`?view=convert`, switched to JPEG so quality
  and background controls show), plus light/dark production-style
  screenshots. Before/after pixel comparison against the pre-migration
  tree is identical in both themes (captures wait for the dialog
  entrance and theme-switch transitions to settle).
- Actual app export flows remain CI-only.
