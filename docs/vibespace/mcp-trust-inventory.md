# MCP / extension trust inventory (Welle B, A7)

Live inventory of every MCP and extension trust surface as of `int/vibe-wave` tip `0102a2f`.
Inventoried from the code, not from earlier docs; each entry states what the file does today,
which trust properties it already enforces, and the gap to the A7 target model. The target model:

* Trust is four **separate axes** — publisher, review, content digest, runtime permissions. No
  axis implies another, and none of them changes what the policy broker allows.
* A **pinned minisign catalog** anchors publisher trust; **signed, sequenced revocations** can
  withdraw a publisher key, a package or one exact version.
* Everything installs into the **restricted default**: no runtime permissions until granted.
* MCP gets its own, **stronger grant type**, kept apart from folder/run grants. MCP tool calls
  go only through an explicit `propose_*` route, never as a silent broker pass.
* Process spawns and network fetches never go direct: they route through
  `ProcessExecutor::propose_exec` / `NetworkExecutor::propose_fetch` with `Origin` attached and
  a one-time approval token.

The A7 code that closes the broker-side gaps lives in `phase1/vibespace-policy/src/trust.rs`
(trust axes, minisign catalog, revocations, skill script gate) and
`phase1/vibespace-policy/src/mcp.rs` (MCP grant type + explicit route). Gaps marked
**host follow-up** need the src-tauri host rewired against those APIs; the crate-side contract
is delivered and tested here.

## 1. Agent-side MCP client (WebView), `phase1/src/lib/agent/`

| File | What it is | Trust properties today | Gap |
|---|---|---|---|
| `mcpRuntime.ts` | Per-window runtime over the Tauri MCP commands. Keeps servers, tools, grants, pending approvals, activity. | Grants pin the tool's current schema hash (`toolSchemaHash`); a changed description or schema silently drops the grant. Per-call human approval (`approve`) never auto-approves; abort resolves `false`. Activity log keeps no arguments/results, in memory only, capped at 50. | Grants live in `localStorage` under `somnia.mcp.grants.v1`: renderer-local, no run binding, no publisher/review axes, no revocation input, not visible to the broker. Not the A7 grant type. |
| `mcpTools.ts` | Registers granted MCP tools into the agent registry at level `execute`. | Tool names namespaced and bounded (`mcp_<server>__<tool>`, max 48 chars); description prefixed with an explicit untrusted-data marker and capped; args capped at 64 KiB and schema-checked before any approval; every call goes through the human approval callback; results wrapped as `{untrusted: true}`. | The approval is a per-call UI prompt only. It is not a broker proposal: no `Origin`, no `ApprovalToken`, no audit event in the policy log, no run grant. |
| `mcpSchema.ts` | Declarative, fail-closed JSON-Schema interpreter for tool arguments. | Unknown keywords reject the call; `$ref`/`not`/`if-then-else` reject; depth/node/problem budgets; bounded regex input; `additionalProperties: false` enforced; error messages never echo argument values. | None for its job. Argument validation stays WebView-side defense in depth. |

## 2. Somnia as MCP server (loopback), `phase1/src/lib/agent/` + `panelBridge.ts`

| File | What it is | Trust properties today | Gap |
|---|---|---|---|
| `studioMcpServer.ts` | Transport-agnostic JSON-RPC/MCP protocol layer exposing Somnia tools. | Only `read` and `propose` tools are ever listed or callable — `execute` tools never leave the app; calls can only inspect or stage a change (user still reviews in the UI); whole server answers "disabled" until the user turns it on; per-minute rate limit; arguments schema-checked before the tool runs; protocol version negotiated from a fixed supported list. | None for its job. Outbound exposure is read/propose only by construction. |
| `studioMcpHost.ts` | Owns the server instance, rebuilds it when the exposed document changes, forwards gateway messages, drives start/stop/status. | Exposed tool set always matches the active document; switching documents rebuilds the server; gateway, port and token untouched by rebuilds; stop clears activity. | Token is shown in Settings so the user can paste it into a client config; fine, but it means the token is a bearer secret in renderer state. No rotation except off/on (gateway rotates on restart). |
| `panelBridge.ts` | Production wiring (`createStudioMcpSource`, ~line 195): builds the registry + fresh context for the exposed document. | Same scoping as the agent panel's pinned document; proposals staged by an MCP client surface in the normal agent review UI. | None observed. |

## 3. Rust host, `phase1/src-tauri/src/`

