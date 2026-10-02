# Phase 1 - Desktop foundation and reliable editor core

Development branch only. No shipped desktop release, no merge or deploy, existing Phase-0 site untouched.

## Implemented and tested locally
- React 19 + Base UI shell, restyled shadcn structure, source editor/palette/shortcuts.
- parse5 minimal source patches, stable local identities, atomic origin transactions, shared undo/redo.
- Sandboxed, script-free source-backed canvas; click/Shift-select, plain text edits, source/canvas sync.
- External CSS rule editor with responsive breakpoint scope, color picker, resize and padding handles.
- Editor-only layers lock/hide; recovery state serialization preserves IDs and metadata.
- B/I/U toolbar wraps selected text segments in plain or mixed inline content, preserves tags/comments/attributes and entity spellings. Block/embedded content and unmappable ranges refuse safely.
- SaveCoordinator tests reject false saved state and stale async completion.
- 26 core tests, 14 Chromium E2E tests, TypeScript/Vite build; npm audit 0 vulnerabilities after esbuild override.
- Actual screenshots reviewed at desktop, 960x600, light/dark and resized selection.

## Pending, not represented as shipped
- Native filesystem bridge wired and IPC mock-tested. Real desktop open/save/autosave/recovery/conflict runtime and native OS build still unverified.
- Real folder alpha acceptance, restart/recover/export and packaged installer.
- Cascade-aware inspector, block/embedded richtext, eyedropper, local asset rendering.
- CodeMirror now integrated locally: syntax highlighting, gutters and shared core undo. Canvas shows primary resize handle and secondary outlines for multi-selection.
- JSX/framework preview, AI/SDK/extensions remain later blocks.

Source remains the owned document. Unsupported operations fail visibly rather than flatten code. CSS rule editor preserves authored CSS, so higher-specificity rules can override new class rules. Project JS and remote assets are disabled in design preview.

Native module supplied final logs: 18 Linux filesystem tests and Clippy clean. Local cargo unavailable in integration workspace. Recovery saves file bytes only, not editor metadata. Undo file creation does not delete a disk file, and the UI reports this limitation.

## Later file-type backlog (not Phase 1 scope)
Parent relayed Philipp's interest on October 2: Markdown (.md) as a near-term useful feature beyond HTML/CSS/JS; DOCX later through a converter. Current adapter can read .md as plain text, but there is no Markdown visual editor or DOCX conversion implementation. This note adds no Phase 1 implementation scope.
- October 2, 10:52 parent relay: right-click context menu with actions in both web and native UI, explicitly later backlog, not Phase 1. Philipp accepted DOCX later ("Jo dann gerne später"). No implementation started for either item.
- October 2, 11:16 parent relay: user said "Duff viewer". Parent hypothesis is Diff-Viewer for comparing Canvas edits/code or versions; PDF-Viewer remains a possible alternative until clarified. Backlog only, not Phase 1. Preserve wording, do not implement an assumed feature.

## Continuation steering
Philipp's original authenticated WhatsApp October 2, 12:00:59 requests continuous progress into the next planned phases after Phase 1. Preserve Phase 1 acceptance gates before declaring completion. Routine technical progress needs no pause between blocks; consequential unresolved product, disclosure, payment or action choices still require grounding. No authorization to merge/deploy publicly was added by this continuation.

October 2 12:08 local progress: CodeMirror+source ZIP export+reviewed disk compare+native folder indicator; 23 core/13 browser tests. Not yet synced to branch. These are Phase1 gaps, not later version-Diff viewer.

Internal disk reload/reviewed merge resets old undo/redo snapshots, so undo cannot silently replace newly accepted disk bytes.
