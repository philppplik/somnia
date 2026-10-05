# Editor-core performance budgets

## Scope

`phase1/scripts/bench.ts` gates editor-core performance in the existing frontend CI job. It measures both full parsing and incremental parsing, without changing app code, packages, releases or native build settings.

Fixtures contain 200, 2,000 and 10,000 sections. Each section has a heading, paragraph, emphasis and link. Including the document wrappers, they contain 1,004, 10,004 and 50,004 editable nodes (roughly 21 KiB, 216 KiB and 1.1 MiB of generated HTML).

Measured operations:

- Parse: construct a fresh `EditorProject`.
- Edit: add an attribute to the heading in the middle of the document, including transaction/history overhead.
- Undo and redo: restore the document after that edit.
- Cold core startup: start a fresh Node + tsx process, import the core and create a small project. This includes process/transpiler overhead. It is **not native application startup**, preview rendering, web UI readiness or a Windows UX claim.

Each fixture runs once for warmup, then five times for measurement with a fresh project/history each time. Source generation, node counting and correctness assertions are outside timed regions. The script checks the expected node count, that the edit actually happened, and exact source restoration for undo/redo. Node's garbage collector is not disabled; its cost and runner contention can appear in the samples.

## Gate and reports

The nearest-rank p95 of raw, unrounded timings must be at or below its budget. With five samples this is the maximum sample, not a smoothed percentile estimate. Median is also reported but never hides a slow sample. No automatic retries or runner-specific multipliers turn a failure green.

| Sections | Parse ms | Edit / undo / redo ms |
| --- | ---: | ---: |
| 200 | 400 | 200 |
| 2,000 | 2,500 | 625 |
| 10,000 | 12,000 | 3,000 |

Cold core startup: 5,000 ms. Existing parse/edit/undo limits are retained from the prior benchmark; redo shares the history budget. These are generous smoke-regression ceilings, not interactive-latency targets. Tighten them only after collecting several comparable CI runs. Review any budget change explicitly in the PR; never increase a limit just to hide a regression.

Configuration lives in `phase1/scripts/performance/budgets.json`. Invalid budgets, missing/duplicate metrics, insufficient samples, non-finite timings and correctness errors fail closed. Unit tests cover those rules and exact-budget/fractional-overrun boundaries.

CI prints the metrics into the job summary and uploads `full.json`, `incremental.json` and their Markdown tables as `somnia-performance-<commit>`, retained for 14 days. JSON includes every measured sample, mode, timestamp, runtime/OS/architecture/CPU and incremental hit/fallback counts. The incremental run and report upload still run after a full-parser failure; a failure remains a failing job. Use the Actions run attached to the PR to view these reports. No extra workflow, runner job, paid service or PR-comment token is introduced.

Local output goes under ignored `phase1/validation/bench/`. `SOMNIA_BENCH_OUTPUT` can select a different JSON output path. Measurements are specific to the recorded environment; compare equivalent runners and modes, not Linux vs Windows wall times.

## Run locally

From `phase1`, using Node 24 (same major as CI):

```sh
npm ci
node --test scripts/performance/report.test.mjs
npm run bench
SOMNIA_INCREMENTAL=1 npm run bench
```

Windows PowerShell:

```powershell
cd phase1
npm ci
node --test scripts/performance/report.test.mjs
npm run bench
$env:SOMNIA_INCREMENTAL = '1'
npm run bench
Remove-Item Env:SOMNIA_INCREMENTAL
Get-Content validation/bench/full.md
Get-Content validation/bench/incremental.md
```

All rows should read `PASS`; a budget overrun exits nonzero and names the metric. The scripts do not require an installed Somnia release and do not touch saved user projects. If a Windows result is slow, keep the JSON with machine/runtime details for diagnosis. Native startup, browser paint latency, CSS/JS-heavy projects, deep nesting and multi-file projects still need separate benchmarks. No installer or release is produced by this feature branch.
