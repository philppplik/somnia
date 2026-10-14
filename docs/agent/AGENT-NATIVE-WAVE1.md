# Agent-native wave1: shared local panel boundary

Base: int/beta5 6c71b5c27 (wave0 integrated). In development, no release or complete all-studio tool claim.

## Existing path, extended

AgentPanel still uses panelBridge, AgentSession and reviewed TransactionManager. No second agent loop or command execution escape hatch. Local-native is a run-scoped panel choice, on by default. It refuses a selected non-Ollama provider before any daemon/context/provider read and blocks configured cloud routing, including empty workspaces. Turning the choice off deliberately retains the existing provider/consent path. This switch grants no document access or mutation permission.

The existing Ollama gate is extracted to `verifiedLocalProvider.ts` for direct tests. It verifies local weights before every provider round, including tool-result rounds; the capabilities gate verifies offered tool/vision support. Redirects, cloud passthrough and unavailable weights remain rejected. HTTP cancellation, single-slot stream backpressure and privacy signal checks survive extraction; release listeners are removed when a slot drains. Cancellation cannot prove a shared daemon stopped inference.

Local-native runs normalize explicit context choices or use the existing 8KiB document default. `buildContext` now rejects invalid numeric limits and caps the shared limit at64KiB. Document identity/revision stays pinned before approval and is revalidated after awaits. Context is untrusted data. A local-native session cannot replay a non-native session merely because the model matches.

## Shared builder contract

`nativeRun.ts` defines a target/effect/review/history action and a matching receipt. `assertNativeAction` checks exact document ID, path, kind, adapter and base revision; edit requires the exact host preview identity and a one-native-entry contract. This port refuses disclosure and external effects; those would need separate workflows. Inspect creates no history. `assertNativeReceipt` rejects applied without verified readback and1 native undo entry, and rejects no-op/failure with nonzero history. Unreconciled effects remain unknown, never inferred as failure0 or success1.

This is a validator for forthcoming studio builders, not a new executor and not a proof of every existing native port. Builders must call it at their boundary, add atomic engine/history tests and supply actual receipts before promoting a tool. Broad ui commands remain refused.

## Live receipts

NativeRunLedger feeds the existing side panel with run-scoped provider/model, bounded context byte count, pinned document/ref, tool lifecycle, pending review, apply/undo and terminal state. The buffer holds at most64 metadata rows and ignores late events from another run. No prompt, arguments, tool results, document content, endpoint, URL or credentials are stored. Project/reset clears it.

Current apply receipts reflect the existing exact-text readback. Undo verifies the restored text before labeling readback verified. Native history counts for existing ports stay Unverified, including apply failures after an engine may have changed. This is honest observability, not a fabricated atomic engine receipt. No save/export receipt is implied. Five locale strings cover the new controls/receipt states.

## Verification

Synthetic tests cover exact target/preview, applied1/no-op0/failure0, unknown history, stale ledger suppression, bounded immutable snapshots, cloud refusal before network, Ollama weights/capabilities/tool stream and pre-abort. Existing document, chat, streaming and provider tests are preserved. Isolated receipt and actual AgentPanel fixtures have Light/Dark browser checks. Fixtures disable real network; screenshots are synthetic, not proof of native execution or model quality.

No dependencies, downloads, cloud calls or spending. Native/Rust/WASM/full desktop and real-model privacy/quality acceptance remain CI/manual work. Global DS has inherited Sound budget violations; layers is limited by the installed compiler; full TypeScript check timed out locally. Gates are not weakened.

Visual inspection of the actual panel found inherited footer controls compressed into a horizontal absolute composer row. The footer now stacks controls in normal flex flow and reserves its real height; Light/Dark browser geometry checks put the composer below local source controls. The change uses existing styling, no DS allowance increase.
