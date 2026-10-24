# Sound - Marker navigation (Stage K3)

Ctrl/Cmd+Left/Right jumps the playhead between markers.

## What it does

- Ctrl/Cmd+Right moves the playhead to the next marker after the current frame, Ctrl/Cmd+Left to the previous one. With no marker on that side the jump lands on the session boundary (0 or the end). The preview position follows, as with every playhead move.
- Behind the existing focus guard.

## Files

- `src/lib/sound/arrangement.ts` - `markerJump`.
- `src/components/sound/SoundArrange.tsx` - the shortcut (the key handler now also tracks the playhead frame).

## Test

- `markerNav.test.ts` - nearest marker per direction, strictness at the current frame, boundary fallbacks, invalid frames.
