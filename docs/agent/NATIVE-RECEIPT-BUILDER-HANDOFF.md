# Native tool execution: builder handoff

Inspected base: int/beta5,55a32f61a. Prepared ports are read/propose only. Their synthetic Light/Dark previews do not prove execution, real rendering, native undo, save or model quality. Keep executeAvailable=false until each acceptance path passes owner-level proof. Do not register broad tool execution to make the ports look complete.

## Shared acceptance contract

1. Host captures approved exact native target and document identity/revision, with generation or immutable owner identity to catch same-id/revision reopen and ABA. Model cannot choose another target, origin, permission or effect type.
2. Review shows actual before/after. Acceptance validates the reviewed target and content inside the native owner's serialized or synchronous commit boundary, not merely before enqueue. Recheck after every await. A stale review fails without mutation.
3. Permission to inspect/propose does not authorize apply or save. Keep existing host review, disclosure, local-provider validation and cloud consent gates. No full project/package conversion, hidden context, automatic fallback or external effects.
4. Return immutable owner receipt: exact target, origin/proposal identity, before/after native revision, actual content readback and logical history applied delta. Applied change=1, true no-op=0, proven precommit failure=0. A postmutation failure or unverifiable readback is unknown/null, never a fabricated0 or automatic retry. Bounded history-length subtraction is invalid proof.
5. Origin-bound undo must refuse after manual edits, newer history, reopen or ABA. It restores the exact owner's newest reviewed step, not generic undo of whichever operation is now on top. Undo receipt gets native readback and logical delta too.
6. Isolate observer/render/recovery notification errors after native commit. A listener exception cannot convert a completed mutation into a safe-to-retry failure. Unknown states need reconciliation before another execution attempt.
7. Wire the verified receipt to nativeRun/panelBridge metadata ledger only after native success. Ledger stores metadata, not document contents. Do not mark saved from an in-memory commit.

## Sheets: cell worker and history owner

Prep: sheetsCellPort.ts, engine mutation epoch and live selection review. Pin workbook DocumentRef, sheet id, canonical cell address and worker epoch. Permission/freshness/hidden/merged refusal must remain.

Observed gap: worker cell setter returns unknown JSON; JS epoch/pre-post checks cannot stop a queued mutation from racing. No atomic expected native revision or logical history receipt.

Builder work:
- Add native expected workbook/sheet/cell revision and exact old value check inside the worker mutation owner. Preserve cell type, formula/value distinction and unsupported workbook data.
- Return actual new cell value/type, native revision and owner logical undo receipt. Busy/mutating epoch must cover every mutation including sort/resize/style/freeze/sheet operations.
- Add native reviewed-cell undo with origin/newest-step guards. Reject stale sheet/cell moves, reopen and ABA.

Proof: queued race, mutation before readback failure, no-op, full bounded history, manual edit between review/apply, cancel before commit, reopen and exact native undo. Real Rust/WASM CI plus JS worker bridge tests.

## Documents: D41 reviewed edit is the next dependency

Prep: documentsBlockPort.ts. One top-level editable paragraph only, pinned DocumentRef/block/native revision. No whole-DOCX replacement or table/cell promotion.

Observed baseline: session.ts owns UndoStack and serialized replacements. Worker edited response has no atomic expected-revision/history receipt. Replace can precede a failed refresh/history push.

D41 integration reported by coordinator: applyReviewedEdit(block, expectedRev, expectedText, hunks) -> EditReceipt with revision, readback text, undoable and typed errors. It is NOT present in inspected55a32f61a. Fetch latest and inspect implementation/tests before wiring. Do not infer logical applied1 from undoable=true or equate every typed error with precommit failure.

Builder work:
- Convert exact reviewed before/after using existing UTF-8 diffEdit, never an unrestricted full-file write. Call D41 through owner permission/identity/revision guards in its serialized boundary.
- Verify D41 readback, document generation/reopen guard and atomic history semantics. Fill any missing origin/logical delta/unknown-postcommit classification. Typed errors must distinguish known nonmutation from unknown mutation.
- Origin-bound reviewed undo must respect newest history. Preserve formatting, tables/images/comments and unsupported DOCX structures outside the reviewed paragraph.

Proof: UTF-8 offsets, malformed hunks, old-text/revision mismatch, queued manual edit, document switch/reopen, worker/readback failure, one undo step, true no-op and formatting retention. Rust/WASM CI required before complete native execution claim.

## Slides: canonical run copy and deck owner

Prep: slidesTextPort.ts. Locator matches actual TextRun: slide index, canonical package part and run index, plus attachment generation/DocumentRef/native revision. No guessed shape/paragraph id or first-run fallback.

Observed gap: editSlideText copies run old text, then opens/renders new bytes before pushing bounded before-deck history. applyDeckSession checks expected text/revision/identity but returns revision only. Failures can happen after native open/working commit.

Builder work:
- Exact old/new canonical run validation plus owner generation/revision inside commit. Preserve untouched ZIP parts and rich-text formatting; refuse signed/noncanonical packages.
- Stage native copy/open/readback before committing working bytes and one logical history step, or explicitly reconcile partial native-open failure. Render failure is separate from commit outcome.
- Return logical receipt and newest-origin undo; do not use bounded10-entry history length as delta. Refuse stale/reordered slide or run locator.

Proof: part/run mismatch, reordered slides, package-format retention, native open/render failure, full history, exact before-deck undo, manual edit/reopen/ABA and cancellation boundary.

## Animation: synchronous document snapshot owner

Prep: animationKeyPort.ts uses actual AnimationSession and native immutable applyEdit(prop.set) validator. Exactly one committed selected transform key, unlocked layer. Pin doc object identity/id/revision/active composition/layer/property/tick. Model supplies value only.

Observed gap: synchronous snapshot history exists but dispatch/checkpoint/emit lacks reviewed origin-bound receipt/undo. Listener exceptions can occur after mutation.

Builder work:
- Add reviewed synchronous commit in AnimationSession. Check immutable document identity and exact old key immediately before applyEdit; keep native scalar/vector constraints and selection/preview refusal.
- Push one history entry and create logical receipt before observer notification. Explicit no-op and precommit failure classification. Isolate postcommit recovery/listener failures.
- Origin-bound undo refuses newer manual edit, document switch/reopen/ABA or active preview. Preserve other keys, easing, expressions as inert text and project structure.

Proof: native value bounds, single/multiple selection, locked layer/preview, permission mutation, bounded200 history, observer throws, recovery failure, no-op, one-step undo, reopen/ABA. JS real-owner proof is possible; desktop/render/save claims remain separate.

## 3D: additional prep, not part of the four-studio unlock

studio3dTransformPort.ts requires exact scene generation/revision/object and local transform. Stage.setTransform uses degrees and finite XYZ/nonzero scale. Production native validator/adapter is not wired. Stage has private revision, grouped history and auto-key side effects; implement owner commit/readback/origin receipt and atomic auto-key coverage or refuse those states. Real Stage test load is currently blocked locally by missing installed three-bvh-csg; no new dependency was installed. Bone/skinning/pin/edit-mode support remains unproved.

## Definition of done

- Real owner receipt, content readback and exact origin-bound undo tests, including stale races, full history and postcommit failures.
- Existing safety tests unchanged; no new dependency, cloud path, budget increase or release side effect.
- Native/Rust/WASM/full desktop work in CI only. Report actual proof, skipped tests and unknowns separately.
- Small dedicated studio patch on fetched current integration tip; author/branch convention preserved. Inspect Light/Dark actual preview pixels, then wire narrow opt-in tools only after native proof. Main chat panel stays chat+composer; detailed receipts and controls stay in Settings.
