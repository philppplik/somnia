# Vibe Space policy: consent broker, approval tokens, scoped file executor

Crate: `phase1/vibespace-policy` (`vibespace-policy`, lib `vibespace_policy`). Standalone, no Tauri, no shared manifest. Dependencies: `serde`, `serde_json`, `sha2`, `getrandom`, `ring` (Ed25519 verification for the trust layer; already in the tree via `rustls`), `libc` (unix), `cap-std` 3 and `cap-fs-ext` 3 (non-unix only, or with the test feature `cap-layer`). `cap-std` is already a dependency of `somnia-desktop`; `cap-fs-ext` is new (same author, same version line). Basis: `docs/concepts/vibespace.md` principle 4, A5, A6, A11, A14, A15, 4.4, 5.4 and D5. Verified on Rust 1.95.0 (`rust-toolchain.toml`).

## What it does

Every effect an agent wants goes through one gate:

1. Tool code builds a `Proposal`: `kind` (read, write, delete, shell, network, mcp, desktop), explicit `run_id` + `scope_id`, `target`, `reason`, `args_digest`, `origin`.
2. The broker answers: **Deny** (with a reason), **Ask** (queued for the user), or an immediate allow that comes with an `ApprovalToken` (`AllowForRun` basis: in-scope read, an existing run grant, or the `AllowWritesInCopy` autonomy level).
3. The user answers a queued request with `Deny`, `AllowOnce` or `AllowForRun` through `UiHandle`.
4. `FileExecutor` receives the token and re-derives the binding from its own arguments before touching a file.

Three handles come from `ConsentBroker::new()`:

| Handle | Used by | Can |
|---|---|---|
| `AgentHandle` | tool code | propose, poll, consume a token. Cannot approve. |
| `UiHandle` | the consent UI bridge | list pending, decide, list/revoke grants, read audit. |
| `RunControl` | Run-Manager | register run scope, cancel, finish, revoke grants, read audit. |

`UiHandle` is the only way to approve. The Tauri adapter must expose it only to the trusted webview command `vibespace_decide_consent`, never to code that handles model output or tool results.

## Policy order (first match wins)

1. Unknown run, ended run, scope id differing from the registered scope: **Deny**.
2. Kind not in the run scope's `allowed_kinds`: **Deny**.
3. **No enforcement for the capability: Deny.** Read/Write/Delete are enforced only for a run scope that has a `FileExecutor` attached. Shell is enforced only with a `ProcessExecutor` attached, network only with a `NetworkExecutor`/`DomainProxy` attached. MCP and desktop have no OS-level enforcement: the generic propose path always denies them, even if a scope lists them, even from a Verified skill, even if the host permitted a model endpoint. MCP calls are possible only through the explicit route below; desktop has no route and stays denied.
4. `Autonomy::ReadOnly` denies write and delete.
5. Baseline always-ask (`impact::classify`): delete, anything tagged send / purchase / credential / payment (declared by trusted tool metadata, plus heuristics on the target, for example `.env`, `*.pem`, `.ssh/`, `secrets.json`). Always **Ask**, only `Deny`/`AllowOnce` are offered, no run grant is created or honoured, no autonomy level or skill `allowed-tools` changes this. Heuristics can only add asks.
6. Otherwise: read in scope is allowed; an existing run grant for the exact kind and target is allowed; write under `AllowWritesInCopy` is allowed; everything else (default D5: writes) is **Ask**.

Unattended (scheduled) runs follow the same rules; their asks wait in the queue (`attended: false` in the view, "needs you"). Nothing auto-allows because nobody is watching.

## MCP route and grant type separation (A7)

The generic `propose()` path keeps denying `ActionKind::Mcp` with `no_enforcement` — never a
silent broker pass. The only way an MCP tool call happens is `mcp::McpRoute`:

