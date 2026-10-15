# Agent panel

The Agent panel helps inspect the active document and prepare small edits. A model proposes an edit; you decide whether to accept it. A proposal does not save a file or grant the model permission to apply changes.

## Start with a local model

1. Open Settings > AI and choose an installed Ollama model with tool support. For local-native mode, Ollama is required and there is no cloud fallback.
2. Open the document in its studio and select the supported target.
3. Describe the change in the panel. Empty-state suggestions fill the draft only; press Send yourself.
4. If asked, approve inspection of the document. Document text is treated as untrusted data, not instructions.

The status line separates the selected model from the models reported loaded by Ollama at its last check. A loaded model is not proof that it is currently generating, that a task succeeded, or that its outputs are good. Unknown means that the runtime could not be checked.

## Supported selected edits

| Studio | Target | Limits |
| --- | --- | --- |
| Docs | One selected editable top-level paragraph | No multi-paragraph, table/cell or embedded-object rewrite |
| Sheets | One selected visible, unmerged cell | No range rewrite, active cell draft or shared workbook |
| Slides | One selected canonical text run | No notes, layouts or slide structure rewrite; not while presenting |

These ports are local-sidepanel paths. Their model tools only inspect and propose. Native execution runs through the host after preview acceptance. Missing or unsupported selection is a refusal, not permission to choose another target. Shared collaboration is refused for these selected native edits until its owner path is supported.

## Review and undo

Read the file and target label, Before and After. Accept preview applies exactly that proposal to studio memory. Reject proposal discards its one-use capability. Each apply must carry a native owner receipt proving the changed target and undo entry. The panel does not save to disk. Use the studio's save-copy/export action when ready.

Undo AI transaction uses the receipt for the accepted edit, not a generic restore. It refuses when a newer edit, reopen or owner change would make undo unsafe. Unknown mutation/readback does not trigger another apply attempt. Inspect the native document before trying a new request.

Pending reviews and in-flight native writes block new model turns. Stop, errors, New chat and reset revoke pending capabilities. An old preview in the chat is not a new approval. Earlier decisions is a bounded, session-local display summary, not a restorable version or an executable list. It is not sent to a model or stored in the cloud and disappears on reload.

## Keyboard and errors

Tab follows ordinary control order. Enter submits the composer. Proposal readiness and decisions are announced; errors have an assertive announcement. Escape with one idle pending proposal asks for confirmation before rejecting it. Escape does not pick among several proposals, dismiss inspection approval or apply an edit.

If Ollama cannot be reached, start it on this computer before submitting again. If the exact model is missing, check Settings > AI > Local Models and review any download there. No model is downloaded automatically and no request switches to a cloud provider. Any Retry action is manual.

## Verification and release limits

JS integration tests exercise the real selected Docs host and session receipt path against a synthetic worker, and the real SheetsEngine worker-protocol adapter against a synthetic worker. These are useful composition proofs, not full-native E2E. Slides owner receipt tests also use a synthetic owner. Browser tests of the actual AgentPanel use a synthetic core and check preview/accept/reject/undo, focus, announcements and status layout.

Full Docs/Sheets/Slides Proposal -> Accept -> Undo with actual native engines, real documents and rendered studio readback is CI-only. It requires compiled WASM and the desktop host. Do not label JS mocks or skipped CI-only tests as native success. See `nativeHostRoundtrip.test.ts` and the receipt-port test suites for current coverage. Rust/WASM/full desktop validation and release approval remain separate gates.

This document describes the panel slices under integration, including visible status, draft chips, local decision history and keyboard/error help. Integrate their pending patches before treating every UI detail here as shipped. No new dependency or automatic execution is needed for these features.
