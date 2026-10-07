# ADR: format-aware PDF and publication layout editing

- Status: proposed; not implemented or engine-tested.
- Date: 2026-10-07.
- Baseline: `somnia-agent`, `427f8dbd2478d361b544a8cf81c4fd9dc0b7b631`.
- Change scope: this document only. No dependencies, pushes, PRs, or CI changes.
- Inputs: Wave 4 PDF/layout feasibility and license research, its source ledger, and the text/layout-engine research supplied for Wave 5. Their findings inform candidate engines below; this ADR does not repeat their research or claim package benchmarks.

## Decision

Use **one editor entry and window with format-aware modes**, not three separate applications. PNG/JPG use the existing raster tools, SVG uses vector tools, PDF uses PDF/layout tools. Share the editor shell and interaction vocabulary while keeping domain models, executors and adapters separate. Format detection chooses supported tools, not a silent format conversion. Unsupported capabilities have no working-looking buttons.

Within PDF/layout mode, distinguish three capabilities: viewing, bounded edits to an imported PDF, and native publication authoring that exports PDF. These are internal tracks in the same editor window, not competing apps. A native publication project is editable source; an imported PDF is immutable reference content plus explicit page operations/overlays. Neither model promises arbitrary PDF-to-editable-layout reconstruction or InDesign parity.

Default PDF output is a new copy. Project save and PDF export are distinct checkpoints. Preserve source and project after export. Warn on close, opening another file, or a mode switch that would discard unsaved changes. Viewing must not require the editing/export stack to load.

## 1. Verified repository constraints

Observed directly at the baseline:

| File | Current contract | Architecture consequence |
| --- | --- | --- |
| `phase1/src/lib/image-editor/types.ts` | JSON operations with `id/type/version/enabled/params` | Reuse envelope conventions, not a raster document |
| `phase1/src/lib/image-editor/pipeline.ts` | `type@version` lookup, duplicate rejection, owner-safe unregister, raster handlers, optional shaders | Share lookup mechanics later; PDF cannot use raster executors |
| `phase1/src/lib/image-editor/document.ts` | Immutable snapshots, finite JSON numbers, schema validation, duplicate-ID checks | Reuse intent/history principles with PDF-specific validators |
| `phase1/src/components/ImageEditorDialog.tsx` | Local snapshot undo/redo, 100-entry cap, transient controls, abortable render, open-generation guard; close resets state | Reuse workflows, not an assumed generic history controller |
| `phase1/src-tauri/src/image_io.rs` | One-use grants, 120-second TTL, bounded reads/writes, sibling temp file plus rename | PDF needs its own host; widening the image extension list is insufficient |
| `phase1/src/lib/convert/docConvert.ts` | Text extraction and image-to-PDF conversion | Conversion is not editing or layout-preserving import |
| `phase1/src/lib/conversion/documents.ts` | Explicit conversion pairs; no layout-preserving PDF claim | Keep conversion separate from editor APIs |
| `phase1/package.json` | `pdf-lib`, `unpdf`, `pdfmake`; `test:core` uses `tsx --test` with explicit globs | Package presence is not a capability/license audit; new test directories need explicit globs |

Registry code is in `image-editor`; adjustment/filter code is in `imageedit`; transforms/selections are in `imgedit`. Do not plan against an assumed `imageedit/registry.ts` or rename all three trees as part of this feature.

## 2. Format-aware shell and domain boundaries

Proposed `FormatEditorShell` owns file opening, mode indicator, zoom/pan/selection chrome, keyboard routing, tool rail, dirty-close guard and per-session disposal. Each domain controller exposes capabilities, history availability, current checkpoint state and its own view. Retain the existing image dialog as a compatibility wrapper during extraction; do not remove working raster features in a docs-only change.

Opening another format is a guarded session transition: ask about unsaved state, cancel old tasks, release old assets/workers, validate the new format, then activate its tools. Existing render results cannot leak into the new mode. Re-entering a retained session may restore its viewport, but cannot infer a cross-format editable document.

Proposed neutral `phase1/src/lib/layout-core/` shares authored node schemas, finite affine transforms/inverses, bounds/hit testing, selection geometry, snapping and asset/font references. Agree the name and API with Wave 4 before implementing it.

Dependency direction: `pdf-editor -> layout-core <- vector-editor`. Neither editor imports the other's controller/dialog. PDF owns page/source/box semantics, imported background rendering and PDF output. Vector owns SVG parsing/sanitization, viewBox/style semantics, path tools and SVG serialization. Raster editing stays independent; an edited raster becomes a new local asset and replacing a layout node's asset reference is one transaction.

Publication owns stories, paragraph/character styles, frames, threading and overflow. Do not collapse those semantics into an SVG path graph or turn text into outlines as the default.

