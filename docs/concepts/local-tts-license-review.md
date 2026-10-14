# Local TTS: license review and proposed boundary

2026-10-14. Concept only. No TTS code, dependency, binary, voice download or redistribution approval. No GPL bundle. Speech-to-text approval does not cover speech synthesis.

## Decision

Do not ship a German TTS bundle yet. Investigate sherpa-onnx as a host engine, but select a complete engine + runtime + phonemizer + data + voice bundle only after an exact artifact review. Apache-labelled engines or voices alone are insufficient. The examined Kokoro and Piper German paths use eSpeak NG data/phonemization. That is an unresolved no-GPL boundary, not a clean alternative merely because ONNX executes the weights.

This is source/license research, not legal advice. Source pages describe current upstream branches/cards; no immutable TTS artifact or checksum is approved here. No quality, latency, offline isolation or German pronunciation claim has been measured.

## Options and findings

| Option | Primary evidence | Fit and decision |
| --- | --- | --- |
| sherpa-onnx | [Apache-2.0 engine license](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE), [TTS catalog](https://k2-fsa.github.io/sherpa/onnx/tts/index.html) | Candidate host, not a license blanket over models/backends. Review actual build graph, notices, external runtime and phonemizer. No automatic approval. |
| ONNX Runtime | [MIT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) | Candidate inference dependency only. Execution providers and compiled dependency graph need their own review. No new dependency added. |
| Kokoro-82M | [Model card](https://huggingface.co/hexgrad/Kokoro-82M) says Apache-licensed weights; its example installs eSpeak NG | Permissive weights do not remove phonemizer obligations. Do not bundle an example dependency tree without review. Base card is not evidence of ready German support. |
| German Kokoro Martin wrapper | [Card](https://huggingface.co/miro-dietiker/kokoro-de-martin) labels weights Apache-2.0 and describes upstream conversion/fine-tune chain | Card explicitly includes `espeak-ng-data`, uses eSpeak/piper-phonemize for German, and documents pronunciation problems requiring a phonemizer patch. Excluded as a ready no-GPL bundle. Verify every upstream model/config/voice artifact separately if reconsidered. |
| Thorsten Piper/VITS through sherpa-onnx | [Original voice card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD), [sherpa German example](https://k2-fsa.github.io/sherpa/onnx/tts/all/German/vits-piper-de_DE-thorsten-medium.html) | Dataset/voice permissions do not certify inference software or companion data. The sherpa example names `espeak-ng-data`; therefore no-GPL clearance is unresolved even without the Piper executable. |
| eSpeak NG | [COPYING](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) | GPL license text. Exclude from this no-GPL bundle path pending specialist review of exact software/data and redistribution obligations. Do not relabel it MIT via a wrapper. |
| Current Piper engine | [COPYING](https://github.com/OHF-Voice/piper1-gpl/blob/main/COPYING) | GPL engine path excluded. A helper process or optional download is not an automatic exemption. |
| Browser/platform voices | No target-OS voice/service artifact reviewed | No offline promise, no silent fallback, no assumption of voice availability or redistribution rights. Consider only after platform-specific network and voice provisioning review. |

All are primary project/model sources. There is no independent benchmark evidence or device test in this concept. Exact license obligations may differ across revisions; source attribution above is not a legal clearance.

## Proposed user flow

1. Optional TTS setting with clear engine/voice/language/artifact identity, total bytes, source/license, checksum and known disk capacity or Not checked. Never start a download from model text or document content.
2. Read selected text only after an explicit user action. No background reading of chats, private documents or incoming messages. Preview the text scope and chosen voice; do not treat it as permission to send audio anywhere.
3. Synthesis is local-only with no cloud fallback. Fixed helper/model identities, bounded input and output; no arbitrary commands, model paths, SSML filesystem/network references or embedded instructions.
4. Stream bounded PCM into an owned playback queue, preserving sentence order. Stop cancels synthesis and drains the queue. Session switch, consent withdrawal, output-device loss and app shutdown stop playback. No automatic resume after restart.
5. Export/save audio is separate from playback and names the destination and format. Never imply a cloned voice, endorsement or real-person authorship. No voice cloning in the first slice.

## Bundle checklist before any implementation approval

- Exact immutable engine/runtime/voice/phonemizer/tokenizer/data/config revisions, real SHA-256 and sizes. No placeholder hashes in an installable catalog.
- Every source and generated artifact license, attribution/NOTICE, training/voice consent limitations, conversion provenance and any commercial restrictions. No inference from a dataset's CC0 label to the rest of a package.
- Complete compiled dependency inventory and SBOM for each supported OS/architecture. Inspect optional backend defaults and linked libraries. No GPL slips through build flags, bundled data or runtime installation scripts.
- Explicit user decision on engine, German/English voice, optional download budget, playback/export scope and permitted distribution. TTS does not inherit STT approval.
- Private scratch policy, normal/crash cleanup, Windows ACL and path hardening, owned process cancellation, no-network isolation and signed packaging.
- Nonsensitive German/English tests: umlauts, ich/ach/r, dates/numbers/abbreviations, code/mixed language, empty/long text, punctuation, silence, clipping; actual sample rate, cold/warm latency, peak memory and cancellation tail on each target. No speed or quality promise from upstream examples.

## Next research

Find a German frontend/phonemizer and voice path whose complete redistribution graph fits the no-GPL constraint. If none is verified, keep TTS unavailable and ask for a separate decision rather than weakening the requirement. User-installed GPL components are not a default workaround; any such design would need its own explicit scope and license review.