1. `McpRoute::propose_call(tool, args, reason, origin)` submits a proposal whose target is
   `mcp://<server>/<tool>` and whose args digest covers the pinned schema digest **and** the
   canonical argument bytes. The scope must list `ActionKind::Mcp` in `allowed_kinds`.
2. The broker auto-allows only when an **MCP grant** matches exactly: run, server, tool and
   schema digest. MCP grants are a separate, stronger grant type: they live in their own store,
   are created only by an `AllowForRun` decision on an MCP ask, are listed and revoked through
   their own APIs (`mcp_grants`, `revoke_mcp_grant`, `revoke_all_mcp_grants` on `UiHandle` and
   `RunControl`), and are dropped when the run ends. Folder/run grants never cover MCP calls and
   MCP grants never cover files; revoking one store leaves the other live. No autonomy level and
   no `Via::Policy` path applies to MCP.
3. High-impact targets (send/purchase/credential/payment heuristics) offer only Deny/AllowOnce
   and cannot create grants.
4. `McpRoute::call(token, tool, args)` consumes the one-time token against the re-derived
   binding (substituted server, tool, schema or arguments burn it) and returns an
   `McpCallPermit`; the host performs the call only while holding it and reports the outcome
   through it.

## Extension/MCP trust (`trust.rs`, A7)

Four separate axes: **publisher** (minisign signature against a host-pinned `PinnedCatalog`;
only pure-Ed25519 `Ed` payloads accepted), **review** (unreviewed/scanned/reviewed, never
inferred from publisher), **content digest** (pinned at install/consent; a change drops derived
approvals) and **runtime permissions** (restricted default: none granted). Signed, sequenced
revocations (`RevocationList`): the signer must be a pinned revocation key that is not itself
revoked, and the sequence must be exactly the next expected one — gaps and replays are rejected.
`skill_script_gate` maps a skill's trust tier to script behaviour: unreviewed disables scripts;
scanned/verified still need consent per run, only ever through `ProcessExecutor::propose_exec`
with `Origin::Skill`. Trust decides what may be installed or offered; the broker still gates
every effect.

## Tokens

`ApprovalToken` is a 256-bit random secret generated inside the broker. The broker keeps only its SHA-256 and the binding (run, scope, kind, canonical target, args digest, proposal id).

* No public constructor; not `Clone`, `Serialize` or `Deserialize`; redacted `Debug`; secret zeroed on drop. Model text, tool results and JSON cannot produce one, and `Proposal` rejects unknown fields (an `"approved": true` field fails to parse).
* `consume(token, binding)` runs at execution time, under one lock: broker id, secret hash, state (single use, moved by value), run active, expiry (default 5 minutes), exact binding, run grant still live. A binding mismatch (other path, other content bytes, other action, other run or scope) **burns** the token. A wrong secret does not burn the real token.
* `cancel_run` / `finish_run` set the run state, revoke all tokens and grants, deny pending requests, then wait (bounded) for in-flight effects. `ExecutionGuard::checkpoint()` is called right before the commit point (rename or unlink). Once `cancel_run` returns `drained: true`, no effect of that run is running or can start. If the wait times out (`drained: false`), the effect is still held by the guard and will fail at its checkpoint if it has not reached it yet.
* Run grants (`AllowForRun`) cover the exact kind + target. Each later proposal still gets its own request-bound token (new args digest). `revoke_grant` / `revoke_all_grants` kill the grant and its unused tokens.

## FileExecutor (isolated copy only)

