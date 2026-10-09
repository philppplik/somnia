# Bounded raster import adapters

Port of the old raster-format spike onto Somnia 8567773, without rebasing its
obsolete MediaViewer, native IPC or A2 state changes.

image-rs/image is pinned to 0.25.9 with default features off. The isolated
workspace uses Rust 1.95.0 and wasm-bindgen 0.2.129, the same build toolchain as
PhotoCraft. The native library is testable, but the app uses a disposable WASM
worker on both web and desktop. There is no new native decode command and no
addition to Tauri's older dependency graph or privileged capabilities.

## Input and output

BMP, ICO, TGA, TIFF, QOI, PNM/PPM and GIF become read-only RGBA8 PNG previews.
TIFF reads the first image, GIF the first frame, ICO the decoder-selected entry.
Signature detection takes precedence. TGA alone uses an explicit .tga hint,
then the real decoder validates the file. AVIF uses the WebView decoder and
fails with a clear message if unavailable; no dav1d distribution is added.

PNG/JPEG/WebP keep the existing inline RasterEditor and PhotoCraft A2 path.
PSD, PDF, Office and SVG keep their existing adapters. The additional formats
use `kind: raster-preview`, not `image`: they do not acquire native raster
history, layer editing, AI Photo eligibility, overwrite grants or round-trip
promises. Convert files and the detailed image conversion utility can write
PNG/JPEG/WebP copies. Layers, animation, metadata, ICC/CMYK and high bit depth
are not preserved. Original bytes have a separate object URL, including for
collaboration sync, and both URLs are revoked when the media is closed.

## Build and test

From phase1 (Rust setup once):

```sh
rustup toolchain install 1.95.0 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain 1.95.0
cargo +1.95.0 install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
npm run craft:build
cargo +1.95.0 test --locked --manifest-path packages/raster-codec/Cargo.toml
npm run test:core
npm run typecheck
npm run build
npx playwright test tests/raster-preview.spec.ts tests/ai-photo.spec.ts tests/image-history.spec.ts
npx playwright test --config playwright.raster-production.config.ts
```

The existing CI calls `craft:build` before frontend/Tauri builds. That command
now builds both isolated WASM modules. Vite bundles the worker and generated
JS and hashes the WASM URL, including in the production app. Build checks fail
when either module is absent. Generated binaries are ignored, declarations
are tracked, and the build script copies codec notices into public/raster-codec
for inclusion in dist. Do not check generated binaries into the patch.

## Bounds and remaining gates

25 MB input/output, 8192 px per axis, 32 million pixels, decoder allocation
hint 256 MiB. Workers time out and terminate after 15 seconds, including on
module failure; bytes are transferred, not sent as numeric JSON arrays.
image-rs limits are best effort, not an OS memory sandbox. Some decoder and
PNG encoder buffers can coexist. AVIF's platform decoder checks dimensions
after decoding and is not subject to Rust's allocation limit. Do not describe
this as hardened hostile-file isolation.

Chrome/Linux dev and production bundle tests are reproducible. Windows
WebView2, macOS WKWebView, native desktop packaging, Firefox/Safari and AVIF
support on each target still need platform validation. No beta/stable release
or platform test approval is implied by this patch.

## Notices

`THIRD_PARTY.md`, `license-inventory.json` and `notices/` cover the locked default
and WASM graphs; the inventory is merged with, not substituted for, PhotoCraft's
existing inventory. Multiple resolved versions stay separate. AVIF-native is
not enabled and needs a separate audit if ever chosen. This crate's license
and third-party notice inventory do not change product distribution policy.
