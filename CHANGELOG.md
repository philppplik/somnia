# Unreleased: 3D Studio P0
- 3D Studio: edit mode deletes selected faces, or every triangle touching the selected edges or vertices, with one undo (`studio3d.edit.delete`, full-wipe refused readably).
- 3D Studio: edit-mode selection helpers select all, none or the inverse and grow or shrink the current vertex, edge or face selection to neighbouring elements, from the edit tools or `studio3d.edit.selectAll` / `studio3d.edit.selectGrow`.
- 3D Studio: voxel remesh rebuilds meshes as a uniform watertight triangle grid (resolution 8..128, vertices projected back onto the source surface), with undo, from the mesh tools or `studio3d.mesh.remesh`.
- 3D Studio: combine two meshes with 3D booleans (union, subtract, intersect; world transforms baked, watertight result), with undo, from the mesh tools or `studio3d.mesh.boolean`.
- 3D Studio: generate procedural textures (checker, grid, stripes, seeded noise) straight into any material texture slot, with undo, from the texture tools or `studio3d.texture.generate`.
- 3D Studio: bridge connects two meshes through their largest open border loops with a sewn tunnel (auto start/direction, manual twist, watertight merge), with undo, from the mesh tools or `studio3d.mesh.bridge`.
- 3D Studio: spin revolves meshes around an axis (border edges sweep the walls, partial turns get caps, full turns weld the seam), with undo, from the mesh tools or `studio3d.mesh.spin`.
- 3D Studio: taper scales meshes along an axis from 1 to a factor across their extent (mask respected), with undo, from the mesh tools or `studio3d.mesh.taper`.
- 3D Studio: twist rotates meshes around an axis, angle spread across the mesh extent (mask respected), with undo, from the mesh tools or `studio3d.mesh.twist`.
- 3D Studio: bisect cuts meshes with an axis plane and keeps both halves (optional cap fill, UVs carried), with undo, from the mesh tools or `studio3d.mesh.bisect`.
- 3D Studio: shrink/fatten pushes meshes along their smooth normals (negative shrinks, mask respected), with undo, from the mesh tools or `studio3d.mesh.fatten`.
- 3D Studio: relax smooths whole meshes (Laplacian, borders pinned, sculpt mask respected), with undo, from the mesh tools or `studio3d.mesh.relax`.
- 3D Studio: fill holes caps open mesh borders with consistent centroid fans, making meshes watertight, with undo, from the mesh tools or `studio3d.mesh.fillHoles`.
- 3D Studio: solidify thin meshes into real shells (outer skin, inner skin, stitched side walls, inward/outward offset), with undo, from the mesh tools or `studio3d.mesh.solidify`.
- 3D Studio: separate meshes into one object per connected part (UV seams stay together), with undo, from the mesh tools or `studio3d.mesh.separate`.
- 3D Studio: normals toolbox - one command flips winding, recalculates orientation outward or rebuilds shading smooth, flat or split by angle (a welded cube gets its hard edges back); batch over the marked set as one undo step, UV seams survive.
- 3D Studio: mesh cleanup - one command welds duplicate vertices (UV seams survive), drops collapsed and duplicate faces, removes unreferenced vertices and unifies the winding so closed parts point outward; batch over the marked set as one undo step with per-op totals.
- 3D Studio: mesh bakes keep UVs - mirror, symmetrize and subdivide now carry texture coordinates through the geometry rebuild (cut points interpolate, mirrored halves reuse the source UVs, subdivision smooths UVs with the position weights), so the checker preview, the UV island view and exports survive them.
- 3D Studio: mesh subdivide - smooth Loop subdivision bakes into meshes (1-3 iterations, every triangle splits into four, boundary outlines keep their shape), batch over the marked set as one undo step; pure three-free math alongside the other mesh ops.
- 3D Studio: symmetrize - bake a mirror symmetry into meshes (keep either side of the local X/Y/Z plane, weld the seam), batch over the marked set as one undo step; shares the clip/mirror math with the mirror modifier.
- 3D Studio: mesh simplify (decimate) - one command and a tools-panel row reduce a mesh to a chosen vertex percentage with the bundled meshopt simplifier, keeping shape, UVs and normals; one undo step restores the exact original geometry.
- 3D Studio: history labels are localized - undo/redo steps are stored as i18n keys with params and translated at display time in all five locales, with plural forms for object counts.
- Keyboard shortcut help: pressing ? in the viewport (or the View menu command) opens a localized overlay listing the 3D shortcuts - gizmo keys, frame, snap, measure, view slots 1-9 and Shift+1-9, orbit/zoom keys, Home and Escape - and Escape or the close button dismisses it.
- Scene history list: the tools panel shows the undo and redo stacks with their step labels (newest/next-up first), a row click jumps straight to that point, and the undo/redo commands accept an optional count for multi-step jumps.
- Measure picks honour the snapping settings: grid mode rounds picked points to the move step, vertex, surface and midpoint modes snap to the nearest scene candidate (the same lookup the gizmo uses), and the rubber band previews the snapped point.
- Measure tool polish: after the first pick a live rubber-band line and dot follow the cursor over meshes and the ground plane, and the readout now shows the signed per-axis deltas and scales to the chosen scene unit (m, cm, mm, in) instead of always metres.
- Smooth camera flights: applying a saved view or a view preset glides the camera to its new pose over a third of a second (ease-in-out), interrupted cleanly by grabbing the viewport or by another move; reduced-motion users and the orthographic projection keep instant jumps.
- Camera bookmarks polish: saved views can be renamed (command or inline in the view panel) and overwritten with the current camera, default names fill gaps left by removed views, and the viewport maps keys 1-9 to apply a saved view slot and Shift+1-9 to save the current camera into that slot.
- Pin labels in the viewport: annotation pins with a label show a small overlay tag anchored to the pin that follows the camera, hides when the pin points away, and disappears with the pin; the outliner rows gained a focus button that selects the object and frames it in the viewport.
- Annotation pins: small amber markers with an optional label, inserted at the 3D cursor or a point, movable and deletable like any object; the label lives in the node's extras, so pins survive save/load and glTF export, and the inspector edits it with undo.
- Asset panels as drag sources: primitives, scene materials and material presets (built-in and saved) drag from the panels into the viewport - primitives land at the drop point on the ground plane, materials and presets apply to the mesh under the cursor, each as one undo step.
- Turntable WebM video export: the turntable panel and studio3d.render.turntable gain a WebM output (MediaRecorder, 1-60 fps, no new dependencies) next to the PNG zip and folder outputs; transparent stays exclusive to the PNG outputs.
- Performance overlay and scene hints: a view toggle shows live FPS, draw calls and triangles in the viewport (one patch per second), scene checks gain instancing and LOD hints, opening a heavy scene adds a warning count to the load notice, and a dispose audit covers open/new/close leaks.
- Shadow quality and PCF option, outdoor rig, light helper toggle, ambient occlusion preview: the env panel sets shadow map quality (off/low/medium/high) and switches VSM/PCF (PCF restores the pre-VSM look; softness radius stays VSM-only), the rig row gains an outdoor sun+sky preset, the view panel toggles the selected light's helper and previews ambient occlusion (viewport only, stills/exports unchanged).
- 3D Studio materials polish: texture slots show a 64px preview thumbnail, and a material list in the Model panel shows every material with its usage count and selects the objects that share it.
- 3D Studio outliner polish: groups fold and expand with a chevron or the arrow keys, rows support keyboard navigation (arrows, Home/End, F2 to rename), and duplicate/delete buttons act on the whole selection set.
- 3D Studio import polish: drop model files (with .bin/.mtl/texture sidecars) straight onto the studio, glTF imports fall back to an empty pixel for missing textures instead of failing, and a localized import summary reports triangles, materials and animations.
- 3D Studio camera polish: viewport perspective/orthographic toggle, field-of-view and 35mm focal length fields, and a preview-only turntable orbit (view state only, never exported); saved views, frame-selected (F) and frame-all already shipped.
- 3D Studio: lights polish. The selected light shows a viewport helper (directional, point, spot or area; never exported), shadow-casting lights get a softness slider (VSM shadows honour shadow.radius, saved in the document extras), and the one-click rigs now come in three flavours: three-point, studio softboxes and sunset. Types, shadow toggle and the three-point rig already existed.
- 3D Studio: materials polish. A parametric emissive PBR preset joins the preset library (no texture assets), and the inspector shows a live preview swatch of the selected material - base colour, roughness/metalness highlight and emissive glow - drawn as SVG from the PBR values alone. Copy/paste between objects and the metal/glass/plastic/wood presets were already in place.
- 3D Studio: outliner drag reorder. Dropping rows at a sibling's top or bottom edge moves them next to it (groups still take drops into their middle), with a drop indicator, and the whole move stays one undo step; search/filter, inline rename, hide/lock toggles and shift/ctrl multi-select were already in place.
- 3D Studio: precision tools. Transform snapping gains an edge-midpoint mode and an S hotkey (M toggles the measure tool), numeric transform fields accept relative entries like +10 or *2, rotate and scale can pivot around the selection centre, the world origin or a settable 3D cursor, and a measure tool shows distance and elevation between two viewport picks, ephemerally.
- 3D Studio: import and export polish. Mesh import (OBJ, STL, PLY) takes explicit file units (m/cm/mm/in) and an up axis (Y or Z) from a new Import panel section, the STL unit hint measures after any applied scale, and opening a file shows its phase (reading, parsing, building). Opening a model is now a single undo step that restores the previous scene with its clips, and a selection-only export (GLB, glTF, STL, OBJ) writes just the chosen objects with their world transforms.
- 3D Studio: outliner and selection. The scene outline gains per-object show/hide and lock toggles (locked or hidden objects are skipped by viewport clicks and marquee selection; flags persist in .som3d files), drag rows to reparent with world transforms kept (drop on the list background for the scene root, cycles and bone parents refused), ctrl/meta-click toggles and shift-click range-selects, double-click renames inline, Group/Ungroup buttons sit above the list, and F frames the selection. Reparenting, hiding and locking are one undo step each.
- 3D Studio: materials polish. Two new built-in presets (glass, wood with a procedural grain texture) join the library, a metalness texture slot completes the PBR set (albedo/normal/roughness/metal/emissive), texture slots take images dropped straight onto the material panel, and a material can be copied and pasted between objects - scalars, extras, textures and their UV mapping travel as one undo step, with pasted textures cloned so later tiling on the source leaves the target alone.
- 3D Studio: lights and scene basics. Ambient lights join point/spot/directional/area (colour and intensity, no shadow toggle, shadow edits refused), two procedural HDRI-free environment presets (outdoor, dark) join studio/sky/neutral, and the scene background can be the default, the environment, a solid colour or a vertical gradient. glTF export writes punctual lights through KHR_lights_punctual (now test-covered); ambient and area lights persist via document extras as before.
- 3D Studio: material presets get personal: save the selected mesh's PBR material as a named local preset (stored in the browser, replace-in-place, removable), apply local or built-in presets with one undo step each, and edit the library from the material panel.
- 3D Studio: UV step 2. Amber seam lines show in edit mode, angle-based unfolding joins the box unwrap (BFS layout with exact triangle angles), and islands pack non-overlapping with padding by default (grid layout as fallback toggle).
- 3D Studio: UV tools basics: seam marking on edges (coincident copies included), seam-aware box unwrap and planar projection with attribute-safe vertex splits, checker-texture preview, and a read-only UV island view.
- 3D Studio: modeling polish. Edge bevel gains a round multi-segment profile (1-8 segments), the mirror modifier can bisect-clip the far side before mirroring, and sculpt masks now show as a weighted color overlay in the viewport while sculpt mode is on.
- 3D Studio: modeling gaps closed. Edge bevel (true chamfer, works on unwelded primitives), loop slide along the surface, sculpt brushes crease/pinch/flatten, sculpt masking (paint, Ctrl-erase, clear, masks block brushes), and a non-destructive mirror modifier that exports the mirrored mesh. One undo per operation or stroke; size caps unchanged.
- 3D Studio: mesh edit mode (vertex/edge/face select, extrude, inset, bevel, loop cut) and sculpt brushes (grab, smooth, inflate) with axis symmetry, one undo per operation or stroke, size caps
- 3D Studio: Blender workflow hardening. Round-trip tests now prove that a skinned model with skeleton, animation clip and PBR material scalars survives export to binary GLB and re-import unchanged (metres, Y-up, no axis or unit conversion), and that STL and OBJ exports re-import with correct extents and unit scaling; skin validation rejects damaged or oversized skins with readable reasons. Import already caps file, texture and bone counts and blocks external references; OBJ/STL import and export were already in place.
- 3D Studio: layout tools. Objects group and ungroup under a shared parent (world transforms kept), duplicate as linear or radial arrays, and translate drags can snap to grid increments, the nearest vertex or the surface of other meshes; named views now persist in .som3d documents. New commands `studio3d.group`, `studio3d.ungroup`, `studio3d.object.array`, snap mode in `studio3d.snap.set`.
- Orthographic cameras with zoom editing, named viewport views, and turntable renders that can write a PNG sequence straight into a chosen folder.
- 3D Studio: three-point light rig. One action inserts a classic key/fill/rim setup of directional lights, positioned and aimed from the current scene bounds (origin fallback on an empty scene), the key light casting shadows - one undo step for the whole rig. Together with the existing PBR material editor (base color, metalness, roughness, emissive, local texture slots with size caps) and the procedural environment presets (studio, sky, neutral) this rounds out material and lighting; material changes ride along in the glTF export as before. New command `studio3d.light.rig`.
- 3D Studio: animation review tools. Onion skinning draws tinted ghost poses of every skinned rig a configurable number of frames before and after the playhead, the motion path shows the selected bone's world positions across the current clip as a viewport polyline, and a clip can be retargeted between two rigs by bone-name mapping (namespace prefixes and case tolerated) - preview the pose at the playhead or bake it as a new clip with rotation tracks on the target bones, sampled at the source keys. New commands `studio3d.onion.skin`, `studio3d.motionpath`, `studio3d.retarget.preview`, `studio3d.retarget.apply`.
- 3D Studio: keyframe pose recording. The current pose of the selected bones (or every bone at once) records as rotation keys at the playhead time in the current clip - one undo step for the whole record, keys sort by time and a key past the end extends the clip. Together with the existing clip list, per-key easing and loop/preview playback this closes clip authoring, and recorded clips export through the glTF clip selection. New command `studio3d.clip.record`.
- 3D Studio: FABRIK for 3-to-8-segment bone chains (spine, tail, tentacle) with a viewport target gizmo, an optional look-at constraint that aims the end bone, joint-limit clamping and one undo step per drag.

