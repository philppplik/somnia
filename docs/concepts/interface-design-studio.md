# Interface Studio: UI systems, screens and prototypes

Status: concept for review, 2026-10-14. No development, dependency adoption, push or release is authorized by this document.

Baseline: `int/shell` at `315d1f23a061d07215bdc60d25d3d57d756cbaab`, cloned and head rechecked live. Upstream FigCraft: `bcedfeba1079829fd96c3b38077cfcc76e03bb09`, workspace version 0.5.1. Recheck before implementation. Paths below are relative to Somnia unless marked upstream.

## 1. Recommendation and studio boundaries

Add a separate **Interface** studio (proposed id `interface`) for screens, responsive layout, reusable components, variants, tokens, screen-flow prototypes and developer handoff. Investigate FigCraft's permissively licensed headless crates first, behind a Somnia-owned adapter. Keep the React shell, design system, file lifecycle, commands, policy and extension model. Do not embed its egui app, adopt its plugins/network services or copy Figma's proprietary code/assets.

The target workflow is component system -> screens -> test a flow -> reviewed export to Code, locally and without a paid service. No Figma parity, production-app generation or reliable `.fig` round-trip is promised.

| Studio | Owns | Boundary |
| --- | --- | --- |
| Design | Existing multi-artboard/page-layout workflow and `.somdesign` | Preserve the InDesign-like publishing direction; do not rename it Interface |
| Interface, proposed | UI frames, responsive systems, components, flows and handoff | Not print publishing or a production app runtime |
| Vector | SVG paths, nodes and detailed shape work | No second component library/prototype engine |
| Code | Source files, DOM, frameworks, preview and deployment | Not a lossless projection of arbitrary design documents |
| Animation, separately proposed | Timeline-based motion/compositing | Not required for simple UI transitions |

Philipp describes Design as InDesign-like. The inspected `phase1/src/lib/studios/design.ts` is narrower: artboards, rectangle/text tools, arrangement, palette and project/SVG export. Do not describe current implementation as full InDesign parity.

Place an icon from Vector into Interface via a versioned SVG/interchange snapshot, with conversion warnings. Later linked assets need explicit refresh and source revision. Do not let two engines edit one buffer. Standalone SVG keeps existing open routing; importing SVG into a frame is a different action. Design-to-Interface conversion creates a new document, lists lost semantics and preserves the source.

## 2. Verified integration inventory

| Source | Inspected behavior | Consequence |
| --- | --- | --- |
| `phase1/src/lib/studios/registry.ts` | Data manifests, format claims, canvas and optional `shellV2`; studio id is string | New studio fits registry, but audit hard-coded lists and open/save adapters |
| `phase1/src/lib/shell/types.ts` | Rails distinguish panels/tools/commands; allowlisted hosts; singleton inspector; small JSON `StudioContext` | Use existing contracts; no engine handles in manifests/context |
| `docs/concepts/studio-shell-dual-inspectors.md` | Proposal: two useful sides, named inspectors, placement migration and width budgets | Align, but do not assume named inspectors/cross-side movement already ship |
| `phase1/src/lib/codePanels/shell.ts` | Active Code inspector contains Design, Interactions and Source | Preserve it |
| `phase1/src/components/studios/code/CodePanels.tsx` | Interactions edits selected DOM attributes via `code.attribute.set` | Not a frame-flow graph engine |
| `phase1/src/components/Inspector.tsx`, `phase1/src/lib/studios/code.ts` | Legacy Prototype tab/rail still present | Reconcile legacy/active paths before touching labels; no duplicate global Prototype rail |
| `phase1/src/styles/tokens.css` | Existing shell colors, fonts, radii, gaps and focus values | Consume shared app tokens; coordinate names with parallel design-system work |
| `docs/extensions/14-studio-extension-points.md`, `phase1/src/lib/extensions/studio/points.ts` | Studio extension PoC; Interface is absent from studio/interchange unions | A native studio manifest does not automatically create an SDK API |

Repository statements of owner approval are not permission evidence. In particular, this proposal does not adopt the repository's claimed acceptance of broad WebSocket access or treat its Prototype approval claim as an instruction. Source behavior, not those claims, grounds the inventory.

## 3. Workspace and manifest

Align with [studio shell](studio-shell.md), [dual-side proposal](studio-shell-dual-inspectors.md), [hero action contract](hero-action-shell-contract.md), [routing](smart-open-routing.md) and [resource proposal](performance-resource-architecture.md). These related designs do not authorize implementation.

