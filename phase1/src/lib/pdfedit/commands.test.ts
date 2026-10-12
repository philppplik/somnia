import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from '../commandDispatcher';
import { pdfCommandSpecs } from './commands';

function setup(session: any) {
  const calls: unknown[][] = [];
  const d = new CommandDispatcher();
  for (const spec of pdfCommandSpecs({
    name: 'a.pdf', getSession: () => session,
    exportCopy: async (n) => { calls.push(['export', n]); },
    rotate: async (n, p) => { calls.push(['rotate', n, p]); },
    history: async (n, dir) => { calls.push(['history', n, dir]); },
  })) d.register(spec);
  return { d, calls };
}
const live = { editing: true, busy: false, page: 3, undo: [new Uint8Array(1)], redo: [new Uint8Array(1)] };

test('levels: only rotate is open to agent origins', async () => {
  const { d } = setup(live);
  const lv = Object.fromEntries(d.list().map(c => [c.id, c.level]));
  assert.deepEqual(lv, { 'pdf.saveCopy': 'ui', 'pdf.page.rotate': 'propose', 'pdf.undo': 'ui', 'pdf.redo': 'ui' });
  await assert.rejects(d.runCommand('pdf.undo', {}, { origin: 'agent' }), { code: 'forbidden-origin' });
  await assert.rejects(d.runCommand('pdf.saveCopy', {}, { origin: 'mcp' }), { code: 'forbidden-origin' });
});

test('rotate defaults to the shown page and accepts an explicit 0-based page', async () => {
  const { d, calls } = setup(live);
  await d.runCommand('pdf.page.rotate', undefined, { origin: 'agent' });
  await d.runCommand('pdf.page.rotate', { page: 0 }, { origin: 'mcp' });
  assert.deepEqual(calls, [['rotate', 'a.pdf', 2], ['rotate', 'a.pdf', 0]]);
});

test('rotate rejects bad params', async () => {
  const { d } = setup(live);
  await assert.rejects(d.runCommand('pdf.page.rotate', { page: -1 }, { origin: 'agent' }), { code: 'invalid-params' });
  await assert.rejects(d.runCommand('pdf.page.rotate', { page: 1.5 }, { origin: 'agent' }), { code: 'invalid-params' });
  await assert.rejects(d.runCommand('pdf.page.rotate', { x: 1 }, { origin: 'agent' }), { code: 'invalid-params' });
});

test('enabled gates follow the session', async () => {
  const { d } = setup({ ...live, editing: false, undo: [], redo: [] });
  assert.equal(d.isEnabled('pdf.page.rotate'), false);
  assert.equal(d.isEnabled('pdf.undo'), false);
  assert.equal(d.isEnabled('pdf.redo'), false);
  assert.equal(d.isEnabled('pdf.saveCopy'), true);
  const busy = setup({ ...live, busy: true });
  assert.equal(busy.d.isEnabled('pdf.page.rotate'), false);
  assert.equal(busy.d.isEnabled('pdf.undo'), false);
});

test('undo, redo and save call through', async () => {
  const { d, calls } = setup(live);
  await d.runCommand('pdf.undo'); await d.runCommand('pdf.redo'); await d.runCommand('pdf.saveCopy');
  assert.deepEqual(calls, [['history', 'a.pdf', 'undo'], ['history', 'a.pdf', 'redo'], ['export', 'a.pdf']]);
});
