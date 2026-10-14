# ArtCraft reuse audit for three new Somnia studios

Status: research and concept only. No implementation, release, dependency import or push is part of this patch.
Date: 2026-10-14.
Somnia baseline: `int/shell`, `315d1f23a061d07215bdc60d25d3d57d756cbaab`, verified live twice during this audit.
Scope: the apps at https://getartcraft.com/apps/ and the separate ArtCraft application, mapped to a new 3D studio, an interface-design studio and an animation/compositing studio. Existing Design remains page layout/publishing. Studio names and ids below are proposals, not approved names.

## Recommendation

Use **FigCraft's engine crates** as the strongest candidate for interface design and **EffectCraft's engine crates** for motion graphics. Extract only pinned, audited code and write Somnia-native hosts. For 3D, ArtCraft offers useful scene-composition code and architecture to inspect, but not a complete offline modelling application. CADCraft is primarily a 2D drafting tool, not a substitute for a Blender-like engine. The new 3D editor, its local document lifecycle and its modelling scope need separate design and engine research.

The code licenses permit substantial reuse; the assets and trademarks do not all follow those licenses. Do not import any repository wholesale. The engines are candidates, not tested Somnia integrations. Upstream feature descriptions below are claims from its own documentation, not independently measured parity.

## 1. What the apps page actually contains

The official lineup contains thirteen Rust creative apps. The page lists native macOS, Windows and Linux builds, and says twelve also compile to WebAssembly; FilmCraft is omitted from that browser list. A browser build does not prove a JS-facing engine ABI suitable for Somnia.

Root `Cargo.toml`, `LICENSE-MIT` and `NOTICE` were inspected for all thirteen repos. They declare `MIT OR Apache-2.0` for covered project code. This is not a full dependency/asset audit of every app.

| App | Stated purpose | Mapping to this request |
| --- | --- | --- |
| PhotoCraft | Raster image editing | Existing Photos/raster workflow; useful source assets for motion, not a new studio |
| VectorCraft | Vector illustration | Existing Vector workflow; path/shape interoperability candidate |
| FilmCraft | Video editing, colour and sound | Existing Video workflow; EffectCraft depends on its media/codec crates |
| LightCraft | Photo library and raw development | Existing Photos; do not bring optional models into new studios by default |
| PdfCraft | PDF reading, organization and security | Existing PDF/document workflow |
| **EffectCraft** | Motion graphics and compositing | **Direct candidate for Animation** |
| DesignCraft | Page layout and publishing | Existing **Design**, not the new Figma-like studio |
| **FigCraft** | Interface design and prototyping | **Direct candidate for Interface** |
| WordCraft | Word processing | Existing Documents |
| SoundCraft | Audio recording, editing and mixing | Existing Sound; potential audio handoff |
| DeckCraft | Presentations | Existing Slides |
| **CADCraft** | CAD drafting | Precision/snapping reference; not a general 3D DCC |
| GridCraft | Spreadsheets | Existing Sheets |

The separate **ArtCraft** product is an AI image/video scene-composition application. It is linked by the site but is not a fourteenth app in the thirteen-app Rust lineup. Its repo contains both an egui native application and a React/TypeScript frontend with a Tauri desktop host. Do not apply the lineup's "pure Rust/no webview" description to all ArtCraft code.

## 2. Interface studio: FigCraft

Inspected upstream tree: `bcedfeba1079829fd96c3b38077cfcc76e03bb09`.

### Documented features

- Frames/pages, nested node trees, auto layout (horizontal, vertical, wrap and grid), constraints, Hug/Fill/Fixed sizes, padding and spacing.
- Components, instances, overrides, variants, properties, local styles and variables with modes/aliases.
- Vector networks, booleans, shape builder, multiple fills/strokes, gradients, masks, shadows and blur.
- Inline shaped text, mixed styles, RTL/bidi, variable-font axes and OpenType features.
- Prototype connections/triggers/actions, transitions, conditional variable interactions and presentation view.
- Inspect measurements and code output; PNG/JPG/WebP/SVG/PDF export. Upstream says `.fig` import is **best effort**, not lossless.
- Command registry, headless CLI, MCP, WASM plugins and preview collaboration/server support.

