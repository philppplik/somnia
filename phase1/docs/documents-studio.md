# Documents Studio (package 1: view and save a copy; package 2: plain paragraph text editing)

Opening a `.docx` switches to the Documents Studio (unless the user picked a Studio manually). Pages are
parsed, laid out and rasterised by the headless WordCraft engine (Rust/WASM) in a dedicated Worker.
The main thread only holds UI state and receives PNG blobs.

## Pieces
- `documents/`: pinned upstream commit, adapter patch, build script, notices. `npm run documents:build`.
- `src/lib/documents/`: `protocol.ts` (typed RPC), `core.ts` (session logic, testable without a Worker),
  `worker.ts`, `engine.ts` (serial queue, 20 s timeout that terminates a stalled worker), `inspect.ts`
  (ZIP-directory risk scan), `text.ts` (UTF-16 to UTF-8 offsets), `saveCopy.ts`.
- `src/lib/studios/documents.ts`: Studio manifest. `documentsRouting.ts`: DOCX opens switch Studio, manual choice wins.
- `src/components/documents/DocumentsCanvas.tsx`: page column with IntersectionObserver virtualisation, zoom, error and loss dialogs, inspector.

## Honest limits
- Viewing, plain-text paragraph editing and "Save a copy". The original is never overwritten. If the file has charts, comments, images,
  headers/footers, notes, embedded objects or macros, a dialog lists them before the copy is written, because
  the engine skips unknown XML and saving can drop it.
- Fonts are the engine's bundled ones; layout can differ from Word. Only synthetic fixtures are tested so far.
- The engine accepts up to 16 MiB. Zoom 50 to 200 percent. Raster side is capped at 2400 px by the engine.
- Editing (package 2) is per top-level paragraph in the inspector, not on the page: the adapter exposes `blocks()`
  (index, kind, text, editable) and an atomic `replace_range` (UTF-8 byte range, checked on a clone, tables and
  paragraphs with inline objects such as images/fields/comments are refused, no line breaks). The host sends the
  minimal diff of a paragraph (`edit.ts`), keeps its own undo/redo of inverse edits, and re-renders pages.
- Package 3 (run-exact edits): the host sends a code-point diff as several hunks (`replace_ranges`, ascending non-overlapping UTF-8 ranges, applied atomically on a clone), so untouched runs keep their formatting. Inserted text inherits: first replaced char (replacement), char before (insertion), char after (paragraph start), paragraph mark (empty paragraph). Remaining limits: replaced text takes the first replaced char's format; no per-run formatting UI.
- Package 4 (on-page caret): click places a caret, drag or Shift+arrows select, inside one top-level paragraph. Geometry comes only from the engine (`hit_test`, `caret_at`, `selection_rects`, page units; the host scales by zoom). Keyboard, IME and clipboard go through an invisible textarea that never holds document text: typing, Backspace/Delete (by grapheme), Left/Right (cross into neighbouring editable paragraphs), Up/Down/Home/End (via line geometry), Ctrl+A (paragraph), copy/cut/paste as plain text, Ctrl+Z/Y. Consecutive typing within 1.2 s is one undo step. Clicks on tables or paragraphs with objects show a notice and place no caret.
- Package 5 (split/join): Enter replaces the selection and splits the paragraph (`split_block`, new paragraph copies the paragraph properties); Backspace at paragraph start or Delete at its end joins neighbouring plain paragraphs (`merge_with_previous`, the first paragraph keeps its properties). Paragraphs with section breaks, objects, or tables are refused. Undo/redo of these steps restores cheap block-list snapshots (`snapshot`/`restore`, blocks are shared not copied).
- Limits: pasted line breaks become spaces, selections stay inside one paragraph, no word-wise movement, IME composition is committed at the end and not previewed on the page, Up/Down does not cross page boundaries, no formatting UI.

## Next packages
1. Multi-paragraph selection, word-wise movement, IME preview, per-run formatting commands.
2. Save in place through the project file bridge with backup and loss-detection gates.
3. Real-world DOCX corpus, fidelity fixes, fuzzing, memory budget, WebView2 check on Windows.
4. Agent tools for the Documents Studio (read text, propose edits) via the studio manifest.

## Verification (package 6)
- Corpus: `documents/corpus/gen_corpus.py` writes 11 small hand-written DOCX files (multi-run formatting, Unicode/RTL, table, hyperlink and field, numbering, tracked changes, section break, header, line breaks, empty paragraphs, a 900-word paragraph, 300 paragraphs). They are synthetic, not real Word output.
- `cargo test -p wordcraft-somnia-worker --lib` (run by `documents/build.sh`, so by CI) opens, paginates, renders and saves every corpus file and requires save-then-reopen to keep all block texts. A seeded fuzz test applies random replace/split/merge/snapshot-restore/render steps against a plain text model and checks, after every step, that engine and model agree and that locked blocks refuse edits; it saves and reopens every 40 steps. `SOMNIA_FUZZ_ITERS` (default 150) and `SOMNIA_CORPUS_DIR` tune it. 3000 iterations over all 12 files pass locally.
- Measured on the corpus: an unedited save keeps tracked changes, hyperlinks, fields, numbering, section breaks, tables, header parts, bold/italic/colour runs and all text (counts compared in the saved document.xml).
- Not covered: real Word/LibreOffice/Google Docs files, Windows/WebView2 (real IME, clipboard permission, keyboard layouts, high DPI), macOS WebKit, touch, screen readers. Manual WebView2 checklist: open a real .docx; click, type, Backspace/Delete, Enter, Ctrl+Z/Y, Ctrl+C/X/V; type with a Japanese or Chinese IME and confirm the committed text lands at the caret; use dead keys (e.g. German ^ + e); zoom 50% and 200% at 125% display scaling; Save a copy and open it in Word.
