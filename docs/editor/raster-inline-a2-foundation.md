# A2 foundation, not full A2

Depends on A1 and T1. This patch wires real PhotoCraft Gaussian blur previews,
not a substitute JS blur. The selected raster/algo/geom/color/cms runtime is
lazy-loaded in a worker. The shipping production build contains the hashed
812 KB WASM asset and 3 KB worker. No document/PSD feature is claimed from the
compile-only facade checks.

## Preview and coordinate policy

A visible 0.9 MP display proxy is used only for known, same-sized adjustment
and filter operations. Gaussian radius scales for this display proxy. Original
intent and save/export stay at source resolution. Geometry, selection and
unknown operation types force the full-resolution path, rather than guess at
crop coordinates or resample stored selection runs. The footer says Preview N%.

PhotoCraft blur uses repeated RGBA edges, padding of 4 sigma plus two pixels,
then crops the returned raster. Constant opaque corner alpha stays 255 in the
actual WASM check, unlike T1's transparent-boundary corner alpha 77. Inputs
outside the spike's pixel/radius bounds use the existing renderer and a status
notice. The approximation for larger Gaussian radii means preview/export pixel
identity has not been proved. It must not be marketed as a full backend swap.

## Safety and build integration

- Worker init/operation timeout 15s; dispose rejects all pending requests.
- Input ownership transfer, invalid-job rejection/recovery tested in Chromium.
- Superseded display output is ignored, but a running sync WASM job cannot be
  interrupted mid-job. No retained documents or tiled API yet.
- Separate proxy cache and full-res decoded export cache are released on close.
- Generated runtime artifacts remain untracked. Build runs an explicit check.
- All CI jobs install the isolated Rust 1.95 + wasm32 + wasm-bindgen 0.2.129,
  then run craft:build before frontend/Tauri. No CI dispatch or push was done.
- CSP permits self workers, self fetch and wasm-unsafe-eval only; no generic
  JS unsafe-eval added. Native WebView2/WebKit support remains untested.
- License listing includes the pinned T1 inventory. T1 NOTICE/license texts
  remain in craft/. Rust transitive license text packaging is a release gate.

## Validation

- TypeScript and production Vite build passed.
- Core regression after the foundation: 1498 pass, 0 fail, 18 skipped, 26 todo
  (1542 recorded tests). Existing handles needed runner --test-force-exit.
- Chromium dev: eight pass, 24MP stress separately enabled. Real worker creation
  observed from the inline blur UI; direct actual WASM output checked too.
- Production inline Chromium: six tests passed; separate built/hashed worker
  adapter test passed (init, real pixels and dispose).
- Rust T1 tests: three pass.
- Clean 24MP five keyboard brightness ticks: 966-1154 ms, versus 6936 ms in A1.
  Actual exported PNG remains 6000 x 4000. Shared headless host, not a desktop
  device guarantee. Transform/selection at 24MP is not proven interactive.
- Light screenshots inspected: blur renders visibly; 24MP footer reports 19%
  display proxy, full original dimensions retained.

## Remaining full A2

Retained worker documents, true PhotoCraft layers/adjustment layers/smart
filters, masks, PSD read, operation-list migration, upstream selection
algorithms, bounded document parsing, actual full-resolution/tiled craft export,
real native runtime and cancellation semantics. Nothing in this foundation
claims those features are finished. A3 remains unimplemented.
