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
