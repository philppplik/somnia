# Filmstrip thumbnails - integration notes for the swarm lead

New files (all under `phase1/`):

| File | Role |
|---|---|
| `src/lib/video/filmstrip-model.ts` | Pure bucket and tile layout math. |
| `src/lib/video/filmstrip-controller.ts` | Cache (LRU), latest-wins queue, notifications. `ThumbDecoder` interface. |
| `src/lib/video/filmstrip-decode.ts` | mediabunny `CanvasSink.getCanvas` decode. |
| `src/lib/video/filmstrip.worker.ts`, `filmstrip-engine.ts` | Own worker, so the export worker is untouched. |
| `src/lib/video/filmstrip-i18n.ts`, `src/locales/video/filmstrip.{en,de,es,fr,pt-BR}.json` | 4 keys x 5 languages, parity tested. |
| `src/components/video/FilmstripStrip.tsx` | Canvas strip, `data-testid="video-filmstrip"`. |
| `src/lib/video/filmstrip.test.ts` | 14 `tsx --test` unit tests (already matched by `test:core` via `src/lib/video/*.test.ts`). |
| `tests/harness/filmstrip.{html,tsx}`, `tests/filmstrip-harness.spec.ts`, `playwright.filmstrip.config.ts` | Real Chromium check. Dev only. |

One small edit to an existing file: `VideoTimeline.tsx` gets two optional props, `renderStrip(clip,index)` and `trackHeight`. Without them it renders exactly as before (label style and `h-12` unchanged).

## Touchpoints the lead wires

1. **Locales.** In `lib/video/i18n.ts` merge the catalogues:
   `export const VIDEO_CATALOGUES = merge(existing, FILMSTRIP_CATALOGUES)` per locale key. Same keys in all 5 languages.
2. **Controller lifetime.** Create one `new FilmstripController(new FilmstripEngine(), {dpr: window.devicePixelRatio})` per studio (module singleton or in `session.ts`). `dispose()` on studio teardown. Do not dispose from a React effect cleanup that StrictMode replays.
3. **Source registration** (`session.ts`, where `sources.set(item.name, bytes)` runs):
   `filmstrip.register(item.name, bytes.slice(0))` - it takes ownership (transfers) of the buffer, so pass a copy.
   Where the source is closed (`sources.delete(name)`): `filmstrip.unregister(name)`.
   Re-opening the same name: call `register` again; that bumps the generation, frees old thumbnails and ignores in-flight results.
4. **Timeline.** In `VideoWorkspace.tsx`:
   ```tsx
   <VideoTimeline ... trackHeight={48}
     renderStrip={c => <FilmstripStrip controller={filmstrip} source={c.source} in_s={c.in_s} out_s={c.out_s} name={shortName(c.source)} />} />
   ```
5. **Playhead and handles** are untouched; the strip is behind the label and handles (it is the first child of the clip block).

## Behavior

- **Buckets are keyed by source time** (`source|gen|step|index|height`). Trim, split, move and reorder never invalidate anything; the new layout reuses cached buckets and only missing ones are decoded. Test: "trim does not redecode buckets already cached".
- **Invalidate** only on `register`/`unregister` of that source.
- **Flicker-free:** a strip redraws in one synchronous pass; a tile without its exact bucket draws the nearest cached frame of the same source. Resize and zoom therefore never blank. Verified in Chromium: 0 blank frames sampled each animation frame during two trims.
- **Lazy:** each strip declares what it needs with `want(owner, tiles)`; a later call replaces the earlier one, so tiles made stale by a drag are never decoded (in-flight batch of at most 4 finishes). Decoding is sequential in one worker.
- **Memory:** LRU of 400 bitmaps (`maxTiles`), evicted bitmaps are `close()`d, currently wanted tiles are never evicted.
- **Failures:** a source that cannot decode sets `controller.state(source)==='failed'` (canvas gets `data-state="failed"`, stays empty; `video.filmstripUnavailable` is available for a note with `controller.error`-style text if you want one). A frame that fails is not retried.

## Crossfade / overlapping ranges (lead contract)

The strip is per clip and depends only on the block's pixel size and the clip's source range `[in_s,out_s]`. Overlap needs no strip logic:
if the block of clip B starts `crossfade_s` before clip A ends, give each block its own `left/width` from its range as today; each strip lays out its own tiles. Z-order: the later clip's block sits on top. Do not shorten `out_s` for the fade; pass the clip's real source range, and the visible overlap just covers part of A's strip.
Preview slots (`video-player`, `video-player-b`) are not used by the strip; thumbnails come from the filmstrip worker, never from the preview elements.

## Run

`npx tsx --test src/lib/video/filmstrip.test.ts`
`npx playwright test -c playwright.filmstrip.config.ts` (starts vite only; no WASM bridges needed; uses `/usr/bin/google-chrome` - edit `executablePath` locally).
