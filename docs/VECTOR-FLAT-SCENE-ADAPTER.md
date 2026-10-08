# Flat <-> Scene adapter

`phase1/src/lib/imageedit/vector/flatAdapter.ts` converts between the flat pen document (`vectorio` / `vectorcore`: paths with absolute-handle nodes) and the structured `VectorScene`.

- `flatToScene(doc)` returns `{ value, warnings }`. One path node per flat path; subpaths sharing `compound` become one path node; `layer` becomes a group (first-seen order); `hidden` becomes `visible:false`; `style.opacity` becomes node opacity; fill/stroke opacity are folded into paint alpha. Output goes through `validateScene`, so scene limits (10k nodes, depth 64, 100k segments) throw `RangeError`.
- `sceneToFlat(scene)` bakes world transforms (and the viewBox origin) into coordinates, converts rect/ellipse/polygon/line to paths, quads and arcs to cubics, multiplies ancestor opacity into each path (warning when that changes group compositing), and uses the top-level group name as layer.
- Gradients (`url(#..)`) and `currentColor` have no scene paint: they become `none` with a warning, never silently.
- Known loss: group compositing and locks do not exist in the flat model.

Not yet wired into the editor UI; the adapter is the contract the pen tool can move onto.