- 3D Studio: IK basics. A two-bone chain (bone > bone > bone) can switch between FK and IK - switching to IK snaps the target to the end effector and the pole behind the current bend, so the pose never jumps, and switching back keeps the solved pose as FK. The target (cyan) and pole (amber) are gizmos in the viewport, each drag is one undo step, and the analytic solver keeps both bone lengths and clamps the reach. Joint limits (min/max degrees per axis, open sides allowed) live in the bone panel and clamp IK solves and bone gizmo edits alike. New commands `studio3d.ik.toggle`, `studio3d.ik.target`, `studio3d.ik.pole`, `studio3d.bone.limits`.
- 3D Studio: pose library. The current pose of a rig can be saved under a name (at most 64 per rig) and applied back later; a mirror applies the left/right swapped pose (bones paired by name: Arm.L/Arm.R, LeftArm/RightArm and friends), and a blend mixes two saved poses by amount and applies the result - each action is one undo step and stays local to the app. New commands `studio3d.pose.save`, `studio3d.pose.apply`, `studio3d.pose.remove`, `studio3d.pose.mirror`, `studio3d.pose.blend`.
- 3D Studio: export and import polish. glTF export gains options - textures embedded in one .gltf or written as separate files in a ZIP, and a pick of which animation clips to include (per export or as a saved setting); GLB stays self-contained. OBJ import was already bounded and local (96 MB, 20M elements, MTL with size-checked textures, no network) and now has an end-to-end test. The model stats count bones and estimate geometry memory, and the checks panel warns above geometry (512 MB) and bone (256) budgets. New command `studio3d.export.options`; `studio3d.export.glb` and `studio3d.export.gltf` take a clip pick.
- 3D Studio: weight paint brush. With a skinned mesh selected and the weight preview on, the brush paints bone weights directly in the viewport - add, subtract and smooth modes, radius, strength and constant/linear/smooth falloff; a full stroke is one undo step, and every dab keeps at most the top-4 normalised influences per vertex. Re-weighting or binding a mesh whose joints were moved first resets them to the bind pose (with a notice) and restores the pose in the same undo step, so auto-weights never bake a posed joint. New commands `studio3d.skin.brush`, `studio3d.skin.paint`.
- 3D Studio: skinning editing. A plain mesh can be bound to a bone chain with auto-weights - smooth inverse-distance falloff or rigid nearest-joint, deterministic and bounded (at most 250k vertices, 8M vertex-bone checks) - and an already skinned mesh can be re-weighted the same way; both are one undo step, and the mesh keeps its uuid so clips keep binding. The weight preview shows one bone's influence as a heat overlay (never exported, hidden in still renders). New commands `studio3d.skin.bind`, `studio3d.skin.reweight`, `studio3d.skin.preview`.
- Animation Studio: expression-free keyframe modifiers - `wiggle` (deterministic seeded noise, bounded amplitude/frequency) and `loop` (cycle, pingpong, or accumulating offset over the keyed range), serialised in the document and undoable. New commands `animation.modifier.add`, `animation.modifier.remove`.
- 3D Studio: several clips with bone tracks export together and reopen intact. A skinned model can carry a set of clips - each with its own bone rotation keys, per-key easing and clip length - and a GLB export writes them all; the reopened file restores every clip's own keys on the right bones, ready to keep editing. Covered by a new multi-clip round-trip test and an end-to-end test that exports two bone clips and reopens them.
- 3D Studio: bones can be clicked in the viewport - a click near a joint of the visible skeleton overlay selects that bone (meshes still win), and the selected bone shows a small highlight box since bones have no surface of their own. The transform gizmo attaches to bones in rotate mode only, so the bind pose cannot be moved or scaled by accident. Click-select of meshes, the selection outline, gizmo snapping (move, angle, scale) and the material editor (colour, roughness, metalness, texture slots with file limits) were already in place and are unchanged.
- 3D Studio: skeleton basics. Skinned GLB/glTF files open with bounded checks (at most 64 skins, 256 bones per skin, 512 in total), a skeleton overlay can be toggled, and bones are picked from a bone list (they no longer fill the scene list). Rotation keys can be authored on bones in the clip editor - the same timeline, undo, easing, copy/paste/shift and glTF extras as for objects; position and scale keys on bones are refused with a clear message, and bones cannot be deleted or duplicated. Skins round-trip through GLB, glTF and .som3d saves. New commands `studio3d.skeleton.show`, `studio3d.skeleton.select`.
- Animation Studio: export the work area as animated GIF, APNG or WebM video from the render panel (progress with cancel; GIF capped at 300 frames, WebM records in real time up to 60 s and carries the preview audio mix; 64 MB per file). New commands `animation.export.gif`, `animation.export.apng`, `animation.export.webm`.

