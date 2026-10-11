# Vibe Space P5 QA (transport / controller / validation)

Scope: review of 3773692 + 887026d against wire v1; race/edge tests; browser fixture re-run.
Not covered: real Tauri/Rust E2E (none was run, none is claimed). Rust-side claims in ui.md
(atomic pre-apply checkpoint, conflict re-check, idempotent request->run mapping) are
unverified here.

## Run

```sh
npx tsx --test src/lib/vibespace/*.test.ts src/components/vibespace/*.test.tsx
npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --types node,react --jsx react-jsx \
  --target ES2022 --module ESNext --moduleResolution Bundler \
  src/lib/vibespace/*.ts src/components/vibespace/*.tsx src/components/vibespace/assets.d.ts
VIBESPACE_SCREENSHOTS=/tmp/vs node src/components/vibespace/browser-fixture.mjs
```

`vibespace.qa.test.tsx` needs `jsdom` (scratch install only). Tests marked `todo` are open
findings: they assert the desired behavior and currently fail without failing the run.
Remove `todo` when fixed.

## Findings

| id | sev | where | issue |
|----|-----|-------|-------|
| F-1 | med | controller.execute, native.execute | `review` with `decision:'discard'` skips path checks; arbitrary `paths` are forwarded to `reviewRequest`/native. UI sends `[]`, so only non-UI callers are affected. |
| F-2 | med | controller.execute, native retry | Retry only checks failed/crashed + `failure.retryable`. It ignores `StudioSummary.latestRunId`/`canStart`, so an old failed run can be retried after a newer run exists (duplicate firing risk). |
| F-3 | med | NativeVibeBindings.reviewRequest | ui.md says the adapter validates preserved selections; only the input is validated. The binding's returned DTO goes to native unchecked, so it can widen paths/runId/revision. |
| F-4 | med | controller.read/reducer | A reconciliation read with a lower `revision` is ignored by the reducer but `read()` still clears the lock. After an ambiguous mutation, a stale read unlocks actions with stale state. |
| F-5 | low | controller.execute | No connected check: after `disconnect()` a command can still fire. Not reachable from the UI. |
| F-6 | med | CreateStudioForm | Model is held as a numeric index into `models[]`. If the model list reorders/changes while the form is open, a different model than the one shown is submitted (cloud vs local matters). |
| N-1 | note | controller | Any local refusal (stale review, consent changed) sets the global error and locks all actions until Reload. Safe, but heavy-handed. |
| N-2 | note | CreateSpaceForm | Folder grant is kept after a failed create and reused; if grants are single-use natively, the retry fails. Needs native contract. |
| N-3 | note | parseSnapshot | Does not check run.studioId exists in sessions, nor model uniqueness. |

## Verified (tests)

Initial buffer/replay/dup/old, gap lock (stale read stays locked, caught-up unlocks),
unknown-run event, identity swap, bad protocol version, ambiguous mutation lock without
auto-retry, double-click single firing, fresh commandId, expectedRevision, wrong-run /
wrong-request / allow_for_run / resolved consent refusal, stale review revision, unknown/
conflict/duplicate/empty paths, event-driven review revision change and new conflict,
applied/discarded re-review, restore guards, no-run studio start/stop/steer/retry,
canStart=false, double Start, destroyed controller (late subscribe, read, mutation, event,
StrictMode remount), native gap/invalid event lock, native DTO exactness, unknown-field and
`__proto__` command rejection, component unmount with late event, gap banner disables actions,
consent buttons bound to open run.

## Environment caveat

Base `src/lib/icons` was not available in the QA checkout; a throwaway stub was used, so icon
glyphs in screenshots are placeholders (the Vadivam bot glyph is real). Theme tokens in the
fixture are hardcoded values, not the app's real theme.
