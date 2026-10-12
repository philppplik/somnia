import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FEATURES, type Feature } from './catalog';
import { evaluate, render, validateCatalog, type Inputs } from './model';

const inputs = (over: Partial<Inputs> = {}): Inputs => ({
  commandIds: new Set(['a.one', 'a.two']),
  studioIds: new Set(['code']),
  pathExists: p => p === 'x/exists.ts',
  sourceRegisters: () => false,
  ...over,
});
const f = (over: Partial<Feature>): Feature => ({ id: 'area.name', area: 'Area', name: 'N', dreamweaver: 'D', ...over });

test('all required parts present gives have', () => {
  assert.equal(evaluate(f({ commands: ['a.one', 'a.two'], studios: ['code'] }), inputs()).status, 'have');
});
test('some missing gives partial and names the gap', () => {
  const r = evaluate(f({ commands: ['a.one', 'a.gone'] }), inputs());
  assert.equal(r.status, 'partial');
  assert.deepEqual(r.absent, ['command a.gone']);
});
test('nothing present gives missing', () => {
  assert.equal(evaluate(f({ commands: ['a.gone'], evidence: ['x/nope.ts'] }), inputs()).status, 'missing');
});
test('manual status caps a registry result but never raises it', () => {
  assert.equal(evaluate(f({ commands: ['a.one'], status: 'partial' }), inputs()).status, 'partial');
  assert.equal(evaluate(f({ commands: ['a.gone'], status: 'have' }), inputs()).status, 'missing');
});
test('no requirements needs a manual status', () => {
  assert.throws(() => evaluate(f({}), inputs()));
  const r = evaluate(f({ status: 'missing' }), inputs());
  assert.equal(r.basis, 'manual');
});
test('runtime commands are checked against their source file', () => {
  const feat = f({ runtime: [{ id: 'r.x', source: 'src/a.ts' }] });
  assert.equal(evaluate(feat, inputs()).status, 'missing');
  assert.equal(evaluate(feat, inputs({ sourceRegisters: () => true })).status, 'have');
});
test('catalog validation catches duplicates and bad ids', () => {
  assert.equal(validateCatalog([f({}), f({})]).length, 1);
  assert.equal(validateCatalog([f({ id: 'BAD' })]).length, 1);
  assert.deepEqual(validateCatalog(FEATURES), []);
});
test('render is deterministic and escapes pipes', () => {
  const rows = [evaluate(f({ commands: ['a.one'], note: 'a|b' }), inputs())];
  assert.equal(render(rows), render(rows));
  assert.match(render(rows), /a\\\|b/);
  assert.match(render(rows), /1 features: 1 yes, 0 partial, 0 no\./);
});
