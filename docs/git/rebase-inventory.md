# gh-wave rebase inventory

Status: read-only audit and integration plan. Snapshot: 11 October 2026.

## Baselines and method

- Shipped source baseline: `somnia-12.1.0` at `9bde598`.
- Previous integration tip: `3b54ce3`.
- Audited integration tip: `int/gh-wave` at `c012328638d8fbbdf5d41328f8a6d8e9bc13c905`.
- Merge parents: `3b54ce3` and `9bde598`; common ancestor `3859670`.
- Compared topic ancestry, wave-only commits, both merge-parent trees, native command registration, capability allowlists, renderer callers, host seams and focused documentation. A commit in history is not evidence that its runtime wiring survived.
- Audit ran in a separate detached clone. No source changes, commits, pushes, network writes or shared-branch mutations were made. No application, native or E2E suite was run for this inventory.
- `node scripts/errors/gen-commands.mjs --check` passed on the audited tree. That check does not detect orphaned capability entries or missing runtime features that disappeared from both the handlers and generated manifest.

CI evidence: [run 38121687160](https://github.com/philppplik/somnia/actions/runs/38121687160) targets `c012328`. Its live state was initially `in_progress`; the final check at 09:37 CEST returned `completed` / `cancelled`. The base CI gate is therefore not satisfied. This document is not a green-CI claim or release acceptance.

## Summary

The wave is largely preserved as source, but is not fully integrated into the desktop runtime. Relative to `9bde598`, the merge contains 208 changed files, 23,733 insertions and 90 deletions. The original wave changed 223 paths from the common ancestor; 20 paths overlap the shipped changes. The resulting merge changes 30 wave-touched paths compared with the old integration parent.

Three baseline repairs come before feature completion:

1. Restore the 12.1.0 release stamp and `check:commands` script lost in the `package.json` resolution.
2. Restore the native immutable-ref handlers and watcher runtime lost from `desktop.rs`, without replacing the new intake/diagnostics bootstrap.
3. Remove or replace the dead router UI test entry and correct router documentation that describes the removed chooser and old startup API as current.

Packages 2-5 are mostly integration work over preserved libraries. Package 3's SSH/GCM routes are a real scope extension beyond the existing GitHub-HTTPS-only transport. The optional file-open chooser is a separate product decision and forward-port, not a reason to restore the old intake implementation.

## Feature inventory

Legend:

- **Shipped**: available in the `9bde598` source baseline.
- **Preserved**: wave source survives in `c012328`, not a claim of packaged runtime readiness.
- **Lost seam**: implementation remains but required host wiring was removed by the merge.
- **Host pending**: topic intentionally left integration to a later package.

All fourteen topic families below were absent as topic ancestry from the shipped baseline. Existing local Git UI and Smart Open foundations must not be mistaken for those complete wave features.

| Topic / evidence | Shipped 12.1.0 | Audited merge | Work still required |
|---|---|---|---|
| `gh/gitjob-engine`: `c8a475e`, follow-up `22b0fca` | Local Git commands exist, not this shared job engine | **Preserved**: `git/{command,context,jobs}.rs`; cancellable jobs, repository context, scoped locks, unknown-editor-state guard | Desktop/CLI authoritative workspace-state exchange remains host work. Legacy mutations still use their legacy execution path; do not claim all commands are migrated to GitJobs. Restore the lost read runner below. |
| `gh/diff-refs-safety`: `9f73eb1` | Local history/recovery exists; no immutable-ref command seam | **Lost seam**: `ref_reads.rs`, `ref_contract.rs`, `invalidation.rs` and frontend contracts survive. Four desktop handlers and watcher loop do not | Restore `git_diff_refs`, `git_safety_list`, `git_ref_tree`, `git_read_blob`, the lazy read runner, command registration and `somnia://git-invalidated` emission. Permissions already survive. |
| Ref-level TS foundation: `947bcad` | History controller and restore/recovery foundations already shipped | **Preserved**: `src/lib/git/refs/{contract,explain,snapshot,safety}.ts`, attribution footer hook and tests | Ref consumers need the native seam restored. Footer helper is not called by the current commit controller. Package 2 owns integration; package 5 changes policy. |
| `gh/credential-bridge`: `289ff95`; related duplicate `edd2b6c` | GitHub account/keyring support exists, not this operation lease bridge | **Preserved / host pending**: `git_credential/*`, helper binary source, `StoreTokenSource`, tests | Package 3 must bind the selected account's native store, resolve/package the helper, and manage operation-scoped leases. No token in renderer models. SSH is explicitly rejected by this bridge. Do not replay both equivalent bridge commits. |
| `gh/publish-review-ui`: `d52bdb0` | Local versions/history/variants, no publication UI | **Preserved / host pending**: review UI, target/plan/outcome types, single-use confirmation controller, five-locale keys. Publish slot is already wired in `VersionsHost` | Native `git_push_plan`, `git_push_apply`, `git_fetch` are absent. Package 3 supplies the service mapping; package 4 completes real-host UI wiring, buffers/grants/outcomes and acceptance. |
| `gh/explain-compare`: `e47a9c3` | Existing file comparison/history UI, not the wave's ref-level Explain/Compare/Safety browser | **Preserved**, but desktop ref operations are blocked by the **lost seam** | Restore native refs first. Validate immutable SHA/tree/blob binding, watcher refresh and stale evidence clearing in real desktop calls, not only harnesses. |
| `gh/worktree-core`: `63b98ee` | No linked-worktree lifecycle service | **Preserved / host pending**: `git/worktrees.rs`, tests, `docs/git/WORKTREES.md`; shared common-dir locks also added to legacy mutations | No desktop worktree commands or UI were included by this topic. Authenticated source/target workspace guards, trust registration and lifecycle host remain separate work. |
| `gh/worktree-isolation`: `7b3012e` | No task write-lease/owner sync layer | **Preserved / host pending**: `src/lib/git/worktree/*`, owner/buffer leases, process identity, recovery primitives | Integrate into real task/workspace hosts before claiming safe parallel execution. File editing leases and shared repository mutation locks are different safeguards. |
| `gh/remote-endpoints`: `0550d39`, `9687732`, `220cc32`, docs `7f842ce` | No clone/fetch/pull/push semantic service | **Preserved / host pending**: `git/remote.rs`, `remote/{net,pull,push,bridge,tests}.rs` | Package 3 covers publication plan/apply/fetch, exact content and reconciliation. Repository picker, clone, pull, general cancel host/UI are not included in packages 2-5. Existing transport only supports GitHub HTTPS in production. |
| `gh/task-engine`: `e631672` | Agent/provider features exist, not this task/session gate engine | **Preserved / host pending**: `src/lib/agentTask/*`, records, gate ladder, cost/watchdog, attribution, Board facade | Pure TS has no Git/network side effects. Private persistence, task runtime, authoritative workspace state and real operations still need a host. Publication grants must be checked natively, not inferred from a task card. |
| `gh/agent-board-ui`: `0f1f401` | No wave Board UI | **Preserved / host pending**: CommunicationPanel entry, Board host, exact-content review/export adapter | `installEngineBoardPort` has no production caller. Without a real facade, worktree diff loader, guards, lifecycle refresh and private writer the Board correctly reports engine unavailable. Packages 2-5 do not complete that host. |
| `gh/cli-headless`: `caf8603` | No wave CLI crate | **Preserved**: `phase1/cli`, same-user Unix socket IPC, run/attach/status/cancel, local-only Git allowlist | Desktop `.somnia/gui-state.json` bridge is documented as assumed. Windows named pipe is a typed-error stub. Default engine path/integration, private-storage policy and packaging need acceptance. No remote authority comes from `--yes`. |
| `gh/cli-tui`: integrated `4a58c0f`, `604e7f0` | No TUI crate or adapter | **Preserved**: ratatui crate, protocol-v1 NDJSON adapter, hash-bound hunk decisions, screenshots/tests | Current topic tip `7818cc1` is not an ancestor, but CLI/TUI implementation matches the integrated tree. Only `cli/tests/headless.rs` differs because integration already has the bounded retry fix `3b54ce3`. No duplicate re-land. Cost/tool/model mapping remains limited by the engine contract. |
| `ext/asset-pipeline`: `70b04b9` | Extension/catalog host exists, not this converter | **Preserved / host pending**: converter crate, asset schema/presentation helpers, isolated workflow | No production callers import these asset helpers. Sandbox supervisor, trusted raster transport/cache transaction and host presentation remain pending. Executable alone is not a sandbox. ICC rejection is a documented compliance limit. |
| `feat/file-open-router`: `166a8e0`, `af72478` | New intake queue/grants and #166 approve/revalidate/ordinal Smart Open contract already shipped | **Diverged intentionally**: resolver byte probes and renamed Office media preparation survive; old startup queue/chooser removed | Optional chooser needs a new package on the #166 coordinator. Do not restore `startup_file.rs`, `open_startup_file` or the old renderer startup loop. See decision below. |

### Branch and commit reconciliation

All current topic tips except `gh/cli-tui` are ancestors of `c012328`. Their ancestry alone does not prove live functionality. `gh/cli-tui` carries rewritten equivalents `0779f15`, `50f6156`, `7818cc1`; the integrated versions are `caf8603`, `4a58c0f`, `604e7f0`. Source comparison is the reason not to re-land them.

The integration-only CI additions are preserved:

- `f7f266c`: native CI now runs the standalone CLI and TUI crate tests.
- `3b54ce3`: bounded cancel-after-detach test retries rather than racing the listener.
- Extension-assets workflow survives, but its push trigger only names `ext/asset-pipeline`. An `int/gh-wave` push does not itself establish that isolated asset gate ran; check relevant PR/run coverage.

## Shipped architecture that must remain authoritative

The merge adds the 12.1.0 intake and diagnostics stack to the older wave. Preserve:

- Bounded native open queue and one-shot grants; cold/second-instance argv parsing and single-instance glue.
- Native/frontend `drain -> claim -> read_by_grant -> ack` lifecycle, retry expiry, folder-overlap guards and live project access.
- #166 `prepare -> approve -> revalidate -> commit` semantics, document identity, supplied ordinal accounting, dirty-document guards and single-focus batch behavior.
- Diagnostics startup gate before intake, crash review, incident retention/export and Problems aggregation.
- Typed command infrastructure (`invokeCmd`, Rust `cmd`/`cmd_async`, generated command/error registry). Existing Git commands are still recorded as unwrapped legacy commands, so migration must be explicit rather than assumed.
- CSP-safe precompiled extension schema, install consent/security changes, Accent Palettes and current catalog additions.
- Declarative fail-closed MCP argument-schema checks.

The history modules under `phase1/src/lib/git/history/` are unchanged from `9bde598`; package 2 wires existing history into the new reviewed commit flow rather than re-landing them.

## Baseline repairs before packages 2-5

### B0: package metadata and command-gate script

Evidence: `git diff 9bde598 c012328 -- phase1/package.json`.

- `somniaRelease` regressed from `12.1.0` to `11.3.0-rc.1`.
- Shipped `check:commands` was removed. Generator source and command manifest survive, and a direct `node scripts/errors/gen-commands.mjs --check` currently passes.
- Keep the merged test scopes for refs, worktrees, attribution, tasks, Board and intake while repairing those fields. Do not replace the entire manifest with either parent.
- Retain release-tool conventions: package `version` and Tauri's generic `0.1.0` are not evidence that `somniaRelease` should also stay old.

### B1: native ref seam and watcher restoration

Evidence: compare `3b54ce3:phase1/src-tauri/src/desktop.rs` with `c012328`.

Removed runtime pieces:

- `GIT_READ_RUNNER`, `git_read_runner`, `git_read_context`.
- Four Tauri command functions and their `generate_handler!` entries.
- Per-project `GitStatusWatcher` lifecycle and `somnia://git-invalidated` event loop.

Preserved pieces:

- Native ref semantics, job/context engine, watcher library, immutable object parsers and safety metadata.
- `build.rs` entries and editor capability permissions for all four commands.
- `VersionsHost` ref backend and Explain/Compare/Safety UI, invalidation subscription/hooks.

Consequence: the frontend advertises/refers to ref operations which the current desktop cannot dispatch, and automatic refresh has no runtime event producer. Native library tests and mock UI fixtures cannot prove this seam works.

Preferred ownership: a narrow restoration patch before packages 2/3, coordinated by the integrator because package 3 also touches `desktop.rs`. Alternatively explicitly expand package 2 to cover it. Forward-port only the read runner/handlers/watcher pieces; keep the new intake and diagnostics lifecycle. Do not overwrite `desktop.rs` with the old wave file. Regenerate command metadata after registration and test actual dispatch plus invalidation.

### B2: orphaned router artifacts and documentation

- Deleted: `OpenStudioDialog.tsx`, `openChoice.ts`, their tests, `nativeOpen.test.ts`, router dialog fixture HTML/TSX and `router-dialog.spec.ts`.
- Preserved: `test:router-ui` npm script and `playwright.router.config.ts`, whose `testMatch` points to that deleted spec. It cannot validate the current tree.
- `docs/studios/file-open-router.md` still describes the removed chooser/old native startup delivery and historic validation as the current implementation. Keep historical results labeled as historical; replace current architecture sections or point them to #166/intake docs.
- `read_open_bytes` still has a `Project` method and permission/build entries, but no desktop handler or current renderer caller. New native intake uses `read_by_grant`. Prefer deleting/marking this obsolete seam unless a new forward-port proves a separate legitimate caller; do not revive it as a shortcut around grants.
- `docs/git/ref-read-foundations.md` describes registered ref commands and watcher wiring that this snapshot lost. Update after B1 or label the gap until restored.

## Package integration order

This is an integration order, not a requirement to serialize independent development. All builders should rebase onto the integrator's agreed corrected tip after `c012328` CI is green. Do not rebase the shared integration branch destructively or merge whole old topic trees again.

```text
c012328 CI gate
  -> B0 metadata/script repair + B1 native refs/watcher + B2 dead-test/docs cleanup
  -> package 5 attribution policy
  -> package 2 reviewed local commit flow -----+
  -> package 3 native publication ------------+-> package 4 real publication UI
                                               -> combined desktop/platform gates

optional router chooser: separate decision and forward-port on corrected intake baseline
```

### Package 5: co-author trailer policy first

Scope: `src/lib/git/attribution/footer.ts` and `footer.test.ts` only, per the package assignment.

- Exact app-commit identity: `Co-authored-by: somnia-agent <340778888+somnia-agent@users.noreply.github.com>`.
- Current default is disabled, `Somnia Agent`, empty email. Current helper also requires `substantive`; changing `enabled` alone does not cover every app-generated commit.
- Package 2 must supply an explicit app-generated commit context rather than treating a default-on policy as authority to alter development/human commits. Keep the distinction between model-drafted text and accepted content/origin explicit.
- Reserved model-written trailers must be stripped before review. Current helper strips reserved lines in the final paragraph; test the intended reserved namespace and non-final/malformed placement so model text cannot choose the attribution.
- Separate attribution engines still exist in `agentTask/attribution.ts` (default off) and CLI `runner.rs` (opt-in, environment-supplied identity). The small package does not reconcile these routes. Track that as follow-up, not a silent widening of package 5.
- Merge policy/tests before package 2's final review assertions to avoid showing one footer and sending another.

### Package 2: reviewed local commit flow

Scope: ChangesTab/controller and history/refs/footer integration; no remote work.

Current controller directly sends selected paths, subject, body and status token to `backend.commit`. It never calls `finalizeCommitMessage` and has no separate exact-footer review surface.

Required acceptance:

- Review the final subject/body/footer verbatim before `git_commit`.
- Bind review to the actual selected content/status; content, selection or message changes revoke it.
- Use package 5's app-commit policy only in the intended route. Human/development commits remain unaffected.
- Preserve identity, signing, hooks, selected-path subtree limits and local safety behavior.
- Restore B1 first or own it explicitly; a TS refs adapter alone cannot enable the native ref service.
- Focused history/refs/attribution tests plus the real commit-flow E2E. `history/*.test.ts` is not a new wave module and should be selected explicitly when running its focused suite.

### Package 3: native publication and transport

Can develop alongside package 2 after the service contracts are frozen. Integrate before package 4.

The actual documents are `phase1/docs/git/PUBLICATION-REVIEW.md` and `phase1/docs/git/REMOTE-ENDPOINTS.md`; the source comment's `docs/git/PUBLICATION-REVIEW.md` shorthand is relative to `phase1`, not a root document currently present.

Required acceptance:

- Implement/register `git_push_plan`, `git_push_apply`, `git_fetch`; update command manifest and permissions as appropriate.
- Map native `PushOutcome` variants explicitly to renderer `PublicationOutcome`, including stale/denied/uncertain. A cast is not a schema adapter.
- Retain approved plans in trusted native state. Renderer apply only supplies `planId`, `contentHash`, `confirmed:true`; native must recover and revalidate original target, account, exact local content and observed remote tip.
- Resolve live account identity/visibility, effective URL including pushurl/rewrites, branch, scopes, workspace buffers and agent grant server-side. No credentials in returned plans, raw errors or renderer arguments.
- `fetch` must reconcile any uncertain original destination before allowing another plan. Successful fetch initiation is not successful reconciliation.
- Share the job/guard/lock infrastructure; preserve unknown-state fail-closed behavior and non-force explicit refspecs. Network work must not hold the file-service mutex throughout execution.
- Existing production library/bridge accepts GitHub HTTPS only. SSH and GCM require explicit native routes and validation. Never use either as a fallback when the chosen route fails; unsupported routes stay blocked until genuinely implemented and tested.
- Keyring account infrastructure exists, but selected-account bridge/helper lifecycle and packaged helper availability are not yet wired.
- Real disposable private-repository gates and Windows/macOS transport/runtime checks remain open. Library loopback tests are not those gates.

Out of the assigned package: clone/pull/repo picker and full task/Board/worktree host wiring, unless separately assigned.

### Package 4: publication UI last

May build against frozen package 2/3 contracts in parallel; integrate only after both land.

Already present: Publish slot, plan dialog, per-action checkbox, grant label, agent dirty-buffer block, state/outcome strings and uncertain-refetch logic. The work is real-host completion and strengthening, not creating all of this from scratch.

Required acceptance:

- Use the native mapping without credential-bearing view models or guessed account defaults.
- Preserve `publication.unsavedBlock`, agent grant display and fail-closed apply guards. Existing human policy warns on dirty buffers; if the assigned package intends to block humans too, align native/UI policy explicitly rather than silently changing it.
- Commit and workspace changes invalidate review; stale plans cannot apply. Denied outcomes require fresh review; uncertain outcomes reconcile their original remote, never a newly selected destination.
- Published means verified remote read-back, not local Versioned status or cached ahead/behind. In Review remains unclaimed without a real PR integration.
- Validate light/dark, five locales, long URLs/branches, mobile overflow, dirty-buffer changes and all service outcomes. Mock harness coverage supplements actual desktop dispatch, not replaces it.

## Optional package: file-open chooser forward-port

The parent requested evaluation of the removed file-open router dialog. This is the Studio chooser, not the unrelated OpenRouter AI provider/key connection.

### Current behavior

`openResolver.ts` still emits `choose-handler` for mismatch/ties and `safe-text-offer` for unknown verified text. The #166 coordinator reports those outcomes without preparing/committing them; native intake maps both to deferred. There is no installed selection callback or chooser UI. Supported unambiguous documents still use the newer approve/revalidate coordinator.

### Option A: keep the 12.1.0 behavior for this integration

- Do not re-land the chooser now.
- Keep ambiguous/unknown text deferred and unsupported binary unopened.
- Explain the limitation in current docs and notices; remove the dead test entry or replace it with a test of the actual deferred outcome.
- Best fit for a bounded Git integration, but it does not complete the chooser UX proposed in [issue #166](https://github.com/philppplik/somnia/issues/166).

### Option B: add a separate chooser package

Recommended if file-open ambiguity is part of the intended release acceptance. Forward-port presentation and selection semantics only, on the current coordinator/native grants.

- Show only live compatible handlers; native OS opens have no guessed Studio, targeted asset imports retain their import intent.
- Unknown safe text requires explicit Code acceptance; mismatched supported bytes require explicit compatible choice. Unsupported binary never becomes selectable text.
- Resolve selection before preparing a fresh open plan. The selected target enters resolver options; it does not bypass batch approval, affected-document dirty guards or revalidation.
- Preserve requestId, ordinal, identityToken, grant lifetime/release, reset and retry semantics. Cancel/stale/newer requests leave every existing session intact.
- Do not return an old choice as approval for new bytes. Recheck handler readiness, bytes/content and revision tokens after an asynchronous dialog.
- Restore fresh browser/native tests on the new seams: all locales, Escape/close, overlap/supersession, mixed batch focus, renamed/mismatched content, invalid binary, native Code save-in-place and grant cleanup.
- Keep unsupported-file failure/status presentation separate from a compatibility picker when no safe handler exists.

Do not cherry-pick `166a8e0` wholesale: it carries the superseded startup queue and file-adapter routing. Neither option authorizes reverting #166's safety architecture. The product choice is still open.

## Deferred work not solved by packages 2-5

- Authenticated desktop/CLI workspace-state exchange and real task engine host.
- Worktree lifecycle commands, target guards/trust and task write-lease wiring.
- Board engine port, exact task-worktree loader, private persistence/export writer and lifecycle refresh.
- Remote repository discovery/clone/pull/cancel UI beyond the publication slice.
- CLI Windows IPC, packaging and live sidecar integration; TUI cost/tool/model event completeness.
- Sandboxed extension-assets supervisor, trusted transport/cache transaction, actual host chrome and ICC policy acceptance.
- Cross-route attribution consistency for agentTask and CLI, without changing human/dev commits.
- Optional Studio chooser and [file association issue #164](https://github.com/philppplik/somnia/issues/164), which remains a packaging concern, not proof of routing capability.

## Integration checklist

1. Verify the agreed integration head and green base CI; preserve both parent SHAs in review notes.
2. Apply B0/B1/B2 with small reviewed diffs. Inspect `desktop.rs` runtime handler list separately from permissions and generated manifest.
3. Merge package 5, then package 2 and package 3; coordinate shared `desktop.rs`/native registration edits.
4. Rebase package 4 onto their actual integrated contracts and exercise real command dispatch.
5. Run focused TS suites for history/refs/attribution/publication/worktree/task/Board as relevant, native no-default-features tests, standalone CLI/TUI tests and isolated asset tests. Label fixtures/mock ports as such.
6. Run the full frontend build after generating the required WASM packages. Do not introduce production stubs to turn a missing build artifact into a false green.
7. Exercise packaged desktop ref reads/invalidation, commit message object, credentials/helper, each supported auth route and remote reconciliation. Inspect actual UI pixels for review dialogs and locale layouts.
8. Confirm no automatic network publication, no force push, no renderer credential fields, no lost dirty-work guards, and no human/development co-author trailer.
9. Resolve the chooser decision separately; correct docs and test entrypoints regardless of the choice.

## Evidence index

Git object evidence is pinned to `c012328`, `3b54ce3`, `9bde598` and topic commits listed above. Paths below are repository paths, not claims of hosted documents.

- Merge/feature history: `git log --first-parent c012328^1`, `git log --no-merges 3859670..c012328^1`, topic ancestry checks, per-path diffs against both parents.
- Runtime seams: `phase1/src-tauri/src/desktop.rs`, `build.rs`, `capabilities/editor.json`, `src/git.rs`, `src/git/{jobs,ref_contract,invalidation,worktrees,remote}.rs`.
- Local commit/ref UI: `phase1/src/components/versions/{ChangesTab,controller,VersionsHost,backend}.tsx/.ts`, `phase1/src/lib/git/{history,refs,attribution,publication}/`.
- Native transport: `phase1/src-tauri/src/git_credential/`, `src/git/remote/bridge.rs`, `src/bin/somnia-git-credential.rs`, `phase1/src-tauri/tauri.conf.json`.
- Existing contracts/limits: `docs/git/{CONTRACT,WORKTREES,ref-read-foundations}.md`, `phase1/docs/git/{JOB-ENGINE,CREDENTIAL-BRIDGE,PUBLICATION-REVIEW,REMOTE-ENDPOINTS}.md`.
- Task/Board/CLI/asset boundaries: `phase1/docs/agent-task-engine.md`, `phase1/notes/AGENT-BOARD-UI.md`, `phase1/cli/README.md`, `phase1/crates/somnia-tui/README.md`, `phase1/extension-assets/README.md`.
- Intake/dialog differences: `phase1/src/lib/studios/{openResolver,openCoordinator,openIntake}.ts`, `phase1/src/lib/intake/{installNativeIntake,intakeOrchestrator}.ts`, `docs/studios/file-open-router.md`, `phase1/playwright.router.config.ts`.
- Typed boundary/release metadata: `docs/errors/COMMANDS.md`, `docs/errors/commands.json`, `phase1/scripts/errors/gen-commands.mjs`, `phase1/package.json`.
- Live external records: [#166](https://github.com/philppplik/somnia/issues/166), [#164](https://github.com/philppplik/somnia/issues/164), [CI run](https://github.com/philppplik/somnia/actions/runs/38121687160).
