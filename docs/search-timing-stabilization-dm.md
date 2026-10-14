# DM: search timing audit and synthetic CI budget

Status: **In development**. Synthetic tests only; not a CI run or native acceptance result.

The consolidated configuration discovers all `local-search-*.spec.ts` plus the DF setup spec:50 tests, two workers, no automatic retries,30-second per-test timeout and360-second wall-clock ceiling. One isolated Vite server is shared; no external server reuse. Run from `phase1`:

```sh
npx playwright test --config test/local-search-dm-playwright.config.ts
```

For separate CI jobs use `--shard=1/2` and `--shard=2/2`. Each shard launches its own server in its own job/workspace. Do not launch both against the same local port in one workspace. Budget includes synthetic search/setup only, not browser installation, native/Rust/WASM, full desktop E2E or real model downloads. No actual workflow is changed or CI job dispatched by this patch.

## Audit changes

- CY late-response cancellation replaces650ms sleep/500ms delay with explicit held response, release after cancel and a completed-response condition. The response deliberately ignores abort to test late-result refusal.
- Removed unused copied slow-delay branches from DA/DB/DD fixtures and unnecessary CX progress delay. Progress events/assertions remain.
- DK held request has no30-second auto-release; only owned abort releases it. Its100ms synthetic performance pacing and20ms measurement timer remain intentional measurement inputs, not test synchronization sleeps.
- BB older keyboard/error/locale tests now explicitly consent before building, use localized named buttons instead of ordinal targets, and expect the current extra model verification. Existing keyboard/error/no-private-diagnostic checks remain. These were stale failures, not retries to hide a flake.
- DI waits for setup region unmount and two animation-frame focus stability before Space. The test still reaches controls with Tab, uses keyboard activation and verifies focus/checked state. No focus/click bypass, test skip or weakened gate.
- Static audit rejects fixed `waitForTimeout`, forced click and skip/fixme in search/DF specs. Real production deadlines are not removed.

## Observed local evidence

Shard1:25 passes in1.5 minutes. Final shard2:25 passes in1.4 minutes. Additional five-locale keyboard repeat:15/15 passes across three repetitions with two workers in1.0 minute. No retries. Earlier audit runs found stale BB tests and a DI setup-unmount/focus race; these failures are preserved here rather than presented as an all-green first run. The initial unsharded local invocation was interrupted by the command runner's timeout; it is not claimed as a completed run.

Combined final shards cover all50 tests. A full unsharded360-second budget is configured but not claimed measured in one completed run here. CI machine load can differ; investigate failures before changing the budget. DK under shard load measured build3399ms, query1001ms, max timer gap1435ms and cancel164ms, still within its existing ceilings. Not a supported-device performance promise.

No new dependencies, runtime controls, generated answers, persistence or real daemon inference. Native/CSP/real model/platform accessibility acceptance remains open.
