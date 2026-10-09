# Slides Studio package 2

Applies on top of Slides package 1, originally built on live somnia-agent 49af8d5c83dd5d4abb503c7ef740cec774b3482f. Source was restored from the previously delivered package-1 git-am series after a workspace reset; no external changes. Reapplied package-1 HEAD here: 68ba55ac7cd2d38c6e4cbce43de7afc891cdc0eb (tree same as original package-1 1409c76). Local only, no push/merge/release.

## Delivered

PPTX now uses Somnia's existing Media resources, not a second list of detached files. Project > Open File, Open media, browser drops, loaded folder Previews and shared FileTabs can hold PPTX. Format probe verifies OOXML presentation parts; byte limits are inherited from media intake (25 MB), then the worker applies package-1 expansion/render caps. Native read_media and dropped-media extension allowlists add pptx with the same path, symlink and byte safeguards. Native core file-service tests exercise pptx read and traversal refusal.

Slides automatically requests its Studio on PPTX activation, with manual Studio precedence retained. Media Studio memory is keyed as media:<path>, so opening a deck never overwrites the underlying text document's Studio entry. Source FileTabs now check the stored Studio's format before restoring it. An explicit manual Slides choice on HTML cannot trap later source-tab navigation in Slides. The Code adapter displays PPTX preview as a fallback when manual precedence keeps Code selected.

Slides sessions follow the actual media source URL (folder-relative paths preserve same-named files in different directories). Each deck owns current slide/text/thumbnail state and original bytes. Up to three resident workers are retained; eviction terminates the worker and revokes rendered URLs but leaves the original media/tab resource intact for reimport on activation. Replacing, closing or clearing media disposes matching sessions. Worker deadline/error handling from package 1 is retained. Read-only commands still cannot mutate the hidden source project.

Sidebar shows a real rendered thumbnail for visited slides. Load slide thumbnails explicitly renders the remaining thumbnails serially in the worker, at bounded 180x110 output. It does not render 200 full-size previews automatically. FileTabs use the existing media Close behavior. Status now says Original unchanged / Read-only PPTX preview, context chip says Slides preview, and media-readonly context supplies file identity and readonly flags instead of No project/Memory only. No new domain union or broad registry rewrite.

## Shared hunks for parallel integration

Keep the additive pptx branch alongside Documents/Sheets changes:

- media.ts: MediaKind/format/accept/MIME/probe additions; automatic requestStudio('slides','automatic',false,'media:'+name) on activation.
- uiContext.ts: pptx contributes media-readonly.
- appStore.ts: optional tabKey on requestStudio, and acceptsFormat gate when restoring source-tab Studio.
- desktop.rs/service.rs: one pptx allowlist entry each, unchanged policy.
- hosts.tsx: when Slides is selected but a non-PPTX media tab is active, use Code's existing media host rather than hiding that tab.
- MediaPreview.tsx: PPTX fallback host.
- ContextChip/StatusBar: small PPTX-specific readonly presentation labeling.

StudioPill icon map is owned by the central builder. This package intentionally leaves slidesStudio.icon as Code2; switch it to the Presentation glyph there, not via a conflicting map edit here.

## Executable proof

- Real Rust/WASM bridges rebuilt after reset: PhotoCraft, raster codec and Slides. TypeScript/Vite production build passed.
- 84 focused TS tests passed (Slides RPC/intake/routing, registry, browser filesystem and UI context).
- 7 production Chrome E2E passed: independent PPTX import/navigation/text; invalid intake; switch retention; light/dark UI; multiple FileTabs + thumbnails; Project Open File automatic routing; source tab restoration; eviction/reopen/close lifecycle.
- Native `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked`: 134 passed, zero failure, including native safe PPTX read.
- Full core suite excluding the already reported unrelated OAuth glob: 1674 passed, 18 skipped, 26 todo, zero failure. No OAuth code changed.
- Actual pixels checked for package2-tabs-thumbnails.png and slide-2-dark.png. Two deck tabs, selected thumbnail, slide body, inspector text and readonly status agree. No overlap/crop/readability issue found. Earlier light slide 1/2 screens are updated.

Logs in validation/slides/package2; image evidence in validation/slides. Actual Tauri WebView/native dialogs/OS Explorer drag-drop/installer builds were NOT run. The native extension route is exercised through the file-service API, and the Project Open File route through real Chrome. Do not claim native GUI signoff from these tests.

## Remaining

Still read-only. Editing, text/hit-test commands, undo, loss-aware export/save-as-copy, and five-locale copy are separate packages. No overwrite path exists. No Google Slides/PowerPoint compatibility promise. Thumbnail loading is explicit and serial, no virtualization or background speculative thumbnail scheduler. Resident-worker cap is not a total heap benchmark; XML and decoded-image limits need corpus/fuzz/memory tests. Source URL identity is local process state, not persistence across restart. Native resource-path signoff and rich-format render diagnostics remain open.
