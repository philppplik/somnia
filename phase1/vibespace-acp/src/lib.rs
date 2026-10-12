//! ACP v1 stdio CLIENT for external agents (Claude Code, Codex, goose) - Welle-B A2.
//!
//! Hard rules (see `docs/vibespace/acp-client.md`):
//! * Client only. There is no ACP server in this crate and none is planned here.
//! * The agent process starts only through `ProcessExecutor` (`propose_exec` with
//!   `Origin::ExternalAgent`, then `spawn_session` under the `ApprovalToken`). Sandboxed
//!   mode only: no elevated path exists, and a host without isolation means no spawn.
//! * Every `session/request_permission` becomes a broker `Proposal`. There is no second
//!   consent path: the broker (and the user through `UiHandle`) decides, the client only
//!   translates. Unknown tool kinds map to `ActionKind::Mcp`, which the broker always denies.
//! * Cancel and kill go through the `ProcessSession` of the isolation layer (process tree).
//! * The agent gets no fs/terminal client capabilities and no MCP servers. Network, if any,
//!   is a separate `NetworkExecutor` concern; ACP itself is stdio only.

#![deny(unsafe_code)]
#![warn(missing_docs)]

mod client;
mod events;

pub use client::{AcpClient, AcpConfig, AcpError, PermissionOutcome};
pub use events::{last_session_id, read_events, EventLog};
