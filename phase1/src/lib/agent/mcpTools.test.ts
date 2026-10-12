import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpRegistry, grantedMcpTools, mcpDefinition, mcpToolName, registerMcpTools } from './mcpTools';
import type { McpToolInfo } from './mcpTools';
import { toolSchemaHash } from './toolRegistry';
import { AgentProjectTools } from './projectTools';

const info = (over: Partial<McpToolInfo> = {}): McpToolInfo => ({ server: 'docs', name: 'search', description: 'Find docs', input_schema: { type: 'object', properties: { q: { type: 'string' } } }, ...over });
const grantFor = (t: McpToolInfo) => ({ [mcpDefinition(t).name]: toolSchemaHash(mcpDefinition(t)) });

test('names are namespaced, safe and bounded', () => {
  assert.equal(mcpToolName('docs', 'search'), 'mcp_docs__search');
  const odd = mcpToolName('My Server', 'Do/Thing!');
  assert.match(odd, /^[a-z][a-z0-9_]{1,47}$/);
  const long = mcpToolName('s', 'x'.repeat(80));
  assert.ok(long.length <= 48);
  assert.notEqual(mcpToolName('a', 'b-c'), mcpToolName('a', 'b_c'));
});
test('grants bind to the schema: a changed description or schema loses the grant', () => {
  const t = info();
  assert.equal(grantedMcpTools([t], grantFor(t)).length, 1);
  assert.equal(grantedMcpTools([info({ description: 'Now also deletes' })], grantFor(t)).length, 0);
  assert.equal(grantedMcpTools([info({ input_schema: { type: 'object', properties: { q: { type: 'number' } } } })], grantFor(t)).length, 0);
  assert.equal(grantedMcpTools([t], {}).length, 0);
});
const mk = (approve: (c: any) => Promise<boolean>, calls: any[] = []) => {
  const reg = createMcpRegistry(), t = info();
  registerMcpTools(reg, [t, info({ name: 'ungranted' })], grantFor(t), { call: async (s, n, a) => { calls.push([s, n, a]); return 'hit'; } }, approve);
  return { reg, calls, tools: new AgentProjectTools({ projectId: 'p', files: () => ({}), allowed: () => true }, undefined, undefined, { registry: reg, grants: { levels: ['read', 'propose', 'execute'] } }) };
};
const run = (t: AgentProjectTools, name: string, args: object) => t.execute({ id: '1', name, arguments: JSON.stringify(args) }, new AbortController().signal);

test('only granted tools exist, and execute level is off unless enabled', async () => {
  const { reg } = mk(async () => true);
  assert.deepEqual(reg.definitions({ levels: ['read', 'propose', 'execute'] }).map(d => d.name), ['mcp_docs__search']);
  assert.deepEqual(reg.definitions(), []);
});
test('every call needs human approval, result is marked untrusted', async () => {
  const seen: any[] = [];
  const ok = mk(async c => { seen.push(c); return true; });
  const out = JSON.parse(await run(ok.tools, 'mcp_docs__search', { q: 'x' }));
  assert.deepEqual([out.untrusted, out.text, out.server], [true, 'hit', 'docs']);
  assert.deepEqual(seen[0], { server: 'docs', tool: 'search', args: { q: 'x' } });
  const no = mk(async () => false);
  await assert.rejects(run(no.tools, 'mcp_docs__search', { q: 'x' }), /did not approve/);
  assert.equal(no.calls.length, 0);
});
test('default grants never reach MCP tools', async () => {
  const { reg } = mk(async () => true);
  const t = new AgentProjectTools({ projectId: 'p', files: () => ({}), allowed: () => true }, undefined, undefined, { registry: reg });
  await assert.rejects(run(t, 'mcp_docs__search', { q: 'x' }), /Unknown agent tool/);
  assert.ok(!t.definitions().some(d => d.name.startsWith('mcp_')));
});

test('AllowForRun and granted decisions reach the bridge as the broker expects, and a revoked grant asks again', async () => {
  const reg = createMcpRegistry(), t = info();
  const sent: any[] = [];
  let revoked = false;
  const decisions: any[] = ['granted', 'allow_for_run'];
  const asked: any[] = [];
  registerMcpTools(reg, [t], grantFor(t), { call: async (_s, _n, _a, choice) => { sent.push(choice); if (!choice && revoked) throw Error('mcp_consent_required'); return 'hit'; } }, async (_c, _s, opts) => { asked.push(!!opts?.forcePrompt); return decisions.shift(); });
  const tools = new AgentProjectTools({ projectId: 'p', files: () => ({}), allowed: () => true }, undefined, undefined, { registry: reg, grants: { levels: ['read', 'propose', 'execute'] } });
  // 1: an existing grant covers the call: no choice is sent.
  await run(tools, 'mcp_docs__search', { q: 'x' });
  assert.deepEqual(sent, [undefined]);
  // 2: the grant was revoked meanwhile: the broker says consent is required, the user is asked once (forced prompt) and the answer is sent.
  revoked = true; decisions.unshift('granted');
  await run(tools, 'mcp_docs__search', { q: 'x' });
  assert.deepEqual(sent, [undefined, undefined, 'allow_for_run']);
  assert.deepEqual(asked, [false, false, true]);
});
test('a revoked grant never loops: a second "granted" answer is refused', async () => {
  const reg = createMcpRegistry(), t = info();
  registerMcpTools(reg, [t], grantFor(t), { call: async () => { throw Error('mcp_consent_required'); } }, async () => 'granted');
  const tools = new AgentProjectTools({ projectId: 'p', files: () => ({}), allowed: () => true }, undefined, undefined, { registry: reg, grants: { levels: ['read', 'propose', 'execute'] } });
  await assert.rejects(run(tools, 'mcp_docs__search', { q: 'x' }), /did not approve/);
});
