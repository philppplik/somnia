# Agent streaming UI

Provider-neutral: Claude, OpenAI and other adapters deliver `text-delta`,
`usage`, `error` and `done` through the existing `AgentEvent` contract. No
provider-specific parsing or account setup belongs in the panel.

- `createStreamSink` batches text into 24 ms render intervals. Control events
  flush pending text first. Done/error close the sink; later provider callbacks
  cannot change the chat. Stop flushes received text; unmount/replacement discard
  pending buffers and cancel timers. Timers work even when RAF is suspended.
- The panel scopes callbacks and startup failures to each request generation.
  Stop, New chat and unmount cannot leak stale output into a newer conversation.
- Usage and status notifications between chunks keep a single answer bubble.
  File approval creates an answer boundary. Blank deltas create no bubble.
- Text preserves newlines and whitespace and is rendered as escaped React text,
  never provider-controlled HTML. Caret and Stop are visible while generating.
- Stop/error retain the partial response with an explicit label. Retry is manual,
  uses the preceding user message for that error and is disabled while busy.
- Screen readers get turn-level status and error alerts, not every token. Existing
  pinned scrolling follows output only while the user is near the bottom.

Verification (no paid inference or CI): `npm run build`, `npm run test:core`
(949 passed, 3 pre-existing skipped), panel and streaming Playwright suites
(13 passed). Streaming tests use a deterministic core, plus the existing local
NDJSON integration test verifies real incremental HTTP streaming and cancellation.
Inspected live/error/stopped screenshots for bubble spacing, partial labels,
line preservation, error/Retry and Stop placement. Windows/WebView2 and actual
Claude/OpenAI endpoint verification remain integration/platform checks.
