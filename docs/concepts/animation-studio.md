# Animation Studio: motion graphics and compositing

Status: concept for review only. No implementation, dependency adoption, push or release is authorized here.
Date: 2026-10-14. Somnia baseline: `int/shell`, `44b782c0558fe1f00785f5a1dc6f2074e42bce79` (rechecked after branch update).
Scope: a new After-Effects-like studio, working title **Animation**, stable proposed id `animation`. Existing Design remains page layout; Video remains sequence editing. Neither is renamed or replaced.

## 1. Recommendation

Build a composition-first studio in Somnia's own shell. Evaluate selected headless EffectCraft crates before writing equivalent time, property and compositing engines. Build the React timeline, curve editor and panels in Somnia's design system. Do not embed EffectCraft's egui application as a second application inside the shell.

Start with reliable 2D titles, lower thirds, logo animation and layered composites, not a promise to clone all of After Effects. Effects counts, compatibility labels and upstream screenshots are not acceptance tests. 3D authoring belongs to the separately proposed 3D studio; Animation may later composite its renders or reference versioned scenes.

Evidence levels used here:
- **Current**: inspected source at the Somnia SHA above or EffectCraft SHA `549e9d825132986d6167c1432cd3328efcbb0278`.
- **Upstream claim**: product or README statement, not independently run or benchmarked.
- **Proposed**: Somnia design, contracts, phases and target budgets below. None are shipped features.

## 2. Current shell and reuse boundaries

Current Somnia paths:
- `phase1/src/lib/studios/video.ts`: pure-data `StudioDef`, `shellV2`, panels, rails, commands, default layout, one inspector and header `heroAction`.
- `phase1/src/lib/shell/types.ts`: `PanelDef`, `StudioContext`, `StudioShellDef`, `HeroActionDef`. Panels use registered hosts, not arbitrary imports from manifest data.
- `phase1/src/lib/video/session.ts`: Video sessions, clip editing, sources, filmstrip and a WebCodecs/mediabunny worker owner. This is not already a composition/keyframe session.
- `docs/studios/header-hero-action.md`: the header slot already exists. Older hero concepts saying it is missing are stale at this baseline.
- [Dual inspectors](studio-shell-dual-inspectors.md): equal left/right panel containers, one owner per control; named inspectors and cross-side movement are proposals, not current APIs.
- [Performance and resources](performance-resource-architecture.md): proposed session/view/job separation. Animation should join that design, not create a private always-running scheduler.
- `docs/extensions/14-studio-extension-points.md`: studio SDK points are a proposal/PoC, not a shipped permission surface. `docs/extensions/07-security.md` records current native/CSP caveats.

Do not add Animation-specific conditions to shared shell JSX. Use a manifest plus allowlisted canvas/panel hosts. Do not silently expand studio id unions, file claims or extension permissions without their shared owners reviewing the change.

## 3. Workspace, design and shell contract

The default is a viewer above a resizable timeline, between two useful side stacks:

| Surface | Default responsibility | Avoid |
| --- | --- | --- |
| Left | Project assets and compositions; searchable built-in effects/presets; optional History | A second layer list duplicating the timeline |
| Center | Composition viewer: pan/zoom, transparency grid, safe areas, guides, layer transforms and mask editing | A separate application titlebar, copied Adobe or ArtCraft chrome |
| Bottom of canvas host | One virtualized layer/property timeline; Graph is an alternate mode of the same time area | A global shell drawer takeover or a duplicate timeline |
| Right | Selection Properties; ordered Effect Controls; text or mask settings; Render Queue when requested | Two editors for the same property or full inspector clones |
| Global | Existing Files, Settings, Extensions, AI/Chat, studio pill, Account and menus | New global controls that shift the shell per studio |

Use ordinary `PanelDef` hosts for independent properties/effects/queue panels first. This works without the proposed `inspectors` map. If shared named inspectors ship, migrate through the shared contract; do not invent a local variant. Proposed ids: `animation.assets`, `animation.effectsLibrary`, `animation.properties`, `animation.effectControls`, `animation.renderQueue`. Resolve local-vs-qualified ids consistently with the registration contract and keep persistence keys stable.

