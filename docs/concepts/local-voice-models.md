# Local voice models: offline transcription and speech synthesis

Status: concept/research only. No implementation or runtime validation included.
Research date: 2026-10-14.
Source baseline: `int/shell`, `315d1f23a061d07215bdc60d25d3d57d756cbaab`.
Scope: speech-to-text (STT), text-to-speech (TTS), voice UX and runtime boundaries. The broader local text/vision/tool catalog is a separate proposal.

## Decision

Offer **Speech recognition** and **Speech output** under Settings > AI > Local models, beside text/vision/tool models. Local models are a product category, not a promise that every model is an Ollama model. Recommend native `whisper.cpp` for multilingual STT, and a separate `sherpa-onnx` TTS adapter for explicitly approved model/voice bundles. Keep Ollama audio input as a capability-probed optional route, not the sole voice runtime. Default to push-to-talk, editable transcript review and manually requested read-aloud. No always-listening mode, voice cloning or automatic cloud fallback in the first version.

Evidence labels: **Current** means inspected repository/source documentation; **Proposed** means future contract or target; **Unverified** means not tested on Somnia, shipped daemon versions or physical hardware. Upstream benchmarks are not Somnia benchmarks.

## 1. Current integration seams

| Current source | What it establishes | Required addition |
| --- | --- | --- |
| `phase1/src/lib/agent/types.ts` | Text messages and text/tool/usage/finish events; no PCM/audio contract | Dedicated voice job protocol rather than overloading text deltas with audio |
| `phase1/src/lib/agent/providers/ollama.ts` | `/api/version`, `/api/tags`, fail-closed `/api/show` locality verification and text/tool `/api/chat` streaming | Explicit audio transport, per-model capability probe and format constraints |
| `phase1/src/lib/agent/modelCatalog.ts` | Ollama catalog currently returns ID/name; not STT/TTS/language readiness | Capability-qualified voice catalog, separate runtime/voice identity |
| `phase1/src/components/agent/AgentSettings.tsx` | Provider/model settings, privacy and tool tabs; catalog refresh is metadata-only | Reuse the settings structure; distinguish installed, available to download, unavailable and tested |
| `phase1/src/lib/agent/privacy.ts` | Only validated local Ollama targets qualify for the existing local bypass; revocation aborts tracked cloud calls | Typed native-voice locality evidence; do not fake an Ollama target or weaken this gate |
| `phase1/src-tauri/src/agent_settings.rs` | Validated persisted provider/model/custom-prompt preferences | Separate versioned voice preferences; no arbitrary executable paths or secrets |
| `phase1/src/lib/sound/commands.ts` | Clip activation, selection, non-destructive processing, transport and WAV export; export review opener already exists at this baseline | Future transcription/narration commands behind reviewed adapters; microphone recording is not established here |

`docs/concepts/performance-resource-architecture.md` proposes resource admission and independent job leases. Integrate voice into that design if accepted; do not claim that coordinator already exists. This audit was scoped to the paths above, not proof that no other experimental audio code exists anywhere in the repo.

## 2. Runtime and model choices

| Candidate | Verified upstream facts | Proposed Somnia role / caveat |
| --- | --- | --- |
| Whisper + `whisper.cpp` | Whisper code/weights MIT; multilingual and English-only variants. `whisper.cpp` offers native CPU inference, quantization, Metal/Core ML, CUDA and Vulkan options, plus a microphone stream example [S1, S2] | First STT runtime; recommend multilingual `base` on modest hardware and `small` after a device test. `.en` is English-only, not a German default. Large/turbo are optional quality tiers, not automatically loaded |
| `faster-whisper` | MIT implementation using CTranslate2; CPU/GPU quantization, batching, VAD integration. Current GPU setup carries CUDA/cuDNN requirements [S3] | Optional user-managed service for workstation/batch transcription; not a Python/CUDA dependency silently added to desktop installers |
| `sherpa-onnx` | Apache-2.0 runtime; offline and streaming ASR, local TTS, Rust/C APIs and desktop/Tauri examples [S4, S5] | Native TTS runtime; later true streaming ASR where an exact model has the right language support. Streaming Zipformer availability does not prove German coverage |
| Piper/VITS German voice | The inspected `de_DE/thorsten/medium/MODEL_CARD` identifies German, single speaker, medium quality and CC0 dataset license [S8] | German voice candidate, not a completed redistribution audit. Verify exact ONNX/config/token/phonemizer artifacts, conversion and their own terms before catalog approval |
| Kokoro-82M | Model card reports Apache-licensed weights; reference voice list includes English, Spanish, French, Brazilian Portuguese and other languages, but does not list German [S6, S7] | Optional voices for supported locales through a compatible pinned export. Do not call it the universal German/English default or equate every third-party conversion with the original weights |
| Current Piper engine (`OHF-Voice/piper1-gpl`) | Active engine is GPLv3 and embeds eSpeak NG [S9] | Separate opt-in runtime only after redistribution/dependency review. Do not copy GPL engine code into an MIT-only module or assume process separation settles license obligations |
| Ollama audio-capable model | Gemma4 E4B page lists audio input. Upstream tests exercise audio chat and `/v1/audio/transcriptions`; public compatibility page inspected here does not document a general STT/TTS guarantee [S10-S12] | Optional audio-input/transcription route after exact installed daemon/model probe. Not evidence of native speech synthesis or low-latency duplex speech |

