# Photos HSL color mixer

The Photos studio has a Color mixer panel (`photos.hsl`, right rail between
Curves and Light): eight hue bands (red, orange, yellow, green, aqua, blue,
purple, magenta) with a hue, saturation and luminance slider each. The
mixer is the per-hue companion to the tone curves: curves reshape tone per
channel, the mixer reshapes color per hue band.

## Model

- `src/lib/photos/hslMixer.ts`: `PhotoHsl` maps each band id to
  `{hue, sat, lum}`, each -100..100, 0 neutral. Scales: hue +-100 shifts up
  to +-60 degrees, sat +-100 scales saturation 0x..2x, lum +-100 adds +-0.25
  of HSL lightness.
- `bandWeight` gives each band a triangular window: 1 at its center,
  falling linearly to 0 at the neighbor centers. The eight windows
  partition the hue circle, so at every hue all weights sum to exactly 1:
  neighboring band adjustments blend (half weight each at the boundary)
  instead of stacking or leaving uncovered gaps.
- Adjustment application is weight-blended per pixel: the shifts of all
  bands are accumulated (`dh`, `ds`, `dl` weighted) and applied once in
  HSL space, so band boundaries are smooth by construction.
- Achromatic pixels (saturation < 0.004, hue undefined) always pass
  through; a fully neutral mixer returns the input frame by reference.
- Sanitize validates all eight bands (finite, in range, no unknown band
  keys) and throws like the dabs/curve points; the values are stored
  clamped via `clampBand`. `hslSignature` covers all 24 numbers.

## Rendering

The mixer is source preprocessing, applied last in the `healSource` chain
(spots, mask dabs, graduated filters, radial filters, tone curves, then
HSL), so preview, copy export and the histogram stay one image. The
`sourceKey` reload invariant and the re-encode condition in
`ensureEngineSource` both include the mixer.

## Interaction

- Band buttons with fixed swatch dots select the band; three sliders edit
  it through the session gesture API (live preview during the drag, one
  undo step per drag). Double-click a slider label resets that slider, the
  panel reset button clears the whole band, each as its own commit.
- Sliders reuse the SettingSlider markup (label, changed dot, exact value,
  NativeInput range) with mixer-specific bindings; the swatch hex values
  live in `hslMixer.ts` (`HSL_SWATCH`), not in the tsx, so the components
  hex ratchet stays put.

## Limits (honest)

- HSL, not OKLCH: hue interpolation follows sRGB HSL, which is the classic
  develop-tool behavior but not perceptually uniform. No targeted
  eyedropper (click a color in the photo to select its band) in this
  slice; the band model supports adding one later.
- Like the curves, every debounced preview tick re-encodes the source;
  interactive at the 2048 px cap, heavier than engine sliders.

## Tests and gallery

- `src/lib/photos/hslMixer.test.ts` (6 tests): window partition (sum=1
  across the circle, peaks at centers), rgb/hsl round-trip, red-band
  saturation boost leaving greens and grays untouched with input
  immutability, red hue shift of +100 landing at 60 degrees, boundary
  blending between red and orange, sanitize/validate/signature.
- `?view=photos-hsl`: real workspace + real panel on a decoding engine
  with a horizontal hue sweep (every column one hue, s=0.6, l=0.5). The
  spec boosts red saturation (red columns saturate, green untouched, one
  undo restores), shifts red hue (red moves toward yellow, aqua
  untouched, band reset clears) and captures light/dark. The
  pristine-canvas capture is byte-identical to the same gray source
  rendered by the P53 base (c2130df6).
