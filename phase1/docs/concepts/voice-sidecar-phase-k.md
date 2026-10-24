# Voice prompt preview and sidecar release design (phase K)

## Roadmap-Delta

Default OFF in UI (`VITE_LOCAL_VOICE_PREVIEW=true`) AND native build (`SOMNIA_LOCAL_VOICE_PREVIEW=1`). Native status/transcription/download cannot be enabled by renderer-only flags. No inference/download/microphone at startup. Optional AI > Local model setup is hidden by default too. Native cancel remains usable to stop owned work even if UI changes.

Agent prompt and New Studio goal gain opt-in hold-to-talk. Explicit checkbox then browser/OS microphone prompt; release during pending permission discards late capture. Keyboard Space/Enter supported; blur/pointer cancel/timeout/unmount stop owned capture. German and English are exact CLI language choices for one multilingual base model, not two hidden downloads. This is transcription, not translation or TTS.

Final transcript is editable and must be explicitly added to the original prompt. Changed destination text blocks insertion; max length is enforced. It never submits, starts a run, modifies a document, picks a provider or grants cloud consent. After insertion the normal prompt send path and its normal cloud disclosure still apply. Audio is not uploaded by transcription. Speech recognition mistakes remain the user's editable draft, not approved instructions.

Native scaffolding strengthens helper manifest to v2: exact target, pinned engine revision, actual executable SHA-256 and hashed third-party notices, explicit reviewed dependency inventory. Old/unreviewed manifests fail closed. Packager must supply SOMNIA_VOICE_LICENSE_AUDIT; no build/fetch without it. The inventory is a release review input, NOT an automated proof of actual linkage. No GPL/FFmpeg is bundled by this slice and no binary is downloaded. Allowlist excludes GPL/LGPL; any non-allowlisted dependency needs separate review, never a silent exception.

Model download remains optional, exact URL/revision/size/hash, explicit confirmation and cancellation; now checks actual app-data volume capacity with 64 MiB headroom before opening download. Cancel-vs-completion cannot claim success after observed cancellation. Existing fixed args/private scratch/process-group kill/timeout retained. Native language rejects arbitrary strings, no shell expansion.

## Binary installer design and current blocker

No reviewed per-platform hosted executable release manifest or dependency/license inventory exists in this checkout. Binary download is explicitly unavailable, not a made-up URL or arbitrary upstream archive. Current route is a release-reviewed packaged CPU-only helper built with scripts/voice/build-helper.mjs, exact revision and target manifest. A future optional installer needs a product-owned pinned HTTPS URL, immutable exact bytes/SHA, target/build identity, artifact license plus actual transitive inventory/notices, size/disk preflight, private .part download, bounded redirect allowlist, hash before atomic publication, cancel cleanup, and no run until explicit install review. No generic URL/executable input, archive extraction or shell downloader.

CI/device gates before enabling either flag: compile native; verified per-target helper/linkage/SBOM/notices review; codesign/notarization; offline OS network isolation; real microphone permission denied/granted/disconnect; DE/EN accuracy; kill-tree timeout; crash orphan cleanup; disk pressure and model checksum rejection; retained audio/scratch audit. Native parts were NOT run here. Private temporary files have handled-path cleanup, not a claim of crash-safe erasure. No public/production-ready claim.

## License/source evidence

Pinned whisper.cpp license is MIT: https://raw.githubusercontent.com/ggml-org/whisper.cpp/a8d002cfd879315632a579e73f0148d06959de36/LICENSE

Pinned converted model card declares MIT: https://huggingface.co/ggerganov/whisper.cpp/raw/5359861c739e955e79d9a303bcbc70fb988958b1/README.md

Engine/model license labels do not establish the license of linked runtime artifacts. No unreviewed executable is accepted. Multilingual base is used for DE/EN; no English-only .en weight is silently substituted. Existing pinned model is 147951465 bytes, SHA-256 60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe. No new dependencies, telemetry or model download during development. TTS remains separate.

Validation: 371 Agent/provider tests green before rebase, 11 focused voice tests green. Four browser tests repeated green after rebase: edit-before-insert/no-send, changed draft rejection, late permission cancellation, flag-off/missing-helper block, German desktop/narrow. DS and command checks green. Layer checker has no new violations but unsupported TS-version warning. Full tsc remains inherited three/Studio3D/generated slides asset failures; no K-path errors. Build script syntax checks; missing license audit fails before clone/build (tested). Native tests added for exact language allowlist, default-off gate and reviewed target manifest; not executed (CI-only). Neither real mic/sidecar/network isolation nor native model installer were executed. No new dependencies or artifacts downloaded. Delivery base origin/int/beta5 30b8ae8a.
