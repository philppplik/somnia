# Vector shapes and layer model (wave 4)

Status: library + panel component only. No canvas editor UI, no wiring into the Edit-image dialog.

## Where things live

| Path | Purpose |
| --- | --- |
| `phase1/src/lib/vectoredit/types.ts` | Shape, style, layer, operation and document types |
| `phase1/src/lib/vectoredit/shapes.ts` | Validation, defaults, shape-to-path conversion, SVG output |
| `phase1/src/lib/vectoredit/ops.ts` | `VectorOpRegistry`, built-in handlers, op constructors |
| `phase1/src/lib/vectoredit/document.ts` | Immutable document, replay, JSON round trip, SVG export, `VectorHistory` |
| `phase1/src/components/vectoredit/LayersPanel.tsx` | Layer list component (controlled, callbacks only) |
| `phase1/src/locales/*.json` | 15 `vectoredit.*` keys in en, de, es, fr, pt-BR |

## Model

- **Shapes** (parametric): `rect` (x, y, width, height, rx), `ellipse` (cx, cy, rx, ry), `polygon` (regular: cx, cy, radius, sides 3..128, rotation in degrees, first vertex points up), `line` (x1, y1, x2, y2), `path` (absolute `M`, `L`, `C`, `Z`).
- **Conversion to path**: `shapeToPath` / op `shape.toPath`. Rect (with rounded corners) and ellipse use the 4-segment cubic approximation (kappa 0.5523), so the result is close but not exact for circles. Polygon and line convert exactly.
- **Style**: fill color (`#hex` or `null`), stroke color, width, cap (`butt|round|square`), join (`miter|round|bevel`), dash array, opacity 0..1.
- **Layer**: id, name, visible, locked, shape, style. Z-order: index 0 is the bottom (SVG paint order). The panel lists the top layer first.
- **Document**: `{schemaVersion: 1, size, operations, revision}`. Layers are not stored; they are derived by replaying enabled operations over an empty list (`resolveLayers`). Operations use the same envelope as the image editor (`id, type, version, enabled, params`), params are frozen JSON.

## Operations (version 1)

`layer.add`, `layer.update` (shape and/or style patch, kind cannot change), `layer.remove`, `layer.reorder` (target index), `layer.rename`, `layer.setVisible`, `layer.setLocked`, `shape.toPath`.

Locked layers reject `update`, `remove` and `toPath`. Visibility, rename, reorder and lock toggling still work. Each op is atomic: it validates fully or throws, and handlers never mutate their input.

`VectorHistory.push` replays the new document before accepting it, so an invalid op leaves history untouched. Undo/redo keep immutable snapshots.

## Panel

`LayersPanel` is controlled. Props: `layers`, `selectedId`, `onSelect`, `onRename`, `onToggleVisible`, `onToggleLocked`, `onReorder(id, toIndex)`, `disabled`. The caller turns callbacks into ops. Rename: double-click or F2/Enter, Enter saves, Escape cancels. Every button has an aria-label with the layer name.

## Tests

`npm run test:core` includes `src/lib/vectoredit/*.test.ts` and `src/components/vectoredit/*.test.tsx` (16 tests: validation, conversion, ops, locking, serialization, history, SVG, panel markup, locale parity). Baseline run: 1209 pass, 0 fail, `tsc --noEmit` clean.

## Differences from the wave-4 vector editing ADR

The ADR (`vector-editing-0260cb29.md`, status Proposed) was received after this module was written. This module keeps the flat layer model the task asked for and does not follow the ADR. Conflicts:

1. **Scene**: flat layer list derived from ops over an empty list; ADR wants a node tree (groups, roots, parent index) with a validated `base` scene plus ops.
2. **Op names/granularity**: `layer.*` / `shape.toPath`; ADR wants `vector.insert|delete|transform|style|geometry|reparent|properties|viewport|batch`, and `validate()` on each handler. No `vector.batch` here.
3. **Envelope**: this module has its own `VectorOperation` type structurally equal to `ImageOperation`; the ADR aliases `ImageOperation`. Registry is separate, as the ADR wants.
4. **Geometry**: no node transform matrices, no `Q`/`A` path segments, no fill rule, miter limit, dash offset, or RGBA paints (colors are `#hex`). Polygon and line are first-class here; the ADR has only group, rect, ellipse, path.
5. **Document wrapper**: no `kind: 'vector'`, no `source`, no `base`, no `viewBox`/`outputSize` split.
6. **No SVG import** (only export), and no abort/RenderContext support.
7. **Replay** skips disabled ops without validating their schema (ADR validates all ops).

## Open

- Port to the ADR scene model if the central builder wants it. The shape math (`shapeToPath`, polygon points, style validation, SVG output) and the panel carry over; the op layer would be rewritten.
- No canvas editor, hit testing, selection state, path-point editing or boolean ops.
- No wiring into the Edit-image dialog or a format-driven mode switch.
- No SVG import and no raster export.
- Layer names default to `Layer N` by count at add time, so names can repeat after removals.
- Panel is unstyled beyond inline layout (no shadcn polish, plain unicode icons instead of Vadivam); visual check in the real UI was not done.
- Translations are machine-written.
- Playwright e2e not run.