Header hero: **Render...**, command `animation.render.open`, opens output setup/progress only. It must not immediately export. Use the existing `StudioDef.shell.header.heroAction`; keep website Publish in the established shared menu/chevron. Local render is not cloud publication. A running render never turns the whole hero into a destructive Cancel button.

Defaults to prototype, not accepted dimensions: left 260 px, right 320 px, timeline 240 px where space permits. Preserve the viewer's useful area and transport. Follow dual-sidebar measured-width fallback and overlay/focus rules when Agent/Chat opens. Test actual pixels at 960x600, 1280x720, 1440x900 and wide desktop, UI scale increased, long German labels, light and dark. Never solve density by hiding scrollbars or making timeline controls unreachable.

Use current shared theme/radius/spacing/type/icon tokens and the parallel [design-system migration](design-system-migration.md) and [component inventory](design-system-component-inventory.md). No private palette, hard-coded theme or copied proprietary icons. Keyboard selection, keyframe navigation, numeric editing, curve-handle alternatives, named resize separators and a screen-reader property/keyframe list are requirements. No new shortcut allocation until the global inventory is checked.

## 4. Authoritative composition model

Proposed document model is versioned, local and serializable:
- Document id/revision, schema and engine versions; compositions; asset table with stable ids, relative paths, fingerprints and relink information; private recovery journal.
- Composition: width/height, rational frame rate, duration/start ticks, background/alpha mode, work area, audio configuration and explicit color space. Use integer/rational time, not accumulated floating-point seconds. Drop-frame affects display labels, not actual sample count.
- Layer: stable id, source kind/id, in/out ticks, offset/stretch, parent, transform, blend/opacity, effects, masks/matte link and visibility/solo/lock flags. Parenting, matte and precomposition graphs must reject cycles.
- Property: typed base value, optional ordered keyframes, interpolation/tangents, optional inert expression text. Units and supported ranges belong to the schema, not UI labels.
- View state: selection, playhead, scroll, zoom, open property rows and graph mode. Keep this separate from document content and dirty state.

First layer kinds: solid, raster, text, vector shape, null and precomposition. Footage/audio follow a verified media bridge. Adjustment layers and track mattes follow the basic compositor. Cameras/lights are a later 2.5D stage, not proof of a full 3D modeling studio.

Propose an Animation document kind within the existing `.somnia` project/container architecture; settle the actual entry schema with that owner before implementation. Do not register `.somnia` globally to Animation. Do not claim `.aep`/`.aepx` support. An `.ecproj` importer is a separate, bounded adapter with schema/asset/expression checks, not an automatic association. Raw MP4 stays Video by default; a deliberate Import into composition command creates a layer. SVG stays Vector by default. Broken input must leave the existing document untouched.

All edits dispatch typed `animation.*` commands into one transaction/undo owner. A pointer drag previews values and commits once; Escape cancels it. Save and recovery capture authoritative data, never just rendered frames. Studio switches preserve dirty data, history and playhead; lifecycle eviction may dispose caches only after a verified checkpoint. Missing media retains layer geometry and keys, enters relink state, and blocks final render by default rather than silently substituting black.

## 5. Timeline, keyframes and curves

- Composition tabs and breadcrumbs select one active composition; timeline selection, viewer and inspector share stable ids and one selection owner.
- Layer duration bars plus expandable property rows, markers, work area, snapping and frame stepping. Virtualize both rows and visible time. Cache thumbnails/waveforms separately from the model.
- Explicit animation toggle and add/remove key at playhead. Unanimated values remain constant. Animated-property edits add/update the key at the playhead; auto-key is off by default. Disabling animation with existing keys requires a clear undoable operation, not accidental data loss.
- Multi-select/marquee, key move, duplicate, copy/paste preserving relative offsets, align times, time-reverse and layer trim. Define collision behavior: one key per property/tick; show replacement before merge. Locked layers cannot change through inspector or AI bypasses.
- P1 interpolation: hold, linear and temporal cubic Bezier; separately model spatial Bezier position paths. Ease in/out are generated parameter settings, not copied vendor presets. Separate X/Y curves only where the property supports it.
- Graph mode initially edits value curves with units, bounds and handles. Speed graph is later and must derive time derivatives correctly; do not relabel a value graph as speed. Avoid joining unlike units on a misleading shared axis.
- Playback may skip preview frames; final rendering must sample every requested output frame at exact times. Audio clock governs synchronized preview once audio support passes drift tests. Show preview quality and cache status without dumping debug text into the main UI.

