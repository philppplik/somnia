# Flat <-> Scene adapter

`phase1/src/lib/imageedit/vector/flatAdapter.ts` is the boundary between the flat pen documents and the structured `VectorScene`. It is a pure conversion service, not a second editor or a Studio registration. Studio S0/S1 supplies the Code shell; it does not define a different vector document model. The existing Designer engine in `imageedit/vector/types.ts` supplies the scene contract.

## Inventory and API

- `vectorio/types.ts`: mutable `VectorDocument` with dimensions and ordered single-contour paths, absolute handles, three node kinds, optional `style`, `layer`, `compound`, `name` and `hidden` extensions. Missing style means black fill and no stroke.
- `vectorcore/types.ts`: mutable geometry document with two node kinds and top-level `fill`, `stroke`, `strokeWidth`, `fillRule`. Its renderer defaults to no fill and black 1px stroke. Explicit `null` disables paint. This is not the vectorio style contract.
- `imageedit/vector/types.ts`: immutable `VectorScene` with ordered roots, ID-indexed nodes, nested groups, local affine matrices, visibility/locks/opacity, explicit paint and stroke styles, native path/rect/ellipse/polygon/line geometry. `VectorEditDocument` wraps a base scene and operations for replay/history.
- Pen UI `components/vectoredit/model.ts`: geometry-only mutable boundary with absolute handles. Neither conversion service commits history, changes selection, saves files nor switches Studios.

All APIs return `{ value, warnings }`. Use `flatToScene` / `sceneToFlat` for vectorio; use `coreToScene` / `sceneToCore` for vectorcore. Do not structurally pass vectorcore into `flatToScene`: TypeScript allows the shared geometry shape, but paint semantics differ.

## Flat import

One scene path per flat path. Contours sharing `compound` become one scene path at the first contour's paint position, matching vectorio export, including the empty-string compound key. The first contour supplies style, name, layer and visibility; conflicting subsequent metadata emits a warning.

Contiguous layer runs become groups. Repeated layer names separated by another layer or a root create separate groups; collecting all same-name paths into one group would change overlap order. Generated group/replacement IDs cannot consume later valid path IDs. Invalid, duplicate and reserved IDs are replaced deterministically.

Hidden becomes `visible:false`; style opacity becomes node opacity; fill/stroke opacity is folded into paint alpha. Hex shorthand and rgb/rgba follow the existing vectorio colour normalizer. Gradients (`url(#..)`) and `currentColor` have no scene paint and become `none` with a warning. Dimensions and styles are validated rather than silently clamped. Output passes `validateScene`, including its node/depth/segment bounds and deep freezing.

## Scene export

World matrices and the viewBox origin are baked into anchors and absolute handles. Native shapes become paths; quadratics and arcs become cubics. The first contour retains the scene shape ID, additional contours receive collision-free IDs and share a compound key. Flat coordinates use vectorio's canonical three-decimal precision; node IDs/kinds are derived again, not an editing-identity round trip.

Similarity transforms (rotation/reflection/uniform scale) also scale stroke width, dashes and dash offset. Non-uniform or skew transforms cannot exactly represent transformed stroke outlines with one scalar width; metrics remain unchanged with a warning. Callers needing faithful SVG should use the scene `toSvg` serializer instead.

Ancestor visibility is propagated. Ancestor opacity is multiplied into each path with a warning for group compositing. Nested hierarchy, empty groups and editor locks cannot be represented and warn. The top-level group name is the flat layer. Flat dimensions use viewBox units; a different output size warns rather than silently pretending to preserve both.

The reduced vectorcore export additionally reports lost layer/compound/visibility/name metadata and alpha/extended stroke styling. Symmetric handles remain geometrically intact but their kind narrows to `smooth`. It is a geometry interchange, not a lossless replacement for scene persistence.

## Host integration

Not wired into the editor UI in this patch. A future Designer/Pen host can convert the source at the boundary, inspect warnings before committing, then append a scene/history operation. Selection mapping, replay transactions, pending-tool guards and persistence remain host responsibilities. No new Studio is registered while its runtime host is absent.

## Evidence

`flatAdapter.test.ts`, `coreAdapter.test.ts` and existing `vector.test.ts` cover paint ordering, reserved/duplicate IDs, later-ID reservation, compounds and conflicting metadata, colour support, strict values, single-anchor closed cubic geometry, immutable inputs, core defaults/null paint, kind narrowing, transforms, quad/arc control points, all native shape conversions, stroke metrics, opacity/lock/hierarchy/output-size warnings, SVG import/export and scene limits. No dependency, lockfile or Rust-source change is needed.
