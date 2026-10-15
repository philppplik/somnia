# Sound - Freeze track (Stage H6)

Freeze renders one track with its rack into a new media item and replaces the track's clips with the frozen audio.

## What it does

- The Freeze button on a track renders its clips through its own rack (the mix worker runs the same render pipeline as playback) into "<track>-freeze.wav" in the media library, numbered on collision.
- The track's clips become a single clip of the frozen audio placed at session frame 0, so alignment is sample-exact and the effect tail is included. The rack is bypassed, not deleted: its chain stays visible.
- Level and pan are NOT baked in - the fader and pan stay live, so the frozen track sums back to exactly what it contributed before.
- One undoable arrangement edit: undo is the unfreeze. The media item stays in the library like any import.
- A track without active rack slots freezes without the WASM DSP (plain render); an active rack requires the built Sound WASM, like playback.

## Files

- `src/lib/sound/analysisSource.ts` - `freezeSession`: the single-track session with neutralized level/pan.
- `src/lib/sound/mixWorker.ts` - worker kind `freeze`.
- `src/lib/sound/arrangeStore.ts` - `freezeTrackToMedia`.
- `src/components/sound/SoundArrange.tsx` - per-track Freeze button.
- `src/locales/sound/*.json` - label and hint in all 5 locales.

## Test

- `freeze.test.ts` - freeze session shape (rack kept, fader/pan neutralized, errors) and the audio identity: frozen audio plus the live fader/pan equals the unfrozen track contribution.

## Note

Worker I/O (media library registration, undo) follows the reverse/bounce path; unit tests cover the session construction and render math, the worker round-trip is CI/device territory.
