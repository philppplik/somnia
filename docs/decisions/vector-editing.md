# ADR: Vector editing alongside the raster image editor

- Status: Proposed. Documentation only; no vector editing is implemented by this change.
- Date: 2026-10-07.
- Baseline: `somnia-agent`, `427f8dbd2478d361b544a8cf81c4fd9dc0b7b631`.
- Scope: Local vector document model, operation registry, module boundaries, and staged refactor.
- Integration owner: Central builder. This branch does not change runtime code, dependencies, or scripts.

## Decision

Add a separate, typed vector scene pipeline under `src/lib/imageedit/vector`. Reuse the existing serializable operation envelope and registration lifecycle, not the raster handler interface. Keep the current raster flow working unchanged until shared session/history code has regression coverage.

Use a validated scene tree as the immutable base and replay explicit operations to derive the current scene. Render only generated SVG elements from the validated scene. Never mount imported SVG markup. Keep SVG export vector-based; make PNG/JPEG/WebP export an explicit rasterization boundary with chosen dimensions.

Start with groups, rectangles, ellipses, and paths; selection, transforms, fill/stroke, ordering, grouping, and path-point editing. Import/export a declared static SVG subset. Do not present unsupported SVG as fully editable or silently remove unsupported content.

## Existing code and constraints

All paths below are relative to `phase1/`, inspected at the baseline above.

| Existing surface | Observed contract | Consequence |
| --- | --- | --- |
| `src/lib/image-editor/types.ts` | `ImageOperation` has `id`, `type`, `version`, `enabled`, JSON `params`; document has source metadata, operations, revision | Share the envelope, but do not pretend a vector scene is an `ImageEditDocument` |
| `src/lib/image-editor/pipeline.ts` | Registry keyed by `type@version`, duplicate rejection, owner-scoped unregister; handlers consume/produce RGBA rasters | Match registration semantics; vector handlers require a different input/output type |
| `src/lib/image-editor/document.ts` | Detached frozen operation params, unique operation IDs, immutable document snapshots | Preserve these invariants; add vector scene and per-operation validation |
| `src/lib/imageedit/adjust` and `filters` | Explicit handler registration and serializable normalized params | Follow this pattern for vector operations; no implicit global registration |
| `src/components/ImageEditorDialog.tsx` | Snapshot contains stack, live adjustment, live filter; 100-entry history, drag coalescing, asynchronous raster render cancellation | Extract generic history carefully; raster live fields must not leak into vector state |
| `src/lib/image-editor/loader.ts` | SVG checked and decoded as an image, not retained as editable geometry | New vector import path must precede raster loading for an explicit vector session |
| `src/lib/imageConversion.ts` | Separate standalone-SVG validator with different acceptance rules and limits | Do not assume either validator is a vector parser or merge their policies blindly |
| `src/lib/imageEditorHost.ts` | Blob/name picker, copy-oriented save, native one-use grants; web download | Reuse host contract, audit format handling before enabling SVG/native session save |
| `src/lib/image-editor/viewport.ts` | Pure zoom/pan and screen/image conversion | Reuse math primitives where semantics agree; add viewBox and node transforms |
| `package.json` | `test:core` uses `tsx --test` with explicit globs and `node:test` fixtures | New nested vector/session directories will need explicit glob additions |

Current image-editor export formats are PNG, JPEG, and WebP. SVG picker acceptance does not mean editable vectors or SVG export exists. Current dialog close/open-other paths reset state without a dirty-session confirmation; this is a refactor requirement, not an existing guarantee.

## One editor entry, format-driven modes

Use one editor window and entry point. Its toolbox follows the opened asset format: PNG/JPEG/WebP use the existing raster adapter, SVG uses vector tools, PDF uses a future PDF/layout adapter. This is the latest parent-supplied product direction, not permission to implement PDF editing in this docs-only branch. Do not create three apps, three file menus, or an unrelated vector-only launch path.

The outer shell owns open/save/copy/close, dirty guards, history controls, status, and session generation. The mode adapter owns document type, viewport renderer, tool panels, format-specific diagnostics, and export choices. Add `pdf` to the architectural mode contract without claiming a PDF document model or tools are already implemented. PDF parsing/editing, page selection, layout operations, licensing, and export safety require their own design and implementation gate. Until available, opening a PDF must give a truthful unsupported-mode explanation or an existing read-only preview, never a fake editable toolkit.

