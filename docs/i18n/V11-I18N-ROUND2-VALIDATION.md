# v11 i18n round 2

Latest remote base rechecked: `10c6989` on `phase1-foundation`. This branch builds on that base plus round 1 (`fc4d74e`). Branch: `v11/i18n-finish-round2`.

40 additive `finish2.*` keys per catalogue; no existing values changed.

## Scope

- Live preview consent, scripts on/off labels, blocked-resource plurals, error summary and accessible error-location labels.
- Disk comparison title/description, show/hide diff, native save confirmation.
- Source diff explanatory text, bound-limit message and line-change accessible names.
- Image fit controls, PDF accessible labels, SVG/Markdown empty states and failed-link notice.
- Layer empty state and empty workspace accessible name.
- App toolbar Undo/Redo/view accessible names and short view/command text. App behavior and layout are unchanged.

Raw error messages, source text, paths and media names remain data. Empty Markdown text is rendered as a React text node rather than inserted as translated HTML. Diff saving and recovery behavior are unchanged; tests dismiss the confirmation and verify no fixture save occurred.

## Actual validation

- Typecheck and production build passed. Existing build warnings remain.
- Core tests: 333 passed.
- Round-2, preview, media, empty-layer, source-diff, preview-error-location and preview-animation browser tests: 36 passed, 0 failed.
- The first combined i18n / extension catalogue / Settings run had 47 passes and one startup test readiness failure: its shortcut ran before app initialization after reload. Both workflow tests passed on a separate recheck. The test now clicks the rendered Code view button after reload, avoiding this readiness race.
- The ten new tests cover all five locales, translated toolbar/preview/conflict/empty states and preservation of source/error/path data.
- Viewed French and Brazilian Portuguese comparison screenshots: all three columns, explanations, highlighted differences, cancel and save buttons are readable at the tested desktop viewport.
- Viewed Spanish live-preview consent screenshot: trust warning and both choices are visible and readable. No claim of a native-speaker review.
- Windows/Tauri native behavior, installer and screen readers were not tested.

Not a claim that every runtime diagnostic is translated. Low-level file-adapter/command notices and other out-of-scope UI literals still need an inventory and focused changes.

Final combined rerun after the readiness fix: 48 passed, 0 failed.
