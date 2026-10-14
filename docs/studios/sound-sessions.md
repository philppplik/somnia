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

## Arrange & Mix integration (A2)

The Sound canvas now switches between **Clip editor** and **Arrange & Mix**. The original clip inspector stays intact. Arrange uses a separate bounded session, with source names and real source waveform peaks, draggable clip positions, a 0.1-second snap grid, zoom, split/duplicate/delete, numeric trim/offset/fade/clip-gain controls and keyboard-accessible track reassignment. A mixer provides track gain, pan, mute and solo. Markers, looped session playback and atomic undo/redo use the session document. Edits invalidate the rendered audition and export immediately.

Open audio files through the existing file picker, then add them to the session. Sources use the original decoded clip, not the clip inspector's processed effect recipe. Each import uses the existing WASM decoder followed by PCM WAV decoding in a separate mix worker; the main thread never mixes or decodes PCM. **Render mix** produces one float WAV used for both the audio player and export. Session commands are interactive-only in the shared dispatcher; agents/MCP cannot execute them. While Arrange is mounted, single-clip commands including the existing header export are blocked, so the header cannot silently export the unrelated active clip. Use **Export mix WAV** in the Arrange transport.

**Download session** saves bounded JSON edits and source descriptors. It does not embed audio or claim an OS-native session save. **Open session** validates before replacing the current session and asks before discarding edits. Reopened sources must be opened in Somnia and explicitly relinked; duration, rate and channels must match. Missing media blocks render/export. Audio is not uploaded. Full-mix WAV uses the existing native one-time save grant on desktop; browser outcomes say **Download started**. Source samples above full scale remain in the float file and the measured count is shown; there is no automatic limiter.

Persistence currently means an explicit JSON file with relinking, not autosave, recovery, project-container embedding or an embedded portable audio bundle. The download request is not proof of a file written to a specific directory. The initial history stores documents only, not source PCM. The session survives switching back to the clip editor, but browser page reload still requires a saved file. Beforeunload warns for dirty sessions while Arrange is mounted; native app-close/project transitions need separate integration checks. Manual rendering, not real-time effects, is intentional in this bounded first implementation.

### A2 checks

- 16 focused session/command tests, plus deterministic PCM decoder tests.
- `scripts/sound-arrange-screenshots.mjs`: real worker mix of two deterministic audio fixtures; split/undo/redo; stale output disabled after a level edit; JSON reopen and missing-media block; explicit relink of both sources; mix render and real browser WAV download.
- Harness screenshots in light, dark and 700 px width, inspected directly. Track strip height was corrected after the first visual check. Harness decoder uses a deterministic WAV fixture stub; the mix worker is real. Production compressed-media decode and native dialogs are not established by this harness.
- Full app typecheck is blocked only by the baseline absent generated Slides WASM module in this checkout. Focused A1 model/mixer typecheck is green.

Roadmap-Delta A2: usable bounded timeline/mixer with non-destructive edits, history, JSON save/reopen/relink and worker mix audition/export. Full DAW parity, long-form streaming, local speech, recording and the serial effects rack are not included.

A2 follow-up: the browser dirty-session guard now persists when switching back to the clip editor. The mix worker also enforces an aggregate decoded-source budget including sources retained for undo, rather than relying only on current document limits. If that budget is reached after repeated imports and undo, save/reopen and relink the current sources to release unused worker media. Command-title keys are included under `cmd.sound.arrange.*` for the shared inventory gate. The integrator must add `registerArrangeCommands` to the shared `dump-ui-commands.ts` mount-time registration list and regenerate the inventory; that shared file is not edited by this slice.
