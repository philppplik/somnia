# Sound - Grid nudge (Stage I3)

Arrow keys on a clip nudge by the active grid step and move the whole selection.

## What it does

- Left/Right on a focused clip moves it by the current grid step - 0.1 s, beat or bar, exactly as the grid selector and bpm define - instead of a fixed 0.1 s.
- When the focused clip is part of a multi-selection, the whole selection moves together (one undoable `clips.move` edit).
- Alt+Left/Right still slips the focused clip's content by the grid step.

## Files

- `src/components/sound/SoundArrange.tsx` - the clip key handler.

## Test

- Behaviour rides on the tested commands (`clips.move`, `clip.set`); the arrange keyboard layer has no component harness, so the wiring itself is covered by type check and manual/CI runs, same as the other shortcut slices.
