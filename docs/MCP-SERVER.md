# Somnia as an MCP server

External MCP clients (for example Claude Desktop or Claude Code) can inspect open documents and
propose changes in Somnia's Studios. The protocol layer is `phase1/src/lib/agent/studioMcpServer.ts`.

## What is exposed

Tools from the Studio registries (Code, Photos, Sound, Slides, ...), at levels `read` and `propose` only.
Tool names are unique across Studios, and the server refuses to start if two collide.
`tools/list` marks read tools with `readOnlyHint: true`.

## What a client can and cannot do

- Inspect: a bounded, whitelisted projection of the document. Document strings are untrusted data.
- Propose: stage a change. Nothing is applied, saved or exported. The user reviews the diff in Somnia and
  presses accept. Undo protection, stale-apply checks and the shared history work exactly as for the in-app agent.
- Never: `execute` tools, file system access outside the open project, applying its own proposal.

## Guards in the protocol layer

- Off by default. While `enabled()` is false every request gets the error "Somnia tool server is turned off".
- Arguments are validated against the tool schema before the tool runs (same validator as MCP client calls).
- Rate limit: 30 calls per minute (configurable).
- The activity callback receives tool, Studio, outcome and duration. Arguments and results are not logged.
- Protocol versions 2025-06-18, 2025-03-26 and 2024-11-05. Unknown versions are answered with the newest supported one.

## Transport (desktop host)

`src-tauri/src/mcp_gateway.rs` runs a loopback-only listener (127.0.0.1, random port) with a random
per-session bearer token shown in Settings > AI > Tools ("Somnia as MCP server"), which the user copies into
the client config. Each HTTP POST to `/mcp` carries one JSON-RPC message; `src-tauri/src/mcp_studio.rs`
forwards it to the WebView (`somnia://studio-mcp` event), the protocol layer answers, and
`studio_mcp_respond` returns the response. Non-loopback peers are rejected, a missing or wrong token gets
401, bodies are capped at 256 KiB, and turning the switch off and on rotates the token. Client config shape:
URL `http://127.0.0.1:<port>/mcp`, header `Authorization: Bearer <token>`.

The WebView side is `phase1/src/lib/agent/studioMcpHost.ts`. The exposed tool set always matches the
currently active studio document (same scope as the agent panel's pinned document) via
`createStudioMcpSource` in `panelBridge.ts`; proposals staged by a client appear in the agent panel with
provenance `mcp` and are reviewed and applied exactly like agent proposals. The server answers with an
empty tool set while no compatible document is open.

## Wiring and validation

The gateway is wired, not a transport draft: `desktop.rs` manages `StudioMcp` and registers
`studio_mcp_start`, `studio_mcp_stop`, `studio_mcp_status` and `studio_mcp_respond`.
`main.tsx` installs the WebView host and unwraps Tauri event payloads before forwarding them.
Nothing listens until the user starts the server in Settings. Stopping clears the displayed
port/token and pending responses; a new start creates a new token.

Run these commands from `phase1/`:

```sh
npx tsx --test src/lib/agent/studioMcpServer.test.ts src/lib/agent/studioMcpHost.test.ts
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features mcp_
cargo test --locked --manifest-path src-tauri/Cargo.toml --features desktop mcp_
npx playwright test tests/studio-mcp-server.spec.ts
```

The Phase 1 validation workflow runs the headless Rust tests in the native and Windows jobs,
including the real loopback gateway and health-policy tests. Its Linux native job also runs the
explicit desktop `mcp_` suite, which compiles the WebView bridge and HTTP client and exercises
bridge response correlation, notification replies, stopped status and pending-response cleanup.
The frontend job runs the browser spec as part of `npm run test:e2e`.

Coverage boundaries:

- Rust gateway tests open real TCP sockets. They check loopback binding, missing/wrong tokens,
  method/path/length/body guards, fragmented request bodies, byte-preserving forwarding,
  notification HTTP 202, listener shutdown and token rotation.
- Protocol/host Node tests check read/propose-only exposure, schema validation, activity records,
  disabled requests, empty document scopes and malformed messages.
- The Playwright spec uses the production Settings UI, host, source builder and Tauri listener.
  It mocks desktop IPC, including the real Tauri event envelope shape (event ID and correlation
  ID are distinct). It checks user start/stop, initialize/list/read round trips, rejected unknown
  tools, notifications, parse errors and token replacement. It does not open a native TCP listener
  or a Tauri WebView. Its token is a test value, not a security test.

These separate checks do not replace a native end-to-end test connecting an external MCP client
to a running desktop window. Desktop tests require the platform Tauri build libraries; on Linux
that includes WebKitGTK/GTK development packages installed by the native CI job.

## Separate MCP client modules

`mcp_health.rs` contains the tested restart/backoff policy (1, 2, 4, 8, 16 seconds, then gives up;
a healthy 60-second run resets the count; user Stop is never restarted). The policy is not wired
into `McpHost`, so these tests do not mean automatic restart is enabled.

`mcp_http.rs` is the separate desktop MCP **client**, not the loopback server. It accepts HTTPS
URLs only and routes connections through the broker-owned domain proxy. Its tests cover URL
restrictions and SSE response selection. Do not configure this client with the local gateway's
HTTP URL. The module is not wired into the server list/UI yet.
