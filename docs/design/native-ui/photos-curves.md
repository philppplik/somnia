# Photos tone curves

The Photos studio has a Curves panel (`photos.curves`, right rail between
Histogram and Light): a master (RGB) curve plus one curve per color channel,
each a set of draggable points with the live histogram of the rendered
preview as the backdrop. Click the curve to add a point, drag points to
shape the curve, pull a point below the box to delete it, Reset curve clears
the active channel.

## Model

- `src/lib/photos/curves.ts`: `PhotoCurves { master, red, green, blue }`,
  each channel up to 16 interior points (`CurvePoint {x, y}`, both 0..1).
  The endpoints (0,0) and (1,1) are pinned implicitly and cannot be moved,
  so a curve can never clip the range ends by accident.
- Evaluation is a monotone cubic Hermite spline (Fritsch-Carlson) through
  the pinned endpoints and the sorted points: smooth, but it never
  overshoots between points, so the resulting 256-entry lookup table stays
  non-decreasing and cannot invert tones between neighbors.
- `sanitizeCurvePoints` sorts by x, clamps into range, collapses
  near-duplicate x (the later point wins) and caps the count; it is the
  stored form and runs inside `sanitizePhotoSettings`, so history entries
  and previews always carry the normalized shape. Unknown channel keys and
  malformed points throw, like unknown settings keys.

## Rendering

Curves are source preprocessing, same family as heal spots, mask dabs and
the graduated/radial filters: `healSource` applies them last in the chain
(after local corrections, before the engine loads the PNG), so preview,
copy export and the histogram describe one and the same image. The engine
never hears about curves; they survive export because they are baked into
the source the engine loads. The reload invariant (`sourceKey`) includes
`curvesSignature`, and `ensureEngineSource` re-encodes whenever any
preprocessing input is non-neutral — curves included.

The master curve composes first, then the per-channel curve of each
channel (`red = lutR[lutM[v]]`), which is the classic RGB-then-channel
order of develop applications.

## Interaction

- The panel uses the session gesture API: `beginPhotoGesture` on pointer
  down, `previewPhotoSettings` per move (live preview, debounced re-render),
  `endPhotoGesture` on release. One drag is exactly one undo step,
  including a drag that ends in a deletion below the box.
- A dragged point's x stays between its neighbors (minimum gap 0.01), so
  points cannot cross; y is clamped to 0..1. Pulling a point more than
  15% of the box height below the bottom edge marks it for deletion: it
  leaves the preview immediately and the release commits the removal.
  Dragging back into the box before releasing re-inserts it.
- The hit radius for grabbing an existing point is about 4% of the box
  diagonal; clicking elsewhere adds a new point (up to 16 per channel).
- The backdrop histogram is the same `computeHistogram` data the Histogram
  panel shows, channel-matched (luma for master). Grid lines at quarters
  and a dashed neutral diagonal give orientation; the curve itself is a
  256-step polyline of the LUT, so what you see is exactly what is applied.

## Limits (honest)

- No keyboard editing of points and no numeric point fields in this slice;
  the curve is pointer-driven. Endpoints are pinned (no black/white point
  moves). No parametric (region) sliders. All three are follow-up-shaped,
  the model does not block them.
- Re-encoding the source on every debounced preview tick is heavier than
  an engine-side slider; at the 2048 px source cap this stays interactive,
  but very large sources will feel it. That is the price of keeping
  preview = export = histogram without engine changes (no WASM work in
  this slice).

## Tests and gallery

- `src/lib/photos/curves.test.ts` (6 tests): LUT identity/pinned
  endpoints/monotonicity, S-curve shape, sanitize sort/dedupe/cap,
  master-then-channel composition on pixels with input immutability,
  neutral passthrough, settings sanitize/validate/signature.
- `?view=photos-curves`: real workspace + real panel on a decoding engine
  with a horizontal gray gradient (every column one tone value). The spec
  drags a mid point up (midtones lift, endpoints pinned, one undo
  restores), pulls the red channel down (only red dims), deletes by
  dragging below the box, resets the channel, and captures light/dark.
  The pristine-canvas capture is byte-identical to the same gray source
  rendered by the P52 base (ddc5d48a).
