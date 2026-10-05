# Media preview (feat/media-preview)

Native preview for `.md`, `.svg`, `.png`, `.jpg`/`.jpeg` and `.pdf`.

## Behaviour
- `.md` and `.svg` are normal text files in the project. When one is the active file, the preview pane shows a rendered view instead of the HTML design canvas / live preview. Editing the source updates the preview.
- Markdown: own small renderer (`src/lib/markdownRender.ts`): headings, emphasis, code, fenced code, lists (nested, task), tables, quotes, rules, links, images. All text is escaped, raw HTML is shown as text, only http(s)/mailto/#/relative links are kept, remote images are not loaded. Images by relative path resolve to opened PNG/JPEG preview files by file name.
- SVG: shown through `<img src="data:image/svg+xml">`, so scripts in the SVG never run. Fit / actual size toggle, pixel size shown.
- PNG / JPEG / PDF are binary and read-only, so they are not part of the text project (no editing, no save, not exported). They live in `src/lib/media.ts` (object URLs, 25 MB limit, magic-byte check so a renamed file is rejected) and appear as preview tabs and under "Previews" in the Files panel.
- Ways in: Project > Open file (browser dialog accepts them now), new command "Open image or PDF to preview" (works in browser and desktop), drag and drop in the browser.
- PDF uses the webview's built-in viewer in an iframe (blob URL).

## Not done / known limits
- Desktop OS drag and drop of PNG/JPG/PDF is still skipped by `read_dropped_files` in Rust (text only). Needs a Rust change (return bytes) - not made because Rust could not be built in this environment.
- Desktop "Open file" (Rust `choose_file`) is text only; use "Open image or PDF to preview".
- Media files inside an opened folder are not loaded; relative `<img src="a.png">` in HTML preview does not use them yet.
- PDF inline viewer needs WebView2 (Windows) or Chromium. WebKitGTK (Linux) / WKWebView may not render PDFs inline; the "Open" link is the fallback. Not verified there.
