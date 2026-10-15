# Sound - Undo/redo keyboard shortcuts (Stage H2)

Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes the last arrangement edit.

## What it does

- The Arrange view key handler now routes undo/redo chords to the existing undoable command history.
- The focus guard applies: inside inputs, selects, textareas, buttons and contenteditable the chords keep their native text-editing meaning.

## Files

- `src/components/sound/SoundArrange.tsx` - key handling.

## Test

- DOM-level shortcuts; the undo/redo history itself is covered by the existing command tests. Suite passes unchanged.
