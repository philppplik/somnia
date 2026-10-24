# Studio tool port: reviewed native actions

Use the Photos Develop pilot in `photoDevelopPort.test.ts`, `photoDevelopWorkspace.ts` and `photos/session.ts`. It changes settings in memory only, not pixels on disk.

1. Expose a typed read/propose registry. Use a small JSON schema with `additionalProperties:false`, validate again in the implementation and check cancellation. Read only approved metadata. A proposal stages an exact before/after preview; it cannot call commit. Do not adapt a broad ui command into an agent tool.
2. Bind `DocumentRegistry` to the history owner's real identity, adapter and revision. Pin the `DocumentRef` before approval. Call `assertNativeAction` with the host-owned current snapshot and exact reviewed ID immediately before mutation. Recheck after every await. File paths alone cannot identify reopened documents; text equality alone cannot detect manual edit-and-revert.
3. Use `PolicyGateway` and `TransactionManager` for inspect/edit grants and complete-preview acceptance. The model never grants policy or accepts its own preview. Disclose/external effects are separate workflows, refused by this action port.
4. Commit through the actual history owner. Validate and allocate before changing state. No await, renderer work or fallible callback between the final guard and complete synchronous state assignment. Return a logical undo-entry delta from that owner, not `past.length` subtraction: bounded histories can stay length50 while adding one entry. No-op0 and pre-commit failure0; successful action1. Never raise success1 from lack of an exception.
5. Verify post-commit identity, exact content and revision. Return `NativeActionReceipt` with the pinned pre-action target. Call `assertNativeReceipt`. If a mutation may have happened but readback/history is uncertain, return unknown/null, preserve the state and ask for inspection. Do not retry automatically or pretend failure means unchanged.
6. Undo only the matching newest origin and revision. Reject later/manual/ABA/replacement edits. Verify restored content. Save/export is another explicit action, never implied by applying a proposal.

## Copyable pilot

`createPhotoDevelopRegistry` stages partial settings, retaining omitted controls. The existing panel publishes a reviewed TransactionManager proposal. On acceptance, panelBridge calls `acceptPhotoDevelopAction` with that proposal's ref/ID and a DocumentRegistry snapshot. The port uses `commitDevelopSettings`, whose revision and logical history delta are produced by the real Develop store. Verified applied receipts feed the panel as undoEntries1. Other studios still show Unverified.

## Required proof

Test the real history owner: stage makes no change; exact review succeeds once; repeat accept is idempotent; invalid, cancelled, stale and wrong-review paths add zero entries; no-op adds zero; capped history still adds one logical entry; undo restores; later/manual ABA and reopened identities block undo. Include observer failure/reentrancy: a UI exception cannot make an applied edit look failed0, and a reentrant change must become unknown, not verified. Inspect Light/Dark preview and receipt pixels. Native/Rust/WASM, full desktop and real-model tests remain separate CI/manual evidence.

The pilot proves one in-memory settings transaction, not all Photos raster operations, rendering success, real-model quality or a saved file. $0, no dependencies or cloud.
