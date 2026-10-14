# Sheets selected-cell port: preparation only

Base6cc31ac1d. This slice supplies an opt-in typed read/propose registry for one pinned cell and closes an invalidation hole. It does not register new runtime tools globally and cannot execute cell edits.

A host supplies a fresh permission-gated single-cell snapshot. It must refuse hidden/merged selections and use the live worker/session. The bridge pins document ID/path/revision/adapter, sheet, canonical address and worker epoch before the await, then rechecks all afterwards and before staging. UTF-8 context/input is capped at32,767 bytes. Formula/display are untrusted data, not permission. No model target/path parameter or range read exists. Proposals are explicitly review-only and executeAvailable=false, without an acceptance control. A displayed value cannot prove a raw-value no-op, so identical display/formula input is conservatively rejected.

The engine's selection-read epoch previously counted only open/set/undo/redo/close. It now also invalidates reads for setValues/clear/format/resize/editLines/freeze/sort/editSheet. Subscriber failures cannot strand pending state. The Sheets DocumentRegistry binding now carries the selection revision when provided; missing native revision is not filled from UI guesses.

## Why no execute yet

`SheetsEngine.set` returns unknown. `sheets-craft/src/lib.rs` delegates cell.set to the engine session; canUndo booleans and comments do not prove actual history delta, no-op behavior or pinned revision acceptance. The current worker protocol has no atomic expected-revision guard plus history/readback receipt. A JS check before posting cannot close a queued-worker race. Executing via the generic UI controller would retarget to current selection and violate the contract.

Next native builder work: guarded cell commit in the history owner, immutable workbook/sheet/cell identity and expected revision checked inside the worker, logical applied1/no-op0/precommit-failure0 history receipts, readback and newest-origin undo guard, Rust/WASM tests in CI. Only then wire the port to reviewed TransactionManager acceptance. Do not promote readiness based on a synthetic host test.

Verified locally: typed host tests cover target rejection, UTF-8 bounds, cancelled/no-op staging, asynchronous revision/identity/cell/epoch races; real JS engine with fake worker tests cover all mutator epochs; existing live-selection read/cancel tests are preserved. Light/Dark synthetic fixture inspected. No native/WASM/model/cloud/write/save claim. No deps, $0.