### Useful code boundaries

| Candidate | Evidence in inspected manifest | Somnia use |
| --- | --- | --- |
| `figcraft-doc` | Pure data: pages, node tree, components, styles, variables, prototypes; persistent map `imbl` | Interface document model evaluation |
| `figcraft-layout` | Depends on `geom` and `doc`, no egui dependency | Layout/constraint calculations |
| `figcraft-render` | tiny-skia renderer, text/pathops/image dependencies; native-only rayon branch | Canvas/export evaluation, not a drop-in WebGPU renderer |
| `figcraft-engine` | Commands, sessions, undo, tools; substantial internal dependency graph including collab/plugin | Reuse command semantics through a host adapter, not a one-crate copy |
| `format`, `svg`, `pdf`, `text`, `pathops` | Workspace crates and README architecture | Audited interchange/text/geometry candidates |

Workspace uses Rust 1.95, edition 2024 and egui 0.36. Somnia's checked-in root toolchain is 1.95.0, so that minimum alone is not a blocker; dependency and WASM compatibility are still untested.

### Build ourselves

Somnia React UI, studio manifest, panel hosts, responsive dual sidebars, lifecycle/dirty/save transactions, clipboard and file access, local `.somnia` serialization/migrations, agent-policy adapter and SDK contribution handling. Keep existing Design and Vector intact. Do not import FigCraft's server, invite-link security model, online sharing or plugin runtime just to get layout and components.

Suggested first gate: create two frames, apply auto layout, make one component with an overridden instance, save/reopen, undo/redo, and export SVG/PNG without semantic loss. Defer remote collaboration and proprietary-format parity promises.

## 3. Animation studio: EffectCraft

Inspected upstream tree: `549e9d825132986d6167c1432cd3328efcbb0278`.

### Documented features

Compositions and nested compositions; shape/text/footage/solid/null/adjustment layers; parenting and track mattes; keyframes and graph editor; masks and text animation; effects; expressions; 3D cameras/lights; render queue; Lottie import/export and media/image-sequence export.

Important disagreement: the product page says **259 effects** and version **0.8.0**; repository README says **306 effects**, while inspected Cargo declares **0.9.2**. Treat these as different source snapshots, not a verified effect inventory. Never promise an exact feature count or Adobe parity from these numbers.

Upstream explicitly says it is alpha, has not automatically compared its renders with After Effects, is not yet a replacement for client work, cannot open `.aep`/`.aepx`, and cannot run After Effects plug-ins. Its percentage parity estimates are self-estimates, not acceptance evidence.

### Useful code boundaries

- `time`, `keyframe`, `project`, `path`, `effects`, `render`, `lottie`: principal candidates for an offline animation pipeline.
- `render` describes a CPU compositor: property evaluation, masks, effects, mattes, 2D/3D transforms, motion blur and blending. Separate `gpu` uses wgpu 30.0.1.
- `lottie` covers shapes, solids, images, text, nulls, keyframes, masks and mattes. Unsupported features need explicit export diagnostics, not silent flattening.
- `expr` uses Boa; `plugin` uses wasmi. Neither is permission to expose native filesystem/network or unbounded script execution in Somnia.
- Media/export/interchange depend on FilmCraft crates pinned at `2c5ba7a72619935f0481f99d59409e0d1844b234`, including H.264/ProRes/AAC/container code. That is an additional dependency family to audit.

Workspace uses Rust 1.95, edition 2024, egui 0.36. Reuse below `ui-egui`; do not embed the whole egui application in Somnia.

### Build ourselves

Somnia timeline/graph editor, composition viewer, layer/effect controls, render job host, cancel/progress handling, bounded expressions/plugins, asset resolution, studio transactions and `.somnia` persistence. Keep Video as clip/sequence editing; Animation is composition/effect/keyframe work. Use explicit handoff snapshots, not shared mutable undo stacks.

