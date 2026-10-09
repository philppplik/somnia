# Vector Studio (core)

Vector Studio edits paths and shapes on the existing `src/lib/vectorio` document model (`VectorDocument` with absolute Bezier handles, optional `style`, `layer`, `compound`, `name`, `hidden`). Nothing is parametric: every shape becomes an ordinary editable path. The sibling package `src/components/vectorstudio/tools/` (see `vector-tools.md`) provides the select/node/transform/SVG-IO panels; this package owns the canvas, pointer gestures, session, history and registry integration.

## Files

| Path | Purpose |
| --- | --- |
| `src/lib/studios/vector.ts` | Studio manifest (id `vector`, order 70, shortcut `Mod+8`, claims `.svg` at priority 5, Files-only left rail) and the blank-project factory registration. |
| `src/lib/vectorstudio/session.ts` | Store plus `useVectorSession`. One open document, selection, tool, zoom/pan, undo/redo (document snapshots, 200 steps), diagnostics and error. All edits go through `commit`, one call is one undo step. |
| `src/lib/vectorstudio/shapes.ts` | `rectPath` (optional corner radius), `ellipsePath`, `linePath`, `polygonPath`, `starPath`, `buildShape(kind, a, b, opts)`. |
| `src/lib/vectorstudio/geometry.ts` | Flattening, boxes, paint-order hit testing, translate/scale, nearest point on outline and exact node insertion (de Casteljau). Pure, no DOM. |
| `src/lib/vectorstudio/exportFiles.ts` | SVG download and PNG rasterisation (`renderPng`, scale 1 to 8, max 8192 px per side). |
| `src/lib/vectorstudio/open.ts` | SVG file dialog and "open the active project SVG". |
| `src/lib/vectorstudio/i18n.ts`, `src/locales/vector/*.json` | Strings in en, de, es, fr, pt-BR. |
| `src/components/vectorstudio/VectorCanvas.tsx` | Start screen (shared `StudioEmptyState`) and the drawing surface. |
| `src/components/vectorstudio/VectorToolbar.tsx`, `VectorInspector.tsx`, `render.tsx`, `icons.tsx` | Tool strip, right panel, SVG path rendering, local tool glyphs. |

## Public API (`src/lib/vectorstudio/session.ts`)

- Start: `createBlankVector(width, height, name)` (no file needed, size clamped 1 to 16384), `openSvgSource(source, name, {strict})`, `importSvgInto(source)` (appends, one undo step), `resetVectorSession()`.
- Edit: `commit(doc)`, `addPath`, `deleteSelection`, `duplicateSelection`, `moveSelection`, `setStyle`, `setSelectionBounds`, `reorder('front'|'back'|'forward'|'backward')`, `toggleHidden`, `renamePath`, `resizePage`.
- Nodes: `moveNode(pathId, nodeId, point, 'anchor'|'in'|'out')` (smooth and symmetric nodes mirror the opposite handle), `addNodeNear`, `deleteNode`, `setNodeKind`, `toggleClosed`.
- Output: `toSvg()` returns the clean, normalised export (`exportSvg(normalizeDoc(doc))`).
- State: `getVectorSession()`, `subscribeVector`, `useVectorSession`. Fields: `name, doc, selection, tool, zoom, pan, dirty, canUndo, canRedo, diagnostics, error, open, nodePath, selectedNode`.

## Behaviour