- 3D Studio: timeline zoom and pan (wheel, buttons, ruler with tick times), multi-select for keys (Ctrl/Cmd/Shift-click) with copy, paste at the playhead and a shared shift in time - each paste or shift is one undo step, even across tracks. Clips can be duplicated with all keys and easing (new command `studio3d.clip.duplicate`), and a loop range previews a part of the clip (new commands `studio3d.key.copy`, `studio3d.key.paste`, `studio3d.key.shift`, `studio3d.anim.range`).
- 3D Studio: visual timeline for animation clips. One lane per position, rotation and scale track with a playhead; drag a key (Esc cancels) or move it with the arrow keys (Shift for bigger steps), double-click a lane to add a key, Delete removes it; each move is one undo step. Per-key easing (linear, step, ease in, ease out, ease in and out) and an auto-key toggle that records transform changes as keys at the playhead, in the same undo step. The clip length and the authoring keys with their easing are stored in the glTF animation extras and come back when the file is reopened here; other apps get the easing baked into extra samples. New commands `studio3d.key.move`, `studio3d.key.ease`, `studio3d.anim.autokey`.
- 3D Studio: animation clip editor. Add and delete clips, rename them, set their length, scrub a timeline, and record position, rotation and scale keys of the selected object at the current time (add, update, remove, jump to a key; one undo step each). Clips are saved in GLB, glTF and .som3d files and come back when the file is opened again. Tracks with spline keys from other tools are played and exported but cannot be edited key by key.
- 3D Studio: textures and their mapping survive GLB, glTF and scene saves (images embedded, scaled down above 4096 px, export refused above 1 GB of decoded texture data, saved scenes above 256 MB must use a separate geometry file); texture mapping (offset, scale, rotation per slot, KHR_texture_transform); play, pause, scrub, loop and speed for the animation clips of an imported glTF (see the clip editor entry); a scene checks panel with triangles, texture memory, draw calls and warnings (heavy scene, large textures, zero scale, texture without UVs).
- Animation Studio: import WAV or MP3 as an audio layer (2 MB per file, 10 minutes, saved inside the local .somnia snapshot), with a waveform, trim, offset and volume keyframes. Preview plays in sync with the audio clock. Audio is not included in exports.
- Animation Studio: text layers pick from eight safe system font stacks; easing can be set per keyframe in the inspector (new command `animation.key.ease`) and ease presets now sit inside the graph editor; keep-world parenting also works with animated layers and parents, keeping the exact pose at the reparent time.
- 3D Studio: textures and their mapping survive GLB, glTF and scene saves (images embedded, scaled down above 4096 px, export refused above 1 GB of decoded texture data, saved scenes above 256 MB must use a separate geometry file); texture mapping (offset, scale, rotation per slot, KHR_texture_transform); play, pause, scrub, loop and speed for the animation clips of an imported glTF (played only, not saved); a scene checks panel with triangles, texture memory, draw calls and warnings (heavy scene, large textures, zero scale, texture without UVs).
- 3D Studio: PBR extras (emissive colour and strength, opacity with opaque/mask/blend mode and cutoff, double-sided), image textures for colour, normal, roughness and emissive slots (PNG, JPEG, WebP; checked by header for size, never fetched from the network), mesh tools (mirror with optional copy, apply scale, merge selected into one mesh), camera view presets (front, back, left, right, top, bottom, isometric) and render to PNG at a chosen size with optional transparent background.
- 3D Studio: primitives are editable by parameters (size, radius, segments) with ranges and a triangle cap, one undo step per edit, and they stay editable after saving as GLB, glTF or .som3d; eight PBR material presets (matte, plastic, rubber, ceramic, steel, gold, copper, brushed metal) beside the metalness and roughness sliders; the scene exports as a self-contained .gltf (new command `studio3d.export.gltf`, `studio3d.object.primitive`, `preset` on `studio3d.object.material`). Opening a glTF/GLB never fetches anything from the network: files that name remote or unselected resources are refused, and unresolved references load as an empty pixel. three.js 0.186.1 (MIT) is now listed in the third-party licenses.
- 3D Studio: autosave and recent scenes (kept in this browser, size-limited, shown on the start screen and in the Save group), Ctrl/Cmd+S saves the scene, and "Save with HDR inside" embeds a custom environment map (up to 16 MB). New commands `studio3d.recent.open`, `studio3d.recent.clear`; `studio3d.save` takes `embedEnv`. CI e2e spec for the .som3d roundtrip, group gizmo, marquee, turntable ZIP and autosave.
- 3D Studio: scene documents (.som3d, version 1): save and reopen objects, materials, lights (incl. shadows and area lights), cameras, unit, environment, snapping and view; geometry is a GLB, embedded or as a separate file; versioned with migrations and strict validation (docs/concepts/3d-studio-document.md). Multi-selection can now be moved, rotated and scaled with one gizmo (about the group centre), nudged, duplicated and deleted as one undo step.
- 3D Studio: select several objects in the view (Shift-click, Shift-drag marquee) or from the scene list; light shadows (directional, spot, point); export STL and OBJ with a unit (m, cm, mm, in) saved per project name; turntable render as a ZIP of PNG frames (frame count, size, transparent background, progress, cancel).
- 3D Studio: snapping (move, rotate, scale steps) for gizmos and nudges, pivot to centre or base, align and distribute for ticked objects (one undo step each), spot and area lights with cone, penumbra, size and colour, OBJ materials from a selected .mtl and its textures (local files only, size-limited, no network), STL unit hint (mm to m), render PNG from a camera object with chosen size and optional transparent background.
- 3D Studio: transform gizmos (move, rotate, scale; W, E, R keys, Tools menu, buttons), numeric fields and Shift+arrows / Page Up / Page Down nudging, one undo step per drag or nudge burst. Camera objects (insert, from current view, field of view, look through). Environment lighting: studio, sky, neutral, none or your own .hdr/.exr, with intensity, rotation and background. Opens .obj, .stl and .ply as well (content-checked, size-limited, three examples loaders in the lazy 3D chunk).
- New 3D Studio (id `3d`, after Photos, before Vibe Space). Opens glTF 2.0 files (.glb, or .gltf with its .bin and textures selected together, meshopt supported), orbit/zoom/pan camera, keyboard orbit, image-based lighting, grid and wireframe toggles, click or list selection, scene outline and model statistics. Hero action "Render still" saves a PNG of the view; Project > Export scene as GLB.
- three.js 0.186.1 (MIT) is loaded only when the studio is shown (own lazy chunk). Dev dependency @types/three 0.186.0.
- Smart Open routes .glb and .gltf (validated by content) to the 3D Studio (open kind `model3d`, handler `open.3d`).
- Staging basics (P1 subset, three core only): insert cube, sphere, plane, cylinder, cone, torus, sun and point lights; numeric position, rotation and scale; PBR color, metalness and roughness; rename, duplicate, delete; undo and redo (one entry per edit); export marks the scene saved; replacing an unexported scene asks first; the scene survives switching studios.
- Not in P0/P1 subset: Smart Open routing of .glb/.gltf, OBJ/STL/PLY, Draco, editing, path tracing, Babylon comparison and the 100k-triangle frame-rate gate (needs a real GPU run on Windows).

