# Vibe Space policy: consent broker, approval tokens, scoped file executor

Crate: `phase1/vibespace-policy` (`vibespace-policy`, lib `vibespace_policy`). Standalone, no Tauri, no shared manifest. Dependencies: `serde`, `serde_json`, `sha2`, `getrandom`, `libc` (unix). Basis: `docs/concepts/vibespace.md` principle 4, A5, A6, A11, A14, A15, 4.4, 5.4 and D5. Verified on Rust 1.95.0 (`rust-toolchain.toml`).

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
3. **No enforcement for the capability: Deny.** Read/Write/Delete are enforced only for a run scope that has a `FileExecutor` attached. Shell, network, MCP and desktop have no enforcement in this crate and are always denied, even if a scope lists them, even from a Verified skill, even if the host permitted a model endpoint.
4. `Autonomy::ReadOnly` denies write and delete.
5. Baseline always-ask (`impact::classify`): delete, anything tagged send / purchase / credential / payment (declared by trusted tool metadata, plus heuristics on the target, for example `.env`, `*.pem`, `.ssh/`, `secrets.json`). Always **Ask**, only `Deny`/`AllowOnce` are offered, no run grant is created or honoured, no autonomy level or skill `allowed-tools` changes this. Heuristics can only add asks.
6. Otherwise: read in scope is allowed; an existing run grant for the exact kind and target is allowed; write under `AllowWritesInCopy` is allowed; everything else (default D5: writes) is **Ask**.

Unattended (scheduled) runs follow the same rules; their asks wait in the queue (`attended: false` in the view, "needs you"). Nothing auto-allows because nobody is watching.

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
* **Non-unix (Windows) fallback**: path-validated best effort (symlink and reparse-point checks per component, canonical-prefix check). A local process that can swap directories between check and use can race it. It is **off unless** `FileLimits::allow_path_validated_fallback` is set, and `FileExecutor::isolation_level()` reports it so the UI can show the "Medium" indicator from 5.4. It compiles for `x86_64-pc-windows-gnu` (checked) but has not been run.
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

`cargo test` (46 tests + 1 doctest): deny-before-effect (no decision, user deny, read-only, no enforcement, unenforced kinds, unknown run/scope); allow-once single consumption and replay; grant-bound tokens; forged token, other-broker token, expiry, pending expiry; cancel after approval, finish, cancel with pending, grant revoke, 200-iteration cancel/commit race; path, content, action, run and scope substitution; approval text inside reasons, skill names and file content; Verified-skill shell denied; model endpoint vs tool network; always-ask for delete, declared impact, credential-like targets, grant not covering a later sensitive variant; unattended runs; bounded pending queue and audit, secret-free audit; traversal and protected paths; symlinked file, symlinked directory, dangling symlink, relative-up symlink, FIFO, directory, hard link, size limits, root swapped for a symlink after attach.

## Known limits and risks

1. Shell, MCP, desktop and tool network are **off**. Turning one on needs real OS isolation plus its own tests (A5/A6); this crate adds no pretend sandbox.
2. Windows file isolation is the weaker fallback and unrun here. Until a handle-relative Windows layer (NtCreateFile relative to a root handle, or `cap-std`) exists, the default is to refuse it.
3. The user's decision is only as trustworthy as the bridge that calls `UiHandle`. Do not route model-visible text into those commands. The reason shown is the agent's claim, not a verified description.
4. Heuristic always-ask classification can over-ask (for example a file named `token-list.md`) and cannot know every sensitive name. Trusted tool metadata (`declared_impact`) should tag MCP/desktop tools when they are enabled.
5. AllowForRun covers exact kind + target, not subtrees, so a run touching many files prompts per file. A subtree grant would be a deliberate later change with its own tests.
6. Unconsumed auto-allowed read tokens count against `max_tokens_per_run` (256) until they expire (5 minutes) or the run ends.
7. A hard link or symlink created by an effect outside this crate (for example a copy builder that hard-links files) is refused by design, which may need a copy builder that copies bytes.
8. Time of effect: the checkpoint is immediately before rename/unlink, not atomic with it. Cancel waits for the guard, so ordering is preserved, but a stuck filesystem call delays `drained`.
