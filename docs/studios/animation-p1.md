# Animation studio, phase P1

Builds on `animation-p0.md`. Implements the P1 items of `docs/concepts/animation-studio.md` section 5 and the PNG reference export of section 9. Nothing here claims a file format, an engine, or video output.

## What exists

- **Graph editor** (`components/animation/GraphEditor.tsx`, math in `lib/animation/graph.ts`). Alternate mode of the timeline area (Graph button, command `animation.graph.toggle`). Value curve of one animated property in its own units, X and Y tabs for vec2. Keys drag in time and value (value is clamped to the property range). Ease handles of selected keys drag with x limited to 0..1 and y to -2..3, flat segments keep their y. Handles are focusable sliders (arrow keys, Shift for 10x). No speed graph.
- **Key selection** (`lib/animation/selection.ts`). Click, Shift or Ctrl/Cmd click, marquee on empty lane space (hit test uses the rendered diamonds), select all. Dragging a selected key moves the whole selection as one undo step. Escape cancels a drag. Selection is cleared when the selected layer changes and pruned after undo.
- **Copy, cut, paste, delete** of keys (`keyclip.ts`, commands `animation.keys.*`). Paste lands at the playhead on the selected layer, keeps relative timing, ease and spatial tangents, replaces keys at the same time, and fails whole if any key would leave the composition. Copy needs keys from one layer. The clipboard is in-app only. Shortcuts apply while the timeline has focus: Ctrl/Cmd+C, X, V, A, Delete, Escape, B and N.
- **Work area and looped playback** (`playback.ts`). In and out handles on the ruler, buttons In, Out, Whole, keys B and N, `animation.workarea.*`. Playback stays inside the work area, jumps to its start when begun outside it, loops when Loop is on and otherwise stops on the last frame. The out point is exclusive. Frames outside are shaded.
- **Spatial path** (`interpolate.ts`, `PathOverlay.tsx`). Position keys carry optional `sIn` and `sOut` tangent offsets (additive, schema version unchanged, validated only on vec2 properties). The overlay draws the path in parent space, moves key values, and bends segments through tangent handles. Keys without tangents show a hint handle one third toward the neighbour, dragging stores a real tangent. Smooth path and Straighten path buttons set or clear tangents. The temporal progress maps straight onto the Bezier parameter, not arc length.
- **PNG export** (`exportFrames.ts`, `exportJob.ts`, Render setup panel). Current frame as PNG, and the work area as a ZIP of PNGs with `manifest.json` (rational frame rate, ticks, work area, alpha semantics). Optional transparent background omits the background rectangle. The ZIP is built from chunks into one Blob, capped at 3600 frames, 8192x8192 pixels and 768 MB. Cancel is supported. Failures show the reason and produce no file. The rasteriser draws the composition SVG into a canvas, so output matches the viewer.
- Behaviour fix: `prop.set` on an existing key used to reset its ease handles. It now keeps them, plus spatial tangents.

## Limits

- Value graph only, channels one at a time. A separate X/Y ease per channel is not modelled: both channels share the segment ease.
- Text is rasterised with the system UI font, so a font a user installs later is not embedded.
- The export runs in the page. A native streaming job to a chosen folder is a later step.

## Tests

`npm run test:core` includes `src/lib/animation/*.test.ts` (53 tests for P0 and P1). Pointer, canvas and download behaviour is covered by `phase1/tests/animation-p1.spec.ts`, which is CI-only.
