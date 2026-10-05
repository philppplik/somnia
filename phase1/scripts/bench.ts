// Run with npm run bench. This script changes no application state or source files.
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync, appendFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {cpus, platform, arch} from 'node:os';
import {EditorProject, type EditorNode} from '../packages/editor-core/src/index';
import {evaluate, markdown, validateBudgets} from './performance/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = validateBudgets(JSON.parse(readFileSync(resolve(here, 'performance/budgets.json'), 'utf8')));
const mode = process.env.SOMNIA_INCREMENTAL === '1' ? 'incremental' : 'full';
const output = process.env.SOMNIA_BENCH_OUTPUT || resolve(here, `../validation/bench/${mode}.json`);
EditorProject.incremental.enabled = mode === 'incremental';
EditorProject.incremental.verify = false;
EditorProject.incremental.hits = 0;
EditorProject.incremental.misses = 0;
const make = (n: number) => `<!doctype html><html><head><title>b</title></head><body>${Array.from({length: n}, (_, i) => `<section class="s${i}"><h2>Title ${i}</h2><p>Paragraph <em>${i}</em> with <a href="#${i}">link</a></p></section>`).join('\n')}</body></html>`;
const flatten = (nodes: EditorNode[]): EditorNode[] => nodes.flatMap(node => [node, ...flatten(node.children)]);
const timed = <T>(run: () => T): [T, number] => {
  const start = performance.now();
  const value = run();
  return [value, performance.now() - start];
};
const results: {id: string; samplesMs: number[]; bytes?: number; nodes?: number}[] = [];

// A new process for every sample avoids disguising module-import cost with a warm cache.
const startup: number[] = [];
for (let run = 0; run < config.warmupRuns + config.sampleRuns; run++) {
  const [child, ms] = timed(() => spawnSync(process.execPath, ['--import', 'tsx', resolve(here, 'performance/startup.ts')], {encoding: 'utf8', timeout: 15000}));
  if (child.error || child.status !== 0) throw new Error(`Core startup failed: ${child.error?.message || child.stderr || child.signal}`);
  if (run >= config.warmupRuns) startup.push(ms);
}
results.push({id: 'core-startup', samplesMs: startup});
for (const fixture of config.fixtures) {
  const html = make(fixture.sections);
  const samples = {parse: [] as number[], edit: [] as number[], undo: [] as number[], redo: [] as number[]};
  let nodes = 0;
  for (let run = 0; run < config.warmupRuns + config.sampleRuns; run++) {
    // Each run has a fresh project/history. Fixture generation and assertions are not timed.
    const [project, parseMs] = timed(() => new EditorProject({'index.html': html}));
    const tree = flatten(project.tree('index.html'));
    nodes = tree.length;
    assert.equal(nodes, fixture.sections * 5 + 4);
    const headings = tree.filter(node => node.tag === 'h2');
    const heading = headings[Math.floor(headings.length / 2)];
    assert.ok(heading);
    const [, editMs] = timed(() => project.transact({origin: 'canvas', operations: [{type: 'setAttribute', file: 'index.html', nodeId: heading.id, name: 'title', value: 'benchmark'}]}));
    const edited = project.files['index.html'];
    assert.notEqual(edited, html);
    assert.equal(project.node('index.html', heading.id).attrs.title, 'benchmark');
    const [, undoMs] = timed(() => project.undo());
    assert.equal(project.files['index.html'], html);
    const [, redoMs] = timed(() => project.redo());
    assert.equal(project.files['index.html'], edited);
    if (run >= config.warmupRuns) {
      samples.parse.push(parseMs); samples.edit.push(editMs); samples.undo.push(undoMs); samples.redo.push(redoMs);
    }
  }
  for (const operation of ['parse', 'edit', 'undo', 'redo'] as const) results.push({id: `${operation}-${fixture.sections}`, samplesMs: samples[operation], bytes: Buffer.byteLength(html), nodes});
}
if (mode === 'incremental') assert.ok(EditorProject.incremental.hits > 0, 'Incremental benchmark must exercise partial reparsing');
const report = {
  schemaVersion: 1, mode, measuredAt: new Date().toISOString(),
  environment: {node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model || 'unknown'},
  warmupRuns: config.warmupRuns, sampleRuns: config.sampleRuns,
  incremental: {hits: EditorProject.incremental.hits, misses: EditorProject.incremental.misses},
  results,
};
const evaluated = {...report, results: evaluate(report, config)};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(evaluated, null, 2) + '\n');
writeFileSync(output.replace(/\.json$/, '') + '.md', markdown(evaluated));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(evaluated));
console.table(evaluated.results.map(row => ({metric: row.id, medianMs: Number(row.medianMs.toFixed(2)), p95Ms: Number(row.p95Ms.toFixed(2)), budgetMs: row.budgetMs, result: row.passed ? 'PASS' : 'FAIL'})));
console.log(`Report: ${output}`);
for (const row of evaluated.results.filter(row => !row.passed)) console.error(`BUDGET EXCEEDED: ${row.id}: p95 ${row.p95Ms.toFixed(2)} ms > ${row.budgetMs} ms`);
process.exitCode = evaluated.results.every(row => row.passed) ? 0 : 1;
