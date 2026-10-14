# Photos graduated filter — linear selective adjustment ramp (P51)

Thirteenth functional photo-studio feature phase: the classic
graduated neutral-density filter. A drag in the canvas defines a ramp
between a start plane (full strength) and an end plane (zero); the
gradient brightens/darkens (±1 EV) and (de)saturates (±100) along it.
The third selective-adjustment tool after the clone stamp and the
dodge/burn mask — and like them it pre-processes the source before
the engine loads it, so preview, export and undo behave exactly like
any other develop setting.

## What changed

- `src/lib/photos/localAdjust.ts`: the filter model and the pixel
  pass. A `GradFilter` is two normalized points (validated, clamped,
  minimum length 0.02 via `GRAD_MIN_LEN`, cap 20 via `MAX_GRADS`).
  `applyGradFilters` projects each pixel onto the ramp axis and uses
  the same smooth coverage (`spotCoverage`: plateau to t=0.7, smooth
  falloff to t=1) and the same EV/luma math as the dab mask, so both
  compose in one preprocessing chain. It never mutates the caller's
  frame and returns the input unchanged when the filter list is empty
  or both strengths are neutral. `gradSignature` feeds the reload
  invariant.
- `studioSettings.ts`: `PhotoSettings` gains `grads`, `gradEV`
  (-1..1) and `gradSat` (-100..100), neutral `[]/0/0`. Sanitize
  validates every filter and clamps the strengths; `photoSignature`
  covers all three, so undo/redo, dirty tracking and settings
  copy/paste treat gradients like any other setting.
- `studioSession.ts`: the source key and the heal/dodge preprocessing
  chain now include the filters
  (`applyGradFilters(applyLocalAdjust(applySpots(...)))`).
- `PhotosWorkspace.tsx`: a Gradient mode toggle (SquareDashed icon,
  exclusive with heal and dodge) with two strength sliders that commit
  on change like the dodge sliders. A drag defines the filter and
  commits it on release — one drag = one filter = one undo step,
  capped to the filter budget. The overlay draws the start plane
  (solid), the end plane (dashed), the ramp axis and a handle at the
  midpoint; the handle is a P50 marker: clicking it deletes exactly
  that filter as one commit/undo step. The in-flight drag previews in
  white. Gradient mode never pans; wheel zoom still works.
- i18n: `photos.grad.toggle`, `.ev`, `.sat` in all five locales.

## Honesty / scope notes

- The filter has independent strengths from the dodge mask: a sky
  darkening does not move when the dodge amount changes, and both
  apply in one preprocessing pass.
- The ramp uses the dab feather curve (plateau + smooth falloff), so
  the "full strength" region extends 70% along the drag — the end
  line marks where the effect reaches zero, matching how the mask
  edges already behave.
- No new dependencies, no WASM.

## Tests

- `src/lib/photos/gradFilters.test.ts`: clamping and the minimum
  length on degenerate drags; validation rejects out-of-range,
  non-finite and too-short filters; a vertical ramp darkens the top
  fully, holds the plateau, falls off smoothly and leaves the far side
  and the input frame untouched; saturation lerps toward luma;
  sanitize and signature coverage.
- Gallery `?view=photos-grad`: real workspace on a decoding-engine
  session over a sky/field PNG. A drag with -0.7 EV darkens the sky
  band while the field stays byte-identical; the in-flight draft and
  the committed overlay render; clicking a handle deletes exactly that
  filter (the other stays) and ONE undo restores both. Light/dark
  screenshots; canvas bitmaps byte-identical to the P50 base
  (2d9d494e) — the feature is inert until dragged.
