# rmcp spike: research only (not built in)

Status: research, 8 October 2026. Nothing added to Cargo.toml. Needs the owner's dependency go before any code.

Source: crates.io API for `rmcp` (https://crates.io/crates/rmcp, repo https://github.com/modelcontextprotocol/rust-sdk/).

## Facts observed
- Latest stable 3.5.1 (2026-10-05), Apache-2.0, not yanked, MSRV 1.88. Releases roughly weekly (3.2.0 on 08-31 to 3.5.1 on 10-05).
- Somnia's `rust-version` is 1.85. Adopting rmcp 3.5.x means raising MSRV to 1.88 and checking the CI toolchain and the MSIX/macOS builds.
- Features include: `client`, `server`, `transport-child-process` (stdio servers), `transport-streamable-http-client` (+ `-reqwest`), `auth`, `elicitation`, `macros`, `reqwest-native-tls`. Default set is large.
- Non-optional dependencies are small: chrono, futures, indexmap, pin-project-lite, serde, serde_json, thiserror 2, tokio, tokio-util, tracing.

## Proposed pin when approved
- `rmcp = { version = "=3.5.1", default-features = false, features = ["client", "transport-child-process", "transport-streamable-http-client"] }`. Pick the reqwest feature that matches Somnia's rustls setup; do not add native-tls. Add `auth` only when a remote server needs OAuth.
- Do not enable `server`, `macros`, `elicitation`.

## Risks
1. MSRV bump 1.85 -> 1.88 (CI, release builds).
2. Fast release cadence and a major version already at 3: pin exactly, review each bump.
3. stdio servers are code execution: spawn only user-approved executables, argument arrays, minimal env, no project-triggered spawn (see MCP-ACP.md).
4. HTTP transport must go through Somnia's endpoint allowlist and redirect checks, not rmcp's default client behavior.
5. Tokens for remote servers must stay in Rust (same contract as provider keys).
6. The spec-version claims in MCP-ACP.md were not re-verified here; the SDK's actual support for the `2026-07-28` revision and the legacy lane has to be tested in the spike.

## Spike plan (after go)
1. Branch with the pinned dependency; `cargo build` on CI for all platforms; record binary size delta.
2. Rust command to start one stdio server from a user-approved config, list tools, call one read-only tool; surface it in the registry as `mcp.<server>.<tool>` at level read, grant bound to `toolSchemaHash`.
3. Tests with a local fixture server; no network, no paid APIs.
