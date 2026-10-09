# Photos Studio

The Photos Studio develops JPEG and PNG photos with the LightCraft engine (Rust/WASM) in a dedicated
Worker. The main thread holds UI state only; every preview and export comes out of the engine.

## Pieces
- `photos-engine/pkg`: pinned WASM build of the engine (`PhotosCore`: load, render, export).
- `src/lib/photos/`: `studioSettings.ts` (settings model, control spec, sanitizer, engine JSON mapping),
  `engine.ts` / `worker.ts` (typed protocol, render and export ops), `studioSession.ts` (session store:
  open, debounced previews, gesture-coalesced undo, crop flow, dirty tracking, close guard, export),
  `open.ts` (file dialog), `i18n.ts` (catalogue merge).
- `src/lib/studios/photos.ts`: Studio manifest (icon Aperture, order 70, shortcut Mod+7, format claims
  jpg/jpeg/png at priority 50 plus psd for an honest in-studio rejection).
- `src/components/photos/`: `PhotosCanvas.tsx` (workspace / honest-unsupported / start states),
  `PhotosWorkspace.tsx` (top bar, zoom and pan stage, crop overlay, compare hold, export),
  `PhotosInspector.tsx` (sectioned sliders and transform actions).

## What the engine really does
- Input: JPEG and PNG only, up to 16 MB and 16 MP, no transparent PNG. Anything else gets an honest
  "cannot develop this" state, never a fake preview.
- Develop: white balance (absolute Kelvin, 2000-50000, tint -150..150), exposure (-5..5), contrast,
  highlights, shadows, whites, blacks, clarity, vibrance, saturation (-100..100), sharpen (0..150),
  noise reduction (0..100). The sanitizer rejects unknown keys and clamps into these ranges; nothing
  wider is faked.
- Geometry: crop (relative rect), straighten angle, 90-degree rotation steps, horizontal/vertical flip.
  Rotating resets the crop frame, because the crop is relative to the orientation.
- Export: PNG or JPEG of the developed result at source resolution (max edge 2048), saved as a copy
  (`<name>-edited.<ext>`). The original file is never touched.

## Session behaviour
- One slider gesture (pointer down to pointer up) is one undo step; discrete commits (rotate, flip,
  crop apply, reset) are one step each. Undo/redo walk the stack in order and re-render from the engine.
- Crop mode previews the full uncropped frame so the crop rectangle is chosen against the real image.
- Edits mark the session dirty; a completed export marks them saved. Closing a dirty photo asks first
  (close guard plus beforeunload).
- The older experimental Develop panel (`DevelopPanel.tsx`, 3-key settings) is the AI-review path and
  is untouched; the studio uses the full settings model.

## Known limits
- Smart-Open routing (image files auto-opening into the studio), the shared StudioEmptyState and
  `registerBlankProjectFactory` do not exist on this base commit; the manifest claims the formats at
  priority 50 so routing can be activated once those land. Until then the studio is reached via the
  studio pill or Mod+7 and opens files through its own dialog or the active image tab.
- An image tab shown in any other studio keeps the pre-existing raster editor behaviour.
