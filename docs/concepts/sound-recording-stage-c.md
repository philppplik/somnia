# Sound Studio C: Recording and Speech Editing

Status: scope approved by Philipp (14 Oct 2026 plan A/B/C, recording + speech editing named as stage C; 15 Oct 2026 decision list item 7 "Sound Stage C" answered yes). Recording ships only behind explicit user start and OS-level microphone permission. No new dependencies, cores or cost. The macOS microphone entitlement is a separate package decision, not implied by this document.

## Outcome

Turn Sound into a place where a voiceover or interview can be captured and cleaned up without leaving the app: record a take onto its own track, then cut pauses and false starts with deterministic, undoable edits. This is offline production on the existing 48 kHz stereo engine, not a live DAW and not a transcription service.

## C1: record a take onto a track

- Explicit Record button in the Arrange view. No recording without a deliberate user action; the armed/recording state is visible at all times. A take always lands on a new track at the playhead.
- getUserMedia + MediaRecorder plumbing follows the proven video voiceover pattern: pure decisions in a lib module, plumbing in the workspace component. Container preference: opus in WebM, MP4 audio fallback for the macOS webview. A take becomes an immutable source; original files are never modified.
- Bounded: one take at a time, no input monitoring in the first slice, take length capped, level readout comes from the recorded buffer only (never a fabricated live meter while recording is stopped).
- Permission paths: the browser/webview prompt is the only gate on web and on Windows WebView2. Permission denied, no device and device busy are explicit UI states, never silent failures. Closing the workspace always releases the microphone (pattern from VideoWorkspace).
- Desktop macOS: recording requires NSMicrophoneUsageDescription in the app package. That entitlement change is a separate decision Philipp confirms before it lands. Until then the desktop build hides the Record button rather than failing at runtime.

## C2: silence-based speech editing (no microphone needed)

- Headless detection of silence segments in a rendered track: threshold in dB, minimum silence duration, padding kept around speech. Deterministic on the rendered PCM; computed in the worker, never on the UI thread.
- Review UI lists detected pauses with their durations. The user can cut all, cut selected, or keep everything. Cutting reuses the existing ripple-delete/undo machinery as one atomic undoable action. Preview and export must agree (existing parity rule).
- Fixtures: synthetic speech-like buffers with known gaps, a continuous tone, full silence, very short recordings; threshold edge cases; undo/redo roundtrip; session save/reopen keeps the edit.

## C3 (concept only, separate verification): transcript-guided editing

- Reuse the existing local whisper infrastructure (Transcript Hub, local_voice) to cut by words or filler sounds. Requires checking whether the installed model path covers arbitrary file transcription. No new model downloads, cores or services without Philipp's explicit nod. Not part of the first build.

## Scope and proof

Recommended order: C2 first (mic-free, dependency-free, fully testable headless), then C1 behind its gates, then C3 after its own verification. No coming-soon buttons; the Record button stays hidden until its permission story is real on that platform.

Acceptance: recording never starts without explicit user action; permission-denied and no-device states are visible; the mic stream is released on workspace close and on every error path; a take lands as an immutable source at the correct offset; silence detection is deterministic on the fixtures; a pause cut is exactly one undo step; preview/export parity holds; save/reopen migration works; narrow and dark views are inspected. Licensing unchanged: no new packages.

Roadmap-Delta: adds take recording onto a track and silence-based speech editing; transcript-guided editing remains concept pending its own verification.
