import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher } from '../commandDispatcher';
import type { CommandSpec } from '../commandSpec';
import { AgentToolRegistry, toolSchemaHash } from './toolRegistry';
import { bindCommandTools, commandToolDefinition, commandToolName, registerCommandTools } from './commandTools';

const spec = (over: Partial<CommandSpec<any, any>> & { id: string }): CommandSpec<any, any> =>
  ({ title: 'T', category: 'Tools', level: 'read', run: () => ({ ok: true }), ...over });
const ctx = { files: () => ({}), propose: async () => {} };
const sig = () => new AbortController().signal;

test('names are stable snake_case with the cmd_ prefix', () => {
  assert.equal(commandToolName('design.getState'), 'cmd_design_get_state');
  assert.equal(commandToolName('vector.toSvg'), 'cmd_vector_to_svg');
  assert.equal(commandToolName('a.' + 'x'.repeat(60)), undefined);
});

test('only read and propose specs become tools; ui never does and execute cannot be created', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ id: 'x.read', level: 'read' }));
  d.register(spec({ id: 'x.prop', level: 'propose' }));
  d.register(spec({ id: 'x.ui', level: 'ui' }));
  const r = new AgentToolRegistry();
  const out = registerCommandTools(r, d);
  assert.deepEqual(out.registered.sort(), ['cmd_x_prop', 'cmd_x_read']);
  assert.deepEqual(out.skipped, [{ id: 'x.ui', reason: 'not-bridgeable' }]);
  assert.equal(r.level('cmd_x_read'), 'read');
  assert.equal(r.level('cmd_x_prop'), 'propose');
  assert.deepEqual(r.definitions({ levels: ['read'] }).map(x => x.name), ['cmd_x_read']);
});

test('calls go through the dispatcher with agent/mcp origin, validated and logged', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ id: 'x.sum', params: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false }, run: (p: { n: number }) => ({ n: p.n + 1 }) }));
  const r = new AgentToolRegistry();
  registerCommandTools(r, d, { origin: 'mcp' });
  assert.equal(await r.run('cmd_x_sum', { n: 1 }, ctx, sig()), '{"n":2}');
  assert.equal(d.recentActivity().at(-1)?.origin, 'mcp');
  await assert.rejects(r.run('cmd_x_sum', { n: 'a' }, ctx, sig()));
  assert.equal(d.recentActivity().at(-1)?.outcome, 'invalid');
});

test('level is rechecked at call time against the live spec', async () => {
  const d = new CommandDispatcher();
  const off = d.register(spec({ id: 'x.swap', level: 'read' }));
  const r = new AgentToolRegistry();
  registerCommandTools(r, d);
  off();
  d.register(spec({ id: 'x.swap', level: 'ui' }));
  await assert.rejects(r.run('cmd_x_swap', {}, ctx, sig()), /Unknown agent tool/);
});

test('name collisions with existing tools are skipped, not replaced', () => {
  const d = new CommandDispatcher();
  d.register(spec({ id: 'x.read' }));
  const r = new AgentToolRegistry();
  r.register({ level: 'read', definition: { name: 'cmd_x_read', description: 'old', parameters: {} }, run: async () => 'old' });
  const out = registerCommandTools(r, d);
  assert.deepEqual(out.skipped, [{ id: 'x.read', reason: 'name-taken' }]);
  assert.equal(r.definitions()[0]!.description, 'old');
});

test('hash binds to id, title and params and ignores run and enabled', () => {
  const a = commandToolDefinition(spec({ id: 'x.h', title: 'Hello' }) as never)!;
  const same = commandToolDefinition(spec({ id: 'x.h', title: 'Hello', run: () => 1, enabled: () => false }) as never)!;
  const retitled = commandToolDefinition(spec({ id: 'x.h', title: 'Hello2' }) as never)!;
  const reparam = commandToolDefinition(spec({ id: 'x.h', title: 'Hello', params: { type: 'object', properties: { a: { type: 'string' } } } }) as never)!;
  assert.equal(toolSchemaHash(a), toolSchemaHash(same));
  assert.notEqual(toolSchemaHash(a), toolSchemaHash(retitled));
  assert.notEqual(toolSchemaHash(a), toolSchemaHash(reparam));
  // Pinned: a change here silently invalidates stored grants. Update only with a documented migration.
  assert.equal(toolSchemaHash(a), 'b2ab08cf');
});

test('bindCommandTools follows late registration and removal, dispose cleans up', () => {
  const d = new CommandDispatcher();
  const r = new AgentToolRegistry();
  const off = bindCommandTools(r, d);
  assert.equal(r.has('cmd_late_read'), false);
  const unreg = d.register(spec({ id: 'late.read' }));
  assert.equal(r.has('cmd_late_read'), true);
  d.register(spec({ id: 'late.ui', level: 'ui' }));
  assert.equal(r.has('cmd_late_ui'), false);
  unreg();
  assert.equal(r.has('cmd_late_read'), false);
  d.register(spec({ id: 'late.two' }));
  off();
  assert.equal(r.has('cmd_late_two'), false);
  d.register(spec({ id: 'late.three' }));
  assert.equal(r.has('cmd_late_three'), false);
});

test('a guard failure blocks the call', async () => {
  const d = new CommandDispatcher();
  d.register(spec({ id: 'x.g' }));
  const r = new AgentToolRegistry();
  registerCommandTools(r, d, { guard: () => { throw Error('scope'); } });
  await assert.rejects(r.run('cmd_x_g', {}, ctx, sig()), /scope/);
});
