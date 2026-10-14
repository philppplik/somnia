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

## P12: mask key lanes and on-canvas handles

- Timeline: the selected layer shows one key lane per animated mask property (position, size, feather, opacity). Diamonds select, drag to move (one undo step, Esc cancels), Delete removes (the last key bakes to a static value), arrow keys nudge a frame, and a select sets the ease preset per key.
- Canvas: the selected mask (click its "Mask n" label) shows an outline that drags the mask, four corner handles that resize rect and ellipse masks, and draggable path points. One drag is one undo step. Arrow keys nudge a handle.
- Handles write at the playhead: on an animated property they add or update a key there.
- Not covered: mask keys are not part of the transform key selection, copy/paste or graph editor. No in/out bezier handle dragging, no pen tool, no per-point keys. Ease is preset-based.
- Tests: `animation-p10.test.ts` (ops, box math), `test/animation-preview.html?masks=1` for the pixel review, `tests/animation-p10.spec.ts` (CI-only).

## P13: pen tool, bezier handles, path morph keys

- Pen: the Pen button in the Masks panel arms the tool. Click adds a point, drag while clicking pulls out mirrored bezier handles, clicking the first point of an open path with 3+ points closes it. A new path starts when the mask is not a path yet or the path is closed. One gesture is one undo step.
- Handles: click a path point to select it, then drag its in or out handle on the canvas (mirrored; hold Alt for a corner-style break). Arrow keys nudge a handle.
- Morph: "Animate path" turns the path into whole-path keys (one lane per path mask on the timeline, diamonds move/delete like other mask keys). With keys, dragging a point or handle writes a key at the playhead. Linear between keys, held outside the first/last key. Point count and closed flag are fixed while a path is animated (pen, close and the points text field are refused until the animation is removed). Removing the last key bakes its shape.
- Not covered: per-point independent keys (all points of a path share one lane and one key time), ease per path key, deleting single points, mask path keys in the graph editor.
- Tests: `animation-p10.test.ts` (pen, handle, morph), `test/animation-preview.html?masks=1`, CI-only `tests/animation-p10.spec.ts`.

## P14: path key ease, point insert/delete, mask and key clipboard

- Ease per path key: the lane's ease select now works for path keys (linear, hold, ease, easeIn, easeOut); it shapes the segment that starts at that key. Stored as `ease` on the key (absent = linear).
- Points: with a path point selected on the canvas, "Insert point" splits the curve after it (de Casteljau, the shape does not change) and "Delete point" removes it. On a morphing path the change is applied to every key so point counts stay consistent. Closed paths keep 3 points, open paths keep 1, max 32.
- Clipboard (in memory, not saved): "Copy"/"Paste" in the Masks panel copy a whole mask (keys and path included) to another layer under a new id, capped at 4 masks per layer. In a mask key lane, "Copy" on a picked key and "Paste" at the playhead copy a key (value and ease) within or between masks. Same property only; a path key needs the same point count and closed flag.
- Every action is one undo step. Not covered: mask keys in the graph editor (the editor is built around transform keys), per-point lanes.

## P15: mask keys in the graph editor

- The graph editor lists every animated mask property (and morphing path) of the selected layer under the transform properties. Picking one shows its curve (value graph, x/y channel switch for position and size). Keys drag in time and value as one edit (`keyEdit`, ease kept), a picked key offers its ease select and draggable in/out ease handles (`keyHandle`). One drag is one undo step, Esc cancels.
- A path morph has no value curve; it shows one ease select per path key.
- Transform keys keep their existing graph code and tests untouched; "Transform" or any transform property returns to them. The mask graph is a separate component (`MaskGraph.tsx`) that reuses the curve/handle maths of `graph.ts`, so mask keys do not take part in the transform key selection, copy/paste or speed mode.