# Unreleased: Studio shell regression fixes

- Code Studio restores the inline SVG inspector inside the shared Design section, including paint, fill/stroke gradients, guides, grid and clip/mask controls.
- Vector page settings restore strict SVG replacement as one undoable edit. Rejected or stale imports leave the artwork and history intact.
- Video download/cancel/unavailable notifications follow the video session, including exports started from the new review panel.

# Unreleased: Vector hero export

- Vector Export... opens/focuses the Export panel without writing; output format setup, capped PNG dimensions, separated import controls and five-language labels.

# Unreleased: Design hero export

- Design split Export opens current-artboard SVG or all-artboards ZIP setup and editable project download, with inline status and five-language labels.

# Unreleased: Photos hero export

- Photos header Export opens PNG/JPEG copy setup; shared rail/popover export path, format memory, keyboard shortcut, crop/processing/in-flight gates and five-language labels.

# Changelog

## Unreleased - Slides Present

- Slides now declares Present in the shared header hero slot, with current/from-start interactive commands and F5 / Shift+F5 shortcuts.
- Added static-image full-window/fullscreen presentation, bounded keyboard and click navigation, numeric jumps, black screen, auto-hiding accessible controls and focus restoration.
- Screen-size images obey the renderer budget and pre-render the next slide. Presentation labels are translated in all five locales.
- Added unit and local browser interaction tests. Native fullscreen and production WASM output remain build-device checks.
## Unreleased - Per-studio hero actions

