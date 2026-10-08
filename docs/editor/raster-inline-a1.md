# Raster inline editor, A1

PNG, JPEG and WebP media tabs now use the main editor container, not a dialog.
The app grid owns the resizable/collapsible left transform panel and right
Adjust / Filter / History / Info inspector. Existing selection controls dock
in the options bar. Existing operation handlers, renderer and ImageEditorHost
remain the implementation. No craft or WASM dependency is introduced by A1.

Decoded resources are cached per media URL in RasterEditorProvider. Serializable
intent, undo/redo and saved signatures live in appStore.rasterDoc[fileId].
Each tab keeps its own state. Closing or replacing a dirty image asks first.
Browser unload and desktop close requests guard image changes too.
Save / Undo / Redo / Close commands route through a contextual command scope,
without replacing the project's command registrations. Host overwrite still
requires the explicit workflow preference and original-file grant; absent a
grant, or with a changed export format, Save writes a copy. A cancelled host
save does not clear the dirty marker. Crop/selection operations are unchanged.

## Verification on base 23f7399

- TypeScript and production Vite build passed.
- Focused image/host/command/state tests: 117 passed.
- Full core suite with --test-force-exit (existing handles remain alive):
  1495 passed, 0 failed, 18 skipped, 26 todo (1539 recorded tests).
- Chromium inline suite: six passed. Covers PNG/JPEG/WebP routing, actual
  exported bytes/dimensions, selection fill, history, close cancellation,
  sidebar collapse, per-file intent and Ctrl+S/Z.
- Light screenshots inspected: inline transform/adjust, history/selection,
  and a full-size 24 MP source.

## Open acceptance item

The separate stress check remains RED. A clean single-document 6000 x 4000
source took 6936 ms for five keyboard slider ticks in headless Chromium. A
multi-document run crashed Chromium twice during the first full-size
adjustment. This is not a desktop GPU benchmark and does not establish a
Windows crash, but it does not meet interactive-24-MP acceptance. The existing
engine still renders full-resolution previews. No downscale architecture was
silently added in A1. Run the explicit check with:

    SOMNIA_STRESS=1 npx tsx --test --test-name-pattern='24 MP' validation/imageEditor.browser.test.ts

Native file dialogs, overwrite, Tauri window-close handling and real GPU
performance require desktop validation. Existing crop controls are reused;
A1 does not introduce a new crop-overlay interaction or new tools.
