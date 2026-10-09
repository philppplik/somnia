# Slides Studio package 1

Baseline: live somnia-agent 49af8d5c83dd5d4abb503c7ef740cec774b3482f (checked October 9, 2026). Local feature branch only. No push, merge, PR or release.

## Delivered

A real read-only Slides Studio inside Somnia's existing shell. The registered PPTX format claim, canvas, inspector and optional sidebar host are additive. Global Settings, Agent/chat, account and Code document/history remain outside Slides. Original PPTX bytes stay in memory, untouched. One independent session persists across Studio switches, and Close clears it.

The Rust adapter is a separate locked crate pinned to DeckCraft d0e57d7e25f9852179cc66be12dd6188f1c05535. It imports and renders without the upstream UI, edit/export methods, codecs or branding. It builds real WASM, not the spike's precompiled artifact. Typed module-worker RPC uses explicit operation dispatch, request IDs, serialized initialization, 30-second termination, error propagation and disposal. No user-controlled method lookup. ZIP intake validates actual expanded data before upstream parser use; see slides-engine/README.md for exact limits.

Read-only command scopes prevent Save/Edit/Code-view operations from acting on the hidden source project while the Slides canvas is mounted. Code is unchanged after switching back. The View menu still includes global commands; unsupported commands appear disabled under the scope. Native menu platform testing remains unverified.

## Shared integration hunks

- studios/index.ts: import/export slides manifest.
- studios/registry.ts: optional shell.sidebar identifier.
- studios/hosts.tsx: Slides canvas/inspector registrations and StudioSidebar fallback to LayersPanel.
- App.tsx: call StudioSidebar where LayersPanel used to be the default, preserving raster/PDF/extension branches.
- StatusBar.tsx: only show Code view context when the active manifest defines views.
- craft/build.sh: additive isolated Slides build after PhotoCraft; every existing native/release CI target already calls this hook.
- studios.test.ts: require Code and Slides membership, not a closed one-Studio list.

Parallel integrations should preserve these additive maps/imports. Do not replace their other Studio entries. No shared store, binary-media routing, locales or native bridge files changed.

## Verified execution

- Rust 1.95.0 and wasm-bindgen 0.2.129 release wasm32 build succeeded. Existing PhotoCraft/raster WASM builds also succeeded, including the added build hook.
- Rust: 7 tests passed (independent fixture import/text/render, invalid ZIP, compressed/part/total expansion caps, missing presentation and traversal).
- TypeScript: 7 focused tests passed (RPC errors/disposal, file intake, manifest, registry/manual precedence and catalogues).
- Full frontend TypeScript/Vite production build passed. Existing dynamic-import warnings remain.
- Production preview, real Chrome, actual emitted module worker/WASM: 3 Playwright tests passed (import, render, text inspector, navigation, invalid ZIP, close, switch retention, view shortcut guard and dark theme). Dev-server initial flow also passed.
- Full core suite: 1674 passed, 18 skipped, 26 todo; one unrelated OAuth test-file failure resolving ./loopback.node. That file exists as loopback.node.ts on baseline but this runtime's loader fails to resolve it. The entire suite excluding the OAuth glob passes with the same 1674/18/26 counts. This was not fixed in the Slides scope.
- Actual pixels inspected: slide-1.png, slide-2.png and slide-2-dark.png. Titles and body are readable, slide selection and sidebar agree, text inspector matches rendered slide, controls and panels fit without overlap, Code's Visual status is absent. White slide surface stays white in dark UI as expected. No upstream branding shown.

Evidence logs and screenshots are in phase1/validation/slides. Frontend-only evidence does not prove Windows/macOS/Linux Tauri WebView or native dialogs. No native installers were built in this package.

## Boundaries and next packages

This is a narrow first package, not a full presentation editor. Explicit Open PPTX is the only entry; PPTX is not yet routed through FileTabs, native filesystem/drop or recent files. Single session, numbered slide navigation rather than image thumbnails. New UI copy is English alpha copy; full five-locale copy and a Slides glyph await the polish package. Global shell context still describes the underlying Code project (including its No project/Memory only status), not the separately held deck. This is visible but does not claim a deck save state.

1. Document-service package: loss-aware original asset identity, native/open/drop routing, per-tab sessions, context/status integration, slide thumbnails, cancellation during file read, heap/performance fixtures and native WebView tests.
2. Editing package: hit testing, selection, structured text/style/shape commands, undo/redo and dirty close guards. Save-as-copy only initially; preserve original. Never infer lossless export from the small spike.
3. Compatibility package: independent 20-50-deck corpus, structured import/render diagnostics (upstream can catch a render panic and return blank), fonts/notes/charts/SmartArt/OLE/external relationships, fuzzing and memory budgets. Current byte/time caps do not guarantee bounded decoded-image allocations or XML complexity.
4. Polish: five locales, Studio-specific glyph, tab/thumbnail UX and accessibility audit.

No Google Slides integration or PowerPoint feature parity is implied.

Source and license provenance: https://github.com/storytold/deckcraft , https://github.com/storytold/deckcraft/blob/main/LICENSE-MIT , https://github.com/storytold/deckcraft/blob/main/NOTICE . Root license/attribution and current dependency notices are bundled with source and copied into the distribution. The new independent lock resolves 100 packages; current-dependency-manifest.json is its SBOM list, older manifest is spike provenance. This is not a legal audit.
