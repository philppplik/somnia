// Measurement only: transaction cost and undo-history memory of editor-core at project scale.
// Run: npx tsx scripts/bench-history.ts   (optional: SOMNIA_BENCH_QUICK=1, SOMNIA_BENCH_OUTPUT=path.json)
// Changes no application state. Evidence for the snapshot decision (plan steps 5.1 -> 5.2/5.3). No budgets, never fails on speed.
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus, platform, arch} from 'node:os';
import {spawnSync} from 'node:child_process';
import {setFlagsFromString} from 'node:v8';
import {runInNewContext} from 'node:vm';
import {EditorProject, type EditorNode} from '../packages/editor-core/src/index';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const here = dirname(fileURLToPath(import.meta.url));
const output = process.env.SOMNIA_BENCH_OUTPUT || resolve(here, '../validation/bench/history.json');
const quick = process.env.SOMNIA_BENCH_QUICK === '1';
const EDITS = 200; // editor-core keeps at most 200 undo entries
const page = (sections: number, tag: string) => `<!doctype html><html><head><title>${tag}</title></head><body>${Array.from({length: sections}, (_, i) => `<section class="s${i}"><h2>Title ${i}</h2><p>Paragraph <em>${i}</em> with <a href="#${i}">link</a></p></section>`).join('\n')}</body></html>`;
const flatten = (nodes: EditorNode[]): EditorNode[] => nodes.flatMap(n => [n, ...flatten(n.children)]);
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stat = (v: number[]) => ({median: pct(v, 0.5), p95: pct(v, 0.95), max: Math.max(...v)});
const time = <T>(f: () => T): [T, number] => { const s = performance.now(); const r = f(); return [r, performance.now() - s]; };

interface Scenario { id: string; files: number; sectionsPerFile: number; }
const scenarios: Scenario[] = quick
  ? [{id: 'files-20x50', files: 20, sectionsPerFile: 50}, {id: 'single-500', files: 1, sectionsPerFile: 500}]
  : [
    {id: 'files-20x50', files: 20, sectionsPerFile: 50},
    {id: 'files-100x50', files: 100, sectionsPerFile: 50},
    {id: 'files-500x20', files: 500, sectionsPerFile: 20},
    {id: 'single-2000', files: 1, sectionsPerFile: 2000},
    {id: 'single-10000', files: 1, sectionsPerFile: 10000},
  ];

