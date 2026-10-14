# Photos targeted adjustment

The Curves panel and the Color mixer panel each carry a target toggle
(crosshair icon). While armed, the photo itself becomes the control:
a drag on the image edits the curve or the mixer directly, the way the
targeted adjustment tool works in classic develop applications.

## Behavior

- **Curves armed:** pointer down reads the luma of the clicked pixel of the
  rendered frame. If a point on the active channel's curve sits within 6%
  of that tone it is grabbed; otherwise a new point is added on the curve
  at exactly that tone. Dragging up or down moves the point's y (a full
  image height of drag spans the whole box). The drag runs through the
  session gesture API: live preview, one undo step per drag.
- **Mixer armed:** pointer down reads the hue of the clicked pixel and
  selects the band that owns it (`bandForHue` - the band buttons in the
  panel follow the selection). Dragging up or down changes that band's
  saturation (a full image height covers the whole -100..100 range).
- The toggles disarm each other; Escape disarms from anywhere; the active
  tool modes (heal, dodge, gradient, radial, crop) win over the target
  tool, so arming never hijacks a tool the user picked in the toolbar.
  Wheel zoom keeps working while armed.

## Implementation

- `src/lib/photos/targeting.ts`: pure helpers - `bandForHue` (argmax of
  the triangular band windows), `nearestCurvePoint` (grab tolerance),
  `targetSliderDelta`/`targetCurveDelta` (vertical drag to value).
- The panels arm via the shared panel-state store (`photos.curves.target`,
  `photos.hsl.target`), mutually clearing each other. The workspace reads
  the same keys plus the panels' channel/band selection keys, so the drag
  always edits what the panel shows.
- `pixelAt` reads the rendered frame (`session.frame`), so targeting
  always aims at what is on screen - the same bytes the histogram and the
  canvas show, including earlier edits in the chain.

## Limits (honest)

- The mixer target sets saturation only (the most-used targeted axis);
  hue/luminance stay panel-side. Curves target the active channel only.
  Both are deliberate scope cuts; the model does not block more axes.
- No persistent on-canvas marker for the grabbed point in this slice; the
  feedback lives in the panel (point appears, band gets selected).

## Tests and gallery

- `src/lib/photos/targeting.test.ts` (3 tests): band ownership at
  centers/boundaries/wrap-around, grab tolerance, drag-delta mapping
  including the zero-height guard.
- `photos-target.spec.ts` against the existing curves and mixer proofs:
  arming the curves panel and dragging up on the gradient brightens that
  tone (point appears in the panel, endpoints stay pinned, one undo
  restores); arming the mixer and dragging down on the green sweep
  selects the green band and lowers its saturation (pixel convergence
  verified, one undo restores); light/dark captures with pristine-canvas
  parity against the P54 base (66bec21b).