Adobe's animation documentation [S8] supports these interaction categories, not source-code reuse or a parity claim.

## 6. Effects, masks, expressions and tracking

### Effects and masks

An ordered, non-destructive effect stack with bypass, duplicate, reset and per-parameter animation. Parameters are typed, serializable and versioned. Begin with transform, fill/tint, opacity, blur, shadow, levels/curves and a small original noise generator; each needs a reference render and bounds tests. Audit the corresponding upstream implementations rather than adopting a 306-effect catalog by name.

Define the render order explicitly and test it: sample layer source/time, source-space masks, ordered effects, layer transform, track matte, opacity/blend into composition; document supported exceptions such as adjustment layers. Specify bounds growth for blur/shadow, alpha premultiplication, working color space and edge handling. CPU/GPU parity is a gate, not assumed from matching function names.

Start masks with rectangle/ellipse/Bezier, add/subtract/intersect modes, feather/expansion, invert and animated vertices with stable topology. Matte references have explicit alpha/luma behavior. Mask vertex topology changes must not silently morph unrelated points. No Adobe effect binaries, proprietary presets, assets or After Effects plug-in ABI compatibility.

### Expressions

Phase 1 has no arbitrary script execution. A later stage adds deterministic, capability-free property expressions: time, value, bounded math, seeded noise, easing and explicit same-document property references. No filesystem, network, clipboard, environment, host objects, eval bridge or native automation access.

EffectCraft has an expression crate using Boa and an AE-like object model. Current code sets loop/recursion/read budgets and a native five-second aggregate deadline, but explicitly lacks that clock deadline on WASM [S2, `crates/expr/src/lib.rs`]. This is evidence of a gap for interactive Somnia use, not certification that arbitrary expressions are safe.

Before adopting it: isolate in a killable worker or native job boundary, cap aggregate work/memory per frame and project, reject cycles, seed randomness and disallow wall-clock dependencies. Test nested loops, allocations, recursion, cross-property fan-out, cancellation and worker recovery. A Promise timeout without termination is not containment. Imported expressions stay inert until the user enables them through the reviewed execution path. Render must fail visibly or use an explicitly approved bake, never silently emit a frozen value. A bake creates an undoable set of sampled keys and retains the original expression as disabled metadata.

### Tracking

Manual masks first. Then evaluate one/two-point translation/rotation/scale tracking with a bounded region, forward/backward analysis, confidence visualization, manual repair and reversible application to a null/mask/transform. Analysis produces proposed tracks; Apply creates keys in one transaction. Cancellation preserves footage and existing animation.

EffectCraft's track crate describes NCC/Lucas-Kanade refinement, stabilization and camera solving; these are source inventories, not measured tracking quality. Planar tracking, corner pin, camera solving, rotoscoping and learned segmentation are separate late gates. Ship no model weights or automatic downloads by default. Any optional model needs independent code/weights license, provenance, hash, size, explicit download and local execution review; upstream attribution alone is not verification of the model's terms.

## 7. Engines and licensing decision

