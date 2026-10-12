# ACP client (Welle-B A2)

`phase1/vibespace-acp` is an Agent Client Protocol v1 **client** for external agents (Claude Code, Codex, goose). There is no ACP server.

## Rules

- **Spawn**: only `ProcessExecutor`. `propose_exec` with `Origin::ExternalAgent`, then `spawn_session` under the one-shot `ApprovalToken`. Sandboxed mode only; an elevated executor refuses (`external agents never run elevated`). No isolation (no bwrap, or a launcher without interactive sessions) means no spawn and a visible `isolation_unavailable` error. macOS is unavailable. Windows stays behind the AppContainer shell gate: the AppContainer launcher has no `spawn_session`, so it fails closed until A4 provides one.
- **Permissions**: every `session/request_permission` becomes a broker `Proposal` (origin = external agent). Mapping: read/search -> read, edit/move -> write, delete -> delete, execute -> shell, fetch -> network, anything else -> mcp (always denied). The answer to the agent is chosen from the options it offered; no fitting option means `cancelled`. There is no second consent path. File and network kinds still need their own enforcement attached, otherwise the broker denies with `no_enforcement`.
- **Capabilities**: the client offers no fs and no terminal methods and passes no MCP servers. Network only through `NetworkExecutor`/`DomainProxy`.
- **Cancel / kill**: `AcpClient::cancel(grace)` sends `session/cancel`, ends waiting permission requests as cancelled, and after `grace` kills the process tree through the isolation layer (`ProcessSession::kill_tree`; bubblewrap pid namespace on Linux). There is no caller-side signalling.
- **Events**: append-only JSONL (`seq`, `ts`, `kind`, `data`): lifecycle, `session_ready`, `update`, `permission`. No tokens, argv or agent stderr. `last_session_id` + `resume_session` use ACP `session/load` and fail visibly when the agent lacks `loadSession`.

## UI

`src/lib/vibespace/acpPresentation.ts` maps the wire origin and the event log to i18n lines (`vibespace.acp.*`, five locales) for the consent card and the review transcript. Wiring the crate into `src-tauri` (commands, capabilities, invoke handler) is not part of this package.
