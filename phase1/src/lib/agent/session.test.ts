import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentSession } from './session';
import { AgentProjectTools } from './projectTools';
import type { AgentMessage, AgentProvider, AgentProviderEvent, AgentProviderRequest } from './types';

function provider(turns: AgentProviderEvent[][], seen: AgentProviderRequest[] = []): AgentProvider {
  let i = 0;
  return { id: 'fixture', locality: 'local', async *stream(request) { seen.push(request); yield* turns[i++] ?? []; } };
}
const stop: AgentProviderEvent = { type: 'finish', reason: 'stop' };
const call = (id: string) => ({ id, name: 'read_file', arguments: '{"path":"index.html"}' });
const tools = () => new AgentProjectTools({ projectId: 'p', files: () => ({ 'index.html': 'before' }), allowed: () => true });
const history: AgentMessage[] = [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }];

test('snapshot restore rejects incomplete, unmatched, duplicate and orphaned tool histories atomically', () => {
  const session = new AgentSession({ model: 'fixture', tools: tools(), provider: provider([]) });
  session.restore({ version: 1, projectId: 'p', messages: history });
  const before = session.snapshot();
  const bad: AgentMessage[][] = [
    [{ role: 'user', content: 'unfinished' }],
    [{ role: 'assistant', content: 'orphan' }],
    [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', toolCalls: [call('a')] }],
    [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', toolCalls: [call('a')] }, { role: 'tool', content: '{}', toolCallId: 'wrong' }],
    [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', toolCalls: [call('a'), call('a')] }],
    [{ role: 'user', content: 'x', toolCalls: [call('a')] }, { role: 'assistant', content: 'x' }],
    [{ role: 'user', content: 'x' }, { role: 'tool', content: '{}', toolCallId: 'a' }],
  ];
  for (const messages of bad) {
    assert.throws(() => session.restore({ version: 1, projectId: 'p', messages }));
    assert.deepEqual(session.snapshot(), before);
  }
});

test('restored multi-tool history is copied and replayed only with matched tool results', async () => {
  const seen: AgentProviderRequest[] = [], session = new AgentSession({ model: 'fixture', tools: tools(), provider: provider([[stop]], seen) });
  const messages: AgentMessage[] = [
    { role: 'user', content: 'read both' }, { role: 'assistant', content: '', toolCalls: [call('a'), call('b')] },
    { role: 'tool', content: 'b result', toolCallId: 'b' }, { role: 'tool', content: 'a result', toolCallId: 'a' },
    { role: 'assistant', content: 'done' },
  ];
  session.restore({ version: 1, projectId: 'p', messages }); messages[0].content = 'mutated';
  await session.prompt('next'); assert.equal(session.status, 'idle');
  assert.equal(seen[0].messages[1].content, 'read both');
  assert.equal(seen[0].messages.at(-1)?.content, 'next');
  assert.equal(session.snapshot().messages.length, 7);
});

test('failed follow-up does not erase or replay an incomplete turn over prior complete history', async () => {
  const seen: AgentProviderRequest[] = [], session = new AgentSession({ model: 'fixture', provider: provider([
    [{ type: 'text', text: 'partial' }, { type: 'finish', reason: 'content_filter' }], [{ type: 'text', text: 'retry done' }, stop],
  ], seen) });
  session.restore({ version: 1, projectId: null, messages: history });
  await session.prompt('failed prompt'); assert.equal(session.status, 'error');
  assert.deepEqual(session.snapshot().messages, history);
  await session.prompt('retry'); assert.equal(session.status, 'idle');
  assert.deepEqual(seen[1].messages.slice(1).map(m => m.content), ['previous', 'reply', 'retry']);
});

test('cumulative tool-call limit blocks a later write before a proposal can be staged', async () => {
  const projectTools = tools(); let executions = 0;
  const original = projectTools.execute.bind(projectTools);
  projectTools.execute = async (...args) => { executions++; return original(...args); };
  const session = new AgentSession({ model: 'fixture', tools: projectTools, maxToolCalls: 1, provider: provider([
    [{ type: 'tool-call', index: 0, id: 'a', name: 'read_file', arguments: '{"path":"index.html"}' }, { type: 'finish', reason: 'tool_calls' }],
    [{ type: 'tool-call', index: 0, id: 'b', name: 'write_file', arguments: '{"path":"index.html","content":"after"}' }, { type: 'finish', reason: 'tool_calls' }],
  ]) });
  await session.prompt('change'); assert.equal(session.status, 'error'); assert.equal(executions, 1, 'only the first, read-only tool may execute');
  assert.deepEqual(projectTools.proposals(), []); assert.deepEqual(session.snapshot().messages, []);
});

test('out-of-order fragmented tool indexes execute in index order', async () => {
  const seen: AgentProviderRequest[] = [], projectTools = tools();
  const session = new AgentSession({ model: 'fixture', tools: projectTools, provider: provider([[
    { type: 'tool-call', index: 1, id: 'b', name: 'read_file', arguments: '{"path":"index.html"}' },
    { type: 'tool-call', index: 0, id: 'a', name: 'read_', arguments: '{"path":' },
    { type: 'tool-call', index: 0, name: 'file', arguments: '"index.html"}' },
    { type: 'finish', reason: 'tool_calls' },
  ], [stop]], seen) });
  await session.prompt('read'); assert.equal(session.status, 'idle');
  assert.deepEqual(seen[1].messages.filter(m => m.role === 'tool').map(m => m.toolCallId), ['a', 'b']);
  assert.deepEqual(session.snapshot().messages[1].toolCalls?.map(c => c.name), ['read_file', 'read_file']);
});

test('cancel after staged write clears proposals but preserves completed prior history', async () => {
  const projectTools = tools(); let session: AgentSession;
  session = new AgentSession({ model: 'fixture', tools: projectTools, provider: provider([[
    { type: 'tool-call', index: 0, id: 'a', name: 'write_file', arguments: '{"path":"index.html","content":"after"}' },
    { type: 'finish', reason: 'tool_calls' },
  ]]), onEvent: event => { if (event.type === 'tool' && event.status === 'completed') session.cancel(); } });
  session.restore({ version: 1, projectId: 'p', messages: history });
  await session.prompt('change'); assert.equal(session.status, 'cancelled');
  assert.deepEqual(projectTools.proposals(), []); assert.deepEqual(session.snapshot().messages, history);
});

test('restore, clear and discard are blocked until the active turn settles', async () => {
  let release!: () => void;
  const held: AgentProvider = { id: 'fixture', locality: 'local', async *stream() { await new Promise<void>(resolve => { release = resolve; }); yield stop; } };
  const session = new AgentSession({ model: 'fixture', provider: held }); const pending = session.prompt('held');
  assert.throws(() => session.restore({ version: 1, projectId: null, messages: [] }), /during work/);
  assert.throws(() => session.clear(), /active turn/); assert.throws(() => session.discardProposals(), /during a turn/);
  session.cancel(); release(); await pending; session.clear(); assert.equal(session.status, 'idle');
});

test('timeout aborts provider work without admitting partial history', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const held: AgentProvider = { id: 'fixture', locality: 'local', async *stream(request) {
    await new Promise<void>(resolve => { request.signal.addEventListener('abort', () => resolve(), { once: true }); });
    yield stop;
  } };
  const session = new AgentSession({ model: 'fixture', provider: held, timeoutMs: 100 });
  const pending = session.prompt('held'); t.mock.timers.tick(100); await pending;
  assert.equal(session.status, 'error'); assert.deepEqual(session.snapshot().messages, []);
});

test('observer mutations cannot modify tool calls or authorize different files', async () => {
  const projectTools = tools();
  const session = new AgentSession({ model: 'fixture', tools: projectTools, provider: provider([[
    { type: 'tool-call', index: 0, id: 'a', name: 'write_file', arguments: '{"path":"index.html","content":"after"}' },
    { type: 'finish', reason: 'tool_calls' },
  ], [stop]]), onEvent: event => {
    if (event.type === 'tool') event.call.arguments = '{"path":"unexpected.css","content":"mutated"}';
    if (event.type === 'proposals') event.proposals[0].after = 'mutated';
  } });
  await session.prompt('change'); assert.equal(session.status, 'review');
  assert.equal(projectTools.proposals()[0].path, 'index.html'); assert.equal(projectTools.proposals()[0].after, 'after');
  session.discardProposals(); assert.equal(session.status, 'idle'); assert.deepEqual(projectTools.proposals(), []);
});
