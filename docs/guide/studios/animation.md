# Animation Studio

Status: **In development.** Built on the `int/beta5` integration branch, not in a published release (latest pre-release is v12.2.0-beta.4). This page lists what is merged on `int/beta5` as of 2026-10-14.

Animation is a motion-graphics studio: compositions with layers and keyframes, a timeline and a graph editor, and export to frames, GIF, APNG and WebM. It does not replace Video (sequence editing) or Design (page layout).

## Start

Choose Animation in the studio pill. The Project menu has a command to start a blank animation project (`animation.project.new`). The header action is **Render...**; it opens output setup and never exports by itself.

## Composition and layers

- Compositions hold layers on a timeline measured in integer ticks, so edits are exact.
- Layers: shapes (rectangle, rounded rectangle, ellipse, star, polygon, path shapes), text, Null objects, audio. Fills can be solid or a two-stop gradient. Strokes have joins and caps.
- Parenting with a cycle-safe picker, and optional keep-world-transform on reparent, including animated hierarchies.
- Markers, a work area with looped playback, and text with a bounded list of safe system fonts.

## Keyframes and easing

- Keys on transform, opacity, effect strength and colour. Click, Shift/Ctrl-click and box selection. Copy, cut, paste and delete, also across transform and mask keys in one mixed graph.
- Graph editor with value and speed views, independent X/Y easing, cubic handles, named easings saved in the document, and spring and bounce presets.
- Spatial paths with tangents for position keys. Stagger layers and an "ease all" command.
- Modifiers: deterministic `wiggle` and `loop`. They are expression-free; there is no scripting.

## Text, masks and paths

- Per-character text animators: range selectors with softness, offset, shift, scale, opacity, rotation and colour, with character and word units.
- Layer masks (up to 4 per layer, add or subtract, feather, invert) and alpha or luma track mattes. Masks can be keyed and edited on the canvas.
- Bezier path layers: pen tool, handle dragging, point insert and delete, smooth and corner points, compound paths, path booleans (unite, subtract, intersect, exclude), expand stroke to an outline layer, and path morph between masks with matching point counts.

## Effects and presets

- Blur and tint effects with keyed strength, bypass and reorder.
- Motion presets: fade, slide, bounce and typewriter entrances, plus a library of built-in presets that you can store in the document and export or import as JSON.
- Pose library: save the position, scale, rotation and opacity of several layers at the playhead under a name (stored in the document) and apply it back in one undo step, optionally as keys and blended by a percentage, for pose-to-pose animation.

## Audio

Import WAV or MP3 as an audio layer. Limits: 2 MB per file, 10 minutes, 8 files and 4 MB in total. The studio shows a waveform and supports trim, offset and keyed volume (0 to 200 percent). Audio is for preview and for the WebM export only.

## Save and export

| Output | Notes |
| --- | --- |
| Local `.somnia` snapshot | Experimental explicit save and open. Assets are embedded. Recovery after a crash uses a browser journal. |
| PNG frame | Current frame. |
| PNG sequence | ZIP of the work area with a `manifest.json`. At most 1800 frames and 64 MB. |
| GIF | At most 300 frames and 256 colours per frame. No dithering, so gradients can band. Silent. |
| APNG | Silent. |
| WebM | Recorded in real time (a 5 s area takes 5 s, capped at 60 s). Audio is the preview mix. Needs browser WebM support. |

Every output file over 64 MB is refused.

## Limits

- No footage, raster layers, precompositions, effects beyond blur and tint, expressions or motion tracking.
- Text is drawn with a system font from the allowlist, not an embedded font.
- Local AI can suggest one name for the selected layer. You review before after, then accept. See [Local AI](../local-ai.md).

## Technical docs

[Concept](../../concepts/animation-studio.md), [P0](../../studios/animation-p0.md), [P1](../../studios/animation-p1.md), [P7 export](../../animation-p7.md), [P10 masks and mattes](../../animation-p10.md).

