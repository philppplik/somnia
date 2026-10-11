# Vibe Space P5 QA (transport / controller / validation)

Scope: review of 3773692 + 887026d against wire v1; race/edge tests; browser fixture re-run.
Not covered: real Tauri/Rust E2E (none was run, none is claimed). Rust-side claims in ui.md
(atomic pre-apply checkpoint, conflict re-check, idempotent request->run mapping) are
unverified here.

## Run

```sh
npx tsx --test src/lib/vibespace/*.test.ts src/components/vibespace/*.test.tsx test/vibespace/*.test.tsx
npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --types node,react --jsx react-jsx \
  --target ES2022 --module ESNext --moduleResolution Bundler \
  src/lib/vibespace/*.ts src/components/vibespace/*.tsx src/components/vibespace/assets.d.ts test/vibespace/*.ts test/vibespace/*.tsx
VIBESPACE_SCREENSHOTS=/tmp/vs node src/components/vibespace/browser-fixture.mjs
```

`test/vibespace/vibespace.qa.test.tsx` needs `jsdom` and its types (scratch install only). `test/vibespace/qa-dom.ts` installs jsdom globals before react-dom loads. Both live outside production `tsconfig.json`'s `src` include. Production code never imports this harness. Explicit QA typecheck: `npx tsc -p test/vibespace/tsconfig.json`. Run QA only when its scratch dependencies are supplied; production build does not require jsdom.

## Findings (all fixed; regression tests in the QA suites, 0 todo/skip)

| id | issue | fix |
|----|-------|-----|
| F-1 | discard forwarded arbitrary paths | `reviewPathsAllowed`: discard paths must be unique files of the shown review (UI sends none); used by controller and native |
| F-2 | retry of an old failed run | `canRetry`: retryable failed/crashed run AND it is the Studio's `latestRunId` AND native `canStart` |
| F-3 | binding reviewRequest output unchecked | `checkedReviewRequest`: only runId/paths/one revision key/decision allowed; runId, exact ordered paths and reviewRevision must equal the command, else throw before invoke |
| F-4 | stale (lower revision) read cleared the lock | stale reads and stale mutation results now raise a lock instead |
| F-5 | execute after disconnect | controller tracks `connected`; execute refused until subscribed |
| F-6 | model chosen by array index | option value is the stable `[provider,model,locality]` identity; a vanished model deselects |
| N-2 | consumed folder grant reused | grant cleared on submit; a fresh Choose folder is required after failure |
| N-3 | orphan run/studio, duplicate models | parseSnapshot rejects: run without matching session/space, orphan or mismatched latestRunId, duplicate models |
| N-1 | any local refusal locks until Reload | unchanged (safe, deliberate) |

Contract decision to confirm: `latestRunId` of every session must be present in the read's `runs`
(history included). If native lists only active runs, N-3 will reject valid data.

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
