# PDF import, editing and export architecture

Research date: 2026-10-09. Baseline: `1d014e1da72c44e81dc413038f9188d75c11842d` (beta.4).
Status: proposed beta.6 architecture, not a claim that the work below has shipped.

## Decision

Keep **PDF.js for viewing and text selection, pdf-lib for bounded copy edits**.
Extend the existing editor instead of introducing a competing PDF document store
or replacing it with a canvas-only importer. Use a capability report to separate
"can view" from "can edit" and distinguish adding text from changing source text.

PDFium is the best next engine spike for object-level editing, behind the current
backend interfaces. It is not a beta.6 prerequisite. MuPDF's open-source WASM
route is excluded because it is AGPLv3. No paid SDK or license purchase is proposed.

The licensing recommendation is conditional on the **actual distributed files**,
not just an npm package's SPDX field. In particular, PDF.js's bundled Liberation
fonts are GPLv2 with an embedding exception and must not be copied into Somnia
under the project's strict no-GPL policy. An embedding exception is not permission
to ignore that policy. This is an asset-packaging issue, not evidence that PDF.js's
Apache-2.0 JavaScript is itself GPL.

## 1. What exists at the pinned baseline

Paths below are relative to `phase1/` unless stated otherwise. Source inspection,
not old architecture proposals, establishes this inventory.

| Component | Existing behavior | Extension point |
| --- | --- | --- |
| `src/lib/media.ts` | PDF sniffing/media tabs, 25,000,000-byte media cap, object URLs and close guards | Keep file acquisition here; retain original bytes and a stable document ID |
| `src/components/pdfedit/PdfInlineEditor.tsx` | Edit-copy mode, selectable viewer, undo/redo, save-copy command and unsaved indicator | Keep this host and move new tools into context panels/commands |
| `src/lib/pdfview/types.ts`, `pdfjsBackend.ts` | Backend-neutral document/page handles, lazy PDF.js, copied worker input, text layer, viewport coordinate transform | Extend read-only queries without coupling tools to PDF.js internals |
| `src/lib/pdfedit/session.ts` | Per-media-name sessions, bytes, fields, search, dirty/busy state; byte-snapshot undo/redo | Add identity/revision/export checkpoints, not a second session store |
| `src/lib/pdfedit/workerClient.ts` | Fresh module Worker per job, 20-second watchdog, termination | Preserve isolation; add cancellation and request validation |
| `src/lib/pdfedit/backend.ts` | Inspect signature/encryption/XFA; rotate/delete/move/insert pages, added text, annotations, comments and field design | Dispatch new commands through the same edit safety gate |
| `src/lib/pdfannotate/export.ts` | Real `/Annots`, appearance streams, existing annotations retained, skip reporting | Reuse annotation objects, do not bake overlays into page screenshots |
| `src/lib/pdfforms/forms.ts` | AcroForm list/fill, validation, appearance generation, optional flatten | Expose flatten explicitly; keep failures atomic at the session boundary |
| `src/lib/pdftext/index.ts` | Narrow fail-closed direct-stream text replacement | Expose only inspected editable runs, never advertise arbitrary paragraph editing |
| `src-tauri/src/pdf_io.rs` | Native save grant, 120-second TTL, single-use token, temporary file + rename, PDF extension/header and size checks | Reuse the grant path; test platform-specific replacement behavior |
| `pdf-craft/` | Isolated Rust/WASM render experiment, not the production renderer | Separate future engine spike and artifact license inventory |

Important baseline limits:

- Editing refuses encrypted, signed and XFA documents. `ignoreEncryption: true`
  in inspection is **not decryption** and must never become an edit bypass.
- The edit backend caps inspection at 25 MB and 2,000 pages. It rejects deleting
  a page with form widgets and importing a source with AcroForm fields.
- The existing `text` edit adds Helvetica content. It does not replace existing
  glyphs or remove covered text. Existing form fills are WinAnsi-limited.
- `pdftext` accepts isolated positioned `Tj` runs with unembedded Latin
  Standard-14 Type1 fonts. It rejects custom/subset fonts, `TJ` arrays, form
  XObjects, unsupported operators, stale targets and wider replacements.
- Undo stores at most 20 snapshots and at most 100,000,000 bytes **per stack**;
  those are not an app-wide memory cap.
- The viewer can open a password-protected file for viewing. Session editing
  remains blocked and the password is not part of the editing model.
