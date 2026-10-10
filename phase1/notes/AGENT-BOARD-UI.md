# Agent Board UI

Base: 7dc7b652ece9ab62629078a887c915ff3c700b79, branch gh/agent-board-ui.

## Wiring

- Entry: CommunicationPanel > Agent Board opens AgentBoardHost.
- Engine: call installEngineBoardPort(facade, loader) from the task host. The host must refresh the facade on lifecycle and workspace events. The returned function unregisters it.
- Loader: load(request) returns the immutable task worktree ChangeSet, its exact binding, and readCurrent against that task's base text. Never use the active editor checkout. guards(taskId) reports unsaved buffers and pending AI review leases for that workspace.
- Without this installation, Board honestly shows engine-unavailable. No mock engine in production.
- Snapshot engine-to-UI mapping is in engineAdapter.ts. No remote tools, credential access or push.

## Review

Existing AgentReview performs hunk decisions, now with optional review-only submit copy. The adapter records approved only for all accepted hunks and a complete plan matching every result byte. Partial/rejected hunks record changes-requested; they do not mutate either checkout and do not unlock Combine. Content hash, tree SHA, generation and result HEAD are checked before load, after async load and before confirmation. Changed evidence is visibly stale and the open review closes its apply surface. Backend validation remains mandatory.

Combine uses existing VariantsTab preview/start/conflict/finish/abort. The handoff pins a branch and rechecks task evidence before starting. Existing Combine also pins the branch tip and uses disk/editor guards. Once Combine starts, the conflict session owns completion and recovery; a post-merge HEAD change must not invalidate the existing resolver.

## Private export

Conservative v1 exports omit all free text (intent, plan, notes, model), commands and local paths even after engine redaction. Selected machine facts, numeric cost, diff counts, SHAs and review hash remain. The exact JSON shown is the exact SessionExport passed to BoardFacade.saveExport, with hash confirmation. No hosted link, git add, attachment or public share. writeExport must save privately; a repo-local destination requires a separate reviewed destination policy.

## Tests

- npm run test:board: 15/15.
- AgentBoard + variants + hunk + S9 task-engine: 109/109 via tsx --test.
- Playwright fixture: 16/16, including 5 locales x light/dark, mobile, stale review, dirty guard, action flow and export confirmation.
- tsc: only pre-existing missing slides-engine/pkg/somnia_slides.js.
- Full test:core tried twice; process exceeded execution window without summary. No whole-suite green claim.
- Actual pixels inspected for light/dark, locale matrix, review, export, stale review and mobile.

## Remaining integration gates

This patch depends on S9's agentTask files (not duplicated here). The desktop runtime still needs a real task host, worktree diff loader, guard source, private persistence writer and lifecycle refresh. Windows/native worktree/Combine behavior is not validated by the browser fixtures. Hunk controls used by the Board are localized through Board-owned keys. No claim of end-to-end desktop engine integration until those hosts land.
