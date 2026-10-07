# PDF viewer base (handover)

Base: `somnia-agent` @ `427f8db`. Branch: `feature/pdfview-base`. No push, PR or CI run.

## What it is

A read-only PDF viewer: load, render one page on a canvas, zoom, pan, page navigation, rotate, optional selectable text layer. It is the base for later PDF editing (`components/pdfedit`). No editing, no saving, no annotations.

- `phase1/src/lib/pdfview/viewState.ts` - pure view state (page, zoom, fit, pan, rotation) and math. No DOM.
- `phase1/src/lib/pdfview/types.ts` - backend-neutral contracts (`PdfBackend`, `PdfDocumentHandle`, `PdfPageHandle`, `PdfLoadError`). The viewer only depends on these.
- `phase1/src/lib/pdfview/load.ts` - `loadPdf`: size limit (200 MB), `%PDF-` sniff, error mapping (`not-pdf`, `too-large`, `password`, `invalid`, `aborted`, `unavailable`).
- `phase1/src/lib/pdfview/pageCache.ts` - LRU of page handles (default 4); evicted pages are cleaned up.
- `phase1/src/lib/pdfview/pdfjsBackend.ts` - pdf.js adapter, lazy `import('pdfjs-dist')`. `pdfjsBrowser.ts` supplies the Vite worker URL (`?url`).
- `phase1/src/components/pdfedit/PdfViewer.tsx` - React component.

```tsx
<PdfViewer data={uint8Array} name="a.pdf" textLayer onError={e => ...} onPageChange={p => ...} />
```

`data` is copied before it goes to the worker, so the caller's bytes stay valid. A new `data` instance reloads.

## Controls

Ctrl/Cmd+wheel zooms around the cursor. Plain wheel and drag pan. Double-click toggles 100 %/200 %. Keys (viewer focused): `+`/`-`/`0`, arrows pan, PageUp/PageDown, Alt+Left/Right, Home/End. Toolbar: prev/next, page box (Enter to jump), zoom -/+, Fit width, Fit page, rotate. Zoom range 10 %-800 %. Canvas backing store is capped at 16 MP (render scale drops, CSS size stays). DPR capped at 3.

## Dependency: pdfjs-dist 6.4.299 (exact pin)

- License Apache-2.0 (the lock entry says so), compatible with MIT repo. Unpacked package is 35 MB, but only the lazy chunk plus worker ship; it is not in the main bundle.
- Why pdf.js: only candidate with a maintained renderer, text layer and worker in the browser/webview; `pdf-lib` (already a dependency) cannot render, `unpdf` only extracts text. Research of alternatives (mupdf, licence check) is the parallel w4 task, not repeated here.
- **Flag:** this is a new heavy dependency. Drop `package.json`/`package-lock.json` hunks if the builder decides otherwise; the viewer then only needs another `PdfBackend`.

## Tests

`npm run test:core` now includes `src/lib/pdfview/*.test.ts` (node:test via tsx): 19 view-state/load/cache tests with fakes plus 2 smoke tests (21 total, all pass) against real pdf.js (legacy build, Node: parse, page count, size, text, invalid file). Node 22 lacks `Promise.try` which pdf.js 6 needs; the test polyfills it. `tsc --noEmit` clean. The pdf.js smoke test takes ~6 s.

Browser check (headless Chrome via a throwaway Vite page, not committed): a 3-page generated PDF rendered on canvas, fit width gave 323 %, next page and zoom step worked (page 2, 400 %), text layer contained "Page 2 hello", screenshot inspected (text and blue rect correct, toolbar laid out).

## Open (honest list)

- Not wired into the app. `MediaViewer` still uses the `<iframe>` for PDFs; the builder must switch it to `PdfViewer` and feed bytes (Tauri: binary response, not base64 IPC).
- Production build with the viewer mounted not run: the worker asset emission via `?url` and the desktop CSP (`worker-src`, blob/`'wasm-unsafe-eval'` for pdf.js wasm decoders) are unverified. `vite build` of the current tree passes without the viewer imported.
- Webview support: pdf.js 6 needs modern JS (`Promise.try`). WebKitGTK/older WKWebView may lack it; untested on Windows/macOS/Linux webviews. The pdf.js legacy build is the fallback.
- Single page at a time, no continuous scroll, no thumbnails, no search, no print.
- Text layer is minimal: no pdf.js `textLayer.css`, only transparent text; selection highlight and link annotations untested.
- Strings are hard-coded English; not in `locales/` (5 languages) yet. Toolbar styling is basic, no icons (Vadivam set not used), no theme pass.
- Password prompt exists but is untested. Encrypted/corrupt PDFs beyond the garbage case untested.
- No touch pinch zoom. Rendering runs on the main thread; pdf.js parsing is in its worker.
- Playwright/browser test not added to the repo.
