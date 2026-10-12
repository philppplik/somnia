import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from '../commandDispatcher';
import { createControl, readPath, type ControlInspectSource } from './webControl';

const snap: ControlInspectSource = { activeStudio: 'code', activeFile: 'index.html', openFiles: ['index.html'], selectedElementIds: [], isDirty: false, projectName: 'p', panels: { agentOpen: true }, problems: [] };
function setup() {
  const d = new CommandDispatcher();
  d.register({ id: 'test.read', title: 'Read', category: 'Tools', level: 'read', run: () => 42 });
  d.register({ id: 'test.ui', title: 'Ui', category: 'Tools', level: 'ui', params: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }, run: (p: unknown) => (p as { n: number }).n * 2 });
  const legacyRan: string[] = [];
  const c = createControl({ dispatcher: d, readState: () => snap, legacy: { has: id => id === 'old.cmd', run: async id => { legacyRan.push(id); } } });
  return { d, c, legacyRan };
}

test('readPath reads dotted paths and never walks prototypes', () => {
  assert.equal(readPath(snap, 'panels.agentOpen'), true);
  assert.equal(readPath(snap, 'openFiles.0'), 'index.html');
  assert.equal(readPath(snap, 'nope.x'), undefined);
  assert.equal(readPath(snap, 'constructor'), undefined);
});

test('inspect returns a copy, not the live state', () => {
  const { c } = setup();
  c.inspect().openFiles = [];
  assert.deepEqual(c.inspect().openFiles, ['index.html']);
});

test('runCommand dispatches with origin control, validates params, records activity', async () => {
  const { c, d } = setup();
  assert.deepEqual(await c.runCommand('test.read'), { ok: true, result: 42 });
  assert.deepEqual(await c.runCommand('test.ui', { n: 4 }), { ok: true, result: 8 });
  const bad = await c.runCommand('test.ui', { n: 'x' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, 'invalid-params');
  assert.ok(d.recentActivity().every(a => a.origin === 'control'));
});

test('unknown ids fail, legacy ids fall back to the registry', async () => {
  const { c, legacyRan } = setup();
  const u = await c.runCommand('nope.x');
  assert.equal(u.ok === false && u.code, 'unknown-command');
  assert.deepEqual(await c.runCommand('old.cmd'), { ok: true, result: null, legacy: true });
  assert.deepEqual(legacyRan, ['old.cmd']);
});
