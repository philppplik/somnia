# PDF edit module verification report

Baseline: `1d014e1`. Additive implementation only; no push, merge, catalog changes or GitHub Actions.

## Delivered

- JSON-only immutable edit metadata, stable original-page identities, parse/serialize validation, undo/redo.
- Rotate, delete, reorder and selected-page extraction.
- Real PDF Highlight, StrikeOut and FreeText annotations. FreeText exports a visible appearance stream, not a screenshot of the page.
- Existing AcroForm filling with strict all-or-nothing output on validation errors. Form fields remain editable.
- Controlled inspector with keyboard-accessible reorder, selection, annotation properties and native form controls.
- Five-language catalogues with exact key parity: English, German, Spanish, French, Brazilian Portuguese.
- Revision token and capability checks for attaching this metadata to the existing session. No competing session store.
- Integration touchpoints documented in `INTEGRATION.md`.

## Checks

- Focused module: `npx tsx --test src/lib/pdf/*.test.ts`: 10/10 passed.
- Focused plus existing annotation/form/backend regressions: 33/33 passed.
- Actual Chromium via Playwright, `/usr/bin/google-chrome`: standalone harness passes for all five languages, form input and export, plus 390px mobile layout.
- Screenshot pixels inspected: English annotations/source comparison; German form controls; Spanish form controls; French page tools; Brazilian Portuguese form controls; German mobile full page. Original text remains visible; exported highlight, strikethrough, free text and filled text/checkbox appear correctly. Controls and labels fit, with deliberate scrolling on desktop and stacked mobile layout.
- Project TypeScript: the only error is the baseline missing generated `slides-engine/pkg/somnia_slides.js` import in `src/lib/slides/worker.ts`. No errors from this module.
- Local browser render observed a Standard-14 Helvetica fallback warning from PDF.js. No `standard_fonts`, Liberation font assets or `standardFontDataUrl` were copied or used. The synthetic corpus renders correctly; arbitrary font fidelity is not claimed.

## Explicit remaining integration

This is a tested building block and inspector, not a claim of a completed studio rollout. The host must attach metadata/history/source identity to the existing session, use the existing killable worker and revision tokens, project metadata into viewer overlays/page order, wire locale updates, and connect export/extraction to the existing save-copy grant. Those core touchpoints were intentionally not changed.

WinAnsi limits are explicit. FreeText rejects unsupported glyphs and overflow. Signed, encrypted and XFA sources remain view-only. Deleting/extracting away pages with form widgets is refused. No OCR, reflow, signing, encryption or redaction.

No new dependencies or copied third-party implementation. Existing pdf-lib MIT and PDF.js Apache-2.0 build/worker are used. No GPL/AGPL or MPL components introduced.
