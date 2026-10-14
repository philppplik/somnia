# 3D Studio: concept

Status: proposal only. No implementation, push or release is authorized by this document. Development starts only after Philipp reviews the concept.
Baseline: `int/shell` at `315d1f23a061d07215bdc60d25d3d57d756cbaab` (fetched 2026-10-14). Facts about outside projects were read from their public pages and license files on 2026-10-14; sources are in section 13.
Sibling concepts (interface design, animation) are written separately. Shared parts (timeline, scene graph interchange) are flagged in section 9.

## 1. Goal and honest scope

Philipp wants a 3D studio next to Code, Documents, Sheets, Slides, Sound, Video, Photos, Design and Vector.

Blender took about 25 years and a large team. A free-CI, $0 project cannot match it. The realistic target is a **scene and product-staging studio with light modelling**:

1. Open, inspect, fix and export 3D files (glTF/GLB first).
2. Assemble scenes: primitives, imported models, lights, cameras, PBR materials, HDRI.
3. Edit meshes at a basic level: extrude, bevel, loop cut, booleans, simple sculpt.
4. Render stills and turntables, in the browser view or with a path tracer.

This is the Adobe Dimension / Substance Stager class of work plus a small slice of Blender modelling. It is not a character-animation, simulation or CAD-kernel product. Those are listed under "Not a goal" (section 10).

## 2. Comparison with the references

| Area | Blender | Adobe Substance 3D / Dimension | Proposed Somnia 3D |
| --- | --- | --- | --- |
| License of the product | GPL v2 or later source, GPL v3 or later for binaries; Cycles is Apache-2.0 [S1] | Proprietary, subscription | MIT (project license) |
| Modelling | Full: mesh, sculpt, geometry nodes, modifiers | Dimension: staging, no real modelling. Painter/Sampler/Designer cover texturing and materials | P2: basic polygon edit, booleans, simple sculpt |
| Materials | Node shader editor, Principled BSDF | Substance graphs (`.sbsar`), proprietary | glTF PBR metallic-roughness plus `KHR_materials_*`; node graph later |
| Render | Cycles, EEVEE | Dimension: its own ray tracer | Viewport raster (three.js), progressive path tracer for stills |
| Animation | Rigging, physics, sim | Limited | Out of v1. Reuses timing and keyframe abstractions of the animation studio, not its document or stores (section 9) |
| Interchange | `.blend`, glTF, USD, FBX, OBJ, more | glTF, OBJ, FBX, USD, more | glTF/GLB native, OBJ, STL, PLY; USDZ export later |

Adobe status note: an Adobe community post from 2021 says Dimension was not end-of-life but received no new features, with new work going into Stager [S2]. I did not find a current statement in this session; treat Dimension's present status as unverified.

What can be used from Blender: its **output** (what you create with Blender is yours [S1]), its public documentation as a feature checklist, and Cycles (Apache-2.0) as a separate component. What cannot: any GPL Blender source in Somnia's code. Somnia is MIT, so copying GPL code into the app would force the combined work under GPL. Re-implement behaviour from the manual instead of reading and porting source.

## 3. Engine options

Constraints from the repo: Tauri shell with a WebView, React 19 UI, CSP `script-src 'self' 'wasm-unsafe-eval'` (`src-tauri/tauri.conf.json`), existing WebGL code in `lib/image-editor/webgl.ts` and `lib/imageedit/adjust/gpu.ts`, Rust/WASM "craft" engines under `phase1/craft` and `photos-engine`, and a sandboxed-iframe extension model.

Licenses below come from each repository's license data on GitHub (checked 2026-10-14). Dual-licensed Rust projects (wgpu, Bevy) report one SPDX id in the API; I did not open their license files, so confirm "MIT or Apache-2.0" before adoption.

| Option | License | Fit | Verdict |
| --- | --- | --- | --- |
| three.js | MIT | Runs in the existing WebView. Huge ecosystem (loaders, exporters, TSL node materials, WebGPURenderer with WebGL2 fallback [S3]). Scene graph, not an editor. | **Recommended for the viewport and scene layer.** |
| Babylon.js | Apache-2.0 | Runs in the WebView. Batteries included: gizmos, inspector, node material editor, physics plugins. Larger runtime, own scene model, harder to keep UI in React/shadcn. | Fallback if three.js gizmo/picking work proves too costly. Decide after the P0 spike. |
| wgpu (Rust) | Apache-2.0 per GitHub (dual with MIT per project docs, confirm) | Matches the craft/Rust direction, compiles to WASM, WebGPU in the WebView still needed for the browser build. No scene or editor layer at all. | Use later for headless compute (baking, mesh processing) if needed. Not for v1 UI. |
| Bevy | Apache-2.0 per GitHub (dual with MIT, confirm) | Full ECS engine, big WASM, game-oriented, no editor in a usable state. | Not recommended. |
| Filament | Apache-2.0 | Excellent PBR renderer, C++, WASM build exists. Own scene model, duplicates three.js work. | Not recommended. |
| Cesium | Apache-2.0 | Geospatial. | Out of scope. |

