# Vibe Space build plan

Baseline: `main` at `3a3e5f5afe6c4953b1aec8a4c2c5332129473ac8`.
Integration branch: `feat/vibespace`. The authoritative product design is
[`../concepts/vibespace.md`](../concepts/vibespace.md). This plan sequences it;
it does not replace decisions D1-D12 or the skills-library decisions.

## First testable alpha

A person can create a Vibe Space, create a Studio with an explicit folder scope,
select their local/BYOK model, and run a real agent. The run operates in an
isolated copy and uses scoped persistent memory. Before any agent edit there is
a checkpoint. Proposed effects go through the Rust consent broker. A completed
run offers a diff and explicit Apply or Discard. Apply first takes a checkpoint;
concurrent project edits produce conflicts, never a silent merge. Restore is
available. Stop cancels execution and preserves partial isolated work.

A mock conversation, standalone SDK demo, or UI with disconnected buttons is
not this milestone. Real-model smoke tests require an available user-configured
model. Offline fixtures are tests, not a substitute for the real-model gate.

Initial editing tools may be limited to scoped, broker-owned file operations.
Unrestricted shell, direct SDK tools, desktop control and uncontrolled MCP tools
must remain unavailable until their enforcement paths have been verified. A
working copy is not an OS sandbox and must never be presented as one.

Memory retrieval may initially be FTS-only, with that limitation stated. The
chosen fastembed + multilingual-e5-small + sqlite-vec path remains required for
the full feature. No model downloads or cloud charges occur implicitly.

## Ownership and parallel packages

All packages start from the same baseline and deliver a format-patch series.
Builders own only their new directories and their package-specific documents.
The integrator owns shared manifests/lockfiles, Tauri registration, application
navigation and final composition. No builder pushes, merges, rebases or changes
`int/gh-wave`. A shared-file change requires the other workstream's owner to
confirm the boundary before the integrator edits it.

| Package | Exclusive paths | Deliverable | Dependency |
|---|---|---|---|
| P1 engine spike | `phase1/vibespace-engine/`, `docs/vibespace/goose-spike.md` | Pinned goose-agent behind replaceable Rust interface, policy tool port, cancellation, event stream, reproducible tests | None |
| P2 persistence/memory | `phase1/vibespace-storage/`, `docs/vibespace/storage.md` | SQLite spaces/studios/runs/events, migrations, scoped memory and deletion, FTS | None |
| P3 artifacts | `phase1/vibespace-checkpoints/`, `docs/vibespace/checkpoints.md` | Content-addressed snapshots, isolated copy, diff, conflict-aware apply/discard/restore | None |
| P4 policy | `phase1/vibespace-policy/`, `docs/vibespace/policy.md` | Rust default-deny consent decisions, scoped file execution, audit record, revocable run approvals | None |
| P5 UI | `phase1/src/components/vibespace/`, `phase1/src/lib/vibespace/`, `docs/vibespace/ui.md` | Home, create forms, Studio run, consent, review and checkpoints with typed adapter and fixture tests | Contract; fixtures until bridge arrives |
| Integration | `phase1/vibespace-core/`, Desktop bridge/shared files, `docs/vibespace/` integration docs | Compose engine, policy, storage, artifacts; Tauri commands and events; App/rail wiring | P1-P5 |

P1-P4 are standalone Rust crates, independently compilable with
`cargo test --manifest-path <package>/Cargo.toml`. Do not add dependencies to the
existing Desktop manifest in parallel. Keep dependencies small; avoid exposing
SDK/provider types across the public engine interface. Do not copy third-party
code without checking the actual license and recording attribution.

## Integration contracts

These are target semantics, not claims about the SDK's existing API. The spike
may report an incompatibility rather than pretend the API supports them.

- Stable identifiers: `space_id`, `studio_id`, `run_id`, `checkpoint_id`,
  `consent_request_id`; serialized UUID strings where applicable.
- Persistence timestamps are UTC; UI converts for display. Never store secrets
  in goals, run metadata, tool arguments, event payloads or application logs.
