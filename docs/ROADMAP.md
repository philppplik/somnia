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
