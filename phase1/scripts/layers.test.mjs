import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {analyze, assertCoverage, projectRoot, toolchain} from './layers.mjs';

function fixture(t, files) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'somnia-layers-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  const config = resolve(projectRoot, '.dependency-cruiser.cjs');
  writeFileSync(resolve(cwd, 'tsconfig.json'), JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@fixture/*': ['src/*']}}}));
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(resolve(cwd, name, '..'), {recursive: true});
    writeFileSync(resolve(cwd, name), source);
  }
  return {cwd, entries: ['src'], config, ignoreKnown: false};
}

test('isolated compiler is available, while app TypeScript remains 7.0.2', async () => {
  const {api} = await toolchain();
  const ts = api.getAvailableTranspilers().find(t => t.name === 'typescript');
  assert.equal(ts.available, true);
  assert.equal(ts.currentVersion, 'typescript@6.0.3');
  const app = JSON.parse(readFileSync(resolve(projectRoot, 'node_modules/typescript/package.json')));
  assert.equal(app.version, '7.0.2');
});

test('detects a forbidden type-only TSX import through tsconfig paths', async t => {
  const options = fixture(t, {
    'src/lib/low.ts': "import type {Widget} from '@fixture/components/high'; export type Low = Widget;",
    'src/components/high.tsx': 'export interface Widget {name: string}',
  });
  const g = await analyze(options);
  assertCoverage(g, options.cwd, options.entries);
  assert.equal(g.summary.error, 1);
  assert.ok(g.summary.violations.some(v => v.rule.name === 'lib-not-up' && v.to === 'src/components/high.tsx' && v.dependencyTypes.includes('type-only')));
});

test('detects import type expressions and a TS/CTS/MTS cycle', async t => {
  const g = await analyze(fixture(t, {
    'src/lib/a.ts': "export type A = import('./b.c').B;",
    'src/lib/b.c.cts': "import type {C} from './c.m.mts'; export interface B {c: C}",
    'src/lib/c.m.mts': "import type {A} from './a'; export interface C {a: A}",
  }));
  assert.ok(g.summary.violations.some(v => v.rule.name === 'no-circular'));
  assert.equal(g.modules.filter(m => m.source.startsWith('src/')).length, 3);
});

test('valid downward imports pass; tests and framework templates are excluded', async t => {
  const options = fixture(t, {
    'src/lib/low.ts': 'export interface Low {name: string}',
    'src/components/high.tsx': "import type {Low} from '../lib/low'; export type High = Low;",
    'src/lib/bad.test.ts': "import '../components/high';",
    'src/lib/frameworks/templates/example.ts': "import '../../components/high';",
  });
  const g = await analyze(options);
  assertCoverage(g, options.cwd, options.entries);
  assert.equal(g.summary.error, 0);
  assert.ok(!g.modules.some(m => /bad.test|templates/.test(m.source)));
});

test('coverage guard refuses a graph that silently skips source files', t => {
  const options = fixture(t, {'src/lib/low.ts': 'export const n = 1;'});
  assert.throws(() => assertCoverage({modules: []}, options.cwd, options.entries), /skipped source files/);
});
