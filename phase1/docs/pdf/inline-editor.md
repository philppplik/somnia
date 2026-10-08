# Inline PDF editor: implemented scope and integration

Base: somnia-agent 23f739980d985792b939942a8182a0babf0e9569.

PDF media tabs now mount `PdfInlineEditor` in the main workspace, replacing
the browser plugin iframe. App's existing left/right slots mount native
React panels; both still collapse and resize through the shell controls.
No floating editor dialog. pdf.js is loaded lazily with a bundled worker;
text selection stays within the document. No scripting manager or annotation
link layer is mounted: PDF JavaScript, actions and sign buttons do not run.

## Working controls

- Explicit read-only -> edit-copy switch; signed or encrypted files stay
  view-only. Password-protected viewing uses the existing pdf.js prompt.
- Pages: lazy visible thumbnails, current-page selection, drag reorder and
  accessible up/down alternatives, real page rotation, delete with confirmation,
  insert pages from another PDF. Last page cannot be deleted. Deleting a page
  with form widgets and importing a PDF containing forms are refused because
  partial AcroForm migration would corrupt form relationships.
- Search: case-insensitive page text, result snippet and page navigation,
  2000 pages/200 results limit. Worker loading has a 20-second abort deadline.
- Add: text overlay, note, rectangular highlight/underline/strikeout with real
  PDF annotation objects. Positions use PDF user-space points, bottom-left;
  they are not misleadingly described as existing-text modification.
- Fields: text, checkbox, radio and single-option list/dropdown values via the
  existing pdfforms implementation. Read-only fields stay disabled. Multi-select
  lists, actions, signatures and buttons are view-only.
- Undo/redo: snapshot history, at most 20 entries and 100 MB per direction.
- Save copy: web download or native one-use PDF save grant, raw bytes, PDF
  extension/header checks and atomic replacement at the user's picked path.
  No automatic source overwrite. The native OS dialog can explicitly choose
  an existing file; that is not presented as an in-place auto-save.
- Dirty tabs display `*`. Closing, replacing or clearing media asks before
  losing edits. Browser unload and native window close also guard dirty PDFs.
  Sessions survive switching file tabs; they are not persistent recovery.

## Engine and worker design

`lib/pdfedit/backend.ts` provides inspection and typed edit operations.
`workerClient` sends each operation to an isolated `worker.ts`, terminating
it on completion/error or after 20 seconds. Original bytes stay immutable on
failed edits. Parser/edit work is not run on the UI thread. This transitional
backend serializes a **full PDF rewrite**, clearly stated in the footer.
It does not claim incremental append saves.

Reorder moves the original page node after normalizing inherited attributes.
Copying the page into the same document was tested and rejected: it clones
widgets away from their AcroForm references. A regression test verifies
`widget.P` still refers to the moved page and later field values appear in the
rendered/externally opened PDF. New-page insertion rejects forms rather than
silently cloning broken field references.

The separate `pdf-craft/` directory contains the pinned, root-patched
Rust-WASM parse/render investigation, measured and actually run in a Worker.
It is **not** wired as the production default; see its README for measurements
and remaining gates. No automatic fallback hides a claimed PdfCraft integration.

## Verification

- Typecheck/build pass, existing chunk warnings remain.
- Final core regression: 1497 passed, 0 failed, 18 skipped, 26 TODO.
  Includes five new PDF edit tests and the abort regression.
- Focused PDF/media/permission suite: 28 passed, including the abort test.
- Real encrypted PDF: password prompt opens with correct password, editing
  stays locked. Signature fixture also locks editing (browser safety harness).
- Native PDF grant/write test passes with no desktop features. Desktop check
  is blocked in this environment by missing `glib-2.0.pc`, not a successful
  desktop compile. Windows/macOS dialogs and close behavior need CI/device test.
- `node pdf-craft/spike/ui-test.mjs` exercises main-container viewing, move,
  search, note, form fill, added text, saved copy, undo/redo, dirty close cancel
  and light/dark screenshots with no page errors. Uses Chrome at a local Vite
  server. This is a dev harness, not a production-Tauri claim.
- Saved copy passes `qpdf --check`. External rendered page 2 shows the moved
  original page, visible filled "Philipp" field, added text and note icon.
  Light/dark screenshots were inspected directly: main page and actual
  thumbnails render, the moved page is selected, both panels fit.

## Still not implemented

Existing-content text replacement; image replacement; freehand ink tool;
comment threads/list/import; bookmarks/attachments UI; crop-space click tools;
redaction; signatures; OCR; comparison/preflight; incremental saves;
new InDesign-like layout documents/IDML. No fake buttons for these features.
Coordinate entry is an initial functional tool, not a final polished PDF UX.
All new visible labels currently use English, not the full localization matrix.

## Builder handoff

Apply the patch series on the stated base. App.tsx, media.ts, FileTabs,
MediaPreview, desktopAdapter and native desktop command registration are
shared integration points with other inline editors; reconcile rather than
blindly overwrite. Keep existing media close guards if other editors add them.
Add tests to the combined regression suite. Do not distribute the unlinked
PdfCraft engine without completing the legal/CSP/corpus gates.
