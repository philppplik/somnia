# Photos LightCraft first package

Base: live somnia-agent 49af8d5c83dd5d4abb503c7ef740cec774b3482f,
checked 2026-10-09. No push, merge or release.

## Existing code retained

AI Photo already reads the mounted RasterEditor resource owner. Manual changes,
review previews, proposal acceptance, origin-aware undo, stale-source protection,
selection/layer restrictions and PNG copy export were present. No duplicate AI
workspace, no replacement history, no model pixel disclosure was introduced.

## Integration

Photos-scoped engine descriptor: `src/lib/photos/registry.ts`.
Typed worker and client in the same directory; isolated pinned Rust bridge in
`photos-engine`. Additive Develop inspector tab in RasterEditor.tsx is the only
existing app-file edit. Global Studio selector/hosts untouched by agreement.

This is a bounded JPEG/opaque-PNG Develop package, not a Lightroom replacement.
RAW is deferred. Before/after development remains in the inspector; the normal
canvas and toolbar remain the original Raster document. Explicit controls and
copy-export labels describe this separation. No claim of durable non-destructive
sidecars, high-resolution exports or matching camera colour fidelity.

## Builder wiring at merge

1. Build `sh photos-engine/build.sh` before every Vite/Tauri app build, in all
   existing frontend/native/windows/macOS jobs. New photos-lightcraft.yml checks
   this package but does not change shared release workflows.
2. Add photos-engine generated-asset presence checks to the shared build gate.
3. Include notices in release packaging/settings license inventory after exact
   target closure review against this package's Cargo.lock. Supplied spike
   notices are retained as a conservative baseline, not final sign-off.
4. Global Photos registry/routing belongs to the integrator. Route it to the real
   Raster shell with its own manifests. Do not alias it to code.canvas.
5. Keep Develop experimental; Windows WebView2/macOS WebKit/Tauri asset loading
   and native dialog roundtrips remain unverified.

## Local validation

- Isolated Rust release WASM and wasm-bindgen generation: passed from source.
- Existing PhotoCraft and raster-codec assets: built from source.
- Full frontend `npm run build` (TypeScript + Vite): passed.
- Photos contracts + existing photoStudio unit tests: 7 passed.
- New real-worker browser tests: 2 passed. Actual pixels change on exposure;
  undo restores baseline, redo restores edit, copy download works; Develop close
  guard survives inspector unmount; malformed replacement preserves valid core;
  JPEG export signature verified.
- Existing AI Photo regression tests explicitly rerun: PNG copy/dirty-close and
  manual sliders/AI stack/editor undo: 2 passed.
- A longer AI suite run was interrupted after its first 3 passing cases. No
  whole-suite-pass claim. Full app test:core and native Tauri build not run.
- Browser: system Chrome on Linux. Screenshot photos-develop.png inspected:
  real shell, original and brighter developed gradient are visible, labels and
  sliders readable. Export controls sit below the fold in the scrolling inspector.

## Next packages

1. Unified Develop document adapter, named save/export command scopes, durable
   sidecars, bounded session eviction and shared undo rather than inspector-only
   snapshots. Protect project-close and all multi-document operations centrally.
2. RAW-specific importer using direct raw/pipeline crates, measured demosaic and
   as-shot defaults, explicit no-fallback status, calibrated fixture corpus.
3. Proxy/original management and original-resolution export, large-camera memory
   gates, cache eviction, cancellation/restart, catalog thumbnails.
4. ICC/EXIF/XMP policy, 16-bit export, Windows/macOS native file roundtrips,
   Tauri CSP worker/WASM gates, exact license closure and release sign-off.
