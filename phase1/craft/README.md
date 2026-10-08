# Somnia craft T1: headless Rust/WASM worker spike

This is an opt-in prototype, not a replacement for the image editor. No main
app component or Tauri dependency is changed. Apply on `somnia-agent` base
`23f739980d985792b939942a8182a0babf0e9569`.

## Build and reproduce

Prerequisites: Rust 1.95.0, wasm32-unknown-unknown, wasm-bindgen-cli exactly
0.2.129, Node/npm and Chrome. PhotoCraft currently requires Rust 1.95 (not
1.90). The standalone `[workspace]` and local rust-toolchain isolate it from
Somnia's desktop workspace and its 1.85 toolchain.

```sh
rustup toolchain install 1.95.0 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain 1.95.0
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.129 --locked
cd phase1/craft
./build.sh
cargo +1.95.0 test --locked
cd spike
npm ci
npm run typecheck
CHROME_PATH=/usr/bin/google-chrome npm run bench
CHROME_PATH=/usr/bin/google-chrome npm run test:adapter
```

Generated runtime `pkg/` artifacts, worker bundle, benchmark JSON, screenshots
and Vite output are ignored. Only the generated API declaration is tracked
so clean-checkout app typechecks do not require Rust. Runtime `pkg/` artifacts
must exist before the spike builds/runs. Commit neither the binary nor
upstream branding assets. The benchmark renders the actual
returned pixels in before/after canvases. `test:adapter` exercises the Vite
production bundle, hashed WASM URL, input ownership transfer and dispose.

## Scope and contract

`src/lib/craft/engine.ts` uses a module Web Worker. It sends an absolute WASM
URL, initializes once, correlates responses by ID, transfers input/output
ArrayBuffers and rejects pending work on worker failure or disposal. Input
ownership is transferred: never reuse that ArrayBuffer after `blur`.

The exported function calls upstream `Surface::from_interleaved`,
`photocraft_algo::apply(GaussianBlur)` and `Surface::read_rgba8_into`. These
are the real headless raster/filter crates, with geom/color/cms dependencies,
not a JavaScript substitute. The wrapper does **not** link the full
`photocraft-engine` command/session facade. Separate compile checks of the
facades are described in RESULTS.md.

Limits: tightly packed RGBA8, <=1,048,576 pixels, <=4096 on each axis,
finite radius 0..32. Each operation is synchronous inside the worker; no
thread pool, cancellation, retained documents, undo, codecs, file access,
ImageBitmap or zero-copy JS/WASM API. JS/WASM copies remain even though
main-thread/worker messages transfer ownership. This is T1, not full T6.

## Integration caveats

- Upstream blur reads transparent pixels outside the document. An opaque
  fixture's corner alpha becomes 77 at radius 4. Decide whether Somnia should
  clamp/extend edges before wiring this into UI; do not silently ship it.
- Generated artifacts are an explicit prerequisite, not part of the normal
  app build yet. Builder must wire CI/build ordering and license inventory.
- Single-threaded WASM needs no COOP/COEP. Do not enable rayon threads without
  a separate policy and deployment check.
- Startup failure rejects; retry requires a fresh engine instance. The
  init promise is intentionally not silently retried after failure.
- Production needs timeouts/cancellation, tile/document APIs and controlled
  memory lifetime. Bounds here prevent accidental giant image allocation;
  they are not a sandbox for arbitrary upstream commands.
- CSP, Windows WebView2, macOS WebKit/Tauri asset protocol and Firefox/Safari
  were not tested. Browser proof is Chrome Linux only.
- Preserve NOTICE and license files; add transitive licenses to the existing
  release inventory before distributing. No egui UI, fonts or icons are used.

For independently reproducible full-facade compile checks run
`./check-upstream.sh /tmp/somnia-craft-upstream`. These are separate clones,
not new Somnia dependencies. The PDF check stays inside its own workspace to
honor root `[patch.crates-io]` entries. If later importing PdfCraft via Git,
Cargo ignores dependency-workspace patch tables: mirror its vendor patches in
the bridge root explicitly instead of silently losing the safety fixes.


## A2 foundation integration

The inline raster editor now lazily uses this bridge for bounded blur previews.
This does **not** promote T1 to a full document/layer engine. Generated assets
must be built before `npm run dev` / `npm run build`; these scripts fail with
an explicit setup message when assets are missing. The CI workflow builds them
with the isolated 1.95 toolchain before all frontend/Tauri builds.

The display proxy is capped at 900,000 pixels for known same-sized adjustment
and filter ops. Exports remain full-resolution through the existing reference
pipeline. Geometry, selection and unknown extension ops disable the proxy:
no source-space intent is scaled or silently reinterpreted. The footer reports
its preview scale. PhotoCraft has a 1MP padded-workspace bound and radius 0..32;
out-of-bound operations fall back to the existing renderer and report that fact.

Boundary policy: repeat edge RGBA pixels with 4-sigma padding + 2 pixels, run
PhotoCraft Gaussian blur, crop to original bounds. This avoids the upstream
transparent document-edge fade. Real WASM tests check constant opaque edges.
Large-radius PhotoCraft uses a box approximation, so preview is not a guarantee
of byte equality to existing full-resolution Gaussian export. Tiled full-res
PhotoCraft export is still a separate gate.

Worker jobs have a 15-second timeout and dispose rejects pending jobs. Superseded
renders are ignored through AbortSignal and generation checks; synchronous WASM
work is not interruptible mid-job. Document retention, layers/masks, PSD import,
upstream selection algorithms and full craft export remain future A2 work.
