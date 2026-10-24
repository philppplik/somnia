# Photos clipping overlay: false-color clipping warning (P35)

Second functional photo-studio feature phase. The Photos workspace can now
paint a false-color overlay over the developed preview: shadow-clipped
pixels turn solid blue, highlight-clipped pixels solid red.

## What changed

- `src/lib/photos/clippingOverlay.ts`: pure `clippingOverlayImage(frame)`
  builds a per-pixel RGBA overlay from a rendered preview frame. Same
  thresholds and Rec. 709 luma as the histogram panel (`CLIP_LOW`,
  `CLIP_HIGH`, `lumaOf`), so the overlay matches the panel's clipping
  numbers exactly. Fully transparent pixels stay transparent; overlay
  colors are exported constants (`CLIPPING_SHADOW` blue, `CLIPPING_HIGHLIGHT`
  red).
- `PhotosWorkspace`: a compact icon toggle (`AlertTriangle`) in the bar
  next to compare, persisted via `panelStateStore` under
  `photos.clipping` (default off — diagnostic view). When on, a second
  canvas sits over the preview canvas (`pointer-events-none`, same
  pixelated-rendering rule at high zoom) and repaints whenever the shown
  frame changes, so zoom, pan, edits, undo, compare and crop previews all
  stay in sync.
- i18n: `photos.clipping` added to all five photo locales
  (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/clippingOverlay.test.ts` (6 tests: shadow/highlight
  classification, mid-tones transparent, alpha-0 skipped, threshold edges
  match CLIP_LOW/CLIP_HIGH, single saturated channel not clipped,
  dimensions preserved). All existing photos tests unmodified and passing
  (86 tests including this and the P34 crop-guides tests).
- Browser: `test/design-system/photos-clipping.spec.ts` drives the real
  `PhotosWorkspace` on a stubbed-engine session whose frame has a black
  and a white band via the `?view=photos-clipping` gallery route: overlay
  canvas renders and toggles, aria-pressed reflects state; light/dark
  production-style screenshots
  (`test-results/ds-photos-clipping-{light,dark}.png`).
- Pixel parity: stage captures with the overlay toggled off
  (`ds-photos-clipping-stage-{light,dark}.png`) are pixel-identical to a
  base-tree run (P34 commit `e8f4e698` + proof/route/spec only) in both
  themes, so the only visual change is the overlay itself and the bar
  toggle.
- No new raw controls (the toggle is the DS `Button`); ratchets
  unchanged. Actual app photos E2E remains CI-only.
