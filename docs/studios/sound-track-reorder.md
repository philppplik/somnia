# Sound track reorder (D5)

Status: implementation slice, headless-tested. No new dependency.

## What changed

Tracks can be moved up/down in the Arrange mixer (buttons per track strip, command `sound.arrange.track.move` with a signed delta). The move is an atomic undoable session edit; boundary moves are no-ops that do not create history entries, and unknown tracks are rejected. Track identity, clips, racks and mixer settings move with the track; render order and summing are unaffected (mixing is order-independent summation), so reordering is purely organizational and never changes the output.

## Honest limits

- One-position moves only; no drag-and-drop and no multi-select reorder.