Webview note: three.js `WebGPURenderer` falls back to WebGL2 automatically [S3]. Whether WebView2 on the user's Windows has WebGPU enabled is not verified here (the only source found was an old Microsoft issue thread [S4]). Plan on **WebGL2 as the baseline** and WebGPU as an opt-in after a runtime capability probe on Philipp's Windows machine.

### Supporting libraries (all verified license, 2026-10-14)

| Library | License | Use |
| --- | --- | --- |
| three-mesh-bvh | MIT | Fast raycast, picking, sculpt brush hit tests |
| three-gpu-pathtracer | MIT | Progressive path-traced stills in the viewport |
| glTF-Transform | MIT | Optimise, dedupe, compress, validate GLB on export |
| meshoptimizer | MIT | Mesh and animation compression (`EXT_meshopt_compression`) |
| Draco | Apache-2.0 | Geometry compression (`KHR_draco_mesh_compression`) |
| Manifold | Apache-2.0 | Robust mesh booleans, C++ with WASM build; also usable from Rust |
| Rapier | Apache-2.0 | Physics for "drop objects onto surface" staging, later |
| MaterialX | Apache-2.0 | Reference for material interchange, later |
| Assimp | BSD-style (`LICENSE` in repo, text not fully read here) | Optional import of rare formats (FBX, 3DS, DAE) via a Rust or WASM bridge. Read the license text before adopting. |
| OpenUSD | Tomorrow Open Source Technology License 1.0 (Apache-2.0 with a changed trademark clause) [S5] | Too heavy for v1. USDZ export through three.js's own exporter first. |
| KTX-Software (KTX2/Basis) | repo reports no single SPDX id; mixed licenses | Texture compression. Review per component before use. |

Verify each license file again at the moment of adoption and record it in Settings > Licenses, as already done for the LGPL mp3 encoder.

### Do not use

- **Blender source.** GPL, see section 2. Calling a user-installed Blender as a separate program is a different matter (import/export bridge, later). That still needs a short legal check.
- **Open CASCADE (OCCT / opencascade.js).** LGPL 2.1 with an exception [S6]. It gives real B-rep CAD, STEP and IGES. A statically linked WASM bundle makes the LGPL relinking obligation awkward. Keep it out of v1. If STEP import is wanted later, ship it as a separate lazily loaded module with the license text and a relink path, after legal review.
- **Substance `.sbsar` files and Adobe assets.** Proprietary. No importer, no copying of presets, icons or sample content.
- **ArtCraft's AI features** ("Image to 3D Mesh", "3D Compositing" on getartcraft.com) belong to their cloud/AI product, not to the Crafting Apps. Nothing to reuse, no license read.

### What ArtCraft's apps page offers for 3D

The apps page lists 13 apps (Photo, Vector, Film, Light, PDF, Effect, Design, Fig, Word, Sound, Deck, CAD, Grid Craft). **None is a 3D modeller.** CADCraft is 2D drafting (DXF/DWG), "in development", MIT or Apache-2.0 at your option; its brand assets are trademarked and excluded; bundled fonts and icons keep their own licenses listed in its `ATTRIBUTION.md` [S7]. Useful from it, with attribution and per-file license check:

- A DXF reader/writer (R12 to 2018) could feed "extrude a 2D plan into 3D walls". Optional, P3.
- Its CLI + JSON control + MCP pattern is a reference for 3D agent tools.

"Schau was du kopieren kannst" therefore yields little code for 3D. The 3D studio is mostly built from the libraries above.

## 4. Formats

| Format | Import | Export | Notes |
| --- | --- | --- | --- |
| glTF 2.0 (`.gltf`, `.glb`) | P0 | P0 | **Native interchange.** PBR metallic-roughness, animations, cameras, lights via `KHR_lights_punctual`. Extras carry Somnia metadata. |
| OBJ (+ MTL) | P0 | P1 | Geometry and basic materials. |
| STL | P0 | P1 | 3D print. Check units (mm) on import and export. |
| PLY | P0 | P2 | Scans, vertex colours. |
| USDZ | no | P3 | Apple AR Quick Look. Via three.js exporter; limited. |
| FBX | P3, best effort | no | Proprietary, undocumented binary format. Assimp or three.js loader, no promise of fidelity. |
| STEP / IGES | P4 or never | no | Needs OCCT (section 3). Decision deferred. |
| PNG / JPG / EXR | n/a | P1 PNG; P2 EXR | Stills. HDRI import (`.hdr`, `.exr`) from P1. |
| MP4/WebM turntable | n/a | P2 | Reuse the Video studio's WebM export path. MP4 stays disabled without an AAC encoder (existing decision). |