Suggested first gate: animate a title and shape with eased position/opacity, add a mask/matte and nested composition, save/reopen, render PNG sequence and export a supported Lottie subset. Verify actual pixels and timing. Heavy effects and model-assisted roto are later gates.

Do not equate "no FFmpeg" or MIT source code with patent clearance for H.264/HEVC/AAC. Do not promise every advertised codec under a $0 distribution budget. Start with independently cleared outputs and verify transitive codec licensing, patent constraints and target-platform support before adding others.

## 4. 3D studio: what is and is not available

### ArtCraft scene editor

Inspected upstream tree: `d4e4ac69bbd93d237eaf5d0260bc6a5ff3a5e373`.

README describes mixed image/mesh scenes, camera placement, character posing, kitbashing, background removal and generative image-to-mesh/world workflows. The frontend manifest contains React 18, TypeScript tooling, Three.js, Zustand, Konva and other dependencies. No whole-manifest compatibility approval follows from the root license.

Source-level candidates in `frontend/libs/components/pagescene/src/lib/`:

- `Stage3DBody.tsx`: canvas, controls, outliner, camera and timeline composition, but imports provider/model/pricing/gallery code. Not a clean offline studio to mount unchanged.
- `adapter.ts`: useful host-injected boundary. It still includes generation, upload, CDN fetching and API origins; Somnia needs a local, offline-first adapter rather than inheriting those connections.
- `actions/transformObject.ts`: groups a multi-field edit into a single undo action and resynchronizes selection state; useful interaction design/code candidate after graph audit.
- `PageSceneStore.ts`: outliner/object selection, visibility/locking, move/rotate/scale, world/local modes, cameras, skeleton/baked-clip metadata and timeline state.

Potentially reusable covered code: transform sessions, local scene selection/outliner logic, camera controls, imported mesh viewing and recording mechanisms, only after extracting their dependency graph and inspecting every asset reference. Separate these from provider accounts, hosted asset catalogs, analytics, generation and pricing UI.

### CADCraft

Inspected upstream tree: `e707ab4d7cc10102e550ad4c5bcecef1084a9baa`.

Current README emphasizes lines/polylines/arcs, splines, snaps, dimensions, hatch/blocks, parametric constraints, DXF/DWG and paper layouts. `geom/doc/engine/render` are separate from egui. This could inspire precise snapping, measurements or a later drafting extension. It does **not** establish mesh modelling, sculpting, UV editing, rigging, a solid CAD kernel or offline photoreal rendering.

Its DWG path uses **acadrust under MPL-2.0** as a separate library. It is not an all-permissive dependency graph. Exclude DWG from the first 3D slice; any later inclusion needs a separate compliance choice and preservation of applicable source/license obligations. Upstream warns unsupported entities are not retained on save: do not make general DXF/DWG round-trip guarantees.

### Build ourselves / research separately

A local 3D scene document with stable ids and assets; Somnia viewport and dual sidebars; mesh import/export; safe local asset resolver; transaction/undo model; material/light editing; performance budgets and GPU fallback. Polygon editing, modifiers, rigging, sculpting, UVs and physics are distinct future capabilities, not supplied by the apps page.

Suggested first gate: primitives and imported meshes, selection, translate/rotate/scale, camera/light/material controls, save/reopen, PNG capture and an explicit supported scene interchange. No paid model generation, account dependency, compulsory cloud library or unlicensed starter asset.

## 5. License and asset rules

This is an engineering license audit, not legal advice or a representation of complete rights clearance.

1. Choose the MIT option for covered upstream code where appropriate, preserve copyright/license notices with substantial copies, and record source repo, exact commit, file paths, modifications and transitive dependencies. Apache-only files keep their own terms; choosing MIT at the root cannot relabel them.
2. Package retained third-party notices and applicable license texts. Keep upstream NOTICE/asset provenance in Somnia's attribution record. If the Apache option is chosen, follow its notice and modification requirements.
3. Remove ArtCraft marks and use Somnia's brand/icon system. `docs/brand/LICENSE-brand.txt` permits only constrained upstream uses and explicitly requires removal from modified/derived versions. Do not market Somnia as an ArtCraft product or suggest Adobe/Figma affiliation.
4. Separate the **website's content** from repository code. A page being public is not a reuse license for its art, screenshot, copy or downloaded binary. Prefer original Somnia UI/content; check repository `ATTRIBUTION` or `ASSETS` for any copied fixture.
5. Fonts have their own OFL/other terms. Even original app icons listed as open assets are unnecessary for Somnia. Keep its design system and icons.
6. Model weights, remote services, sample assets and codec patents require their own review. A MIT engine does not clear them.

