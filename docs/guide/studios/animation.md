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