- **Blank start.** The empty screen offers Open SVG and Create blank project plus a page size preset (Icon 512, Square 1080, A4, HD, Logo 1024). The same blank project is registered as the app-wide factory for `createBlankProject('vector')` (1024 x 1024).
- **Tools.** Select (V), Node edit (A), Pen (P), Rectangle (R), Ellipse (E), Line (L), Polygon (G), Star (S). A click without a drag places a default-size shape. Drawing a shape returns to Select.
- **Pen.** Click adds a corner node, click and drag adds a smooth node with mirrored handles, a click on the first node closes the path, Enter or double-click finishes an open path, Esc cancels.
- **Compound identity.** All visible contours of a compound are selected, moved, styled, scaled and deleted together. Hidden paths and unknown IDs are excluded from selection, including after commits and history changes. Shift-click toggles the whole object. Appending SVG and duplicating artwork allocate fresh path, node and compound IDs while retaining contour membership, so independent objects never merge during export.
- **Input validation.** `commit` rejects nonfinite page sizes, anchors, handles and numeric style values before changing the document or undo/redo history. Node moves, transforms and view changes also validate their numeric inputs. Invalid coordinates throw `RangeError`; strict import continues to return `false` with diagnostics. Blank creation retains its documented size fallback.
- **Select.** Click, Shift-click toggle, marquee (full containment), drag to move (Shift locks the axis), corner handles scale (Shift keeps the aspect ratio), arrow keys nudge 1 (Shift: 10), Delete, Ctrl/Cmd+D duplicate, Ctrl/Cmd+A select all, Ctrl/Cmd+Z and Y undo and redo. Double-click a path to edit its nodes.
- **Node tool.** Drag anchors and handles, double-click the outline to insert a node without changing the shape, Delete removes the selected node (a path with two nodes is removed as a whole).
- **View.** Ctrl/Cmd+wheel zooms at the cursor, plain wheel and middle or right drag pan, Fit page button.
- **Drag is one undo step.** Gestures preview from a snapshot and commit once on pointer up. Esc or pointer cancel leaves the document untouched.
- **Dirty work.** Opening or creating a replacement asks for confirmation when the browser session has edits. Cancellation preserves the full session and history; invalid SVG is diagnosed before prompting. Leaving the page invokes the browser unsaved-changes guard. SVG/PNG downloads do not claim that a working file was saved. The global status shows the active Vector name, in-memory state and dirty flag without changing Code project state.
- **SVG.** Opening is strict: unsupported features (text, gradients, images, CSS, clipping, masks, scripts) produce an error plus visible diagnostics and the open document stays unchanged. Export is the shared clean serializer; export then import then export is byte-identical (tested).

## Honest limits

- No text, gradients, boolean operations or groups yet. Layers are a flat list of paths (`layer` from imported groups is preserved on export).
- Document hit testing shares the tools paint contract, including evenodd/nonzero winding across compound contours, invisible paint and implicit fill closure of open contours. Hit testing flattens curves into polylines; node picking uses screen-constant radii.
- Undo stores document snapshots (200 steps), which is fine for the 10,000 node import limit but not meant for huge artwork.
- PNG export rasterises through an `<img>`; the result is as good as the WebView's SVG renderer.
- `.svg` files still open as text tabs in Code Studio. Vector Studio opens them through Open SVG or the "Edit project SVG" button when an SVG tab is active. Auto-routing `.svg` to this studio is a one-line product decision in `acceptsFormat` usage and was not changed here.

## Test IDs

Start: `vector-start`, `vector-open`, `vector-create-blank`, `vector-start-preset`. Canvas: `vector-canvas` (attribute `data-tool`), `vector-artboard`, `vector-selection`, `vector-handle-0..3`, `vector-node-overlay`. Toolbar: `vector-toolbar-{select,node,pen,rect,ellipse,line,polygon,star}`, `vector-undo`, `vector-redo`, `vector-zoom`, `vector-zoom-fit`. Inspector: `vector-inspector`, `vector-style-panel`, `vector-fill`, `vector-fill-none`, `vector-stroke`, `vector-stroke-none`, `vector-stroke-width`, `vector-opacity`, `vector-arrange-panel`, `vector-to-front`, `vector-forward`, `vector-backward`, `vector-duplicate`, `vector-layers`, `vector-layer` (one per path), `vector-page-panel`, `vector-page-w`, `vector-page-h`, `vector-export-png`, `vector-append-svg`, `vector-open-project-svg`, `vector-error`, `vector-diagnostics`. From the tools package: `vector-tools-panel`, `vector-tool-select`, `vector-tool-node`, `vector-transform-*`, `vector-import-svg`, `vector-export-svg`, `vector-node-*`.

## Validation

```sh
cd phase1
npx tsx --test src/lib/vectorstudio/*.test.ts src/components/vectorstudio/tools/*.test.*
npx playwright test -c pw.local.config.ts tests/vector-studio.spec.ts
```