Determine mode from validated file content plus format metadata; disagreement or damaged input is a diagnostic, not a reason to route by filename alone. An SVG's unsupported features block its editable vector import, not automatically its format classification. Explicit sanitized raster-copy fallback changes the working document to raster and must clearly label that loss of vector semantics. Mode changes occur within the same window, replace the session only after dirty-state resolution, and cancel/dispose the previous adapter. Hide irrelevant controls entirely. A PDF page rasterization or raster-to-vector tracing command would be an explicit conversion, not an ordinary mode toggle or a capability implied by opening the file.

## Document model

The following types are a design contract, not drop-in production code. Every boundary receives `unknown` and validates before construction. Runtime handles, DOM nodes, renderer caches, pointer state, and selected IDs are not serialized.

```ts
type Matrix = readonly [number, number, number, number, number, number];
type NodeId = string;
type Paint = { kind: 'none' } | { kind: 'solid'; rgba: readonly [number, number, number, number] };
type PathSegment =
  | { kind: 'M' | 'L'; x: number; y: number }
  | { kind: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { kind: 'Q'; x1: number; y1: number; x: number; y: number }
  | { kind: 'A'; rx: number; ry: number; rotation: number; largeArc: boolean; sweep: boolean; x: number; y: number }
  | { kind: 'Z' };
interface NodeCommon {
  readonly id: NodeId;
  readonly name: string;
  readonly transform: Matrix;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
}
interface ShapeStyle {
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly strokeWidth: number;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly lineCap: 'butt' | 'round' | 'square';
  readonly lineJoin: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
}
type VectorNode = NodeCommon & (
  | { kind: 'group'; children: readonly NodeId[] }
  | { kind: 'rect'; x: number; y: number; width: number; height: number;
      rx: number; ry: number; style: ShapeStyle }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; style: ShapeStyle }
  | { kind: 'path'; segments: readonly PathSegment[]; style: ShapeStyle }
);
interface VectorScene {
  readonly viewBox: readonly [number, number, number, number];
  readonly outputSize: { readonly width: number; readonly height: number };
  readonly roots: readonly NodeId[];
  readonly nodes: Readonly<Record<NodeId, VectorNode>>;
}
// Same wire envelope as ImageOperation; vector.* names define the domain.
type VectorOperation = ImageOperation;
interface VectorEditDocument {
  readonly kind: 'vector';
  readonly schemaVersion: 1;
  readonly source: { readonly id: string; readonly name: string; readonly mime: 'image/svg+xml' };
  readonly base: VectorScene;
  readonly operations: readonly VectorOperation[];
  readonly revision: number;
}
```

### Invariants and coordinates

- Scene tree, not an arbitrary graph: every node has exactly one parent or appears once in `roots`; all nodes are reachable; no cycles, duplicates, dangling children, or non-group parents. Derive the parent index, do not serialize a second competing hierarchy.
- Node IDs are opaque stable local identifiers assigned on import. Incoming SVG IDs do not become application keys or selectors. Reject dangerous object keys and construct ID maps without prototype inheritance. Creation/duplication params contain their final IDs; replay never generates IDs.
- Geometry is in node-local SVG user units. Matrix `[a,b,c,d,e,f]` maps `(x,y)` to `(a*x+c*y+e,b*x+d*y+f)`. World matrix is parent-world multiplied by local; pointer conversion inverts viewport, viewBox mapping, then world matrix. Define multiplication order once in math tests.
- Preserve a nonzero viewBox origin. First import accepts absent `preserveAspectRatio` or `xMidYMid meet`; reject other modes until represented explicitly. Output size is in CSS pixels, with positive finite values; raster export separately requires bounded integer pixels. Resolve supported absolute length units to CSS pixels at import; reject relative units requiring layout context.
- All numbers finite; opacity/alpha in `[0,1]`; color channels in `[0,255]`; widths/radii/stroke width nonnegative; miter limit at least 1; viewBox width/height positive. Singular transforms may display but cannot be directly manipulated through inverse hit testing; show a diagnostic, never divide by zero.
- Canonical paths use absolute commands. Expand H/V/S/T and relative coordinates while retaining arcs as arcs. Multiple subpaths and close commands are explicit. Require a move before drawable segments; validate arc radii/flags, reflection rules, and segment counts. No lossy arc-to-polyline conversion on save.
- Canonical shape styles are explicit after inherited SVG presentation attributes are resolved. Preserve group opacity as group compositing, not multiplied into each child's alpha. A group itself has no shape-style payload.
- Group visibility/lock state restricts descendants in the editor. Locks are editor metadata, not a security boundary. Neither selection nor locks alter exported geometry. Hidden nodes remain in the model and export with explicit visibility state.
- Freeze/detach accepted documents, including nested geometry/style/params. Structural sharing is safe only after validation and immutable construction. Preserve original bytes outside the model for diagnostics/cancel; never use them as live markup.

