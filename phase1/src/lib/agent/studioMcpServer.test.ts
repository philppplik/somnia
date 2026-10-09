import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioMcpServer } from './studioMcpServer';
import { AgentToolRegistry } from './toolRegistry';
import type { AgentToolContext } from './toolRegistry';
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const ctx = { files: () => ({}), propose: async () => {} } as AgentToolContext;
const reg = (studio: string, staged: string[]) => new AgentToolRegistry({ allowExecute: true })
  .register({ level: 'read', definition: { name: `${studio}_inspect`, description: 'Inspect', parameters: obj({}) }, run: async () => '{"ok":true}' })
  .register({ level: 'propose', definition: { name: `${studio}_propose`, description: 'Propose', parameters: obj({ v: { type: 'integer', minimum: 0 } }, ['v']) }, run: async a => { staged.push(String(a.v)); return '{"state":"proposed"}'; } })
  .register({ level: 'execute', definition: { name: `${studio}_run`, description: 'Run', parameters: obj({}) }, run: async () => 'boom' });
const mk = (over: Partial<ConstructorParameters<typeof StudioMcpServer>[0]> = {}) => {
  const staged: string[] = []; const log: string[] = []; let on = true;
  const s = new StudioMcpServer({ sources: [{ studio: 'sound', registry: reg('sound', staged) }, { studio: 'deck', registry: reg('deck', staged) }], context: () => ctx, enabled: () => on, onCall: r => log.push(`${r.tool}:${r.outcome}`), ...over });
  return { s, staged, log, off: () => { on = false; } };
};
const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, params });
test('initialize negotiates the protocol and lists tools capability', async () => {
  const { s } = mk();
  const r = await s.handle(rpc(1, 'initialize', { protocolVersion: '2024-11-05' })) as { result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } } };
  assert.equal(r.result.protocolVersion, '2024-11-05'); assert.ok(r.result.capabilities.tools); assert.equal(r.result.serverInfo.name, 'somnia');
  const r2 = await s.handle(rpc(2, 'initialize', { protocolVersion: '1999-01-01' })) as { result: { protocolVersion: string } };
  assert.equal(r2.result.protocolVersion, '2025-06-18');
});
test('notifications get no answer; malformed messages get an error', async () => {
  const { s } = mk();
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(((await s.handle('x')) as { error: { code: number } }).error.code, -32600);
  assert.equal(((await s.handle(rpc(3, 'nope'))) as { error: { code: number } }).error.code, -32601);
});
test('tools/list exposes read and propose tools of all studios and never execute tools', async () => {
  const { s } = mk();
  const r = await s.handle(rpc(1, 'tools/list')) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
  assert.deepEqual(r.result.tools.map(t => t.name), ['sound_inspect', 'sound_propose', 'deck_inspect', 'deck_propose']);
  assert.equal(r.result.tools[0].annotations.readOnlyHint, true); assert.equal(r.result.tools[1].annotations.readOnlyHint, false);
  const x = await s.handle(rpc(2, 'tools/call', { name: 'sound_run', arguments: {} })) as { error: { code: number } };
  assert.equal(x.error.code, -32602);
});
test('calls run, validate arguments first, and report without arguments', async () => {
  const { s, staged, log } = mk();
  const ok = await s.handle(rpc(1, 'tools/call', { name: 'deck_propose', arguments: { v: 4 } })) as { result: { isError: boolean } };
  assert.equal(ok.result.isError, false); assert.deepEqual(staged, ['4']);
  const bad = await s.handle(rpc(2, 'tools/call', { name: 'deck_propose', arguments: { v: -1 } })) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /at least 0/); assert.deepEqual(staged, ['4']);
  assert.deepEqual(log, ['deck_propose:ok', 'deck_propose:invalid']);
});
test('server is inert while disabled and rate limited when enabled', async () => {
  const m = mk({ maxCallsPerMinute: 2 });
  for (let i = 0; i < 2; i++) await m.s.handle(rpc(i, 'tools/call', { name: 'sound_inspect' }));
  const lim = await m.s.handle(rpc(9, 'tools/call', { name: 'sound_inspect' })) as { result: { isError: boolean } };
  assert.equal(lim.result.isError, true); assert.equal(m.log.at(-1), 'sound_inspect:limited');
  m.off(); const off = await m.s.handle(rpc(10, 'tools/list')) as { error: { message: string } };
  assert.match(off.error.message, /turned off/);
});
test('duplicate tool names across studios are refused at construction', () => {
  assert.throws(() => new StudioMcpServer({ sources: [{ studio: 'a', registry: reg('x', []) }, { studio: 'b', registry: reg('x', []) }], context: () => ctx, enabled: () => true }), /Duplicate/);
});