* Root must be an absolute, real directory (not `/`, not a symlink) carrying the marker file `.vibespace-isolated`. The builder of the isolated copy calls `IsolatedRoot::initialize(path)`; the executor calls `IsolatedRoot::open(path)`.
* Paths: relative only; `..`, absolute, backslash, `:`, control chars, Windows reserved names, trailing dot/space refused at proposal time, before anything is queued. `.git`, the marker and `.vs-tmp-*` are protected (git hooks would be code execution).
* **Unix (`IsolationLevel::HandleRelative`)**: the root directory handle is opened once and held. Each component is opened with `openat(O_NOFOLLOW)` from that handle, so a symlink swapped in later fails the open and a renamed or replaced root path cannot redirect it. Final files are checked with `fstat` on the open descriptor: regular file only (FIFOs, sockets, devices, directories refused, opened non-blocking after a name check), link count 1 (hard links refused), size within `max_read_bytes` (also enforced while reading, for files that grow). Write is temp file in the same directory + `fsync` + `renameat` (replaces a name, never follows it). Delete unlinks a regular file only.
* **Windows (`cap-std` layer, `IsolationLevel::HandleRelative`)**: `cap_std::fs::Dir` holds the root directory handle and resolves paths relative to it (on Windows via `NtCreateFile` with the directory as `RootDirectory`), refusing resolution that would leave it. On top of that this layer rejects symlinks and junctions instead of following them inside the sandbox: every parent component goes through `symlink_metadata` + `open_dir_nofollow`, the final file through `symlink_metadata` + `FollowSymlinks::No`, and the opened handle must be a regular file. Even if a component is swapped between check and use, the held handle plus cap-std confinement keep the access inside the isolated copy; the remaining race can only redirect within the copy. Known gap: hard-link counts are not available on stable Rust for Windows, so a hard link to an outside file is not detected there (the copy builder must copy bytes, not hard-link). There is no weaker fallback level: a platform without a handle-relative layer gets no writable executor.
  **Status: compile-checked for `x86_64-pc-windows-gnu` and the same layer is exercised on Linux with `cargo test --features cap-layer` (symlinks, traversal, FIFO, size, protected paths, root swap), but it has never run on Windows.** `windows_symlinks_and_junctions_cannot_be_followed` and `windows_reserved_and_stream_names_refused` in `tests/fs_isolation.rs` are `cfg(windows)` and must pass on Windows CI before the Alpha writable gate opens. Until then Windows stays read-only at the product level.
* `max_write_bytes` is enforced at proposal and again at execution. Parents are created only if `create_parents` is set.

## Network and model transport

`ModelTransportPolicy` answers "may the model client reach this host" with a `ModelTransportPermit`. Nothing in the broker or executors accepts that type. A tool `Network` proposal is separate and denied for lack of enforcement (concept A6: a local proxy with domain allowlist, to be built and tested before this can change).

## Audit

Bounded ring (default 4096), with a dropped counter. Events carry ids, action kind, sanitised target (URL credentials, query and fragment stripped, control and bidi characters removed, truncated), 8-hex digest prefix and a fixed-vocabulary detail. No arguments, no file content, no reasons, no token secrets. Failures log an error class (`symlink`, `too_large`, `cancelled`, ...), not the message of the OS error.

## UI contract

`UiHandle::pending()` returns `PendingView` objects (serde camelCase, enum values snake_case, as in `docs/vibespace/wire-contract.md`): `requestId`, `runId`, `scopeId`, `runLabel`, `kind`, `target`, `reason`, `argsDigest` (short), `impact[]`, `origin`, `offered[]`, `createdAtMs`, `expiresAtMs`, `attended`. `reason` is untrusted agent text, sanitised and capped at 500 characters; render it as plain text. `offered` never contains `allow_for_run` for always-ask requests.

`UiHandle::decide_wire(runId, requestId, choice)` implements `vibespace_decide_consent`. It takes only those three fields (`ConsentDecisionWire` rejects unknown fields such as `newScope`, `target`, `args`), checks the request belongs to that run, and looks up the original proposal. Resolved, expired, cancelled or unknown requests fail.

## Integration points for core

