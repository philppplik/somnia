# PDF content import

Baseline: `1d014e1da72c44e81dc413038f9188d75c11842d`. Additive module only.
All new files are under `phase1/src/lib/pdf/`. No core, package, catalog, CI or
studio registry files were changed. At this baseline PDFs use the media/Code
surface hosted by `PdfInlineEditor`, not Documents studio or a `pdf-markup`
registry ID.

## API and model

```ts
import { importPdfInBrowser } from '../pdf/browser';
const model = await importPdfInBrowser(bytes, {
  signal: controller.signal,
  onProgress: (completedPages, totalPages) => { /* update import status */ },
});
```

`model.pages` contains one-based page numbers, cropped/rotated viewport sizes,
source crop bounds, PDF-to-viewport affine transforms, positioned text runs,
vector paths, detached PNG images, detached PNG thumbnails and diagnostics.
Coordinates are top-left viewport points at scale 1. PDF user units and page
rotation are applied through the viewport transform. Store `schemaVersion` with
any cache and regenerate when importer or bytes change.

- Text: Unicode string, generated PDF.js font key, fallback family, baseline
  matrix, ascent/descent quad, font size and bounds. Text follows PDF.js reading
  order, **not** paint order. No text paint colors, glyph outlines, rich paragraph
  structure, arbitrary font editing or OCR are claimed. Vertical-text bounds are
  approximate and flagged. Existing PDF.js text selection stays in place.
- Vectors: move/line/cubic/quadratic/close geometry, fill/stroke and fill rule,
  opacity, dash/cap/join/miter, source transform and width. Bounds use conservative
  control-point hulls. `lineWidth` is an area-scale approximation; source width
  and matrix are needed for nonuniform/sheared stroke fidelity.
- Images: normal XObject, inline and repeated placements are decoded into PNGs,
  with unit-square pixel-to-viewport transform, quad, pixel size and interpolation
  flag. Render `dataUrl` into unit square `(0,0,1,1)` under `transform`, not pixel
  dimensions. Use the interpolation flag to avoid smoothing pixel-art images.
- Thumbnails: original PDF.js page rendering on a white background, with longest
  side 180 pixels by default (size configurable up to 2048).

`importPdf()` is the environment-neutral entry with injectable PDF.js loading and
canvas factory. `browser.ts` supplies the Vite-bundled worker URL. Node tests use
PDF.js legacy and the already-installed optional `@napi-rs/canvas`; production
imports do not depend on that native module. Browser modules are lazy-loadable.

## Session touchpoints, without a competing store

Extend the existing `src/lib/pdfedit/session.ts` session with an optional import
cache and import status/reason. Keep its original/current bytes, inspection,
capabilities and byte-snapshot undo/redo authoritative. Never recreate the PDF
from this imported model and never mark it dirty merely because import finishes.

1. In `openPdfSession`, after byte acquisition, capture the session's stable
   document ID, source hash and revision. Start an abortable import alongside
   existing inspection/view loading. Keep the view working if import fails.
2. When import resolves, install **only** if the same document ID/hash/revision
   remains current. `revision.ts` supplies `PdfImportRevision`,
   `importPdfForRevision()` and `isCurrentPdfImport()` for this handoff. For browser
   usage, pass the bundled worker URL or wrap `importPdfInBrowser()` with the same
   captured token. Do not use filename alone as identity.
3. Abort and invalidate import results on close/reopen, byte edits, page edits,
   undo/redo and replacement. Restart from the current bytes when needed.
4. Keep `src/components/pdfedit/PdfInlineEditor.tsx` and `PdfViewer` as renderer
   and text-selection host. Do not switch the main view to extracted objects.
5. `PdfPanels.tsx` may consume imported `thumbnail` entries for navigation;
   invoke `selectPdfPage(name, page.number)` for selection. It must retain the
   current source/revision guard and fall back to existing rendering when null.
6. Imported content can support inspector/search/object discovery. It is not an
   edit permission. Only capability-approved commands enter the existing
   killable pdf-lib edit Worker. `readOnly: true` deliberately encodes that split.
   Source-text replacement stays under the narrow existing `pdftext` gate.

No changes were made to the existing edit Worker, commands, exports or session
store. The integration owner must connect the above touchpoints before claiming
that opening an app PDF automatically fills the imported-content cache.

## Honest limits and safety

