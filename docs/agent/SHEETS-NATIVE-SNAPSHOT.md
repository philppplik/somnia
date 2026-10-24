# Sheets native snapshot adapter

Use `nativeSheetsSnapshot(engine,current)` as SheetsCellHost.snapshot. `current` must return the actual session engine and approved target, with workerEpoch = engine.selectionReadEpoch. It does not discover sessions from model text. Read brackets bounded one-cell view with nativeState, preserving exact typed old value/formula and token privately. Reuses live selection hidden/merged/epoch checks; token/revision drift refuses the read. Cancellation discards results, never disposes the shared worker.

Host acceptance now requires proposal.before.native to match fresh token/value/formula, not merely formatted display. A fresh token after user review is not fresh authority. Proposal payload is copied before asynchronous acceptance so input cannot be replaced during snapshot. Existing successful apply tests strengthened to retain the reviewed token. Missing native metadata remains review-only.

48 targeted JS tests pass plus one browser test covering Light/Dark accept/reject. Screenshot inspected: readable exact B2 5-to-6 preview, explicit synthetic owner/local-only, no saved claim. Browser receipt is synthetic, not WASM history proof. No new deps/cloud/automatic apply. Rust/WASM/desktop verification remains CI-only.

Current fetched379dd064c still does not install createSheetsCellPort in panelBridge (Sheets adapter is null and uses read-only registry). This patch provides the native snapshot adapter and hardens owner apply; it does NOT claim live sidepanel execution is connected. Installing the port, one-use review capabilities, exact undo receipts and native UI transactions must be coordinated before enabling Sheets apply in the live panel.