Native document: a **GLB plus a small JSON sidecar** (editor state, selection sets, render settings, camera bookmarks) inside the `.somnia` container. The GLB stays valid in any other viewer. Exact container layout belongs to the `.somnia` file-format doc, not decided here.

Security: model files are untrusted input. Cap file size, triangle count and texture dimensions, parse in a Worker, and reject external URIs (`http:`, `file:`) in `.gltf` by default. Embedded scripts do not exist in glTF, but extras are data only and never evaluated.

## 5. Tool inventory

Status vocabulary follows [studio-tool-roadmaps.md](studio-tool-roadmaps.md): **Direct** = bounded work on top of an existing library, **Expensive** = new engine or model work.

| Area | Tools | Engine | Status |
| --- | --- | --- | --- |
| View | Orbit/pan/zoom, frame selection, turntable, ortho views, wireframe, matcap, stats (triangles, draw calls) | three.js | Direct |
| Scene | Outliner tree, parent/unparent, visibility, lock, groups, duplicate, instances | scene graph | Direct |
| Transform | Move/rotate/scale gizmos, snapping, pivot, align, numeric entry | three.js controls, own gizmo | Direct |
| Primitives | Cube, sphere, cylinder, plane, torus, text-to-3D (extrude font outlines), 2D shapes from the Vector studio extruded | three.js geometry | Direct |
| Mesh edit | Select vert/edge/face, extrude, inset, bevel, loop cut, merge, subdivide, mirror | own half-edge mesh kernel (new) | Expensive |
| Booleans | Union, subtract, intersect | Manifold | Direct (library does the hard part) |
| Modifiers | Non-destructive stack: mirror, array, subdivision, solidify, decimate | own kernel + meshoptimizer simplifier | Expensive |
| Sculpt | Draw, smooth, grab, inflate, pinch with symmetry; no dynamic topology in v1 | three-mesh-bvh + own brush | Expensive |
| UV | Auto-unwrap, pack, seam marking, checker preview | candidate: xatlas (MIT, **license not yet verified**) | Expensive |
| Materials | PBR sliders, texture slots, `KHR_materials_clearcoat/transmission/emissive_strength`, material library | three.js `MeshPhysicalMaterial` | Direct |
| Material graph | Node-based procedural materials | three.js TSL node materials (MIT) | Expensive, P3 |
| Texture paint | Projection and brush paint on albedo/roughness/normal maps | canvas + GPU | Expensive, P3 |
| Lighting | Point, spot, directional, area; HDRI environment; shadow settings | three.js | Direct |
| Camera | Perspective/ortho, focal length, depth of field, bookmarks, safe frames | three.js | Direct |
| Render | Viewport capture (P1), progressive path-traced still with denoise-free sample count, turntable, transparent PNG | three-gpu-pathtracer | Direct |
| Optimise | Dedupe, texture resize, Draco/Meshopt, LODs, GLB validate | glTF-Transform | Direct |
| Assets | Primitive pack, HDRIs, PBR material presets | CC0 sources only (section 6) | Direct |
| Animation | Play imported glTF clips, scrub, simple keyframes on transform | shared timing and keyframe abstractions | P3, reused from the animation studio |

## 6. Assets and content licensing

- Ship no third-party model, texture or HDRI unless its license is verified and recorded in `ATTRIBUTION.md` style data (author, source URL, license).
- ambientCG states all assets are CC0 1.0, files and preview renders, usable commercially [S8]. Poly Haven is commonly CC0 too, but I did not read its license page in this session; verify before use.
- Draw the studio's own icons, primitives and sample scenes. Do not copy Adobe, Blender or Substance icons, UI art or sample files.
- Fonts for text-to-3D: use only fonts already allowed in the repo's license list.

## 7. Shell integration

Everything here uses existing contracts. The shell never asks "which studio is this?".

**Registration.** A new `StudioDef` in `lib/studios/3d.ts`, registered like the other studios (`registerStudio`), id `3d`, label "3D", short name "3D", order after Vector. `formats` claims `glb`, `gltf`, `obj`, `stl`, `ply` at priority equal to other media studios. Smart Open routes these files to the studio (see [smart-open-routing.md](smart-open-routing.md)). Existing manifests compile unchanged; the studio ships with `shellV2`.