Clipping, patterns/shadings, stencil masks, optimized inline image atlases,
transparency groups, soft masks/blend modes and optional-content semantics are
not reconstructed. Each encountered category adds a page diagnostic; original
PDF.js rendering remains the appearance reference. Text diagnostics explicitly
warn against arbitrary source editing or exact appearance reconstruction. A
thumbnail failure is reported as `thumbnail-unavailable`, never a fake preview.

Defaults: 25 MB input, 2000 pages, 100000 objects per page, one million numeric
path elements per path, 16 million pixels per retained image and 64 million
retained image pixels overall. Inputs exceeding document/object limits fail;
images exceeding pixel budgets are skipped with a diagnostic. Caller bytes are
copied before PDF.js transfers them. Resources are cleaned up and loading/render
jobs destroyed or cancelled on abort. No links/actions/embedded scripts or
attachments are executed. Passwords support view-only extraction through PDF.js,
not decryption/edit permission, and are not included in the returned model.

These are admission/retention limits, **not** a hard decompression-memory sandbox:
PDF.js may allocate text/operator/image buffers before they can be inspected.
For hostile/very complex files the integration should run this job behind a
killable worker watchdog. Sequential pages avoid unbounded page concurrency;
2,000 thumbnails can still retain material memory. Lazy per-page import is a
future optimization, not part of this patch.

## Licensing and packaging

No added dependencies. Existing PDF.js JS/worker code: Apache-2.0; fixture
creation via pdf-lib: MIT. No MPL component introduced. Local source package
licenses were inspected. **Do not copy `pdfjs-dist/standard_fonts` wholesale or
ship `LiberationSans-*.ttf` (GPLv2 + exception).** This module sets no
`standardFontDataUrl`, `cMapUrl` or `wasmUrl` and copies no fonts/asset folders.
Retain actual PDF.js notices when shipping its bundled JS worker. Any later
local font/CMap/WASM asset support needs its own explicit license allowlist.
Node standard-font rendering warns about missing `standardFontDataUrl`; fallback
fonts are not promised to be exact. Chromium fixture rendering passed with local
fallback fonts, without shipping Liberation assets.

## Tests and visual inspection

```sh
cd phase1
npx tsx --test src/lib/pdf/*.test.ts
```

Fixtures are generated in-test with pdf-lib: positioned text, filled rectangle,
Bézier curve, embedded RGB image, blank page, translated graphic on a cropped
90-degree page, repeated images and clipping. Tests cover bytes retained, affine
positions, decoded images, thumbnails, serialization, progress, revision guards,
malformed inputs, byte/page/object limits, pixel limits, unavailable canvas,
module failure/password mapping, abort before/during load and during progress.

For manual inspection serve the existing repo with Vite and open:
`/src/lib/pdf/inspection.html`. The harness imports a generated PDF through the
real browser entry and shows original rendering beside extracted data, page
thumbnails and explicit diagnostics. It is a test harness, not production UI.

Two screenshots were inspected from real headless Chromium at 1320px viewport:
page 1 text bounds/blue rectangle/cubic stroke/red-green image and page 2
crop/rotation/transformed rectangle. Geometry and image placement match the
original. Text uses the documented fallback family and purple bounds, not an
exact glyph-editing representation. Both thumbnails navigate successfully;
no browser page errors occurred. Full repository typecheck has an unrelated
missing generated `slides-engine/pkg/somnia_slides.js` at this pinned baseline;
no errors refer to this module.

Reproduce screenshots (use an installed Chromium path or Playwright Chromium):

```sh
CHROME_PATH=/usr/bin/google-chrome node src/lib/pdf/inspection-chromium.mjs
```

Set `PDF_INSPECTION_OUTPUT` to change the output directory. The script closes the
browser and local server after inspection. Screenshot generation alone is not
visual approval; inspect the rendered images before accepting changes.

# PDF edit integration

Baseline: `1d014e1`. All code is additive. Nothing changes the active PDF studio until the host wires these touchpoints.

## Existing studio read first

`src/components/pdfedit/PdfInlineEditor.tsx`, `PdfPanels.tsx`, `src/lib/pdfedit/session.ts` and `backend.ts` currently edit a byte copy and store byte snapshots in undo/redo. `pdfannotate` already exports real Highlight and StrikeOut objects; `pdfforms` supports AcroForm inspection and filling. This module reuses those MIT helpers without rewriting the studio.

## New public surface

