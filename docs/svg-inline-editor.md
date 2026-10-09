# Inline SVG / vector editor

Opening a `.svg` file in Design or Split view shows the vector editor in the main container. Tools and layers sit in the
left sidebar (Layers tab), properties in the right inspector (Design / Colour / Code). Code view is unchanged.

## Model: the source text is the document

`lib/svgedit/source.ts` scans the SVG text with source offsets. Every edit is a small text splice on one element, so
`defs`, `style`, filters, comments and formatting survive and a moved rectangle changes only its own tag. Edits are
committed as `replaceSource` through the editor core, so undo/redo, dirty state and the code pane work as before.
A broken edit is rejected before it is committed.

The canvas is a sanitised live DOM (scripts, event handlers, foreignObject and external hrefs removed) used for pixels,
hit testing and bounding boxes. Selection is a child-index path that is identical in both trees.

## Engine decision (honest status)

The designcraft WASM bridge is **not used** in this version. The spike (`somnia-craft-t1`) proved that selected
PhotoCraft crates build to wasm32 and run a blur in a worker. It did not render a layout or edit SVG in a worker, and
that next measurement was not done here (no Rust 1.95 toolchain in this environment, 2 CPU / 1 GB RAM).
B1 (select, move, resize, rotate, shapes, pen, node edit, layers, fill/stroke, text, align, order, group, convert to path)
needs no engine: it is DOM and text work and is fast. The engine is only needed for B2 items: path booleans
(`kurbo`/`flo_curves`), pixel-exact `resvg` preview/PNG export, trace. Decide that with a worker measurement first.

## Not in this version (B2/B3)

Booleans, gradient editor, masks/clips UI, snapping and guides, text on path, bitmap trace, artboards, symbols, PNG/PDF export.
`lib/vectorcore`, `lib/vectorio` and `components/vectoredit` are untouched; only `vectorio` matrix, path parser and
contour serializer are reused.

## Known limits

- Paths are rewritten in canonical absolute form when nodes are edited (arcs become cubics).
- Groups carrying a class or paint attributes cannot be ungrouped (the look would change); the editor says so.
- Lock state is per session and is not stored in the file.
- Other locales (de, es, fr, pt-BR) use machine translations, like the rest of the app.

## B2 (booleans, gradients, trace)

All three are TypeScript, no WASM engine. Decision: paper.js (MIT, lazy chunk) does curve-preserving booleans,
imagetracerjs (Unlicense, lazy chunk) traces bitmaps. The designcraft engine stays unused; reconsider only if
resvg-exact export becomes a requirement.

- Booleans: select 2+ paths or basic shapes, Unite / Subtract (front shapes cut from the back one) / Intersect / Exclude.
  Result is one `<path>` that keeps the back shape's paint and id; one undo step. Text is rejected with a message.
- Gradients: Inspector > Design > Fill. Solid / Linear / Radial, angle, stops (colour, %, alpha), add/remove stop.
  Written as normal `<linearGradient>`/`<radialGradient>` in `<defs>` (objectBoundingBox units), edited in place.
  Gradients that use userSpaceOnUse, gradientTransform or href chains are read when they have stops; geometry of such
  gradients is rewritten to the editor's bounding-box form on the next edit.
- Trace: Place image (embeds PNG/JPEG/WebP/GIF as data URI, max 3 MB), select the `<image>`, pick colours, Trace to vector.
  The result is a `<g id="trace">` of filled paths next to the image (downscaled to 512 px for tracing). The image stays.

## B3 (snapping, guides, clip and mask)

- Snapping: while moving or resizing, edges and centres snap to other objects, the document box (edges and centre),
  guides and an optional grid. Threshold is 6 screen pixels. Pink lines show what matched. Hold Ctrl/Cmd to skip it,
  or switch it off with the magnet button. Targets are visible leaf elements, capped at 400 per drag.
  Rotation and node editing do not snap. Snapping uses the rendered bounding box (strokes and filters included as the
  browser reports them).
- Guides: Inspector > Design > Snapping. Add a vertical or horizontal guide by position (empty = centre), drag it on
  the canvas, double-click or use the x to remove. Guides live in the editor session only, they are not written to the SVG.
  There are no rulers to drag them from.
- Clip and mask: select 2+ siblings, the topmost selected shape (rect, circle, ellipse, path, polygon, polyline, line)
  becomes the `<clipPath>` or `<mask>` in `<defs>`, the rest is wrapped in `<g clip-path|mask="url(#id)">`.
  One commit, one undo. A mask uses the shape's own paint as luminance (white shows, black hides; a gradient fill gives a fade).
  Release (button or Inspector) puts the shapes back as visible siblings, removes the reference and the unused def.
  Editing a clip shape in place is not supported, release and redo. Clips with objectBoundingBox units are refused on release.
