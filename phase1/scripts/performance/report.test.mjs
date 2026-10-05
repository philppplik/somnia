import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate, markdown, percentile, validateBudgets} from './report.mjs';
const config = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));
const report = () => ({schemaVersion: 1, mode: 'full', environment: {node: 'test', platform: 'test', arch: 'test'}, warmupRuns: 1, sampleRuns: config.sampleRuns,
  results: [{id: 'core-startup', samplesMs: Array(5).fill(10)}, ...config.fixtures.flatMap(fixture => ['parse', 'edit', 'undo', 'redo'].map(operation => ({id: `${operation}-${fixture.sections}`, samplesMs: Array(5).fill(10)})))]});
test('checked-in budgets are valid and include all three sizes', () => {
  assert.equal(validateBudgets(config), config);
  assert.deepEqual(config.fixtures.map(fixture => fixture.sections), [200, 2000, 10000]);
});
test('percentiles sort without mutating samples and use nearest rank', () => {
  const samples = [5, 1, 4, 2, 3];
  assert.equal(percentile(samples, 0.5), 3);
  assert.equal(percentile(samples, 0.95), 5);
  assert.deepEqual(samples, [5, 1, 4, 2, 3]);
});
test('exact budget passes, fractional overrun fails without rounding down', () => {
  const data = report();
  const metric = data.results.find(row => row.id === 'edit-200');
  metric.samplesMs = Array(5).fill(200);
  assert.equal(evaluate(data, config).find(row => row.id === metric.id).passed, true);
  metric.samplesMs[4] = 200.001;
  assert.equal(evaluate(data, config).find(row => row.id === metric.id).passed, false);
});
test('a slow sample cannot be hidden by a fast median', () => {
  const data = report();
  data.results[0].samplesMs = [1, 1, 1, 1, 6000];
  const row = evaluate(data, config)[0];
  assert.equal(row.medianMs, 1);
  assert.equal(row.passed, false);
});
test('missing, duplicate and unknown metrics fail closed', () => {
  const missing = report(); missing.results.pop();
  assert.throws(() => evaluate(missing, config), /Missing benchmark metrics/);
  const duplicate = report(); duplicate.results.push(duplicate.results[0]);
  assert.throws(() => evaluate(duplicate, config), /duplicate metric/);
  const unknown = report(); unknown.results[0].id = 'unknown';
  assert.throws(() => evaluate(unknown, config), /Unexpected/);
});
test('empty, incomplete, negative and non-finite timings fail closed', () => {
  for (const samples of [[], [1], [1, 1, 1, 1, -1], [1, 1, 1, 1, NaN], [1, 1, 1, 1, Infinity]]) {
    const data = report(); data.results[0].samplesMs = samples;
    assert.throws(() => evaluate(data, config));
  }
});
test('invalid budget or sample configuration fails closed', () => {
  for (const mutate of [c => c.sampleRuns = 0, c => c.warmupRuns = 0, c => c.startupBudgetMs = NaN, c => c.fixtures[0].budgetsMs.edit = 0, c => c.fixtures.push(c.fixtures[0])]) {
    const changed = structuredClone(config); mutate(changed);
    assert.throws(() => validateBudgets(changed));
  }
});
test('summary includes pass/fail and startup scope caveat', () => {
  const data = report(); data.results[0].samplesMs[4] = 6000;
  const text = markdown({...data, results: evaluate(data, config)});
  assert.match(text, /core-startup.*FAIL/);
  assert.match(text, /parse-10000.*PASS/);
  assert.match(text, /not the native window or web UI/);
});