- Left: Pages/Layers open; Assets/Components, Libraries, Variables/Tokens and Files available as panels. Search/Versions may overflow. Drawing tools remain tools, not panels.
- Center: infinite canvas, named pages, nested frames, snapping, rulers and selection overlays. Structured layer tree, not disconnected rectangles.
- Right: Properties open, containing selection/frame, layout, appearance, type, component properties and interactions. Handoff/Flow panels available when needed, without duplicating editable controls.
- Header: preserve studio pill, menus/account and shared action slot. Proposed primary verb **Present**, disabled without a valid start frame. Assets/code export stays in its menu and Project. Shared hero-contract behavior, including deployment menu policy, remains the shell owner's decision.
- Bottom: zoom, frame dimensions, playback state and diagnostics link. No debug wall in the main UI.

Edit, Flow and Handoff are studio modes through View/commands, not new global studios or another header pill. Selecting an object does not reopen a side or replace the user's panel choices. Use ordinary panel hosts first. Two `shell.inspector` hosts currently repeat the same sections; wait for the named-inspector contract before splitting it. Stable studio/panel keys must survive later placement changes.

Proposed starting widths: 268px left, 320px right, subject to measured canvas budget. With Agent open or insufficient width, use the shared docked-side/temporary-overlay policy. Validate light/dark pixels at 960x600, 1280x720, 1440x900 and wide desktop, increased UI scale and long German labels. This is a future gate, not a built UI. Use shared controls/icons, five-locale labels, visible focus, keyboard alternatives for drags and thin visible scrollbars. Inventory shortcuts before assigning them.

## 4. Document, persistence and transactions

One Interface session/document is authoritative. Proposed entities:

- Document -> pages -> ordered node trees with stable ids, parent relations and explicit revisions.
- Frame, group, text, shape/path, image, component master/set and instance nodes.
- Semantic layout inputs separate from computed bounds/caches: free/row/column, axis sizing, min/max, padding, gap, alignment, constraints, clipping/scroll and explicitly absolute-positioned children.
- Typed fills/strokes/effects, component properties/overrides, variables/modes/token refs, prototype edges/flow starts, annotations/readiness and export settings.
- Content-hashed assets with provenance/license metadata; font references and missing-font diagnostics. Embed fonts only with redistribution permission.

Layout cannot replace Hug/Fill intent with computed pixels. A gesture previews changes and commits one undo transaction; cancel restores the prior revision. Master edits plus derived instance updates form one transaction. Save a coherent revision atomically, report failures honestly and preserve recovery data.

Propose an Interface document kind within Somnia's project/container architecture. A standalone `.somui` extension is a naming proposal requiring format-owner review, not a current format claim. Do not hijack `.somdesign`, `.svg`, `.fig` or `.somnia`. Version the schema, preserve safe optional unknown data, reject incompatible required versions, and prove same-version lossless reopen. Reject corrupt/cyclic graphs, invalid refs, oversized archives and traversal before replacing a working document. Layout preferences, selection and render caches are not document content.

## 5. Frames and auto layout

Start with nested frames, clipping/constraints and row/column layout. Each axis supports Fixed (bounded explicit size), Hug (intrinsic measured content plus padding), and Fill (available parent space subject to bounds/siblings). Support reorder, per-edge padding, gap handles, alignment, mixed selection values and an explicit absolute-child escape hatch. Reparent with an insertion preview and correct coordinate conversion.

Resolve parent-Hug/child-Fill cycles with a documented deterministic rule and diagnostic, never an endless solve. Text measurement/font fallback must agree across layout, render, hit testing and export. Later add wrap, grid tracks/spans and responsive viewport previews over the same document tree. Visual layout grids and algorithmic grid layout are separate features.

Benchmark FigCraft layout first. Taffy is the fallback for CSS-oriented layout, not a complete editor or a second solver to run in parallel. Select one authoritative interpretation after text, constraints and round-trip fixtures. Export reports mismatches instead of claiming every design behavior maps exactly to CSS.

## 6. Components, variants and local libraries

First: masters, instances, overrides, source navigation, explicit detach and reset. Master edits preserve compatible overrides. Stable property/descendant ids, not labels or child indexes, define override targets; deleted targets create visible orphan warnings, not edits to another node.

Next: typed variant axes, text/boolean/swap properties, nested instances and variant selection. Prevent component-reference cycles and cap expansion. Variant switching preserves matching overrides and reports conflicts. Local library snapshots have immutable versions/source metadata; updates show a diff and conflict report before acceptance. No account or hidden remote fetch.