```rust
let b = ConsentBroker::new()?;                      // handles: agent / ui / runs
b.runs.register_run(RunScope::new(run, scope))?;     // D5 defaults
let fx = FileExecutor::attach(&b.agent, run, scope, IsolatedRoot::open(&copy)?, FileLimits::default())?;
match fx.propose_write("a.txt", bytes, reason, Origin::Model)? {
    ProposeResult::Pending(id) => { /* emit consent event, later: */ let PollResult::Approved { token, .. } = b.agent.poll(&id)? else { .. }; fx.write(token, "a.txt", bytes)?; }
    ProposeResult::Approved { token, .. } => { fx.write(token, "a.txt", bytes)?; }
    ProposeResult::Denied(reason) => { /* tell the model, no effect */ }
}
b.runs.cancel_run(&run, Duration::from_secs(2))?;    // stop button
```

Runnable: `cargo run --example core_call` in `phase1/vibespace-policy`.

* Consent events for the run channel (`somnia://vibespace-run`, persist before publish) are not emitted by this crate; core builds them from `PendingView` and `AuditSnapshot`.
* Broker state is in memory. After a crash all tokens and pending requests are gone, which fails closed; persisting pending requests for "While you were away" is core's job (store the `PendingView` fields; re-propose after restart).
* Skill `allowed-tools` is not an input anywhere in this crate. `Origin::Skill{trust}` is displayed, never used to allow.

## Tests

`cargo test` (46 tests + 1 doctest; `cargo test --features cap-layer` runs 45 + 1 against the Windows layer on Unix): deny-before-effect (no decision, user deny, read-only, no enforcement, unenforced kinds, unknown run/scope); allow-once single consumption and replay; grant-bound tokens; forged token, other-broker token, expiry, pending expiry; cancel after approval, finish, cancel with pending, grant revoke, 200-iteration cancel/commit race; path, content, action, run and scope substitution; approval text inside reasons, skill names and file content; Verified-skill shell denied; model endpoint vs tool network; always-ask for delete, declared impact, credential-like targets, grant not covering a later sensitive variant; unattended runs; bounded pending queue and audit, secret-free audit; traversal and protected paths; symlinked file, symlinked directory, dangling symlink, relative-up symlink, FIFO, directory, hard link, size limits, root swapped for a symlink after attach.

## Known limits and risks

1. Shell, MCP, desktop and tool network are **off**. Turning one on needs real OS isolation plus its own tests (A5/A6); this crate adds no pretend sandbox.
2. The Windows cap-std layer is unrun on Windows (see above) and cannot detect hard links. Run the `cfg(windows)` tests on Windows CI before opening the writable gate.
3. The user's decision is only as trustworthy as the bridge that calls `UiHandle`. Do not route model-visible text into those commands. The reason shown is the agent's claim, not a verified description.
4. Heuristic always-ask classification can over-ask (for example a file named `token-list.md`) and cannot know every sensitive name. Trusted tool metadata (`declared_impact`) should tag MCP/desktop tools when they are enabled.
5. AllowForRun covers exact kind + target, not subtrees, so a run touching many files prompts per file. A subtree grant would be a deliberate later change with its own tests.
6. Unconsumed auto-allowed read tokens count against `max_tokens_per_run` (256) until they expire (5 minutes) or the run ends.
7. A hard link or symlink created by an effect outside this crate (for example a copy builder that hard-links files) is refused by design, which may need a copy builder that copies bytes.
8. Time of effect: the checkpoint is immediately before rename/unlink, not atomic with it. Cancel waits for the guard, so ordering is preserved, but a stuck filesystem call delays `drained`.

## cap-std advisory floor and regression coverage

Official advisory GHSA-hp8f-xmx4-4qrg:
https://github.com/bytecodealliance/cap-std/security/advisories/GHSA-hp8f-xmx4-4qrg

The current policy, Core and Desktop lockfiles already resolve cap-std,
cap-primitives and cap-fs-ext 3.4.6, an explicitly patched release. Manifests
now require at least 3.4.6 in the 3.x line, including native Windows and the
Unix cap-layer test feature. No vulnerable-version emergency upgrade was
needed. Do not use canonicalize alone as proof of confinement.

