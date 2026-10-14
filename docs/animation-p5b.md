# Animation P5b: audio basics

## Roadmap delta

- WAV and MP3 import as an audio layer. The original file bytes are embedded (base64) in the local `.somnia` snapshot under `audioAssets`; layers refer to it by id. Limits: 2 MB per file, 10 minutes, 8 files, 4 MB in total (a snapshot is still capped at 8 MB, so large images and audio share that budget). Mono or stereo, 8 to 192 kHz.
- Validation re-reads the embedded bytes. WAV (PCM 8/16/24/32 bit and 32-bit float) is parsed here and must match its stored rate, channels, duration and peak count exactly. MP3 needs an optional ID3v2 tag followed by two consecutive MPEG Layer III frames, an estimated length of at most 10 minutes, and is then decoded with the browser's own decoder. There is no codec dependency; a browser that cannot decode an MP3 refuses it.
- The waveform is a bounded peak table (at most 1024 bins per file, integers 0 to 255) computed during import in small batches with StudioProgress and a real cancel. Drawing is capped at 400 columns, so cost does not grow with clip length.
- Clip model: an audio layer keeps the generic timing fields. The clip plays on the timeline from `offset` for `outT` ticks and starts `audio.trimIn` ticks into the file. `audio.update` (command `animation.audio.update`) edits trim start, length and offset together and refuses anything outside the file. The layer eye mutes; solo behaves like the viewer.
- Volume is a percent from 0 to 200 with ordinary keyframes in composition time (`animation.audio.volume.set`, `.animate`, `.keyRemove`). Keys use the same interpolation as other scalar properties.
- Preview sync: the Web Audio clock is the master. Playback schedules sources at absolute context times, and the playhead is derived from that same clock minus the reported output latency, so picture and sound cannot drift from separate timers. Looped playback schedules the next work-area pass one pass ahead, anchored at the exact wrap time. Start frame, wrap and end follow the same rules as silent playback (`playbackPlan` is tested against `playbackAt`). Editing audio while it plays pauses playback instead of leaving stale sources.
- Removing the last layer that uses a file removes the file from the document (undo restores it). Audio layers are never drawn and do not affect PNG frame or sequence export.

## Limits and non-claims

- No mux, no audio in any export, no mixing to a file, no resampling or effects, no recording, no scrub audio. Preview audio plays only during playback.
- Audio files are part of the recovery journal; a document that exceeds browser storage loses crash recovery, as with large images.
- Output latency is the value the browser reports. Some devices report none, so a constant offset of a few tens of milliseconds is possible. Drift is not possible within a session because both sides read one clock.
- Volume keys cannot be dragged on the timeline yet; add and remove them at the playhead from the inspector.
- Native shell behaviour and other browsers (Safari, Firefox MP3 decoders) are unverified. A 5-file asset set near the limits has not been loaded on a real desktop build.

## Validation

- 19 new unit tests (`src/lib/animation/animation-p5b.test.ts`): WAV and MP3 parsing and refusal, peaks, tamper and limit checks on embedded assets, import/trim/offset/volume edits and undo-safe pruning, snapshot round trip, timing (offset, trim, passes against `playbackAt`), gain curves, and the preview scheduler against a fake clock (start, latency, loop re-arm, stop, unavailable audio). 102 Animation tests in total pass.
- Isolated real Chrome (`test/animation-preview.tsx?audio=1`): a generated WAV went through the real import path; German light and dark pixels reviewed at 1440x900. Twelve samples of the real AudioContext clock against the playhead over 3 s showed a constant offset (0.13 to 0.16 s: scheduling lead, reported output latency and frame rounding) with a spread of 0.029 s, under one frame at 30 fps.
- `tests/animation-p5b.spec.ts` is CI-only full-app coverage and was not run locally. Native/WASM gates remain CI/release work.