| Rank / candidate | Verified evidence and fit | Decision / limits |
| --- | --- | --- |
| 1. EffectCraft headless crates | Repository at pinned SHA has `MIT OR Apache-2.0`, actual license files, NOTICE and an asset attribution inventory. `time`, `keyframe`, `project`, `render`, `effects`, `track`, `gpu`, `expr`, `lottie` are separate crates; render is CPU, gpu uses wgpu. [S1-S3] | Best first feasibility candidate. Start with time/keyframe/model + a minimal compositor dependency closure, not whole engine/app. No binary or Windows/WASM quality test run here. |
| 2. Own Rust composition/evaluation over existing Somnia engines | Proposed alternative if extraction or fidelity is poor | More implementation, but control over schema, bounds and shell. Reuse only already verified primitives; do not duplicate Video's media infrastructure blindly. |
| 3. ThorVG | MIT repository; SVG/Lottie vector rendering, masking/composition, native and WASM/WebGPU support are documented. [S4] | Useful vector/Lottie preview option, not a complete footage compositor, tracker or authoring timeline. Do not add a second full renderer without a measured need. Verify selected revision/dependencies before adoption. |
| 4. Rive runtime | MIT repository describes C++ runtime/renderer for `.riv` artboards, animations and state machines. [S5] | Optional later runtime/interchange exploration. Open runtime does not establish rights to Rive's hosted editor or supply an AE-like editor/exporter. |
| Excluded from in-process reuse: Natron | Project describes GPL licensing. [S6] | Not a permissively licensed engine for the intended MIT distribution. No copying/linking of its code in this plan. An optional standalone workflow would need separate scope and compliance review. |

EffectCraft extraction caveats from inspected Cargo files: workspace Rust floor is 1.95 and it pins external FilmCraft git crates and craft-libs; `engine` pulls a broad graph including tracking/segmentation/model/interchange. `expr` depends on render; `gpu` depends on CPU render. Browser app is an eframe/egui runner, not a ready React bridge. A complete transitive dependency/license/build-size audit remains open. Do not call a port "just copy the crates" or claim WASM support from Rust syntax alone.

License practice before any reuse:
1. Pin exact upstream commits and selected files; retain chosen license text/copyright, attribution and applicable NOTICE content in third-party records and shipped licenses. If choosing Apache, apply its notices/modified-file requirements and patent terms; MIT selection does not make unrelated patent risk disappear.
2. Treat root code licensing, asset licensing, model licensing and brands separately. EffectCraft NOTICE explicitly excludes ArtCraft names/wordmarks/logos under `docs/brand/`; brand terms require removing them from forks/modified products. Somnia uses its own identity and icons. Fonts listed in ATTRIBUTION have OFL terms, not MIT. No need to copy them.
3. Review each reused file's provenance and dependency graph. Upstream calls itself clean-room; that is its claim, not an independent legal audit. Do not copy Adobe code/assets or vendor presets just because an upstream reimplementation names them.
4. Keep source licensing separate from codec patents. $0 dependency cost is not proof of royalty-free distribution. Do not enable upstream H.264/HEVC/AAC simply because pure Rust implementations exist. [S7]

## 8. Worker, WASM and render performance

Proposed adapter contract: open/snapshot/apply/revert/evaluate/render/dispose with versioned messages, document id, revision and cancellation generation. Keep engine instances out of React state. Transfer bulk buffers, not full scene JSON on every pointer move. Preview and export share evaluation semantics, with independent quality settings and job leases.

Lazy-load Animation only on activation. Metadata stays cheap. Prefer native Rust jobs for sustained desktop export; WASM worker preview is a feasibility target, not a promised drop-in. A direct native-to-WebView GPU texture bridge is not established. Benchmark CPU pixel transfer/readback vs GPU canvas paths before choosing. WASM threads need cross-origin isolation/shared-memory support [S10]; provide a single-thread/proxy fallback and verify native WebView headers/CSP instead of weakening them.

Use tiled render, bounded LRU frame cache, half/quarter-resolution preview and a small frame ring. Coalesce scrubs to newest generation, cancel obsolete evaluations and prevent stale frames replacing newer revisions. Do not retain full-resolution RGBA for every timeline frame. Derived example: one 1920x1080 RGBA8 buffer is 8,294,400 bytes (~7.9 MiB), before intermediate layers, effects, decoders or GPU copies; float buffers multiply this. Preflight dimensions, frame count, nesting, effect bounds and aggregate allocations before admitting work.

Initial measurement targets, not promises: simple 1080p/30 title composition, 20 mixed layers and two basic effects; interactive transform feedback under 100 ms at proxy quality; steady preview without unbounded memory growth over ten minutes. Measure first-frame time, scrub p50/p95, dropped frames, export fps, worker/WASM/GPU peak memory and teardown. Include a 4K stress case, deep precomp rejection, no-GPU fallback and hostile expression cases. If targets fail, reduce preview quality and scope, not correctness.

