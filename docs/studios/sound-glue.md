# Sound - Glue clips (Stage J3)

Glue renders the selected clips on one track into a single clip.

## What it does

- With two or more clips selected on one track, the Glue button renders them with their clip-level settings (gain, fades, gain curves bake in; the track rack, fader and pan stay live) into "<track>-glue.wav" in the media library and replaces the selection with one clip at the earliest start. The new clip takes the earliest clip's name.
- No rack means nothing rings, so the glued render carries no tail and covers exactly the selected material.
- One undoable arrangement edit; the media item stays in the library like any import. No WASM needed (no active rack).

## Files

- `src/lib/sound/analysisSource.ts` - `glueSession`.
- `src/lib/sound/mixWorker.ts` - worker kind `glue`.
- `src/lib/sound/arrangeStore.ts` - `glueClipsToMedia`.
- `src/components/sound/SoundArrange.tsx` - the Glue button next to Paste.
- `src/locales/sound/*.json` - label and hint in all 5 locales.

## Test

- `glue.test.ts` - session shape and rejection cases; the audio identity (glue plus live fader/pan equals the track contribution).

## Note

Worker round-trip and media registration are CI/device territory, as with reverse, bounce and freeze.