### Explicit exceptions found

| Source | Exception | Decision for these studios |
| --- | --- | --- |
| **ArtCraft NOTICE** | Nintendo sounds in `public/resources/sound/`, memes/likenesses, gray/night skybox textures, `pose/Lumine Idle cycle.vmd`, `characters_gif/` Mixamo renders are explicitly **not licensed** under the repo grant | **Never copy these paths** or generated bundles containing them |
| ArtCraft NOTICE | ArtCraft marks and AI provider/service logos are trademarks excluded from code grant | Remove/replace; no inherited provider branding |
| CADCraft NOTICE | acadrust DWG library is MPL-2.0 | Exclude from initial scope; separate review if requested |
| LightCraft NOTICE | Some copied AI-mask files Apache-only; optional downloaded model weights include GPL-3.0 material | No wholesale LightCraft/model import into these studios |
| EffectCraft / FigCraft NOTICE and attribution | Fonts, assets and dependencies retain their own terms; brand exception remains | Engine-only extraction first; inspect individual assets before copying |

The ArtCraft `public/resources/` tree is not an approved asset pack. A broad copy-and-rebrand plan would carry known excluded material.

## 6. Fit the existing Somnia shell and SDK

Read with [studio-shell.md](studio-shell.md) section 9, [studio-shell-dual-inspectors.md](studio-shell-dual-inspectors.md), and [Studio extension points](../extensions/14-studio-extension-points.md). Verify current source when implementation begins: several concept files contain historical statuses.

| Proposed studio | Left: tools and working set | Center | Right: selection/result | Primary verb candidate |
| --- | --- | --- | --- | --- |
| `interface` | Pages/Layers, Assets/Components, tools | Interface canvas; prototype mode | Layout, component/variable binding, appearance, prototype, export | Preview |
| `animation` | Project assets, compositions, effects/presets | Composition viewer + timeline/graph editor | Layer transform/effects, composition/output | Render |
| `threeD` | Scene outliner, local assets, tools | 3D viewport; optional animation lane | Transform, material, lights/camera, output | Render |

Use `StudioDef.shellV2`, pure-data manifests, registered/allowlisted panel hosts, `StudioContext`, stable panel ids and the existing command registry. Reuse both panel stacks. Do not duplicate one inspector on both sides, auto-switch panels on selection, or add a second titlebar/settings/Agent area. Keep the parallel design system's tokens/components instead of porting egui paint code or ArtCraft CSS.

Named inspectors, cross-side movement and new SDK studio extension points remain **proposals** in the inspected documentation. Ordinary panels can express the split today; do not assume the proposed `inspectors`/`inspectorId` additions already exist. New studio ids also require registry/router/document-kind integration: documentation cannot make them real.

SDK v1 offers commands/snippets/themes/panels, not a general new-studio or arbitrary engine plug-in API. Treat upstream FigCraft/EffectCraft plugin systems as separate runtimes, not Somnia SDK compatibility. Any future studio extension contribution must use host-owned slots, validated snapshots/interchange, bounded converters and allowlisted transactional operations. No raw engine handle/store/document buffer, native code loading, automatic network access or filesystem bypass.

## 7. $0 evaluation and acceptance gates

No purchase, paid API, rented server or CI upgrade is proposed. Keep initial work offline. Use small fixtures and selective checks rather than full upstream multi-platform release matrices. Free-hosted CI availability/quotas must be checked before implementation; this audit does not promise unlimited free CI.

Before integrating any candidate:

