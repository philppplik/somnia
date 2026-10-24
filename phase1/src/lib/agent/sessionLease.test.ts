import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentSession } from './session';
import { AgentProjectTools } from './projectTools';
import { jobScheduler } from '../jobs/scheduler';
import type { AgentProvider, AgentProviderEvent } from './types';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const stop: AgentProviderEvent = { type: 'finish', reason: 'stop' };
/** Provider whose stream waits on a gate, so tests can observe the lease mid-turn. */
function gatedProvider(gate: { promise: Promise<void> }): AgentProvider {
  return { id: 'fixture', locality: 'local', async *stream(request) {
    await gate.promise;
    if (request.signal.aborted) return;
    yield stop;
  } };
}
const tools = () => new AgentProjectTools({ projectId: 'p', files: () => ({}), allowed: () => true });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('an agent turn holds an agent.turn lease for its whole duration and releases it on completion', async () => {
  const gate = deferred();
  const session = new AgentSession({ model: 'fixture', provider: gatedProvider(gate), tools: tools() });
  const turn = session.prompt('hello');
  try {
    await wait(25); // let the turn acquire the lease and enter the provider stream
    assert.ok(jobScheduler.needsResource('agent.turn'), 'the running turn reserves agent.turn');
    const job = jobScheduler.list().find(r => r.kind === 'ai' && r.state === 'running');
    assert.ok(job, 'the turn is visible as a running ai job');
    assert.equal(job!.documentId, 'p');
  } finally {
    gate.resolve();
  }
  await turn;
  assert.equal(session.status, 'idle');
  assert.ok(!jobScheduler.needsResource('agent.turn'), 'the lease is released when the turn completes');
  assert.ok(!jobScheduler.list().some(r => r.kind === 'ai' && r.state === 'running'), 'no ai job remains running');
});

test('cancel aborts the turn, releases the lease as cancelled and leaves no dangling reservation', async () => {
  const gate = deferred();
  const session = new AgentSession({ model: 'fixture', provider: gatedProvider(gate), tools: tools() });
  const turn = session.prompt('hello');
  try {
    await wait(25);
    assert.ok(jobScheduler.needsResource('agent.turn'));
    session.cancel();
  } finally {
    gate.resolve(); // the provider stream unblocks; the turn observes the abort
  }
  await turn;
  assert.equal(session.status, 'cancelled');
  assert.ok(!jobScheduler.needsResource('agent.turn'), 'the lease is released after abort');
  const done = jobScheduler.list().filter(r => r.kind === 'ai');
  assert.ok(done.some(r => r.state === 'cancelled'), 'the released lease is recorded as cancelled, not completed');
  assert.ok(!done.some(r => r.state === 'running' || r.state === 'queued'), 'no dangling ai reservation blocks the queue');
});
