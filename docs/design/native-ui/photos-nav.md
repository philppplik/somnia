# Photos prev/next navigation (P38)

Fifth functional photo-studio feature phase. The Photos workspace bar
gains previous/next navigation across the media library's photos, with a
position indicator — the triage workflow for a series of shots.

## What changed

- `src/lib/photos/photoNav.ts`: pure `photoNav(items, currentName)`
  walks the library in library order, considering only developable
  images (`kind === 'image'` and a `PHOTO_INPUT` mime — the same gate
  `PhotosCanvas` uses), and returns previous/next names plus the
  1-based position and total. Ends clamp (no wrap); an unknown or
  undevelopable current yields null neighbours.
- `PhotosWorkspace`: when more than one developable photo exists, the
  bar shows prev/next icon buttons (new Vadivam exports `ArrowLeft`,
  `ArrowRight`) with a tabular `n / total` indicator between them.
  Buttons switch via `setActiveMedia`, exactly the mechanism the studio
  shell uses, so the workspace remounts with the next photo the same way
  a Files-panel pick would. Ends disable; the whole group hides for a
  single photo.
- i18n: `photos.nav.{prev,next}` in all five photo locales
  (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/photoNav.test.ts` (3 tests: library-order
  neighbours skipping psd/webp/non-image items, clamped ends, unknown
  current). All existing photos tests unmodified and passing (98 tests
  including P34-P37 additions).
- Browser: `test/design-system/photos-nav.spec.ts` drives a real
  workspace fed by the media store like `PhotosCanvas` via the
  `?view=photos-nav` gallery route (three photos): position reads 1/3,
  prev disabled at the start, next switches to nav-2 and nav-3, clamps
  at the end, prev goes back; light/dark production-style screenshots on
  the second photo (`test-results/ds-photos-nav-{light,dark}.png`).
- Pixel parity: stage captures of the initial photo
  (`ds-photos-nav-stage-{light,dark}.png`) are pixel-identical to a
  base-tree run (P37 commit `c8d44964` + proof/route/spec only) in both
  themes; the feature adds only the bar controls.
- No new raw controls (buttons are the DS `Button`); ratchets unchanged.
  Actual app photos E2E remains CI-only.
