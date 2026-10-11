# Vibe Space: goose-agent compatibility spike

Date: 2026-10-11. Base: `3a3e5f5afe6c4953b1aec8a4c2c5332129473ac8`.
Scope: standalone `phase1/vibespace-engine`, no desktop integration.

## Recommendation and status

**Conditional GO for the isolated SDK seam, not a shipped Alpha.1 feature.**
The actual published `goose-agent =0.1.0-alpha.9` compiles and runs our
Somnia-owned inference, effect and steer operations under its `StateMachine`.
A separate, default-deny effect port is feasible. No full `goose` dependency,
built-in shell, filesystem tool, MCP client, extension discovery or provider
configuration is installed by this adapter. This is not a substitute own loop:
`StateMachine::run` owns repetition, session reload, operation precedence,
application and cancellation checks. Somnia implements the traits the SDK
explicitly expects its caller to implement.

There is **no real-model completion evidence yet**. Qwen3.5-9B smoke is **NOT RUN**:
no Ollama executable or listening service was found; `GET
http://127.0.0.1:11434/api/tags` returned connection refused. No model download,
second model, cloud request or paid API call was made. Offline fixtures verify
wiring and safety behavior, not Qwen quality or tool-call compatibility.

The repository's existing `rust-toolchain.toml` pins **1.95.0**, so this pin needs
no workspace toolchain change. Consumer minimum is **1.94.1**. Rust 1.90.0 is
**NO-GO** for this SDK; cargo rejects it normally, without bypassing MSRV.

## Evidence: versions, source, API and license

The current registry page lists alpha.9 (published 2026-09-09), Apache-2.0,
MSRV 1.94.1. The actual archive was downloaded and unpacked, including
`Cargo.toml`, `.cargo_vcs_info.json`, `src/machine.rs`, `src/operation.rs`,
`src/tool.rs`, `src/events.rs`, and the companion provider-types source.

| Published version | Archive-declared MSRV | Decision |
| --- | --- | --- |
| 0.1.0-alpha.6 | 1.94.1 | Not a 1.90 escape; not compiled |
| 0.1.0-alpha.7 | 1.94.1 | Not a 1.90 escape; not compiled |
| 0.1.0-alpha.8 | 1.94.1 | Not a 1.90 escape; not compiled |
| **0.1.0-alpha.9** | **1.94.1** | Exact agent and provider-types pins; tests pass on 1.94.1 and 1.95.0 |

Alpha.9 archive SHA-256:
`64bfe914cec6f669533e96f5d663e87aadcbffd822d5352ff03f0fc90b2ad931`.
Archive VCS revision: `13f4d26e1e703d6ed1552c6e599abdfa8d3e44ff`.

The actual SDK port surface is:

- `machine::{MachineSession, SessionLoader<S>, EffectHandler<S,E>, StateMachine, Step}`.
- `operation::{Operation<S,E>, Inference<S,E>, InferenceInput, MachineEffect,
  OperationResult, Emitter, applied, not_applicable}`.
- `Operation::run`, `Inference::infer` and `EffectHandler::apply_effects` are caller
  implementations. The SDK does not require its `ToolOperation` or rmcp handlers.
- `StateMachine::step` awaits the caller's future directly. Cancellation is
  cooperative, not automatic interruption. Our operations select the SDK emitter's
  cancel token against model, authorization and execution futures.
- `ToolOperation` supports typed rmcp tools and a dynamic `ToolProvider<S>`, but
  this spike deliberately does not register them. It routes only Somnia proposals.

The default `ConversationEffect` and SDK events are also optional. Here the
private session stores Somnia wire messages, pending proposal, done flag and step
count alongside the required SDK Conversation holder. SDK conversation helpers,
compaction and metadata-based reconstruction are **not** used. The runtime is
in-memory and run-scoped, not durable/restart-safe. No SDK type escapes the public
API. This narrow assembly verifies the seam, not the full reference goose agent.

License: goose-agent and goose-provider-types are **Apache-2.0, not MIT**. Somnia's
new adapter is MIT. The upstream Apache license text, fetched at the source
revision, is retained in `licenses/`. The published agent archive has no LICENSE
or NOTICE file. Preserve applicable upstream attribution/notices in distribution;
this is a technical audit, not legal advice. No upstream implementation was copied.

### Observed sources