## 3. Imported PDF intent model

Proposed interfaces, not compiled implementation. IDs are stable strings; JSON values are finite and validated. Source bytes and assets live in a local content-addressed store, outside the JSON document.

```ts
type Rect = readonly [number, number, number, number]; // x, y, width, height
type Affine = readonly [number, number, number, number, number, number];
interface SourceRef { assetId: string; sha256: string; name: string; byteLength: number }
interface ImportedPage {
  id: string;
  sourcePageIndex: number; // zero-based index into immutable source, not UI order
  mediaBox: Rect; cropBox: Rect; // raw PDF default-user-space coordinates
  userUnit: number;
  rotation: 0 | 90 | 180 | 270;
}
interface LayoutNode {
  id: string; kind: 'text' | 'image' | 'path' | 'group';
  transform: Affine;
  data: Readonly<Record<string, JsonValue>>; // schema per kind, not arbitrary HTML
}
interface PdfOperation {
  id: string; type: string; version: number; enabled: boolean;
  params: Readonly<Record<string, JsonValue>>;
}
interface PdfEditDocument {
  kind: 'pdf-layout'; schemaVersion: 1; source: SourceRef;
  importedPages: readonly ImportedPage[]; // immutable base manifest
  operations: readonly PdfOperation[];
  revision: number; // serialized counter, not an asynchronous identity
}
interface MaterializedPage {
  id: string; sourcePageIndex: number;
  cropBox: Rect; rotation: 0 | 90 | 180 | 270;
  overlayNodes: readonly LayoutNode[]; // back-to-front order
}
interface MaterializedPdf { pages: readonly MaterializedPage[] }
```

The current page order and overlays are derived by replay, not a second persisted truth. Source hash binds intent to exact input. Indices never substitute for stable page IDs in commands. Single-source import first; inserting pages from other PDFs awaits a multi-source contract.

Validate finite geometry, positive box sizes, ID uniqueness, node schemas, bounded nesting/text and page/node/asset references at parse and commit. Duplicate-page commands include fresh page/node IDs and insertion anchors; handlers never generate random IDs. A duplicate captures that page's state at its point in replay, not its future state. Assets, source proxies, font handles, caches, passwords, native grants and selection/viewport state are not serialized.

### Coordinate contract

Authored geometry uses physical points, X right, Y down, origin at the unrotated media-box top-left. Crop affects visibility, not object positions. For media box `(mx,my,mw,mh)` and unit `u`, map raw source coordinates as `x=(xPdf-mx)*u`, `y=(my+mh-yPdf)*u`. Preserve raw boxes and units. The adapter owns the combined crop/rotation/zoom/scroll/DPR transform and inverse; no independent export Y-flip.

Test negative/nonzero origins, differing media/crop boxes, all quarter turns and non-default user units. Unknown/invalid geometry yields unsupported status rather than silent normalization. Export uses canonical-to-PDF mapping, not screen pixels.

## 4. Native publication model and typography

A separate `PublicationDocument` stores stable page/frame/story/style/asset IDs, page sizes in points, ordered nodes, local font references and style definitions. A `Story` owns paragraph text and character-style spans. A `TextFrame` references a story, bounds/insets, column count/gutter and optional next-frame ID. Validate acyclic frame chains and deterministic reading order. Text remains text.

Derived `LayoutResult` contains shaped runs, glyph/cluster mappings, line positions, frame fragments and overflow diagnostics, keyed to source and engine/font versions. It is not the authored source. Basic fixed frames come first; linked stories are a later capability in the same PDF/layout mode. Show an explicit overflow marker rather than silently dropping text on export.

Adopt the text research's **one metrics source for preview and export** rule. Candidate `fontkit` supplies metrics/shaping; evaluate its pairing with the selected PDF writer before approval. Do not preview with canvas/CSS wrapping while export independently wraps text. Both consume the same positioned glyph/line result, with selectable text and ToUnicode behavior verified by fixtures.

Candidate paragraph pipeline: shaped clusters -> legal break opportunities -> optional language patterns -> box/glue/penalty representation -> Knuth-Plass line selection -> frame/column allocation -> positioned glyphs. The research proposes vendoring `tex-linebreak` behind a small interface, retaining notices and owning tests, not trusting a library to supply stories, editing or pagination. Hyphenopoly is a candidate for language-specific hyphenation; ship no pattern until its individual license is recorded. Language, engine version and user exceptions are layout inputs.

Frame threading, widows/orphans, keep-with-next and forced frame/column breaks are owned by publication layout. Invalidate from an edited paragraph forward until layout stabilizes; cache by text/font/features/size/language and width constraints. Worker and size budgets await measurement. Do not promise the research's rough effort estimates as delivery dates.

