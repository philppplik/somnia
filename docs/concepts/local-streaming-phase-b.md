# Local Ollama streaming: phase B

2026-10-14. AI panel uses the existing real NDJSON Ollama provider, single-slot guarded backpressure, incremental renderer sink and explicit cancel. This slice adds frame/total stream bounds, malformed shape rejection and checks abort between lines of one chunk. Partial text remains marked incomplete; no automatic model pull, retry after partial output or cloud fallback.

An explicit requested `num_ctx` now gets a conservative UTF-8 byte safety budget covering text/history/tool schemas, 256 framing reserve and output capped at one quarter of requested context. This is not a tokenizer or measured model capacity. It may reject a request that would fit. Images retain their separate validation; no claim that image tokens are measured. If context is unspecified the existing session byte/time/step/output guards remain, not a guessed daemon context. No automatic context truncation. Model-missing/readiness failures retain their error category and point to reviewed Local Models settings. Model guidance/status/errors/stopped presentation use StudioStatus. Existing stream, permission and review tests remain intact.

## Vibe Space boundary: not implemented by this patch

The native Vibe Space ProviderModel currently sends `stream:false` and ModelTransport offers only `complete`. The engine EventKind has final Message, not a text delta. Goose awaits ModelReply before emitting effects. Flipping the HTTP flag is insufficient and would break strict response decoding without incremental UI.

A separate slice must extend transport callback/channel, cancellation-owned request, bounded SSE/NDJSON parsing, delta sequence/run identity, native storage/event schema, snapshot reconciliation and UI provisional text together. Preserve final-only tool effects; incomplete text must never become a tool or a completed reply. Required tests: split UTF-8/frames, limits, missing model, remote markers, no silent fallback, stop races, source/run switch, restart/reload reconciliation, duplicate/out-of-order delta, final tool/usage and native desktop permissions. Rust and actual app E2E are CI-only in this workspace. This patch does not claim Vibe streaming.
