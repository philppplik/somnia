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

## Desktop bridge (src-tauri)

`src-tauri/src/vibespace_acp.rs` (bridge core, testable without the desktop feature) and `vibespace_acp_commands.rs` (thin tauri adapters, main window only via the same `gate`). Six commands: `vibespace_acp_launch`, `_session` (new or resume), `_prompt`, `_decide_consent`, `_cancel` (grace, or `close` = kill + revoke the run), `_state`. Changes are pushed on the private channel `somnia://vibespace-acp` (`{sessionKey, reason}`); the renderer re-reads with `_state` (status, pending consent with origin, event log). Frontend: `src/lib/vibespace/acpNative.ts`.

- Each session is a run of the Runtime's ONE consent broker (`Runtime::acp_broker`), id `acp-<uuid>`. Pending consent (launch and tool permissions) is decided with `Runtime::decide_acp`, which accepts only `acp-` runs; the regular `decide` refuses them (no stored run).
- The agent works in its own isolated root under the app data dir (`vibespace/acp/<agent>/sessions/<key>/work`). It has no Space folder and no host home. Only paths inside that root and `/usr /bin /lib* /etc` (read-only) are visible in the sandbox, so the agent binary must live there.
- No isolation: `launch` fails synchronously with `vibespace_acp_isolation_unavailable`; nothing is spawned. Windows: attach works, spawn fails closed (no AppContainer `spawn_session` yet). macOS: unavailable.
- Linux: the sandbox lives with the spawning thread (`--die-with-parent` = PDEATHSIG follows the thread). The bridge keeps its launch thread alive for the session.
