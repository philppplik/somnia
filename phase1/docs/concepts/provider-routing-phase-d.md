# Provider routing phase D

Saved settings define local-first provider order and exact models. Nothing downloads automatically. New routes start local-only with no cloud included. Cloud selection, models, timeouts and retries are drafts until Save. Keys and cloud consent are independent. Zero new dependencies.

General chat without an active file/media/studio may fail over on network, timeout, server or missing-model errors before any provider event. Tools, images and tool history are rejected by the route. Authentication, consent, credit, context, rate-limit and quota errors do not switch destination. Per-adapter HTTP retries apply before stream output. The timeout covers each provider's request and retry delays, not each individual attempt. The existing whole-turn limit still applies. Cloud retries/failover may incur charges even without output. Document/media/studio requests remain pinned. Chat histories are isolated between general routing and document/studio scopes. Actual provider/model are retained in session provenance and shown in persistent chat metadata.

Local-only is independent of earlier cloud consent. Browser cloud is denied until preferences restore successfully; corrupt preferences fail closed. Native startup restores policy before Vibe setup. HTTP start/consumption check policy, saving local-only clears native streams, outstanding HTTP futures check policy every 25 ms, and Vibe host guards cover previously resolved transports. Cancellation cannot retract already-sent bytes.

Vibe loopback destinations do not yet have equivalent daemon-model locality verification, so Vibe is blocked entirely in local-only mode, including already-resolved transports. This deliberate fail-closed limitation must be surfaced. Verified-local Ollama chat remains available. The toggle covers Somnia AI provider traffic, not unrelated OAuth/update/MCP networking or a system-wide firewall. User-managed daemons cannot be controlled by Somnia.

## Roadmap-Delta

Added saved local-first route UI/schema, explicit models, user-editable cloud order, per-provider request timeout/retry settings, conservative chat-only failover, actual provenance, and browser/native local-only guards. No automatic pull and no new engine/model dependency. Vibe route/limits stay pinned, outside chat routing. Native compilation, schema/guard CI tests and desktop E2E are release gates. Native Vibe locality verification is still required to enable Vibe in local-only mode. Full app E2E requires generated engines and is CI-only.
