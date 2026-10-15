
### Reviewed Sheets ranges

The local sidepanel can preview a visible selection of up to 100 cells and ask for
explicit acceptance. It retains the native token and exact old cells privately;
only displayed text reaches the model. Acceptance checks the same workbook,
selection, permission and native state again, then calls `setRangeReviewed` once.
The owner receipt must prove one undoable edit and match a fresh range readback.
Undo calls `undoRangeReviewed` once with the owned token and verifies the exact
old cells. A stale review refuses the edit. An uncertain post-entry result must
be inspected, never retried automatically. Applying or undoing does not save.

The wrapper and sidepanel proof use JS/synthetic hosts locally. Rust/WASM and
full desktop roundtrips remain CI-only; a passing panel test is not native proof.
Multi-text Slides previews remain preview-only, without Accept or Undo.
