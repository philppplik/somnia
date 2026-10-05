// Pure report validation and formatting, shared by the runner and its tests.
export const operations = ['parse', 'edit', 'undo', 'redo'];
export function validateBudgets(config) {
  if (config.schemaVersion !== 1 || !Number.isInteger(config.warmupRuns) || config.warmupRuns < 1 ||
      !Number.isInteger(config.sampleRuns) || config.sampleRuns < 3 || config.sampleRuns > 20 ||
      !Number.isFinite(config.startupBudgetMs) || config.startupBudgetMs <= 0 ||
      !Array.isArray(config.fixtures) || !config.fixtures.length) throw new Error('Invalid benchmark configuration');
  const seen = new Set();
  for (const fixture of config.fixtures) {
    if (!Number.isInteger(fixture.sections) || fixture.sections <= 0 || seen.has(fixture.sections)) throw new Error('Invalid or duplicate fixture');
    seen.add(fixture.sections);
    for (const operation of operations) {
      const value = fixture.budgetsMs?.[operation];
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Missing or invalid ${operation} budget`);
    }
  }
  return config;
}
export function percentile(samples, fraction) {
  if (!samples.length || samples.some(ms => !Number.isFinite(ms) || ms < 0)) throw new Error('Invalid timing sample');
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
export function evaluate(report, config) {
  validateBudgets(config);
  if (report.schemaVersion !== 1 || !['full', 'incremental'].includes(report.mode) || !Array.isArray(report.results)) throw new Error('Invalid benchmark report');
  const expected = new Map([['core-startup', config.startupBudgetMs]]);
  for (const fixture of config.fixtures) for (const operation of operations) expected.set(`${operation}-${fixture.sections}`, fixture.budgetsMs[operation]);
  const seen = new Set();
  const rows = report.results.map(result => {
    if (!expected.has(result.id) || seen.has(result.id)) throw new Error(`Unexpected or duplicate metric: ${result.id}`);
    seen.add(result.id);
    if (!Array.isArray(result.samplesMs) || result.samplesMs.length !== config.sampleRuns) throw new Error(`Missing samples: ${result.id}`);
    const p95Ms = percentile(result.samplesMs, 0.95);
    const budgetMs = expected.get(result.id);
    return {...result, medianMs: percentile(result.samplesMs, 0.5), p95Ms, budgetMs, passed: p95Ms <= budgetMs};
  });
  if (seen.size !== expected.size) throw new Error('Missing benchmark metrics');
  return rows;
}
export function markdown(report) {
  const number = ms => ms.toFixed(2);
  return [`## Editor-core performance (${report.mode})`, '',
    `Node ${report.environment.node}; ${report.environment.platform}/${report.environment.arch}. ${report.sampleRuns} measured runs after ${report.warmupRuns} warmup run(s).`, '',
    '| Metric | Source bytes | Nodes | Median ms | p95 ms | Budget ms | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...report.results.map(row => `| ${row.id} | ${row.bytes ?? '-'} | ${row.nodes ?? '-'} | ${number(row.medianMs)} | ${number(row.p95Ms)} | ${row.budgetMs} | ${row.passed ? 'PASS' : 'FAIL'} |`), '',
    'Cold core startup includes a fresh Node + tsx process and the editor-core import, not the native window or web UI. Timings are runner-specific, not Windows UX guarantees.', ''].join('\n');
}