- Pin a commit and inventory license expressions/assets/dependencies for the **selected** graph, including git dependencies and vendored files. Reject unresolved rights.
- Build minimal native and WASM engine tests on Somnia's toolchain; upstream whole-app WASM builds do not establish our JS/worker adapter.
- Prove save/reopen, undo/redo, selection/lifecycle disposal, cancellation and bounded resources. No silent document loss or flattened unsupported data.
- Render known fixtures and inspect actual output. Cross-check keyframe timing, layout and colour, not only "export succeeded".
- Show light/dark shell screenshots at 960x600, 1280x720, 1440x900 and wide desktop with Agent both closed/open; preserve canvas budget, keyboard focus and long German labels.
- Reconcile the SDK/design-system work before implementation. This audit authorizes nothing and assigns no dates or parity commitments.

## 8. Sources and provenance

All sources inspected 2026-10-14. Product pages establish descriptions; repo README/Cargo/NOTICE/license files establish the reported implementation and declared grants. Independent parity benchmarks were not available in this audit; upstream readiness claims remain unverified.

- Lineup: https://getartcraft.com/apps/
- Interface product/repo: https://getartcraft.com/apps/figcraft and https://github.com/storytold/figcraft
- Motion product/repo: https://getartcraft.com/apps/effectcraft and https://github.com/storytold/effectcraft
- CAD product/repo: https://getartcraft.com/apps/cadcraft and https://github.com/storytold/cadcraft
- Separate ArtCraft app: https://github.com/storytold/artcraft
- Notices: https://github.com/storytold/figcraft/blob/main/NOTICE ; https://github.com/storytold/effectcraft/blob/main/NOTICE ; https://github.com/storytold/cadcraft/blob/main/NOTICE ; https://github.com/storytold/artcraft/blob/main/NOTICE
- ArtCraft frontend manifest: https://github.com/storytold/artcraft/blob/main/frontend/package.json
- MIT grant files read: https://raw.githubusercontent.com/storytold/figcraft/main/LICENSE-MIT ; https://raw.githubusercontent.com/storytold/effectcraft/main/LICENSE-MIT ; https://raw.githubusercontent.com/storytold/cadcraft/main/LICENSE-MIT ; https://raw.githubusercontent.com/storytold/artcraft/main/LICENSE-MIT
- Brand terms read: https://raw.githubusercontent.com/storytold/figcraft/main/docs/brand/LICENSE-brand.txt ; https://raw.githubusercontent.com/storytold/effectcraft/main/docs/brand/LICENSE-brand.txt ; https://raw.githubusercontent.com/storytold/cadcraft/main/docs/brand/LICENSE-brand.txt
- FigCraft crate manifests read under https://raw.githubusercontent.com/storytold/figcraft/main/ (`Cargo.toml`, `crates/doc/Cargo.toml`, `crates/layout/Cargo.toml`, `crates/render/Cargo.toml`, `crates/engine/Cargo.toml`).
- EffectCraft crate manifests read under https://raw.githubusercontent.com/storytold/effectcraft/main/ (`Cargo.toml`, `crates/engine/Cargo.toml`, `crates/render/Cargo.toml`, `crates/lottie/Cargo.toml`).
- ArtCraft scene source read at pinned revision under https://raw.githubusercontent.com/storytold/artcraft/d4e4ac69bbd93d237eaf5d0260bc6a5ff3a5e373/frontend/libs/components/pagescene/src/lib/ (`Stage3DBody.tsx`, `adapter.ts`, `actions/transformObject.ts`, `PageSceneStore.ts`).
- Other ten apps' root `Cargo.toml`, `NOTICE`, `LICENSE-MIT` read from `https://raw.githubusercontent.com/storytold/<repo>/main/` for `photocraft`, `vectorcraft`, `filmcraft`, `lightcraft`, `pdfcraft`, `designcraft`, `wordcraft`, `soundcraft`, `deckcraft`, `gridcraft`. These are file locations inspected, not a full license audit.
- Specific LightCraft exception: https://raw.githubusercontent.com/storytold/lightcraft/main/NOTICE

Live `main` moves. Reverify the selected license/dependency graph at a pinned commit before copying. No engine builds, feature parity tests or screenshots were performed for this text-only audit.
