import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, listCommands, commandEnabled } from './commands';
import { commandDispatcher } from './commandDispatcher';
import { registerCommandSpec } from './commandBridge';
import { getState } from '../store/appStore';

test('registerCommandSpec makes a spec visible to palette, shortcuts and executeCommand', async () => {
  let ran = 0;
  const off = registerCommandSpec({
    id: 'test.bridge', title: 'Bridge test', category: 'Tools', shortcut: 'Mod+Alt+9',
    level: 'ui', run: () => { ran++; },
  });
  try {
    const listed = listCommands().find(c => c.id === 'test.bridge');
    assert.ok(listed, 'legacy registry lists the spec');
    assert.equal(listed.shortcut, 'Mod+Alt+9');
    assert.equal(commandEnabled(listed), true);
    assert.equal(await executeCommand('test.bridge'), true);
    assert.equal(ran, 1);
    assert.ok(getState().recentCommands.includes('test.bridge'));
    assert.equal(commandDispatcher.recentActivity().at(-1)?.id, 'test.bridge');
    assert.equal(commandDispatcher.recentActivity().at(-1)?.outcome, 'ok');
  } finally { off(); }
  assert.equal(listCommands().some(c => c.id === 'test.bridge'), false);
  assert.equal(commandDispatcher.has('test.bridge'), false);
});

test('a disabled spec routes through the legacy unavailable notice', async () => {
  let open = false;
  const off = registerCommandSpec({
    id: 'test.gated', title: 'Gated test', category: 'Tools', level: 'ui',
    enabled: () => open, run: () => {},
  });
  try {
    assert.equal(commandEnabled(listCommands().find(c => c.id === 'test.gated')!), false);
    assert.equal(await executeCommand('test.gated'), false);
    assert.match(getState().notice, /unavailable/);
    open = true;
    assert.equal(commandEnabled(listCommands().find(c => c.id === 'test.gated')!), true);
    assert.equal(await executeCommand('test.gated'), true);
  } finally { off(); }
});

test('dispatcher validation failures surface as the legacy command failure notice', async () => {
  const off = registerCommandSpec({
    id: 'test.params', title: 'Params test', category: 'Tools', level: 'ui',
    params: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] },
    run: () => {},
  });
  try {
    assert.equal(await executeCommand('test.params', { n: 'nope' }), false);
    assert.match(getState().notice, /Invalid parameters/);
    const last = commandDispatcher.recentActivity().at(-1)!;
    assert.equal(last.outcome, 'invalid');
    assert.equal(last.code, 'invalid-params');
  } finally { off(); }
});