Code snippets/components are not automatically editable Interface components. A later binding can map a design component to a reviewed code import/prop schema. Do not execute arbitrary library code to render a design.

## 7. Design tokens and the parallel Somnia design system

Separate app chrome tokens from document design values. A client's imported `--accent` must not restyle Somnia. Interface consumes shared controls, icons, spacing, type, radii, motion and focus primitives; it must not invent a competing shell theme.

Propose a versioned adapter to DTCG 2025.10 [S5], a Community Group report, not a W3C standard. Start with supported color, dimension and number tokens; add typography/effect composites only after tested conversion. Internal boolean/string variables are not automatically standard DTCG token types. Resolve aliases with cycle/type/missing-ref diagnostics; preserve safe namespaced extensions without executing them. Import is transactional with conflict review.

Light/Dark modes belong to explicit variable collections and frame/document choices. The format module alone is not a complete modes interchange convention: document the chosen mapping/extension and export explicit mode bundles/CSS selectors with loss reports.

The parallel design-system owner defines the canonical token/component package, versioning and export map. Interface consumes that package through an adapter, rather than independently renaming it. Any starter Somnia UI kit should derive from the canonical package and pass token/component parity tests. Keep app-private UI metadata out of user-facing exports; third-party libraries retain their own licenses.

## 8. Prototypes and existing Inspector interactions

Code Interactions edits DOM link/media/form attributes. Keep it in the existing Code Inspector, not a replacement screen graph. Interface Interactions edits graph triggers/actions/transitions for the selected node; Flow mode shows connections and flow starts. No separate global Prototype studio or duplicate Prototype rail is needed.

Share suitable labels/basic transition value types only. A DOM `href` is not automatically a flow edge. A future explicit translator may map simple navigation to anchors/routes and list unsupported actions; it must not silently rewrite scripts/routes.

First player: click/tap plus keyboard activation, navigate/back, overlays/close, scroll-to, instant/dissolve. Use an isolated snapshot and runtime state; playing/restart never dirties source or changes authoring undo. Include focus order, Escape/back and reduced motion. External URLs require real user gesture, allowed schemes and outbound policy, never automatic opening on import.

Later: hover/press, delayed actions with execution budgets, interactive component states, variables/conditions and matched-layer transitions by stable identity with visible fallback. No arbitrary JS/eval, background network or simulated production authorization/payment logic. Full timeline motion belongs to Animation; importing a rendered animation is not shared live editing.

## 9. Handoff and export to Code

Handoff is a read-only explicit revision: measurements, spacing/type, resolved token refs, component props, annotations/assets and a manually set readiness flag. Readiness is not proof of accessibility or production completeness.

Start with SVG/PNG assets, token JSON/CSS and supported-subset HTML/CSS. Then React/TSX skeletons with typed variant props and reviewed component bindings. Upstream SwiftUI/Compose are candidates, not v1 promises. Generated code is a starting point, not a production app or guaranteed pixel match.

1. Freeze revision, frames, variable modes, target and font/asset policy.
2. Generate deterministic intermediate tree and source-node sidecar map; escape text/identifiers/URLs. No hidden scripts/trackers or remotely loaded dependencies.
3. Preflight unsupported effects/blends, font substitutions, absolute-layout fallbacks, flattening/clipping, omitted prototype behaviors and required asset/font notices.
4. Preview files/diffs; choose a new destination or explicitly review overwrites. Host owns safe paths, file writes and recovery, never the exporter.
5. After successful export offer Open generated project in Code through existing router, preserving the design source and recording generator/source revisions.

No automatic installs/build execution or paid services. Follow framework policy for later execution. No arbitrary code-to-design round-trip. Regeneration produces new output or reviewed diffs, never silent overwrites of user code; AST merging is separate research. Visual similarity does not prove semantic HTML, keyboard access or responsive quality.

## 10. Reuse and license assessment

ArtCraft advertises layout, components, variables, prototypes and handoff [S1-S2]. Upstream calls FigCraft early alpha and warns `.fig` import is best effort and not checked against real Figma documents [S3]. Inspected modules establish code presence, not correctness, performance or tested portability.

