# Isolated PdfCraft render bridge

This is a runtime-proven investigation, not Somnia's default PDF engine.
Rust 1.95 is scoped to this directory and does not raise the desktop MSRV.

## Reproduce

Install wasm-bindgen CLI 0.2.129, then `./build.sh`. From `phase1`, run
`node pdf-craft/spike/bench.mjs` (Playwright and Chrome required). The script
uses `/usr/bin/google-chrome`, generates a PDF with real Helvetica text and
one colored rectangle, opens it in a **module Worker**, calls PdfCraft's
`inspect` and `PageRenderer`, displays returned pixels, measures times and
captures a screenshot. Generated artifacts in `pkg/` are not committed.

## Narrow graph and patch gate

Only `pdfcraft-render` is linked, not the full facade, JS interpreter,
signing, automation, or product UI. All five Cargo root patches point to
PdfCraft revision f70c4caac902086fdc4cfbec7fc94c109f4a89d2. The committed
lockfile confirms patched hayro/hayro-interpret/hayro-syntax/hayro-jbig2/lopdf.
Git dependency workspace patches do not propagate on their own.

The bridge accepts bytes, no filesystem paths. It caps input at 25 MB,
page count at 2000, render scale at 4, and validates page index/finite scale.
This does not make hostile PDFs safe: render crate limits and a single
synthetic fixture do not establish a fuzzed corpus or bounded decompression.
Production integration must use a killable worker with a watchdog and
smaller page pixel budget; the benchmark intentionally terminates each worker.

## Measurements (Chrome 154, shared Linux host, 2026-10-08)

400 × 500 pt, 1 page, standard font text + filled rectangle, scale 1.
First worker: init 65.0 ms, parse/inspect 20.3 ms, render 104.8 ms,
roundtrip 215.9 ms. Three subsequent freshly-created workers: init
40.8–41.1 ms, parse 13.7–14.0 ms, render 61.8–69.7 ms, roundtrip
127.1–144.2 ms. These use shared host/browser caches, not cold-device numbers.

| Artifact | raw bytes | gzip | Brotli |
| --- | ---: | ---: | ---: |
| WASM | 5,213,576 | 1,926,466 | 1,494,367 |
| JS glue | 11,481 | 2,992 | 2,688 |

Compression: Node zlib default settings. Compile succeeded as a **linked
release binary**, followed by actual browser Worker execution. The separate
T1 compile-only result is not being presented as runtime proof here.
Screenshot inspection confirms correct text and blue filled rectangle.
No performance or correctness claim for arbitrary PDFs or Windows WebView2.

## Decision

PdfCraft is viable for further work, not disproven. Do not replace the
existing pdf.js renderer after this one-fixture proof. Somnia's delivered
inline editor uses pdf.js for visible/selectable pages and text search,
and a separate killable pdf-lib Worker for copy edits. It does not ship this
5.2 MB engine or its license graph in the production UI bundle. Next gates:
corpus comparison, password/rotated crop-box tests, render tiles/cancellation,
worker timeout behavior, production CSP/assets, full legal inventory, and
real Windows/macOS testing. Incremental save remains future work.

Sources read directly from pinned repository clones:
https://github.com/philppplik/pdfcraft
https://github.com/philppplik/somnia
