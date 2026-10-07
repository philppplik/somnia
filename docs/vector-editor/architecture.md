# Vector editor: architecture and contract (skeleton)

Status: **skeleton / contract draft**. Written ahead of the dev teams. Sections marked `OPEN` are decisions the dev teams or the owner still have to make. Nothing here describes shipped code.

Modules covered: `vectorcore` (model + math), `pen-tool` (interaction), `svg-io` (import/export). Conformance tests: `phase1/test/vector/`.

## 1. Vector document schema (v1)

```ts
interface VectorDocument { version: 1; width: number; height: number; paths: VectorPath[] }
interface VectorPath {
  id: string;            // stable, unique in the document, never reused
  closed: boolean;
  nodes: VectorNode[];
  fill?: string | null;  // CSS colour or null
  stroke?: { color: string; width: number } | null;
}
interface VectorNode {
  x: number; y: number;
  in:  { x: number; y: number } | null;   // incoming handle, ABSOLUTE coordinates
  out: { x: number; y: number } | null;   // outgoing handle, ABSOLUTE coordinates
}
```

Rules:
- Coordinates are user units, y down, origin top-left (same as SVG).
- Handles are absolute, not relative to the node. `null` means "no handle" (segment side is straight).
- A segment is a line iff the start node has no `out` and the end node has no `in`. Otherwise it is a cubic; a missing handle collapses onto its node.
- A closed path has an implicit closing segment from the last node to the first.
- The document must be JSON-serialisable (no `NaN`, `Infinity`, `undefined`, class instances).

## 2. Canonical path-data serialization

`serializePath(path) -> string` produces SVG path data. It is deterministic, so it can be compared byte for byte.
- Only absolute `M`, `L`, `C`, `Z`. No spaces after the command letter, single space between numbers, no space before the next command letter (`M0 0L10 0`).
- Numbers: rounded to at most 3 decimals, trailing zeros trimmed, `-0` written as `0`.
- A closed path emits the closing segment explicitly (as `L` or `C`) only if it is curved, then `Z`. A straight closing segment is left to `Z`.
- An empty node list serializes to the empty string.
- `parsePath` is the inverse for this canonical subset. `serializePath(parsePath(d)) === d` for every canonical `d`.

`svg-io` import of arbitrary SVG (relative commands, `H/V/S/Q/T/A`, transforms) must normalise into this model. Arcs and quadratics are converted to cubics. `OPEN`: arc to cubic tolerance.

## 3. Operation naming (imageedit registry)

Operations follow the existing `ImageOperation` shape from `src/lib/image-editor/types.ts`: `{ id, type, version, enabled, params }`, JSON params only, registered through the ops registry, undo/redo through the existing history.

- All vector op types use the prefix `vector-`, kebab-case: `vector-add-path`, `vector-delete-path`, `vector-add-node`, `vector-move-node`, `vector-move-handle`, `vector-set-node-type`, `vector-close-path`, `vector-set-style`, `vector-boolean`, `vector-transform`.
- Each op carries `version` (integer, starts at 1). Changing param meaning bumps it.
- Params reference paths and nodes by `id`/index, never by object reference.
- Every op is invertible or snapshots what it needs to be undone. A drag gesture (node or handle move) is one history entry, not one per pointer event.
- `OPEN`: whether `vector-*` ops live in the raster pipeline or in a separate vector layer stack.

## 4. Interfaces between modules

`vectorcore` (no DOM, no React, pure functions, importable from node):
```ts
serializePath(path: VectorPath): string
parsePath(d: string): { closed: boolean; nodes: VectorNode[] }
pointAt(c: Cubic, t: number): Point
splitCubic(c: Cubic, t: number): [Cubic, Cubic]
cubicBBox(c: Cubic): { minX: number; minY: number; maxX: number; maxY: number }
cubicLength(c: Cubic): number
// Cubic = [Point, Point, Point, Point]
```
`pen-tool` depends on `vectorcore` only. It turns pointer input into `vector-*` operations and never mutates a document directly.
`svg-io` depends on `vectorcore` only: `importSvg(text) -> VectorDocument` (with a list of warnings for dropped features) and `exportSvg(doc) -> string`. Exported path data uses the canonical serializer.
Dependency direction: `pen-tool -> vectorcore <- svg-io`. No cycles.

## 5. Conformance

`node --test phase1/test/vector/*.test.mjs` runs the reference-math self-checks. To test an implementation: `SOMNIA_VECTORCORE=/abs/path/to/vectorcore-entry.mjs node --test phase1/test/vector/*.test.mjs` (a `.ts` entry needs `tsx --test`). The module must export the `vectorcore` functions above. Without the variable the implementation tests are reported as skipped, not passed.

Reference values: `fixtures.json` holds hand-derived numbers (arch and hill curves, bboxes). `reference.mjs` recomputes them with two independent evaluators (Bernstein and de Casteljau) and cross-checks split, bbox (derivative roots) and length (20000-segment polyline; circle quarter uses kappa 0.5522847498 with 3e-4 tolerance). Tolerances for implementations: points and splits 1e-9, bbox 1e-6, length 1e-4.

## 6. Open items

- Not wired into `test:core` (that would modify `phase1/package.json`). The integrator adds `test/vector/*.test.mjs` to the glob, or a separate script.
- No test yet for: boolean ops, stroke outlining, path hit-testing, node snapping, SVG import of arcs/transforms, undo/redo of vector ops. Needs the dev teams' API first.
- Fixtures contain no self-intersecting or degenerate (zero-length) curves yet. Length/bbox for cusps is untested.
- Rounding rule (3 decimals) is a proposal; owner or dev teams may change it, then `fixtures.json` changes with it.
- Test run on Node 22 only. CI was not triggered.
