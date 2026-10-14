# Somnia roadmap

Somnia is a local-first visual HTML/CSS editor (Dreamweaver successor), MIT licensed. This plan lists what ships when, what each version depends on, and the main risks. Time windows are rough estimates for one continuously working builder; they move when Windows testing feedback arrives or CI is red. Windows is tested by the maintainer only, so every release ships with a short Windows checklist.

Release rules: every release comes from a commit whose four CI jobs (frontend, native, windows, macos) are green; notes follow Highlights, Fixes, Known issues, Install, Checksums; installers are unsigned until a signing key exists.

## v9.6.2 (in release, 4 Oct)
Empty start (no starter project), session restore, Project menu (Open folder, Open file, Save, Export, Close), Save dialog with new folder, Export dialog (ZIP, folder, single HTML, Markdown), OS file drop, window size and position restore, find bar below the editor, encode/decode special characters, new themes (Blue Ice, Grape Red, Melon Pink, Coffee Shop, Forest Green), 25 px dialog radius, selection and match contrast, status bar fix.
Depends on: nothing. Risk: new Windows window permissions and drag-drop setting are CI-tested only.

## v9.6.3 (about 1 day)
- Breadcrumbs (DOM path in the status bar, click selects, syncs code and design).
- ~~DOM tree sidebar~~ removed in v9.10: redundant with Layers (which filters by tag, id and class).
- Apply formatting (HTML, CSS, JS) via Prettier standalone, loaded lazily, indentation from Settings, selection or file, undoable.
- Fixes from Windows feedback.
Depends on: element tree already in the store. Risk: Prettier bundle size (lazy chunk, measured and reported).

## v9.7 Drag and drop (about 1-2 days)
Layers drag and drop reorder and re-parent, canvas sibling reorder, drop indicators, undo, keyboard alternative (move up/down, indent/outdent), search result jump already done.
Risk: drop targets inside iframes need the preview bridge; keyboard path ships first so accessibility never depends on pointer DnD.

## v10 Quick wins (about 3-5 days, in two or three releases)
- Diff viewer: file vs file, editor vs disk, vs last save; side by side and inline; highlight and next/previous diff. Builds on the existing source diff and conflict compare.
- Live preview hardening: reload behaviour, linked CSS/JS refresh, error overlay, device frames.
- Container drop and align helpers, positioning tools (spacing guides, align/distribute).
- Benchmarks: large files, many nodes, startup time; published numbers and budgets in CI.
- README and project site positioning; Dreamweaver pain point research turned into small fixes.
- Folder drop, more file types, Open file with save in place (needs a native read/write path command).
Depends on: v9.7 for container drop. Risk: benchmarks may expose editor-core limits; fixes then take priority over features.

## v10 Internationalisation (i18n) - planned, docs only for now

Goal: Somnia is usable in several languages. Nothing is changed in the code yet.

Infrastructure:
- Move all user-facing strings out of the code into message catalogues (one JSON file per language, stable keys).
- Pick an i18n library (small, no runtime network, supports plurals and interpolation). Decision documented in a short note before the switch.
- Language setting in Settings with the option "Follow system" (default), plus an explicit list of languages.
- Missing-keys test in CI: every language must have all keys of the base language, no unused keys, placeholders match. Fallback to "en" at runtime.
- Command palette entries, dialogs, tooltips, aria labels and error messages are included. Date and number formats follow the chosen locale.

Languages:
- Base: en
- First wave: de, es, fr, pt-BR
- Later: ja, zh-CN (needs a font and line-break check)

Open: who reviews translations (maintainer or community PRs), and how the extension index handles localised names.

