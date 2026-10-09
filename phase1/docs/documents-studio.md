# Documents Studio (package 1: view and save a copy)

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
- Viewing and "Save a copy" only. The original is never overwritten. If the file has charts, comments, images,
  headers/footers, notes, embedded objects or macros, a dialog lists them before the copy is written, because
  the engine skips unknown XML and saving can drop it.
- Fonts are the engine's bundled ones; layout can differ from Word. Only synthetic fixtures are tested so far.
- The engine accepts up to 16 MiB. Zoom 50 to 200 percent. Raster side is capped at 2400 px by the engine.
- Insert-text exists in the worker API (tested) but has no UI. Editing needs hit-testing, caret, selection, IME, undo.

## Next packages
1. Editing: caret and selection geometry from the engine, keyboard input, undo, UTF-16 mapping through `text.ts`.
2. Save in place through the project file bridge with backup and loss-detection gates.
3. Real-world DOCX corpus, fidelity fixes, fuzzing, memory budget, WebView2 check on Windows.
4. Agent tools for the Documents Studio (read text, propose edits) via the studio manifest.