## 9. Rendering, export and Video relationship

Render queue stores immutable document revision, asset fingerprints, composition id, explicit full/work/custom range, output dimensions/frame rate, color/alpha, audio policy and destination. Review these before final Render. A changed document may start a new job only after its new revision is shown; it cannot retarget a running job.

MVP reference export: lossless PNG sequence plus timing manifest, explicit alpha semantics; optional WAV when an audio path is verified. Native jobs stream frames to an approved folder with overwrite review and partial-file cleanup. Browser sequence packaging needs bounded chunks/streaming or a capped ZIP fallback; never allocate an entire long render in one huge Blob. Capability failure blocks output with a reason, not a fake success toast.

WebM/other compressed outputs follow successful capability and audio/mux tests. Probe actual encoder configuration using `VideoEncoder.isConfigSupported()` [S9] plus audio/mux support; API existence is insufficient. PNG export is the non-codec fallback. MP4/H.264/AAC/HEVC, ProRes, GIF, AV1 and alpha-video are individually gated, not a bundled promise. An installed user-managed FFmpeg may be an explicit optional adapter if separately reviewed, never silently bundled/downloaded. FFmpeg's own legal page distinguishes LGPL/GPL build configurations and patent questions [S7].

Lottie is an optional restricted interchange/export profile: enumerate supported shapes/transforms/keys/mattes and fail with a compatibility report for unsupported footage, effects, expressions, 3D or fonts. Baking to images is only an explicit raster export choice, not a claim of editable Lottie fidelity. No After Effects project import/export guarantee.

Video owns sequence-level cutting, source trim, transitions and assembly. Animation owns intra-shot composition, motion curves, masks and effect stacks. Reuse timing/media decode/export abstractions where source audits permit, but maintain distinct documents and undo owners.

First bridge: render a composition and insert the resulting media deliberately into Video with source composition/revision metadata. If transparent video is unavailable, say so; do not claim an alpha PNG sequence can already be inserted into Video. Until image-sequence ingestion is verified, PNG sequence is external export only. Later linked-composition clips use stable revision/fingerprint references, cached proxies, explicit update and cycle checks, not mutable shared UI stores. A missing/stale composition is visible and final render blocks or explicitly uses an approved baked proxy. Never auto-re-render all linked projects on studio switch.

## 10. Extension SDK and AI

Use the existing command dispatcher and policy gates for built-in AI actions. AI edits propose typed operations with a preview and one undo transaction. File writes, script enabling, renders, external commands and uploads keep their own review boundaries; the concept grants no new authority.

SDK v1 must not be presented as supporting animation internals. Proposed future studio extension points, only after the shared SDK contract ships:
- Snapshot-based import/export of a bounded `composition` interchange kind, host-owned file dialogs and validated relative asset references.
- Declarative properties for allowlisted selection kinds (`composition`, `layer`, `keyframes`, `mask`) and operations such as setProperty/addKeys/reorderLayers, with revocation and transaction checks. These names are proposals, not current API.
- Host-owned inspector/flyout slots for approved panels; no canvas/rail replacement, raw project store, native handles or arbitrary GPU shaders.
- Optional isolated WASM effects are a separate future sandbox proposal: caps on fuel/memory/pixels/runtime, validated pixel interfaces and deterministic versioning. EffectCraft's own wasmi plug-in system is not automatically Somnia SDK-compatible.

Retain catalog worker restrictions and current CSP/native caveats. No extension receives filesystem/network/model-download/AI permissions through an effect or expression feature. Disabling a contributor preserves serialized settings and flags missing effects instead of dropping user work.

## 11. Phases and gates

No calendar estimate is reliable before the engine spike; phases are dependency-ordered, not a promised release train. $0 means no paid service/asset/runner requirement and no unreviewed codec obligations, not free engineering effort.

