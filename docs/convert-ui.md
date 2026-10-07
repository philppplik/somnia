# Convert files (UI)

Tools > Convert files... (`tools.convert`, command palette too). Local only, nothing is uploaded.

- Sources: drop files on the zone, "Choose files", or (desktop) OS drop onto the zone (up to 5 files / 10 MB each via the existing chat-drop grant; use "Choose files" for bigger batches).
- Detection: content signature first (PNG/JPEG/GIF/WebP/BMP/PDF), then extension, then text sniffing. A file whose extension promises a binary format without its signature is "Unrecognised".
- Pairs: md->html/txt, html->md/txt, txt->html/md, csv->json/tsv/html, tsv->csv/json, json->csv, svg/gif/bmp->png/jpg/webp, png<->jpg<->webp. PDF is detected but has no target.
- Image pairs use the browser canvas. Output MIME and file signature are checked, so an unsupported encoder fails loudly instead of silently producing PNG. JPEG is flattened on white. 16 MP limit.
- Batch: up to 100 files, sequential, failures do not stop the rest, Stop keeps finished outputs. Name clashes become "name (2).ext" (checked against the target folder).
- Destination: folder picker (File System Access API, Chromium/WebView2) or downloads (several files as one zip). No Rust changes.
- Code: `phase1/src/lib/convert/*` (pure, tested), `phase1/src/components/ConvertDialog.tsx`.