- Distinguish execution state from review state. Engine states are pending,
  claimed, running, done, failed, crashed; paused/stopped are explicit runtime
  states where implemented. Review state is none/ready/applied/discarded/conflict.
  UI board columns derive from both, not a second competing run-state store.
- Events have run ID, monotonic sequence, timestamp, kind and bounded/redacted
  payload. Durable events are written before being published. Include visible
  failures and consent waiting; never derive the return recap from chat prose.
- Engine request: goal, model reference, isolated workspace reference, bounded
  recalled memory. The model reference resolves credentials through the existing
  secure settings path; it is not a serialized API key.
- Engine port: start/run, cancellation, steer at the next durable step boundary,
  and normalized message/step/tool/usage/terminal events. Publish capability
  support explicitly, including any pause/resume gap.
- Tool port: proposal with run ID, action, target scope and arguments; only the
  broker/executor can grant and perform effects. An engine's tool response or
  skill's `allowed-tools` cannot create approval. Consent tokens bind to the
  specific request/run/scope and are invalid after cancellation or completion.
- Artifact operations take explicit source and isolated-root handles. Reject
  symlink escapes, traversal, special files and overlapping roots. Apply verifies
  the original baseline and creates its pre-apply checkpoint before any write.
  Failed multi-file apply must be recoverable and reported honestly.
- Memory operations always require a space scope. Separate instructions, memory,
  skills and permissions. Deleted records leave retrieval and embeddings too.
- Frontend uses an injected transport interface; fixture mode is clearly marked
  and is not automatically selected after a failed native command.

## Alpha release gates

1. Real local/BYOK agent run, not only fixtures, reaches review through the actual
   Rust/Desktop bridge. Record model, platform, command and result.
2. Files outside the isolated scope and all original files remain unchanged until
   explicit Apply; denied writes have no effect. No route bypasses the broker.
3. Checkpoints survive restart; restore works; conflicts preserve user edits.
4. Stop works during inference and pending consent. No late effect lands after
   cancellation. Crashed/recovered runs and incomplete applies are visible.
5. Memory survives restart, stays within its Vibe Space and deletes completely.
6. Actual UI pixels are inspected for creation, running, consent, review/conflict,
   failure and checkpoint states. Screenshots and untested areas are reported.
7. Windows and Linux development/alpha CI pass. Use only public-repository free
   Actions within the zero-cost budget. Beta/stable platform scope is separate.
8. English notes explain supported capabilities, setup, limitations and recovery.
   Never call isolation a strong sandbox if no OS enforcement was verified.

## Later waves, still in the full scope

- Security/recovery tests, DE+EN tool-use evaluation, packaging and native UI
  verification start as soon as their package interfaces exist.
- Scheduling: croner, SQLite run manager, leases/fencing, DST tests, misfire Skip/
  Coalesce/Catch up, explicit schedule consent, optional tray/autostart, return
  card from events. Default execution requires the app to be open. Auto-apply is
  explicit opt-in per schedule and never defeats effect boundaries.
- Skills: standard SKILL.md discovery/activation, per-space/user scope, scripts
  sandboxed and consent-gated. Store's Skills tab, pinned repo imports,
  read-only skills.sh discovery, scan/diff, trust tiers and first-party seeds.
  Scheduled scripts require explicit opt-in; installation never executes scripts.
- Desktop control: external MCP providers first, default-off Computer Use
  settings and per-app allowlist, always-ask sensitive actions, visible activity,
  global kill switch, cloud-screen notice, background opt-in. Windows/Linux only;
  Linux capabilities shown before enablement. No automatic elevated setup.
- ACP client, task board and embedded inference follow their dependency gates.
  Voice and optional backends remain later work as in the concept.

## Handoff requirements

Each package reports its base commit, patch files, owned paths, public interface,
actual test commands/results, untested platforms and remaining risks. Include
license checks and dependency impact. Fixtures and skipped tests must be labelled.
The integrator records applied commit IDs and reruns composition tests; a clean
patch application alone proves neither compilation nor completion.
