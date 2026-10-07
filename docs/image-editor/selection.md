# Selection tools

Selection is transient UI state over the **current rendered raster**. Selection masks
are binary Uint8Array buffers, one byte per pixel. No new dependencies or licenses.

## Integrating

- Import `SelectionEditor` from `phase1/src/components/imgedit/SelectionEditor`.
  It wraps `ImageEditorViewport` with a toolbar and marching-ants SVG overlay.
- Pass the rendered canvas and matching `RasterImage`, controlled `selection`,
  `onSelectionChange`, and `onCommit` (append to document/history).
- Call `registerSelectionOps(registry)` once when building the application registry.
  The returned disposer removes both handlers. Registration rolls back on failure.
- Clear the selection on source/document replacement and dimension-changing edits.
  Old-sized selection operations deliberately fail replay rather than select wrong pixels.
- `onCopy` receives `{image, origin}` for the host's image clipboard. Without a host
  callback the panel keeps an in-memory payload. No OS clipboard writes or paste
  operation are implied. Cut copies first, then commits a non-destructive cut op.
- If supplying a controlled viewport, update it from `onViewportChange`.
  Otherwise the underlying viewport fits, pans and zooms itself.

Rectangle and freehand lasso use pixel-center sampling; lasso closes on release with
even-odd fill. Magic wand is four-connected and compares every pixel to the seed.
Tolerance 0..255 is the maximum per-channel sRGB RGBA difference. Fully transparent
pixels ignore hidden RGB. Fill replaces selected RGBA bytes (not a source-over paint).
Cut clears selected RGBA to zero. Copy crops to selection bounds and makes excluded
pixels transparent. Empty copy returns null.

Modes: replace/add/subtract/intersect; Shift adds, Ctrl/Command subtracts,
Shift+Ctrl intersects. Escape clears. Middle mouse or Alt+left drag still pans.
Pointer capture makes drag-release outside the canvas work; cancel/lost capture
discard previews. SVG outlines include holes, omit internal seams, stay 1 CSS pixel
wide at any zoom, and stop animation for reduced-motion users.

## Operation contract

`selection-cut@1` and `selection-fill@1` use the existing core ImageOperation shape.
Params contain `width`, `height`, and sorted non-overlapping linear `[start,length]`
runs. Fill additionally contains `color: [r,g,b,a]`. Dimensions, ranges, overlap,
RGBA bytes and abort signals are validated. All kernels leave input bytes unchanged.
Factories: `selectionCutOp(mask)`, `selectionFillOp(mask,color)`.

## Verification

`npx tsx --test src/lib/imgedit/select.test.ts src/components/imgedit/SelectionEditor.test.tsx`
from phase1. The algorithm tests also run through the existing test:core glob.
Browser smoke was exercised in Chrome against an isolated fixture: rectangle drag,
copy, wand click, fill, closed lasso, cut, and Escape with no page errors. Screen
captures verify outlines track the zoomed image and cut reveals transparency.

Remaining host work: mount the component in the main editor shell, register handlers,
wire the shared clipboard/history, translate toolbar strings, and apply shell styling.
Large selections are CPU-only and synchronous. No GPU acceleration or antialias/feather
mask is promised; these binary tools allocate per-pixel buffers under the core 64 MP cap.
