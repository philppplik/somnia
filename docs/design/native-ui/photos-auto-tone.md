# Photos auto tone and auto white balance

One-click develop starting points, derived from the preview frame's
pixels. No AI, no new pixel pipeline: every pick is an ordinary
PHOTO_CONTROLS setting applied in ONE atomic commit, so the real engine
renders the result and undo, versions and the settings clipboard treat
it like any hand-moved slider.

## Auto tone (Light section)

- Black/white points from the 0.5th/99.5th luma percentile: blacks only
  deepen when the floor sits above 8/255, whites only lift when the
  ceiling drops below 247/255. A photo that already spans the range is
  left alone.
- Exposure centers the percentile window's midpoint on mid gray
  (log2(128/mid), clamped to +-1.5 stops, 0.05 steps).
- Shadows/highlights nudge the low/high half-window means toward
  64/192 (clamped +-45) - they rebalance, they never stretch.
- The pass samples at most ~60k pixels, so a 24 MP frame costs the same
  as a thumbnail.

## Auto white balance (Color section)

- Gray world over unclipped pixels (luma 16..240, channel spread <=250):
  the red/blue imbalance around green sets temp (warm cast -> higher,
  cooler), the green excess over the red/blue mean sets tint (toward
  magenta, positive).
- Too little usable data (near-monochrome or tiny frames) stays at
  6500 K / 0 rather than guessing.

## Honest limits

- Percentile and gray-world statistics, not scene understanding: a
  sunset stays warm only if the frame averages warm - which it should.
- Auto tone never touches contrast, vibrance or saturation.

## Tests and gallery

- `autoTone.test.ts` (6 tests): dark frame clamps exposure and reclaims
  the floor, washed-out frame reclaims both points, a full-range
  gradient is left alone, flat gray expands the degenerate window,
  warm/cool/green casts steer temp/tint the right way, degenerate
  inputs stay neutral and the frame is never mutated.
- `photos-auto.spec.ts` against the new `?view=photos-auto` proof
  (decoding engine; real workspace plus the real Light and Color
  panels): Auto lifts exposure/whites and deepens blacks on a dark warm
  gradient, toolbar Undo restores all five picks in one step; Auto WB
  cools the warm cast past neutral and one undo returns 6500 K; light
  and dark captures. (Photos registers no Ctrl+z binding - the toolbar
  Undo button is the real undo path and is what the specs drive.)
- i18n: photos.p.auto.tone / photos.p.auto.wb in all five locales.
