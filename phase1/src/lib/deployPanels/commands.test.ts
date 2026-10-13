import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher, isCommandDispatchError } from '../commandDispatcher';
import type { CommandOrigin } from '../commandSpec';
import { deployPanelSpecs, type DeployPanelActions } from './commands';

function setup(over: Partial<DeployPanelActions> = {}) {
  const calls: string[] = [];
  const a: DeployPanelActions = {
    available: () => true, show: p => { calls.push(`show:${p}`); }, select: id => { calls.push(`select:${id}`); return id === 's1'; },
    dryRun: async id => { calls.push(`dry:${id ?? ''}`); return { files: 3, changed: 1, added: 1, removed: 1 }; },
    setDomain: async (id, d) => { calls.push(`domain:${id}:${d}`); return true; }, ...over,
  };
  const d = new CommandDispatcher();
  for (const s of deployPanelSpecs(a)) d.register(s as never);
  return { d, calls };
}
const run = (d: CommandDispatcher, id: string, p: unknown, origin: CommandOrigin = 'ui') => d.runCommand(id, p, { origin });

test('all four commands are ui level and run from a person', async () => {
  const { d, calls } = setup();
  assert.deepEqual(await run(d, 'deploy.panel.show', { panel: 'publish-log' }), { status: 'shown' });
  assert.deepEqual(await run(d, 'deploy.target.select', { targetId: 's1' }), { selected: true });
  assert.deepEqual(await run(d, 'deploy.dryrun', { targetId: 's1' }), { status: 'planned', files: 3, changed: 1, added: 1, removed: 1 });
  assert.deepEqual(await run(d, 'deploy.target.setDomain', { targetId: 's1', domain: 'example.com' }), { saved: true });
  assert.deepEqual(calls, ['show:publish-log', 'select:s1', 'dry:s1', 'domain:s1:example.com']);
});

test('agent, mcp, extension, macro and cli origins are refused and nothing runs', async () => {
  const { d, calls } = setup();
  for (const origin of ['agent', 'mcp', 'extension', 'macro', 'cli'] as CommandOrigin[]) {
    for (const [id, p] of [['deploy.panel.show', { panel: 'publish' }], ['deploy.target.select', { targetId: 's1' }], ['deploy.dryrun', {}], ['deploy.target.setDomain', { targetId: 's1', domain: 'a.com' }]] as const) {
      await assert.rejects(run(d, id, p, origin), e => isCommandDispatchError(e) && e.code === 'forbidden-origin', `${origin} ${id}`);
    }
  }
  assert.deepEqual(calls, []);
});

test('params are validated: unknown panel, bad target id and extra keys are rejected', async () => {
  const { d, calls } = setup();
  await assert.rejects(run(d, 'deploy.panel.show', { panel: 'nope' }));
  await assert.rejects(run(d, 'deploy.target.select', { targetId: '../x' }));
  await assert.rejects(run(d, 'deploy.dryrun', { targetId: 's1', token: 'x' }));
  await assert.rejects(run(d, 'deploy.target.setDomain', { targetId: 's1' }));
  assert.deepEqual(calls, []);
});

test('a failed dry run reports failure instead of throwing', async () => {
  const { d } = setup({ dryRun: async () => null });
  assert.deepEqual(await run(d, 'deploy.dryrun', {}), { status: 'failed' });
});
