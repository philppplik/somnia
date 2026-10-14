# Photos adjustment brush

The Brush mode paints local adjustments with per-stroke values. Where the
Dodge/Burn mask shares one global strength across all dabs, every brush
stroke carries its own exposure, temperature and saturation, frozen when
the stroke is painted.

## Behavior

- The toolbar's Brush toggle arms the mode (mutually exclusive with
  clone stamp, dodge, gradient and radial; tool modes win over the
  targeted adjustment). While armed, four sliders set the NEXT stroke's
  radius, exposure (-1..1 stops), temperature (-100..100) and saturation
  (-100..100). The sliders are panel state, not document state.
- A drag paints a chain of soft dabs (one every half radius, same
  spacing as the dodge mask). Release commits ONE stroke - one undo
  step - with the slider values frozen into it.
- The overlay shows every stroke's dabs tinted plus a centroid marker;
  clicking a marker deletes that stroke (also one undo step), matching
  the heal/dodge/grad/rad markers. Escape disarms the mode.
- Strokes raster into the source in the existing preprocessing chain
  (spots, dabs, grads, rads, BRUSHES, curves, hsl), so preview, export,
  zoom and filmstrip all see the same pixels. `sourceKey` includes the
  brush signature, so painting triggers the re-encode exactly like the
  other local tools.

## Limits (honest)

- A stroke's values are NOT editable after the fact; delete and repaint
  (a deliberate cut - the data model would allow it, the UI does not
  yet). Budget: 20 strokes, 200 dabs total per photo.
- Temperature is a luma-neutral r+/b- shift in display space, not a
  Kelvin model; the range (-100..100) is a display delta, matching how
  the mixer bands work in the same chain.

## Implementation

- `src/lib/photos/brushStrokes.ts`: the stroke model, clamp/validate,
  per-stroke `applyBrushStrokes` (strongest-dab coverage per pixel,
  2^(ev*w) gain, temp shift, luma mix for saturation; never mutates the
  input frame).
- Settings carry `brushes: BrushStroke[]`; sanitize validates and caps;
  `photoSignature` includes `brushSignature`, so undo, dirty tracking,
  versions and the settings clipboard all see strokes.

## Tests and gallery

- `brushStrokes.test.ts` (4 tests): no-op cases, mask locality + input
  immutability + warm shift + desaturation math, stroke ordering and
  clamping, shape validation and the dab budget.
- `photos-brush.spec.ts` against the new `?view=photos-brush` proof
  (decoding engine, flat gray field): a +1 EV stroke brightens only the
  painted region (undo restores, redo+marker-delete restores, undo of
  the delete returns the stroke); per-stroke values freeze (warm patch
  stays warm after a later dark stroke elsewhere); Escape disarms;
  light/dark captures. Parity: versions-proof canvas bitmaps
  byte-identical to the P56 base ab08a092 (cmp verified).
