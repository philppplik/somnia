# Sound - Space toggles the preview (Stage F6)

Pressing Space anywhere in the Arrange view starts or pauses the rendered preview.

## What it does

- A window-level keydown listener toggles the preview audio element while a rendered mix exists (`state.url`).
- The key is never stolen from form controls, selects, textareas, buttons or contenteditable elements, so typing and button activation keep their native Space behavior.
- The existing loop behavior (jump back to the loop start, restart on ended) is untouched.

## Files

- `src/components/sound/SoundArrange.tsx` - listener effect scoped to the view's lifetime.

## Test

- No unit surface: the toggle is a DOM-level interaction with the preview element. Covered by the existing suite passing unchanged; manual/E2E verification stays in CI.
