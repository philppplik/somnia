# Transcript Hub

Status: pre-release, optional local voice preview. This is file transcription, not a microphone recorder, subtitle generator or agent prompt.

## Use

1. In a desktop build with local voice preview enabled, set up the optional speech helper and existing ggml-base model in Settings > AI > Local. Both must pass their existing checks. Reopen the Hub after setup.
2. Open the command palette and choose **Transcript Hub** (`transcript.open`).
3. Choose a nonempty audio file up to 20,000,000 bytes and select German or English as the spoken language.
4. Choose **Transcribe file**. Decoding and local transcription have separate status labels. **Cancel**, Escape or closing the Hub cancels the job. Decoder work itself is not interruptible by Web Audio; a late decoded buffer is discarded and never starts transcription after cancellation.
5. Review the text. Speech recognition can be wrong. Edit it, then choose **Export TXT** to download a UTF-8 text file. **Clear** removes the displayed text.

The file chooser suggests common audio formats, but the browser/WebView decoder decides support. WAV and MP3 support depends on that platform. An unsupported codec fails without a cloud fallback. No FFmpeg or new codec dependency is used.

## Separate limits

| Budget | Voice prompt (unchanged) | Transcript Hub |
| --- | --- | --- |
| PCM audio | 120 seconds | 600 seconds |
| Native helper runtime | 180 seconds | 1,800 seconds |
| Transcript | 12,000 Unicode characters | 120,000 Unicode characters |
| Native text bytes | 48,000 | 480,000 |

The Hub bounds the compressed file to 20 MB and rejects decoded buffers over 128 MB or outside 10 minutes. Web Audio decodes the whole file before its duration/decoded-size check, so compressed audio can allocate memory before rejection. This is not streaming transcription. Files with unexpectedly large decode expansion should be shortened outside Somnia first. PCM is an equal-channel mean (1 to 8 channels), linearly resampled to 16 kHz signed 16-bit mono. This conversion is for recognition, not mastering-quality audio.

The new native `local_voice_transcribe_file` command uses exactly the existing preview gate, main-window gate, exclusive owner lock, single-job slot, installed-helper hash/release verification, model hash pin, fixed arguments, process handling and private scratch cleanup. The helper and model artifacts and download flows are unchanged. The editor gains exactly one narrow ACL entry: `allow-local-voice-transcribe-file`. No other window receives it. File budgets never widen the old voice-prompt command.

## Privacy and availability

No transcript is inserted into an agent prompt or project. The Hub does not persist text to local storage or history. It holds the editable result in memory until clear/close; export is the explicit persistence step. The native terminal result is cleared after retrieval, and private native scratch audio/text is removed by the existing runner. This is not a secure-memory-erasure guarantee.

Inference uses the optional local helper with no cloud fallback. Initial helper/model installation is a separate explicit download. Existing release gates for network isolation, orphan cleanup and reviewed hash-pinned helper inventory still apply. A build with preview disabled, missing artifacts or an unapproved helper inventory cannot transcribe. Do not treat the Hub as proof that a releasable helper is available.

## Validation

- `npx tsx --test src/lib/transcriptFile.test.ts src/lib/agent/nativeVoice.test.ts src/lib/agent/voicePreview.test.ts`
- `node --test src/locales/locale-parity.test.mjs`
- `npm run check:commands` and `npm run check:ui-commands`
- `node test/transcript/capture.mjs` runs an isolated UI fixture: unavailable state, actual synthetic WAV decode, explicitly synthetic native response, TXT download and clear. Screenshots go to `/downloads/transcript-hub-{unavailable,result}.png`. This does not run speech inference.
- Rust unit tests in `local_voice::transcript_file_tests` cover separate budgets and transcript rejection. Native compilation, real pinned-helper inference, cancellation/cleanup and platform codec coverage must pass CI/desktop validation. The development sandbox has no Rust toolchain and did not run these Rust tests.
