# Vibe streaming presentation phase G

The existing `EXPERIMENTAL_OLLAMA_STREAM_ENABLED` remains false. Desktop transport selection is unchanged and does not opt into streaming. Only native provisional/incomplete transcript records activate the new display panel. Synthetic browser fixtures do not establish that the native experimental pipeline works on a device.

The panel exposes live text and recorded last step without opening the transcript. Provider-reported output tokens are shown only when usage exists; otherwise they are explicitly pending. Received Unicode character count is separately labeled, never a token estimate or token/s claim. Some usage arrives only after completion. Stop calls the existing run stop action, requires native capability, and does not retry/replay. Cancelled/failed/terminal snapshots never retain a busy presentation even if their old transcript role still says streaming. Output remains literal text, never HTML.

Partial text is display-only, not a project edit or tool. UI whole-file/hunk Apply and request-changes require a complete terminal native review and no partial transcript. Native apply/apply_hunks add a second partial-transcript check before project writes, even if a stale/inconsistent ready review exists. Existing isolation/review/checkpoint paths remain unchanged. No dependencies, new provider calls, auto pull or model enablement.

## Roadmap-Delta

Added live provisional display with step, honest usage/character counters, stop, clear terminal partial states, and additional partial Apply guards. Added presentation/controller regression coverage and live/stop/failure browser fixtures. Default flag stays off. Native Rust compilation, failure/stop persistence, actual streaming transport and real project unchanged checks remain CI/device gates. No cargo/WASM or full desktop E2E run locally.
