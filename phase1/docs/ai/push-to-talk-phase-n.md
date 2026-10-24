# Push-to-talk dictation, phase N concept

## Intended interaction

Optional whisper.cpp CPU sidecar, MIT only. The user inspects helper/model readiness and explicitly permits microphone capture. Hold the mic button (pointer, Space or Enter); release ends capture and begins local transcription. Mic state is visible, including level, permission pending, recording, transcription and editable review. Cancel stops owned work, releases tracks and discards late results. Recording never sends a chat request. The user edits and explicitly adds the transcript to the chat input; sending chat remains a separate action. A changed input cannot be overwritten.

Two-minute capture ceiling, 20 MB encoded-audio limit, explicit DE/EN language. No browser speech-recognition API, cloud transcription or fallback. Audio is decoded/resampled on-device to 16 kHz mono PCM; native code writes private temporary WAV, invokes the exact checked helper with fixed arguments, then removes scratch files. No spoken contents belong in telemetry or error strings.

## Installation and authority

Model download is optional and only on explicit reviewed confirmation. Show pinned revision, source, 147951465 bytes, SHA-256 and MIT notice before downloading. Existing native download checks space plus 64 MiB headroom, exact size/hash, constrained HTTPS redirects and cancellation cleanup. A model download needs internet; audio transcription does not use a network request. Never confuse model download with audio disclosure consent.

Whisper.cpp approval covers the MIT engine and optional model. It does not provide a reviewed executable binary or approve arbitrary third-party dependencies. Keep preview default-off until a packaging choice and release gates are satisfied. No GPL bundle and no TTS included.

## Release gates and unresolved packaging choice

Need supported target OS/architecture list and a choice between bundled CI-built audited helper binaries or optional signed/checksummed helper assets. Every target needs artifact hashes, pinned engine revision and reviewed complete dependency notices. No unreviewed executable is accepted. CI must prove native build, actual DE/EN inference, microphone permissions, process-tree cancellation, disk/hash failures and scratch cleanup.

OS network isolation and crash-orphan cleanup remain unproven release gates from phase K. Fixed CLI arguments and no inference network code are not an OS confinement proof. Do not ship a claim that nothing can leave the device until release confinement is verified. The development preview remains explicit about its local design and unavailable release packaging.

## Phase N development slice

Improve the existing opt-in prompt control rather than create a duplicate recognizer. Add visible mic level, permission/device/audio/decode/transcription-specific safe failures and a visible timeout. Harden recorder startup cleanup and lifecycle errors. Keep existing edit/add/no-send behavior and all prior tests. Add synthetic browser evidence and lifecycle unit tests. Native/device app E2E are CI-only; no sandbox cargo/WASM.

## Packaging decision, 2026-10-14

Optional downloadable helper assets, not bundled. CI-built from pinned audited whisper.cpp MIT source. Windows and Linux first; macOS with beta/stable. Checksums mandatory, signatures when the signing path exists. Do not fill artifact size/hash fields until generated from real CI bytes. Keep both build flags default-off until isolation and crash-orphan cleanup pass.

Planned CI job matrix: Windows x86_64 and Linux x86_64 initially; aarch64 only after runner/build validation, not an assumed artifact. macOS matrix is deferred to beta/stable. Run the existing pinned CPU-only build only after the per-target dependency inventory is reviewed. No FFmpeg/GPL bundle. Audit actual static/dynamic linkage, attach complete license notices/SBOM, compute exact bytes and SHA-256 from the artifact, and produce a target-specific manifest tied to engine revision and workflow/source commit. Sign only through the real configured signing path. Upload immutable artifacts for review, not directly to an unreviewed live installer feed.

CI release gates: no inference egress on each supported OS; owned process timeout/cancel and parent-crash orphan cleanup; private scratch lifecycle; DE/EN fixtures; bad helper/model checksum and target mismatch; missing disk space and interrupted download cleanup. A successful compile alone cannot clear these gates. A future installer consumes the reviewed immutable feed with explicit size/license/hash consent, constrained HTTPS redirects, private part file and atomic publication. There is no installer URL or executable download action in this slice; the manifest remains a documented contract until real CI output exists.

## Roadmap-Delta and validation

Added visible prompt mic level, distinct safe permission/device/capture/size/timeout/decode/transcription errors, startup-failure resource cleanup, late-result cancellation tests and recording-state desktop/narrow fixtures. Existing edit-before-add and no-send behavior is retained. No browser/cloud recognizer was added.

Build tooling now outputs optional review assets under dist-voice/helper, not bundled app resources. CI helper builds are manual opt-in and Windows/Linux x86_64 only for this stage. Actual-byte manifest generation sets releaseReady false, no URL/signature and all unproven release gates false. Audits are deliberately absent until reviewed; a requested build fails before fetching if absent. Native contract CI remains separate. Optional asset installation/runtime lookup is not implemented until reviewed distribution URLs, artifacts and isolation/orphan gates exist; it is not presented as finished.

Validation in this slice: 388 Agent/provider tests, 13 focused voice tests, two build-contract tests, four new browser tests and four existing prompt browser tests passed. DS and command checks green. Layers has the existing unsupported TypeScript transpiler warning. Full tsc still reports inherited three/Studio3D/generated-asset errors, no changed voice paths. No real microphone, native inference, artifact download/build or OS isolation proof was run. Default-off flags remain unchanged; native/device full app E2E is CI-only.