## Operation registry and replay

Use a separate `VectorOperationRegistry` implementing the existing `register(handler): () => void` and `get(op)` shape, with independent storage. Use `vector.*` names and exact integer versions. Do not widen `OperationHandler.apply` to a raster/scene union or dispatch by casting params.

```ts
interface VectorHandler {
  readonly type: `vector.${string}`;
  readonly version: number;
  validate(params: unknown): ImageOperation['params'];
  apply(scene: VectorScene, params: ImageOperation['params'], context: RenderContext): VectorScene;
}
```

`validate` returns canonical detached JSON or throws. Registry lookup validates domain/version; duplicate registration throws; cleanup removes only its owned handler. Register built-ins explicitly with rollback on partial registration failure, as filters already do. No vector shaders or arbitrary extension-supplied SVG markup.

Replay validates the base, checks operation IDs, resolves every operation's schema (including disabled ones), then applies enabled ops in order with abort checks before/after each apply. Validate each resulting scene; a failed operation rejects the entire render/commit and retains the last valid frame. Never skip failed dependencies or silently migrate unknown versions. Unknown schema/type/version leaves the original file intact and opens only an error/read-only recovery state, not an editable session with changed meaning.

| Operation v1 | Params and behavior |
| --- | --- |
| `vector.insert` | Fully validated subtree, final IDs, parent ID or null, insertion index; reject collisions |
| `vector.delete` | Target IDs; remove entire subtrees; normalize ancestor/descendant overlap, no orphans |
| `vector.transform` | Node IDs and replacement local matrices; one atomic multi-selection edit |
| `vector.style` | Shape IDs and a validated style patch with defined keys; reject group targets |
| `vector.geometry` | Node ID and full geometry replacement matching the existing node kind |
| `vector.reparent` | Ordered IDs, new parent or null, insertion index, replacement local matrices; reject cycles |
| `vector.properties` | Node IDs and explicit name/opacity/visible/locked patch; cannot rename IDs or change kind |
| `vector.viewport` | Replace viewBox/output size together; separate from UI zoom/pan |
| `vector.batch` | Bounded list of supported non-batch child envelopes; validate/replay atomically |

Grouping is a batch insert of an empty group plus reparenting selected siblings. Ungrouping reparents children with preserved world transforms then deletes the empty group. Duplication uses insert with a precomputed remapped subtree. Reordering uses reparent without changing world appearance. For non-siblings or non-invertible target parents, reject unsupported grouping instead of guessing. Ungroup only when group opacity/visibility can be preserved exactly; otherwise explain the compositing restriction. World matrices must be read from the current scene when constructing the operation, not recomputed from stale selection state.

Disabled ops keep existing envelope semantics but can invalidate later dependencies. Toggle trials must replay the entire proposed document before commit; missing targets reject the trial rather than disappearing. No inverse-op requirement: undo/redo retains immutable document snapshots. No compaction in v1; later compaction must preserve undo or explicitly start a new history boundary.

## Geometry dependency decision and reference boundaries

A separate Wave 4 library-research handover recommends **Paper.js as a geometry-only kernel**, not as the editor, renderer, document owner, or history owner. Adopt this as the preferred candidate for a gated evaluation, not an approved dependency addition. Keep the v1 serializable model above independent of Paper.js objects. A future `vector/geometryKernel.ts` adapter converts canonical paths to temporary kernel objects and converts results back to validated canonical geometry. No `PaperScope`, canvas, `Path`, or `Segment` instance belongs in document JSON.

