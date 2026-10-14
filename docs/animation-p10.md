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

## P16: multi-key selection, speed mode, multi-key clipboard for mask keys

- Mask graph: click a key, shift/ctrl-click adds or removes, drag on empty plot box-selects (shift adds), a plain click on the plot clears the selection and moves the playhead. Dragging a selected key moves and revalues the whole selection as one edit (`keysEdit`); the ease select applies to all selected keys (`keysEase`); in/out ease handles show when exactly one key is selected.
- Speed mode: the Value/Speed buttons (shared with the transform graph) switch the mask curve to units per second; keys are hidden in speed mode like in the transform graph.
- Clipboard: Copy keeps the selected keys of one property with times relative to the first key and their ease; Paste puts them at the playhead on the property shown in the graph, on any mask, when the value type matches (scalar or vec2). Values must fit the target range (feather 0..64, opacity 0..100); otherwise the paste is refused and nothing changes.
- Not covered: pasting between mask and transform properties (transform keys use a different edit path), box selection across several properties, keyboard-only multi-select.

## P17: one key clipboard for transform and mask keys

- `keysClipboard.ts` defines the shared clipboard model (`KeysClip`: value type, times relative to the first key, values, ease) with adapters per target: mask keys (`copyMaskKeys` / `pasteMaskKeys`) and transform keys (`copyTransformKeys` / `pasteTransformEdits`). Both graphs show Copy and Paste next to their property list.
- Paste lands at the playhead on the property being shown. It works across mask and transform properties when the value type matches (scalar to scalar, vec2 to vec2); otherwise it is refused. Values must fit the target range. A paste is one undo step (transform pastes dispatch their edits as one batch; an unanimated transform property is animated first).
- The existing transform key clipboard (`keyclip.ts`, timeline copy/paste) is unchanged.
- Not covered: box selection across several properties (each graph still selects within its own property), a single graph view that mixes transform and mask curves. Transform and mask graphs stay separate components over the shared clipboard model.

## P18: key targets and the Mixed graph

`lib/animation/keyTargets.ts` describes where keys live (`transform` or `mask` target), lists animated targets, and turns a mixed selection into edits. Mask edits replace the whole mask list, so `moveTargetKeys` and `easeTargetKeys` fold them into one `layer.masks` edit next to the transform edit, one undo step. The Mixed view (`MixedGraph.tsx`, opened from the property list) draws each curve on its own 0-100% scale; box-select spans properties, dragging a key moves the whole selection in time, collisions keep the last valid preview.

## P22: text animator sweeps and motion library

Text animators gain a `unit` (`char` or `word`) and a `stagger` op in `animatorEdit` (`wave` or `reveal`, over N seconds) that writes selector-offset keys; offsets validate to ±200. Hover or focus on Wave/Reveal previews without a history step, click is one undo. There is no line unit: text renders as one `<text>` line.

`lib/animation/motionLibrary.ts` holds five built-in motions (pop, pulse, float, swing, fade out) and a localStorage library (max 50 user presets, 200 keys each, validated on load). Position, anchor and rotation are stored as offsets from the layer value, scale and opacity as absolutes. Commands: `animation.motion.apply` (selected layers, one undo), `animation.motion.save` (from selected transform keys), `animation.motion.delete`. Presets never overwrite properties that already have keys.

## P23: presets in the document

User motion presets now live in `AnimationDocument.motions` (`{version:1,items}`, max 50 presets, 200 keys each, validated with the document, saved in `.somnia` snapshots). Save, delete and import are one `motions.set` edit each, so one undo step. `lib/animation/motionModel.ts` holds the model and validation.

Export writes `somnia-motions.json` (`{format:'somnia-motions',version:1,presets}`, max 300 KB). Import parses and validates first; the UI lists the file's presets with hover preview on the selected layer and only adds them on "Add". Imported presets get fresh ids and unique names (built-in names count as taken).

Migration: presets saved in localStorage by P22 are copied once into any opened document that has no library yet (one undo step; the browser copy is left untouched and is never read again once the document has a library).

## P24: easing editor

The graph sidebar gets an Easing editor for the primary selected key: four numeric cubic-bezier handles (x 0..1, y -2..3) with a curve preview, one undo step per edit (`animation.keys.cubic`). Dragging the handles in the graph (P5) is unchanged. Named easings are saved in the document (`AnimationDocument.easings`, `{version:1,items}`, max 50, validated, in snapshots; `easings.set` edit) and applied to the selected keys with hover preview. Built-in names (ease, overshoot, ...) are reserved.