| Candidate | Verified evidence | Proposed treatment |
| --- | --- | --- |
| FigCraft `doc`, `geom`, `color`, `layout` | Separate manifests, node/prototype model and layout functions | First extraction spike; MIT OR Apache-2.0 source, select MIT and keep notices/pinned SHA |
| FigCraft `engine` | Session/command registry, components, variables, prototype runtime and codegen; codegen itself says starting point, not pixel-exact | Audited allowlisted adapter only; full dependency graph includes plugin/collab and online/library-related commands |
| FigCraft render/text/pathops/format/SVG | Separate crates; tiny-skia renderer; format handles `.figcraft` and `.fig` parsing | Evaluate coherent text/render/hit-test path; `.figcraft` bridge after validation; no `.fig` fidelity/write promise |
| FigCraft egui/eframe app | Browser target depends on `figcraft-ui-egui` | Do not embed; duplicates shell, shortcuts and lifecycle. Existing WASM app is not a headless React bridge |
| FigCraft plugins/MCP/collaboration | Separate capabilities/dependencies | Do not activate wholesale; no inherited Somnia permission or Yjs compatibility |
| Taffy [S6] | MIT source; Rust layout with measure callbacks | Fallback solver, not an editor/renderer/prototype engine |
| ArtCraft branding [S4] | NOTICE and brand terms explicitly exclude marks from source license | Exclude from Somnia; use own identity/icons. Plain-text attribution is different from adopting marks |
| Fonts/examples/assets [S4] | Attribution lists individual asset/font terms | Prefer original fixtures; inspect per-file terms and build inputs before inclusion |

MIT permits use/copy/modify/distribute with its notice condition. It does not grant trademarks or rights to third-party material merely mentioned by a project. Preserve selected upstream and dependency notices, audit the locked transitive tree and per-file exceptions, and omit anything without clear permission. Apache is an alternative with its own obligations, not a requirement to dual-license Somnia. This is technical guidance, not a legal warranty.

Prefer a pinned dependency or narrowly vendored subtree with provenance manifest (SHA/path/license choice/modifications/update process), not a wholesale repository copy. License scan before distribution. Website screenshots or release fonts are not blanket reuse material. Neither upstream's clean-room claim nor its license proves independent Figma IP clearance; keep Somnia UI independently designed and interchange lawful/documented.

## 11. Adapter, resource, AI and extension boundaries

Propose a Somnia-owned Interface session adapter for snapshots, selection queries, typed operations, undo/redo, layout/render and export preview. Names are design placeholders, not current APIs. Shell context stays small: document/revision, dirty/read-only/busy, selection ids/type/count, active tool/mode and readiness flags. Panels query bounded details; stale results are rejected by session/revision.

Spike worker-hosted WASM and only use a narrow Tauri equivalent if needed. Upstream web target does not prove a drop-in worker package. Prove serialization, text metrics/fonts, panic/cancel behavior and transfer costs. Keep heavy work off the UI thread, virtualize layers, cull canvas, cache by revision, cancel stale jobs and lazy-load only when opened. Set budgets from measurements, not marketing.

Only audited content commands cross the adapter. Do not accept arbitrary upstream command ids/JSON from files, extensions, AI or MCP. Open/save, network, URLs, plugins and exports remain host-owned. Imported metadata, annotations and expressions are untrusted data. AI uses typed preview/accept/undo transactions, with no new provider disclosure permission.

Single-user/local-first is initial scope. Do not graft FigCraft collaboration onto Somnia as if it were Yjs-compatible. Later collaboration must choose one authoritative model, revision/conflict rules and per-user undo; no dual broadcast or competing undo stacks.

Ship as a built-in studio. SDK v1 does not automatically permit Interface data access. The studio PoC lacks its id/interchange and needs reviewed host/security wiring before use. Future proposal: versioned `interface-scene` model, selected-node inspector sections, converters, token validators/exporters and optional library panels. Host owns slots/count/order/context/file dialogs; no replacement canvas or tool rails.

Exporters receive bounded immutable selected snapshots/assets; importers return a validated model. Proposed operations such as create/reparent node, set layout/token binding and set instance property are bounded and transactional, not current SDK methods. Explicit version/permission rejection; no raw stores, sessions, filesystem, network or arbitrary engine commands. Revocation stops reads/writes/unmounts contributions. Do not relax CSP or claim extension worker isolation is solved to ship the studio. FigCraft plugins are not Somnia SDK packages.

## 12. Phases and gates

No schedule promise; phase completion requires review. Existing Somnia toolchain is Rust 1.95.0, matching upstream's declared Rust 1.95 requirement, but no build compatibility was tested. $0 scope excludes paid services/backends/signing. GitHub policy says public standard-runner usage is free, larger runners billed [S8]; recheck visibility and storage/cache/artifact costs, use short retention and budget controls.

