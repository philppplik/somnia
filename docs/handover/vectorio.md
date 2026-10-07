# Handover: SVG import/export (`phase1/src/lib/vectorio`)

Branch `feat/vectorio`, based on `somnia-agent` @ `427f8db`. Not pushed. No PR, no CI trigger, no new dependencies
(own XML reader and path parser; zero runtime imports outside the folder).

## Contract (as specified in the wave 4 assignment message)

```ts
VectorDocument { width, height, paths: VectorPath[] }
VectorPath     { id, closed, nodes: VectorNode[] }
VectorNode     { id, x, y, kind: 'corner'|'smooth'|'symmetric', in?: {x,y}, out?: {x,y} }  // handles are ABSOLUTE
```

The segment from node A to node B is a cubic if `A.out` or `B.in` exists, otherwise a line. For a closed path the
closing segment last -> first follows the same rule. A handle lying exactly on its node is treated as absent.

Additive optional fields on `VectorPath` (needed for fill/stroke and group -> layer, ignorable by other code):
`style` (partial; absent = SVG defaults), `layer` (name of the top-level SVG group), `compound` (subpaths that were one
`<path>`: holes / evenodd), `name`, `hidden`.

### Canonical path serialization (`serializeContour`)

Absolute `M`/`L`/`C`/`Z` only, explicit letter on every command, single-space separated numbers, at most 3 decimals,
no trailing zeros, no `-0`. A closed path whose closing segment is a curve writes an explicit `C` back to the first
node before `Z`.

## API

```ts
importSvg(source, { strict = true }) -> { doc, warnings }   // throws SvgImportError (with .diagnostics)
exportSvg(doc, { indent }) -> string
normalizeDoc(doc) -> doc      // round to 3 decimals, drop retracted handles, re-infer kinds: what export/import returns
serializeContour(nodes, closed), parsePathData(d), arcToCubics(...), parseTransform(s)
```

## Import behaviour

- Supported: `svg`, `g`, `path` (all commands incl. arcs, relative, S/T, compact number forms, arc flags without separators),
  `rect` (rx/ry), `circle`, `ellipse`, `line`, `polyline`, `polygon`; presentation attributes and `style=""` for
  fill, stroke, stroke-width/linecap/linejoin/miterlimit/dasharray/dashoffset, fill/stroke/element opacity, fill-rule,
  display/visibility.
- Everything is flattened to document pixel space: transforms are baked into points and handles, the viewBox
  (origin + scale, `meet` centring) is baked, so the document has origin 0,0 and `viewBox="0 0 width height"` on export.
- Arcs become cubics (<= 90 degrees each, exact endpoints). Quadratics are elevated to cubics exactly. Circles/ellipses are
  4-node cubic paths; line/polyline/polygon/rect are corner-only paths.
- Top-level `<g>` -> `layer` name (inkscape:label, data-name or id). Nested groups share the top-level layer.
- Strict mode (default): any unsupported feature is an error; `SvgImportError.diagnostics` lists all of them. Nothing is
  silently dropped. Rejected: text, use, image, style/script, defs (when non-empty), gradients/patterns, clip-path/mask/filter,
  CSS classes, `<!ENTITY>`, nested svg, href/xlink:href, `on*` attributes, unsupported `preserveAspectRatio`, bad viewBox.
  `strict:false` imports the supported part and returns each skip as a warning.
- Limits (unmeasured defaults from the ADR): 8 MiB input, 10,000 nodes, depth 64, 100,000 path segments.
- Imported SVG ids never become application ids. Node ids `nN`, path ids `pN` are assigned in document order,
  deterministic per import.

## Export behaviour

One `<path>` per element (compound subpaths merged), `<g data-name>` per run of the same layer, only non-default style
attributes, escaped attribute values, no metadata/ids/editor state. Output of `exportSvg` is idempotent through
import -> export (tested byte-identical).

## Tests

`src/lib/vectorio/vectorio.test.ts` (node:test via tsx, 30 tests, added to the `test:core` glob in `package.json`):
path parser, arcs, shapes, handles, kind inference, transforms, viewBox, layers, style cascade, strict/lenient
diagnostics, limits, XML edge cases, canonical serialization rules, export, round trips (model equality against
`normalizeDoc`, byte idempotence, coordinate tolerance 5e-4).

## Conflicts / deviations (document, not silent)

1. The ADR (`vector-editing-*.md`) proposes an immutable `VectorScene` tree (groups, rect, ellipse, path, transforms,
   `vector.*` ops under `src/lib/imageedit/vector`). The assignment's flat `VectorDocument` contract was followed instead,
   as the later explicit instruction. Consequences: rect/circle/ellipse/groups/transforms are not preserved as such (flattened to
   paths, transforms baked); no op registry or `ImageOperation` envelope here. The ADR's ceilings and strict-subset policy were adopted.
2. The module lives in `src/lib/vectorio` as assigned, not `src/lib/imageedit/vector` as the ADR names.
3. `style`, `layer`, `compound`, `name`, `hidden` extend the base contract (see above).

## Open / known limits

- Gradients, patterns, text, `use`/`symbol`, clipping, masks, filters, markers, CSS `<style>`/classes: not supported (rejected).
- Group opacity is multiplied into each child path (differs from SVG when children overlap); reported as a warning.
- Non-uniform scale: stroke width/dashes use `sqrt(|det|)` (approximation, warned). Skew on strokes likewise.
- `preserveAspectRatio` other than `xMidYMid [meet]` rejected; nested `<svg>` rejected.
- Percent / em / ex lengths are not resolved (treated as unspecified).
- Node `kind` is inferred from handles (tolerance 1e-3 on direction and length); the editor must keep it consistent when
  moving handles. Kind is not stored in SVG, so it is re-inferred on every import.
- Relative-coordinate round-off: export is rounded to 3 decimals; very large coordinates lose relative precision.
- Limits are untested against a benchmark; entity expansion is not performed at all.
- No UI, no wiring into the Edit-image dialog, no browser/WebView verification; no `DOMParser` used (works in node).
- `npm run test:core`: 1226 tests, 1223 pass, 0 fail (3 skipped, pre-existing); `tsc --noEmit` clean.
