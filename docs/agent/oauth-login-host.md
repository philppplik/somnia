# ChatGPT account login, Rust host

The whole browser login runs in `src-tauri/src/oauth_login.rs` plus `agent_account_start/cancel` in `desktop.rs`. The renderer only sees status; codes, verifier, id_token and tokens never cross into it.

Flow: persisted `ext_agent_host_id` (urn:uuid, kept across logout) -> PKCE S256 + state + nonce -> authorize URL opened in the system browser -> loopback listener on 127.0.0.1 (`/auth/callback`, one valid request, 404 for other paths, 120 s timeout, static close page) -> state/error/client-id checks -> code exchange against the fixed token URL -> id_token verified (RS256 only, pinned JWKS URL, issuer, audience = issued client id, expiry, nonce) -> plan scopes `resource.invoke` and `chatgpt.tokens.use.direct` required -> tokens saved in the OS keyring -> refresh scheduler woken.

Dependency: `jsonwebtoken =9.3.1` (default features off, ring backend). Chosen over a hand-rolled RS256 check because it validates header, algorithm pinning, iss/aud/exp in one reviewed place. Approved by the parent agent on 2026-10-07 (the owner has not reviewed it separately).

Port: `LOOPBACK_PORT = 0` (OS-chosen), matching the reference flow and the TS config comment. Change the constant if OpenAI registers a fixed port.

Not done / not verified: nothing was run against the real OpenAI service (owner live test with a Plus/Pro account is outstanding); login errors are not surfaced to the UI (status just returns to disconnected); no revocation call (logout deletes locally); the desktop-feature code is compiled only in CI (no GTK locally); the UI (auth-ui) is not delivered.
