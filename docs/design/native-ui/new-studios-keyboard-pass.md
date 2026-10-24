# P5 keyboard and screen reader state slice

Animation timeline action row and Interface footer now expose labeled groups with ordinary Tab order.
They do not claim toolbar roving-arrow semantics that were never implemented. Existing pressed states
(playback loop, graph, node selection) and named buttons remain unchanged.

Interface fixed a concrete bubbling bug: keys on footer/nested action buttons or summaries no longer
fall through to canvas arrow-nudge/Delete/selection handlers. Actual node pseudo-buttons retain
Enter/Space selection, arrow movement, Delete and undo behavior. Input editing was already excluded.

3D scene replacement was an inline alertdialog without focus management. It now uses existing Base UI
Dialog via shared DS, real title/description, initially focused Keep scene, focus trap, Escape cancellation
and explicit focus return. Replace still calls the same existing controller handler. No automatic scene write.
Screen reader evidence is accessible-name/description/state inspection, not a human AT run.

Isolated browser test verifies title/body, initial focus, Shift+Tab stays in dialog, Escape closes without
replacement, and focus returns. Actual app CI-only keyboard specs cover Animation loop Space/pressed state
and Interface footer nonmutation. App 3D IO/WebGL replacement requires CI/native verification.
No modal exists for Animation's output inspector or Interface's inline export details; do not invent dialog roles
or trap focus around nonmodal panels. Interface native window.confirm replacement remains browser-owned.

P5 Settings is draft-only: settings-slice-plan.md and six Appearance fixture scenarios. No baseline received,
no Settings migration, golden update or existing test relaxation. The beta.4 BEFORE artifact remains required.