| File | What it is | Trust properties today | Gap |
|---|---|---|---|
| `mcp_host.rs` | stdio MCP client host. Servers run here, never in the WebView. `mcp_server_save/start/stop/remove`, `mcp_tool_call` commands in `desktop.rs`. | Server config = user-approved absolute executable path + arg array, no shell; id 1-32 chars `[a-z0-9-]`; args/env bounded; child gets a cleared environment plus a small allowlist and the explicit config env; max 16 servers; results capped at 64 KiB; 20 s start / 60 s call timeout; max 200 tools. | **Direct process spawn** (`TokioChildProcess`) with no `ProcessExecutor` route: no broker proposal, no `Origin`, no one-time token, no sandbox profile (bwrap/seccomp), no policy audit event. The on-disk server list is the only consent artifact — no publisher signature, no review state, no content digest, no revocation input. **Host follow-up:** route start through `ProcessExecutor::propose_exec` (Origin `Extension`/MCP, exec with token) once an app-level broker scope exists for MCP servers. |
| `mcp_http.rs` | Streamable-HTTP MCP client (POST, JSON or SSE reply). | https only (http only to loopback); no credentials in URL; no redirects; 20 s connect / 60 s total; replies capped at 1 MiB; bearer token comes from a vault entry and is never logged; server-initiated requests ignored. | **Direct reqwest fetch** with no `DomainProxy`/`NetworkExecutor` route: no SSRF guard (`is_public_ip`), no live grant check per connection, no broker proposal. **Host follow-up:** route through `NetworkExecutor::propose_fetch` / `DomainProxy::attach` (deny-default, live grant check, revoke closes connections). |
| `mcp_gateway.rs` | Loopback HTTP gateway letting an external MCP client reach the in-app server. | Binds 127.0.0.1 only; random 64-char per-session bearer token, constant-time compare, rotated on every start; POST `/mcp` only; 256 KiB body cap; 16 KiB head cap; one request per connection; non-loopback peers dropped; 30 s IO timeout. | Solid for its job. No changes needed. |
| `mcp_studio.rs` | Wires the gateway to the WebView (`somnia://studio-mcp` events, `studio_mcp_respond`). | 25 s forward timeout (below gateway IO timeout); unknown/stale response ids ignored; stop clears pending forwards. | None observed. |
| `mcp_health.rs` | Restart/backoff policy for servers that exit on their own. Pure logic, no I/O. | A user-stopped server is never restarted; exponential backoff capped at 5 attempts / 60 s; stable-after-60 s resets the counter; `Failed` needs a manual start. | None observed. |

## 4. Extensions

### 4.1 WebView side, `phase1/src/lib/extensions/`

Grouped inventory (files not listed individually are tests or fixtures of the same group):

* **Manifest + packaging** — `manifest.ts`, `manifestV2.ts`, `packageV2.ts`, `packageInstall.ts`,
  `v2/`, `v2PackageStore.ts`, `registry.ts`, `types.ts`: v2 manifest schema and package
  install/verify pipeline. The manifest declares a `security` block (`securityPolicy.ts`).
  Gap: no publisher signature axis in the manifest pipeline; install consent is local.
* **Security policy** — `securityPolicy.ts`: `ExtensionSecurity` (tier A/B, fs read/write scopes
  `none|project|ask`, network allowlist with host+path+reason, secrets, inject, clipboard).
  Defaults are restrictive (`SECURITY_DEFAULTS = {tier:'A'}`). URL allowlist validation is strict
  (https only, no credentials, no traversal, bounded). This is the closest existing thing to the
  runtime-permissions axis, but it is self-declared by the manifest and not separated from the
  publisher/review axes.
* **Restricted mode** — `restrictedMode.ts`: read-only startup gate; missing, corrupt or
  inaccessible consent data always means restricted. Matches the A7 restricted-default rule.
* **Permission broker** — `permissionBroker.ts`, `broker.ts`: runtime consent state
  (`once|session|always|deny`), per-extension stored state v2, opaque session identity bound by
  the supervisor, path canonicalisation helpers (explicitly not a sandbox).
* **Blocklist** — `blocklist.ts`: consumes a **signed index**; blocked versions disable the
  extension (never uninstall, never auto-enable; clearing a block after a newer feed removes the
  match also never auto-enables). Today this is the only revocation-like mechanism: it is a kill
  list, not a signed, sequenced revocation stream with replay protection — the A7
  `RevocationList` (strict sequence, signature-checked, monotonic) is the general form.
* **Isolated surfaces** — `cspPolicy.ts`, `panelHtml.ts`, `panelSession.ts`, `popupHost*.ts`,
  `workerSource.ts`, `supervisor.ts`, `host.ts`, `runtime.ts`, `nativeScheme.ts`: worker/panel
  documents served on the `somnia-ext` scheme with per-document CSP and single-use nonces.
* **Consent + store UI** — `consentUiHost.ts`, `consentDisplay.ts`, `consentLocales.ts`,
  `store/`, `storeHost*.ts`, `storeView.ts`, `storeLocales.ts`, `catalog*.ts`,
  `candidateInspect.ts`, `contributions.ts`: store catalog and consent presentation. Catalog is
  served from `main` (post-12.0.1 lesson: catalog lives on main, not a branch). No minisign
  publisher axis in the catalog entries today.