- Code Studio: the header hero is now Preview (the existing live-preview toggle) with a pressed state; it is disabled with the reason "No previewable page" when the open files have no previewable HTML page, and framework projects stay out until their startup review.
- Documents Studio: the header hero is now Export. It opens a small export popup preselected to Word document (.docx) "save a copy"; the copy never overwrites the opened document, and the loss warning with its Save anyway confirmation gates every entry point. `documents.saveCopy` is a real command now (Project menu and palette).
- Sheets Studio: the header hero is now Smart Formula. It opens and focuses the formula builder seeded from the current selection. The builder requires an explicit target cell outside the source range, asks before replacing a non-empty cell and applies the reviewed formula exactly once.
- Hero slot: toggle heroes can render `aria-pressed` (`pressedWhen` / `pressedTooltipKey`), and a disabled hero can explain why via a command's `disabledReason` key.
## Unreleased - Vibe Space task creation

- One New task header action opens the existing creation form without starting work; repeated clicks preserve drafts, and duplicate canvas-header creation actions are removed.


## Unreleased - Video export review

- Video header export opens whole-timeline review/progress with capability gates, deliberate silent output and honest download outcomes.


## Unreleased - Sound export review

- Sound header Export audio opens a processed-clip WAV review with pending-render gates, clip identity checks and save/download/cancel outcomes.

