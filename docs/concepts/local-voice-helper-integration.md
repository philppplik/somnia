# Native voice helper integration: proposed build contract

Status: design only, not implemented, no dependency/helper/model installation approved by this document. Date: 2026-10-14. Builds on local-voice-models.md, with current local-model runtime UI as the host integration seam. The helper is a Somnia application component, not an automation service or remote endpoint.

## First slice and non-goals

First slice: imported WAV or push-to-talk PCM -> pinned multilingual whisper.cpp STT -> editable final transcript. No partial transcript triggers tools, edits, submission or permission. No always-listening mode, automatic cloud fallback, voice cloning, TTS or platform speech APIs labelled offline. Capture permission comes from explicit user action and the OS; arbitrary project/model content cannot start capture.

TTS is a separate decision after a sherpa-onnx engine/model bundle review. No GPL Piper engine is silently bundled. Selecting STT/TTS never changes the saved text/tool model or disclosure permission.

## Helper boundary

Rust owns the helper process, private scratch storage, immutable model identity, cancellation and job lease. Renderer owns only request intent and presentation. Fixed packaged executable path, never user/project-provided paths or shell command strings. No network listener, shell invocation, runtime package-manager download or inherited API keys/proxies. Helper sandbox/network-denial policy must be tested per OS before claiming offline.

Proposed protocol: versioned length-prefixed JSON control frames on private stdio; separately bounded binary PCM frames on a private pipe. A single-stream implementation may use explicit length-prefixed tagged binary frames, not raw PCM embedded in JSON/base64. Maximum control frame 64 KiB, audio frame 256 KiB, total initial job audio 10 minutes. These are starting limits, not measured performance targets. Helper rejects unsupported protocol, duplicate job IDs, oversized frames, unknown fields and out-of-order audio before allocation.

Handshake: hello {protocol:1, helperVersion, engineRevision, supportedFormats, capabilities}; host validates packaged manifest and executable digest before accepting. start {jobId, generation, operation:stt-file, modelId, artifactRevision, language:auto|BCP47, format:{sampleRate,channels,sampleType}, maxSamples, sourceRevision, retention:memory|private-temp}. Host maps modelId to a verified allowlisted bundle. No caller-supplied helper/model paths. sourceRevision is a consistency token, not private document content.

Audio frames: {jobId, generation, sequence, sampleCount, byteLength} followed by exact bytes. Host converts explicitly to tested model input format (initial 16 kHz mono PCM) using approved preprocessing. No guessed conversion, silent stereo channel loss or timestamp shift. Initial file jobs require format validation; microphone integration follows successful file-only testing. Helper acknowledges frame consumption for bounded backpressure. End-input includes final sample count; mismatch fails closed.

Events: started; progress; final-segment {segmentId, startSample, endSample, text, language}; completed {sampleCount, timings}; cancelled; failed {code,retryable}. Partial-segment is later and always provisional. No word timestamps unless exact engine output supports them. Raw private path/audio/transcript never enters diagnostic logs. Results are data, never instructions or authority. Segment/sample positions are validated against the accepted source length.

## Artifact pinning and installation

Reviewed manifest: helper target triple/build revision/SHA-256, engine revision/source/license, exact multilingual weight source immutable revision/file/SHA-256/bytes, model language list/input limits and companion files. Never put a placeholder digest in an installable catalog. Missing immutable revision/checksum/license means unavailable, not a best-effort download. Candidate base/small multilingual models are research choices until exact artifacts are reviewed; .en is not a German default.

Explicit Download review names every file, bytes, source/license, known volume/free space or Not checked, and network use. Downloads write private .part files on the model volume, check length/digest, then atomic rename. Interrupted downloads are resumable only with validated source identity/range behavior. Failed digest is quarantined and cannot load. No scripts from metadata. Upgrade creates a new versioned bundle; active jobs retain their immutable lease. Delete blocks active jobs and names shared users, without promising secure erase.

## License table and review gates