* **Misc security** — `secretSlots.ts` (secret injection slots), `securityActivity.ts`,
  `securityServices.ts`, `securityHardening.test.ts`, `auditExtensions.test.ts`,
  `selftest*.ts`, `activation.ts`, `api.ts`, `authoring.ts`, `devDocsV2.test.ts`, `docs.test.ts`,
  `legacy/`, `studio/`, `popupModel.ts`, `popupFixtures.ts`, `storageKeys.ts`.

### 4.2 Rust side, `phase1/src-tauri/src/`

| File | What it is | Trust properties today | Gap |
|---|---|---|---|
| `ext_scheme.rs` | `somnia-ext` custom URI scheme serving worker/panel documents with per-response CSP. | Worker CSP `default-src 'none'` (unsafe-eval only for the bootstrap); panel CSP adds `sandbox allow-scripts`, never `allow-same-origin`; nonces are single-use — a reload or second frame gets 403; platform-correct base (`somnia-ext://` vs `http://somnia-ext.localhost`). | None observed. |
| `extension_activity.rs` (+`extension_activity_commands.rs`) | Host-owned audit history of extension API use. | Archives never purged, including on disable/uninstall; rotates at 10 MiB; strict extension-id validation; decisions recorded. | None observed. |
| `extension_block_state.rs` | Durable disable policy, independent of package data. | Never uninstalls and never auto-enables; only the verified-index consumer in the trusted host may block/clear; revision-tracked. | Consumes the same signed-index feed as `blocklist.ts`; the A7 revocation stream should feed this state, keeping its never-auto-enable rule. |

## 5. A6 skills registry — `phase1/vibespace-storage/src/db::skills` (`skills.rs`)

Data-only by construction, and the module documents it as a hard limit:

* Installing never executes anything; there is no run/execute API and no "scripts enabled" state.
* `allowed-tools` is stored as `requested_tools` for display only; no field or API can turn it
  into a pre-approval.
* `verified` can only be set for first-party `builtin` skills; a new version never inherits
  `verified` and is parked as `latest` until the user accepts the update diff.
* Trust tiers `unreviewed | scanned | verified` exist as data (`SkillTrust`), scope `space|user`,
  source `local|github|index|builtin`; bounded file counts/sizes; scan reports stored with
  findings.

Gap (closed by A7): the trust tier existed only as display data. `vibespace-policy` now owns the
badge-to-behaviour mapping (`skill_script_gate`): scripts stay disabled for `unreviewed`, and for
`verified`/`scanned` a script may run only as an A4 process grant — `ProcessExecutor::propose_exec`
with `Origin::Skill{name, trust}`, one consent per run, never covered by any other grant type.
The registry itself stays data-only; nothing in this package adds an execute API to it.

## 6. Findings summary (what A7 changes)

| # | Finding | Disposition |
|---|---|---|
| 1 | MCP tool-call consent was a WebView prompt + `localStorage` grant, invisible to the broker. | **Fixed in this package:** explicit `McpRoute` in `vibespace-policy` (`propose_call`/`call`) with broker audit, one-time tokens, `Origin` carried. |
| 2 | MCP had no grant type of its own; run grants were a single kind+target list. | **Fixed:** separate `mcp_grants` store bound to server + tool + schema digest; folder/run grants never cover MCP and MCP grants never cover files; separate revoke/list APIs; both dropped at run end. |
| 3 | Generic broker `propose()` for kind `mcp` must never become a silent pass. | **Kept closed:** it still denies with `no_enforcement` (test proves it); only the explicit route can queue an MCP ask. Desktop stays hard-denied everywhere. |
| 4 | No publisher/review/digest/permissions trust model for extensions or MCP servers. | **Fixed:** `trust.rs` — four separate axes, restricted default, `TrustPosture` evaluation. |
| 5 | No minisign publisher anchoring. | **Fixed:** `PinnedCatalog` parses minisign public keys and verifies pure-Ed25519 (`Ed`) signatures; prehashed (`ED`), unknown keys, keynum mismatches and bad encodings fail closed. |
| 6 | Blocklist/disable exists but there is no signed, sequenced revocation stream. | **Fixed:** `RevocationList` — signature-checked, strict sequence order (gap and replay rejected), subjects publisher-key / package / exact version; revoked keys fail later verifications. Feeds `extension_block_state` semantics (never auto-enable). |
| 7 | Skills had trust tiers as data only. | **Fixed:** `skill_script_gate` maps tier to behaviour; registry stays data-only. |
| 8 | `mcp_host.rs` spawns server processes directly; `mcp_http.rs` fetches directly. | **Host follow-up (documented contract, not in this patch):** route spawn through `ProcessExecutor::propose_exec` and HTTP through `NetworkExecutor::propose_fetch`/`DomainProxy` once an app-level MCP broker scope exists. Requires the src-tauri host to hold broker handles for MCP servers — an architectural change with settings-UI consent plumbing, tracked for the next wave. |
