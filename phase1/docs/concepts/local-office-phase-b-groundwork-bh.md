# Office local AI Phase B groundwork (BH)

Design only. No local-search changes while integration/CI is pending. No new
provider call, dependency, selected-text disclosure, write adapter or permission.
Recommended first thin outcome: Documents single-paragraph selected-text summary
as a copyable reviewed draft, followed by selected-text rewrite only after the
session exposes a trustworthy atomic accept path. Sheets remains read-only.

## Source-grounded gap

AH/AM provide bounded text prompts and frozen identity/revision/selection review
DTOs, not executable adapters. `studioWorkspace.ts` exposes whole Documents block
metadata and selected Sheets cell metadata with `adapter:null`. Those catalogs are
not an explicit selected-text capture, and Sheets metadata includes formula text:
do not reuse either serialization as a local Office prompt.

Documents has real one-paragraph caret `{block,anchor,head}` in UTF-8 byte offsets,
`selectedText()`, `rev`, editable blocks, `diffEdit`/inverse UndoStack and worker
replace RPC. Host `session.ts` queues editing in `chain`; `editParagraph` edits a
whole paragraph, `typeText` silently converts newlines to spaces. Neither is a
reviewed selected-span accept API. AM checks in UI then an asynchronous queue are
not atomic. No claim that shared Agent DocumentCore transaction machinery owns this
separate Documents WASM session today.

## Proposed first summary slice, no edit adapter

- Capture only nonempty current caret selection in one editable paragraph, with
  exact UTF-8 boundary checks via existing text converters. No full block/deck,
  neighboring paragraph, history, hidden/table text, image/OOXML or custom tools.
- Bind capture to host-issued document/session generation, media identity, rev,
  block and exact anchor/head. Display document name/destination and source extent.
  Name or resettable rev alone is insufficient across reopen/engine replacement.
- Use AM/AH summarize-selection with existing byte/output caps and explicit source
  review. Fresh verified-local chosen task/model/privacy path; no cloud fallback,
  tool invocation, silent auto-generation or default download. Selected secrets
  remain possible, so no "sanitized" claim.
- Return bounded plain text, render literal draft, no applied/saved badge, no Undo
  transaction. Discard late output on owner/selection/source/model drift or cancel.
  Copy is a user action; no application write or automatic save.
- Keep request/output provenance and safe failure status separate from source/model
  quality. No new dependencies appear necessary, but integration must check actual
  provider/host APIs before committing to this design.

## Rewrite follow-up: narrow session-owned accept

A later Documents session command must check frozen document generation/engine,
revision, selection bytes and exact before text *inside* its queued turn, then own
acceptance lock through worker completion/refresh. Selection pointer commands and
engine attach/close can occur independently of the edit queue today: both need
owner generation checks and defined cancellation/serialization, not an inferred
lease. A worker response from a replaced engine must never refresh the new doc.

Only the reviewed plain replacement goes to one UTF-8 hunk in captured paragraph;
model cannot choose block/offset. Reject newline/unsupported character output with
review feedback, never silently space-replace via `typeText`. Successful accept is
one non-typing-merged undo step, no automatic file save/export. Engine replace,
pagination, blocks-refresh and Undo recording failures need an explicit rollback
or blocked/recoverable state; current apply flow isn't proof of all-or-nothing
failure across these awaits. Preserve surrounding runs/formatting with fixture
round-trip/render tests, not string-only success. Don't register adapter until
revision-safe accept/undo/failure evidence exists.

## Sheets later, summary only

Current selected-cell binding has no monotonic workbook revision in Agent metadata.
Do not fabricate AM revision or infer a selected range from active cell. Builder
must supply explicit displayed-cell selection, workbook/session identity/revision,
ordered addresses, visible-only text, limits and drift handling. Formula strings,
hidden sheet/cell text and calculation are excluded. Summary creates no cell
writes; no formula execution or rewrite-to-formula interpretation.

## Delivery gates

1. Builder-owned capture API with genuine session generation/revision and exact
   selected bytes, zero defaults, no unrelated reads; tests for close/reopen/same
   name, moved caret, noneditable block and UTF-8 boundary errors.
2. Summary review UI + verified local provider, bounded cancellation/generation,
   all locales/keyboard/light-dark narrow, source injection inert. No apply.
3. Selected-span accept command only after atomic owner/queue/worker drift gates,
   late-engine/refresh failure, exact undo/redo and formatting tests. Native/WASM
   and full packaged Documents acceptance in CI only, no local build shortcut.

Roadmap-Delta: selected Documents summary is the next proposed Office slice; native
rewrite transaction safety and Sheets range/revision are explicit prerequisites.
No implementation, permission or release-readiness claim. Sources inspected:
`agent/officeLocalPrompt.ts`, `officeReviewContract.ts`, `studioWorkspace.ts`,
`documents/{session,edit,core,text,store,protocol}.ts`, `sheets/{session,protocol}.ts`
and AH/AM roadmap notes. No tests rerun for this prose-only design.
