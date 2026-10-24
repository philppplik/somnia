# Sound - Slip edit (Stage F3)

Alt+drag slides a clip's content under its fixed bounds; Alt+Arrow keys do the same in 0.1 s steps.

## What it does

- Dragging a clip still moves it; holding Alt while dragging changes the source offset instead, so the audio content slips under the unchanged clip position and length.
- The slip follows the same Snap checkbox: grid-aligned (0.1 s) when on, frame resolution when off, and clamps to the available source material.
- On a focused clip, Alt+ArrowLeft / Alt+ArrowRight slip the content; plain arrows still move the clip.
- The clip tooltip explains both gestures. The validator still rejects offset overflow atomically.

## Files

- `src/components/sound/SoundArrange.tsx` - drag mode, keyboard path, clamping, tooltip.
- `src/locales/sound/*.json` - `sound.arrange.slipHint` in all 5 locales.

## Test

- `arrangeCommands.test.ts` - offset edits land and offset+length overflow beyond the source is rejected atomically.
- The drag gesture itself is pointer math in the component; verified via the command layer, manual/E2E in CI.
