import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandDispatcher,
  CommandDispatchError,
  isCommandDispatchError,
  originAllows,
} from './commandDispatcher';
import type { CommandSpec } from './commandSpec';

const spec = (over: Partial<CommandSpec> = {}): CommandSpec => ({
  id: 'test.command',
  title: 'Test command',
  category: 'Tools',
  level: 'ui',
  run: () => 'done',
  ...over,
});

test('originAllows: read and propose are open, ui is interactive-only', () => {
  assert.equal(originAllows('read', 'mcp'), true);
  assert.equal(originAllows('propose', 'agent'), true);
  assert.equal(originAllows('ui', 'mcp'), false);
  assert.equal(originAllows('ui', 'agent'), false);
  assert.equal(originAllows('ui', 'palette'), true);
  assert.equal(originAllows('ui', 'control'), true);
});

test('register enforces dotted unique ids and object schemas', () => {
  const d = new CommandDispatcher();
  assert.throws(() => d.register(spec({ id: 'nodots' })), /Invalid command id/);
  d.register(spec());
  assert.throws(() => d.register(spec()), /already registered/);
  assert.throws(() => d.register(spec({ id: 'other.id', params: 'nope' as unknown as Record<string, unknown> })), /params schema must be an object/);
  assert.equal(d.has('test.command'), true);
  assert.equal(d.list().length, 1);
});

test('runCommand returns the result and records ok activity', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ run: () => 42 }));
  assert.equal(await d.runCommand('test.command', undefined, { origin: 'palette' }), 42);
  const log = d.recentActivity();
  assert.equal(log.length, 1);
  assert.equal(log[0].outcome, 'ok');
  assert.equal(log[0].id, 'test.command');
  assert.equal(log[0].origin, 'palette');
});

test('runCommand rejects unknown commands with an expected error', async () => {
  const d = new CommandDispatcher();
  const error = await d.runCommand('nope.nope', undefined, { origin: 'ui' }).catch(e => e);
  assert.ok(isCommandDispatchError(error));
  assert.equal(error.code, 'unknown-command');
  assert.equal(error.expected, true);
  assert.equal(d.recentActivity()[0].outcome, 'error');
});

test('runCommand refuses ui commands from agent and mcp origins', async () => {
  const d = new CommandDispatcher();
  let ran = false;
  d.register(spec({ run: () => { ran = true; } }));
  for (const origin of ['agent', 'mcp'] as const) {
    const error = await d.runCommand('test.command', undefined, { origin }).catch(e => e);
    assert.equal((error as CommandDispatchError).code, 'forbidden-origin');
    assert.equal((error as CommandDispatchError).expected, true);
  }
  assert.equal(ran, false);
  assert.deepEqual(d.recentActivity().map(a => a.outcome), ['forbidden', 'forbidden']);
});

test('runCommand lets agent and mcp origins run read and propose commands', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ level: 'read', run: () => 'r' }));
  d.register(spec({ id: 'test.stage', level: 'propose', run: () => 'p' }));
  assert.equal(await d.runCommand('test.command', undefined, { origin: 'mcp' }), 'r');
  assert.equal(await d.runCommand('test.stage', undefined, { origin: 'agent' }), 'p');
});

test('runCommand reports a disabled command without running it', async () => {
  const d = new CommandDispatcher();
  let ran = false;
  d.register(spec({ enabled: () => false, run: () => { ran = true; } }));
  const error = await d.runCommand('test.command', undefined, { origin: 'ui' }).catch(e => e);
  assert.equal((error as CommandDispatchError).code, 'disabled');
  assert.equal((error as CommandDispatchError).expected, true);
  assert.equal(ran, false);
  assert.equal(d.recentActivity()[0].outcome, 'disabled');
  assert.equal(d.isEnabled('test.command'), false);
  assert.equal(d.isEnabled('missing.command'), false);
});

