# Sound - Stem export (Stage I1)

The Stems button exports every track as its own WAV in one ZIP.

## What it does

- Each track renders through its own inserts with its level and pan (no master chain), so the stems sum back to the mix. This reuses the single-track session behind per-track analysis.
- The current output range applies to stems exactly like to the mix render; without a range each stem keeps its own content length plus its own effect tail, and all stems start at session frame 0 so they align on reimport.
- Stems ship as one stored (uncompressed) ZIP written by a small internal writer - no dependency. Browser: one download; desktop: one save dialog for "<session>-stems.zip".
- Duplicate track names get numbered file names; tracks without clips are skipped.

## Files

- `src/lib/sound/stemZip.ts` - the stored ZIP writer (CRC-32, local headers, central directory, EOCD).
- `src/lib/sound/mixWorker.ts` - worker kind `stems`.
- `src/lib/sound/arrangeStore.ts` - `exportStems`.
- `src/components/sound/SoundArrange.tsx` - the Stems button next to Export.
- `src/locales/sound/*.json` - label and hint in all 5 locales.

## Test

- `stemZip.test.ts` - CRC-32 check values, a strict reader round-trip, rejection cases.
- `stems.test.ts` - the per-track renders sum back to the full mix; stem lengths follow each track's content and tail.

## Note

An active rack requires the built Sound WASM, like playback. The worker round-trip and the desktop save path are CI/device territory, as with bounce and freeze.
