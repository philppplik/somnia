# Sound - Bounce the render to a new track (Stage H1)

The rendered mix (full session or the selected range) can be committed back into the session as a new track.

## What it does

- New store action `bounceRenderToTrack()`: takes the CURRENT rendered buffer (so what you heard is what you get), registers it in the media library as `<session>-bounce.wav` (numbered on collision, never overwriting), opens it through the normal sound pipeline, uploads it to the mix worker, and appends a new track with one clip in ONE undoable edit. A bounced range is placed at the range start.
- The Bounce button sits next to Export and is enabled under the same freshness rule: the render must match the current revision and output range.
- New shared helper `uniqueMediaName(existing, fileName)` in `media.ts` (also used by the G2 reverse path now): first free name, numbered `-2`, `-3`..., never overwriting.

## Files

- `src/lib/sound/arrangeStore.ts` - `bounceRenderToTrack`, reverse path on `uniqueMediaName`.
- `src/lib/media.ts` - `uniqueMediaName`.
- `src/components/sound/SoundArrange.tsx` - button.
- `src/locales/sound/*.json` - `sound.arrange.bounce` / `bounceHint` in all 5 locales.

## Test

- `mediaCloseAtomicity.test.ts` - `uniqueMediaName` sequencing.
- The bounce flow itself orchestrates tested pieces (render, media registration, session pipeline, worker upload); it needs the real engine, so E2E stays in CI.

## Note

- Undo removes the bounced track; the media item stays in the library, like any import.
