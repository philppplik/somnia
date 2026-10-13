# Phase-0 performance baselines

Source concept: [performance and resource architecture](../concepts/performance-resource-architecture.md).
These scripts are diagnostics and correctness gates, not proof of the concept's SLOs.
Run them in CI via the manual workflow `perf-retention.yml` (public runner, free).

## Actual results from this implementation workspace

- `npm ci --ignore-scripts`: completed.
- `npx tsx --test test/performance/retention-audit.test.ts`: 4 passed.
- `node --test scripts/performance/studios/report.test.mjs`: 4 passed.
- `node --check scripts/performance/studios/run.mjs`: passed syntax check.
- `node scripts/performance/studios/run.mjs`: stopped at preflight with missing
  compiled craft/Documents/Sheets/Photos/Sound/raster JS and WASM. No baseline numbers.
- Playwright retention configuration load: stopped at the same preflight. No browser
  or real retention assertions executed. No screenshot inspected.
- No cargo, native startup, native memory, suspension or resume test was run.

## Browser measurement

From `phase1`, with real engine artifacts available:

```
npm ci
npm run build
npx playwright install chromium
SOMNIA_PERF_SAMPLES=20 node scripts/performance/studios/run.mjs
```

Default starts a local production preview on port 1442 and closes it and Chromium
on success or failure. Uses fresh browser contexts for shell startups, one warmup
and 20 samples, followed by studio first-activation and return-activation samples.
Timing starts at renderer click dispatch, not Playwright command submission. It
waits for the correct host's visible ready selector and two animation frames,
not only a checked pill. Empty-host readiness is not loaded-engine readiness.

Artifacts: `test-results/studio-performance/baseline.json`, `baseline.md`, and
per-studio PNGs. Any failure writes `failure.json` and exits nonzero, rather than
reporting missing measurements as zero or passing. Inspect PNGs before trusting a
new runner's selectors. Native-only Vibe Space is excluded; Vector and Code return
scenarios are not yet calibrated. Scenarios live in `scenarios.json` and are validated
for unique IDs, labels and readiness selectors. Default scope is seven empty studios,
not a representative loaded-document/media sweep. No private files or content are
included in reports.

`SOMNIA_PERF_URL` attaches to an operator-supplied build instead. It does not run
artifact preflight because the remote build owns those artifacts; page/readiness
errors still fail. Operator must record production/development and cache conditions.
`SOMNIA_PERF_OUT` overrides output directory. Samples must be 3-100. No repeatable
performance gate exists until noise and hardware baselines are calibrated.

The raw report includes SHA, platform, OS, architecture, Node, Chromium, CPU count,
RAM, viewport, sample arrays and nearest-rank p50/p95/p99. Power state is explicitly
unverified. Launching a fresh context is not a disk-cold browser or native cold launch.
JS heap is whole renderer heap from CDP, not studio-exclusive allocation. Linux RSS
is a Chromium process-tree sum with possible shared-page duplication. It is separate
from JS heap, never added to it. No GPU/private-working-set attribution is inferred.
The 250 ms settling delay is recorded behavior, not proof of memory reclamation.

Return activation is the available browser proxy for a future resume benchmark.
It must not be named suspended resume: the baseline has no suspend/checkpoint lifecycle.
Loaded fixtures, 50-switch resource drift, admitted export contention and true native
launch/resume remain required additions after session safety and adapters are ready.

## Retention correctness gate

```
npx playwright test --config test/performance/playwright.config.ts
```

Real fixture hashes and licenses are already tracked in the repository fixture homes:
`test/documents/sample.docx` and `sheets-craft/fixtures/fixture.xlsx` are project test
fixtures. The tests use actual file intake and real engines, not worker mocks. They
edit accepted UTF-8 paragraph/cell values, check dirty state while hidden, switch
studio, switch a second file, return, undo/redo, save/export and reopen edited bytes.
No `test.fail`, skipped retention assertions, fake engines or tolerances hide loss.
At the audited baseline these invariants are expected to expose the source hazards;
actual failures are only established after running them with real engine artifacts.
Uncommitted drafts/caret/selection and fault recovery require additional fixtures.

The separate characterization suite in [RETENTION-AUDIT.md](RETENTION-AUDIT.md)
passes by proving the old unsafe path. Do not use that suite as a safe-eviction gate.

## Free CI integration

No GitHub Actions workflow is added. Run pure tests locally or on an existing
explicitly approved free runner. Browser/native checks should be opt-in steps on
already approved infrastructure with installed artifacts. Do not start private-repo
minutes, macOS runners or billed cloud VMs from these scripts.

Suggested commands, without modifying shared package scripts:

```
node --test scripts/performance/studios/*.test.mjs
npx tsx --test test/performance/retention-audit.test.ts
npx playwright test --config test/performance/playwright.config.ts
node scripts/performance/studios/run.mjs
```

## Exit criteria still open

Phase 0 is not complete until loaded fixture measurements and real retention
invariants pass, production bundle graph is recorded, native startup/process memory
and actual suspended resume are measured on the Windows/macOS/Linux matrix, and
candidate thresholds are calibrated. This patch provides reproducible tooling and
source witnesses, not a measured product speedup or native certification.

### Loaded DOCX/XLSX option

```
SOMNIA_PERF_LOADED=1 SOMNIA_PERF_SAMPLES=20 node scripts/performance/studios/run.mjs
```

Uses actual repository fixtures through each studio's file picker before measuring
view return. This is labeled `loaded-first-view-return`, not cold engine activation:
initial file loading is setup and excluded from timing. Visible page image/cell,
then two frames, is required. No simulated workbooks. The two-studio scope does not
certify all-studio resource ownership or native memory. Fixture inventory records
SHA-256, archive bytes, expanded bytes and part counts for four tracked DOCX/XLSX
fixtures; its test reads the actual archives. This loaded scenario has not run here
because preflight still fails on missing real engines.