| Component | Primary evidence | Proposed treatment |
| --- | --- | --- |
| whisper.cpp engine | https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE (MIT) | Pin reviewed revision; notices and all compiled backend dependencies in package SBOM |
| OpenAI Whisper code/weights | https://github.com/openai/whisper/blob/main/LICENSE (MIT) | Exact converted GGML/GGUF artifact provenance/checksum still needed; engine license does not certify conversion provenance |
| sherpa-onnx | https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE (Apache-2.0) | Separate TTS decision; exact voice/config/token/phonemizer artifact licenses reviewed individually |
| Current Piper engine | https://github.com/OHF-Voice/piper1-gpl/blob/main/COPYING (GPLv3; inspect exact release packaging too) | Excluded from this MIT helper slice; process separation is not an automatic redistribution exception |
| German Piper-derived voice candidates | Model-specific card and every conversion/config/token artifact | Unapproved until engine, weights, phonemizer, data-derived and conversion terms all reviewed; dataset CC0 alone is insufficient |

This table is a source review, not legal advice or a redistribution approval. GPU backend SDK/runtime terms need separate accounting. TTS does not inherit the STT license decision.

## Cancellation, crash and retention

Host sends cancel {jobId,generation}, stops capture immediately, closes pending audio frames, clears renderer preview buffers and waits for helper cancelled. Proposed grace period 500 ms, then kill owned process tree and wait for exit. Measure cancellation tail before selecting final threshold. Late/duplicate events are ignored by generation; completed after cancel never applies output. Cancel releases the owned lease, not external Ollama resources. No helper auto-restart/replay of microphone, transcript submission or tool actions after crash.

Memory-only audio is default. If a private temporary file is required, mode 0600/equivalent ACL in an application-owned directory, bounded per-job storage, no shared public temp paths. Cleanup after success/cancel/crash and startup orphan scan with manifest ownership. No secure-erasure promise. Final transcript remains local editable draft; Save/Insert is separately reviewed and one undoable studio transaction pinned to source/document revision. Session switch cannot retarget it.

## Packaging and release checklist

Windows x64/ARM64, macOS arm64/x64, Linux supported triples need separate signed/pinned helpers. No claiming support from cross-compilation alone. Package paths and digests ship in a reviewed manifest; notarization/code-signing status is surfaced honestly. Native helper failures must not black-screen the app. CPU fallback must be real or unavailable, never an unannounced CUDA install.

CI: frame parser fuzz/property tests, truncation/order/length/overflow fixtures, malicious metadata, missing/different artifact digest, no-network test after provisioning, old/unknown protocol, helper crash/timeout, cancel race, source-revision switch, private-temp ACL/cleanup, malformed WAV and resampling duration tests. Build/license/SBOM checks cover every binary dependency and architecture. Existing tests stay intact.

Owner-device gate: German/English known nonsensitive utterances, noise/silence (no hallucinated transcript), accurate timing, cold/warm load, peak process-tree RAM/VRAM, cancellation tail, microphone revoke/unplug/session-lock, playback/export coexistence, no background capture after restart. Report measured results and exact engine/model/hardware, not upstream speed claims. Delivery requires a usable reviewed transcript, not merely a spawned helper.

Open owner decisions: exact helper packaging targets, CPU-first vs backend bundle, initial multilingual model/artifact provenance, permitted download size/storage budget, and later TTS scope. No code or dependencies added by this design.

## Prepared host UI seam (2026-10-14)

The host now has a microphone-consent/push-to-talk shell, bounded capture owner and
final-transcript review insertion. Production has no STT adapter: record is disabled and
explicitly says no approved helper/model. The fake adapter exists only inside development
fixtures/tests, never as a production fallback. No browser speech recognition is used.

Browser capture currently reports its actual MediaRecorder MIME/codec, bounds duration to
two minutes and encoded bytes to 20 MB, and uses Web Audio only for level measurement.
This is not the proposed whisper.cpp PCM input. Before native wiring, select an approved
codec decoder/resampler and test duration/channel semantics; do not send encoded WebM
as if it were 16 kHz PCM. Capture starts only on press/keyboard hold after explicit consent;
release during an unresolved permission prompt cancels the job and closes a late stream.
Cancel/unmount/revocation/unplug stop owned tracks and discard audio. No transcript from
late or incomplete jobs reaches insertion. The original document is pinned before capture;
edited final text opens a native source proposal and requires complete preview acceptance.

Optional engine-model provisioning remains a separate, blocked native implementation.
No binary download, model checksum or redistribution approval is supplied by this doc.
MIT source notices verified earlier remain source evidence, not pinned artifact approval.
The first real download review must show exact immutable artifact URL/revision, SHA-256,
bytes, engine and converted-model license/provenance, disk availability or unknown, and
network use. Fail closed until those exist; never fill this manifest with made-up hashes.