## Unreleased - Update pill prerelease detection

- Compare full release versions, including alpha/beta numbers, so beta.2 detects beta.3 and beta.3 detects beta.10 without offering equal versions or downgrades.
- Changing the channel or automatic-check setting refreshes the pill immediately. Prerelease tags stay out of stable even if a release has the wrong GitHub flag.
- Signed update manifests use the real artifact filenames, reject missing or ambiguous artifacts, and accept prerelease versions in the updater test harness.

## Unreleased - Header hero action slot

- The header slot next to the Account pill can now show a studio's primary action as a split button (main action plus a chevron menu) instead of Publish. Studios opt in with one data field, `header.heroAction`; studios without it keep the Publish button.
- The chevron menu always ends with Publish, so deploy stays reachable. A running publish still shows a spinner on the chevron and in the menu.
- New string `hero.more` in all five languages.

## Unreleased - Studio tabs pill

- Keep the global studio switcher visible when entering Vector or while the legacy raster editor is active.
- Active studio tabs now use the same short names as their tooltips across all ten studios, including Sound, Slides and Vector.

## Unreleased - Slides shell panels

- Slides overview and text outline now provide search, thumbnail loading, compact rows and navigation. The shared inspector adds source-bound text editing, undo/redo, copy export, presentation metrics and compatibility diagnostics.
## Unreleased - Code studio panels

- Code panels use separate registered hosts for files, layers, search, components, CSS and versions.
- Added a filterable DOM outline, responsive preview controls and a section-based inspector with editable link/media/accessibility attributes and source statistics.
- Interaction edits are undoable and refuse locked/read-only nodes, event handler writes and executable URL schemes.
## Unreleased - Code studio shell

- The Code studio runs on the studio shell: the left rail (Layers, Files, Search, Components, CSS, Versions, plus the new Responsive and Outline panels) and the right rail (one inspector with Design, Interactions and Source sections) are declared per studio, with rail icons from the shared registry and tooltips in all five languages.
- Rails are customizable: drag icons to reorder them, right-click to move, pin, hide or reset; the layout survives restarts.
## Unreleased - Photos side panels

- Photos now has real side panels: histogram with clipping stats, Light, Color, Effects and Detail sliders, Transform (crop with aspect presets, straighten, rotate, flip), built-in and saved looks, export, session history with undo, redo and jump, and file info.
- Photos edits are available as commands (`photos.*`) for the command palette. Agents can read state and the histogram but cannot change the image.
## Unreleased - Video studio shell

- Video has a source library and sequence panel, customizable rails, and a selection-aware inspector for trimming, title styling, audio, crossfades and export copies.
- New panel actions use typed interactive commands with five-language labels. Original media stays unchanged.
## Unreleased - Sound studio shell

- Sound now has customizable Audio clips, Selection and Effects rails and a generic audio inspector with source statistics, levels/fades and processing controls.
- Audio edits, selection, listening, transport and WAV-copy export are typed UI commands with five-language titles. Export waits for queued processing instead of saving an older render.

## Unreleased - server frameworks (Next.js, Astro, SvelteKit, Nuxt)

- New project now offers Next.js, Astro, SvelteKit and Nuxt in TypeScript or JavaScript, with pinned lockfiles, a protected loopback preview and a note that the finished app needs Node on the server.
- "Build for publishing" also builds server apps. The result is a `DeployArtifactManifest` of kind `node` (Next standalone, Nuxt `.output`, Astro with `@astrojs/node`, SvelteKit with `adapter-node`). Astro and SvelteKit bundles carry package files and are installed on the server with `npm ci`.
- Telemetry is switched off for every project run (Next, Astro, Nuxt, `DO_NOT_TRACK`). The runner finds Astro's current `bin/astro.mjs`.
- Detection tells static from server output from the project setup: Astro needs `@astrojs/node`, SvelteKit's `adapter-static` means static, Next `output: 'export'` means static.