- Documents studio routing currently handles DOCX, not PDF; PDF editing is
  hosted by the existing media/Code surface. The task's "pdf-markup studio" is
  a useful product name, not an existing `pdf-markup` registry ID at this commit.
- `docs/pdf-editor/architecture.md` is partly an older skeleton. Its final naming
  note keeps `<module>.<verb>`; do not reintroduce the old `pdf-text-*` scheme.

## 2. Library and license evaluation

This checks official license files and published artifacts. It is a technical
inventory, not a legal opinion or a complete audit of every transitive dependency.

| Candidate | Verified license evidence | Local-first fit and limits | Recommendation |
| --- | --- | --- | --- |
| `pdf-lib` 1.17.1 | Actual npm archive `LICENSE.md`: MIT | Pure JS/TS; create/modify pages, embed fonts/images, forms. No renderer, general page-text editing API, general text extraction or encrypted-document support | Keep as edit/export engine for supported operations |
| `pdfjs-dist` 6.4.299 | Actual npm archive `LICENSE`: Apache-2.0; several separately licensed assets below | Existing viewer, selectable text, password viewing, page transforms; not a general object editing backend | Keep renderer; explicitly package approved local assets |
| MuPDF.js / MuPDF WASM | Official repository `LICENSE`: GNU AGPLv3; official FAQ applies dual AGPL/commercial licensing to JS wrapper and WASM | Attractive render/extract/annotation engine, but WASM isolation does not change its license | Exclude open-source route; commercial alternative is outside scope |
| PDFium core | Official `LICENSE` contains BSD-style PDFium terms and Apache-2.0 text | C/C++ renderer, extraction and object-level APIs; native builds need platform binaries; WASM needs memory/lifetime management | Eligible engine family, not blanket approval of any binary |
| `@embedpdf/pdfium` 2.15.1 | Actual npm archive `LICENSE`: MIT wrapper; `LICENSE.pdfium`: BSD-style PDFium and Apache terms | JS/WASM candidate with explicit malloc/free and PDFium handles; can be locally served | Preferred web spike, pending complete binary dependency/build provenance audit |
| `pdfium-render` 0.9.4 | Repository `Cargo.toml` and `LICENSE.md`: `MIT OR Apache-2.0` | Rust wrapper, native late binding and WASM route; separately supplied PDFium binary is still required | Native spike candidate, not a new beta.6 production dependency |

### Artifact checks and material exceptions

Downloaded and inspected these published tarballs directly:

- `https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz`
- `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz`
- `https://registry.npmjs.org/@embedpdf/pdfium/-/pdfium-2.15.1.tgz`

In `pdfjs-dist` 6.4.299:

| Asset license file | Finding | Packaging action |
| --- | --- | --- |
| `wasm/LICENSE_JBIG2` | BSD-style PDFium terms | Retain notice if shipped |
| `wasm/LICENSE_PDFJS_JBIG2` | Apache-2.0 | Retain license and applicable notices |
| `wasm/LICENSE_OPENJPEG`, `LICENSE_PDFJS_OPENJPEG` | BSD-2-Clause-style terms | Retain notices |
| `wasm/LICENSE_QCMS`, `LICENSE_PDFJS_QCMS` | MIT-style terms | Retain notices |
| `standard_fonts/LICENSE_FOXIT` | BSD-style terms | Approved font family subject to notices |
| `standard_fonts/LICENSE_LIBERATION` | GPLv2 + font embedding exception | Exclude the four `LiberationSans-*.ttf` files; do not copy the directory wholesale |
| `cmaps/LICENSE` | Adobe BSD-style terms | Retain notice |
| `iccs/LICENSE` | CC0-1.0 | Record in inventory |

The current PDF.js adapter does not set `standardFontDataUrl`, `cMapUrl` or
`wasmUrl`. Source review therefore does **not** establish that Liberation fonts
are currently distributed or used. Check the actual desktop/web bundles before
calling the current release compliant or noncompliant. Local asset packaging
needs an allowlist and font-fallback corpus tests; removing a fallback font can
change rendering. Do not silently substitute metrics and claim exact fidelity.

No MPL-2.0 component was established among the named root packages. If a pinned
engine graph introduces MPL-2.0, list the exact files/crate and modified-source
obligations in Settings > Licenses and the distribution notices, with an explicit
MPL flag like the existing mediabunny note. Do not mislabel MPL as permissive or
ban it under the no-GPL rule. Other asset licenses, such as CC0 or font licenses,
need their own inventory entry rather than being hidden under Apache.

