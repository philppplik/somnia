# Sound - Delete key removes the selected clip (Stage G4)

Delete or Backspace removes the currently selected clip.

## What it does

- The Arrange view's key handler (which already owns Space for playback) now also handles Delete/Backspace: the selected clip is deleted via the existing undoable `clip.delete` command and the selection clears.
- The same focus guard applies: inside inputs, selects, textareas, buttons or contenteditable the key keeps its native meaning, so text editing never deletes a clip.

## Files

- `src/components/sound/SoundArrange.tsx` - key handling.

## Test

- DOM-level shortcut without a unit surface; the underlying `clip.delete` command is covered by the existing command tests. Suite passes unchanged.
