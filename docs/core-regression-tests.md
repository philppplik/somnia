# Core regression test additions

Base: `1aa3a6d` on `somnia-agent` (11.0.0 plus panel radius, logging/error handling and Solid/Glass background).

## Runner and baseline

The desktop app uses `node:test` through `tsx`, not Vitest. All added files match the existing `npm run test:core` globs; no runner, dependencies or production code changed.

Before additions: 484 tests, 481 passed, 3 skipped, no failures.
After additions: 529 tests, 526 passed, the same 3 skipped, no failures.
`npx tsc --noEmit` also passed. Existing incremental parsing differential tests remain unchanged.

## Risk-driven gaps covered

| File | Added tests | What regressions the tests would catch |
| --- | ---: | --- |
| `phase1/packages/editor-core/src/regressions.test.ts` | 16 | Editable implied nodes, leaked mutable trees, unsafe or reserved attribute edits, lost source bytes and node identities during moves, partial transaction rollback, corrupted redo branches, wrong history grouping boundary/origin, history cap drift, recovery aliasing, duplicate generated classes/links, partial style creation and unsafe file paths. |
| `phase1/packages/editor-core/src/persistence-regressions.test.ts` | 6 | Overlapping disk writes, stale revision snapshots, lost retry after asynchronous write failure, leaked status objects, broken debounce/cancel behavior, and treating recovery caching as a disk save. |
| `phase1/src/lib/appStore.test.ts` | 7 | Stale multi-selection after deletion, wrong design document when switching tabs, false clean state after a stale or partial save, obsolete project events/cleanup affecting the current project, tab neighbour selection errors, and incomplete project teardown. |
| `phase1/src/lib/cssTools.regressions.test.ts` | 7 | Shifted comment/style offsets, wrong variable declaration edited in multi-style or nested-media sources, injection through variable values, commented root mistaken for a real root, class-prefix corruption, altered declaration strings and overlooked usage-only rename collisions. |
| `phase1/src/lib/agent/session.test.ts` | 9 | Invalid restored tool histories, mutable restored data, incomplete turns entering replay history, cumulative tool limit bypass, wrong ordering of fragmented calls, leaked proposals on cancellation/timeout, active-turn reset and observer mutation affecting tool actions. |

Timer boundary tests use Node's mock timers rather than sleeps. Save races use explicit deferred promises. App store tests reset the singleton before and after each test. Agent tests use local deterministic provider fixtures and no network or API credentials.

## Reproduced bugs reported separately, not fixed here

These are not encoded as passing expectations and are not skipped or TODO tests. The separate reproduction script intentionally fails on this base.

1. **Synchronous storage write failure wedges `SaveCoordinator.flush()`.** If `write()` throws before returning a Promise, its async wrapper's `finally` resets `running` before the outer assignment writes back the rejected Promise. A second flush awaits the old rejected Promise instead of trying another write. An `async write()` rejecting does not have this problem; that ordinary retry path is covered by the green suite.
2. **`renameClass()` rewrites text outside class selectors/attributes.** A CSS comment containing `.card`, a quoted attribute selector `[data-label=".card"]`, and HTML markup inside a comment all become `tile`. Declaration values remain unchanged, but comments and attribute selector literals do not. This can change selector semantics and source bytes unrelated to the requested rename.

Native filesystem behavior, visual UI behavior, and end-to-end preview interaction are not claimed by these unit tests. Existing Playwright/native test coverage was not run for this test-only change.