Back to [Studios](../studios.md).
- Export (Render panel > More): Crop to area exports only a pixel rectangle of the composition for every format; it scales with the size setting.
- Rig > Appearance > Orient to path: rotation keys that make selected layers with a moving position face along it (pick which way the artwork points).
- Rig > Layers > Bake modifiers to keys: wiggle, loop and link modifiers become plain keys over the work area (every frame), then the modifiers are removed.
- Export crop: "Fit to selected layers" sets the crop to the box that holds the selected layers over the whole work area (plus 8 px).
- Poses can be applied or keyed mirrored (Mirror: around the canvas centre or around the pose); Pose to pose with Mirror on can go from a pose to its own mirror image, for walk cycles.
- Rig > Arrange > Array of copies: grid, row, column or circle of the selected layer (keyed positions move with each copy; circles rotate the copies outward). The command takes count, columns, spacing, radius.
- Render panel export check: under the format readouts it lists layers that would surprise you in the file (missing image, outside the crop or frame, not in the exported range, hidden, audio not included in frame exports).
- Rig > Layers > Close loop: every animated property of the selected layers gets a key on the last work-area frame with its value at the work-area start, so GIF, APNG and video loops have no jump.
- Colours (left panel): the solid colours the composition uses, with how many layers use each. Pick a new colour in a swatch to replace it in every layer's fill and stroke (one undo step, locked layers keep theirs).
- Rig > Appearance > Squash and stretch (light, medium, strong): scale keys that stretch a layer along its fastest axis and squash the other, from the speed of its position; a bouncing ball gets cartoon timing in one click.
- Composition settings: pick a size preset (1920x1080, 1080x1080, 1080x1920 and more) and choose what happens to the layers: keep, fit (scale to stay visible), fill (scale to cover) or centre (keep size). The top-level layers move and scale in one undo step; children follow their parents.
- Add layer > More shapes: regular polygons (3, 5, 6, 8 sides) and stars (5, 6, 8 points) as editable path layers, centred in the composition. The command takes sides, star, inner radius, radius and colour.
- Key tools > Time > Snap to markers: moves the selected keys to the nearest composition marker (beat sync); the (6) variant only moves keys within 6 frames.
- Rig > Layers > Work area to marker section: sets the work area to the stretch between the markers around the playhead (or the comp start/end), so preview loops and exports cover one section.
- Rig > Arrange > Stretch time: slows down or speeds up whole layers (50%, 75%, 125%, 200% length). Every key, colour key, effect and animator key and the out point scale about the layer's in point, snapped to frames. Layers that would leave the composition or whose keys would meet are skipped.
- Render panel > Lottie (JSON): the whole composition as a Lottie file for the web and apps (solid, null and shape layers with keys, easing, spatial tangents and parenting; flat fill and stroke). Text, images, nested compositions, audio, mattes, effects, masks, repeaters, gradients and modifiers are left out, and the panel lists what was left out.
- Timeline > Auto-key: while on, moving, scaling or rotating a layer on the canvas, or typing a value in the inspector, at the playhead turns a property without keys into an animated one (one key at the playhead) instead of changing the whole animation. Properties that already have keys add or update a key at the playhead as before. The mode is off by default and not saved.
- Rig > Arrange > Send to composition: copy or move the ticked layers into another composition of the project (listed by name). Parents and mattes between the sent layers follow; links to layers that stay behind are dropped. Layers that do not fit the other composition's length are skipped.
- Add layer > Camera...: adds a Camera null at the composition centre that all unlocked top level layers hang from, and ready-made moves (push in, pull out, pan, roll) keyed over the work area. Animate the Camera layer's position, scale or rotation for your own moves.
- Add layer > Camera... > Follow selected layer: keys the Camera position over the work area so the selected layer stays where it is in frame while everything else moves past (at most 120 linear keys; replaces the camera's position keys).