A public FileExecutor regression covers caller trailing slashes, evil/
symlinks, indirect targets ending in evil/ and x/, root_link/ and doubled
separators. Read/write/delete are refused and outside bytes remain unchanged.
Linux default and cap-layer paths pass. Windows junction regression is included
but awaits native CI. These test executor defense in depth; they do not force
cap-std's Linux openat2 fallback with seccomp, nor claim a Windows symlink test
ran when privilege prevented creation.

---

# Policy v2 (Welle-B A4): process runner and tool network

Basis: concept A5/A6, D6, 4.3 security model. The broker model, tokens and audit are
unchanged; v2 adds enforcement for `Shell` and `Network`. `Mcp` and `Desktop` still have no
enforcement and are always denied. The file broker is untouched.

## Process execution

`Shell` proposals stay `no_enforcement`-denied until a `ProcessExecutor` attaches to the
exact run scope. Attach verifies the isolation layer first (fail closed, visible reason);
only then is enforcement registered. There is no weaker fallback level.

* **Linux (verified, tested):** bubblewrap >= 0.5 + a cBPF seccomp filter via `--seccomp FD`.
  Per execution: `--unshare-all --new-session --die-with-parent --clearenv`, read-only host
  userland (`/usr /bin /lib* /etc`), private `/tmp`, `/dev`, `/proc`; `/home` is not bound;
  the isolated copy is the only writable path. The child has **no network**. Fixed minimal
  env (`PATH`, `HOME=/tmp`, `LANG`). The seccomp filter is default-ALLOW with a denylist
  (mount, ptrace, kexec, modules, bpf, perf, userfaultfd, pivot_root, swap, reboot, acct,
  setns, unshare), an architecture guard and an x32-ABI guard; if the filter cannot be built
  or handed over, exec fails closed. An injected missing-bwrap path proves the fail-closed
  gate in tests.
* **Windows (PoC, compile-checked for x86_64-pc-windows-msvc, never run):**
  `proc/windows.rs` creates a zero-capability AppContainer profile (the LPAC posture) via the
  documented userenv + `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` route and spawns into
  it. Output capture is not wired in the PoC. The sandboxed shell gate on Windows stays
  closed until `cfg(windows)` spawn tests pass on Windows CI. Until then, Windows shell is
  disabled unless the user explicitly set up elevated exec.
* **Elevated mode (arbitrary exec):** a separate, explicit, user-chosen mode. It requires an
  `ElevatedSetup` marker created by the trusted settings flow; the runner refuses without
  it. The broker forces every elevated shell proposal to always-ask (Deny/AllowOnce only):
  no run grant, no autonomy level, no skill covers it. Never a default, never silent.
* **macOS:** no process execution. `platform_support()` reports `Unavailable` with a visible
  reason; `ProcessExecutor::attach` errors. No fallback.

Command binding: the consent target is the **program only**; the full argv and cwd are bound
via the args digest, so a substituted argument burns the token and argv never lands in the
audit log. Run grants are per program; every execution still gets its own request-bound token.
Sandboxed processes are killed on their timeout; output is capped.

## Tool network: broker-owned domain proxy

`Network` proposals stay denied until a `DomainProxy` attaches. The proxy is a localhost-only
listener (CONNECT + plain-HTTP forwarding) owned by the policy crate. Deny by default: every
connection re-reads the run's live network grants from the broker, so `AllowForRun` on a
domain opens it and `revoke_all_grants` closes it immediately. `AllowOnce` fetches are
performed host-side by `NetworkExecutor::fetch` under the request-bound token (URL-bound via
digest; a swapped URL burns the token). Ports default to 80/443.

* **Provider/tool separation:** `ModelTransportPolicy` is untouched. A model permit never
  opens the proxy; a proxy grant never creates a model permit. Tested both directions.