- `inspectPdfEditSource(source)` returns editing guards, page info, field descriptions and initial metadata.
- `createPdfEditDocument`, `applyPdfEditCommand`, `extractPdfPages`, JSON parse/serialize, and bounded history helpers store only JSON metadata. Rotation, deletion and order never change source bytes. Annotations target original zero-based source-page identities, not the changing display index.
- `exportPdfEdits(source, metadata)` composes a private copy. Output annotations remain actual PDF annotation objects, including visible FreeText with an embedded appearance stream. AcroForm values remain editable. Existing annotations and original page references are preserved.
- `PdfEditInspector` is a controlled inspector. It has no filesystem access or automatic export. Page extraction returns selected original identities in current display order. It includes keyboard reorder buttons, native form controls, alerts and all five locale catalogues.

## Host touchpoints (not changed by this patch)

1. In `pdfedit/session.ts`, retain immutable original bytes separately from preview bytes. Bind persisted metadata to the source identity/content hash in the project container; `commands.ts` supplies revision-token matching and per-command capability gating for this boundary; page count alone is not a fingerprint. Initialize a `PdfEditHistory` only after inspection. Do not persist form values to logs or telemetry.
2. Wire `PdfEditInspector` into the inspector slot in `App.tsx` / `PdfPanels.tsx`, passing `getLocale()` and subscribing to locale changes with the existing i18n hook. Studio-owned `PDF_EDIT_LOCALES` avoids edits to shared locale files. It is intentionally not merged into the global catalogue.
3. Route inspector commands through `commitPdfEdits`. Record metadata as dirty project state, not a rewritten PDF. Wire undo/redo, clear errors on success, and map active source-page identity to current display position. If the active page is deleted, select the next visible identity.
4. For interactive preview, render original source pages in metadata order with rotation offsets. Draw metadata annotations in an overlay after converting bottom-left PDF coordinates through the PDF.js viewport matrix (including crop-box offsets and original rotation). Do not mutate source bytes merely to preview. Coordinate inspector values are unrotated points; annotation geometry gets checked against the source crop box at export.
5. Save export through the existing user-selected copy destination. Do not overwrite the original path. Run `exportPdfEdits` in the PDF worker for large documents and guard repeated exports with a busy flag. The exporter snapshots metadata and source at invocation.
6. Extraction uses `extractPdfPages(history.present, identities)` and a separate copy export. Never replace the current document with the extraction result unless the user explicitly opens that copy.

## Safety and limitations

- View-only for encrypted, signed or XFA documents, following existing studio guards; cap 25 MB source / 2000 pages.
- Removing any page containing form widgets is refused at export, including extraction that would omit those pages. This avoids orphan widgets and silent form loss. Reordering keeps the original page references intact. For such documents, flatten a separate copy in a trusted PDF tool first; no silent flattening occurs.
- Form-fill errors abort the copy export rather than emitting partially filled output. Read-only fields, invalid options, unknown names, unsupported field types and unsupported glyphs are reported.
- FreeText uses Helvetica/WinAnsi, supports explicit line breaks, rejects text wider/taller than its rectangle and unsupported characters. No silent truncation or font substitution. Arbitrary Unicode requires a licensed embedded-font provider in a later integration.
- Existing content is not rewritten: no paragraph reflow, OCR, arbitrary existing-text replacement, signature editing or form design here.
- No new dependency, downloaded font, GPL/AGPL or MPL code. Uses existing MIT `pdf-lib`. Verification imports PDF.js Apache-2.0 build/worker only, not `standard_fonts`, Liberation assets, or `standardFontDataUrl`.

## Verification

A PDF.js console font-fallback warning was observed for the synthetic Standard-14 fixture; no licensed fallback font assets were fetched or bundled. Chromium pixel checks confirm visible test text and annotations, not general font fidelity.

Run `npx tsx --test src/lib/pdf/*.test.ts`. Tests cover immutable source and metadata, history, stable identities, validation, real annotations/appearance, reordered page rotations, editable forms, failure paths and exact five-locale key parity.

Standalone real-browser harness: launch Vite directly and open `/src/lib/pdf/verification/index.html?locale=en` (or `de`, `es`, `fr`, `pt-BR`). It renders a synthetic original and exported PDF side by side using PDF.js and the actual controlled inspector, without needing Tauri or missing studio WASM builds. It is not part of the application bundle because nothing in the app imports it. This proves the additive inspector/export module, not completed host integration.
