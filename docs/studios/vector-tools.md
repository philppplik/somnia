# Vector Studio tools

## File ownership

This patch owns `phase1/src/components/vectorstudio/tools/` only. It does not edit the studio registry, root canvas, shared empty states, app menus or history store. The host integrates the components and owns pointer gestures, selection overlays, keyboard shortcuts, undo/redo and document saving.

## Contract

Use `VectorDocument` from `src/lib/vectorio`. Handles are absolute document coordinates. Optional `style`, `layer`, `compound`, `name` and `hidden` fields survive edits. A compound contour is part of one painted object: selecting, moving, scaling or deleting any contour selects the whole compound. Hidden paths are excluded from object selection.

```tsx
import { VectorToolsPanel, VectorNodePanel } from './tools';

<VectorToolsPanel
  value={document}
  selection={selectedPathIds}
  onSelectionChange={setSelectedPathIds}
  tool={tool}
  onToolChange={setTool}
  onCommit={({before, after, label}) => commitDocument(before, after, label)}
  onExport={saveSvgWithNativeDialog}
/>
<VectorNodePanel
  value={document}
  nodeSelection={selectedNodes}
  onNodeSelectionChange={setSelectedNodes}
  onCommit={({before, after, label}) => commitDocument(before, after, label)}
/>
```

`onCommit` is atomic. The host must update its controlled value and create exactly one history entry. The panels do not call a separate preview callback. During a canvas drag, snapshot the document at pointer-down, preview helper results from that snapshot, then create one commit at pointer-up. Escape/pointer-cancel must restore the snapshot without an undo entry. Set `disabled` while another gesture or operation owns the document.

The host maps V to `select`, A to `node`, arrow keys to `translateSelection` or `translateNodes`, Shift+arrow to a larger delta, and Delete/Backspace to the matching delete operation. Never intercept text-input keyboard events.

### Object operations

- `selectedPaths`, `togglePathSelection`: visible compound-aware selection; additive clicks toggle a painted object.
- `selectionBounds`: tight geometric bounds, including cubic extrema; no stroke padding.
- `selectPathsInRect`: bounding-box intersection by default, full containment with `contain=true`. This is box selection, not an exact intersection with the painted shape.
- `hitTestObject`: topmost-first fill/stroke hit testing, fill-rule-aware across compound contours. Tolerance is in document units; pass screen tolerance divided by zoom. Curve filling uses a polyline approximation.
- `translateSelection`, `scaleSelection`, `rotateSelection`, `resizeSelection`, `deleteSelection`: immutable changes. All anchors and handles transform together. Strokes stay unchanged when scaling. Resizing requires a nonzero width and height; flat lines can still move, rotate or scale with `scaleSelection`.

### Node operations

`NodeRef` is `{pathId, nodeId}`. `translateNodes` moves anchors and their handles; `setNodeHandle` supports smooth/symmetric coupling and Alt-style symmetry breaking. `setNodeKind` changes corner/smooth/symmetric behavior, `straightenNodes` removes handles, `deleteSelectedNodes` removes anchors and empty paths, and `splitPathSegment` uses exact de Casteljau subdivision. Split indices and identities are validated. The host owns the node/handle hit targets and calls these helpers.

## SVG IO

Open SVG replaces the current document as one undoable edit; it does not merge identity spaces. File input is restricted to SVG. Parsing uses the existing strict importer, rejects unsupported features and scripts, checks the 8 MiB file limit before reading, and shows diagnostics. Failed imports never emit a commit. A document changed during asynchronous reading is not overwritten.

Export uses the existing clean SVG serializer after validating dimensions and geometry. `onExport` lets the host use its native save dialog. Without it the panel starts a browser download and revokes the object URL. Exporting is not a promise of a completed disk save.

Supported SVG geometry is the existing importer subset: paths, basic shapes, groups flattened to layers, transforms baked into coordinates, arcs converted to cubics. Text, gradients, images, CSS classes, clipping and masks are rejected instead of silently dropped. Group opacity and nonuniform stroke transforms have existing importer warnings. These are format limitations, not missing tool buttons.

## QA selectors and labels

| Test ID | Label / meaning |
| --- | --- |
| `vector-tools-panel` | Vector tools |
| `vector-tool-select` | Select |
| `vector-tool-node` | Edit nodes |
| `vector-transform-panel` | Transform selection |
| `vector-transform-x`, `-y`, `-width`, `-height` | Selection x/y/width/height |
| `vector-transform-rotation` | Rotate selection by degrees (relative, reset after commit) |
| `vector-flip-horizontal`, `vector-flip-vertical` | Flip horizontal / Flip vertical |
| `vector-delete-selection` | Delete selection |
| `vector-import-svg` | Open SVG |
| `vector-svg-file` | Hidden SVG file input |
| `vector-export-svg` | Export SVG |
| `vector-io-status` | Import diagnostics / errors |
| `vector-node-panel` | Edit nodes |
| `vector-node-x`, `vector-node-y` | Node x/y |
| `vector-node-corner`, `-smooth`, `-symmetric` | Node kind buttons |
| `vector-node-straighten` | Remove handles |
| `vector-node-delete` | Delete nodes |

Dimension and node-position fields commit on blur or Enter. Rotation is relative to the selection center. With no selection transform fields are disabled. Without `onToolChange` the tool buttons are disabled rather than pretending to switch.

## Validation

Run from `phase1`:

```sh
npx tsx --test src/components/vectorstudio/tools/*.test.*
```

15 local tests cover bounds, transforms, metadata, compounds, marquee, paint hit-testing, node handles, exact splitting, invalid inputs, strict import, export stability and rendered panel labels/disabled states. The normal `test:core` script does not yet include this new directory; add this glob when integrating the studio rather than changing shared package configuration in this isolated patch.

The standalone panel was rendered and visually inspected at 280 px wide: all controls fit, labels wrap, no overlap or clipping. This is not a full-app or native WebView verification. A full checkout typecheck currently reports the pre-existing missing generated `slides-engine/pkg/somnia_slides.js`; no new tools errors are reported.

## Session integration

Vector Studio uses `selectedPaths` and `hitTestObject` for the same visible compound-selection and painted-fill contract as these panels. Canvas additive selection uses `togglePathSelection`, so deselecting one contour deselects the entire object. Session commits validate finite document numbers before changing history, and SVG append/duplicate allocate fresh path, node and compound identities.
