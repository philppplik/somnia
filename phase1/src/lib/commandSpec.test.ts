import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCommandId, commandToSpec, isCommandId, INTERACTIVE_ORIGINS } from './commandSpec';

test('command ids: dotted spec ids are accepted', () => {
  for (const id of ['edit.undo', 'view.splitLeftRight', 'md.h1', 'table.row.above', 'studio.code']) {
    assert.equal(isCommandId(id), true, id);
  }
});

test('command ids: bad ids are rejected', () => {
  for (const id of ['', 'undo', 'Edit.undo', 'edit..undo', 'edit.', '.undo', 'edit. undo', '2edit.undo', 'edit.un do', 'recovery.restore.src/index.html']) {
    assert.equal(isCommandId(id), false, id);
  }
  assert.throws(() => assertCommandId('undo'), /Invalid command id/);
  assert.doesNotThrow(() => assertCommandId('edit.undo'));
});

test('interactive origins exclude agent and mcp', () => {
  assert.ok(INTERACTIVE_ORIGINS.includes('palette'));
  assert.ok(INTERACTIVE_ORIGINS.includes('control'));
  assert.ok(!INTERACTIVE_ORIGINS.includes('agent'));
  assert.ok(!INTERACTIVE_ORIGINS.includes('mcp'));
});

test('commandToSpec adapts a legacy command without behaviour changes', async () => {
  let ran: unknown = 'unset';
  const spec = commandToSpec({
    id: 'legacy.free.form/id',
    title: 'Legacy',
    category: 'Tools',
    shortcut: 'Mod+1',
    keywords: ['a'],
    allowInInput: true,
    enabled: () => true,
    run: (payload) => { ran = payload; },
  });
  assert.equal(spec.id, 'legacy.free.form/id');
  assert.equal(spec.level, 'ui');
  assert.equal(spec.title, 'Legacy');
  assert.equal(spec.category, 'Tools');
  assert.equal(spec.shortcut, 'Mod+1');
  assert.deepEqual(spec.keywords, ['a']);
  assert.equal(spec.allowInInput, true);
  assert.equal(spec.enabled?.({ origin: 'ui' }), true);
  await spec.run({ x: 1 }, { origin: 'ui' });
  assert.deepEqual(ran, { x: 1 });
});

test('commandToSpec keeps optional fields absent when the legacy command omits them', () => {
  const spec = commandToSpec({ id: 'x.y', title: 't', category: 'View', run: () => {} });
  assert.equal('shortcut' in spec, false);
  assert.equal('keywords' in spec, false);
  assert.equal('allowInInput' in spec, false);
  assert.equal(spec.enabled, undefined);
});
