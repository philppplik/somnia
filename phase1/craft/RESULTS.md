# T1 measured results, 2026-10-08

## Verdict

**Yes**, selected PhotoCraft headless engine crates build to wasm32 and run
an actual Gaussian blur inside a browser module Worker. No JavaScript blur
implementation is substituted. This validates a minimal `somnia-craft`
bridge, not production integration or all three product engines' runtime APIs.

## Measurement conditions

Rust 1.95.0 / wasm-bindgen 0.2.129. Release with size optimization, fat LTO,
raster/algo opt-level 3. Headless Chrome 154 on shared Linux x86_64;
`hardwareConcurrency=2`, `crossOriginIsolated=false`. Local HTTP server,
application/wasm MIME. No browser cache before worker init. Loop of six runs
per size: first discarded, median/min/max of remaining five. RGBA8 generated
checkerboard plus color gradient, Gaussian radius 4, all pixels returned.
`jobMs` includes input JS-to-WASM copy, surface creation, filter, RGBA extraction
and WASM-to-JS copy. Round trip includes dispatch and response transfer.
Numbers vary with host contention and are not a user-device performance claim.
A second independent browser run reproduced checksum and all checks; medians
were 17.3 / 77.2 / 297.6 ms, illustrating that host variability.

| Fixture | Worker job median | min..max | Main-thread round trip median |
|---|---:|---:|---:|
| 256 x 256 | 43.4 ms | 16.7..61.1 ms | 48.5 ms |
| 512 x 512 | 88.9 ms | 60.2..98.1 ms | 110.1 ms |
| 1024 x 1024 | 324.7 ms | 207.5..344.3 ms | 404.3 ms |

Initialization inside Worker: 55.4 ms (fetch + compile/instantiate).
Cold worker creation + initialization round trip: 77.8 ms.

| Artifact | Raw bytes | gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| WASM | 812,329 | 399,620 | 342,549 |
| Generated JS glue | 6,171 | 1,886 | 1,674 |
| Standalone bundled worker (includes glue) | 5,811 | 1,957 | 1,739 |
| Vite production worker (includes glue) | 3,018 | 1,395 | 1,243 |
| Vite production test adapter/main JS | 2,122 | 1,040 | 912 |

Production test payload WASM + worker + main JS totals 817,469 raw bytes,
402,055 gzip bytes, 344,704 Brotli bytes. Do not add generated glue again;
it is included in the worker. Compression measured with Node zlib defaults,
not estimates printed by Vite (whose gzip configuration differs).

## Correctness and checks

- Three Rust tests passed: validation/identity, impulse spread/alpha behavior,
  native fixture checksum matching actual WASM output (FNV-1a 3228279209).
- Browser checks passed: input buffer detached after transfer; correct output
  length and changed image; radius-zero identity; bad byte length rejected;
  NaN radius rejected; next operation succeeds after errors.
- Strict typecheck of adapter/worker passed. Full Somnia `npm run typecheck`
  and `npm run build` also passed; existing chunk/dynamic-import warnings
  remain. The adapter is not imported by the main app, so these app builds
  do not add WASM to the current shipping app bundle.
- Vite production build passed; real browser production adapter check passed
  including hashed WASM URL and dispose rejection. No Tauri runtime test.
- Actual rendered screenshot inspected: before checkerboard sharp, after
  blurred, no missing regions. Edge fade is visible and measured, not hidden.

## Important upstream behavior

An opaque input's top-left alpha is **77**, center alpha **255** at radius 4.
Upstream treats pixels outside document bounds as transparent, so blur fades
edges. The initial opaque-alpha test failed and was replaced with an explicit
regression assertion for the observed semantics. This is a blocker for blindly
replacing Somnia's existing filters. Choose/document clamp vs transparent
boundary policy and test it before production integration.

## Dependencies and provenance

Somnia base: `23f739980d985792b939942a8182a0babf0e9569`.

- PhotoCraft: https://github.com/philppplik/photocraft,
  revision `c833294e34124eb8025de91627eb5a2d3a50f422`.
  Verified Cargo manifests, raster/algo implementation, NOTICE, ATTRIBUTION,
  license texts and actual compile/runtime execution.
- DesignCraft: https://github.com/philppplik/designcraft,
  revision `14e677b24216396e398823ff034d9882322362d1`.
- PdfCraft: https://github.com/philppplik/pdfcraft,
  revision `f70c4caac902086fdc4cfbec7fc94c109f4a89d2`.
- wasm-bindgen CLI binary used:
  https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.129/wasm-bindgen-0.2.129-x86_64-unknown-linux-musl.tar.gz

PhotoCraft's full engine facade passes `cargo +1.95.0 check --locked
--target wasm32-unknown-unknown -p photocraft-engine` (one dead-code warning).
DesignCraft's full engine facade also passes the corresponding locked wasm32
check. Compile checks produce metadata, not linked executable WASM, and do
not establish bundle size or runtime correctness for either full facade.

PdfCraft's full engine facade also passes the corresponding locked wasm32
check (two upstream render warnings). Its vendored hayro/lopdf fixes remain
active because the check runs inside the original workspace.

| Full facade compile check | Result | Clean check elapsed |
|---|---|---:|
| photocraft-engine | pass | 2m02s |
| designcraft-engine | pass | 2m22s |
| pdfcraft-engine | pass | 4m42s |

These times include download/compile work and are not runtime startup metrics.
Full Somnia core regression suite: 1,491 passed, 0 failed, 18 skipped,
26 TODO (1,535 cases reported). No tests were altered outside this spike.

## Recommendation for next steps

Proceed with a narrow renderer/layout bridge for DesignCraft and a separate
PDF parse/render bridge for PdfCraft. The READMEs' claims are now backed by
actual wasm32 **type checks** of their full headless engine facades, but not
linked release bridges, browser jobs, size/startup measurements or security
approval. Do not call these product integrations ready based on this result.

For DesignCraft, first render one small document (embedded fonts/images)
and export one PDF in a Worker; measure lazy module payload and compare
reference pixels. For PdfCraft, open and render a known one-page PDF, then
save/reopen one annotation or page reorder. Keep pdf.js as fallback. Test
malformed documents and bound per-page work before exposing arbitrary files.

A Git dependency does not inherit the upstream root `[patch.crates-io]` table.
If adding PdfCraft to this workspace, mirror/pin all five vendor patches
(hayro, hayro-interpret, hayro-syntax, hayro-jbig2, lopdf) here. Omitting them
would lose both tile-render support and documented malformed-file fixes.
Keep PDF JavaScript execution and signing out of the initial bridge, behind
explicit permissions later. Both currently sit in the full facade dependency
graph without granular feature gates; prefer small crates/feature splits to
avoid automatically shipping a JS interpreter and signing stack.

Builder integration gates: generated artifact build order, legal inventory,
edge-alpha policy, tile/document lifecycle, cancellation/timeout, deployment
CSP/assets and real Windows WebView2/macOS tests. No merge or push was done.