## Unreleased - live static publishing

- Publish now connects over embedded, pinned-key SSH, checks the prepared server, uploads verified immutable releases, and switches the current site atomically.
- Persistent server pins and OS-keychain deployment keys replace session-only placeholders. Private keys never enter the renderer or project files.
- Publish reports connection, checks, verified file counts, switch and health progress. Cancellation stops before the switch, kept releases can be restored, and a failed health check restores the previous site and Caddy configuration.
- Release history has a read-only current-release lookup. Static framework builds use the existing local output; the separate Node pipeline must be supplied before Node targets can publish.

## Unreleased - first-time publish setup

- Publish setup now walks through key creation, host fingerprint review, the full bootstrap script, and DNS records. A reviewed script can run over pinned SSH using a one-connection login and sudo password; passwords are not saved.
- DNS checks compare system and DNS-over-HTTPS results, warn about stale IPv6 records and missing www, and explain pending HTTPS. Port 80/443 guidance is instructions only; Somnia does not probe or change provider firewalls.
- Public keys can be shown again. Running publishes offer cancellation before the switch. Rollback Live badges use the remote current symlink, not session history.

## Unreleased - static build for publishing

- "Build for publishing" panel for static framework projects (Vite React, Vue, Svelte, Solid, Astro, Next export, SvelteKit static adapter, Nuxt generate): builds locally, finds the output folder from package.json and framework config without running project code, lists every file with its SHA-256 and a stable build ID.
- The artifact is a `DeployArtifactManifest` of kind `static`. Links, `.env*`, keys, `.git` and `node_modules` in the output are refused. Nothing is uploaded.
- Single-page apps show the nginx and Apache fallback rule; it is never written to a server without confirmation.

## Unreleased - Vue, Svelte and Solid projects

- New project now offers Vue, Svelte and Solid next to React, each in TypeScript or JavaScript, with pinned lockfiles and the same protected loopback preview.
- Alt-click in the preview opens the source of an element in Vue and Svelte components as well as JSX.
- Framework projects show their real name in the detected banner (Vue, Svelte, Solid).

## Unreleased - deploy SSH transport

- Embedded SSH/SFTP transport for live deployment: pinned host keys checked before login, keychain key auth, confined atomic uploads, one-time sudo server setup script. No UI yet.

## Unreleased - framework runner

- Explicit-consent framework helper download with pinned SHA-256 verification.
- Local project install, build and protected preview runner with credential scrubbing, redacted bounded logs, timeouts and process-tree cleanup.
- Framework helper status and removal in Settings; isolated native preview with no editor permissions.

## Unreleased - framework projects

- Create React projects from bundled TypeScript or JavaScript templates with pinned lockfiles.
- Detect framework projects without running code; show helper setup, preview controls and redacted app output.
- Keep framework previews on token-protected loopback with a dev-only click-to-source plugin.

## Unreleased

- CLI/TUI: answer a `needs_input` question inside `somnia-tui` (protocol v1 additions `hello` and `answer`, `task.answers` in the engine start message; clients without the handshake behave as before). Real-pty end-to-end test.
- somnia-tui: plain mode for pipes and CI (no raw mode, no ANSI, review left pending, exit 2), golden TestBackend screen snapshots, and a fix for a panic on very narrow terminals.
- Headless `somnia` CLI ships as release archives for Linux and Windows x86_64 (`somnia-cli-<ver>-<os>-x86_64`) with `SHA256SUMS`. `somnia --version` reports the app release, commit and target. No macOS build.

- CLI: `somnia run "<task>"` runs an agent task on a local task branch with exit codes 0 (done), 1 (failed) and 2 (needs input or review). `--yes` makes one local commit; the CLI has no fetch, pull or push path. Background runs (`--detach`, `attach`, `status`, `cancel`) use a private same-user channel (Unix socket, or a user-only named pipe on Windows). Usage errors now exit 1 instead of 2, and `--detach` reports a non-private runtime directory immediately. Docs: [docs/cli/](docs/cli/).
- CLI: `somnia run` now drives the real agent engine. A Node sidecar runs the desktop agent session and file tools headless (OpenRouter, Claude, OpenAI API key, Ollama). Tool calls, model, token usage and cost are logged live and mapped to the TUI. `--bare` skips project notes. Typed failures (auth, consent, budget, scope, conflict) keep their code. See `docs/agent/TASK-ENGINE-CONTRACT.md`.

- Smart Open keeps recognized files automatic. Ambiguous handlers now show a studio chooser; unknown-type files with verified text show an explicit "Open as text?" confirmation. Cancel leaves that file unopened. Unsupported or invalid files only notify. Choosing a studio still uses the normal prepare, unsaved-change approval, revision validation and commit flow. A newer open request closes an older unanswered chooser.

## Unreleased

- Live preview runs page scripts by default in the existing isolated sandbox. A global Preview setting turns scripts off without a prompt; saved per-project choices still take priority.

## 11.2.0-beta.1 - 2026-10-07

- Direct OpenAI/Claude BYOK providers, live catalogs and metadata-only auth.
- Native fixed-endpoint streaming transport with OS-side saved-key resolution.
- Token batching, stopped/interrupted partial answers, safe errors and explicit retry.
- Existing cloud consent, review-only writes and macOS ad-hoc checks retained.