**Rails (proposal, both sides used, no duplicated inspector).** Panel ids must be open strings, which Manifest v2 in [studio-shell.md](studio-shell.md) section 3.4 already proposes. Today the left/right rail ids are a closed union in `registry.ts`, so the 3D studio depends on that shell work, not on a workaround.

| Side | Item | Content |
| --- | --- | --- |
| Left | Scene | Outliner with visibility, lock, search |
| Left | Assets | Primitives, models, materials, HDRIs (own library plus bundled CC0 set) |
| Left | Tools | Toolbox: select, transform, mesh edit, sculpt (context-aware per mode) |
| Right | Object | Transform, modifiers stack, mesh info |
| Right | Material | PBR properties, textures |
| Right | Render | Camera, lights, environment, output settings |
| Global | Files, Search, Extensions, Settings, Chat, Agent | unchanged |

Sub-tabs follow the shell concept (for example Render: Viewport / Path trace / Output). Same function, same icon as in other studios (Layers is Layers).

**Header and hero action.** Menus: Project, Edit, View, Insert (primitives, light, camera), Tools, Help. The hero action is **Render** (still), with the chevron menu offering Export GLB, Export PNG, Turntable. This matches the contract in [hero-action-shell-contract.md](hero-action-shell-contract.md) and `header.heroAction`.

**Bottom bar.** Units, grid/snap toggles, camera name, triangle and draw-call counters, GPU backend label (WebGL2 or WebGPU).

**Documents.** A `DocAdapter` for 3D (list, `isDirty`, `save`, `close`) so Save All, Close All and the tab strip work as described in `studio-shell.md` sections 3.1 to 3.3. Closing a dirty scene shows the existing close dialog. Undo uses the studio's own transaction layer; each tool call is one undo entry.

**Start screen.** Like other studios: headline ("Create amazing scenes inside 3D Studio"), short paragraph, CTAs "Open model" and "Create blank scene", per the blank-start rule in `studios/blank-projects.md`.

**Agent.** Agent tools follow the studio-agent pattern (`agentV2`): `scene.list`, `scene.add_primitive`, `object.transform`, `material.set`, `camera.set`, `render.still`, `export.glb`. All through the studio's operation set; per-hunk diff review applies in spirit (the agent proposes, the user sees scene changes in the outliner and can undo). No file access outside the project.

**Extensions.** Use the studio extension points concept ([14-studio-extension-points.md](../extensions/14-studio-extension-points.md), still a proposal, not `apiVersion` 1). Suggested 3D slots: `importers`/`exporters` (bytes to a small interchange model, host builds the scene), `materialPresets`, `hdriPacks`, `inspectorSections` with declarative fields mapped to allowlisted operations. Extensions never get the WebGL context or the scene object. Everything stays in sandboxed iframes, capped by the host.

**Design system.** The parallel design-system work owns tokens and components. The studio uses the shared panel, tab and slider components. The viewport is a canvas surface and takes the same 25 px radius container as other canvases. Gizmo and selection colours use the accent colour token, with sufficient contrast in all themes. Gizmos need keyboard and numeric alternatives for accessibility.

## 8. Phases and gates