There is a version-dependent EmbedPDF discrepancy: the inspected 2.15.1 npm
package is MIT, while the current repository describes SDK packages as Apache-2.0
and its CloudPDF server as FCL-1.0-ALv2. Do not copy that server or assume the entire
repository is permissive. Pin the exact artifact, read its own licenses and audit
its compiled engine dependencies before distributing it. A top-level license
file is insufficient proof of a prebuilt WASM binary's complete provenance.

Source clones inspected for license corroboration:

- pdf-lib: `93dd36e85aa659a3bca09867d2d8fac172501fbe`
- MuPDF.js: `f97c0a0a924c8aaec5b8fe656bc430eb0a7d8f89`
- EmbedPDF: `2516e2786ee894383220ecd436fbd248182ef444`
- pdfium-render: `ea2961cb8ac777bb1a06dddb8efd272d34d74f18`

These moving upstream snapshots are evidence records, not recommended production
pins. PDFium integration requires a chosen binary version, ABI/API match, build
flags, checksum, complete third-party licenses and reproducible build provenance.
Start with V8/JavaScript and XFA disabled. Use worker/process isolation appropriate
to the build; a WASM module alone does not bound decompression or memory growth.

## 3. Import and document model

### Open without conversion

1. Acquire local PDF bytes through the existing file/media flow. Sniff the header,
   cap input before parsing, and keep an immutable original byte snapshot.
2. Start independent bounded viewing and inspection jobs. A successful view is
   not evidence of editability. Preserve a specific view-only reason when edit
   inspection fails instead of swallowing it into a generic disabled button.
3. Report pages/boxes/rotation, encryption, signatures, XFA and supported form and
   annotation capabilities. Call signature detection "signature present", not
   "signature valid"; the current scan is not cryptographic verification.
4. Never execute document JavaScript, auto-open links, fetch remote resources,
   run embedded files or follow document-provided instructions. External links
   require explicit user action and safe URL handling.
5. Keep PDF as PDF. Optional conversion to Documents/Designer is a separate,
   clearly lossy workflow, not an invisible import step.

Proposed session additions (adapt, do not replace `PdfSession`):

```ts
interface PdfDocumentIdentity {
  documentId: string;       // stable, not the display filename
  sourceHash: string;
  revision: number;
  exportedHash: string | null;
}
interface PdfCapabilities {
  view: boolean;
  annotate: boolean;
  organize: boolean;
  fillForms: boolean;
  designForms: boolean;
  replaceText: "none" | "restricted-runs";
  reason: string | null;
}
```

Filename-keyed sessions can be replaced when a same-name media item arrives.
Retain that existing close/replacement behavior until stable IDs are migrated
across media and PDF together. Results must carry document identity, source hash
and revision, so a closed/reopened tab cannot accept a stale worker response.

### Geometry and reading

Store edits in PDF user-space coordinates, zero-based page indexes. UI page
numbers stay one-based. Use the existing viewport matrix and `fieldGeometry`
projection helpers, including CropBox offsets and page rotation. CSS pixels,
device pixels and points must never be mixed. Test all right-angle rotations,
nonzero/negative box origins and zoom/device-pixel ratios before new placement tools.

Expose structured text items/quads through an optional backend-neutral query;
keep PDF.js rendering/text selection separate from editable content-stream targets.
Visual text extraction has no guaranteed mapping to source operators or reading
order. Search uses extracted text, not the restricted replacement scanner.

## 4. Edit transactions

Keep `editPdf` / `commit` as the shared user and AI transaction boundary:

1. Validate command parameters, limits and current capability in the Worker.
2. Apply to a copied current byte snapshot, never the original source.
3. Return complete candidate bytes plus warnings and a source-revision token.
4. Reinspect the candidate. Reject stale, timed-out or invalid results atomically.
5. Update bytes, capabilities, fields, history and dirty state once. Invalidate
   page/text/search caches by document revision.

Use the project's existing `<module>.<verb>@version` convention for persisted
operations. Do not store raw PDF engine handles or typed-array blobs in JSON;
merged sources and inserted images use content-addressed asset references.
Existing backend `kind` commands can remain an adapter during migration.

Keep the 20-second watchdog and expose cancel. Validate Worker message kinds
explicitly; an unknown kind must not fall through to a form-fill request. Add
per-job input/output/page/pixel limits and an app-wide history/memory budget.
A watchdog is a responsiveness bound, not proof of parser security.

### Beta.6 feature scope

- **Organize**: thumbnail selection; rotate/reorder/delete; extract selected pages;
  insert/merge supported PDFs. Preserve the existing form-widget and source-form
  restrictions until field/page relationships and appearance streams are tested.
