# Vibe run quality phase H

Per-run summary reads only native review data: summary text, exact file paths, passed/failed/not-run or unknown check counts. Proposed files are not labeled applied. A missing review is explicitly unknown, not evidence that no work was needed or that checks passed. Native currently may stop returning review details after Apply; in that case the summary cannot reconstruct the applied file list and does not invent one.

Retry with feedback is explicit. For a failed/crashed/stopped source with no pending review, it creates a fresh successor Studio and fresh run from the current project baseline, preserving exact model and space scope. Original partial output, tools, consents and isolated edits are not copied/replayed. Feedback is bounded and secret-shaped input is rejected by storage. Successor creation plus source audit are one transaction, keyed by request UUID. Repeating the same request returns the same successor; mismatched feedback conflicts. Start retains its existing idempotency and isolation/checkpoint gates. New permission and review decisions still apply. Provider cost notice is visible. A transport failure is not permission to auto replay.

Board history filters use recorded status, exact provider/model/locality and local-calendar inclusive date bounds against recorded start time. Missing dates do not match a date filter. Totals, active-work counts, usage totals and schedules stay unfiltered so filtering cannot imply active work disappeared. Drafts without runs are hidden while a filter is active. Reset restores the board projection. No data deletion or background query.

## Roadmap-Delta

Added run summary, explicit native-idempotent feedback successors and board history filters. No dependencies, auto pull, provider switch or automatic Apply. Existing default-off streaming flag stays off. Native feedback storage/core tests are CI-only; no cargo/WASM compiled locally. Real daemon, native retry/idempotency/device E2E remain release gates.