- Registry and current versions: https://crates.io/crates/goose-agent
- Public API modules: https://docs.rs/goose-agent/latest/goose_agent/
- Actual pinned archive: https://static.crates.io/crates/goose-agent/goose-agent-0.1.0-alpha.9.crate
- Companion archive: https://static.crates.io/crates/goose-provider-types/goose-provider-types-0.1.0-alpha.9.crate
- Earlier archive checks: https://static.crates.io/crates/goose-agent/goose-agent-0.1.0-alpha.6.crate
  https://static.crates.io/crates/goose-agent/goose-agent-0.1.0-alpha.7.crate
  https://static.crates.io/crates/goose-agent/goose-agent-0.1.0-alpha.8.crate
- Exact upstream license: https://raw.githubusercontent.com/aaif-goose/goose/13f4d26e1e703d6ed1552c6e599abdfa8d3e44ff/LICENSE
- SDK/provider product docs: https://goose-docs.ai/docs/gdk/sdk/
  These describe goose-sdk provider bindings, **not** an Agent API replacement.

## Actual dependency/build impact

Cargo metadata on this Linux x86_64 environment resolves **211 packages across all
platforms**, including the local crate. Linux-active graph: **177 packages** with
this adapter; the SDK's Linux closure alone is **155 including goose-agent**.
All-platform SDK closure is 181. These are unique package IDs, not tree lines.
`dependency-audit.json` records the exact Linux-resolved versions and licenses.

The SDK has eleven direct dependencies. Its unavoidable rmcp features include
`schemars`, `auth`, `server`, and its tokio features include filesystem, process,
network and signal support. Their presence is build capability, not execution
permission: this adapter never calls those effect APIs. rmcp auth pulls oauth2
and reqwest 0.13.5; the explicit model transport uses exactly reqwest 0.12.28 with
rustls. This duplicate reqwest major line is a measurable cost and an upgrade
candidate, not hidden. No full `goose`, goose extensions, goose CLI, goose-providers
or goose-sdk appears in the resolved graph.

The SDK's Linux dependency sources occupy 78,780,145 extracted bytes in this
registry cache (includes source/tests/data, not deployed binary size). First debug
build/test on 1.95 took about 76 seconds including downloads; subsequent offline
tests take under a second to a few seconds. Debug target storage reached 2.5 GiB
**after compiling/checking multiple toolchains and test targets**. This is not a
release binary size, RAM estimate or incremental desktop delta. Release size,
Windows/macOS builds and desktop packaging have **NOT RUN**.

The audit has permissive license alternatives throughout; r-efi's LGPL alternative
also offers MIT/Apache. No assertion of a legal review is made.

No Cargo.lock is delivered, per task scope. Exact SDK pins do not pin all transitive
versions. The generated audit is a dated record, not a resolver lock. Integrator
must regenerate metadata/audit and commit the authoritative application lock using
its own workflow before claiming reproducibility across future registry changes.
Offline reproduction requires a prior online cache fetch.

## Integration contract

```rust,ignore
use std::sync::Arc;
use vibespace_engine::*;

let model = ModelConfig::Local {
    endpoint: "http://127.0.0.1:11434/v1/chat/completions".into(),
    model: "Qwen3.5-9B".into(),
};
let transport = HttpModel::new(model.clone(), None, true)?;
let backend = GooseBackend::new(Arc::new(transport)); // DenyAll by default
// .with_effect_port(Arc::new(host_consent_and_isolated_workspace_port))
let mut handle = backend.start(RunRequest {
    run_id: "space-1/run-1".into(), goal: "Inspect the project".into(),
    workspace: WorkspaceScope::new(explicit_existing_absolute_root)?,
    model, recalled_memory: vec![], max_steps: 32,
}).await?;
handle.steer("Focus on accessibility".into()).await?;
while let Some(event) = handle.events.recv().await { /* adapt to GUI */ }
// handle.cancel() is callable while model or permission is pending.
handle.join().await;
```

`AgentBackend::start` returns a live RunHandle and starts the real SDK run.
There is no separate second firing call. RunHandle supports `cancel`, bounded
`steer` and `join`; events carry the supplied run_id. Started is first, Step reports
an applied SDK pass, followed by Usage/Message/ToolProposed as appropriate. Exactly
one Completed, Failed or Stopped terminal is emitted for normal backend errors and
cooperative cancellation. Async panics/process death are not covered by this claim.
No text-token streaming is claimed; the HTTP adapter is non-streaming.

Requests carry explicit workspace, model selection, goal, optional memory bounded
to 16 KiB/32 entries, and max 1-128 steps. Steer accepts at most eight queued
8-KiB messages and runs at the next SDK boundary after pending tool resolution.
It does not silently replace an already in-flight call. Memory and tool output
are labeled untrusted, and there is no content-to-approval parser.