- **Markup**: keep real highlight/underline/strikeout/ink/note objects, comments,
  replies and property editing. New placement uses the existing coordinate path.
- **Add content**: added text and PNG/JPEG placement with preview. Helvetica's
  encoding limits must produce a useful error; non-Latin support requires audited
  local font assets, embedding and explicit font coverage checks.
- **Forms**: fill/design existing supported AcroForms and explicit flattened-copy
  export. Never silently flatten, delete XFA or discard field errors.
- **Source text**: wire the existing restricted `pdftext` scanner/replacer behind
  capability checks and expected-text matching. Label it "Replace supported text",
  not "Edit any PDF". Do not increase scanner coverage without a fixture for each
  newly accepted operator/font case. OCR is not included.
- **Metadata**: optional title/author/subject editor with deliberate retention or
  removal choices; metadata removal alone is not document sanitization.

Do not call white rectangles, black overlays, deleted annotations or text
replacement **redaction**. Secure redaction must remove underlying content,
shared XObjects, hidden text, metadata, attachments and relevant prior revisions,
then verify that export cannot recover it. Defer until a dedicated removal engine
and hostile corpus exist. Likewise, a drawn signature is not a cryptographic
signature. Encryption/decryption, signing, PDF/A, PDF/UA compliance, OCR and reliable
PDF-to-DOCX reconstruction are separate projects, not unchecked export toggles.

## 5. Export and save safety

The default remains **Save edited copy**, using `exportPdfCopy` and native grants.
Export PDF bytes, not a screenshot of the viewer. Preserve annotations and form
interactivity unless the user explicitly chooses a flattened variant.

Proposed export modes:

| Mode | Contract |
| --- | --- |
| Original PDF | Return original bytes exactly when no transformation is requested |
| Edited PDF copy | Full rewrite of supported edits; disclose signature/preservation limits |
| Flattened AcroForm copy | Deliberate destructive conversion of fields; verify visible appearances |
| Selected pages PDF | Copy selected supported pages; warn/block unsupported form/bookmark relationships |
| PNG/JPEG pages | Explicit raster export at chosen resolution, with pixel/memory cap; never the default PDF save |

Before export, reopen candidate bytes through the edit inspector and renderer,
check page count/geometry and annotation/form outcomes, and display any omissions.
No claim of byte-identical preservation, incremental save, linearization,
accessibility-tag retention or font-perfect conversion without its own test.

Native save success should mean write completion, not merely a selected filename.
The temporary-file/rename helper needs real Windows/macOS overwrite and failure
checks; source comments do not establish cross-platform crash durability. Browser
anchor download is only a download initiation: it cannot prove the file reached
disk. Track "export requested" separately from a native confirmed-save checkpoint
and avoid making browser dirty-state wording promise verified persistence.

Future in-place save requires an explicit user-controlled save mode, fresh file
permission, conflict detection and a safety copy. Do not smuggle overwrite into
beta.6 copy export. Preserve close warnings, Ctrl+S routing and revision-aware dirty
tracking when a save runs while the document changes.

## 6. Competitor scope matrix

Vendor pages were read on 2026-10-09. This is a feature-scope comparison, not a
hands-on quality test or a complete plan/price comparison. "Not established"
means the reviewed evidence does not establish it, not that the product lacks it.

| Task | Acrobat | PDF24 | Smallpdf | Somnia beta.6 target |
| --- | --- | --- | --- | --- |
| Add text/images and markup | Vendor documents text/image editing and comments | Tool suite/editor; do not equate added text with source-text replacement | Added text/images/shapes/highlights/notes | Local add-content + real markup |
| Change existing page text | Documented, including scanned-PDF OCR | Help thread says unfinished; dated community/support evidence, not a current exhaustive product test | Direct editing is Pro according to editor FAQ | Restricted supported runs only |
| Organize/merge/extract | Documented PDF tool family | Creator documents merge/split and page assembly | Editor documents organize/rearrange/merge/extract/split | Prioritize organize and extract |
| OCR | Documented OCR to editable/searchable content | Creator documents local OCR/text layer | Editor FAQ refers scans to OCR tool | Defer; no false scanned-text edit promise |
| Forms | Adobe help documents filling and design tools | Dedicated form authoring not established by reviewed pages | Dedicated form authoring not established by reviewed editor page | Preserve existing AcroForm support |
| Secure redaction | Acrobat Pro help documents redaction | PDF24 landing lists redaction; removal quality not tested | Not established by reviewed editor page | Defer; no overlay-as-redaction |
| Local/offline path | Desktop/mobile/web product family | Creator explicitly offline, Windows-only; separate online tools | Reviewed editor is an upload-based online workflow | Local browser/Tauri bytes, no uploads/CDN dependency |

