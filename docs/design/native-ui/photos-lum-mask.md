# Photos luminosity mask

One luminosity/colour-range mask per photo, rastered into the source in
the preprocessing chain BETWEEN the adjustment brush and the tone curves
(spots, local adjust, grads, radials, brush, MASK, curves, HSL,
vignette/defringe). Being pre-curves means a masked exposure lift is
still shaped by the curve afterwards, the same order raw editors use.

## The mask window

- Luma window lo/hi (0..1) with a feather (0..0.5). The window extends
  the feather OUTSIDE both edges and eases with a smoothstep over twice
  the feather, so the default 10% feather softens a 0..35% shadow zone
  roughly between 25% and 45% luma.
- Zone presets: shadows 0-35%, midtones 30-70%, highlights 65-100%.
  They overlap on purpose; the feather blends the seams.
- Optional hue window (center 0-359 deg, width 5-180 deg, soft 30 deg
  edge). Achromatic pixels (saturation below 0.08) NEVER match a hue
  window: a colour range can never catch grays, no matter the luma.

## Adjustments through the mask

ev (-1..1 stops), temperature and saturation (-100..100), applied with
the exact brush math (gain 2^(ev*w), temp shift, sat mix) scaled by the
mask weight per pixel. Because the gain is multiplicative, pure black
never lifts: masks behave like the brush, not like a levels black point.

## Overlay

The panel's eye toggle paints the weight map over the photo
(accent-tinted, alpha = weight * 0.43). It appears whenever the window
is narrowed, even before any adjustment is dialed in, so the mask can be
aimed first. A full-frame window hides the overlay (nothing to see).

## Scope limits (deliberate)

- ONE active mask, not a stack. A new zone click replaces the window.
- No AI subject detection; the mask is purely tonal/chromatic.
- The mask is not a retouch target (no brush-editable mask bitmap yet).

## Tests and gallery

- `lumMask.test.ts` (4 tests): window/clamp/hue-weight math incl. the
  achromatic guard, neutral no-op and input immutability, signature
  stability, zone preset shapes.
- `photos-mask.spec.ts` against the new `?view=photos-mask` proof
  (decoding engine; real workspace plus the real MaskPanel): the shadow
  zone plus ev doubles only the dark quadrants (saturated red, being
  dark in luma, lifts too - visible proof the mask follows luma, not
  brightness perception); the hue window on red with sat -100 turns only
  the red square gray while achromatic white stays untouched; the
  overlay toggle paints the weight map and one undo restores the neutral
  mask; light and dark captures.
- i18n: photos.panel.mask, photos.p.mask.* and photos.p.key.lumMask in
  all five locales.
