# Interim inline retained layers and selection bridge

Layers inspector tab offers Start layered document only for pristine <=1MP
rasters. Full-resolution original pixels are sent to real retained WASM docs;
no edited result is baked and advertised as an adjustment layer. The worker
owns layer undo/redo, masks and composite. Legacy transform/adjust/filter and
selection Cut/Fill are disabled in this visible bounded mode. Larger/edited
rasters keep their existing editor. New layer mode exports a flat composite
copy through the existing host, not PSD or a layered project. Switching tabs
retains each worker; closing releases it. Dirty guards include layered changes.

Controls: duplicate, visibility, opacity, mask from current image-space
selection, remove mask. Copy export dimensions verified in Chromium. Mask
changes and Undo verified through actual inline UI. Existing History tab names
worker undo/redo counts, not a fake legacy timeline.

Wand and finished lasso gestures now use actual PhotoCraft worker selection
routines under <=1MP / 4096-point bounds. Their returned 8-bit coverage is
explicitly thresholded to the existing binary mask contract (no anti-aliasing
claim). Image-space coordinates are unchanged. Larger/failed jobs fall back
with a status notice. Rectangle and live drag preview remain existing TS.
Generations discard stale async responses across reset/source changes. A
pointer-capture release must not cancel an already completed wand request.

Tests: tsc/build pass; Chromium dev 13 passed, stress separately enabled;
production existing raster regression 6 passed; focused 35 passed. Screenshots
of retained layer inspector, wand Fill result and polygon-derived layer mask
inspected. Layer-mode save, mask undo and cross-tab state tested. Native
runtime remains unverified. UI strings added in this interim panel are English
pending locale polish; this is not the final A2 UX.

Remaining: PSD read, op-to-adjustment/smart-filter migration, general retained
layers for >1MP documents, tiled full-res export, layer project persistence,
real native testing. A3 tools remain unimplemented.