What matters now: a trustworthy local copy-edit flow, fast navigation, predictable
page organization, interoperable annotations and forms, and honest text-edit
limits. Acrobat's deeper removal/OCR/reflow features are useful longer-term targets,
not a reason to ship fake equivalents. PDF24's local task toolbox is the stronger
near-term scope reference; Smallpdf's focused editor/organizer flow is a UX reference.

## 7. Acceptance and release gates

### Automated checks

- Test supported input and malformed/truncated PDFs, over-limit files/page counts,
  decompression-heavy streams, timeouts, cancellation and stale worker replies.
- Verify operations leave input bytes unchanged and failure creates no history
  entry, dirty change or partial file. Undo/redo and export checkpoints use hashes.
- Round-trip annotate/comment/reply/form-fill/design and supported page operations.
  Verify annotations and widget references after reorder/extract/merge.
- Keep signed/encrypted/XFA view-only gates across every edit/flatten/export path;
  presence detection is not signature validation.
- Include embedded/subset/CJK fonts, unsupported `TJ`, form XObjects and scanned
  pages to prove restricted text editing fails closed. Cover stale-run and overflow.
- Inventory final JS, Workers, WASM, fonts, ICCs and CMaps with hashes and licenses.
  Fail release packaging if Liberation GPL assets or any GPL/AGPL component appear.
- Offline network test: no document uploads, CDN fonts, remote CMaps/WASM or hidden
  resource fetches. Approved packaged resources load under production CSP.

### Visual and interoperability checks required before shipping implementation

Render actual imported and exported fixtures in Somnia and an independent viewer
(Acrobat plus a PDFium-based viewer where available). Inspect pixels for rotation,
CropBox offsets, fonts, annotation opacity/blending, form appearance, added images,
selected text and search overlays. Cover Windows WebView2 and macOS, plus supported
browsers. Verify real file dialogs, cancellation, overwrite failures and reopening.

No new engine benchmark or visual implementation test was run for this research
patch. Existing source tests and the one-fixture PdfCraft experiment are not proof
of arbitrary-PDF correctness or beta.6 release readiness.

## Sources

Official library/license evidence:

- PDF-LIB product and API scope: https://pdf-lib.js.org/
- PDF-LIB README limitations/license: https://github.com/hopding/pdf-lib
- PDF.js license: https://github.com/mozilla/pdf.js/blob/master/LICENSE
- Exact npm artifact URLs: listed in section 2; actual license files were read.
- MuPDF.js README/licensing: https://github.com/ArtifexSoftware/mupdf.js/blob/master/README.md
- MuPDF wrapper/WASM dual-license FAQ: https://mupdfjs.readthedocs.io/en/latest/faq/index.html
- PDFium core license: https://pdfium.googlesource.com/pdfium/+/HEAD/LICENSE
- EmbedPDF published package evidence: https://registry.npmjs.org/@embedpdf/pdfium
- EmbedPDF PDFium license file: https://github.com/embedpdf/embed-pdf-viewer/blob/main/packages/pdfium/LICENSE.pdfium
- EmbedPDF memory/handle integration: https://www.embedpdf.com/docs/pdfium/getting-started
- EmbedPDF current repository license scope: https://github.com/embedpdf/embed-pdf-viewer
- Rust binding capabilities/license: https://github.com/ajrcarey/pdfium-render/

Vendor scope and community/support evidence:

- Acrobat editing, OCR, images and comments: https://www.adobe.com/acrobat/features/modify-pdfs.html
- Acrobat text/font editing details: https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html
- Acrobat Pro redaction/form documentation: https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html
- PDF24 tool family: https://www.pdf24.org/en/
- PDF24 Creator offline/Windows/OCR/page tools: https://tools.pdf24.org/en/creator
- PDF24 existing-text limitation (dated thread, not live feature validation): https://help.pdf24.org/en/forums/topic/ability-to-edit-existing-text/
- Smallpdf editor, organizer, Pro text editing and OCR FAQ: https://smallpdf.com/edit-pdf

Independent implementation baseline: the pinned Somnia checkout and source paths
in section 1. Vendor claims were not turned into performance or security guarantees.
