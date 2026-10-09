# Flattened PDF copy export

Base: `1d014e1`. All files in this patch are new under `phase1/src/lib/pdf/export/`.
No dependency, package manifest, locale catalog, existing session or component is modified.

## Contract and scope

This is **Export flattened PDF copy**, not the normal Save edited copy path.
Keep `pdfedit/session.ts:exportPdfCopy` as the annotation/form-preserving save.
Flattening is a deliberate destructive conversion, explained before export.
Never automatically substitute the screen preset for a normal save.

```tsx
import { PdfExportPanel } from '../lib/pdf/export/PdfExportPanel';
import { browserPdfRenderer } from '../lib/pdf/export/browserRenderer';

<PdfExportPanel bytes={snapshot.bytes} locale={locale}
  environment={{ canvas: !!document.createElement('canvas').getContext('2d'),
    protectedDocument: info.signed || info.encrypted || info.xfa }}
  renderer={browserPdfRenderer}
  onExport={async result => { /* validate revision, inspect, render, save copy */ }} />
```

Do not show this export action while source bytes are unavailable, editing is busy
or permissions have not been inspected. `PdfInlineEditor.tsx` is the current
media/Code PDF entry point. Documents currently routes DOCX, not PDF. Wire the new
panel into that existing PDF entry, not into a second studio session store.
The panel has standalone EN/DE/ES/FR/PT-BR strings because shared locale files are
outside this patch's scope. Product integration can move them into those catalogs.

## Session / worker touchpoints

- Capture current document identity, source hash and session revision before
  exporting. Input bytes are copied. Do not pass a live mutable buffer.
- Reject output if identity/revision changed or the media was closed/reopened.
  The panel callback does not touch session bytes, history or dirty state.
- Print uses `exportPrintInWorker`: dedicated module worker, copied bytes,
  explicit request kind, 20-second timeout, termination on abort/error/success.
  Integration may route this operation through the existing killable edit-worker
  command dispatcher after extending it explicitly; unknown commands must fail.
- The exported core `exportPdf` is worker-compatible except for its injected
  screen renderer. Screen rendering is sequential with copied PDF.js input and
  a 16 MP cap per page. The browser adapter destroys its loading task on abort
  and releases canvases/pages after each yield. **Screen assembly currently runs
  in the caller context**; it is an opt-in lossy export, not normal save. A fully
  killable raster pipeline needs an OffscreenCanvas worker adapter or a render/
  assemble protocol. Do not claim hard isolation for that path.
- Reopen candidate bytes with `inspectPdfInWorker` and render representative/all
  pages as the product's verification policy requires before writing. Tests here
  reopen and render generated fixtures; they do not validate every user file.
- Save via the existing native `pdf_save_pick` + `pdf_save_write` grant flow with
  `-flattened.pdf` or `-screen.pdf`. A browser download is only initiated, not
  confirmed on disk. Never clear dirty state on browser download initiation.
  Even a confirmed native copy must not mark an edited live session clean if its
  revision changed, or if the lossy copy does not preserve its editable state.

## Presets and fidelity

- Print: no page rasterization, no image downsampling, no forced font replacement.
  Uses object streams. Source text, vectors, images and font objects are retained
  through pdf-lib rewriting, not byte-identically. Added text supports Helvetica,
  Times-Roman and Courier; glyphs outside their encoding are rejected.
- Screen: JPEG pages, 120 DPI / 78% defaults, DPI 72-300 and quality 10-100%.
  CropBox and rotation are rendered and the resulting visible geometry preserved.
  Text search, accessibility structure, vector detail and links are lost. Size
  may grow, especially for mostly-vector sources. This is not PDF/X/CMYK.
- Visible `/AP /N` appearance Forms are mapped using BBox + Matrix to annotation
  Rect, appended to page content, then removed from page `/Annots`. AP state
  dictionaries select `/AS`. Links are retained in print. Form tree is removed
  after widget appearances are baked. Popups/replies and hidden annotations are
  removed, with the general review-comment/interactivity warning always returned.
- Missing/malformed appearances, unsupported optional-content annotations and
  NoZoom/NoRotate flags fail the entire export. There is no silent omission.
  This does not regenerate missing source widget appearances. Current Somnia
  annotation creation already writes AP streams.
- Signed/encrypted/XFA files are refused even if called outside the panel.
  No encryption bypass, signature removal, OCR, source-text reflow or redaction.
- Metadata edits support title, author, subject, keywords, creator and dates.
  Unspecified fields remain. If edited metadata has existing XMP, that XMP is
  removed with a warning to avoid contradictory titles. Screen copies transfer
  source document properties. Metadata handling is not sanitization.
- Standard-14 is available; subset embedding, linearization and color-managed
  PDF/X conversion are disabled with reasons in all five locales. Existing subset
  fonts are retained, not re-embedded. There is no font-perfect conversion claim.

## Limits and licensing

25 MB input, 1-2000 pages, 16 MP per raster page; 100 MB encoded raster-input and final-output caps.
Core cancellation checks occur between stages; use the killable worker for
untrusted parsing. These are responsiveness limits, not a parser security proof.
Production uses existing pdf-lib (MIT), PDF.js JS/worker (Apache-2.0), React and
browser canvas. Tests use PDF.js's existing optional @napi-rs/canvas (MIT).
No new dependency. No GPL/AGPL/MPL source or assets introduced. In particular,
**no `standard_fonts` directory or Liberation font assets are copied or configured**.
`standardFontDataUrl` is not used. The standalone Latin tests use system fonts.
Font-heavy imported PDFs still need audited asset packaging/corpus verification;
this patch is not a third-party bundle inventory for the entire app.

## Verification

```
npx tsx --test src/lib/pdf/export/*.test.ts
PDF_EXPORT_ARTIFACTS=/tmp/pdf-export npx tsx --test src/lib/pdf/export/*.test.ts
```

Seven generated-fixture tests: five annotation kinds, preserved source bytes,
forms/links, Standard-14 extraction/rejected Unicode, source protections, cancel,
missing appearances/states, metadata/XMP, screen renderer completeness, rotated
CropBox and appearance Matrix. Actual PDF.js canvas pixels are compared before /
after flattening (<2% changed; geometry fixture <1%) and screen raster error is
bounded. Add this glob to the product's test:core script during integration.

Run `npx tsx src/lib/pdf/export/browserSmoke.ts` from phase1 for the reproducible
Chrome preview smoke (CHROME_PATH override supported; artifacts optional).
Chrome standalone preview verified all five locales, print Worker, screen export and 375px
mobile layout without horizontal overflow or browser errors. Screenshots inspected
visually: colored markup survives, text and vector objects retain placement;
rotated crop/AP matrix and widget render correctly; panel labels/reasons fit.
Global tsc has the baseline missing `slides-engine/pkg/somnia_slides.js`, no export
module errors. Full Windows/macOS native-save and imported PDF corpus checks remain
integration work, not completed claims.