The research reports roughly 84 KB gzip for the full Paper.js build and flags its old release cadence, unverified headless Node compatibility, license-detector ambiguity, and untested degenerate booleans. These are **handover estimates/risks, not measurements or license verification performed for this ADR**. Before selecting it:

1. Read the exact pinned package's LICENSE and bundled/transitive notices, reconcile the reported npm MIT versus GitHub NOASSERTION discrepancy, and update Somnia's license inventory. Metadata alone does not settle licensing.
2. Obtain explicit approval for the sizeable dependency; pin the version and lazy-load behind vector tool use. Measure the actual production chunk and cold/warm tool latency in Somnia. Lazy loading reduces initial work, not total package size.
3. Prove isolated scope cleanup and no cross-document mutable state, DOM/canvas-free `node:test` execution, cancellation boundaries, and Windows/macOS/Linux WebView compatibility. If a Node path requires canvas/jsdom or another heavy package, flag that separately rather than adding it implicitly.
4. Test coincident edges, zero-area contours, self-intersections, reversed winding, holes, mixed open/closed paths, very small/large coordinates, transformed shapes, and curve/arc conversion error. Reject unsupported inputs or mark approximation explicitly; never claim exact curve preservation merely because the candidate supports Beziers.

The reported lighter route (`bezier-js` plus a path parser such as `svg-pathdata`) remains a fallback to evaluate, not a dependency choice. Polygon-only boolean libraries require flattening curved input; no silent substitution for curve-preserving operations. Offset/expand-stroke and text-to-outlines require separate capability/dependency review. Fabric, SVG.js, and whole-editor SDKs are not required for this scene/registry design; this ADR makes no verified current license claim about an excluded SDK.

### Path mode and boolean follow-up

Use Penpot only as a behavior/UX reference identified by the research handover. Do not copy source, comments, or make a line-by-line port. The handover flags MPL-2.0 and Clojure/ClojureScript; actual UX was not run and license interpretation was not legally reviewed. No Penpot implementation was inspected or copied for this ADR.

Concepts to evaluate independently:

- Dedicated path-edit mode with node/handle selection separate from shape selection. Local path-mode undo may operate on a temporary draft; confirm emits one global geometry op, cancel restores the committed path. Global undo/redo during the mode must follow one documented rule (recommended: finish/cancel the draft first). Avoid two histories simultaneously mutating the committed scene. Exiting the mode cannot silently discard a changed draft.
- Segment/subpath representation, explicit shape-to-path conversion, and a shortcut checklist for add/remove points, corner/smooth, join/split, confirm/cancel, mode entry/exit. Do not ship keyboard bindings until checked against Somnia's existing commands and accessible alternatives.
- Non-destructive boolean groups retain source shapes and derive output. This is **not represented by the v1 `VectorNode` union above**. A separate schema change must define `boolean` nodes (`union`, `subtract`, `intersect`, `xor`), ordered operands (subtract order matters), closed-shape requirements, fill-rule/compositing semantics, kernel version, evaluation budgets, dependency invalidation, and source-selection UX. Children remain owned by the tree; derived geometry is a cache, never a second authoritative child list.
- Convert primitives to paths in the kernel adapter without destroying source nodes. Explicit flatten/bake commands produce a path replacement in an atomic op; ordinary boolean edits keep operands. SVG export of a future boolean node serializes its derived validated path and explains that editable operand history survives only in the native session format. Failure preserves the last valid scene and reports the operation, not an empty shape.

Do not add boolean UI before both the kernel gate and document/schema contract are ready. The staged v1 plan remains dependency-free in this documentation patch; it is not a promise that production path parsing/hit testing requires no library.

Research leads (URLs supplied with the Wave 4 handover; not independently opened in this ADR task): `https://github.com/paperjs/paper.js`, `https://registry.npmjs.org/paper/latest`, `https://github.com/Pomax/bezierjs`, `https://github.com/nfroidure/svg-pathdata`, and `https://github.com/penpot/penpot`. Recover exact version/license/source evidence before implementation approval rather than treating this section as that evidence.