const HEAP_MB = Number(process.env.SOMNIA_BENCH_HEAP_MB || 3072);
const childId = process.argv[2] === '--scenario' ? process.argv[3] : undefined;
const results: any[] = [];
// Each scenario runs in its own process with a fixed heap limit, so a scenario that exhausts memory is a recorded result, not a crash.
if (!childId) {
  for (const sc of scenarios) {
    const child = spawnSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, '--import', 'tsx', fileURLToPath(import.meta.url), '--scenario', sc.id], {encoding: 'utf8', maxBuffer: 64 << 20, env: process.env});
    const lines = (child.stdout || '').split('\n');
    const done = lines.find(l => l.startsWith('RESULT '));
    if (done) { results.push(JSON.parse(done.slice(7))); console.log(lines.filter(l => l.startsWith('LOG ')).map(l => l.slice(4)).join('\n')); continue; }
    const progress = lines.filter(l => l.startsWith('PROGRESS ')).map(l => JSON.parse(l.slice(9)));
    const last = progress.at(-1);
    results.push({id: sc.id, files: sc.files, failed: `child ended without result (exit ${child.status}, signal ${child.signal}); heap limit ${HEAP_MB} MB`, lastProgress: last});
    console.log(`${sc.id}: FAILED at ${HEAP_MB} MB heap limit` + (last ? `, reached ${last.step} edits with history ${(last.bytes / 1e6).toFixed(0)} MB` : ''));
  }
}
for (const sc of childId ? scenarios.filter(s => s.id === childId) : []) {
  const files: Record<string, string> = {};
  for (let f = 0; f < sc.files; f++) files[`pages/p${String(f).padStart(4, '0')}.html`] = page(sc.sectionsPerFile, `p${f}`);
  const bytes = Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0);
  const heapBase = heap();
  const [project, constructMs] = time(() => new EditorProject(files));
  const paths = Object.keys(files);
  const nodes = paths.reduce((n, p) => n + flatten(project.tree(p)).length, 0);
  const heapProject = heap() - heapBase;

  // Long session of ungrouped edits spread over files (round-robin) so every edit is a distinct history entry.
  const editMs: number[] = [];
  const heapAt: {step: number; bytes: number}[] = [];
  const h0 = heap();
  for (let i = 0; i < EDITS; i++) {
    const file = paths[i % paths.length];
    const heads = flatten(project.tree(file)).filter(n => n.tag === 'h2');
    const target = heads[(i * 7) % heads.length];
    const [tx, ms] = time(() => project.transact({origin: 'canvas', operations: [{type: 'setAttribute', file, nodeId: target.id, name: 'title', value: `edit-${i}`}]}));
    if (!tx) throw new Error('edit produced no transaction');
    editMs.push(ms);
    if ([0, 9, 24, 49, 99, 149, 199].includes(i)) { const b = heap() - h0; heapAt.push({step: i + 1, bytes: b}); console.log('PROGRESS ' + JSON.stringify({step: i + 1, bytes: b})); }
  }
  const historyBytes = heap() - h0;
  const [state, exportMs] = time(() => project.exportState());
  const [json, jsonMs] = time(() => JSON.stringify(state));
  const [, restoreMs] = time(() => EditorProject.fromState(JSON.parse(json)));
  const undoMs: number[] = [];
  for (let i = 0; i < EDITS; i++) undoMs.push(time(() => project.undo())[1]);
  const redoMs: number[] = [];
  for (let i = 0; i < EDITS; i++) redoMs.push(time(() => project.redo())[1]);
  const quarter = EDITS / 4;
  const row = {
    id: sc.id, files: sc.files, nodes, sourceBytes: bytes,
    constructMs, projectHeapBytes: heapProject,
    editMs: {...stat(editMs), first: stat(editMs.slice(0, quarter)).median, last: stat(editMs.slice(-quarter)).median},
    historyBytesAfter200: historyBytes, historyBytesPerStep: historyBytes / EDITS, historyBytesPerStepVsSource: historyBytes / EDITS / bytes,
    heapGrowth: heapAt,
    exportStateMs: exportMs, exportStateJsonMs: jsonMs, exportStateJsonBytes: Buffer.byteLength(json), fromStateMs: restoreMs,
    undoMs: stat(undoMs), redoMs: stat(redoMs),
  };
  console.log('RESULT ' + JSON.stringify(row));
  console.log(`LOG ${sc.id}: ${row.nodes} nodes, ${(bytes / 1e6).toFixed(1)} MB; edit median ${row.editMs.median.toFixed(1)} ms (p95 ${row.editMs.p95.toFixed(1)}); history ${(historyBytes / 1e6).toFixed(1)} MB / 200 steps; undo median ${row.undoMs.median.toFixed(1)} ms`);
}
if (!childId) {
const report = {schemaVersion: 1, measuredAt: new Date().toISOString(), environment: {node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model || 'unknown'}, editsPerScenario: EDITS, incremental: EditorProject.incremental.enabled, heapLimitMb: HEAP_MB, results};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.table(results.filter(r => !r.failed).map(r => ({scenario: r.id, nodes: r.nodes, MB: +(r.sourceBytes / 1e6).toFixed(2), editMed: +r.editMs.median.toFixed(1), editP95: +r.editMs.p95.toFixed(1), undoMed: +r.undoMs.median.toFixed(1), histMB: +(r.historyBytesAfter200 / 1e6).toFixed(1), exportMB: +(r.exportStateJsonBytes / 1e6).toFixed(1)})));
console.log(`Report: ${output}`);
}
