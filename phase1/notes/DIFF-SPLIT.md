# Diff split in the editor (design)

Status: design, replaces the diff dialog.

## Goal
Compare code side by side directly inside the native editor, like a split tab. No popup.

## Design
- Built on `@codemirror/merge` (MergeView): left = base, right = the editable current file.
- Toggle: an icon in the editor toolbar and a command "Toggle diff split". Off by default.
- Base choices (selector in the split header): last saved version, another open or project file.
- Next / Previous change buttons (and F7 / Shift+F7) jump between chunks.
- The right side stays the live document, so edits, undo and save work as before.
- Reverting a chunk from the gutter is available on the right side.
- Closing the split returns to the normal editor with state, selection and undo intact.

## Migration
1. Add the split component and tests (toggle, base choice, next/previous, edit stays undoable).
2. Switch the existing "Compare" entry points to the split.
3. Remove the diff dialog and its code once the split covers saved and other-file comparison.

## Limits
- Text diff only (no structural HTML diff).
- Large files: chunk computation runs on the main thread; benchmark before release.
