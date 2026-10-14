# Photos crop guides: rule of thirds (P34)

First functional photo-studio feature phase after the DS adoption slices.
The crop overlay in `PhotosWorkspace` now draws rule-of-thirds guides
inside the crop frame, with a persisted toggle in the crop bar.

## What changed

- `src/lib/photos/cropGuides.ts`: pure geometry helper `cropGuideLines`
  returns the two vertical and two horizontal third positions of a crop
  rect in normalized image coordinates (bounds-normalized, so an inverted
  drag rect still yields in-rect guides).
- `PhotosWorkspace`: when cropping is active, the overlay SVG renders the
  four guide lines clipped to the crop rect; they follow zoom, pan and
  every crop-drag update automatically because they derive from
  `cropDraft` and the displayed size. A compact icon toggle
  (`Grid3x3`, new Vadivam icon export `Grid3x3` in `lib/icons.tsx`)
  appears in the crop bar between Crop and Apply crop; its state persists
  per browser via `panelStateStore` under `photos.cropGuides`
  (default on).
- i18n: `photos.crop.guides` added to all five photo locales
  (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/cropGuides.test.ts` (4 tests: exact thirds on the
  full frame, guides strictly inside a clamped sub-rect, even spacing,
  inverted rect normalization). All existing `lib/photos` and
  `components/photos/panels` tests unmodified and passing (80 tests).
- Browser: `test/design-system/photos-crop.spec.ts` drives the real
  `PhotosWorkspace` on a stubbed-engine session via the `?view=photos-crop`
  gallery route: grid renders in crop mode (4 lines), toggle hides and
  restores it, aria-pressed reflects state; light/dark production-style
  screenshots (`test-results/ds-photos-crop-{light,dark}.png`).
- Pixel parity: the same spec also captures the stage with guides toggled
  off (`ds-photos-crop-stage-{light,dark}.png`); those captures are
  pixel-identical to a base-tree run (`f31203d0` + proof/route/spec only)
  in both themes, so the only visual change is the guides themselves and
  the bar toggle.
- No new raw controls (the toggle is the DS `Button`); ratchets
  unchanged. Actual app photos E2E remains CI-only.

## Crop aspect swap (P65)

The `swapAspect` helper gets its UI: a "Swap orientation" button in the
Transform panel's aspect group and the `photos.crop.swapAspect`
command turn the crop a quarter - a landscape 16:9 draft becomes
portrait 9:16 with the same area, kept inside the frame. While
cropping the swap turns the in-flight draft; with a committed crop it
commits as one undo step. The button is disabled when there is no crop
and no draft.
