# Push-to-talk input prep (AN)

Pure state machine and transcript validation only. No microphone permission,
recording, codecs, Whisper downloads, inference, UI, telemetry, storage or new deps.
Existing voiceInput/nativeVoice/opt-in UI remain untouched. No new claim of
working speech input or audited per-target voice assets.

Host obtains explicit microphone consent, binds the recording to a state-generated
monotonic session number and monotonic millisecond timestamps, and owns recorder/track disposal.
Idle -> recording -> transcribing -> idle with a reviewable transcript; operational
failure/timeout -> error -> idle after explicit reset. Cancel returns idle. Stale
sessions/completions fail closed. Overlapping starts are refused. Timeout is only
checked when the helper is called: host must arrange watchdog ticks and terminate
its actual capture/request; the pure state cannot stop microphone or daemon work.

Recording caps: 120 seconds, 20,000,000 actual accumulated audio bytes (existing runtime caps). Transcription
watchdog: 30 seconds. Host validates MIME/codec separately and must not equate a
transcript cap with audio upload safety. Chunk bytes are accumulated per session.
No auto-send, tool execution, apply, retry, history or context inclusion. Provider
selection/fresh local model/consent/cancellation gates remain independent.

Transcript: bounded plain text, well-formed Unicode, no unexpected controls,
CRLF normalized to LF, outer whitespace trimmed. Reject oversized output, never
silently truncate meaning. Embedded instructions remain untrusted data. Validation
is neither secret redaction nor semantic instruction removal. Render as escaped
text, never HTML/Markdown execution; stage in editable input for user review.

Roadmap-Delta: host-facing bounded state/transcript contract prepared; microphone
lifecycle, audited Whisper assets/local adapter, runtime cancel and packaged/E2E
accessibility/device evidence remain open before any voice-input UI is enabled.

## Local validation

Six focused tests cover immutable transitions, no source mutation, multibyte caps,
control/bidi/surrogate rejection, normalization, inert instructions, accumulated
byte caps, exact deadline refusal, stale sessions, cancel/reset, overlapping/order
errors and invalid state/event inputs. No UI/runtime wiring or hardware proof.