## Session, history, and preview

Separate committed state from transient tool preview. A gesture captures its committed baseline once; move events derive previews from that baseline; pointer-up/keyboard confirmation creates one op/history entry; Escape, pointer-cancel, tool change, close, or session replacement discards preview. No-op gestures do not create history. Undo/redo cancels pending previews and clears stale selection. New commits clear redo; preserve the existing 100-entry raster cap initially, with separate byte/node budgets for vector sessions.

Represent implemented sessions as a discriminated union (`kind: raster | vector`) with domain-specific document and renderer adapters; reserve a separately typed PDF/layout adapter in the outer format-mode contract, rather than casting PDF to either document type. Do not overload the raster `Snapshot` with optional vector fields. Shared history should be a pure reducer parameterized by snapshot type, not a second global store.

Async import/export/render uses an abort signal plus a monotonically increasing session generation. A result may update UI only if both session identity and requested revision/preview token still match. Dispose old frames/URLs on replacement, abort, failure, and close. Every close/open-other route checks dirty committed state and offers save/discard/cancel. Native save reports success only after write acknowledgment; a web download reports that a download was requested, not verified disk persistence. A cancelled/failed save does not clear dirty state. UI zoom, selection, and hover do not make the asset dirty.

Hit testing walks visible, unlocked nodes in reverse paint order. Transform the pointer into local space, then test fill and stroke with consistent path math; bounding boxes are only a broad-phase filter. Hit tolerance is defined in CSS screen pixels and converted through transforms. Keep selection handles/overlays outside exported SVG. Group bounds union transformed child bounds; path bounds include extrema, arcs, and stroke. Browser-only `Path2D` may assist exact hit testing, but is not the serializable model or a substitute for testable math.

## SVG and persistence boundaries

Editable SVG v1 uses an allowlist: root SVG, groups, rect, circle/ellipse, line, polyline/polygon, and path. Convert circles to ellipses and line/poly shapes to canonical paths on import. Support only represented solid paints and declared static presentation attributes/transforms. Reject CSS stylesheets/classes/style attributes initially; inherited presentation attributes may be resolved deterministically. Reject scripts/events, processing instructions/DOCTYPE/entities, foreign namespaces, foreignObject, use/references, embedded/external images, external URLs, animation, gradients, patterns, clipping/masks, filters, text/fonts, nested SVG viewports, and unsupported attributes that could change appearance. Allow only narrowly specified inert metadata; no opaque nodes injected back into the live DOM.

Importer returns a typed diagnostic containing element/attribute and a safe location hint. Unsupported content requires a user choice: keep editing source externally, or explicitly open a sanitized raster copy when the existing raster validator accepts it. No automatic raster fallback and no promise of arbitrary SVG round-trip fidelity. The raster validator is an additional independent gate, not bypassed by the fallback choice.

Export traverses the validated scene in paint order with an allowlisted serializer and escaped text/attribute values. Generate SVG namespaces, viewBox, output dimensions, geometry, transforms, and presentation attributes. Serialize solid colors deterministically; drop editor IDs/locks unless a separately specified persistence format needs them. Never concatenate unvalidated path strings, raw CSS, or raw imported XML. Reimport supported output must yield equivalent geometry/style/tree, not identical original whitespace/comments/IDs.

An SVG export is a flattened current scene, not an operation history file. A native vector-session JSON format can preserve base plus operations, but its extension, picker filters, recovery UX, and project integration remain open. Do not save session JSON with an `.svg` name. Until that format is approved, saving SVG preserves the asset, not undo history across app restarts. Raster export materializes the validated SVG into an isolated decoder, then uses existing encoders and transparent/JPEG-background handling; never render arbitrary SVG in app DOM.

Security limits are required at parsing, validation, replay, and export. Proposed starting ceilings: 8 MiB SVG input, 10,000 nodes, tree depth 64, 100,000 total path segments, 5,000 operations, 256 children per batch, and 32 MiB serialized session. These are unmeasured defaults to benchmark and tune, not shipped guarantees. Reject before expensive work where possible; check cancellation in loops. Raster export must respect the chosen raster module's existing dimension/pixel limit, not vector viewBox size. No network fetches, hosted services, paid APIs, or new dependency is required by this ADR.