| Phase | Deliverable | Gate before expansion |
| --- | --- | --- |
| 0. Extraction/decision spike | Naming/format ownership, license inventory, FigCraft core vs Taffy fallback, shared token adapter | Minimal native/WASM tests; measure bridge, text/layout/render consistency; no integration/performance claim before evidence |
| 1. Local editor | Manifest/blank start, pages/frames/text/shapes/images, row/column layout, save/recovery and asset export | Responsive card survives text/resize/reparent/save/reopen/undo; cancelled gesture/failed save loses nothing; studio ownership remains stable |
| 2. UI system | Masters/instances/overrides, variants, token aliases/modes, local snapshots; wrap/grid after solver tests | Master update across light/dark screens and variant switch preserve compatible overrides; conflicts visible and undoable |
| 3. Flows | Connections/start frames, isolated player, keyboard/reduced motion; then interactive components | Three-screen flow runs without mutating source; invalid actions/targets and fallback transitions visible |
| 4. Handoff/export | Revision/readiness/annotations, tokens/assets/HTML/CSS; React after mapping tests | Deterministic generated fixtures render at multiple widths with loss report, safe output and reviewed file diffs; no silent overwrite |
| 5. Interop/SDK | Audited `.figcraft` bridge, best-effort `.fig` research, versioned extension contribution | Corpus-based loss reports, malicious importer/extension tests, no hidden network/unrelated data access; collaboration separately designed |

Acceptance tests:

- Model/property: stable ids, tree/component/token cycles, finite geometry, nested Hug/Fill, bounds, wrap/grid, bidirectional text and font fallback.
- Transactions: cancel, one-step undo, instance propagation, failed batch rollback, save during computation and crash recovery.
- Input/security: bounded expansion/count/depth, traversal, corrupt images/fonts, bad references, prototype expression/action budgets, forbidden URLs and version mismatch.
- Shell/SDK: host/command validation, no-document/read-only/busy, persistence, no duplicate controls, rapid document switch, permission revoke.
- Export: escaping, semantic tags/focus order, props/tokens/modes, missing assets/fonts, sidecar map, deterministic output and overwrite refusal.
- Pixels: editor/player/generated output at target sizes and themes, typography/clipping/spacing/overlays; inspect images rather than accept generated goldens blindly.
- Resources: small/large and 1k/10k-node stress fixtures, memory/layout latency, cancellation and idle behavior. Supported limits follow actual measurements.

No builds, application tests, visual prototypes, pixel inspection or benchmarks were performed for this documentation patch. Source inspection is not runtime validation.

## 13. Review choices

Recommended: separate Interface studio, preserve Design/Vector/Code, headless FigCraft spike first, shared shell/design-system adapter, single-user/local-first and no automatic code round-trip. Confirm final label/format with shell owner before development. No new spending/network permission is implied.

Technical questions for evidence-based spike results: extraction depth, authoritative layout/text/render path, container adapter, mode interchange and code binding schema. Do not ask the user to choose Rust libraries without that evidence.

Deferred: Figma account/service integration, full `.fig` fidelity, cloud teams, arbitrary third-party plugins, production app logic, universal code import, live shared Animation editing and a second collaboration service.

## Sources and freshness

Checked 2026-10-14. Evidence types: vendor documentation, source/license records, community specification. No independent reliability/performance study in this review; upstream screenshots/marketing are not tests.

- S1: ArtCraft directory, lineup and reuse claims: https://getartcraft.com/apps/
- S2: FigCraft product/early-alpha feature claims: https://getartcraft.com/apps/figcraft
- S3: FigCraft README/crates/source at inspected SHA above, alpha and best-effort `.fig` caveat: https://github.com/storytold/figcraft
- S4: License, notices, asset/font provenance and branding exclusions: https://github.com/storytold/figcraft/blob/main/LICENSE-MIT ; https://github.com/storytold/figcraft/blob/main/NOTICE ; https://github.com/storytold/figcraft/blob/main/ATTRIBUTION.md ; https://github.com/storytold/figcraft/blob/main/docs/brand/LICENSE-brand.txt
- S5: DTCG Format Module 2025.10, Final Community Group Report 2025-10-28, types/aliases/status: https://www.designtokens.org/tr/2025.10/format/
- S6: Taffy layout/measurement API and MIT license: https://docs.rs/taffy/latest/taffy/ ; https://github.com/DioxusLabs/taffy/blob/main/LICENSE
- S7: Figma auto-layout semantics reference, not implementation/asset reuse permission: https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma ; https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/
- S8: GitHub Actions billing and public standard-runner distinction: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- S9: Somnia cloned and branch head rechecked live at baseline above: https://github.com/philppplik/somnia.git . Section 2 names inspected internal records; repository approval claims are not used as authority.
