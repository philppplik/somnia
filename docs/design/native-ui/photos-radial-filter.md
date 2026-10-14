# Photos radial filter — elliptical selective adjustment (P52)

Fourteenth functional photo-studio feature phase: the radial
(vignette-style) filter, completing the selective-adjustment trio
next to the dodge/burn mask and the graduated filter. A drag defines
a bounding box; the resulting ellipse takes the filter strengths
(±1 EV, ±100 saturation — shared with the graduated filter) at full
strength inside and fades to zero across a soft edge.

## What changed

- `src/lib/photos/localAdjust.ts`: `RadFilter {x,y,rx,ry}` — center
  and radii in normalized coords (radii relative to width/height, so
  the drag maps 1:1 onto the displayed box). Validated and clamped
  (`RAD_MIN_R` 0.005, `RAD_MAX_R` 1.5 so filters can bleed off-frame,
  cap 20 via `MAX_RADS`). `applyRadialFilters` runs the elliptical
  distance through the same `spotCoverage` feather as dabs (plateau
  to 0.7, falloff to 1.0) and the same EV/luma math, so mask,
  graduated and radial filters compose in one preprocessing chain.
  Never mutates the caller's frame; identity when empty or neutral.
  `radSignature` feeds the reload invariant.
- `studioSettings.ts`: `PhotoSettings` gains `rads`; sanitize
  validates every filter, `photoSignature` covers them. The radial
  filter intentionally SHARES `gradEV`/`gradSat` with the graduated
  filter — one "filter strengths" pair per photo, exactly like the
  dodge mask shares its own pair.
- `studioSession.ts`: the source key and the preprocessing chain now
  include the radial filters
  (`applyRadialFilters(applyGradFilters(applyLocalAdjust(applySpots(...))))`).
- `PhotosWorkspace.tsx`: a Radial mode toggle (Circle icon, exclusive
  with heal, dodge and gradient) with the two shared strength sliders.
  A drag defines the bounding box and commits the ellipse on release —
  one drag = one filter = one undo step, capped to the budget. The
  overlay draws the effect edge (solid), the plateau edge at 70%
  (dashed) and a center handle; the handle is a P50 marker: clicking
  it deletes exactly that filter as one commit/undo step. The
  in-flight box previews in white. Radial mode never pans; wheel zoom
  still works.
- i18n: `photos.rad.toggle` in all five locales (strength sliders
  reuse `photos.grad.ev`/`.sat`).

## Honesty / scope notes

- No rotation and no invert toggle in this slice: the ellipse is
  axis-aligned and the effect lives inside. Both are honest follow-up
  shapes; nothing in the model blocks them.
- Shared strengths are a deliberate scope choice from the approved
  scope line ("gleiche Stärken"): adjusting the sliders re-renders
  both graduated and radial filters of the photo.
- No new dependencies, no WASM.

## Tests

- `src/lib/photos/radialFilters.test.ts`: clamping/validation, center
  full strength, plateau and falloff, far pixels and the input frame
  untouched, independent x/y radii on a flat ellipse, identity cases,
  sanitize and signature coverage.
- Gallery `?view=photos-rad`: real workspace on a decoding-engine
  session over a uniform gray PNG. A drag with +0.7 EV brightens the
  ellipse (center ~2^0.7) while the corners stay byte-identical; the
  in-flight draft and the committed overlay render; clicking a center
  handle deletes exactly that filter (the other stays) and ONE undo
  restores both. Light/dark screenshots; canvas bitmaps byte-identical
  to the P51 base (64695656) — the feature is inert until dragged.
