# Sound - Keyboard navigation (Stage J1)

Selection, playhead and zoom keys complete the arrange keyboard map.

## What it does

- Ctrl/Cmd+A selects every clip, Esc clears the selection.
- Home/End jump the playhead to the session start or end (and move the preview position with it).
- +/- zoom the lanes in the same 0.5 steps as the zoom slider (1x to 5x).
- The existing focus guard applies: keys never fire while a form control or button has focus.

## Files

- `src/components/sound/SoundArrange.tsx` - the global key handler.

## Test

- Rides on tested commands and state setters; the arrange keyboard layer has no component harness, so the wiring is covered by type check and manual/CI runs, same as the other shortcut slices.
