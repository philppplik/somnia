# MCP tools in the Somnia Agent

External tool servers (MCP, stdio) run in the Rust host, never in the WebView. This page
describes the guards between a server and the model. Code: `phase1/src/lib/agent/mcpTools.ts`,
`mcpRuntime.ts`, `mcpSchema.ts`, `phase1/src-tauri/src/mcp_host.rs`.

## Trust model

- A server is a user-saved absolute program path plus an argument list. Saving is the approval to run exactly that.
- Every tool needs its own grant. A grant is pinned to a hash of the tool's name, description and schema. If the server changes any of them, the grant silently drops.
- Every call needs a human decision ("Allow once"). Nothing auto-approves.
- Tool output is untrusted text. It is returned to the model wrapped with `untrusted: true`, capped at 64 KiB, with a 60 s timeout.

## Argument validation (new)

Before an approval prompt is shown, the call arguments are checked against the tool's published
JSON schema (`validateMcpArgs`). Supported keywords: `type`, `required`, `properties`, `items`,
`enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`. Other keywords
are ignored, and the server remains the final authority. Invalid calls fail with a readable
message that goes back to the model, so the user is never asked to approve a malformed call.
The schema comes from an external server, so the validator is bounded (depth 8, 8 problems, 200 array items).

## Activity log (new)

Settings > AI > Tools shows the last 50 calls of the session: time, server/tool, outcome
(completed, denied, rejected for invalid arguments, failed) and duration. Arguments and results
are never stored, only the argument size is kept internally. The log lives in memory and has a Clear button.

## Tests

`npx tsx --test src/lib/agent/mcpSchema.test.ts src/lib/agent/mcpRuntime.test.ts src/lib/agent/mcpTools.test.ts`
