import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardFacade, MemoryTaskStore, TaskEngine, TaskError } from './index';
import type { SessionExport } from './index';

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
function setup() {
  const store = new MemoryTaskStore(); let n = 0, t = Date.parse('2026-10-10T12:00:00Z');
  const engine = new TaskEngine({ store, now: () => (t += 1000), newId: () => `bt${++n}` });
  let live: any = { treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1, headSha: null }; let buffers = 0; const written: SessionExport[] = [];
  const board = new BoardFacade({ engine, store, liveContent: async () => live, unsavedBuffers: () => buffers, writeExport: async e => { written.push(e); } });
  return { engine, store, board, written, setLive: (l: any) => { live = l; }, setBuffers: (b: number) => { buffers = b; } };
}
const spec = (o = {}) => ({ repoId: 'r', baseSha: BASE, intent: 'Make logo bigger\nmore detail', producer: { kind: 'builtin' as const, name: 'somnia-agent' }, ...o });
const code = (p: Promise<unknown>, c: string) => assert.rejects(p, (e: unknown) => e instanceof TaskError && e.code === c);

test('snapshot: frozen, versioned, projection fields, notifies only on change', async () => {
  const { engine, board } = setup(); let calls = 0; const off = board.subscribe(() => calls++);
  await engine.create(spec({ autoLocal: true })); const s1 = await board.refresh();
  assert.equal(s1.version, 1); assert.equal(calls, 1); assert.ok(Object.isFrozen(s1)); assert.ok(Object.isFrozen(s1.tasks));
  const v = s1.tasks[0]; assert.equal(v.title, 'Make logo bigger'); assert.equal(v.autoCommit, true); assert.equal(v.checkpoint, null); assert.equal(v.schemaVersion, 1);
  assert.deepEqual(s1.contents.bt1, { contentHash: 'C1', treeSha: 'T1', headSha: null, workspaceGeneration: 1 });
  assert.equal(await board.refresh(), s1); assert.equal(calls, 1); off();
});
test('guard: reflects engine decisions and blockers', async () => {
  const { engine, board, setBuffers } = setup(); await engine.create(spec());
  assert.deepEqual(await board.guard('bt1', 'commit'), { ok: true, decision: { kind: 'needs-review', reason: 'review-required' } });
  setBuffers(1); assert.deepEqual(await board.guard('bt1', 'run', 'agent'), { ok: false, code: 'unsaved-buffer' });
});
test('review binds to live content: stale shown snapshot rejected; matching accepted', async () => {
  const { engine, board, setLive } = setup(); await engine.create(spec());
  await code(board.review('bt1', 'approved', { treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1 }), 'invalid-transition');
  for (const x of ['preparing', 'running', 'review'] as const) await engine.transition('bt1', x);
  await code(board.review('bt1', 'approved', { treeSha: 'T0', contentHash: 'C1', workspaceGeneration: 1 }), 'stale-plan');
  const r = await board.review('bt1', 'approved', { treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1 });
  assert.equal(r.review?.decision, 'approved');
  setLive({ treeSha: 'T2', contentHash: 'C2', workspaceGeneration: 2, headSha: null });
  await code(board.review('bt1', 'approved', { treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1 }), 'stale-plan');
});
test('review rejected when result HEAD moved', async () => {
  const { engine, board, setLive } = setup(); const { task } = await engine.create(spec()); for (const x of ['preparing', 'running', 'review'] as const) await engine.transition('bt1', x); task.status = 'review'; task.headSha = HEAD; await (engine as any).d.store.putTask(task);
  setLive({ treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1, headSha: 'c'.repeat(40) });
  await code(board.review('bt1', 'approved', { treeSha: 'T1', contentHash: 'C1', workspaceGeneration: 1 }), 'stale-plan');
});
test('retry: new task from failed/cancelled only; blocked on uncertain outcome; keeps scope/budget/L1', async () => {
  const { engine, board, store } = setup(); await engine.create(spec({ autoLocal: true, allowedRoots: ['src'], budget: { maxTokens: 5 } }));
  await code(board.retry('bt1', BASE), 'invalid-transition');
  await board.cancel('bt1'); const t2 = await board.retry('bt1', 'd'.repeat(40));
  assert.equal(t2.taskId, 'bt2'); assert.equal(t2.gates.level, 'L1'); assert.deepEqual(t2.allowedRoots, ['src']); assert.equal(t2.budget.maxTokens, 5); assert.equal(t2.baseSha, 'd'.repeat(40));
  assert.equal((await store.getSession('bt2'))!.intent.split('\n')[0], 'Make logo bigger');
  await board.cancel('bt2'); const u = (await store.getTask('bt2'))!; u.outcome = 'uncertain'; await store.putTask(u);
  await code(board.retry('bt2', BASE), 'uncertain-outcome');
});
test('export: preview, confirm with shown hash, write only confirmed; tampered/unconfirmed never written', async () => {
  const { engine, board, written } = setup(); await engine.create(spec());
  const exp = await board.prepareExport('bt1'); assert.equal(exp.review.state, 'unreviewed');
  await code(board.saveExport(exp, 'f'.repeat(64)), 'stale-plan'); assert.equal(written.length, 0);
  await code(board.saveExport({ ...exp, intent: 'x' }, exp.review.contentHash), 'stale-plan'); assert.equal(written.length, 0);
  const ok = await board.saveExport(exp, exp.review.contentHash); assert.equal(ok.review.state, 'confirmed'); assert.equal(written.length, 1);
});
test('unavailable live content blocks guard (no silent proceed)', async () => {
  const store = new MemoryTaskStore(); const engine = new TaskEngine({ store, newId: () => 'z1' });
  const board = new BoardFacade({ engine, store, liveContent: async () => null, unsavedBuffers: () => 0, writeExport: async () => {} });
  await engine.create(spec()); assert.deepEqual(await board.guard('z1', 'commit'), { ok: false, code: 'stale-plan' });
});