## Module boundaries

Paths below are proposed additions relative to `phase1/`; they do not exist in this patch.

| Module | Owns | Must not own |
| --- | --- | --- |
| `src/lib/imageedit/vector/types.ts`, `document.ts` | Scene/document types, JSON validation, immutable construction, schema dispatch | DOM, files, React |
| `vector/math.ts`, `path.ts`, `bounds.ts` | Matrix order/inverse, canonical path validation, geometry bounds | UI state, serialization of DOM objects |
| `vector/registry.ts`, `operations.ts`, `replay.ts` | Handler lifecycle, typed validators, deterministic atomic scene updates | Raster kernels, file access |
| `vector/svgImport.ts`, `svgExport.ts` | XML boundary, subset diagnostics, canonicalization, safe serializer | Mounting imported markup, network |
| `vector/hitTest.ts`, `vector/renderer.ts` | Selection math and generated-scene browser renderer adapter | Document/history ownership |
| `src/lib/imageedit/session/history.ts`, `session.ts` | Generic history and domain adapter contracts | Domain-specific geometry or filter params |
| `src/components/imageedit/vector/*` | Vector viewport, tools, shape/style/layers controls, keyboard/A11y | Hidden file writes or a second document model |
| `src/components/ImageEditorDialog.tsx` | Content-validated format routing, mode/session lifecycle, host/save/dirty boundary | Geometry algorithms, operation normalization |
| Existing `image-editor`, `image`, `imgedit` | Raster document/pipeline, transform and selection behavior | Vector operation execution |

Core geometry and replay tests must run without DOM. XML parsing may use an injected adapter returning a restricted parsed representation; browser `DOMParser` glue remains separately tested. Do not add a large SVG editor/parser library solely to make Node tests pass. No global registration side effects or extension SDK exposure in the first slice. Keep the existing shared operation import initially; extracting a common `OperationEnvelope` into a neutral module is optional follow-up after regression tests, not a prerequisite.

## Refactor and delivery sequence

Each step is a separate implementation branch with a handover. The central builder integrates; do not rebase unrelated waves into this ADR branch.

1. **Pin raster behavior.** Add pure history tests, gesture coalescing/cancel cases, stale-frame/session guards, and save-cancel/dirty expectations. Extract history/session lifecycle without changing raster operation order or filter/adjust semantics. Add confirmation to every destructive session exit.
2. **Build pure vector core.** Implement types/validation, matrix/path/bounds, registry, and replay with fixtures. No dialog integration yet. Add `src/lib/imageedit/vector/*.test.ts` and `src/lib/imageedit/session/*.test.ts` explicitly to `test:core`; use `node:test`/`node:assert/strict` through existing `tsx --test`.
3. **Add SVG boundary.** Implement subset importer/exporter and diagnostics; build an adversarial fixture corpus. Prove unsupported files stay intact and imports trigger no external fetches. Keep the raster loader separate.
4. **Integrate format-driven modes in the same editor.** Validated raster files route to the raster adapter; supported SVG routes to the vector adapter with generated SVG preview, selectable shapes, layers, and transform/style panels. Keep a PDF/layout adapter boundary without pretending PDF editing exists. Reuse host and dialog chrome; hide raster-only tools in vector mode, not disabled placeholder controls. Show only operations that work.
5. **Add path editing and copy save.** Point/handle editing, grouping with world-preservation checks, SVG save-as-copy, raster-export options and clear loss-of-vector warning. Register no unsupported export format. Audit native picker/save filters and one-use token behavior.
6. **Gate release on evidence.** Run core/typecheck/build checks and browser/native acceptance on target WebViews. Benchmark limits before widening them. Existing Windows/Mac/Linux raster behavior must remain intact. No stable designation without the owner's established test/release process.

If parallel work has modified the baseline dialog/registry, integrate core first and adapt session/UI against the builder's current tree. This ADR has no runtime merge conflict by design; examples are not an instruction to overwrite newer implementations.

## Acceptance tests for implementation

No executable tests are added or claimed to pass by this documentation change.

