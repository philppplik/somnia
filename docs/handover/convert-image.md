# Image conversion handover

Branch: `feature/convert-image`
Base: `somnia-agent` at `535d236` (native provider/streaming broker).

## Implementation

- Tools > Convert image... and command palette entry, available without an open project.
- Local file picker accepts standalone SVG, PNG, JPEG and WebP. Raster input is identified by signature, not filename/MIME.
- Real browser Canvas decoding/rendering/encoding: SVG to PNG and all PNG/JPEG/WebP combinations (SVG can also export JPEG/WebP).
- Width/height in pixels, original-ratio lock, lossy quality, JPEG transparency background (white default). PNG/WebP retain alpha when the source has alpha.
- Output preview followed by an explicit Download action. Input/current project is unchanged; no overwrite, server upload, network service, paid API, Rust or WASM dependency.
- 25 MB input limit, 8192 px edge limit, 32 million pixel limit; decoder timeout, object URL cleanup and honest unsupported-encoder errors (no silent PNG fallback labelled WebP).
- SVG rejects active elements, animation, embedded images, external resources and CSS imports/escapes. Local fragment references/gradients work. Supports width/height in common absolute units and viewBox-only SVG.

## Integration

Cherry-pick the feature commit or apply the attached format-patch. `App.tsx` gains one dialog import/render; `commands.ts` gains one Tools registration. Other files are new and isolated. No store schema, package lock, Rust host, release version or provider changes. The dialog uses `somnia:convert-image` to avoid adding transient utility state to the global project store.

## Verification

- `npm run build`: TypeScript + Vite production build passes, existing chunk/dynamic-import warnings only.
- `npm run test:core`: 1060 tests, 1057 passed, 3 skipped, 0 failed (includes four new unit tests).
- `npx tsx --test src/lib/imageConversion.test.ts validation/imageConversion.browser.test.ts`: 7 passed, 0 failed.
- Browser suite uses node:test + Playwright's existing Chromium launcher, not Vitest or mocked Canvas. Real SVG rasterization, all nine raster source/target pairs, output signatures, red pixels, alpha, JPEG white background, resized decoded dimensions, ratio derivation, malformed/active/external SVG, corrupt PNG, size/quality rejection, unsupported encoder simulation, Tools UI, download and unchanged project state are checked.
- Chromium executable defaults to `/usr/bin/google-chrome`; override `CHROME_PATH` for another installation. Dedicated Vite port 1437. No CI workflow changes.
- Inspected actual light/dark dialog screenshots and downloaded 600 x 300 PNG: readable aligned controls, unclipped footer, rounded surfaces, correct preview, correctly rendered purple rectangle/white circle. Evidence supplied separately.

## Licenses

No new library, copied OSS implementation or dependency was introduced. Conversion is original project code under the repository MIT license and browser platform APIs. Existing reused UI: React MIT, Base UI MIT. Existing test tooling: Playwright Apache-2.0, tsx MIT (verified installed package metadata).

## Remaining platform checks / limitations

- Windows WebView2 and macOS WKWebView installer tests remain for the builder/user. In particular, WebP encoding support varies across WebViews; an unsupported encoder reports an error and suggests PNG/JPEG, never mislabels a fallback.
- Downloads use the same browser Blob/anchor pattern as existing project exports; native save-dialog integration was not changed.
- English utility UI currently follows the app's default language; translated labels are not added in this isolated slice.
- Animated raster sources become a single frame, metadata/EXIF is not retained; output is a raster copy, not SVG vectorization or animation conversion.
- Pixel cap for raster sources is checked after browser decode. A compressed pathological source can allocate memory inside the browser decoder before this check. Byte and output-size limits are enforced; no claim of a hardened image sandbox.
- No push, PR, CI run or release performed.