| Phase | Scope | Exit gate |
| --- | --- | --- |
| P0 Spike | Lazy-loaded three.js chunk, open GLB/OBJ/STL, orbit, environment lighting, inspect, export GLB. Probe WebGL2 and WebGPU on Philipp's Windows build. Compare Babylon on the same three tasks. | Open a 100k-triangle model at stable frame rate, no memory growth after 20 open/close cycles, engine decision recorded. |
| P1 Staging | Studio registration, rails, outliner, primitives, gizmos, PBR materials, lights, camera, HDRI, undo, save as GLB + sidecar, PNG still, validate/optimise on export | Round trip: open, edit, save, reopen with no data loss; Save All and Close All work; keyboard path for all tools |
| P2 Modelling | Half-edge mesh kernel, extrude/inset/bevel/loop cut, Manifold booleans, modifier stack, basic sculpt, UV auto-unwrap, path-traced stills | Fuzz and property tests on the mesh kernel; booleans never produce silently broken meshes |
| P3 Depth | Material graph, texture paint, timeline for glTF animation (reusing the animation studio's timing abstractions), USDZ export, optional DXF extrude, Assimp import | Per feature, after the sibling timeline work lands |
| P4 Decide | STEP via OCCT, native `wgpu` path, optional Cycles sidecar | Legal check and cost review first |

Each phase ships behind the alpha/beta channel and becomes stable only after Philipp's Windows test, as for earlier studios.

## 9. Overlap with the other two new studios

- **Timeline and keyframes**: the animation (After Effects class) studio needs a timeline. 3D P3 should reuse its timing and keyframe abstractions, not build another. The 3D studio keeps its own document and undo owner; nothing is shared at the store level (see the animation concept, section on Video and reuse).
- **Interface design (Figma class)**: no direct overlap. Shared pieces are the Vector studio's shapes (extrude to 3D) and the design-system components.
- **Scene graph interchange**: one small interchange model for importers/exporters across studios avoids three formats.

## 10. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope creep toward "Blender" | Never finishes | Section 1 scope statement; each phase has an exit gate; "Not a goal" list below |
| WebView GPU variability (Windows drivers, WebGPU support unverified) | Black viewport, crashes | WebGL2 baseline, capability probe, software fallback message, context-loss handling |
| Memory leaks (GPU buffers, textures) | Crashes after long sessions | Central dispose registry, leak test in CI (open/close loop) |
| Mesh kernel correctness | Corrupt user models | Tests first, keep the original GLB until save, non-destructive modifiers |
| Large files | Hangs, out-of-memory | Worker parsing, size caps, progressive load, LOD on import |
| License contamination | Legal risk for an MIT project | Library list in section 3 verified at adoption, no GPL source, OCCT isolated, content CC0 only, license list in Settings |
| Bundle size | Slower startup | Lazy chunk per studio, load only on first 3D file or studio switch; add a budget to `PERFORMANCE-BUDGETS.md` |
| Free CI limits (GPU tests) | Cannot test rendering on real GPU | Pure-logic tests for kernel and scene ops, software GL (SwiftShader) screenshot baselines with tolerance, GPU checks by Philipp's Windows test |
| Untrusted model files | Parser bugs, resource exhaustion | Worker isolation, caps, no external URIs |
| Single maintainer visual QA | Regressions | Visual baseline tests like Photos/Vector, per section "Visual verification" in docs |

**Not a goal**: character rigging and skinning tools, cloth/fluid simulation, geometry nodes, full CAD/B-rep, photogrammetry, VR/AR authoring, cloud rendering, AI mesh generation (needs separate cost and license review).

## 11. Open questions for Philipp

1. Is "staging and light modelling" (section 1) the right ambition, or does he want modelling and sculpt first?
2. OK to start with a P0 spike comparing three.js and Babylon.js before committing?
3. Studio name and short name: "3D" or something like "Somnia Scene"?
4. Is a dependency on Open CASCADE (LGPL) acceptable for STEP later, or is "no LGPL in the core" a rule?
5. Which sample content, if any, should ship (own primitives only, or a CC0 pack)?

## 12. Decision boundary

Nothing in this document is approved. Statements of approval found in other repository docs were not relied on for this concept. Implement behaviour independently; copy no proprietary source, icons, assets, presets or branding.

## 13. Sources (read 2026-10-14)

- S1 Blender license: https://www.blender.org/about/license/
- S2 Adobe community post on Dimension and Stager (2021): https://community.adobe.com/announcements-613/introducing-adobe-substance-3d-stager-and-dimension-update-429713
- S3 three.js WebGPURenderer: https://threejs.org/manual/en/webgpurenderer.html
- S4 WebView2 WebGPU thread (old): https://github.com/MicrosoftEdge/WebView2Feedback/issues/1285
- S5 OpenUSD license: https://raw.githubusercontent.com/PixarAnimationStudios/OpenUSD/release/LICENSE.txt
- S6 Open CASCADE license: https://dev.opencascade.org/doc/overview/html/occt_public_license.html
- S7 ArtCraft apps: https://getartcraft.com/apps/ and https://getartcraft.com/apps/cadcraft/ ; CADCraft license text via https://github.locker/storytold/cadcraft
- S8 ambientCG license: https://ambientcg.com/license
- License ids (GitHub API, `/repos/<owner>/<repo>/license`): mrdoob/three.js MIT; BabylonJS/Babylon.js Apache-2.0; gfx-rs/wgpu and bevyengine/bevy Apache-2.0 reported; google/filament Apache-2.0; elalish/manifold Apache-2.0; gkjohnson/three-mesh-bvh MIT; gkjohnson/three-gpu-pathtracer MIT; donmccurdy/glTF-Transform MIT; zeux/meshoptimizer MIT; google/draco Apache-2.0; dimforge/rapier Apache-2.0; AcademySoftwareFoundation/MaterialX Apache-2.0; Open-Cascade-SAS/OCCT LGPL-2.1; assimp/assimp, OpenUSD, KTX-Software: no single id reported.