Recommended default is a *pipeline*: microphone -> local STT -> editable text -> selected agent/text model -> text -> optional local TTS. A tool-capable text model still performs tool calls; Whisper/TTS models do not acquire filesystem or tool permission. Audio understanding and literal transcription are different catalog capabilities.

No model is installed on first launch. Offer Download with size, source, digest, license and all dependent files; confirm disk space. Downloads need network once; subsequent verified inference must work with networking blocked. Pin immutable artifact revisions and SHA-256, use temp files and atomic rename, resume only after checksum validation. Never run install instructions/scripts supplied by model metadata. Re-verify on model/runtime update; quarantine failed checksums. Uninstall must say whether a model is shared by another voice/profile/job.

## 3. Catalog and settings contract (proposed)

A voice entry needs `runtimeId`, runtime version range, artifact revision/digests, engine and weight license references, supported input/output sample rates, channel/format limits, languages, voices, approximate disk size, required companion files and capabilities. Capabilities are separate: `stt-file`, `stt-incremental`, `audio-understanding`, `tts-file`, `tts-chunked`, and optional `word-timestamps`. Add evidence state `declared | probe-passed | device-tested`, probe date/version and limitations. Model size is not resident RAM; estimates must be labeled separately from measured peak process-tree RAM/VRAM.

Show separate STT and TTS choices, language (Auto/explicit), voice preview, capture device, output device, download/delete, Test on this device, and Local only. Selecting a voice never silently switches the text/tool model. Missing language support blocks activation with alternatives; it does not silently use an English voice for German. Let a user disable speech output without disabling transcription.

A shared runtime interface should support `list`, `verifyArtifacts`, `probeCapabilities`, `load`, `transcribe`, `synthesize`, `cancel`, `unload` and health. New interface names are proposals, not current code. An Ollama probe requires daemon version, local weights/locality verification, an explicit audio-capability signal when available and a small bundled nonsensitive fixture. Metadata alone is insufficient. Successful transcription proves the tested format/operation only; never infer TTS or timestamps from it.

Do not use browser SpeechRecognition as an offline substitute. Do not label OS/browser speech synthesis offline without checking the selected voice's actual local availability. For web Somnia, expose desktop-only voice runtimes as unavailable until a separately validated browser/WASM or explicitly paired desktop route exists. A localhost URL alone does not prove offline operation.

## 4. Native execution and event protocol (proposed)

Use an application-owned speech service under the Rust host with a signed, pinned native helper/sidecar for heavy inference. A controlled C API binding is an alternative after crash/cancellation and packaging tests; no package-manager downloads at inference time. Prefer stdio/private IPC; if loopback HTTP is unavoidable, bind only loopback, authenticate the session and prohibit redirects. Do not expose an unauthenticated LAN microphone/transcription service.

Separate capture, preprocessing, inference and playback. Capture actual device format, resample to the model's required rate (Whisper typically 16 kHz mono), and retain the source/time mapping for imported stereo/video assets. TTS output rate comes from the runtime/model, not a hardcoded global rate. Mix/downsample only with explicit policy; clipping/channel layout must be tested. Keep generated samples off React state and use bounded buffers.

Each request carries `jobId`, generation, operation, source/document ID and revision, language, model/voice revision, retention policy and cancellation token. IPC has bounded frame length and total input limits. Events: `started`, `speech-detected`, `partial-transcript`, `final-segment`, `audio-chunk`, `progress`, `completed`, `cancelled`, `failed`. PCM chunks carry sequence, rate, channels and sample count. Partial/final transcript events carry stable segment IDs and source timestamps where supported; unsupported word timestamps remain absent, never invented.

A completed job does not apply an edit. Reject stale events after cancellation, voice/model changes, active-document revision changes or session disposal. Apply final text/audio only through the studio's edit/history API and a target review. Crash/timeout cleans capture, playback and scratch files and reports a retryable error without restarting microphone capture or replaying a tool action.

## 5. Streaming, latency and resource admission