* **SSRF guard:** even with a grant, the proxy refuses to dial loopback, private, link-local,
  CGNAT, multicast, documentation and unspecified destinations. Tests prove a seeded
  `127.0.0.1` cannot be reached under the production config; fixtures use an explicit
  test-only `allow_private_targets`.
* **Alpha limits:** host-side fetch is plain HTTP. HTTPS for sandbox-side tools already works
  end-to-end through the CONNECT relay (TLS terminates at the origin); the host-side https
  fetch tool arrives with the MCP wave.

## Security review: threat model per barrier

1. **Consent broker / tokens (barrier: model output cannot approve).** Unchanged from v1:
   tokens are unforgeable, request-bound, single-use; binding mismatch burns. v2 adds argv and
   URL substitution to the covered set (tested).
2. **Linux sandbox (barrier: child cannot touch the host or the network).** Threats: escape
   via writable host paths (mitigated: only the isolated copy is writable, /home unbound),
   kernel attack surface (seccomp denylist + namespace isolation), secret leakage via env
   (--clearenv + fixed env), network exfiltration (no net namespace; the domain proxy is the
   only tool-network route). Residual: default-ALLOW seccomp is a denylist, not a whitelist;
   the ro-bound host userland is readable (standard for Codex-style sandboxes; the copy
   builder must keep secrets out of it).
3. **Windows AppContainer (barrier: same intent, PoC maturity).** Zero-capability profile;
   unverified until Windows CI runs the spawn tests. Elevated mode never papers over a
   missing sandbox silently: it is a separate visible mode with per-command asks.
4. **Domain proxy (barrier: tool network reaches only consented domains).** Threats: SSRF to
   LAN/metadata (IP-range guard at connect time), grant laundering via DNS rebinding (guard
   checks resolved addresses), consent-free relay (deny by default, live grant re-read),
   credential-bearing targets (existing audit sanitising; proxy answers carry no detail).
   Residual: DNS rebinding between check and connect (TOCTOU) is accepted for alpha; the
   proxy resolves once per connection.
5. **Elevated mode (barrier: arbitrary exec is never ambient).** Threats: accidental or
   agent-triggered privilege (setup marker only from the trusted settings flow, always-ask
   per command, no grants, audit detail `process:elevated`).

## Deliberately NOT built (no quiet bypasses)

* No host ACL, account or firewall changes — anywhere, for any reason stated in repo or tool
  text. Windows isolation uses AppContainer precisely because it needs none of them.
* No silent permissive fallback when bwrap/seccomp/AppContainer are missing: attach fails,
  proposals deny, the reason is visible.
* No macOS exec fallback ("not available" is the product answer).
* No network inside the Linux sandbox; no proxy route for model transport; no accepting of
  `ModelTransportPermit` anywhere in net/.
* No shell string execution: only argv exec, no `sh -c` path.
* No per-commandline run grants for elevated mode; no `allow_for_run` offer there at all.
* No output without caps, no unlimited runtime, no secret storage in audit/targets.

## Two audited unsafe sites (crate otherwise keeps `#![deny(unsafe_code)]`)

* `proc/seccomp.rs`: one inheritable pipe for the seccomp fd handoff (std has no safe API).
* `proc/windows.rs`: the raw Win32 AppContainer spawn (no safe std equivalent).

## Policy v2 tests (66 total in the crate, all green on Linux)

17 new: shell/network denied without enforcement; MCP/desktop stay denied with v2
enforcement on; argv substitution burns the token; grant-per-program flow; elevated
always-ask/no-grant/revocation; cancel revokes process tokens; real-bubblewrap matrix
(seccomp filter active proof via /proc/self/status, no-network proof, no-home/fixed-env
proof, denylist EPERM proof via injected statx denial, fail-closed with missing bwrap);
proxy deny-by-default, grant opens, revoke closes, AllowOnce fetch + binding burn, SSRF
refusals incl. seeded domain, provider/tool separation, domain validation, platform-support
honesty. Windows spawn tests and any macOS run are pending CI (labelled above).
