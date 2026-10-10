# Agent task engine (Agent Board part 1/2)

Code: `src/lib/agentTask/`. Pure TypeScript, no UI, no git or network side effects. Implements R5-C1, C2, C4, C5, C6, C7 and the R3 attribution footer.

## Records (R5-C1, `schemaVersion: 1`)
- `TaskRecord`: taskId, repoId, worktreeId (null = sequential), branch `somnia/task/<id>`, baseSha, headSha, workspaceGeneration, allowedRoots, producer, budget, status, gates, verification, review, checkpoints, requests, outcome, preserve, cost.
- `SessionRecord`: intent, plan, toolCallLogRef, userOverrides, verification, diffSummary, cost, notes.
- Storage is private app storage (`<appData>/agent-sessions/<repoId>/<taskId>/{task,session}.json`), never in the repo (D6). `assertPrivateLocation` refuses a root inside the working tree unless git-excluded. The redacted export is a separate artifact.

## Status and exit codes
`queued -> preparing -> running <-> waiting-input -> review -> done`; `failed` and `cancelled` are terminal. Retry creates a new task.
Exit codes: 0 done, 1 failed/cancelled, 2 waiting-input/review or a needs-input error (review-required, unsaved-buffer, stale-plan, identity, auth, sso, uncertain-outcome, dirty, diverged).

## Gate ladder
Prepare, Run, Review edits, Save, Commit, Review publication, Push, Review PR, Create PR.
- L0 (default): all manual. Commit needs an approved review bound to the current treeSha + contentHash.
- L1 (per-task flag `autoLocal`, default off): prepare/run/save/commit chain unattended. Commits are recorded as `unreviewed-checkpoint`.
- L2 (publication, push, PR): never automatic, never enabled by L1 or `--yes`. Push needs an explicit per-action approval and an approved review of the exact outgoing content. An agent-initiated network write additionally needs `gates.networkGrant`.
- `--yes` covers the local commit only. `--headless` turns any pending review into a `review-required` error.
- Agent or CLI actions on tree gates are blocked while unsaved buffers exist (`unsaved-buffer`).

## Safety
- Verification and review are invalid as soon as treeSha or contentHash differ (`noteWorkspaceChange`).
- `runOnce(taskId, requestId, op, fn)`: idempotent per request id. An unresolved network op is `uncertain`; the task is preserved until `reconcile` after checking the remote.
- Watchdog (`stallMs`, `maxWallMs`) and cost meter (tokens, USD; warn at 80%, fail at 100%).

## Attribution (R3, D2)
Setting `attribution.commit` = off (default) | on | custom. The footer (`Co-authored-by`, optional `X-Somnia-Session`) is built by `buildFooter` outside model control: protected trailers in model text are stripped; the human stays author and committer; no identity is ever invented (missing identity gives `identity`, needs input). The commit request type has no author, committer, signing or hook fields. `verifyCommitResult` checks the real commit object.

## Board facade
`BoardFacade` (`board.ts`) is a structural facade for a Board UI: frozen snapshot with `getSnapshot`/`subscribe`, `guard`, `cancel`, `retry`, `review` (checked against live content), `prepareExport`, `saveExport` (only after the user confirms the shown hash).
