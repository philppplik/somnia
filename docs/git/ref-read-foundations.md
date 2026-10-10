# Ref reads and watcher invalidation

S2 adds immutable native reads under S1 Read GitJobs. No network, hooks, external diff or textconv execution. Read jobs do not hold the app file-service mutex. Agent callers use the native job APIs with Agent origin: unknown editor state, unsaved buffers and pending AI review block even reads. Desktop buttons use Human origin and preserve the existing manual disk semantics. Watcher events cannot authorize writes or make reviews valid.

## Registered desktop commands

Wire shapes match the S6 `phase1/src/lib/git/refs/contract.ts` consumer:

- `git_diff_refs {request:{from,to}}`: resolved `{ref,sha,tree}` sides and project-relative file entries, rename information, immutable before/after blob IDs, bounded per-file text patches. Both refs must name commits. Empty strings, options and revision expressions are rejected. Native `ref_reads::diff_refs` additionally accepts explicit null sides for empty-tree comparisons in unborn repositories; this is not the public S6 wire contract.
- `git_safety_list`: persisted `refs/somnia/safety/*`, including packed refs, as an array. Legacy scope and source operation are unknown, mapped to `[]` and `other` for S6 compatibility. Do not interpret that mapping as evidence that a legacy snapshot captured the whole currently opened project. The richer native response keeps unknown values null. More than 500 entries errors instead of silently hiding safety points.
- `git_ref_tree {gitRef}`: immutable scoped tree plus project-relative file/blob entries, up to 5000 entries. Non-blob entries (submodules) make the result incomplete. A project subtree absent from a historical commit returns an error, never claims a complete empty snapshot.
- `git_read_blob {blob}`: lowercase full SHA-1/SHA-256 object ID only, blob type checked; max 1 MiB text. Too-large blobs return `tooLarge:true` with no text. Binary classification of oversized blobs is not determined. No repo-controlled filters are executed.

Each complete-object parser rejects truncated process output. The shared runner caps retained stdout; native overall patches and S6 aggregate per-file patches are capped at 2 MiB. Giant blobs are not read solely for classification. Binary patches are not returned as text. Paths not representable as UTF-8 are rejected rather than replaced with an ambiguous name. Submodules are not followed. Prefix-crossing renames follow Git's scoped add/delete behavior.

S2 adds one small atomic `GitJobRunner::invalidate_workspace` method to S1 to avoid a read/modify/write race with live editor-state updates. It never replaces editor fields.

S1 is a prerequisite: `git::{command,context,jobs}` with the final followup. `ref_reads::RefReadExecutor` is a minimal bridge implemented for `JobExecution`. There is no competing Git runner. Native semantic exports are `ref_contract::{diff_job,safety_job,tree_job,blob_job}`. They take an explicit origin and S1 context. The richer empty-tree functions stay in `ref_reads`. All results bind immutable commit/tree/blob content hashes; these reads do not supply a mutation plan or approval.

## Safety metadata

New legacy restore/combine safety commits carry `Somnia-Safety-Scope` (JSON, project-relative) and `Somnia-Safety-Operation` (`restore` or `combine`) trailers. Ref names include seconds, PID, nanoseconds and a sequence. `update-ref` uses a null old-object ID to refuse an accidental overwrite. Existing refs remain readable unchanged. Variant deletion still uses its existing separate `refs/somnia/variant-backup/*` mechanism; it is not falsely relabeled as a safety snapshot. Restore remains the existing new-commit operation, not reset.

## Status invalidation

`GitStatusWatcher` owns notify watches of checkout, common Git dir and split worktree Git dir. Access-only events are ignored to avoid read-refresh feedback loops. Writes/errors debounce at 200ms quiet with a one-second maximum under continuous changes. Host emits `somnia://git-invalidated {projectId,generation,watcherFailed}`. Changes, Compare and History re-run reads for their active project, ignoring other projects and old generations. Compare clears obsolete evidence; Changes queues invalidation while a commit/init is running and preserves edited title/body. No new UI strings or locale keys were added.

The desktop keeps these read commands on one lazy runner. Watcher generation bumps preserve all existing editor leases, dirty-buffer and AI-hold fields. They do not invent authoritative clean editor state. S1's full desktop/CLI editor-state exchange remains a host integration prerequisite for agent operations; unknown state correctly blocks. Existing legacy mutation commands are not migrated to shared job locks by this change.

Watch registration failures retry every five seconds (including a folder gaining a new repository). Manual refresh remains available. Platform watcher delivery is best-effort; this slice is not a guarantee of refresh on filesystems that lose native notifications. Watchers are removed when projects close. Cross-platform packaged desktop checks remain necessary.

## Tests

- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features git::`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib -- --test-threads=1`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test git_backend --test git_variants`
- Affected TS scope: `npx tsx --test src/lib/gitReadFoundations.test.ts src/components/versions/*.test.tsx src/lib/git/variantsFlow.test.ts src/lib/visualDiff/*.test.ts src/lib/versionsSession.test.ts`
- Standalone pixel/event harness: `SOMNIA_CHROME=/path/to/chrome npx playwright test -c git-harness.playwright.config.ts` (omit env for Playwright's installed Chromium). Uses real Changes/Compare components and app tokens, mocked native event delivery. It bypasses missing app WASM artifacts, not a full packaged desktop runtime test. Both light and dark run, checking file list and displayed comparison refresh.

Full core-suite attempts in the development environment exceeded a time bound around extension selftests and are not reported as all-green. TypeScript has the pre-existing missing slides-engine/pkg output. Default desktop Cargo build needs unavailable GLib system packages. Native Linux tests do not establish Windows/macOS packaged behavior.
