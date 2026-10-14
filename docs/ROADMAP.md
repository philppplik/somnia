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

### Animation P10 (2026-10-14, integration pending)

- Implemented: up to 4 layer masks (rect/ellipse, add/subtract, feather 0..64 px, invert), track mattes (alpha/luma, invert, no chains, source hidden on its own), rotation and colour for text animators. One mask builder for viewer and all exports, undoable, validated, five locales. Details and limits: `docs/animation-p10.md`.
- Validation: 4 new Animation unit tests, i18n, DS ratchet unchanged, isolated Chrome pixel review (`test/animation-preview.html?masks=1`). `tests/animation-p10.spec.ts` is CI-only. No new dependencies.

### Animation P9 (2026-10-14, integration pending)

- Implemented: timeline parent picker on every layer row (cycle-free list, keep-world toggle in the timeline toolbar, undoable); per-character text animators (up to 4 per text layer: selector range with softness, keyable range offset, shift, scale, opacity), deterministic, shared by viewer and all exports, validated and bounded (1000 characters while animators exist). Details and limits: `docs/animation-p9.md`.
- Validation: 7 new Animation unit tests, i18n in five locales, DS ratchet unchanged, isolated Chrome pixel review (`test/animation-preview.html?animators=1`). `tests/animation-p9.spec.ts` is CI-only. No new dependencies.

### Animation P6 (2026-10-14, integration pending)

- Implemented: text layers pick one of eight safe system font stacks (the document stores the id, rendering resolves the CSS stack, nothing is bundled or fetched), per-key ease choice in the inspector with the new `animation.key.ease` command, ease presets inside the graph editor, and keep-world parenting for animated hierarchies (exact pose at the reparent time, spatial tangents re-expressed, per-channel easing under a rotated parent refused).
- Validation: 6 new and 108 total Animation unit tests, i18n, DS ratchet, isolated Chrome German light/dark pixels. Full-app/native/WASM gates remain CI-only (`tests/animation-p6.spec.ts` not run). Details and limits: `docs/animation-p6.md`.