Whisper is not inherently a true streaming ASR model [S1, S13]. `whisper.cpp`'s stream example repeatedly samples and decodes audio; that is evidence of incremental application behavior, not a universal final-token latency guarantee [S2]. Start with push-to-talk and VAD-bounded utterances, then rolling partial results with overlap and deduplication. A partial hypothesis may change. Never execute commands from it. End-of-utterance triggers a final pass and review; timeout/no-speech yields no text, not hallucinated filler. VAD reduces noise processing but cannot guarantee no hallucinations.

TTS sentence/phrase buffering allows playback before a whole response is complete. Do not say token-streaming audio unless the exact model/runtime supports it. Buffer only stable text boundaries; avoid reading code fences, URLs, credentials or tool arguments by default. Use bounded queue/backpressure and reject duplicate/out-of-order chunks. Initial half-duplex mode pauses TTS during capture to avoid transcribing Somnia's own output; full duplex needs acoustic echo cancellation and separate testing. Barge-in cancels synthesis/playback, flushes buffers and starts a new generation.

Proposed device-test targets, not measured promises: capture indicator within 100 ms; Stop silences queued playback within 150 ms; warm STT final result within 2 s after a short utterance ends; first warm TTS audio within 1 s of a completed short phrase. Publish cold-load time separately. If a target fails, offer smaller model/batch mode and show the measured result rather than claiming real-time operation. Accuracy takes priority over reducing a finalization delay.

Measure capture delay, cold/warm load, time to first partial/final, endpoint delay, time to first audio, real-time factor (`inference seconds / source audio seconds`), WER/CER on consented fixtures, peak process-tree RAM and GPU memory, underruns and cancellation tail. Report p50/p95 with exact hardware, OS, runtime/model revision, language and concurrent studio workload. Whisper's upstream PyTorch/A100 VRAM/speed table is not a whisper.cpp desktop budget.

Admission includes STT/TTS and any local LLM in aggregate, plus visible studio resources. Begin with one heavy inference job at a time and bounded thread counts; reserve capture/playback responsiveness. Queue file transcription behind protected playback/export. Do not steal Sound/Video/Slides output unexpectedly; ask before interrupting a presentation/recording. An active capture/playback/job keeps its own lease through a studio switch; cancel or keep explicitly, never lose it merely because React unmounted. Do not unload the user's externally managed Ollama model or shut down their daemon to reclaim memory.

## 6. Per-studio use and honest boundaries

All uses below are proposed, not shipped voice features.

| Studio | Initial use | Review / boundary |
| --- | --- | --- |
| Shared AI panel / Vibe Space | Dictate a prompt; read an approved answer or job summary | Final transcript stays editable before Submit; voice does not approve tool calls, diffs, cloud requests or background agents |
| Code | Explain/read selected prose; dictate an agent request | No blind code insertion, spoken-shell execution or reading secrets from an editor automatically |
| Documents | Dictate into a reviewed caret/range; read selected text | Document ID/revision and language pinned; insert as one undoable transaction; do not replace a selection on a partial result |
| Sheets | Dictate a question about selected cells; read a reviewed summary | Speak range/units and preview cell destinations; never infer formula/data changes from uncertain numbers |
| Slides | Read speaker notes; prepare a narration WAV | Original notes/slides untouched; insertion and slide timing are later explicit edits, not automatic presentation playback |
| Sound | Transcribe an explicitly selected clip/range; generate narration WAV | Source unchanged, timestamps tied to source; importing generated media and recording need their own implemented workflow |
| Video | Prepare editable transcript/subtitle segments; narration asset | Native caption track support/alignment/export remains unverified; offer transcript/SRT asset first, never promise a functioning timeline caption feature |
| Design / Vector / Photos | Dictate an AI instruction; read explicit selected descriptions | No image upload, scene modification or alt-text attachment without reviewed scope; speech does not create vision capability |

Use one shared mic/read-aloud control family with states Idle, Recording, Transcribing, Review, Synthesizing, Speaking, Cancelled and Error. Indicator must persist while capture is active, including studio switches. Prefer a compact panel control and status indicator, not permanent extra toolbar buttons in every studio. Keyboard access, focus restoration, visible waveform/timer, screen-reader labels and reduced-motion behavior are required. All existing five UI locales need proper strings; UI locale, STT language and TTS language are independent.

## 7. Privacy and cloud fallback

Local-only is the default. Capture requires explicit action and OS permission; stop on device removal, permission revocation, session lock or user Stop. Reject background capture started by model/tool output. Avoid raw audio/transcripts/text in diagnostic logs; record only timings, sizes, sanitized IDs and error codes. Microphone buffers stay in memory by default. Explicit Save recording/import/export writes private local assets; temporary audio requires private permissions, bounded size and deletion after success/cancel/crash recovery. Provide retention/delete controls and avoid promising secure erasure on an arbitrary filesystem.