| Phase | Scope | Exit gate |
| --- | --- | --- |
| A. Review + extraction spike | Pin/audit minimal EffectCraft closure; tiny native and wasm32 headless build; own procedural fixtures; adapter/schema decision | Audited licenses/notices; no copied brand assets; Rust/MSRV and bundle-size impact known; deterministic CPU frame; build fits current free-CI allowance. Otherwise select own-engine fallback. |
| B. Useful 2D studio | Manifest/hosts/session; blank composition; solids/raster/text/shapes; transform keys; value curves; PNG reference export; save/recovery | Create an original lower-third, reopen with keys/fonts/assets intact, undo, render exact frames/alpha, survive studio switch and failed save. Actual pixels reviewed at target sizes/themes. |
| C. Compositing | Precomps, masks/mattes, small audited effect stack, footage/audio after capability work; render queue/cancel | No dependency cycles, missing media blocks, CPU/GPU reference tolerance defined, alpha/color edge fixtures, exact audio/video duration and no dropped export frames. |
| D. Integration | Capability-gated compressed export, restricted Lottie, deliberate Video render bridge, SDK proposals mapped to shared APIs | No silent format degradation; deliberate insert/update; unchanged Video/Code baselines; malicious importer/resource tests; free CI stays bounded. |
| E. Advanced motion | Isolated expressions, tracking and baked results; 2.5D cameras/lights after 3D contract | Hostile scripts terminate without shell lockup; tracks have confidence/manual repair; deterministic repeated renders; 3D authoring stays separate. ML and broad AE compatibility remain separately reviewed. |

CI proposal: small CPU golden frames with tolerances and own test scenes on pull requests, schema/command/security/unit tests, one targeted WASM compile, cache by lockfile and toolchain. Do not run upstream's entire app workspace or a heavy three-platform media matrix on every docs/UI change. Check actual GitHub account limits before selecting cadence; do not assume unlimited public-repo minutes or free GPU runners. Real Windows/WebView and hardware/GPU tests remain a release gate, not replaced by CI screenshots.

Open decisions: approve the studio name/id; choose the minimal engine closure after the spike; settle the `.somnia` entry schema; define first certified export profiles and target machine class; coordinate native job/resource service and design-system ownership. These do not block concept review, but must be resolved before implementing affected paths.

## 12. Source ledger

Fetched/read 2026-10-14. Vendor/primary sources establish their own documented behavior, not independent performance rankings. No compiled engine, live UI, native round trip or benchmark was run for this concept.

- **S1** ArtCraft app inventory and EffectCraft product page: https://getartcraft.com/apps/ and https://getartcraft.com/apps/effectcraft/ . Product claims motion graphics and WASM availability; not a license audit.
- **S2** EffectCraft repository: https://github.com/storytold/effectcraft . Live clone at `549e9d825132986d6167c1432cd3328efcbb0278`; inspected README, workspace and selected crate manifests, project model, expressions implementation/tests. README parity/effect-count claims remain upstream claims.
- **S3** Actual license/notice pages: https://github.com/storytold/effectcraft/blob/main/LICENSE-MIT , https://github.com/storytold/effectcraft/blob/main/LICENSE-APACHE , https://github.com/storytold/effectcraft/blob/main/NOTICE . Additionally read `ATTRIBUTION.md` and `docs/brand/LICENSE-brand.txt` from the pinned clone; no third-party assets copied.
- **S4** ThorVG official repository: https://github.com/thorvg/thorvg . Documented MIT, vector/Lottie scope and browser/GPU paths; upstream benchmark numbers not adopted.
- **S5** Rive runtime official repository: https://github.com/rive-app/rive-runtime . MIT runtime/renderer, `.riv` loading, artboards/animations/state machines; not a license to the hosted editor.
- **S6** Natron project: https://natrongithub.github.io/about . Describes GNU GPL licensing and compositor scope; reason for exclusion from proposed permissive in-process reuse.
- **S7** FFmpeg legal page: https://ffmpeg.org/legal.html . Distinguishes LGPL/GPL configuration and codec patent questions. Not legal clearance for Somnia codecs.
- **S8** Adobe animation basics: https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-basics/animation-basics.html . Layer properties, keyframes, value/speed graphs and expressions as interaction reference only.
- **S9** MDN VideoEncoder capability probe: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static . Actual config probing, limited availability and secure-context requirement.
- **S10** MDN SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer . Shared-memory isolation requirements; no claim that Somnia's WebViews already satisfy them.