test('runCommand validates params against the spec schema', async () => {
  const d = new CommandDispatcher();
  let seen: unknown;
  d.register(spec({
    level: 'read',
    params: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 }, count: { type: 'integer', minimum: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
    run: (params) => { seen = params; },
  }));
  const error = await d.runCommand('test.command', { path: 5, extra: true }, { origin: 'mcp' }).catch(e => e);
  assert.equal((error as CommandDispatchError).code, 'invalid-params');
  assert.ok((error as CommandDispatchError).issues!.length >= 1);
  assert.match((error as CommandDispatchError).message, /must be string/);
  assert.equal(seen, undefined);
  const missing = await d.runCommand('test.command', {}, { origin: 'mcp' }).catch(e => e);
  assert.equal((missing as CommandDispatchError).code, 'invalid-params');
  await d.runCommand('test.command', { path: 'a.html', count: 2 }, { origin: 'mcp' });
  assert.deepEqual(seen, { path: 'a.html', count: 2 });
  assert.deepEqual(d.recentActivity().map(a => a.outcome), ['invalid', 'invalid', 'ok']);
});

test('runCommand validates the result when a result schema is set', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ level: 'read', result: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] }, run: () => ({ wrong: true }) }));
  const error = await d.runCommand('test.command', undefined, { origin: 'agent' }).catch(e => e);
  assert.equal((error as CommandDispatchError).code, 'invalid-result');
  // A broken result shape is a defect in the command, not user input: it is an incident.
  assert.equal((error as CommandDispatchError).expected, false);
  assert.equal(d.recentActivity()[0].outcome, 'invalid');
  d.register(spec({ id: 'test.good', level: 'read', result: { type: 'integer' }, run: () => 7 }));
  assert.equal(await d.runCommand('test.good', undefined, { origin: 'agent' }), 7);
});

test('runCommand wraps thrown errors and keeps the legacy expected flag', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ id: 'test.plain', run: () => { throw new Error('boom'); } }));
  const plain = await d.runCommand('test.plain', undefined, { origin: 'ui' }).catch(e => e);
  assert.equal((plain as CommandDispatchError).code, 'failed');
  assert.equal((plain as CommandDispatchError).message, 'boom');
  assert.equal((plain as CommandDispatchError).expected, false);
  d.register(spec({ id: 'test.expected', run: () => { throw Object.assign(new Error('no folder open'), { expected: true }); } }));
  const expected = await d.runCommand('test.expected', undefined, { origin: 'ui' }).catch(e => e);
  assert.equal((expected as CommandDispatchError).expected, true);
  assert.deepEqual(d.recentActivity().map(a => a.outcome), ['error', 'error']);
});

test('runCommand honours the abort signal', async () => {
  const d = new CommandDispatcher();
  let ran = false;
  d.register(spec({ run: () => { ran = true; } }));
  const controller = new AbortController();
  controller.abort();
  const error = await d.runCommand('test.command', undefined, { origin: 'ui', signal: controller.signal }).catch(e => e);
  assert.equal((error as CommandDispatchError).code, 'aborted');
  assert.equal(ran, false);
});

test('tryRunCommand maps failures onto a result union', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ run: () => 'ok!' }));
  assert.deepEqual(await d.tryRunCommand('test.command'), { ok: true, result: 'ok!' });
  const bad = await d.tryRunCommand('missing.command');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error.code, 'unknown-command');
});

test('activity is observed, capped and free of argument contents', async () => {
  const d = new CommandDispatcher();
  const seen: string[] = [];
  const off = d.subscribeActivity(e => seen.push(`${e.id}:${e.outcome}`));
  d.register(spec({ level: 'read', params: { type: 'object' }, run: () => null }));
  await d.runCommand('test.command', { secret: 'token-value-123' }, { origin: 'mcp' });
  assert.deepEqual(seen, ['test.command:ok']);
  assert.ok(!JSON.stringify(d.recentActivity()).includes('token-value-123'));
  off();
  for (let i = 0; i < 250; i++) await d.runCommand('test.command', {}, { origin: 'test' });
  assert.ok(d.recentActivity().length <= 200);
});

test('unregister removes the spec and later runs report unknown', async () => {
  const d = new CommandDispatcher();
  const off = d.register(spec());
  off();
  off();
  assert.equal(d.has('test.command'), false);
  const error = await d.runCommand('test.command', undefined, { origin: 'ui' }).catch(e => e);
  assert.equal((error as CommandDispatchError).code, 'unknown-command');
});