Track locality independently for STT, agent reasoning and TTS. A local transcript sent to a cloud text model is a cloud disclosure of the transcript; a local model file served remotely is not offline. For remote/LAN endpoints, show the actual destination and require applicable remote-processing consent. Never let a loopback cloud-proxy model receive an Offline badge.

On missing model, overload, unsupported language, device error or low confidence, offer Retry locally, choose another installed model, use typing, or explicitly Use cloud for this job. Explain what leaves the device (raw audio vs transcript vs synthesis text), named provider and current retention/cost facts before consent. Existing cloud consent is necessary but not authority to auto-upload a failed local job. No silent provider switch, retry to cloud or auto-play of an unsolicited answer. Revocation cancels transfer/generation immediately and discards later results. Cloud-generated output carries provider provenance; exported narration should retain AI-generated metadata where the format/workflow supports it.

## 8. Delivery sequence and acceptance gates

1. Capability catalog + artifact/license manifests + device test. No microphone access needed for model discovery. Native helper packaging and protocol fixture tests on Windows/macOS/Linux.
2. Push-to-talk -> local multilingual Whisper -> editable AI prompt; cancellation, VAD/no-speech, privacy and memory limits before incremental transcription.
3. Local read-aloud with one reviewed English and one reviewed German voice bundle; language mismatch, queue/backpressure, devices and accessibility before narration assets.
4. Studio adapters for reviewed document insertion and Sound/Video transcript/narration assets. Proper undo, stale-revision checks and source preservation.
5. Optional Ollama audio route/true-streaming ASR and explicit cloud fallback only after per-version compatibility and consent tests.

Required tests: airplane-mode/network-denied STT/TTS after downloads; no audio/transcript leakage in logs; local STT plus cloud reasoning disclosure; loopback proxy/cloud tag refusal; corrupted/missing/incompatible models; incompatible language; denied permission/device unplug; stereo and sample-rate mapping; silence/noise and German/English switching; cancellation under synthesis load; double Start/Stop and stale generations; crash cleanup; narrow UI/light/dark/accessibility; unsaved studio switch and long file backpressure; combined model memory pressure; exact GPL/dependency notices and artifact license audit. Add tests without weakening existing provider, privacy, command or export tests.

Not verified here: native compilation, installed daemon support, actual model loads, ONNX artifact compatibility, runtime redistributability of complete bundles, German voice quality, microphone/OS permissions, cold/warm latency, timestamps/diarization quality, mobile/browser support and real device RAM/VRAM. No runnable feature or performance claim follows from this concept.

## Sources (fetched 2026-10-14)

All recommendations distinguish source facts from Somnia proposals. Primary documentation/model cards and upstream implementation/tests are favored because this is a compatibility/security design. The cited streaming research includes benchmark evidence; community Rust wrapper search results were not used as proof of Ollama support.

- [S1] OpenAI Whisper README, MIT weights/code, multilingual variants, sliding-window behavior and benchmark caveats: https://github.com/openai/whisper
- [S2] whisper.cpp README, native backends, quantization, VAD and incremental microphone example: https://raw.githubusercontent.com/ggml-org/whisper.cpp/HEAD/README.md
- [S3] faster-whisper README, MIT implementation, CTranslate2 and GPU dependencies: https://github.com/SYSTRAN/faster-whisper
- [S4] sherpa-onnx README, local speech functions, Rust/C APIs, platforms and Tauri examples: https://github.com/k2-fsa/sherpa-onnx/
- [S5] sherpa-onnx runtime license and TTS catalog (runtime license does not license every model): https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/LICENSE and https://k2-fsa.github.io/sherpa/onnx/tts/index.html
- [S6] Kokoro model card, Apache-licensed weights and reference generation: https://huggingface.co/hexgrad/Kokoro-82M
- [S7] Kokoro reference voice/language list and short/long utterance caveats: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- [S8] German Piper candidate model card, dataset license and artifact context: https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD
- [S9] Current Piper engine GPLv3 and embedded phonemizer: https://github.com/OHF-Voice/piper1-gpl and https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/main/README.md
- [S10] Ollama Gemma4 E4B model page, audio modality: https://ollama.com/library/gemma4:e4b
- [S11] Ollama upstream audio tests, pinned source, not a release certification: https://github.com/ollama/ollama/blob/b205993e/integration/audio_test.go
- [S12] Ollama public API compatibility documentation, not a blanket audio guarantee: https://docs.ollama.com/api/openai-compatibility
- [S13] Whisper-Streaming research/implementation, local agreement and adaptive latency; reported 3.3 s research result is not a Somnia target/measurement: https://github.com/ufal/whisper_streaming
