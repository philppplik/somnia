# vectorcore

Pure TypeScript vector path core in `phase1/src/lib/vectorcore`. No UI, no runtime dependencies, no DOM requirement (rendering takes a minimal Canvas2D-shaped context).

## Model

```ts
VectorDocument { width, height, paths: VectorPath[] }
VectorPath     { id, closed, nodes: VNode[], fill?, stroke?, strokeWidth?, fillRule? }
VNode          { id, x, y, kind: 'corner' | 'smooth', in?: {x,y}, out?: {x,y} }
```

- Handles are **absolute** positions. A missing handle means a straight edge on that side.
- One contour per path. Segment `i` runs `nodes[i] -> nodes[i+1]`; a closed path has one more segment back to `nodes[0]`.
- `Cubic` is `{ p0, c1, c2, p1 }`. The contract helpers also accept a 4-tuple `[p0, c1, c2, p1]`.

## API

| Area | Exports |
| --- | --- |
| Bezier math | `pointAt`, `splitCubic`, `cubicBBox`, `cubicLength`; full set under `bezier.*` (`evaluate`, `derivative`, `split`, `length`, `bbox`, `nearest`, `flatten`) |
| Paths | `segments`, `segmentAt`, `pathBBox`, `pathLength`, `flattenPath`, `splitSegment`, `nearestOnPath` |
| Hit testing | `hitHandle`, `hitNode`, `hitSegment`, `pointInPath`, `hitTestPath`, `hitTestDocument` (priority handle > node > segment > fill; later paths win) |
| Serialization | `documentToJSON/FromJSON/FromString`, `pathFromJSON` (validating), `serializePath`, `parsePath` |
| Operations | `VectorOperationRegistry`, `registerVectorOps`, `createVectorRegistry`, `newVectorOperation`, `replay`, `VectorHistory` |
| Rendering | `renderDocument`, `renderPath`, `tracePath`, `renderOverlay` (Canvas2D) |

`length` uses adaptive 5-point Gauss-Legendre. `bbox` is tight (derivative roots). `nearest` is sampling plus ternary refinement.

## Canonical path data

`serializePath` emits only absolute `M`, `L`, `C`, `Z`, at most 3 decimals, trailing zeros trimmed, never `-0`. A straight closing edge is implied by `Z`; a curved one is written as `C` before `Z`. `parsePath(d, id, idPrefix)` accepts absolute uppercase `M/L/C/Z` for a single contour and throws `SyntaxError` for anything else (relative commands, `Q`, `A`, `H/V`, multiple subpaths). Parsed nodes are `corner`, except nodes whose handles are collinear and opposite, which become `smooth`. Node ids are `${idPrefix}${index}`. Round trip is geometry-exact to 3 decimals, not id-exact.

## Operations

Same wire envelope as `ImageOperation` (`id, type, version, enabled, params` with JSON params). Names use the `vector.` domain from the ADR: `vector.path.add-path`, `delete-path`, `add-node`, `move-node`, `move-handle`, `set-node-kind`, `delete-node`, `split-segment`, `set-closed`, `translate-path`, `set-style`, `batch`.

- Registry: keyed by `type@version`, duplicates throw, `registerVectorOps` returns a cleanup that removes only its own handlers. Opt-in, no global registration.
- Handlers have `validate(params)` (detaches JSON, rejects non-finite numbers and `__proto__`/`constructor`/`prototype` keys) and `apply(doc, params, { signal })`, which is pure.
- Params carry final ids (`path.id`, `node.id`, `newNodeId`). Replay never generates ids.
- `replay(base, ops)` validates every op first (including disabled ones, unique op ids), then applies enabled ops in order, re-validating the document after each. Any failure rejects the whole replay. It never mutates `base`.
- `vector.path.batch` runs up to 256 non-batch child ops atomically.
- `vector.path.move-handle`: `to` is absolute. The opposite handle is mirrored (reflection through the node) when the node is `smooth`, unless `mirror: false`; corner nodes mirror only with `mirror: true`.
- `VectorHistory` keeps an op list plus a cursor and recomputes by replay. No inverse ops. A failing push leaves history untouched.

## Tests

`npm run test:core` includes `src/lib/vectorcore/*.test.ts` (node:test via tsx).

## Open

See the handover for the honest list: no compound paths, no booleans, no arcs/quadratics, no SVG import, no scene tree (groups, rect, ellipse), no stroke geometry hit testing beyond a tolerance, and a few ADR conflicts.
