# Alpha acceptance

## Executed local core tests
- No-op byte-exact source; text patch local and escaped.
- Unrelated comments, script, unknown/template attributes, quote choice, CRLF and Unicode preserved.
- Mixed markup refused, not flattened; operation failures roll back entire transaction.
- Origin suppression, revision conflicts, listener reentry guard, 1000 stable edits.
- IDs survive local offsets, reorder and recovery; layer locks protect descendants.
- External CSS and breakpoint scoping, relative href for nested pages, no inline/!important injection.
- Undo/redo and grouped history across views.
- Save failure/Recovery quota failure visible; edits during async save remain dirty.

## Executed browser integration tests
- Source-backed sandboxed canvas, click selection, plain text edit and shared undo.
- Project scripts/events and remote resources are blocked.
- External CSS + responsive scope, Shift-multi-selection and batch operation.
- Resize changes real rendered size, range formatting + undo, lock/hide protection.
- Palette, panel keyboard interactions, input shortcut isolation, light/dark minimum desktop.
- Actual screenshot inspection; canvas fits available panel without horizontal clipping.

## Required before calling Phase 1 complete
- React shell connected to actual model and source editor.
- Visual canvas selection, multi-select, resize and spacing interactions.
- Richtext-range formatting without destroying mixed content.
- CSS cascade-aware editing, colorpicker/eyedropper.
- Native open/save/autosave/recovery/conflict E2E on real supported OS.
- Sandboxed project JS cannot call Tauri IPC, escape to privileged UI, or modify app state.
- Build simple responsive page, code/canvas switch, undo/redo, save, restart/recover, export and render.
- Actual screenshot inspection at desktop and narrow UI; keyboard/contrast/reduced-motion checks.
- Desktop native build and installer are not proved by Rust unit tests.
