import test from 'node:test';
import assert from 'node:assert/strict';
import { commandRegistry, registerCommand, registerCommandScope, scopedCommand, type Command } from './commandRegistry';
import { registerCommandSpec } from './commandBridge';
import { commandDispatcher } from './commandDispatcher';

// This file deliberately never imports commands.ts: the registry and bridge must work
// without loading the orchestration entry or any core/studio registrations.
test('registry and spec bridge are usable before the orchestrator loads', async () => {
  assert.equal(commandRegistry.size, 0);
  assert.equal(commandDispatcher.list().length, 0);
  let runs = 0;
  const off = registerCommandSpec({
    id: 'test.isolated', title: 'Isolated command', category: 'Tools', level: 'ui',
    run: () => { runs++; },
  });
  try {
    assert.equal(commandRegistry.size, 1);
    await commandRegistry.get('test.isolated')!.run();
    assert.equal(runs, 1);
    assert.equal(commandDispatcher.recentActivity().at(-1)?.id, 'test.isolated');
  } finally { off(); }
  assert.equal(commandRegistry.size, 0);
  assert.equal(commandDispatcher.has('test.isolated'), false);
});

test('registry scope precedence, fallthrough and disposal preserve global commands', () => {
  const command: Command = { id: 'test.scope', title: 'Global', category: 'Edit', run() {} };
  const lower: Command = { ...command, title: 'Lower' };
  const upper: Command = { ...command, title: 'Upper' };
  const offGlobal = registerCommand(command);
  const offLower = registerCommandScope(id => id === command.id ? lower : undefined);
  const offUpper = registerCommandScope(id => id === command.id ? upper : undefined);
  const offEmpty = registerCommandScope(() => undefined);
  try {
    assert.equal(scopedCommand(command.id), upper);
    assert.equal(scopedCommand('test.unknown'), undefined);
    offUpper();
    assert.equal(scopedCommand(command.id), lower);
    offLower();
    assert.equal(scopedCommand(command.id), undefined);
    assert.equal(commandRegistry.get(command.id), command);
  } finally { offEmpty(); offUpper(); offLower(); offGlobal(); }
});
