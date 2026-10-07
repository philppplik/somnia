# Image editor core handover

Base: `somnia-agent` @ `535d2369`. Branch: `feature/imgedit-core`. No push, PR or CI run.

## Integration order

Apply the filter research commit first (`phase1/src/lib/image/*`, original supplied patch), then this core commit. Core adds no pixel kernels and depends on its `RasterImage` and `applyOp`. The separately supplied first research `imagePixelOps.ts` is not required.

Public API: `phase1/src/lib/image-editor/index.ts`.

```ts
const source = await loadImage(fileBlob, fileName, signal);
const registry = createOperationRegistry(); // includes raster@1 bridge
registry.register(adjustHandler); // {type,version,apply,fragmentShader?}
const renderer = new ImageEditorRenderer(source, registry);
const doc = appendOperation(source.document, {
  id: crypto.randomUUID(), type: 'adjust', version: 1,
  enabled: true, params: { brightness: 0.1, contrast: 0 }
});
const frame = await renderer.render(doc, { preview: true, signal });
// <ImageEditorViewport image={frame.canvas} ... />
const blob = await exportImage(renderer, doc, {format:'png',quality:0.92});
renderer.dispose(); source.dispose();
```

Operation contract: `{id:string,type:string,version:number,enabled:boolean,params:Record<string,JsonValue>}`. Parameters must be finite JSON. Immutable source info and frozen operations; serializable snapshots work with an external history owner. No duplicate history implementation. `withOperations` changes order; update/remove/append helpers included. Unknown enabled ops fail loudly, disabled unknown ops are ignored. No partial silent output.

Handler: `{type,version,apply(input:RasterImage,params,context:{signal?}):RasterImage|Promise<RasterImage>,fragmentShader?(params):string}`. Input and output are **straight alpha, sRGB-encoded, RGBA8** `{width,height,data:Uint8ClampedArray}`. Handler must not mutate input. Base pixels are cloned once at the evaluation boundary. For CPU math use researched kernels, not `ctx.filter`.

GPU shader contract: GLSL ES 3.00 fragment source, `uniform sampler2D uTex`, optional `uniform vec2 uSize`, `in vec2 vUv`, `out vec4 outColor`. Passes operate at unchanged dimensions. GPU used only when every active op exposes a shader; otherwise whole stack evaluates CPU for consistent semantics. Capability is tested by texture/FBO/draw. Context loss falls back to CPU; restored context rebuilds resources. Shader program cache capped at 32. Ping-pong render avoids readbacks; source reads once, not each frame. Export always replays CPU at full resolution. No GPU shader copied from a third party.

## Viewport

`ImageEditorViewport.tsx` accepts `image`, optional controlled `viewport`, `onViewportChange`, `onImagePointer`, `overlay`. Zoom cursor-anchored, pan middle-button or Alt+left, keyboard +/-/0/arrows, pointer capture/cancel, resize and high-DPI rendering. Helpers convert image/screen coords for crop/selection overlays. Checkerboard reveals alpha. Source swap auto-fits in uncontrolled mode. Overlay itself is supplied by crop/select UI.

## Files and platform boundary

PNG/JPG/WebP decoded with `createImageBitmap(...,{imageOrientation:'from-image'})`; safe SVG via isolated image decoder with scripts, foreign objects, links/resources, CSS, animation and doctypes rejected. Raster files limited to 128 MB and decoded dimensions to 64 MP. SVG styles are intentionally strict: presentation attributes work, style attributes/elements are rejected. HTML image decoder fallback when ImageBitmap unavailable. Disposal revokes URLs and closes ImageBitmaps.

Native shell should supply Blob bytes from a Rust binary response or an asset URL through `loadImageUrl`, never base64 IPC. This commit does **not** change Rust commands or CSP/asset scope. Existing config does not yet allow a new native image asset route: builder must wire its file integration with scoped native reads. Browser download helper exists; native save dialog/write belongs to shell.

PNG retains alpha; JPG flattens on white by default, optional colour override; WebP/PNG can flatten explicitly. Quality 0..1, default .92. Refuses silent PNG fallback when a webview lacks WebP encoding. Output always a Blob, caller chooses destination. ICC/profile preservation is not provided (browser sRGB path).

## Tests

- `npx tsx --test src/lib/image-editor/*.test.ts src/lib/image/*.test.ts`: 8 core + 13 reference tests.
- `npx tsc --noEmit`: clean.
- `node --test scripts/image-core-browser.test.mjs`: local Vite server, headless Chromium, actual decode PNG/JPG/WebP/SVG, SVG safety, CPU invert, all export formats, two-pass GPU orientation/parity, context-loss CPU fallback, viewport keyboard/wheel, screenshot optional via IMAGE_CORE_SCREENSHOT env.
- Full `npm run build`: checked separately in final report.

Browser fixture screenshot inspected: cyan/yellow CPU-inverted source correctly aligned within focused checkerboard viewport after zoom and pan. Native Windows/macOS/Linux webview checks remain the user's platform tests; Chromium is not proof of WKWebView/WebKitGTK behaviour.

`test:core` currently omits nested `src/lib/image/*.test.ts` and `src/lib/image-editor/*.test.ts`. Builder should add both globs centrally or invoke them explicitly as above. Browser test uses node:test, not Playwright's test runner or Vitest.

## Limits / follow-up

CPU fallback executes main-thread kernels and can block with large images; cancellation checked between ops, not inside reference kernel loops. Worker/tiled rendering is not implemented. GPU requires full-size texture to fit MAX_TEXTURE_SIZE; exceeding limits falls back CPU, no hidden downscale. 64 MP limit does not guarantee low RAM (decoded base, working buffer and canvases coexist). Source dimension guard is after browser decoding. Layers/masks/ICC are future features, not represented as completed. Registered custom handler parameters need their own domain validation.

Licenses: no added third-party runtime dependency. Core original code uses repository MIT. Existing React (MIT), Tauri JS API (MIT/Apache-2.0), TypeScript (Apache-2.0), tsx (MIT), Vite (MIT), Playwright (Apache-2.0) are already repository dependencies. Filter research kernels are original repository code supplied separately; no external library imported.
