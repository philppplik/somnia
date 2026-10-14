# Local model manager phase J

Builds on existing AI > Local model manager rather than adding a duplicate screen. Existing native pipeline already lists installed size/quantization, downloads only after explicit review, exposes layer progress/cancel, checks an explicitly selected model volume, and removes only after confirmation plus current digest/loaded-model checks. Existing hardware probe and conservative RAM/VRAM estimate stay local.

## Roadmap-Delta

- Last successful Agent use is now a bounded device-local completion log keyed by exact model variant AND endpoint. Unknown is never derived from Ollama modified_at. The UI explicitly excludes other clients and native Vibe runs. Metadata checks and downloads do not count as inference. Browser storage failure does not fail the answer.
- Explicit device suggestion is text only, using fresh available RAM/VRAM and estimated reserve, not total memory, not measured performance. Missing/stale capacity yields no suggestion. No automatic model change/download.
- Manager requires a selected disk receipt even for direct callers and refreshes before opening a pull. Replaced/stale/malformed receipts fail closed. Opening each new download review clears the old selected volume, forcing a deliberate choice. Native boundary already requires/checks its own opaque disk token.
- No new deps or telemetry. Five locale strings. Existing consent/locality and native default-off stream boundaries unchanged.

## Honest limits

Ollama /api/tags documents modified_at, size and quantization, not a daemon-wide last-used timestamp: https://docs.ollama.com/api/tags . Pull streams progress statuses: https://docs.ollama.com/api/pull . Neither establishes global download cancellation or full installation. Existing owned HTTP cancellation continues to say daemon outcome unknown; completion still requires terminal success, fresh inventory and local verification.

Disk capacity is measured on a user-selected folder, not an attested daemon storage path. Reviewed catalog entries use estimated bytes + 25% + 1GiB headroom. Arbitrary custom tags have unknown required bytes, clearly labeled; a free-volume check alone is NOT a guarantee they fit. Shared existing blobs/other clients and daemon storage changes prevent exact reservation. No runtime settings/path are changed by this feature.

Last-used means observed successful Agent completion on this device only. Native Vibe and other applications are not included. No timestamps invented from model download/update dates. Local model names/times are stored in bounded localStorage, no prompts/content.

Validation: 369 Agent/provider tests pass (including bounded usage log, successful local completion only, direct-call disk preflight and fresh device advice). Three new Playwright tests pass: disk-before-pull, progress + honest cancel, confirmed removal and German desktop/narrow layout. DS ratchet and command manifest pass. Layer checker reports no new violations but warns about unsupported TS transpiler version. Full tsc remains red for inherited three/Studio3D/generated slides assets, no J-path errors. Existing native pipeline is unchanged and unexecuted here; native daemon cancellation, hardware accuracy, storage paths and app E2E remain CI/device gates. No cargo/WASM, dependency or network model download.

Delivery base: refreshed/rebased onto origin/int/beta5 62d7f5f9, which includes phase I as 38be35b0. J changes only; prior DS migration retained. Unit/browser checks repeated after rebase.
