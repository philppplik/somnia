# MCP client (wave step 2)

Status: Rust host and TypeScript tool bridge implemented and tested with an in-memory fixture server. **Not yet reachable from the UI** and never run against a real third-party server.

Approved by the owner on 2026-10-08 (WhatsApp, reply to the wave plan that named the new rmcp dependency). Design background: MCP-ACP.md. Research: RMCP-SPIKE.md.

## What exists
- `src-tauri/src/mcp_host.rs`: `McpHost` using `rmcp =3.5.1` (features: client, transport-child-process). Starts a stdio server, lists tools, calls a tool.
  - Config = id, absolute executable path that exists, argument array, explicit env entries. No shell. Child environment is cleared; only PATH, HOME, USERPROFILE, SystemRoot, TEMP, TMP, LANG and the config `env` are passed.
  - 20 s start timeout, 60 s call timeout, results are text only and capped at 64 KB (images/resources are replaced by a placeholder).
  - Approved list in `<app config dir>/mcp-servers.json`. Saving a server in the UI is the approval to run exactly that command; saving again stops any running old process. Max 16 servers.
- Tauri commands (trusted editor window only; listed in build.rs and capabilities/editor.json): `mcp_servers_list`, `mcp_server_save`, `mcp_server_remove`, `mcp_server_start`, `mcp_server_stop`, `mcp_tool_call`.
- `src/lib/agent/mcpTools.ts`: registers granted MCP tools in the tool registry as `mcp_<server>__<tool>` at level **execute**.
  - Off by default: default grants are read+propose only.
  - A tool exists only if the user granted it at its current schema hash; a changed description or schema drops the grant.
  - Every call needs a human approval callback; the result is returned as `{source:'mcp', untrusted:true, text}`.
  - Tool descriptions are marked as external and untrusted.

## Not done yet
1. Settings > Power-Ups > AI > MCP servers: add/edit/remove, start/stop, per-tool grants, per-call approval dialog. The Tauri `invoke` implementation of `McpBridge` and wiring into panelBridge are part of that.
2. Streamable HTTP transport (needs endpoint allowlist + OAuth tokens kept in Rust).
3. Resources and prompts; tasks, subscriptions, MCP Apps.
4. Windows/macOS process-spawn behavior is unverified (CI compiles it; no interactive test).
5. A real server (e.g. a docs server) has not been run. Local executable servers are code execution, not a sandbox.

## Tests
- Rust: `cargo test --no-default-features --lib mcp_host` (list/call over an in-memory transport, output cap, config validation, server list roundtrip).
- TS: `src/lib/agent/mcpTools.test.ts`.