First scope: fixed pages, text/image frames, basic styles, alignment and visible overflow, verified digital PDF export. Later: linked frames, columns, paragraph optimization and tested language patterns. Not round 1: arbitrary PDF paragraph replacement, OCR, true redaction, complex-script/bidi print parity, footnotes/index/TOC, master/facing-page logic, advanced tables, PDF/X, PDF/UA or color-managed press output. Fontkit alone is not a complete bidi/paragraph engine.

## 5. View/edit/render/export separation

- `PdfViewAdapter`: inspect source/features, render requested page/tile, obtain selectable text, dispose. Never mutate source or authorize file writes.
- `PdfSession`: owns bytes, workers, cancellation and monotonically increasing session/render generation. Never persists runtime handles/passwords.
- `PdfEditController`: validates commands and commits immutable intent snapshots; no file I/O in gestures.
- Pure replay: document-to-materialized-state, no DOM, random IDs, filesystem or network.
- Shared layout renderer: authored scene/positioned text only; not arbitrary PDF object reconstruction.
- `PdfExportAdapter`: captured snapshot to bytes plus typed preservation/loss report. Never saves directly or hides unsupported features.
- `PdfEditorHost`: OS/web pick, bounded input, explicit Save As, conflict checks and native write grants.

Render visible pages plus a bounded neighbor budget, not every page at full resolution. Base page cache and selection overlay cache are separate. Keys include source hash, materialized content identity, renderer/font versions and scale/tile. Revision alone is unsafe because undo revisits it. Abort plus generation checks suppress late results even if the engine cannot cancel. Dispose workers, proxies, bitmaps, object URLs and fonts on replacement/close.

Export captures an immutable snapshot/content key. Recheck source and destination state before writing. Completion marks only that checkpoint; edits made during export remain dirty. Project persistence must atomically include required assets and a manifest, or fail without claiming saved. The project container/extension remains open.

## 6. Operation registry and history

Reuse the existing JSON envelope, `type@version` lookup, duplicate rejection, owner-safe disposal and enabled ordered replay. Keep a separate typed PDF registry:

```ts
interface PdfOperationHandler {
  type: string; version: number;
  validate(params: Readonly<Record<string, JsonValue>>): void;
  apply(input: MaterializedPdf, params: Readonly<Record<string, JsonValue>>,
        context: {signal?: AbortSignal}): MaterializedPdf;
}
```

This is not the raster `OperationHandler`. No casts to raster operations, no `renderStack` on PDFs, no shader hooks in document replay. A later `VersionedRegistry<H extends {type:string; version:number}>` can share map mechanics while image APIs remain compatible wrappers. Domain validation/execution stays outside the map.

Suggested operations: `pdf.page.move/remove/duplicate/rotate/crop`, `layout.node.add/update/remove/reorder`. Use stable target IDs and explicit anchors; refuse removing the last page in v1. Rotation is absolute and crop validates supported raw bounds. Multi-target changes are atomic transactions validated on temporary state before commit.

Transient gestures commit once at pointer-up; Escape cancels. One gesture is one undo, a new commit clears redo. Reject unknown enabled versions and dependency conflicts; disabling an earlier operation must not silently skip later references. Preserve unknown envelopes for read-only inspection, but block editing/export that falsely implies support. Explicit migrations never overwrite originals before successful save. Extract common history from the image dialog only after both domains have regression tests.

## 7. Engines, file safety and honest output

Research candidate: controlled PDF.js viewing, existing pdf-lib for bounded page/additive operations, existing pdfmake for simple structured output. Versions, worker/CSP packaging and preservation still need tests. pdf-lib's documented ordinary-page-text replacement limitation is why replacement is excluded [S1,S2]. MuPDF WASM remains an AGPL/commercial license gate, not part of this MIT distribution by default [S3]. No paid license or new dependency is approved here. Paged.js/Typst/HarfBuzz are later spikes only if a verified need justifies them.

Create PDF-specific `pdfEditorHost.ts` and `pdf_io.rs`; do not widen `image_io`. Later share private grant/atomic-write helpers with unchanged image contracts. Validate regular files, bounded bytes and parse result; header/extension alone is not full validation. One-use grants are authority; frontend names/paths are not. Save errors retain the session. Test replacement/temp cleanup and durability on Windows/macOS/Linux rather than assuming image tests establish all guarantees.

Treat embedded scripts/actions/attachments/links/metadata as untrusted data. No automatic execution, navigation, network fetch or extraction. Passwords stay memory-only. Do not bypass encryption with ignore-encryption flags.