The explicit OpenAI-compatible HTTP adapter supports local loopback and BYOK HTTPS
with a separate redacted Secret. No environment lookup, proxies, redirects, global
configuration, fallback provider, credential URL/userinfo/query, or logs of model
payloads/HTTP error bodies. Client errors reduce to typed failures. Local mode
requires numeric loopback, plaintext HTTP and no credential; BYOK requires HTTPS
and a supplied credential. Native keyring/credential fetch is the caller's job.
Model responses have a 256-KiB transport cap and 64-KiB message/result caps.

Only one function schema is ever advertised: `somnia_propose_effect`. It proposes
an effect, never executes it. Calls are structurally validated, multiple/free
SDK tools rejected, and tool-call IDs/results are sent back in OpenAI-compatible
wire format. Read-only mode advertises no tools and rejects unsolicited calls.

`EffectPort::authorize(run_id, workspace, exact_proposal)` is the host authority
channel. Default Deny never calls execute. Only AllowOnce for that proposal reaches
`EffectPort::execute`. No consent from recalled memory, assistant text or tool
result can authorize another request. The host, not this crate, must validate
paths against the supplied scope, enforce ask-for-writes, bind consent to exact
arguments/run, and keep effects inside the isolated working copy.

Cancellation drops pending model/authorize/execute futures and emits Stopped.
Dropping a future cannot roll back an effect already started or stop work detached
by a port. Host implementations must be cancellation-safe/cooperative and must not
spawn detached writes. WorkspaceScope is context, **not an OS sandbox**.

## Tests and reproduction

From the repository root:

```sh
cargo +1.95.0 test --manifest-path phase1/vibespace-engine/Cargo.toml
cargo +1.95.0 test --offline --manifest-path phase1/vibespace-engine/Cargo.toml
cargo +1.94.1 test --offline --manifest-path phase1/vibespace-engine/Cargo.toml
cargo +1.95.0 fmt --manifest-path phase1/vibespace-engine/Cargo.toml -- --check
cargo +1.95.0 clippy --offline --manifest-path phase1/vibespace-engine/Cargo.toml --all-targets -- -D warnings
cargo +1.95.0 tree --manifest-path phase1/vibespace-engine/Cargo.toml
cargo +1.95.0 metadata --filter-platform x86_64-unknown-linux-gnu --format-version 1 --manifest-path phase1/vibespace-engine/Cargo.toml
# Expected MSRV rejection, verified:
cargo +1.90.0 check --offline --manifest-path phase1/vibespace-engine/Cargo.toml
# Only after the single trial model is actually present locally:
cargo +1.95.0 run --offline --manifest-path phase1/vibespace-engine/Cargo.toml --example local_smoke
```

**17 deterministic tests PASS** on both 1.95.0 and 1.94.1. Format and clippy with
warnings denied PASS on 1.95.0. Tests execute the actual SDK, not a substituted loop:

- Event ordering, usage, completed/failure terminal and bounded step-limit loop.
- Deny-before-execution and default-port deny.
- Tool-result injection cannot approve a subsequent effect; each call is checked.
- Cancel while inference, host permission or host execution is pending.
- Model, policy and execution failures; scope/memory and credential/endpoint guards.
- Next-boundary user steering.
- Real loopback HTTP parsing fixtures: read-only no-tools, proposal format,
  rejection of unadvertised calls and redacted HTTP failure.

**NOT RUN:** local Qwen3.5-9B smoke, DE+EN quality eval, cloud BYOK live calls,
checkpoint/apply/discard, native keyring, desktop UI, sandbox enforcement,
restart/recovery, compaction, arbitrary provider APIs (Anthropic/Responses),
Windows/macOS builds and shipping package size.

## Alpha.1 gates still open

Do not present this as an operational Space/Studio feature. It provides the
replaceable D7 seam only. It needs a Rust host policy/consent port, Checkpoint 0,
isolated working copy, scoped durable memory integration, review diff and explicit
Apply/Discard from other workstreams. No public UI, daemon, schedule, write tool or
fake completion is installed here. After the real single-model trial and cross-
platform packaging checks, adopt this assembly only if its behavior and cost fit.
If a strict 1.90-only consumer is later required, use an explicitly approved isolated
1.95 worker boundary or revisit the SDK choice. Do not bypass rust-version or embed
full goose to hide that incompatibility.
