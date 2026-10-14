# Sound sessions

## Delivery status

Slice A1 adds the session document, strict persistence validation, bounded history, deterministic stereo mix math and a 32-bit float WAV encoder. These are headless modules; the existing single-clip UI is unchanged in this slice. The worker, Arrange/Mix UI, source relinking and save/export integration follow separately. No new dependencies.

## Document

`phase1/src/lib/sound/arrangement.ts` defines a versioned JSON document. Its timebase is integer frames at 48 kHz, including clip positions, source offsets, fades, markers and loop boundaries. Imported source descriptors retain their original sample rate and mono/stereo channel count. Source offsets are in session frames, so conversions happen only when sampling the source.

A session contains tracks with level, balance/pan, mute and solo, plus non-destructive source-referencing clips. Clips support independent level and linear in/out fades. Overlapping clips sum; paired fade lengths create a linear crossfade. No automatic crossfade or destructive source edit is implied. Splitting creates two references to the same source; it preserves outer fades, shortens intersected fades, and clears the new inner fades. Editing through history validates a full copy before committing and preserves the current document on any error.

## Initial bounds

- 8 tracks, 128 clips, 32 sources, 128 markers.
- 120 seconds of timeline at 48 kHz.
- 12 million total source samples across channels (48 MB of decoded float PCM), and 50 document-history entries. PCM is not copied into history.
- Mono/stereo only. Source rates: 8-192 kHz.

These are conservative safety bounds, not benchmark-backed performance promises. Output plus worker transfers and decoding consume additional memory. Long-form streaming, surround and unlimited sessions are not in this package.

## Rendering contract

`mix.ts` validates the document and every decoded source, then mixes the requested valid timeline range. Muted or non-solo tracks do not contribute, but missing media always blocks output, including references on muted tracks. Mono uses equal-power pan; stereo uses balance, preserving the original channels at centre. Sample-rate conversion currently uses linear interpolation, explicitly not mastering-quality resampling. Overlaps sum without an implicit limiter. Reports count samples above full scale and expose the actual peak.

The float WAV encoder preserves headroom instead of silently clipping. The eventual UI must warn on over-level output and use the same rendered WAV for audition and export. Meter reports here are sample peaks, not LUFS or true peak. Mastering and higher-quality sample-rate conversion belong to a later slice.

## Validation

Run from `phase1`:

```sh
node --import tsx src/lib/sound/arrangement.test.ts
```

Tests cover round-trip parsing, rejected malformed data, history atomicity and isolation, split offsets, stereo/mono panning, mute/solo, differing rates, fades, overlap clipping, range rendering, missing media and WAV payloads. These tests use deterministic PCM fixtures. This slice does not establish native playback, microphones, rendering speed or visual correctness. Full-app CI and desktop checks remain separate.

Roadmap-Delta: replace the one-region/one-clip document constraint with a tested multitrack data and rendering foundation. Timeline controls, persistence files and worker integration are not complete in A1.
