# Versions area DS adoption (P28)

All raw `<button>`/`<input>`/`<select>`/`<textarea>` controls in
`phase1/src/components/versions/` (19 across 8 files: ChangesTab,
CompareTab, ConflictResolver, PublicationReview, RefCompare, VariantsTab,
VersionPicker, VersionsPanel) now render through the geometry-free native
control primitives (`NativeButton`, `NativeInput`, `NativeSelect`,
`Textarea` from `ui/native-controls`). Element-owner swap only; no restyle,
no behavior change.

- Ratchet: all 8 file allowances are at zero; reintroduction fails
  `check:ds` with a lint diagnostic.
- Unit coverage: `src/components/VersionsAdoption.test.tsx` (no-raw-control
  source scan per file). The existing versions suites (ExplainTab,
  HistoryTab, PublicationReview, VariantsTab, commitReview, versions — 58
  cases) are unmodified and passing.
- Browser coverage: `test/design-system/versions-adoption.spec.ts` drives
  the real changes view and version picker on the fake backend fixture via
  the `?view=versions` gallery route: subject edit commits through the
  controller, plus light/dark production-style screenshots. Before/after
  pixel comparison against the pre-migration tree is identical in both
  themes.
- Actual app versions E2E remains CI-only.
