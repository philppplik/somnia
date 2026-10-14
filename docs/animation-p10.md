# Animation P10: layer masks, track mattes, text rotation and colour animators

## Masks

A drawable layer (not null or audio) holds up to 4 masks (`Layer.masks`). Each mask is a rectangle or ellipse in layer space (x, y, width, height, range 16384), with mode `add` (paint in) or `subtract` (cut out), `feather` 0..64 px (Gaussian blur) and `invert` (use everything outside the shape). Masks are applied in order on a black or white start, depending on the first mode. Inverted shapes and feather use a work area of three times the composition size around the layer origin. Shape, mode, feather, opacity and invert are described in the P11 section below.

## Track mattes

`Layer.matte = {source, mode: 'alpha'|'luma', invert}`. The source is another drawable layer of the same composition. A source is drawn only through the matte (it disappears on its own) and its effects and gradient still apply inside it. Alpha uses the source alpha, luma its luminance over black; invert flips either. No chains: a matted layer cannot be a source, and a source cannot have its own matte, so there are no cycles. Removing a source layer clears the matte. Parenting, opacity keys and the in/out range of the source are respected at the tick; if the source is outside its range the matte is empty.

## Text animators

Animators from P9 gain `rotation` (degrees at full weight, -3600..3600, applied as the SVG per-glyph `rotate`) and `color` (mixed from the layer colour toward the target by the selector weight). Rotations add across animators, colours mix in order.

## Where it renders

One builder (`masks.ts`) produces the `<mask>` and filter definitions for both the viewer and every export (PNG frame/sequence, GIF, APNG, WebM), so they match. Edits: `layer.masks`, `layer.matte`. Commands: `animation.layer.mask`, `animation.layer.matte`. All are single undo steps and validated by `validateDocument`.

## Tests

`src/lib/animation/animation-p10.test.ts`. `tests/animation-p10.spec.ts` runs in CI only. Local pixel review: `test/animation-preview.html?masks=1`.

## P11: keyed masks, path masks, mask opacity

- Per-mask `opacity` (0..100 percent, absent means 100) scales how strongly the shape paints in or cuts out.
- Position (x, y), size (width, height), feather and opacity can be keyframed (`LayerMask.anim`, linear keys with the usual ease handles). A property with keys wins over its static field. Turning animation off bakes the value at the playhead into the static field. Setting a value on an animated property writes a key at the playhead; on a static one it writes the static value. Edits are snapped to frames and must lie inside the composition.
- Path masks (`shape: 'path'`): 2 to 32 points (3 or more when closed), each with optional bezier in/out handles as offsets, coordinates within 16384. x and y move the whole path, width and height are ignored. The inspector takes a point list and a Smooth curves switch (Catmull-Rom handles, deterministic); open paths keep straight end handles. There is no pen tool and no per-point keyframing yet.
- Same builder for viewer and all exports; every operation is a single undo step (`layer.masks` edit) and validated. Command `animation.layer.mask` gains ops `set`, `animate`, `path`.
- Local pixel review: `test/animation-preview.html?masks=1` (keyed smooth path mask plus translucent rect mask).
