# Pen tool UI boundary

Wave 4 adds a standalone `PenToolEditor` under `phase1/src/components/vectoredit`.
It does not import the parallel vectorcore implementation and is not mounted in the raster image dialog.
The host owns the document, persistence, ID policy, undo/redo, viewport and integration.

## Model and adapter

The exported `VectorDocument` has `width`, `height` and `paths`. A path has a stable `id`, `closed`, and ordered `nodes`.
A node has `id`, `x`, `y`, `kind: 'corner' | 'smooth' | 'symmetric'`, optional `in` and `out` control points.
All coordinates, including handles, are **absolute document coordinates**, not offsets.
The UI contains no fill/stroke/style data: preserve those fields separately in the adapter when mapping back to vectorcore.
Documents must have positive finite dimensions and unique stable path and node identities. The adapter validates imported data.

```tsx
<PenToolEditor
  value={toPenDocument(vectorDocument)}
  onChange={next => setPreview(fromPenDocument(next, vectorDocument))}
  onCommit={({ before, after, reason }) => history.commit(before, after, reason)}
  onUndo={() => history.undo()}
  onRedo={() => history.redo()}
  createId={() => vectorcore.createId()}
/>
```

`onChange` is a preview callback, **not** a history entry. Feed its value back synchronously.
`onCommit` reports immutable before/after snapshots once at pointer release or once per keyboard/button edit, only when content changed.
Pointer cancel/lost capture/Escape during drag restores the pre-gesture document and selection, with no commit.
No mutation of the supplied document occurs. Callbacks are synchronous; the UI does not perform asynchronous storage.
External document replacement/undo should happen between gestures. To switch documents during a gesture, remount with a new React `key`.
`onSelectionChange` exposes path/node IDs; selection is local editor state. `onFinish` signals completion of the open path and does not create a second history item.

## Interaction contract

- P: pen. Click places a corner. Drag creates a smooth anchor with mirrored handles after a 3-pixel threshold.
- Click the first anchor after at least three points to close the active path. Enter or idle Escape finishes it open and switches to Nodes.
- V: node editing. Drag anchors (all selected anchors move together). Drag handles; smooth handles keep opposite length while matching angle; symmetric handles mirror angle and length. Alt-drag changes to corner and breaks symmetry.
- Shift-click adds/removes anchors. Drag empty space for a marquee; Shift-marquee adds to the original selection.
- Double-click a segment inserts a point at the nearest sampled parameter. The cubic is subdivided with de Casteljau, so the shape is preserved exactly at that parameter.
- Delete / Backspace removes selected points; empty paths are removed and closed paths with fewer than three points become open.
- C / S or the toolbar converts selected points to corner / smooth. Corner conversion keeps independent handles. Remove handles is separate. Smooth / Symmetric preserves an existing reference handle, or derives tangent handles from neighbours.
- Arrows move selected anchors by 1 document unit, Shift-arrows by 10. Ctrl/Cmd+A selects all. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y call host undo/redo.
- Keyboard shortcuts are scoped to the focused SVG, not global. Buttons have labels/tooltips and expose pressed/disabled state. Pointer capture supports drags outside the canvas.

The rendered preview uses cubic SVG paths and a transparent wide segment hit stroke. Screen coordinates are converted through the SVG's inverse screen matrix (including letterboxing). Dimensions determine the surface aspect ratio.

## Verification

`src/components/imageedit/VectorPen.test.tsx` uses node:test and is included by the existing `test:core` glob without a package.json edit. It covers immutable edits, handle symmetry/breaking, conversion, marquee, subdivision shape preservation, topology and static markup.
Browser gesture smoke checks and screenshot inspection are reported in the handover.

## Open integration work / limits

- Builder must adapt vectorcore, mount the component, and connect history/serialization/export. No raster/vector document type routing was changed here.
- English UI text only. The builder must add the five-language translation keys before production release.
- No zoom/pan, snapping, grid, pressure, multi-touch, boolean paths, stroke/fill inspector or path-level transforms.
- Marker radii are document units, so zoom/very large documents need a host scale policy. Hit strokes use screen units.
- Accessibility is labeled and keyboard operable at canvas level; individual anchors/handles are not separate tab stops and have no coordinate text fields. A screen-reader coordinate editor remains open.
- Node removal reconnects neighbours, rather than guaranteeing the previous curve's shape. Remove handles intentionally clears handles.
- No dependency on vectorcore means advanced core constraints, style preservation and collaboration are adapter responsibilities.

Research alignment: no Penpot source/code was copied. Object selection, endpoint continuation, draft-only single-node handling and a second Escape exit callback remain host integration work. One-node paths currently remain in the controlled model; the adapter must choose their export/persistence policy.
