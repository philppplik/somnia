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

## Tests

`npx tsx --test src/lib/agent/studioMcpServer.test.ts`

## Rust drafts (CI to verify)

Added unverified, with unit tests that CI must run (`cargo test -p somnia mcp_`; no cargo was available when written):

- `src-tauri/src/mcp_gateway.rs`: the loopback HTTP transport described above. Not started by anything yet.
- `src-tauri/src/mcp_health.rs`: restart policy for servers that exit by themselves (1, 2, 4, 8, 16 s, then gives up; a run of 60 s resets the count; a user Stop is never restarted). Not wired into `McpHost`.
- `src-tauri/src/mcp_http.rs`: MCP client over HTTP (https, or http to localhost; JSON or SSE replies). Not wired into the server list or UI yet.
- `Cargo.toml`: tokio feature `io-util` added for the gateway.
