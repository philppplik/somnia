# Documents selection settle barrier (BJ)

Read-only capture refuses pending owned queued work, disposed engine or edit error.
settleDocumentSelection awaits captured queue then refuses new work/owner generation
change before fresh capture. Edits that clear caret require fresh explicit selection,
not a manufactured selection for the old source. No inference/UI/apply adapter.

Queue skips old-owner not-yet-started commands and suppresses old error/finally
bookkeeping on new owner. Replacement and blocks refresh check actual engine/
generation after awaits before new-state mutation. Owner replacement mid-replace
never refreshes old text into new document. This is not a complete atomic accept
lease: structural/snapshot/geometry paths and rollback after mutation remain BH
prerequisites. Barrier may wait until existing worker timeout; no new polling.

3 new deferred-edit/new-queue/owner-close/replacement tests plus existing selection/
Documents panel/command/export/component checks pass (18 total). First new test
exposed that editParagraph clears selection: corrected expectation is refusal then
fresh reselect, not retaining old caret. Existing tests untouched. Unfiltered tsc
only inherited generated Slides missing; DS/Commands/Inventory/Layers pass with
inherited compiler/87ignored/4stale warnings. No native/WASM/full E2E, inference,
new dependencies or spend. Nonvisual plumbing, no screenshot.

Roadmap-Delta: trustworthy queued capture barrier and replacement/refresh owner
guards; reviewed summary/provider integration and complete accept lease remain open.
