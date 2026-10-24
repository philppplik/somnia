# Sound - Magnetic snap (Stage E1)

Clip dragging in the Arrange view now snaps to context points, not only to the fixed 0.1 s grid.

## What it does

- While the **Snap** checkbox is on, a dragged clip magnetically attracts to: the session start (0), the session end, every other clip's start and end, and all markers - when the pointer is within about 8 px of the point.
- Outside the attraction range the drag still snaps to the 0.1 s grid; with Snap off it stays free (frame resolution) with no magnets, so the checkbox is a single master switch.
- The dragged clip's own edges are excluded (they move with it), so a clip never snaps onto itself.
- Ties are deterministic: smaller frame wins.

## Files

- `src/lib/sound/snap.ts` - pure helpers: `snapPoints(session, excludeClipId?)` and `snapFrame(raw, points, grid, threshold)`.
- `src/components/sound/SoundArrange.tsx` - the clip drag applies `snapFrame` with an 8 px pixel threshold converted to frames via the current zoom (`span/laneWidth`); the Snap checkbox gained a title tooltip explaining the behavior.
- `src/locales/sound/*.json` - `sound.arrange.snapHint` in all 5 locales.

## Notes

- Deterministic, pure functions - no AudioContext or Web Audio involved.
- Fade-handle drags keep the plain grid; magnetic snapping applies to clip position drags only.
- No new dependencies.

## Test

- `snap.test.ts` - point collection (bounds, other clips, markers, excluded dragged clip) and attraction vs. grid behavior (threshold, grid fallback, snap-off pass-through, no negative frames).
- Locale parity tests cover the new key.