## 11.1.1-beta.1 - 2026-10-07
- Agent: remember provider/model locally and API key in the OS credential store. No plaintext key fallback.
- Agent: create, edit, delete and enable custom prompts, persisted locally and included in every AI provider request. Cloud consent and file access approval remain separate.


- macOS: explicitly ad-hoc sign the complete app bundle, including sealed resources.
- CI: verify DMG integrity and signatures in the app, mounted DMG and updater archive.
- macOS still requires a security exception: this beta is not Developer-ID signed or notarized.

Changes are grouped by product release. Release notes and installation guidance
live in [`docs/releases/`](docs/releases/). Entries describe implemented behavior,
not roadmap promises.

## 11.1.0 - 2026-10-07

This entry collects the beta.6 wave and the features already present in
11.0.0-beta.5. It was released from the commit that passed CI; Windows and macOS acceptance testing by the maintainer is still outstanding. See the
[release-notes draft](docs/releases/v11.1.0.md) for limits and release checks.

### Added

- Collaboration identity from the local profile: Join prefills the profile name;
  a successful join can save a name into an empty profile without overwriting an
  existing one. Hosts use their profile name or the Host fallback. Session-only
  48 x 48 JPEG avatars appear in chat and the mention picker, with initials as
  the fallback. Mentions keep participant IDs rather than matching names alone.
- A session-only Chat button above Agent in the right rail, an unread badge
  capped visually at `9+`, and `Mod+Alt+C` to toggle chat. Opening Agent switches
  back to the Agent tab; ending a session returns the panel to Agent.
- Glass v2: 0-100% opacity, 0-40 px CSS blur, and separate Window frame, Panels
  and Code editor scopes. The Code editor scope is off by default and warns
  below 60% opacity; measurable low-contrast combinations below 55% get a 55%
  floor. Unsupported native backgrounds and high contrast remain solid.
- LaTeX stage 1: lazy-loaded KaTeX formulas in Markdown, `.tex` syntax
  highlighting and a limited text/math preview. Formula errors feed Problems,
  the editor gutter and the status bar. Trust-requiring KaTeX commands are
  blocked; `.tex` file, include and write commands are never executed.
- Native Markdown editing with Source, Split and Preview views, an icon toolbar,
  link and code-block dialogs, list continuation, `Mod+B`/`Mod+I`, bidirectional
  block-based scroll sync, Reveal in source and relative project-file links.
  Preview supports tables, task lists, footnotes and heading anchors. Raw HTML
  is disabled and remote images are not fetched.

### Included from 11.0.0-beta.5

- Encrypted, session-only chat with plain-text messages, replies, participant-ID
  mentions, attachments and local unread state, plus activity-aware code badges.
  Chat is separate from project files, saves, recovery, export and AI context.
- Save, window-close and Close Project dialogs share the Export-style shell,
  file card and action layout. The save dialog shows the actual new-folder name;
  close dialogs keep explicit save/keep, discard and cancel choices.
- Glass blur and inner-panel controls, persisted appearance settings, and a
  configurable 0-25 px outer corner radius. Dialog and control radii remain
  separate from the outer-radius setting.

### Fixed

- Chat uses the shared outer-radius token and no longer duplicates its opener
  in the status bar.
- The Markdown preview uses the KaTeX pipeline with source-line mapping retained.
  Formulas are inserted into text positions, never into HTML attributes; code,
  escaped dollar signs and price-like text remain protected.

### Limitations

- LaTeX preview is not a compiler: no PDF compilation, package processing,
  BibTeX or `\label`/`\ref` support. `align` has one number per block.
- Markdown preview is read-only, including rendered task checkboxes. Scroll sync
  maps rendered blocks, not exact pixel positions. Remote images remain absent.
- Glass needs successful Windows Acrylic/macOS Vibrancy activation. Web, Linux,
  high contrast and failed native activation use opaque backgrounds. CSS blur
  and radius controls do not override the OS desktop blur or window mask.
- Collaboration profile names and avatars are session presentation, not verified
  identity. Chat has bounded history/attachment limits and no persistent archive.
  Native Windows/WebView2 and two-PC LAN/firewall acceptance remain release gates.

### Sound session foundation (integration slice)

- Add bounded multitrack session documents, atomic history, strict JSON validation, deterministic stereo mixing and float WAV encoding without new dependencies. This is a headless foundation; Arrange/Mix UI follows separately.
- Correct the outdated Sound AI bridge documentation.
- Sound Arrange & Mix: bounded multitrack timeline with source waveforms, split/trim/duplicate/move, fades, clip gain, track gain/pan/mute/solo, markers, looping and undo/redo. JSON save/reopen with explicit relinking, plus worker-rendered mix audition and WAV export; no new dependencies.
- Sound session follow-up: native-folder JSON save with collision/revision/readback checks, work-registry and native close protection, undoable track removal and direct fade handles. Real compressed-source validation remains a desktop/CI check.
- Sound B1: ordered per-track/master insert racks, bypass and local presets; version-2 session migration and float-PCM DSP bridge. Active DSP verification requires rebuilt WASM/CI; no new dependencies.
- Sound B2: real revision-bound stereo spectrum and sample-peak analysis; pinned meter bridge for loudness/true peak, clearly unavailable without built WASM and unverified until reference validation.
- Sound B3: reviewed custom LUFS/true-peak targets with explicit optional limiting, remeasured preview, accept/cancel and stale-output guards. Requires actual built meter facts; unavailable measurement disables the action.
