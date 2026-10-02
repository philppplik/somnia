# Phase 1 - Desktop foundation and reliable editor core

Development branch only. No shipped desktop release, no merge or deploy, existing Phase-0 site untouched.

## Implemented and tested locally
- React 19 + Base UI shell, restyled shadcn structure, source editor/palette/shortcuts.
- parse5 minimal source patches, stable local identities, atomic origin transactions, shared undo/redo.
- Sandboxed, script-free source-backed canvas; click/Shift-select, plain text edits, source/canvas sync.
- External CSS rule editor with responsive breakpoint scope, color picker, resize and padding handles.
- Editor-only layers lock/hide; recovery state serialization preserves IDs and metadata.
- Plain-text range B/I/U toolbar: only selected source is wrapped; complex content/HTML entities safely refused.
- SaveCoordinator tests reject false saved state and stale async completion.
- 23 core tests, 10 Chromium E2E tests, TypeScript/Vite build; npm audit 0 vulnerabilities after esbuild override.
- Actual screenshots reviewed at desktop, 960x600, light/dark and resized selection.

## Pending, not represented as shipped
- Native filesystem bridge wired and IPC mock-tested. Real desktop open/save/autosave/recovery/conflict runtime and native OS build still unverified.
- Real folder alpha acceptance, restart/recover/export and packaged installer.
- Cascade-aware inspector and authored complex mixed-content range editing, eyedropper, local asset rendering.
- Source editor is currently textarea, not CodeMirror yet. Canvas shows primary resize handle and secondary outlines for multi-selection.
- JSX/framework preview, AI/SDK/extensions remain later blocks.

Source remains the owned document. Unsupported operations fail visibly rather than flatten code. CSS rule editor preserves authored CSS, so higher-specificity rules can override new class rules. Project JS and remote assets are disabled in design preview.

Native module supplied final logs: 18 Linux filesystem tests and Clippy clean. Local cargo unavailable in integration workspace. Recovery saves file bytes only, not editor metadata. Undo file creation does not delete a disk file, and the UI reports this limitation.
