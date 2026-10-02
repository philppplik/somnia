# Alpha acceptance

## Executed local core tests
- No-op byte-exact source; text patch local and escaped.
- Unrelated comments, script, unknown/template attributes, quote choice, CRLF and Unicode preserved.
- Mixed text replacement refused, not flattened; inline range formatting preserves tags/entities/comments; operation failures roll back entire transaction.
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
- Richtext range formatting: inline mixed content tested locally; broader block/embedded selections safely refuse.
- CSS cascade-aware editing, colorpicker/eyedropper.
- Native open/save/autosave/recovery/conflict E2E on real supported OS.
- Sandboxed project JS cannot call Tauri IPC, escape to privileged UI, or modify app state.
- Build simple responsive page, code/canvas switch, undo/redo, save, restart/recover, export and render.
- Actual screenshot inspection at desktop and narrow UI; keyboard/contrast/reduced-motion checks.
- Desktop native build and installer are not proved by Rust unit tests.

## Native adapter mock acceptance
- Native folder selection/read content takes over the in-memory model.
- Journaling rejection keeps dirty state and reports the error.
- Explicit retry stages the current exact bytes with a newer client revision.
- Save includes the actual {exists, hash} disk revision.
- Native filesystem final supplied logs show 18 Linux tests; these logs are not a GUI runtime test.

## Remaining integration risks
- Native recovery is text-only: editor-only IDs/lock/hide state are not persisted to that journal.
- Removing a newly created file through model undo does not remove the disk file.
- Native menu event listener is wired, but an actual OS menu has not been created/tested.
- Local media and project scripts are intentionally absent from preview.
- Compare/reviewed save, keyboard modal behavior and ZIP source export tested locally; real native conflict/recovery/runtime still required.