- Model: round-trip session JSON, deep immutability, bad numeric/schema/paint values, dangerous keys, duplicate IDs, cycles, unreachable/dangling nodes, depth/count budgets.
- Registry/replay: duplicate registration, cleanup ownership/rollback, exact versions, disabled dependencies, stable ID creation, cancellation, missing/locked targets, atomic batches, preserved input scenes on failure, deterministic repeated replay.
- Geometry: nested affine transforms and order, nonzero viewBox, inverse failures, negative scale/rotation, screen-pixel tolerances, strokes/fill rules/dashes, curve and arc bounds, relative/smooth path normalization, closed/multi-subpath paths.
- History/session: one commit per gesture, Escape/pointer-cancel, no-op exclusion, redo invalidation, 100-entry behavior, independent raster/vector snapshots, dirty close/open-other guards, cancelled/failed saves, stale import/render/export completion, disposal.
- SVG: supported subset visual equivalence, namespaces and entities, event attributes, URLs/refs, CSS/foreign elements, oversized/deep/malformed inputs, unsupported attribute diagnostics, escaped names, no fetches or active markup; no silent omission.
- Export/UI: vector save retains viewBox/matrices/compositing; raster dimensions/codec MIME/background behavior; shape-vs-overlay separation, z-order and hit testing; keyboard selection/move/delete, focus and ARIA; source bytes unchanged after copy save.
- Visual checks: inspect imported/exported fixture pixels at normal/high zoom and rotated/nested transforms. Inspect generated SVG against isolated-decoder output. Pure tests and DOM assertions alone do not prove appearance.

## Alternatives and tradeoffs

- **Reuse the raster handler directly:** rejected. Raster buffers erase topology and cannot support semantic shape edits or vector export.
- **Edit the imported SVG DOM:** rejected. It couples state/history to browser objects and makes active content and round-trip guarantees harder to control.
- **Adopt a full vector-editor library now:** deferred. It may help advanced tools later, but requires license, bundle size, security, serialization, accessibility, and Tauri-WebView review. No dependency approval is implied here.
- **Share only the operation envelope/lifecycle:** selected. Less abstraction now, clear typed domains, regression-friendly integration. Some registry code duplication is acceptable until generic extraction is justified by actual callers.

## Open decisions and unresolved work

- Confirm the editable SVG subset against representative owner files. Text, gradients, masks, clipping, filters, and external assets are intentionally unsupported in the proposed first slice, not UI placeholders.
- Decide native session file extension, recovery/last-session persistence, project asset linking, source-hash conflict handling, and whether history must survive restart. Current copy-save host alone does not provide these guarantees.
- Benchmark provisional size/count/depth/history budgets and define UI response-time targets on Windows, macOS, Linux, and the web fallback. No benchmark ran for this ADR.
- Decide parser implementation and supported path/transform grammar, color/length normalization, and XML adapter testing without adding an unreviewed heavy dependency. Complete the Paper.js license/runtime/bundle/robustness gate; no package is approved or installed by this ADR.
- Confirm exact group/ungroup compositing restrictions, selection/hit policy for singular nodes, and whether rectangular rounded corners need independent radius controls.
- Confirm UX for initially blank vector documents, unsupported imports, explicit raster fallback, dirty session exit, and web download status. Keep the same editor window with format-driven tools. PDF/layout document design and implementation remain outside this vector ADR; no new-project or PDF-editing flow is implemented here.
- Review native picker filters, export/session MIME handling, source-copy naming, and write-token lifecycle before wiring the UI. No Rust-host change is included here.
- Collaboration and extension registration are outside v1: local op ordering/revisions are not a distributed conflict-resolution design. Concurrent scene edits require a separate ADR and authority/review model.

## Evidence and handover

Repository evidence is the inspected checkout of `https://github.com/philppplik/somnia` at the full baseline hash above, specifically the local paths listed in the existing-code table. Architectural choices, limits, examples, and module names in this document are proposals, not external-spec compliance claims or shipped behavior. A supplied library-research handover informed the gated dependency/reference section; its unverified areas remain labeled. No independent external parser/license verification, paid API, implementation test run, push, PR, or CI trigger is part of this change.
