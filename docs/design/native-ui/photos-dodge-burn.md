# Photos dodge/burn — local adjustment mask (P46)

Tenth functional photo-studio feature phase, and the first slice of
selective adjustments: a persistent mask the user paints with dab
strokes, brightening/darkening (±1 EV) and (de)saturating the masked
region — the classic dodge/burn workflow, plus local saturation.

## What changed

- `src/lib/photos/localAdjust.ts`: the mask model and the pixel
  operation. A `MaskDab` is a normalized point with a radius (fraction
  of the shorter side), validated and clamped like heal spots (cap 200
  via `MAX_DABS`). `applyLocalAdjust` walks the dabs in order and, per
  covered pixel (same smoothstep feather as the clone stamp), scales
  the channels by `2^(ev*w)` and then lerps toward the pixel's luma by
  `sat% * w` — negative saturations desaturate. It never mutates the
  caller's frame and returns the input unchanged when the mask is empty
  or both strengths are neutral. `dabSignature` feeds the reload
  invariant.
- `studioSettings.ts`: `PhotoSettings` gains `dabs`, `localEV`
  (-1..1) and `localSat` (-100..100), neutral `[]/0/0`. Sanitize
  accepts the new keys, defaults old payloads to neutral, validates
  every dab and clamps the strengths; `photoSignature` covers all
  three, so undo/redo, dirty tracking and settings copy/paste treat the
  mask like any other develop setting.
- `studioSession.ts`: the loaded-source identity is now
  `name|spots|dabs|localEV|localSat`. When spots or dabs exist,
  `healSource` decodes the pristine library bytes, stamps the heal
  spots, applies the local mask on top, re-encodes PNG and hands that
  to the engine — preview and export both carry the local adjustment
  through the real engine pipeline, with no engine-contract change.
  Undoing the last dab re-loads the true source; compare/split still
  show the genuine original.
- `PhotosWorkspace.tsx`: a "Dodge/Burn" toggle (new `Contrast` icon)
  sits next to Clone stamp; the two modes are mutually exclusive and
  both are disabled while cropping. In dodge mode the stage shows the
  same brush cursor (own persisted radius `photos.dodgeRadius`), a
  press paints one dab on release (one settings commit = one undo
  step), and two toolbar sliders set the mask strength (EV, -1..1) and
  mask saturation (-100..100) through the normal commit path. Heal
  mode's drag/click behaviour is unchanged.
- i18n: `photos.dodge.{toggle,radius,amount,sat}` in all five photo
  locales (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/localAdjust.test.ts` (5 tests: dab
  clamp/validation, signature stability, empty/neutral passthrough,
  brightening core + untouched outside + feather falloff, desaturation
  to luma and saturation push). The full photos suite — 126 tests —
  passes with every pre-existing test unmodified. (The suite caught a
  real input-mutation bug in the first draft: the output buffer aliased
  the caller's frame.)
- Browser: `test/design-system/photos-dodge.spec.ts` drives the real
  workspace via the `?view=photos-dodge` gallery route on a decoding
  engine: a +0.7 EV dab lands `100·2^0.7 ≈ 162` on the masked disc with
  the surround untouched and undo byte-restoring the canvas; a -100
  saturation dab greys the disc to the pixel luma. The light/dark theme
  test shows the active toggle, the three sliders and the brush cursor;
  its canvas bitmaps are pixel-identical to the P45 base (c5241b18) run
  with the same proof and spec.