## v11 (about 1-2 weeks)
- Table editor (insert, merge/split cells, rows/columns, accessible headers).
- Collaboration spike (ADR-005 draft): CRDT evaluation, local network or relay, presence; a spike and a decision, not a promise of shipping.
- Signed one-click updater (Tauri updater plugin, update manifest on GitHub releases).
Depends on: a Tauri signing key created and stored as a GitHub secret by the maintainer (decision and secret are his, not the builder's). Windows code signing certificate is a separate, paid decision.
Risk: collaboration scope; the spike ends with a go/no-go.

## v12 (proposal, about 2 weeks)
- Component system: reusable blocks with variants, project-level library, import/export.
- CSS tooling: variables panel, class manager, responsive breakpoints editor.
- Accessibility checker (contrast, headings, alt text) feeding the Problems panel.
- Extension index on GitHub with install from inside the app (ADR-003 SDK), curated first-party extensions.
- Optional Git integration (status, diff, commit) using the diff viewer.
Depends on: v10 diff viewer, v11 updater for smooth extension and app updates.

## Microsoft Store (MSIX) - proposal
- Package the Windows build as MSIX and publish it in the Microsoft Store. Microsoft signs store packages, so no paid code signing certificate is needed for that channel. Free for individual developers (to be re-checked on the Partner Center page when the account is created).
- Needs from the maintainer: a Partner Center developer account (created by Philipp, not by the builder), app name reservation, privacy policy URL.
- Builder work: MSIX packaging in CI (Tauri bundle target or makeappx), store listing text and screenshots, update flow decision (store updates replace the in-app updater for this channel).
- Risk: store certification review, MSIX sandbox limits on file access (folder picker works, arbitrary paths may not).

## Open decisions for the maintainer
1. Tauri signing key as GitHub secret (v11 updater).
2. Windows code signing certificate (removes SmartScreen warnings; paid).
3. Collaboration direction after the spike.
4. Microsoft Store: Philipp creates the Partner Center account and reserves the name.


### Animation P2 (2026-10-14, integration pending)

- Implemented: signed per-channel speed graph, separate X/Y easing for straight vec2 properties, bounded cached arc-length position paths, editable text/shape source settings, ordered blur/tint effects, bounded canonical PNG/JPEG and strict basic-SVG snapshot import. Existing P1 features/tests retained.
- Validation: 69 Animation + Interface media unit/security tests pass; real-component German light/dark pixel review and transparent PNG render inspected. Full-app E2E and native/WASM gates remain CI-only. No new dependencies.
- Scope/limits and validation details: `docs/animation-p2.md`. Mask/matte, precomp, footage/audio, animated effects, expressions, tracking and compressed exports remain later work.

### Animation P3 (2026-10-14, integration pending)

- Implemented: animated blur/tint strength, cycle-safe parent/Null controls, fade/slide/bounce/typewriter entrance presets, markers/frame timing aids, explicit experimental local .somnia snapshot save/open. No final container manifest or format association decision.
- Validation: Animation + Interface media unit/security tests, DS ratchet, isolated German light/dark pixel and local snapshot round-trip review. Full-app/native/WASM coverage remains CI-only. Details/limits: `docs/animation-p3.md`.

### Animation P4 (2026-10-14, integration pending)

- Implemented: explicit static keep-world parenting, tint colour and discrete bypass keys, editable bounded shape paths, outline trim/dash presets, stroke-safe reference render bounds. Bounded PNG sequence export uses StudioProgress and real cancellation; GIF/WebM not claimed.
- Validation: 85 Animation + Interface media tests, DS ratchet, isolated German light/dark pixel review, real PNG sequence download/cancel and extracted-frame pixels. Native/full-app/WASM gates remain CI-only. Details: `docs/animation-p4.md`.

### Animation P5 shape slice (2026-10-14, integration pending)

- Implemented: rounded rectangle/star/polygon primitives, bounded parameters, fill/stroke and two-stop linear gradient; shared preview/reference export geometry, local snapshot validation. 88 Animation + Interface media tests; inspected UI and rendered PNG.
- Remaining P5: bounded WAV/MP3 import/audio layers, waveform, trim/offset, volume keys and synced preview. No audio mux/export claim. Details: `docs/animation-p5-shapes.md`.

### Animation P5b (2026-10-14, integration pending)

- Implemented: WAV/MP3 audio layers embedded in the local `.somnia` snapshot (2 MB per file, 10 minutes, 4 MB total), bounded waveform from a validated peak table, trim, offset and volume keyframes, and preview playback driven by the audio clock so picture and sound share one time base. Audio is not part of any export; no mux, no codecs, no new dependencies.
- Validation: 19 new and 102 total Animation unit tests, DS ratchet, isolated Chrome German light/dark pixels and a real AudioContext sync measurement. Full-app/native/WASM gates remain CI-only (`tests/animation-p5b.spec.ts` not run). Details and limits: `docs/animation-p5b.md`.

### Animation P8 (2026-10-14, integration pending)

- Implemented: expression-free keyframe modifiers. `wiggle` adds deterministic seeded noise per channel (bounded amplitude/frequency), `loop` repeats the keyed range as cycle, pingpong or accumulating offset. Modifiers are serialised in the document, validated on load, undoable via `modifier.add`/`modifier.remove` edits and the new `animation.modifier.add/.remove` commands, and applied in `scene.ts` so preview and every export agree. No new deps, no UI changes.
- Validation: 6 new and 121 total Animation unit tests, i18n, tsc, command registry in sync. Pre-existing upstream `check:ds` red on interface inline styles (not this area). Timeline parenting UI and per-character text animators explicitly deferred. Details and limits: `docs/animation-p8.md`.

### Animation P7 (2026-10-14, integration pending)

- Implemented: the render panel exports the work area as animated GIF (own GIF89a encoder: median-cut palette, from-scratch LZW, loop, per-frame delays), APNG (browser PNG frames re-assembled with acTL/fcTL/fdAT) and WebM (real-time `canvas.captureStream` + `MediaRecorder`, VP9/VP8 with Opus; the P5b preview mix joins the recording when audio layers are audible). All three run with StudioProgress and cancel, under shared caps (GIF 300 frames, WebM 60 s real time, 64 MB per file). New commands `animation.export.gif/.apng/.webm`; no new dependencies.
- Validation: 7 new and 115 total Animation unit tests, DS ratchet, isolated Chrome German light/dark pixels plus real GIF/APNG/WebM decode checks. Full-app/native/WASM gates remain CI-only (`tests/animation-p7.spec.ts` not run). Details and limits: `docs/animation-p7.md`.

### Animation P17 (2026-10-14)
- Implemented: one key clipboard model (`keysClipboard.ts`) with adapters for transform and mask keys; copy/paste between transform and mask properties where value types match, from both graphs. One undo per paste. Details: `docs/animation-p10.md` (P17 section).
- Open: box selection across properties and one mixed graph view, per-point lanes, native webview check.

### Animation P18 (2026-10-14)
- Implemented: `keyTargets.ts`, one key model for transform and mask properties (list, select, move, ease as one edit list = one undo step), and a Mixed graph view (`MixedGraph.tsx`) with box-select across properties; moves in time and ease apply to the whole mixed selection. Existing single-property graphs are unchanged.
- Open: value drags and ease handles still live in the single-property graphs; the transform and mask graph components are not yet merged into one renderer. Playwright E2E for the mixed graph is CI-only and not written.

### Animation P19 (2026-10-14)
- Implemented: Mixed graph now drags keys in time and value (first channel for vec2, values clamped to property limits), ease handles for a single selected key, copy/paste/delete across properties through the shared clipboard (`multi` clip kind), and keyboard-only multi-select (Enter select, Space toggle, Ctrl+A, Esc, Delete, Ctrl+C/V, arrows for time and value). One undo step per action.
- Open: the transform and mask graph renderers are still separate components (merge not attempted); value drag in the Mixed graph edits only the first channel of vec2 properties.

### Animation P20 (2026-10-14)
- Implemented: Mixed graph drags both channels of vec2 properties (X/Y switch) and pastes a single-property clip onto the properties of the selected keys; three spring-style ease presets (`overshoot`, `anticipate`, `spring`, cubic handles beyond 0..1) with a live preview on hover or focus in the Mixed and transform graphs; layer stagger (Shift or Ctrl click adds layers, offset in frames per layer, one undo step); command `animation.keys.easeAll` (Edit menu, F9 inside the Mixed graph).
- Open: a cubic cannot ring several times, so multi-bounce needs baked extra keys (not built); stagger moves transform and mask property keys, not path-morph keys or layer in/out points; no global shortcut allocated for the new commands; stagger/ease UI has no Playwright spec (CI-only).

### Animation P21 (2026-10-14)
- Implemented: baked multi-bounce (`bounceClip`/`bounceTargetKeys`, 1 to 5 bounces, heights shrink by 0.4, landing on the second key, ordinary editable keys, transform and mask properties, scalar and vec2) with hover preview in the Mixed graph, a timeline button and `animation.keys.bounce`; stagger also moves path-morph keys and layer in/out points (checkbox, `timing` param); animation commands are now part of the ui-commands inventory (369 commands) and `animation.keys.easeAll` has the global shortcut Mod+Alt+E.
- Open: bounce decay is fixed at 0.4 (not exposed); bounce needs two neighbouring selected keys per property and refuses segments shorter than 2n+1 frames; stagger leaves audio layers and text animators alone; no Playwright spec (CI-only).

### Animation P16 (2026-10-14)
- Implemented: mask graph multi-key selection (click, shift, box), group move/revalue and ease in one edit, speed mode, copy/paste of several mask keys between masks (same value type). Transform graph unchanged. One undo per edit, five locales, DS-clean. Details: `docs/animation-p10.md` (P16 section).
- Open: copy/paste between mask and transform properties, a shared graph core, per-point lanes, native webview check.

### Animation P15 (2026-10-14)
- Implemented: mask keys in the graph editor (value curves, key time/value drag, ease select, in/out ease handles; path key ease list). Transform graph behaviour unchanged. One undo per edit, five locales, DS-clean. Details: `docs/animation-p10.md` (P15 section).
- Open: speed mode and multi-key selection for mask keys, one shared graph core for transform and mask keys, per-point lanes, native webview check.

### Animation P14 (2026-10-14)
- Implemented: ease per path key, insert/delete single path points (static and morphing paths), copy/paste of masks between layers and of mask keys. One undo per action, five locales, DS-clean. Details: `docs/animation-p10.md` (P14 section).
- Open: mask keys in the graph editor (needs the editor generalised beyond transform keys), per-point/per-handle-group lanes, native webview check.

### Animation P13 (2026-10-14)
- Implemented: pen tool for path masks (click to add, drag for bezier handles, click first point to close), on-canvas bezier in/out handle dragging, path morph keys (Animate path, one timeline lane per path mask, edits write keys at the playhead). One undo per gesture, five locales, DS-clean. Details: `docs/animation-p10.md` (P13 section).
- Open: independent per-point keys (a lane per point group), ease per path key, deleting single points, native webview check.

### Animation P12 (2026-10-14)
- Implemented: mask key lanes on the timeline (diamonds: select, drag/move, delete, ease preset) and on-canvas mask handles (move, resize rect/ellipse, drag path points). One drag is one undo step. Five locales, DS-clean. Details: `docs/animation-p10.md` (P12 section).
- Open: in/out bezier handle dragging, pen tool, per-point keys, mask keys in the graph editor and transform key selection, native webview check.

### Animation P11 (2026-10-14, integration pending)

- Implemented: keyframeable masks (position, size, feather, opacity, bake on animate off), bezier path masks (2..32 points, smooth or corner, closed/open) and per-mask opacity. Same builder for viewer and all exports, undoable, validated, five locales. Details: `docs/animation-p10.md` (P11 section).
- Validation: 2 new Animation unit tests (6 in the P10 file), i18n, DS ratchet unchanged, isolated Chrome pixel review. Full-app spec remains CI-only (`tests/animation-p10.spec.ts` extended). No new dependencies. Open: pen tool, per-point path keys, mask expansion, path mask animation of shape.

### Animation P10 (2026-10-14, integration pending)

- Implemented: up to 4 layer masks (rect/ellipse, add/subtract, feather 0..64 px, invert), track mattes (alpha/luma, invert, no chains, source hidden on its own), rotation and colour for text animators. One mask builder for viewer and all exports, undoable, validated, five locales. Details and limits: `docs/animation-p10.md`.
- Validation: 4 new Animation unit tests, i18n, DS ratchet unchanged, isolated Chrome pixel review (`test/animation-preview.html?masks=1`). `tests/animation-p10.spec.ts` is CI-only. No new dependencies.

### Animation P9 (2026-10-14, integration pending)

- Implemented: timeline parent picker on every layer row (cycle-free list, keep-world toggle in the timeline toolbar, undoable); per-character text animators (up to 4 per text layer: selector range with softness, keyable range offset, shift, scale, opacity), deterministic, shared by viewer and all exports, validated and bounded (1000 characters while animators exist). Details and limits: `docs/animation-p9.md`.
- Validation: 7 new Animation unit tests, i18n in five locales, DS ratchet unchanged, isolated Chrome pixel review (`test/animation-preview.html?animators=1`). `tests/animation-p9.spec.ts` is CI-only. No new dependencies.

### Animation P6 (2026-10-14, integration pending)

- Implemented: text layers pick one of eight safe system font stacks (the document stores the id, rendering resolves the CSS stack, nothing is bundled or fetched), per-key ease choice in the inspector with the new `animation.key.ease` command, ease presets inside the graph editor, and keep-world parenting for animated hierarchies (exact pose at the reparent time, spatial tangents re-expressed, per-channel easing under a rotated parent refused).
- Validation: 6 new and 108 total Animation unit tests, i18n, DS ratchet, isolated Chrome German light/dark pixels. Full-app/native/WASM gates remain CI-only (`tests/animation-p6.spec.ts` not run). Details and limits: `docs/animation-p6.md`.

### Animation P22 (2026-10-14, integration pending)

- Implemented: text animator word unit, Wave/Reveal selector stagger with live preview, motion preset library (five built-ins, local user presets saved from selected keys, apply to the selected layers in one undo step), three commands, i18n in five locales.
- Validation: 2 new Animation unit tests (153 total), DS ratchet unchanged, ui-commands inventory (372), isolated Chrome check (hover 0 history steps, apply +1).
- Not covered: line unit (single-line text rendering), inspector offset field still ±100, presets live in localStorage not the document, Playwright specs CI-only.

### Animation P23 (2026-10-14, integration pending)

- Implemented: motion presets stored in the document (versioned, bounded, validated, survive snapshot save/open, one undo per save/delete/import), one-time migration from the P22 localStorage presets, JSON export and import with preview before adding, two commands, i18n in five locales.
- Validation: 1 new Animation unit test (154 total), DS ratchet unchanged, ui-commands inventory (374), isolated Chrome check.
- Not covered: migration runs on open and counts as an undo step; the legacy browser copy is not deleted; file picker flow is not unit tested (Playwright CI-only).

### Animation P24 (2026-10-14, integration pending)

- Implemented: numeric cubic-bezier editor for key pairs with curve preview, named easings saved in the document (versioned, bounded to 50), elastic bake (1 to 5 swings, clamped to the property range), commands animation.keys.cubic / elastic and animation.ease.save / apply / delete, five locales; "1 presets" plural wording fixed.
- Validation: 1 new Animation unit test (155 total), DS ratchet unchanged, ui-commands inventory (379), isolated Chrome check (cubic edit +1 step, save +1 step).
- Not covered: bounce and elastic are baked keys, not curve presets (one cubic cannot ring); no new draggable handles beyond the existing graph ones; the editor sits at the bottom of the graph sidebar, so the curve preview is partly scrolled in the short graph pane.

### Animation P25 (2026-10-14, integration pending)

- Implemented: collapsible Easing editor whose curve stays visible in the graph sidebar; path-to-path morph key (`morphTo`) for path masks with the same point count and closed flag, hover preview, inline refusal otherwise, one undo, five locales.
- Validation: 1 new Animation unit test (156 total), DS ratchet unchanged, ui-commands inventory (379), check:layers, isolated Chrome check (morph +keys, refusal text visible).
- Not covered: morph works between path masks only (shape layers are rect/ellipse sources, no path source yet); no point resampling, matching or reversing; point order is by index.

### Animation P26 (2026-10-14, integration pending)

- Implemented: arc-length point resampling for morph between paths with different point counts (bounded to 32 points, one undo, hover preview), reverse and start-point rotation, morph refusals localized in five locales via locale keys.
- Validation: 1 new Animation unit test (157 total), DS ratchet unchanged, ui-commands inventory, check:layers, isolated Chrome check in German.
- Not covered: resampling can round off sharp corners; start point rotation only on closed shapes; no automatic best-start search; shape layers still have no path source.

### Animation P27 (2026-10-14, integration pending)

- Implemented: path shape layers with optional bezier handles and morph keys (`pathKeys`), shared renderer for canvas and exports (plain polygons render as before), morph into another path layer (match points, reverse, start point, localized refusals, hover preview, one undo), "Animate path" in the layer inspector, "Make path layer" on path masks, commands `animation.layer.path` and `animation.mask.toLayer`.
- Validation: 4 new Animation unit tests (161 total), DS ratchet unchanged, ui-commands inventory (381), check:layers, isolated Chrome check.
- Not covered: no pen drawing of layer paths on the canvas, no handle dragging for layers, shapes limited to the layer box (0..1), morph ignores layer transform differences. Playwright E2E is CI-only.

### Animation P28 (2026-10-14, integration pending)

- Implemented: canvas pen for path layers (click adds a point, drag pulls handles, click the first point or the Close button closes, Esc/Enter finishes, first click on empty selection creates the layer), dragging points and bezier handles of a selected path layer (keys at the playhead when animated, Alt breaks symmetry, arrow-key nudging), command `animation.layer.pen`, one undo per click or drag, five locales.
- Validation: 3 new Animation unit tests (164 total), DS ratchet, ui-commands inventory (382), check:layers, isolated Chrome check with real pointer events (create, drag handle, close, Esc; undo steps counted: 6).
- Not covered: no on-canvas point insert or delete, no outline drag to move the layer, pen points stay in the layer box. Playwright E2E is CI-only.

### Animation P29 (2026-10-14, integration pending)

- Implemented: click on the outline inserts a point, Alt-click or Delete removes the selected point, double-click or toolbar button toggles smooth and corner, dragging the outline moves the layer (parent-aware, keyed when position is animated); animated paths keep all keys in step; one undo per action; five locales.
- Validation: 4 new Animation unit tests (168 total), DS ratchet, ui-commands inventory (382), check:layers, isolated Chrome check with real pointer and key events (insert, smooth, delete, move; undo steps counted).
- Not covered: no multi-point selection, no segment drag, no insert while the pen is on. Playwright E2E is CI-only.

### Animation P30 (2026-10-14, integration pending)

- Implemented: multi-point selection for path layers (Shift-click, Shift-marquee), group move, delete and smooth/corner, Alt-drag segment reshape, animated paths supported (group move and segment key at the playhead, delete and smooth hit every key), one undo per action. Commands: animation.layer.path ops movePoints, removePoints, cornerPoints, segment.
- Validation: 3 new Animation unit tests (171 total), DS ratchet, ui-commands inventory (382, no new command), check:layers, isolated Chrome check with real pointer events.
- Not covered: path booleans (skipped: existing code is SVG-source-editor only and a path layer has one subpath), no select-all shortcut, no segment drag without Alt (plain drag moves the layer), no new locale keys needed. Playwright E2E is CI-only.

### Animation P31 (2026-10-14, integration pending)

- Implemented: Ctrl/Cmd+A selects all points of a path layer and Esc deselects; compound path model (`source.subpaths`, validation, render with even-odd in canvas and exports, legacy documents unchanged and round-trip tested), ops addSubpath/removeSubpath, "Combine with path layer" (one undo, position-preserving) and "Remove last subpath" in the inspector, command animation.layer.pathCombine, five locales.
- Validation: 4 new Animation unit tests (175 total), DS ratchet, ui-commands inventory (384), check:layers, isolated Chrome check (select-all, Esc, even-odd hole, undo count).
- Not covered: no booleans (as requested); compound paths cannot be animated or morphed; on-canvas editing only for the main subpath; no split-to-layers. Playwright E2E is CI-only.

### Animation P32 (2026-10-14, integration pending)

- Implemented: path booleans (unite, subtract, intersect, exclude) on compound paths, own dependency-free polygon engine (curves flattened about 0.25 px, result is corner points), one undo step, refuses animated, locked, open, same and non-path layers, bounded points (512), 5 locales, command `animation.layer.pathBoolean`, UI row in the path layer inspector.
- Validation: 4 new Animation unit tests with known areas (179 total), DS ratchet, ui-commands inventory (385), check:layers, isolated Chrome check (exclude result, undo count).
- Open: exact curve output (no flattening), self-crossing inputs, animated paths, boolean on masks.

### Animation P33 (2026-10-14, integration pending)

- Implemented: mask booleans (`animation.mask.boolean`, single-ring results up to 32 points), expand stroke to an outline layer (`animation.layer.expandStroke`, miter joins like the renderer, flattened curves), `layer.stroke` null removes a stroke, hover ghost for layer and mask booleans via preview transactions, 5 locales.
- Validation: 5 new Animation unit tests with known areas (184 total), DS ratchet, ui-commands inventory (387), check:layers, isolated Chrome check (ghost on hover, expand stroke, undo count).
- Open: mask results with holes or several parts, round and bevel joins, round caps, dashed strokes, animated strokes, exact curve output.

### Animation P34 (2026-10-14, integration pending)

- Implemented: stroke join (miter, round, bevel) and cap (butt, round, square) in the model, canvas, every export and the inspector, defaults byte-identical to before; expand stroke honours join and cap; 5 locales.
- Validation: 3 new Animation unit tests (187 total) with known areas (square cap 1700, round cap, bevel 3150, round join), DS ratchet, check:ui-commands, check:layers, isolated Chrome check (round join and cap visible, undo count).
- Open: dashes in expand stroke (needs one ring per dash, 8 subpath limit), miter-aware effect bounds, per-segment join styles, miter limit setting.

### Animation P35 (2026-10-14, integration pending)

- Implemented: text animator tracking and selector ease, text on a path (copy of a path layer, start percent, canvas and exports via SVG textPath), command `animation.text.path`, inspector controls, 5 locales. Existing char/word range selector, offset and stagger were already there.
- Validation: 5 new Animation unit tests (192 total), DS ratchet, ui-commands inventory, check:layers, isolated Chrome check (hover preview, text follows the curve, undo count).
- Open: line unit (needs multi-line text), live link to the path layer, animated start offset, path-aware animator preview in the timeline.
### Animation P36 (2026-10-14, integration pending)

- Done: link modifier (bind a property to another layer's property with multiplier and offset), `modifier.set`, Modifiers inspector, command schema fix, wiggle frequency in hertz (behavior change).
- Open: links across compositions, scalar-to-vec2 links, expression scripting (out of scope).

### Animation P37 (2026-10-14, integration pending)

- Done: presets smooth, snappy, back, expo; handle snapping; mirror handles; copy and paste of easing curves.
- Open: box-select of handles, per-segment graph-pane resize.

### Animation P38 (2026-10-14, integration pending)

- Done: export size, frame rate and frame range controls, six presets, per-format readout (frames, duration, size, rough bytes) with cap warnings before rendering.
- Open: animated WebP, MP4 and Lottie JSON (need new dependencies or converters, skipped); size estimates are rough.

### Animation P39 (2026-10-14, integration pending)

- Done: timeline zoom, scroll and fit; snapping to markers, work area and playhead; solo and move up/down in layer rows; select all keys of a property; frame-step and Home/End keys.
- Open: drag-to-reorder layers, shy layers, per-layer track heights.


### Animation P40 (2026-10-14, integration pending)

- Done: drag-to-reorder layers by pointer (handle, drop line, one undo step, Escape cancels); shy layers (optional `shy` flag, "Hide shy" timeline toggle, render and export unaffected); per-character text presets (Rise, Pop, Spin, Fade, Typewriter).
- Open: per-layer track heights; touch-specific drag (pointer events only, no autoscroll while dragging); named user text presets.


### Animation P41 (2026-10-14, integration pending)

- Done: held edge autoscroll for scrub, key drag, layer drag and marquee (keeps scrolling while the pointer rests near the edge; lane list scrolls vertically); fixed tick math during autoscroll (used a stale window); per-layer track heights (compact / normal / tall) plus Collapse all / Expand all; user-saved text animator presets in the document (save, apply with preview, delete).
- Open: import/export of text presets as files, tall-track height for lanes (only the layer bar grows), autoscroll for work-area edge drag.


### Animation P42 (2026-10-14, integration pending)

- Picked (a), audio. Already existed: waveform in the timeline lane and inspector, timeline snapping to markers (P39). For (b) loop/ping-pong modifiers, wiggle and ease presets on selected keys already exist, so little was left there.
- Done: beat finder for imported audio (`animation.audio.beats`): marks onsets as "Beat n" markers in one undo step, respecting trim and offset; sensitivity 1-10; "Clear beats" removes only markers named Beat n. Snapping then lands on the beats.
- Open: resolution is limited to the stored peak envelope (1024 bins, so about 8 ms on a 8 s clip, 0.6 s on a 10 min clip); no tempo/BPM grid; no onset detection by frequency band.


### Animation P43 (2026-10-14, integration pending)

- Picked the BPM grid (text animator presets already shipped in P35, P40 and P41).
- Done: tempo estimate from detected beats (shown in the audio inspector; votes with each gap and its double/half in 60-180 BPM, so a missed beat does not change it), optional tempo override, "Snap markers to beat grid" (`animation.audio.grid`: steady grid through the first detected beat, replaces only "Beat n" markers, one undo step); "Keys to markers" (`animation.keys.quantize`): selected keys move to the nearest marker in one undo step through the new `keys.retime` edit; keys that would collide are skipped.
- Open: grid only for the first audio clip's tempo (no tempo changes), quantize only to markers (not to a free BPM grid), no "strength" or partial quantize, transform keys only.


### Animation P44 (2026-10-14, integration pending)

- Done: precomps. A `comp` layer nests another composition (`animation.precomp.add`, Insert panel "Add as layer"). Cycles, depth over 3 and over 600 expanded layers are rejected. Viewer, PNG/SVG/WebM export share one renderer. WebM audio mixing already existed.
- Open: no "precompose selected layers", no time remap or loop, no child audio or child background in the nested image.


### Animation P45 (2026-10-14, integration pending)

- Done: "Precompose" (timeline toolbar, `animation.precomp.make`): the selected layers move into a new composition (same size, rate, duration, start, background) and one comp layer replaces them at the top-most position, one undo step. Comp layers get speed (10-1000 %), start time in the child and loop (`animation.precomp.time`, inspector fields). Comp layers are now centered on the parent (anchor at the child's center), so a same-size child lines up exactly.
- Open: selections linked by parent or matte to unselected layers are refused (not auto-extended); audio layers cannot be precomposed; speed and start are static values, not keyframes; no reverse playback; the child is not drawn with its background.


### Animation P46 (2026-10-14, integration pending)

- Picked: motion blur (child audio mix from precomps and expressions-lite not chosen: wiggle, loop and property links already exist as modifiers).
- Done: composition shutter (angle 1-720 degrees, 2-16 samples, `comp.shutter` / `animation.blur.comp`) and a per-layer switch (`layer.motionBlur` / `animation.blur.layers`, inspector checkboxes). A blurred layer is drawn as averaged samples of its transform at times spread over the shutter window, centered on the frame. Viewer and all exports (PNG, SVG, GIF, APNG, WebM, nested comps) share it. Off by default, output byte-identical when off.
- Open: only transform motion is blurred (position, scale, rotation, parent motion); text animators, path morphs, effect and mask animation, and opacity keys are not sampled. No adaptive samples. Cost grows with samples times blurred layers.


### Animation P47 (2026-10-14, integration pending)

- Picked: layer styles. Effects only had blur and tint; child audio mix and text-animator blur sampling not chosen.
- Done: two new effect kinds, `shadow` (radius 0-64, distance 0-500 px, angle, color, strength 0-1) and `glow` (radius, color, strength). They sit in the existing effect stack: same order, bypass key, animated strength, colour keys, 8-effect cap. New edit `effect.style` and command `animation.effect.style`; inspector "Drop shadow +" and "Glow +". Viewer and every export share the SVG filter (feDropShadow); filter bounds grow with radius and distance so nothing is clipped.
- Open: shadow and glow settings other than strength and colour (radius, distance, angle) are static, not keyed; no inner shadow/glow, no spread or choke; glow is two stacked drop-shadow passes, not a separate threshold glow; the colour-key button still says "tint" for these effects.


### Animation P48 (2026-10-14, integration pending)

- Picked: child audio mix from precomps (text-animator blur sampling and inner shadow not chosen).
- Done: audio layers inside a nested composition are heard in the parent, in the timeline preview and in the WebM export. Each child clip is mapped onto the parent timeline (shifted by the comp layer start and its start-time offset, cut to the comp layer span and to the child length, repeated while the comp layer loops, nested depth included, volume keys shifted with it). Hidden comp layers, and comp layers not soloed while another layer is soloed, stay silent, like the picture. Nothing changes for compositions without comp layers (same object returned). The audio signature includes nested audio, so edits to it pause playback like any audio change.
- Open: comp layer speed other than 100 % is silent (no time stretch), with no note in the UI; no per-comp-layer volume; at most 200 mapped clips; the import hint text still says audio is not mixed into exports (stale since the WebM mix, not changed here).


### Animation P49 (2026-10-14, integration pending)

- Picked: fix the stale audio hint and explain silent comp layers (inner shadow/stroke and text-animator blur sampling not chosen).
- Done: the audio import hint now says what is true (audio plays in the preview and is mixed into WebM exports only, not PNG, GIF or APNG), in 5 locales. A visible comp layer with speed other than 100 % whose child has audio now shows a note under the timeline and under the WebM button ("Silent in preview and WebM: name"). `silentPrecompLayers()` is the single rule; hidden comp layers and children without audio give no note.
- Open: still no time-stretched audio for speed other than 100 %; inner shadow/stroke styles; text animator sampling in motion blur.


### Animation P50 (2026-10-14, integration pending)

- Picked: inner shadow and inner glow (text-animator blur sampling and time-stretched audio not chosen).
- Done: two more effect kinds, `innerShadow` (radius, distance, angle, colour, strength) and `innerGlow` (radius, colour, strength). They are drawn inside the layer only (inverted alpha, blurred, offset, clipped to the layer alpha), so the filter region does not grow. Same stack rules as P47: order, bypass key, animated strength, colour keys, 8-effect cap, undoable `effect.style`. Viewer and all exports share the SVG filter. Buttons "Inner shadow +" and "Inner glow +", 5 locales.
- Open: radius/distance/angle are static; no choke or spread; no inner/outer stroke styles; the colour-key button label still says "tint"; text animator sampling in motion blur; time-stretched audio.


### Animation P51 (2026-10-14, integration pending)

- Picked: time-stretched audio for comp layers with speed other than 100 % (stroke styles and text-animator blur sampling not chosen).
- Done: nested audio now follows the comp layer speed (10-1000 %) in the timeline preview and WebM export: the file is played at that rate through the audio node's playback rate, clips land at the right parent time, start-time offset, loop passes and volume keys scale with it, nested speeds multiply. The "silent" note from P49 and its string are removed because nothing is silent any more.
- Open: pitch follows speed (a rate change, not a pitch-preserving stretch); stroke styles; text animator sampling in motion blur; no per-comp-layer volume.


### Animation P52 (2026-10-14, integration pending)

- Picked: per-comp-layer volume (stroke styles and text-animator blur sampling not chosen).
- Done: comp layers have an "Audio volume (%)" field (0..200, default 100) and `animation.precomp.time` takes `volume`. It multiplies the volume of every nested clip, including keyed volumes and nested comps. One undo step, validated, 5 locales.
- Open: the comp layer volume is a constant (no keyframes, no fade); stroke styles; text animator sampling in motion blur.


### Animation P53 (2026-10-14, integration pending)

- Picked: stroke styles (opacity and dash pattern). Text-animator blur sampling not chosen.
- Done: shape strokes get an opacity (0..100 %) and a dash length and gap (1..100 % of the path length). A dash length gives a static dashed stroke; before, dashes only existed together with an animated dash offset and always as 8/4. Canvas, viewer and every export use the same attributes; strokes without the new fields produce byte-identical output. Undoable, validated, 5 locales.
- Open: no gradient strokes, no stroke alignment (inside/outside), no miter limit, opacity and dash lengths are constants; text-animator sampling in motion blur.


### Animation P54 (2026-10-14, integration pending)

- Picked: text-animator sampling in motion blur.
- Done: with motion blur on, text layers that have enabled animators or a keyed reveal now draw each shutter sample with the text as it looks at that sample's time (before, only the layer transform was sampled and the characters stayed at the frame time). Viewer and every export use the same samples. Layers without such text, and frames without a shutter, produce byte-identical output. No new fields, so no new commands or strings.
- Open: effects (blur, glow, shadow) and masks are still evaluated at the frame time for each sample; a text path repeats the same path id per sample; stroke gradients and alignment; samples are capped at 16 as before.


### Animation P55 (2026-10-14, integration pending)

- Picked: stroke miter limit (small follow-up to P53).
- Done: shape strokes with a miter join (the default) get a "Miter limit" (1..20, default 4). It is written as `stroke-miterlimit` only when set and the join is miter, so existing strokes give byte-identical output. Viewer and export share the attribute. Undoable, validated, 5 locales.
- Open: no stroke gradient, no inside/outside alignment; opacity, dashes and miter limit stay constants.


### Animation P56 (2026-10-14, integration pending)

- Picked: keyframed volume for comp layers (fades of nested audio).
- Done: next to the "Audio volume (%)" field of a comp layer there is now an animate switch, "Key at playhead" and "Remove key". With keys, the keyed `gain` (0..200 %, bezier eased, in the composition time of the comp layer) replaces the static value and is multiplied with each nested clip's own volume at playback. Keys follow nesting: gains of inner comp layers are moved into the outer time through speed, start time and loops. New commands `animation.precomp.volume.animate` and `.keyRemove`; `animation.precomp.time` with `volume` keys the value when animated. Undoable, validated, 5 locales. Turning animation off keeps the value at the playhead as the static volume.
- Open: no keyframe lane for the comp layer volume in the timeline (keys are listed in the inspector); the volume curve is sampled at 30 points per second as for audio layers; not heard in a real browser this round.


### Animation P57 (2026-10-14, integration pending)

- Picked: keyframes for stroke width and stroke opacity.
- Done: "Animate width" and "Animate opacity" switches in the stroke section, each with "Key at playhead", "Remove key" and a key list. With keys the keyed value (bezier eased, width 0..256, opacity 0..100 %) replaces the static one; the fields show and edit the value at the playhead. Viewer, every export and the effect bounds read the same value per tick. New edit `stroke.prop` and commands `animation.stroke.animate` and `.keyRemove`. Turning animation off or removing the last key keeps the value at the playhead as the static one (rounded to 0.01). Strokes without keys give byte-identical output. Undoable, validated, 5 locales.
- Open: no stroke colour keyframes, no timeline lane for these keys (inspector list only), the outline from "Expand stroke" uses the static width; dash lengths and miter limit stay constants.


### Animation P58 (2026-10-14, integration pending)

- Picked: colour keyframes for the fill and the stroke colour of a layer (new feature; before only tint, shadow and glow colours could be keyed).
- Done: solid, shape and text layers get "Animate fill colour", shape strokes get "Animate stroke colour", each with "Key at playhead", "Remove key" and a key list. Colours mix per RGB channel between keys (linear, held before the first and after the last key), at most 64 keys. The viewer, every export and masks/mattes use the colour at the tick through `layerColorsAt`. New edit `color.prop`, new commands `animation.color.animate` and `.keyRemove`. The colour pickers edit the key at the playhead while animated. Turning animation off or removing the last key keeps the colour at the playhead as the static colour. Layers without keys give byte-identical output. Undoable, validated, 5 locales.
- Open: only linear mixing (no ease curves per key); no timeline lane; gradient colours and text-animator colours are not keyed; effect colours keep their own keys.


### Animation P59 (2026-10-14, integration pending)

- Picked: timeline key lane for the keyed style properties (not per-key easing).
- Done: the selected layer shows one lane per keyed style property under its track: comp layer volume, stroke width, stroke opacity, fill colour and stroke colour (P56, P57, P58). Each key is a diamond at its time; the one at the playhead is filled; a click moves the playhead there. Lanes appear only when keys exist and the track height is not compact. Pure helper `styleKeyLanes` (leaf `keyLanes.ts`). Labels reuse the inspector strings, one new string for the key aria-label in 5 locales. No document change.
- Open: the lanes are read-only (no drag, no selection with the marquee, no copy); per-key easing for colour keys; effect colour keys have no lane.


### Animation P60 (2026-10-14, integration pending)

- Picked: editable style lanes (drag keys in time). Per-key easing not done.
- Done: the keys in the style lanes (comp layer volume, stroke width, stroke opacity, fill and stroke colour) can be dragged along the time axis. The drag previews live, snaps to frames (Alt = free, then snapped to the nearest frame by the edit), is one undo step on release, and Escape cancels. A key cannot be dropped on another key of the same lane (the last valid position stays). Pressing a key still moves the playhead to it. New edit `style.key.move`; no new strings or commands.
- Open: no multi-select, copy/paste or delete from the lane (use the inspector buttons); no keyboard nudging; per-key easing for colour keys; effect colour keys have no lane.

\n\n### Animation P61 (2026-10-14, integration pending)
- Done: per-key easing for fill and stroke colour keys (12 presets, same bezier handles as the graph presets; hold keeps the colour until the next key). Easing shapes the segment that starts at the key. Select in the inspector when a key sits at the playhead, command `animation.color.ease`, edit `color.ease`. One undo step.
- Open: lane delete and multi-select, keyboard nudging, effect colour keys have no easing or lane.

### Animation P62 (2026-10-14, integration pending)
- Done: style-lane keys (fill, stroke colour, stroke width and opacity, comp volume) can be selected (click, Shift-click toggles), nudged with Left/Right (1 frame, Shift 10) and deleted with Delete. Commands `animation.styleKeys.nudge` and `animation.styleKeys.delete`; each is one undo step. Selection is view state (not saved, not undoable), cleared on layer change.
- Open: marquee select and dragging a whole selection with the mouse, selection across layers, effect colour keys have no lane.

### Animation P63 (2026-10-14, integration pending)
- Done: dragging a selected diamond in a style lane moves the whole selection together (relative spacing kept, one undo step, Escape cancels). Dragging an unselected key still selects and moves just that key.
- Open: marquee select, selection across layers, effect colour keys have no lane.

### Animation P64 (2026-10-14, integration pending)
- Done: marquee select in the style lanes. Dragging on empty lane space selects every key whose centre is inside the dragged rectangle, across lanes of the selected layer, in any drag direction; Shift keeps the existing selection. Selection updates live while dragging. View state only (no undo).
- Open: no drawn rubber-band rectangle (the selected keys are the feedback), selection across layers, effect colour keys have no lane.

### Animation P65 (2026-10-14, integration pending)
- Done: gradient strokes. A shape stroke can carry a linear gradient (start and end colour, angle, same model and controls as the fill gradient). Viewer, PNG/GIF/WebM/SVG frames and motion blur share one builder, so they all draw it. Inspector: "Gradient stroke" checkbox with two colours and an angle in the stroke section; one undo step via `layer.stroke`. Validated (hex colours, angle 0..360). Without a gradient the output is byte-identical.
- Open: gradient is linear only (no radial), it is not keyed, "Expand stroke" outlines use the plain colour, stroke colour keys are ignored while a gradient is set, no inside/outside alignment.

### Animation P66 (2026-10-14, integration pending)
- Done: radial gradients for the fill and for the stroke (type select next to the colours; radial runs from the box centre and ignores the angle). Linear stays the default and its output is byte-identical. The shared builder (`gradientDefSvg`) feeds the viewer and every export. Checkbox label is now "Gradient" (was "Linear gradient") in 5 locales.
- Open: no gradient stops beyond two colours, no keyed gradients, no conic gradient, no radius or centre control (box centre, radius 50 percent).

### Animation P67 (2026-10-14, integration pending)
- Done: multi-stop gradients for fill and stroke. Up to 6 extra stops between start (0) and end (1), each with a colour and a position in percent; "Add stop" puts a new one in the widest gap, "Remove" drops one. Works with linear and radial. One undo step per change. Viewer and all exports share the stop markup. Without extra stops the output is byte-identical.
- Open: start and end stay at 0 and 100 percent, no stop opacity, gradients are not keyed, no conic gradient, no centre or radius control.

### Animation P68 (2026-10-14, integration pending)
- Done: opacity for gradient colours. Start, end and every extra stop have an opacity in percent (0 to 100), so a fill or stroke can fade to transparent. Inspector: "Start opacity", "End opacity" and one opacity field per stop. 100 percent is not stored, so old documents and the default output stay byte-identical. Viewer and every export write `stop-opacity`.
- Open: opacity is not keyed, not shown as a swatch preview, no conic gradient, no centre or radius control.

### Animation P70 (2026-10-14, integration pending)
- Done: radial gradients have a centre (X, Y in percent of the box) and a radius (5 to 150 percent), for fill and stroke. Fields appear in the inspector when the type is Radial. 50 percent is the default and is not stored, so old documents stay byte-identical. Viewer and exports share the markup.
- Open: no focal point, not keyed, no on-canvas handles, no conic gradient.

### Animation P71 (2026-10-14, integration pending)

- Done: layer Repeater (2 to 20 copies; per-copy offset, rotation, scale and opacity falloff around the anchor). Viewer and all exports share it; absent field is byte-identical; one undo step; five locales.
- Open: repeater values are not keyable; no per-copy colour shift; not applied to masks of other layers beyond the shared layer body.


### Animation P72 (2026-10-14, integration pending)

- Done: repeater hue shift per copy (hue-rotate, -360..360 deg; 0 or absent is unchanged). Inspector field, 5 locales, test.
- Open: not keyable; viewer and exports use the SVG hue-rotate filter, so raster exporters that ignore it show uncoloured copies (not verified per exporter).


### Animation P73 (2026-10-14, integration pending)

- Done: repeater values keyframable (x, y, rotation, scale, opacity, hue). Edit repeater.prop (set/animate/remove, one undo step), per-field Keyframes checkbox in the inspector, six timeline key lanes (select, drag-move, delete via the shared style-key paths), validation, 5 locales, test.
- Open: copies count is not keyable; no key-add button (set a value at a new playhead time to add a key); the timeline lanes were covered by tests, not by a screenshot; no per-key ease editor for these lanes beyond the default.


### Animation P74 (2026-10-14, integration pending)

- Done: keyframes for the linear gradient angle, fill and stroke (gradient.angle edit, set/animate/remove, one undo step; Keyframes checkbox next to the angle field; two timeline lanes with select, drag-move and delete). Viewer and exports sample it through gradientAt(); no keys gives identical output. Validation, 5 locales, test.
- Open: stops, colours, opacity and radial centre/radius are still not keyable; angle keys interpolate numerically (no shortest-path wrap); no conic gradient.


### Animation P75 (2026-10-14, integration pending)

- Done: keyframes for radial centre X/Y, radius and start/end opacity on fill and stroke gradients (gradient.prop edit, one undo step; Keyframes checkbox per field; ten timeline lanes that appear once keyed, with select, drag-move and delete). Viewer and exports sample through gradientAt(); no keys gives identical output. Validation, 5 locales, test.
- Open: stop offsets, stop colours and start/end colours are not keyable; no conic gradient.


### Animation P76 (2026-10-14, integration pending)

- Done: keyframes for gradient start and end colour on fill and stroke (gradient.color edit, one undo step; Keyframes checkbox beside each colour; four timeline lanes shown once keyed, with select, drag-move and delete). Channel-wise RGB mix with per-key ease support in the model and sampler (shared colorAt); viewer and exports sample through gradientAt(); no keys gives identical output. Validation, 5 locales, test.
- Open: stop colours and stop offsets are not keyable; no UI to set the per-key ease of gradient colour keys (the model keeps it); no conic gradient.


### Animation P77 (2026-10-14, integration pending)

- Done: per-key ease for gradient start/end colour keys (gradient.color.ease edit, linear is not stored; ease select appears beside the colour when the playhead is on a key). Same ease set as layer colour keys; hold is supported. Validation was already in P76; test added.
- Open: stop colours and stop offsets are not keyable; no ease UI for the gradient number lanes (radius, centre, opacity, angle) beyond linear; no conic gradient.


### Animation P78 (2026-10-14, integration pending)

- Done: keyable gradient stops, fill and stroke: per-stop offset keys (offsetAnim) and colour keys (colorKeys, with ease). Edit gradient.stop (offset/color x set/animate/remove/ease, one undo step; last key removed bakes the value). Keys live on the stop object, so adding or removing other stops keeps them. Keyed offsets are sampled, then kept in order (at least 0.01 apart, within 0.01..0.99). Inspector: Keyframes checkbox beside each stop colour and offset; timeline lanes per stop (up to 6 stops x 2 x fill/stroke), shown once keyed, with select, drag-move and delete. Validation, 5 locales, test.
- Open: stop opacity is not keyable; no ease select for stop colour keys in the inspector (edit and model support it); no conic gradient.


### Animation P79 (2026-10-14, integration pending)

- Done: path effects for path shape layers: Zig zag (straight ridges) and Wave (smooth ridges), size 0..200 px, 1..20 ridges per segment. Edit layer.pathFx (null removes; one undo step), inspector section on path layers, 5 locales. The effect is applied inside layerPathD, so the viewer and every export share it, including compound subpaths and path morph keys; anchors stay in place and curved segments are sampled. Absent field gives byte-identical output.
- Open: not keyable; effect bounds for blur/shadow are not widened by the ridge size; Expand stroke, masks and the path edit overlay still use the unmodified path; no round corners, twist or pucker yet; rect/ellipse/star shapes are not affected (path layers only).

### Animation P80 (2026-10-14, integration pending)
- Done: path effects gain Round corners (size = radius px, handle-less corners only) and Twist (size = degrees at the farthest point); the size is keyable (lane, move, delete bakes the last key) and now allows -200..200.
- Open: round corners ignore corners with handles; twist is coarse with few ridges; effect bounds, Expand stroke, masks and the edit overlay still use the original path.

### Animation P81 (2026-10-14, integration pending)
- Done: the start offset of text on a path is keyable (-100..200 %, so text can scroll in and out): Keyframes checkbox in the Text on a path panel, timeline lane "Textpfad-Start", move, delete bakes the last key, undoable; viewer and export share the sampler.
- Open: text on a path still copies a static path (no follow of later path edits or animated paths); no per-character spacing or side (above/below) control; no path-follow for the text bounds or the edit overlay.

### Animation P82 (2026-10-14, integration pending)
- Done: audio-reactive layers. "Make audio reactive" in the audio inspector turns the clip's loudness into keys on another layer's scale, opacity or rotation (quiet and loud values, smoothing 0-10, a key every 2 frames, at most 600). One undo step; command `animation.audio.reactive`.
- Open: it replaces that property's existing keys (no merge); one value for both scale axes; it is a one-time bake, not live (re-run after trimming or moving the clip); the resolution is the stored peak envelope (1024 bins), so it follows beats and swells, not frequency bands; no position or colour targets.

### Animation P69 (2026-10-14, integration pending)
- Done: stroke alignment for closed shapes (centre, inside, outside). Inside clips a double-width stroke to the shape, outside masks the shape out of it, so the visible band keeps the set width. Select in the stroke section. Viewer and every export share the behaviour; open paths stay centred. Absent field means centred and byte-identical output.
- Open: "Expand stroke" outlines ignore the alignment (centre only), gradient strokes use the same bounding box, no alignment keys.
