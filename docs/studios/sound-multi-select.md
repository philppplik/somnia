# Sound - Multi-select (Stage G5)

Ctrl/Cmd+click selects several clips; dragging moves the group, Delete removes it.

## What it does

- Plain click selects one clip as before; Ctrl/Cmd+click toggles a clip in and out of the selection. Selected clips share the accent ring.
- Dragging any clip of a multi-selection moves the whole group in ONE undoable edit (`clips.move`): the dragged clip snaps (magnetic points + grid as usual) and every other selected clip shifts by the same delta, clamped at zero. Group drags stay on their tracks; single-clip drags keep the lane-change behavior.
- Delete/Backspace with a multi-selection removes the group atomically (`clips.delete`); a single selection uses the existing `clip.delete`.
- Alt+drag (slip) stays a single-clip gesture. The detail panel shows while exactly one clip is selected.
- The clip tooltip explains the multi-select gestures.

## Files

- `src/lib/sound/arrangeCommands.ts` - `clips.move`, `clips.delete` (both validate every id before mutating, so failures are atomic).
- `src/components/sound/SoundArrange.tsx` - selection state, toggle clicks, group drag, delete key.
- `src/locales/sound/*.json` - command, catalog and hint keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - cross-track group move, zero clamping, atomic rejection on unknown ids, group delete and undo.
- Pointer gestures are component-level; verified via the command layer, E2E in CI.