Inventory forms, signatures, annotations, links/destinations, bookmarks, tags/accessibility, layers, attachments, color profiles and encryption. Each feature is supported/unsupported/unknown. Signed input is view-only first. Block exports with unknown or unsupported preservation-critical features; any later lossy-copy path needs explicit acknowledgement. Crop/opaque overlays are **not redaction**. Drawn signatures are not digital signatures. No silent flatten/raster fallback or lossless/press-ready/accessibility claims.

## 8. Refactor and integration sequence

1. Land this ADR only; central builder reconciles Wave 4 layout schema and engine evidence.
2. Extract a minimal guarded format shell with raster compatibility wrapper and unchanged image tests. Avoid wholesale directory renames.
3. Implement PDF viewing/session/feature inventory behind a capability gate; keep current preview until replacement passes browser/Tauri checks.
4. Add pure PDF intent/replay/geometry/history core with `node:test`; add new test globs to `test:core` explicitly.
5. Agree neutral layout schema with vector work; share tested primitives, not controller ownership. Introduce generic registry only with raster regression coverage.
6. Page-edit vertical slice: supported reorder/rotate/crop, undo/redo, Save As copy, preservation gate and native write recovery.
7. Additive authored overlays and fixed publication frames, shared metrics/layout and preview/export fixtures. No placeholder tools.
8. Project assets/checkpoints/migrations, then threaded stories and paragraph tools in separate tested slices. No release/parity claim from this ADR.

## 9. Acceptance plan, not executed tests

Core `node:test`/`node:assert/strict` via `test:core`: parse/serialize and hash binding; malformed schemas, finite geometry, ID/reference checks; deterministic replay/duplication/transaction rollback; disabled dependencies and unknown versions; undo/redo/checkpoints; affine round trips for crop/rotation/unit/DPR; generation/cache/disposal races; captured export and stale completion. Shared registry changes must retain image tests.

Typography fixtures: mixed style spans, ligatures/cluster mapping, justified lines, language exceptions, frame cycles, overflow/threading, widow/orphan rules and exact preview/export line positions. Verify font embedding licenses/permissions, fallback and subsetting, searchable text and Unicode mapping. Test CJK/complex scripts before enabling them; no promise based only on package features [S4-S7].

Adapter fixtures: simple text/vector/image, scans, mixed boxes/rotation, forms, tags, annotations, destinations, signed/encrypted inputs, malformed/large documents. Reopen exported bytes with independent parsing/viewing where feasible, inspect page order/geometry/text/features and compare representative renders. Actual pixel inspection of baselines, selection, handles and output alignment is required before UI ships; a raster diff cannot prove semantic preservation.

Native tests: expired/wrong/replayed grants, growing input caps, bad MIME/parse, empty/oversized output, destination conflicts, failed rename/temp cleanup and replacement per OS. Browser File/Blob fallback cannot silently overwrite the original.

This docs-only task runs no runtime, engine, rendering or fidelity tests. No functional PDF tools are delivered.

## 10. Open decisions

- Wave 4 neutral layout API/module ownership; selected engine versions, notices and packaging audit.
- Exact preservation inventory/matrix and signed/encrypted policy support.
- Fontkit/writer glyph parity, font embedding/subsetting and complex-script boundaries.
- Vendored paragraph engine ownership and per-language pattern/font licenses.
- Project container/extension, asset recovery/migrations and persistence atomicity.
- Measured byte/page/pixel/worker/history budgets and cancellation behavior.
- Native overwrite/conflict/durability guarantees across supported OSes.
- Multi-source pages, reconstruction, OCR, genuine redaction, signatures and print standards are later scopes.
- Feature-flag names and exact rollout subset after fixtures; no dependencies chosen by this document.

## Sources carried from supplied research

These URLs were inspected in the supplied research, not re-fetched by this docs task. Repository observations above were read directly at the pinned commit. Recommendations and module names are proposals, not deployed facts.

- [S1] pdf-lib README: https://github.com/Hopding/pdf-lib
- [S2] Existing-text API limitation: https://github.com/Hopding/pdf-lib/issues/564
- [S3] MuPDF licensing: https://mupdf.readthedocs.io/en/latest/license.html
- [S4] fontkit: https://github.com/foliojs/fontkit
- [S5] tex-linebreak: https://github.com/robertknight/tex-linebreak
- [S6] Hyphenopoly: https://github.com/mnater/hyphenopoly ; pattern licenses: https://github.com/hyphenation/tex-hyphen
- [S7] Font subsetting risk fixture: https://github.com/Hopding/pdf-lib/issues/494
- [S8] PDF.js: https://github.com/mozilla/pdf.js
- [S9] pdfmake: https://github.com/bpampuch/pdfmake
- [S10] unpdf: https://github.com/unjs/unpdf
