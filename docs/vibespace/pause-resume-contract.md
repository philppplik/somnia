# Durable pause/resume integration contract (A5)

Checked against main 04bc442 and the pinned goose-agent spike. This is an integration contract, not a claim of shipped pause/resume support.

## Compatibility finding

`vibespace-engine/src/goose.rs` keeps its MachineSession (conversation, messages, pending proposal, done flag and step count) in a process-local Mutex. SessionLoader clones it. EffectHandler changes that memory and emits events; no durable state serialization or restore API exists. RunHandle has cancel/steer, not pause/resume. Storage already accepts Running -> Paused -> Running but that alone cannot pause inference or recover a session. Wire RunCapabilities.pause/resume remain false. A5 displays disabled controls with the limitation. Stop is not relabelled Pause.

## Required Rust-owned API

- `pause(run_id, request_id) -> SnapshotReply`: idempotent. Request pause at the next safe step boundary; acknowledge Paused only after durable state is committed and no effect can continue. In-flight inference may finish into a durable proposal but must not dispatch effects while paused. Do not cancel and silently restart the model.
- `resume(run_id, request_id, expected_sequence) -> SnapshotReply`: explicit, idempotent, same run ID. Acquire the single runtime ownership lease, validate model configuration and isolated artifact digests, restore the exact checkpointed session, publish Running only after restore succeeds. Stale sequences refuse and reconcile.
- `engine.checkpoint() -> DurableSessionV1` and `engine.restore(DurableSessionV1) -> RunHandle`: engine types stay behind the replaceable Rust interface. Versioned envelope with SDK version, session/model reference, isolated scope ID and digest, durable step number, conversation/message history including tool call IDs, pending effect identity, completed effect receipts, steer queue, token metering, cancellation/pause state. No credentials/provider raw response bodies.
- Atomically persist session plus event sequence before publication. Commit a broker effect receipt before recording that step as complete. Restore must never repeat an effect already executed or reuse expired consent tokens. Pending consent must be recreated for explicit review, never inferred from chat.
- Crash during pause/resume is visible as interrupted/paused-recovery-required; no automatic background restart. Unsupported schema/model/workspace/SDK versions produce a visible refusal, not a new run.

## Renderer boundary

Frontend only sends explicit pause/resume requests. Add these to transport capabilities only once native operations and recovery tests pass. Update RunCapabilities after each durable transition. No TS timers, agent orchestration, conversation restore, effect replay or synthetic timeline entries. Existing native event reconciliation locks actions on gaps.

## Acceptance before enabling

Offline fixture: pause during inference, pause during held consent, pause at a completed tool boundary, crash/reopen and explicit resume; repeated request IDs; stale sequence; ownership conflict; changed workspace digest; unsupported session schema. Verify no effect repeats and revoked consent is not restored. Native Windows/Linux smoke remains a separate checkpoint. A5 browser acceptance tests currently require disabled Pause/Resume and the explicit limitation.
