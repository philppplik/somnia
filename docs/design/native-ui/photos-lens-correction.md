# Photos lens correction

Vignette and defringe, both rastered into the source at the END of the
preprocessing chain (after the HSL mixer), as ordinary develop settings:
they live in PHOTO_CONTROLS, so they get the same sliders, gesture API
(one undo per drag), section resets, history entries, versions and
settings-clipboard round trips as every other numeric control.

## Vignette (Effects section)

- Amount -100..100: positive brightens the corners (correcting lens
  falloff), negative darkens them (creative vignette). Gain is
  2^((amount/100)*w), so 100 is one stop at the far corner.
- Midpoint 0..100: where the elliptical falloff starts. 0 begins at the
  center; 90 confines the effect to the far corners. The ellipse is
  aspect-true (corner distance normalizes to exactly 1).

## Defringe (Detail section)

- 0..100: desaturates purple/magenta (255-335 deg) and green (80-170
  deg) pixels only where the luma gradient against the neighbors clears
  a threshold - the classic chromatic-aberration case of a colored seam
  along a contrast edge. Flat purple regions (no gradient) and
  non-fringe hues at edges stay untouched. The mix scales with both the
  slider and the gradient strength.
- Honest limit: gradient threshold plus hue windows, no lens profiles,
  no distortion correction (that would need a warp, deliberately out of
  scope).

## Tests and gallery

- `lensCorrect.test.ts` (4 tests): neutral no-ops, corner
  brighten/darken with flat center, elliptical falloff on wide frames,
  defringe edge-only behavior with flat-region and non-fringe-hue
  guards plus strength scaling.
- `photos-lens.spec.ts` against the new `?view=photos-lens` proof
  (decoding engine; real Effects and Detail panels): the real Vignette
  slider brightens corners and respects the midpoint (one undo restores
  the pristine frame, negative values darken); the real Defringe slider
  desaturates the 1px purple seam but not the flat purple block;
  light/dark captures. Parity: versions-proof canvas bitmaps
  byte-identical to the P57 base 8dd18d0a (cmp verified).