Elastic (`animation.keys.elastic`, 1 to 5 swings) bakes ordinary keys that overshoot and settle on the second key, like the P21 bounce; overshoot is clamped to the property's own range (opacity stays within 0..100). A single cubic cannot ring, so bounce and elastic are baked keys, not curve presets.

## P25: graph sidebar layout and path morph

The Easing editor in the graph sidebar is collapsible (state remembered) and scrolls its header and curve into view when a key is selected, so the curve preview shows in the short graph pane; the numeric fields are compact.

Path morph: `morphTo` mask op (`animation.layer.mask` with `op:'morphTo', mask, other, t`) keys a path mask at `t` to another path mask's shape, placed in the target's mask space. An unanimated path first gets a key at the composition start holding its current shape. Refused with a readable message when the point counts or closed flags differ, when both masks are the same, or when `t` is the first frame of an unanimated path. Points match by index; there is no automatic point matching, reversing or resampling. The UI row sits under "Animate path" with hover preview and an inline refusal message. One undo step.

## P26: morph point matching

`morphTo` takes `match:'resample'` (the source path is resampled by arc length to the target's point count, at most 32 points, 16 samples per segment; smooth handles are rebuilt only when the source had handles), `reverse` (flips point order and swaps in/out handles) and `shift` (rotates the start point, closed shapes only). Default is still index matching, which refuses unequal counts. Refusals are `MorphError`s with a locale key (`animation.morph.err.*`) and numbers, shown localized in the UI; the English text stays as the error message for commands and logs. Corners are not preserved by resampling a polygon: new points sit evenly on the outline, so sharp corners can round off.

## P27: path shape layers

A shape layer with `shape:'path'` is now a full bezier path layer. Its points stay normalized (0..1 of the layer box) and may carry in/out handles (offset ±2). `source.pathKeys` holds morph keys (same point count and closed flag as `path`, at most 32 points, at most 64 keys, ascending ticks). `lib/animation/pathLayer.ts` owns rendering (`layerPathD`, used by the canvas and every export; plain polygons keep the old output) and edits (`pathLayerEdit`: points, animate, point, morphTo; `maskToLayerEdit`). Morph reuses the mask code (resample, reverse, start point, localized `animation.morph.err.*`) and refuses when points would leave the layer box. Commands: `animation.layer.path`, `animation.mask.toLayer`. Each is one `layer.update` or `layer.add`, so one undo step. Rect, ellipse, star and polygon are untouched.

Not done: drawing a path layer with the pen on the canvas, point handle dragging for layers, and morph ignores transform differences between layers.

## P28: pen drawing and handle dragging for path layers

`components/animation/PathLayerOverlay.tsx` draws on the canvas. The Pen toggle (command `animation.layer.pen`) turns on the pen: with no path layer selected the first click creates a composition-sized path layer at the origin (`penNewLayerEdit`, one `layer.add`); on a selected open path layer each click appends a point (`pathLayerEdit` op `pen`), a drag of 1% or more pulls symmetric handles, a click on the first point (3+ points) closes the path, Esc or Enter finishes. A drag in progress is a session preview that commits on release, so each click or drag is one undo step; Esc during a drag cancels it. On a selected path layer, points drag (`point`), the selected point shows in/out handles (`handle`, Alt breaks symmetry), arrow keys nudge. Bounds: points clamp to 0..1 of the layer box, handles to +-2, at most 256 points (32 and a time on animated paths); pen and close are refused while the path is animated, handle and point edits on an animated path key at the playhead.

Not done: no Bezier segment insertion by clicking the outline, no point delete on canvas (use the points field), pen points never leave the layer box.

## P29: on-canvas path editing

On a selected path layer: click the outline to insert a point there (`insert`, de Casteljau split at the clicked curve parameter, shape unchanged, corners stay corners), drag the outline to move the layer (`pathLayerMoveEdit`: one `prop.set` on position, keyed at the playhead when animated, delta mapped through the parent matrix), Alt-click a point or press Delete/Backspace with a point selected to remove it (`remove`: closed paths keep 3 points), double-click a point or use the toolbar button to switch it between smooth (Catmull-Rom handles) and corner (`corner`). On an animated path insert, remove and corner apply to every morph key, so the keys stay in step; inserts stop at 32 points there (256 otherwise). Handles of the selected point sit under the point circle so a zero-length handle never blocks the point. Each action is one undo step.

Not done: no multi-point selection or marquee, no drag of a single segment, no on-canvas point insert while the pen tool is on.

## P30: multi-point selection, group edits and segment drag

Selection of a path layer is a set of point indices (view state, `layerSet`). Click selects one point, Shift-click toggles a point, and with Shift held a marquee can be dragged on the canvas to select every point inside it (a Shift-click on empty space clears). Dragging a selected point moves the whole set (`movePoints`: one shared delta, limited by the layer box so the shape is kept), Alt-click or Delete removes the set (`removePoints`, closed paths keep 3, animated paths 2) and the Smooth/Corner button or `cornerPoints` converts the set. Alt-drag on the outline reshapes the segment under the pointer (`segment`: both control points move by d / (3u(1-u)), u clamped to 0.1..0.9, handles bounded to +-2, straight segments become curves). Plain outline drag still moves the layer and a click still inserts a point. On animated paths movePoints and segment key at the playhead; removePoints and cornerPoints apply to every morph key. One undo step per action.

Path booleans were not added: the only boolean code (`lib/svgedit/booleans.ts`) patches SVG source text for the SVG editor, and a path layer holds a single subpath while a boolean result can be compound.

## P31: compound path groundwork and select-all

`LayerSource.subpaths` holds further normalized subpaths next to `path` (the main one), so older documents, which only have `path`, stay valid and read as one subpath (`pathSubpaths`). Limits: path shapes only, 1 to 7 extra subpaths (8 in total), each at most 256 points and 512 points in total, points 0..1 and handles +-2 as for single paths, never together with `pathKeys`. Compound paths render as one `<path>` with several `M` segments and `fill-rule="evenodd"` (canvas and every export; single paths keep the old output and default fill rule). Edits: `addSubpath`, `removeSubpath` (index 1..n), and `combinePathsEdits` / command `animation.layer.pathCombine`, which merges another path layer into this one through both world matrices at the composition start (shapes keep their place), removes it and is one undo step. Compound paths cannot be animated or morphed yet and the canvas overlay edits only the main path; the other subpaths are drawn as outline.

Ctrl/Cmd+A selects every point of the selected path layer, Esc clears the point selection (view state only, no undo step).

## P32: path booleans

`animation.layer.pathBoolean` (`booleanEdits`) unites, subtracts, intersects or excludes two path layers. The target keeps its place and style, the other layer is removed; one dispatch, so one undo step. The other layer is mapped through both world matrices at the composition start, like combine.

Own implementation in `lib/animation/pathBoolean.ts`, no dependencies. **Curves are flattened, not exact**: each bezier segment becomes 2 to 24 straight pieces (tolerance about 0.25 px in layer pixels), so results are corner points without handles. Edges of both inputs are split at their crossings, both sides of each piece are probed against both regions (even-odd), and pieces where the result changes are chained into rings. Holes become extra subpaths (even-odd).

Limits: closed paths only; inputs must not cross themselves (only A against B crossings are split); each input at most 1200 flattened segments; result at most 512 points, 8 subpaths (existing path validation); the result must stay inside the target layer box; empty results are refused. Refused for animated, locked, same and non-path layers. Slivers below about 1e-5 px are dropped, touching corners can leave a pinched single ring.

## P33: mask booleans, expand stroke, boolean hover ghost

Checked first: P32 booleans only worked between path layers; masks had no boolean and a layer stroke could not be turned into geometry (`layer.stroke` could not even be removed, it now accepts `null`).

- `animation.mask.boolean` (`maskBooleanEdit`): unite, subtract, intersect, exclude of two masks of one layer (rect, ellipse and closed path masks; ellipses are flattened bezier circles). Mask A becomes a path mask with the result, mask B is removed; one `layer.masks` edit, one undo step. A mask holds one path of at most 32 points, so: results with holes or several parts are refused; rings above 32 points are thinned with Douglas-Peucker at 0.5 px or refused. Refused for animated (position, size, feather, opacity, path keys), inverted and open masks, masks with different modes, locked layers. Result is corner points (curves flattened), feather and opacity of A are kept.
- `animation.layer.expandStroke` (`expandStrokeEdits`): the stroke of a static path layer becomes a new filled path layer in the stroke colour (named "<name> stroke"), and the source layer loses its stroke; two edits in one dispatch, one undo step. Geometry matches the renderer defaults: butt caps, miter joins with limit 4 (longer miters fall back to a bevel). Own engine: union of one rectangle per flattened segment plus join wedges (`strokeOutline`). Curves are flattened (about 0.25 px), so the outline has no handles. Masks, matte and effects are copied to the outline layer. Refused: no or zero-width stroke, animated path, trim or dash set, locked layer, more than 300 flattened segments, results above 8 subpaths or 512 points.
- Hover ghost: hovering or focusing Apply in the layer boolean row and in the mask boolean row shows the result as a preview transaction (`previewEdits`), dropped on leave, click or blur. It never creates a history step or touches the document.

## P34: stroke joins and caps

Checked first: the renderer (canvas and export share `strokeAttributes`) had only the SVG defaults, miter joins and butt caps, and no way to set anything else.

- `Layer.stroke.join` (`miter`, `round`, `bevel`) and `Layer.stroke.cap` (`butt`, `round`, `square`) are optional. Absent means the old SVG defaults, and then the render and export output is byte for byte what it was before (tested). Round and bevel joins and round and square caps are written as `stroke-linejoin` and `stroke-linecap` in the canvas and in every export. Validation rejects other values. The inspector stroke section has a join select and a cap select; each change is one `layer.stroke` edit, one undo step.
- Expand stroke honours both: miter joins keep the limit 4 with a bevel fallback, round joins and caps are arcs within 0.1 px, caps only apply to open subpaths. Curves are still flattened (about 0.25 px).
- Limit, stated plainly: dashes are NOT expanded. The renderer dashes with `pathLength=100` and a `8 4` pattern, which gives about 8 dashes per subpath, and an outline needs one ring per dash while a path layer holds at most 8 subpaths (512 points). Expand stroke therefore still refuses trimmed or dashed strokes with an explanatory error.
- Not covered: the effect bounds still pad strokes by their width, which is enough for round and square caps but not for very sharp miter joins (that was already so).

## P35: text animator tracking and ease, text on a path

Checked first. Text animators already had a range selector (start, end, softness, keyable offset, stagger wave and reveal), units character and word, and position, scale, opacity, rotation and colour. Text layers had no tracking, no selector ease and no text on a path. Only gaps were built.

- `TextAnimator.tracking` (-200..200 px, absent = 0): spacing added after each character at its selector weight. It is carried by the same relative `dx` the renderers already write, so canvas and every export agree. Characters after a tracked one keep the shift (selector weights decide how much each adds).
- `TextAnimator.ease` (`linear` default, `smooth`, `in`, `out`): shapes the softness ramp only. Characters inside the range stay at weight 1, outside the ramp at 0. Absent keeps the old output exactly.
- Inspector: tracking field and ease select per animator; both are `animation.text.animator` patch fields, one undo step each.
- Text on a path: `source.textPath` (corner and bezier points in the text layer's pixels, 2 to 64 points, validated, text layers only) and `source.textPathStart` (0..100 percent along the path). Command `animation.text.path` (`textPathEdit`): `set` copies a static path layer through both world matrices at the composition start, so it keeps its place; `start` moves the start; `clear` goes back to the straight baseline. One `layer.update` each, one undo step. Rendered as SVG `textPath` in canvas and in every export (the path is an inline `<defs>` element with id `tp-<layer id>`). Without `textPath` the output is unchanged.
- Limits, stated plainly: the path is a copy (later edits of the path layer do not follow). Animated and compound path layers are refused. Text that does not fit the path is clipped by the renderer, as SVG does. Animator x shifts run along the path and y shifts across it. Per-glyph rotation follows the path automatically.
- Not built: a `line` selector unit. Text layers are one line (no wrapping or line breaks in the renderer), so lines do not exist yet; characters and words are the units.

## P36 - Property links, modifier inspector, wiggle in hertz

Wiggle and loop modifiers already existed (`modifierModel.ts`, `modifiers.ts`). Added:

- `link` modifier `{layer,prop,multiplier,offset}`: the property becomes `source * multiplier + offset` per channel. Wiggle still adds on top. Depth capped at 8.
- Rules: one link per property, same value kind only (no vec2 to scalar), no self-link, loops are refused, a link to a removed layer is inert.
- `modifier.set` edit and commands `animation.modifier.set` and `animation.modifier.link`. One undo step each.
- Inspector section "Modifiers" (`PropertyModifiers.tsx`) for wiggle, loop and link.
- Fix: the `modifier` command schema could not take an object.
- Behavior change: wiggle frequency is now real hertz (was evaluated per tick, so it looked like white noise). Existing wiggle output changes.
- Limit: inspector number fields show the unlinked value.
- Preview mode `?links=1` in `test/animation-preview.tsx`.

## P37 - Graph editor polish

Already there: value graph and speed graph toggle, draggable bezier handles, keyboard handles, numeric ease editor, saved easings.
Added:

- Cubic-bezier presets `smooth`, `snappy`, `back`, `expo` (in the preset rows, hover preview, key.interp).
- Handle snapping to a 0.05 grid (Snap toggle, on by default; hold Alt to invert while dragging).
- Mirror handles toggle (off by default): dragging one handle moves the opposite handle of the same key through the key. Both handles change in one `key.interp` edit, so it is one undo step. It does nothing at the first or last key.
- Copy and paste an easing curve (`animation.ease.copy`, `animation.ease.paste`, buttons in the Easing editor). Paste is one `keys.interp` edit on all selected keys.
- Limits: snap, mirror and the curve clipboard are view state and are not saved. Mirroring is point reflection in time and value, so with unequal neighbour spans the two handle values differ.

## P38 - Export settings

Already there: PNG frame, PNG sequence ZIP, GIF, APNG and WebM (real time) exports of the work area, transparency option, progress with Cancel for every multi-frame export, size caps (1800 frames, 8192x8192 px, 64 MB, GIF 300 frames, WebM 60 s).
Added (`exportSettings.ts`, `ExportSettingsPanel.tsx`, `animation.export.settings`):

- Output size (scale 10 to 400 percent), output frame rate (1 to 60, or the composition rate) and a frame range (first and last composition frame, default the work area). All export builders honour them; the SVG is scaled into the output size, so vector artwork stays sharp.
- Presets: Web GIF, Small GIF, Social WebM, Transparent APNG, Transparent PNG frames, PNG frames at 2x. A preset sets scale, rate and transparency; the range is kept.
- Readout per format before rendering: frame count, duration, pixel size and a rough size guess. Format caps are checked up front and shown in red; export refuses with the same message.
- Settings are session state, not document data: no undo step, not saved with the file.
- Not supported and skipped: animated WebP and MP4 (no encoder in the app, would need a new dependency or an unreliable MediaRecorder codec), Lottie JSON (no converter exists).
- Limits: sizes are guesses from pixel count; a rate that does not divide the composition rate samples at exact times, so frames can fall between source frames. First and last frame are composition frames, not output frames. GIF delays round to whole centiseconds (existing).

## P39 - Timeline polish

Already there: visible and lock toggles, marker add/jump/delete, marquee key multi-select, key copy/cut/paste/delete shortcuts, work area, ruler scrubbing, `animation.layer.reorder` and `solo` (commands only, no timeline UI).
Added:

- Timeline zoom (1x to 64x) and horizontal scroll: zoom in/out, Fit, Work area, a scroll slider, Ctrl or Cmd with the wheel (zooms around the pointer), Shift with the wheel (scrolls), keys `+`, `-`, `0` when the timeline has focus. The view follows the playhead during playback and scrolls when a drag is held at the edge. Zoom and scroll are view state (no undo step).
- Snap toggle: scrubbing, key drags and work-area edge drags snap to markers, work-area edges, the playhead and the composition ends within 6 px. Hold Alt to skip. Items that are dragged are never snap targets.
- Layer rows: Solo button and Move up / Move down buttons (each one undo step through the existing edits).
- Click a property label to select all its keys, then the existing copy/paste applies.
- Keyboard on the focused timeline: Left/Right step a frame (Shift 10), Home/End jump to the ends.
- Commands `animation.timeline.zoom` and `animation.timeline.snap`.
- Not built: "shadow" layers (unclear request, no such concept in the model; "shy" layers would need a new layer field), drag-to-reorder by pointer (buttons only), per-layer track height. Layer names are shorter in the row because of the new buttons.

## P40 - Layer reorder, shy layers, text presets

- Drag the handle on a layer row; a line shows the drop position (above or below the row under the pointer). Release dispatches one `layer.reorder`, so one undo step. Escape cancels. Up/down buttons stay.
- Shy: optional `Layer.shy` (absent means false, legacy files and output unchanged). Toggle per row or in the inspector (`animation.layer.update shy`). `animation.timeline.shy` / "Hide shy" hides shy layers from the timeline list only; the selected layer stays visible. Viewer and exports ignore the flag. The toggle is view state, not saved in the document.
- Text presets: `animation.text.animator {op:'preset',preset:'rise'|'pop'|'spin'|'fade'|'typewriter',seconds}` adds one per-character animator with a reveal sweep from the playhead. Counts toward the animator limit. Existing animator controls edit it afterwards.
- Not built: autoscroll while dragging, user-saved text presets.

## P41 - Edge autoscroll, track heights, saved text presets

- Autoscroll: while a scrub, key drag, layer drag or marquee is held with the pointer near the left/right edge of a zoomed track (or the top/bottom of the lane list), the view keeps scrolling each frame and the drag is re-evaluated. Earlier it only scrolled on pointer moves, and key positions used the window from the start of the drag; both fixed.
- Track heights: a chevron per layer cycles normal, tall, compact. Compact hides the selected layer's property lanes. `animation.timeline.tracks {mode:'collapse'|'expand'|'cycle'|'compact'|'normal'|'tall', layer?}`. View state, not saved, no undo.
- Saved text presets: `Document.textPresets {version:1, items}` (max 50, validated, saved with the document). Save an animator's look and keyed sweep under a name (`animation.text.preset.save`), apply it as a new animator at the playhead (`...apply`, one undo step, hover previews), delete (`...delete`). Names cannot repeat or reuse the built-in ones.
- Not built: file export/import of text presets.

## P42 - Beat markers from audio

- `animation.audio.beats {layer?, sensitivity?:1-10, clear?}`: reads the clip's stored peak envelope (no decoding), finds rises above the recent level that stand out from the clip's variation (threshold from mean and spread, local maxima, min 0.2 s apart, at most 200), maps them through trim and offset to composition ticks on whole frames and adds markers "Beat n" in one `markers.set`. Existing marker ticks are skipped; the composition's 200-marker limit holds. `clear:true` removes only markers matching `Beat n`.
- Limits: time resolution is clip length / 1024 bins. Coarse for long clips; the envelope is peak amplitude, not frequency bands, so dense mixes give fewer clean beats.

## P43 - Beat grid and key quantize

- `estimateBpm(beats)`: votes with each gap between detected beats plus its double and half inside 60-180 BPM; null with fewer than 3 beats or no clear winner.
- `animation.audio.grid {layer?, bpm?, sensitivity?}`: anchors a steady grid on the first detected beat in the clip (tempo from the estimate or `bpm`, 30-300), maps through trim and offset, snaps to frames, replaces the "Beat n" markers in one `markers.set`. Other markers stay.
- `animation.keys.quantize {maxSeconds?}`: each selected transform key moves to the nearest marker. The new `keys.retime` edit gives each key its own target in one step; two keys landing on one tick, or on a key that is not moving, are skipped (counted, nothing half-applied). Keys already on a marker stay. Selection follows the keys.
- Limits: markers are the only targets; one tempo per clip.

## P44 - Precomps

- Layer kind `comp` with `source.compId`. `precomp.add {comp}` creates it, named after the child, out point = the shorter duration. Undo is one step.
- `validatePrecomps`: missing target, cycles, depth over `MAX_PRECOMP_DEPTH` (3), expanded layers over `MAX_PRECOMP_LAYERS` (600). Removing a used composition is rejected.
- Render: the child frame is built as SVG and embedded as a data-URI image; child time = child.start + (tick - in point - offset). No child audio, no child background, no time remap.
- Older app versions reject documents with comp layers.

## P45 - Precompose and time remap

- `precomp.make {layers, name?, id?, compId?}`: layers move, in order, into a new composition with the parent's size, rate, duration, start, background and work area. One comp layer (in = comp start, out = comp end) takes the top-most selected slot. Refused: no layers, more than 200, audio layers, parent or matte links crossing the selection, depth and size limits.
- Comp layer source fields: `speed` 10-1000 (percent), `timeOffset` ticks 0..86400000, `loop`. Child time = child.start + round((tick - in - offset) * speed / 100) + timeOffset; with `loop` it wraps inside the child duration, without it runs on (nothing is drawn past the child's layers). Without these fields the P44 mapping is unchanged.
- `precomp.add` now centers the child on the parent (anchor at the child's center). P44 layers that were added earlier keep their stored transform.

## P46 - Motion blur

- `Composition.shutter {angle, samples}` (absent = off) and `Layer.motionBlur` (absent = off). Both must be set for a layer to blur.
- Samples: `round(t - w/2 + w*(j+0.5)/n)` with `w = frame * angle/360`; only samples inside the layer's time count and fewer than two means no blur. Each sample draws the same layer content with its own matrix; sample j has opacity 1/(j+1), which gives an exact average. The layer's opacity applies to the whole group at the frame time.
- Edits `layer.motionBlur {layers, enabled}` and `comp.shutter {comp?, shutter|null}` are single undo steps. Audio layers cannot be blurred.

## P47 - Layer styles

- `LayerEffect.kind` adds `shadow` and `glow`. Shared fields: `amount` (strength 0..1, animatable), `color` (colour keys allowed). Optional `blur` 0..64 (default 8, glow 12), shadow only `distance` 0..500 (default 12) and `angle` -360..360 (0 = right, 90 = down; default 45).
- Render: shadow is one `feDropShadow` with dx/dy from angle and distance; glow is the same primitive twice with dx = dy = 0. Filter region adds 3 sigma + distance per shadow and 6 sigma per glow.
- `effect.style {layer, effect, blur?, distance?, angle?}` is one undo step; distance and angle are refused on glow.

## P48 - Audio from precomps

- `withPrecompAudio(comp, comps)` (audioTiming.ts) returns the comp with extra audio layers `<compLayer>:<pass>:<layer>` for the audio of nested comps, in parent ticks: shift d = compLayerStart - child.start - timeOffset (+ pass * child.duration while looping); each clip is cut to [compLayerStart, compLayerEnd) and the child length; trimIn grows by what was cut at the front. Speed other than 100 % is skipped. Depth up to MAX_PRECOMP_DEPTH, at most 200 clips.
- Used by the timeline preview, `audioSignature` and `recordWebm`. Layers shown in the timeline are the real ones only.

## P49 - Silent comp layer note

- `silentPrecompLayers(comp, comps)` lists visible comp layers with `speed` other than 100 % whose child (or a deeper nested child) has audio layers. The timeline note and the WebM export note use it. The audio import hint says audio is mixed into WebM only.

## P50 - Inner shadow and inner glow

- `LayerEffect.kind` adds `innerShadow` and `innerGlow` with the P47 fields (`amount`, `color`, `blur`; `distance` and `angle` for innerShadow only). Defaults: inner shadow 8 px radius, 8 px distance, 45 degrees, 0.6 black; inner glow radius 10.
- Filter chain per effect (unique result names `is<stack position>`): copy the input, invert its alpha, blur, offset, flood, keep the flood where the inverted blur is, clip to the input alpha, merge over the input. No growth of the filter bounds.

## P51 - Speed for nested audio

- `withPrecompAudio` maps child tick x in pass k to `plStart + round((x - child.start - timeOffset + k*child.duration) / speed)`. Mapped copies carry `audio.rate = clipRate * speed` (internal field, never stored on real layers); `segmentsBetween` returns `rate` and `fileDuration` (timeline duration times rate), the preview sets `playbackRate` and passes the file duration to `start`. Volume keys move with the same mapping.
- Removes `silentPrecompLayers` and the `animation.audio.speedSilent` string added in P49.

## P52 - Comp layer volume

- `source.volume` (percent 0..200, absent = 100) on comp layers. `withPrecompAudio` multiplies the value and every key of the nested clip volume by it, so the signature, preview and export follow. The product is only clamped to 200 at playback (`gainCurve`), so a nested 50 % over a clip at 300 % intermediate still comes out right.

## P53 - Stroke opacity and dash pattern

- `stroke.opacity` (0..100, absent = 100) becomes `stroke-opacity` only below 100. `stroke.dashLen` and `stroke.dashGap` (1..100, in percent of the path length because paths use `pathLength=100`) give `stroke-dasharray="len gap"`; an animated `dash` offset alone keeps the old 8/4. A trim below 100 still wins over dashes.

## P54 - Text animators in motion blur

- `motionBlurTicks` returns `{tick,matrix}` per shutter sample (`motionBlurSamples` maps it). `contentSampled(layer)` is true for text with an enabled animator or a keyed `textReveal`; only then the viewer and `frameSvgBody` build the layer body once per sample at that sample's tick. All other layers reuse the body built at the frame tick.
