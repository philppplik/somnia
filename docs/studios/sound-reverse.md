# Sound - Clip reverse (Stage G2)

A clip's source audio can be reversed into a new media item and the clip repointed to it.

## What it does

- New pure helpers in `sessionWav.ts`: `encodeSessionWav` writes the engine-compatible float32 WAV (1-2 channels, same bounds as the decoder), and `reverseSource` returns a reversed copy of a decoded source under a new id without touching the input.
- New store action `reverseClipToMedia(clipId)`: decodes the clip's current source WAV, reverses it, registers it in the media library as `<name>-reverse.wav` (numbered `-2`, `-3`... on collision, never overwriting), opens it through the normal sound pipeline so peaks and the report come from the same path as any import, uploads it to the mix worker, and repoints the clip in ONE undoable arrangement edit.
- Because the reversed audio lives in the media library, sessions reopen cleanly: the source resolves by name like any other audio. Undo restores the clip to the original source; the media item stays in the library, like any import.
- The selected-clip action row gained a Reverse button with busy state and error surface.

## Files

- `src/lib/sound/sessionWav.ts` - `encodeSessionWav`, `reverseSource`.
- `src/lib/sound/arrangeStore.ts` - `reverseClipToMedia`.
- `src/components/sound/SoundArrange.tsx` - button and handler.
- `src/locales/sound/*.json` - `sound.arrange.reverse` / `reverseHint` in all 5 locales.

## Test

- `reverse.test.ts` - channel flip with untouched input and double-reverse identity, WAV round-trip through the session decoder (stereo and mono), encoder bounds.
- The media-library flow itself runs the real engine pipeline in the app; unit-covered pieces are the codec and the transform.
