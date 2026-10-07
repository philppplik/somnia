# Vector scene, shapes and layers (wave 4)

Status: pure core library, layers panel component and tests. No canvas editor, no SVG import, no dialog wiring.
Follows the wave-4 vector editing ADR (immutable `VectorScene` base plus `vector.*` operations on the `ImageOperation` envelope), with the deviations listed below.

## Where things live

| Path | Purpose |
| --- | --- |
| `phase1/src/lib/imageedit/vector/types.ts` | Scene, node, style, path segment and document types (ADR contract) |
| `.../math.ts` | Matrix order (`world = parent * local`), multiply, invert (null when singular) |
| `.../path.ts` | Geometry and path validation, shape-to-segments conversion, SVG path data |
| `.../style.ts` | Paint and `ShapeStyle` validation (full and partial), `solid('#hex')` helper |
| `.../scene.ts` | Node/scene validation, tree invariants, limits, parent index, world matrix, lock check, `outline()` |
| `.../registry.ts` | `VectorOperationRegistry`, `VectorHandler` (`validate` + `apply`) |
| `.../operations.ts` | The nine `vector.*` v1 handlers, op constructors, `reorderOp`, `bakeToPathOp` |
| `.../replay.ts` | Document, replay, JSON parse/serialize, `VectorHistory` |
| `.../svgExport.ts` | Allowlisted SVG serializer over a validated scene |
| `phase1/src/components/vectoredit/LayersPanel.tsx` | Layer tree panel (controlled, callbacks only) |
| `phase1/src/locales/*.json` | 16 `vectoredit.*` keys in en, de, es, fr, pt-BR |

## Model (ADR)

- `VectorEditDocument`: `{kind: 'vector', schemaVersion: 1, source, base: VectorScene, operations, revision}`. Operations are `ImageOperation` envelopes (`type` starts with `vector.`, exact integer `version`).
- `VectorScene`: `viewBox`, `outputSize`, `roots`, flat `nodes` map. Tree, not graph: every node has one parent or is a root, all reachable, no cycles or dangling ids. The parent index is derived (`parentIndex`), not stored.
- Nodes: `group` (children ids) and shape nodes with explicit canonical style, `transform` matrix `[a,b,c,d,e,f]`, `opacity`, `visible`, `locked`. IDs are opaque (`A-Za-z0-9_-`, max 64, `__proto__`/`constructor`/`prototype` etc. rejected). Operation params carry final IDs; replay never generates IDs.
- Paths: absolute `M L C Q A Z` segments as objects. Arcs stay arcs.
- Paint: `none` or solid RGBA (`0..255`, alpha `0..1`). Style has fill, stroke, strokeWidth, fillRule, lineCap, lineJoin, miterLimit, dash, dashOffset.
- Everything is frozen and detached after validation.

## Operations (all v1, params validated by `handler.validate`, atomic)

`vector.insert`, `vector.delete` (subtrees, ancestor/descendant overlap normalized), `vector.transform` (multi-node), `vector.style` (shape targets only), `vector.geometry` (same kind only), `vector.reparent` (ordered ids, new parent or null, index, replacement matrices; rejects cycles and moving a node with its descendant), `vector.properties` (name/opacity/visible/locked), `vector.viewport`, `vector.batch` (1..256 non-nested children, all or nothing).

Replay (`replayVector`): validates the base, validates every op's schema including disabled ones, applies enabled ops in order with abort checks, validates each resulting scene. Any failure rejects the whole replay; nothing is skipped or migrated. Unknown type or version throws.

Locks: own or ancestor group lock blocks insert-into, delete, transform, style, geometry and reparent (as target or destination). `vector.properties` is always allowed, so a node can be unlocked, renamed or hidden. Locks are editor metadata only.

## Mapping from the flat layer model to the tree

- A "layer" is a node. The panel shows the tree top-first (last child is painted last, so it is on top), nested rows are indented (`aria-level`).
- Reorder is `reorderOp`: a `vector.reparent` to the same parent with unchanged matrices (appearance does not change).
- Rename, visibility and lock are `vector.properties`.
- Convert to path is `bakeToPathOp`: one `vector.batch` that inserts an equivalent path node (new id, same name, transform, style, flags) at the same index and deletes the primitive. Parametric source geometry is not kept in the new node. `vector.geometry` cannot change a node's kind.
- Grouping/ungrouping are not built as helpers yet. They are expressible today as a batch of `vector.insert` (empty group) plus `vector.reparent` with matrices computed from `worldMatrix` of the current scene (see the grouping test). Group opacity is group compositing and is not multiplied into children.

## Deviations from the ADR

1. **Extra node kinds**: `polygon` (regular, 3..128 sides) and `line` exist as first-class parametric nodes because the task asked for Rect/Ellipse/Polygon/Line convertible to paths. The ADR only has group, rect, ellipse, path (it converts line/polygon to paths on import). Importer/other consumers must handle or bake these. Remove them if the central builder prefers the strict set.
2. **Module paths**: core is in `src/lib/imageedit/vector/` (ADR layout, but flatter: `path.ts`, `scene.ts`, `operations.ts`, `replay.ts` instead of `document.ts`, `bounds.ts`, etc.). The panel is in `src/components/vectoredit/` as the task specified, not `src/components/imageedit/vector/`.
3. **Not implemented**: bounds, hit testing, SVG import, renderer adapter, session/history reducer shared with raster (a small `VectorHistory` over document snapshots exists, cap 100), `RenderContext` is only used for abort.
4. **Limits**: ADR starting ceilings for nodes (10,000), depth (64), segments (100,000), operations (5,000) and batch size (256) are enforced as constants in `LIMITS`. Unmeasured defaults, as in the ADR. The 8 MiB / 32 MiB size limits are not enforced (no import or file format yet).
5. **Shared envelope**: `VectorOperation` is `ImageOperation` imported from `image-editor/types` (type-only), as in the ADR.
6. **Export**: SVG export drops editor ids and locks except an escaped `data-node` attribute. Names are not exported. Hidden nodes export with `display="none"`.
7. Rounded rects use rx and ry (each clamped to half the side). Cubic approximation (kappa 0.5523) is used for ellipses and rounded corners, so conversion is close, not exact. Polygon and line convert exactly.

## Tests

`npm run test:core` now includes `src/lib/imageedit/vector/*.test.ts` and `src/components/vectoredit/*.test.tsx` (20 tests): matrix order and inverse, geometry/style/paint validation, dangerous ids, tree invariants and limits, every op, locks (own and ancestor), batch atomicity, bake, replay (disabled-op validation, exact versions, abort, determinism), JSON round trip, registry lifecycle and rollback, history, SVG export, panel markup, locale parity. No DOM needed.

## Open

- Hit testing, bounds (extrema, arcs, strokes), canvas viewport and tools, path-point editing, boolean ops.
- SVG import with the strict subset and diagnostics (per ADR), native session file format, raster export.
- Group/ungroup/duplicate helpers with world-preservation checks.
- Wiring into the Edit-image dialog and format-driven mode; shared history reducer.
- Panel is unstyled beyond inline layout (plain unicode icons, not Vadivam); no visual check in the real UI. Translations are machine-written. Playwright e2e not run.
- Names are not unique; replay does not enforce unique names.
