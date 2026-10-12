import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, listCommands, defaultShortcut, commandEnabled } from '../commands';
import { commandDispatcher, CommandDispatcher, CommandDispatchError } from '../commandDispatcher';
import { registerRasterCommands, type RasterCommandActions } from './rasterCommands';
import { createRasterState, rasterCommit, rasterUndo, rasterRedo } from '../../store/rasterState';

function fixture() {
  const calls: string[] = [];
  const actions: RasterCommandActions = {
    active: true, busy: false, source: {}, docState: { past: [1], future: [2] },
    undo: () => { calls.push('undo'); }, redo: () => { calls.push('redo'); },
    save: async () => { calls.push('save'); }, close: () => { calls.push('close'); },
    openFile: async () => { calls.push('open'); },
  };
  const dispatcher = new CommandDispatcher();
  const off = registerRasterCommands(() => actions, key => `Photo ${key}`, dispatcher);
  return { actions, calls, dispatcher, off };
}
const ids = ['edit.undo', 'edit.redo', 'project.save', 'tab.close', 'tools.editImage'];

test('scoped specs preserve palette IDs, shortcuts, translations and global dispatcher entries', async () => {
  const before = listCommands().map(c => c.id);
  const global = commandDispatcher.list();
  const shortcuts = ids.map(defaultShortcut);
  const f = fixture();
  try {
    assert.deepEqual(listCommands().map(c => c.id), before);
    assert.deepEqual(commandDispatcher.list(), global);
    assert.deepEqual(ids.map(defaultShortcut), shortcuts);
    assert.equal(listCommands().find(c => c.id === 'edit.undo')!.title, 'Photo imageeditor.undo');
    assert.equal(listCommands().find(c => c.id === 'project.save')!.allowInInput, true);
    assert.equal(listCommands().find(c => c.id === 'tab.close')!.shortcut, 'Mod+W');
    for (const id of ids) assert.equal(await executeCommand(id), true);
    assert.deepEqual(f.calls, ['undo', 'redo', 'save', 'close', 'open']);
    assert.deepEqual(f.dispatcher.recentActivity().map(c => [c.id, c.origin, c.outcome]), ids.map(id => [id, 'ui', 'ok']));
    f.actions.active = false;
    assert.notEqual(listCommands().find(c => c.id === 'edit.undo')!.title, 'Photo imageeditor.undo');
    assert.equal(f.dispatcher.isEnabled('edit.undo'), false);
  } finally { f.off(); }
  assert.deepEqual(listCommands().map(c => c.id), before);
  assert.deepEqual(f.dispatcher.list(), []);
  f.off(); // teardown is idempotent
});

test('busy, missing source and raster/retained-layer history enablement reads live state', () => {
  const f = fixture();
  const enabled = (id: string) => commandEnabled(listCommands().find(c => c.id === id)!);
  try {
    f.actions.busy = true;
    for (const id of ids) assert.equal(enabled(id), false);
    f.actions.busy = false;
    f.actions.source = null;
    assert.equal(enabled('project.save'), false);
    assert.equal(enabled('tab.close'), true);
    f.actions.docState = { past: [], future: [] };
    assert.equal(enabled('edit.undo'), false);
    assert.equal(enabled('edit.redo'), false);
    f.actions.source = { layerSession: { query: { undo: 1, redo: 0 } } };
    assert.equal(enabled('edit.undo'), true);
    assert.equal(enabled('edit.redo'), false);
    f.actions.docState = { past: [1], future: [2] };
    f.actions.source.layerSession!.query = { undo: 0, redo: 1 };
    assert.equal(enabled('edit.undo'), false, 'zero layer undo must not fall back to raster history');
    assert.equal(enabled('edit.redo'), true);
  } finally { f.off(); }
});

test('immediate Raster actions refuse agent/MCP and unknown payloads without mutation', async () => {
  const f = fixture();
  const rejected = (code: string) => (e: unknown) => e instanceof CommandDispatchError && e.code === code;
  try {
    for (const id of ids) {
      assert.equal(f.dispatcher.get(id)!.level, 'ui');
      for (const origin of ['agent', 'mcp'] as const) {
        await assert.rejects(f.dispatcher.runCommand(id, {}, { origin }), rejected('forbidden-origin'));
      }
      for (const params of [{ path: 'other.png' }, { format: 'jpeg' }, [], 1]) {
        await assert.rejects(f.dispatcher.runCommand(id, params, { origin: 'ui' }), rejected('invalid-params'));
      }
    }
    assert.deepEqual(f.calls, []);
    assert.equal(await executeCommand('project.save', { overwrite: true }), false);
    assert.deepEqual(f.calls, []);
    await f.dispatcher.runCommand('edit.undo', {}, { origin: 'shortcut' });
    assert.deepEqual(f.calls, ['undo']);
    assert.equal(JSON.stringify(f.dispatcher.recentActivity()).includes('overwrite'), false);
  } finally { f.off(); }
});

test('run delegates to the owner and walks its real raster history without a second stack', async () => {
  const f = fixture();
  let state = createRasterState();
  state = rasterCommit(state, { ...state.now, adjust: { ...state.now.adjust, brightness: 0.2 } });
  f.actions.docState = state;
  f.actions.undo = () => { state = rasterUndo(state); f.actions.docState = state; };
  f.actions.redo = () => { state = rasterRedo(state); f.actions.docState = state; };
  try {
    const after = state.now;
    await executeCommand('edit.undo');
    assert.equal(state.past.length, 0);
    assert.equal(state.future.length, 1);
    await executeCommand('edit.redo');
    assert.deepEqual(state.now, after);
    assert.equal(state.past.length, 1);
    assert.equal(state.future.length, 0);
  } finally { f.off(); }
});

test('run awaits async owner operations and reports failures without cross-studio fallback', async () => {
  const f = fixture();
  let finish!: () => void;
  f.actions.save = () => new Promise<void>(resolve => { finish = resolve; });
  try {
    const run = f.dispatcher.runCommand('project.save');
    assert.equal(f.dispatcher.recentActivity().length, 0);
    finish(); await run;
    assert.equal(f.dispatcher.recentActivity().at(-1)!.outcome, 'ok');
    f.actions.openFile = async () => { throw Error('Picker failed'); };
    await assert.rejects(f.dispatcher.runCommand('tools.editImage'), /Picker failed/);
    assert.equal(f.dispatcher.recentActivity().at(-1)!.outcome, 'error');
    assert.deepEqual(f.calls, []);
  } finally { f.off(); }
});

test('failed registration cleans up partial specs and does not install a scope', () => {
  const f = fixture();
  const dispatcher = new CommandDispatcher();
  const offConflict = dispatcher.register({ id: 'edit.redo', title: 'Existing', category: 'Edit', level: 'ui', run: () => {} });
  try {
    assert.throws(() => registerRasterCommands(() => f.actions, k => k, dispatcher), /already registered/);
    assert.deepEqual(dispatcher.list().map(s => s.id), ['edit.redo']);
  } finally { f.off(); offConflict(); }
});
