import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDispatcher, CommandDispatchError } from '../commandDispatcher';
import { commandDispatcher } from '../commandDispatcher';
import { executeCommand, listCommands } from '../commands';
import { getState, patchState } from '../../store/appStore';
import { vectorCommandsReady } from '../../store/vectorBootstrap';
import { vectorCommandSpecs, registerVectorCommands } from './commands';
import { VECTOR_CATALOGUES } from './i18n';
import { rectPath } from './shapes';
import * as S from './session';

const activeVector = () => getState().activeStudio === 'vector';

function dispatcher() {
  const d = new CommandDispatcher();
  for (const spec of vectorCommandSpecs(activeVector)) d.register(spec);
  return d;
}
const run = (d: CommandDispatcher, id: string, params?: unknown) => d.runCommand(`vector.${id}`, params, { origin: 'test' });
const rejects = (d: CommandDispatcher, id: string, params: unknown, code = 'invalid-params') =>
  assert.rejects(run(d, id, params), (e: unknown) => e instanceof CommandDispatchError && e.code === code);
test.beforeEach(() => { S.resetVectorSession(); patchState({ activeStudio: 'vector' }); });

test('studio loads 28 strict specs into dispatcher and legacy palette with localized titles', async () => {
  await vectorCommandsReady;
  assert.equal(vectorCommandSpecs(activeVector).length, 28);
  for (const spec of vectorCommandSpecs(activeVector)) {
    assert.equal(commandDispatcher.has(spec.id), true);
    assert.ok(listCommands().find(c => c.id === spec.id));
    assert.equal(spec.params?.type, 'object');
    assert.equal(spec.params?.additionalProperties, false);
    assert.equal(spec.shortcut, undefined, 'no new shortcut binding or override');
    for (const [locale, catalogue] of Object.entries(VECTOR_CATALOGUES)) assert.ok(catalogue[`cmd.${spec.id}`], `${locale}: ${spec.id}`);
  }
  assert.equal(registerVectorCommands(activeVector), await vectorCommandsReady, 'idempotent registration');
  assert.equal(await executeCommand('vector.createBlank'), true);
  assert.equal(S.getVectorSession().open, true);
});

test('all immediate actions refuse agent/MCP before touching session, read commands stay callable', async () => {
  const d = dispatcher(); S.createBlankVector();
  const before = structuredClone(S.getVectorSession());
  for (const spec of vectorCommandSpecs(activeVector).filter(s => s.level === 'ui')) {
    for (const origin of ['agent', 'mcp'] as const) {
      await assert.rejects(d.runCommand(spec.id, {}, { origin }), (e: unknown) => e instanceof CommandDispatchError && e.code === 'forbidden-origin');
    }
  }
  assert.deepEqual(S.getVectorSession(), before);
  const inspected = await d.runCommand<S.VectorSession>('vector.inspect', {}, { origin: 'agent' });
  inspected.doc.width = 9; inspected.selection.push('fake');
  assert.deepEqual(S.getVectorSession(), before, 'no mutable references escape inspection');
  assert.equal(await d.runCommand('vector.toSvg', {}, { origin: 'mcp' }), S.toSvg());
  assert.deepEqual(S.getVectorSession(), before);
});

test('default params and edit/history wrappers preserve vector undo/redo semantics', async () => {
  const d = dispatcher();
  await run(d, 'createBlank'); const empty = structuredClone(S.getVectorSession().doc);
  const path = rectPath({ x: 0, y: 0, w: 10, h: 10 });
  await run(d, 'addPath', { path }); const added = structuredClone(S.getVectorSession().doc);
  path.nodes[0].x = 900;
  assert.deepEqual(S.getVectorSession().doc, added, 'caller does not own stored input');
  await run(d, 'moveSelection', { dx: 5, dy: 7 });
  assert.equal(S.getVectorSession().doc.paths[0].nodes[0].x, 5);
  await run(d, 'undo'); assert.deepEqual(S.getVectorSession().doc, added);
  await run(d, 'undo'); assert.deepEqual(S.getVectorSession().doc, empty);
  await run(d, 'redo'); assert.deepEqual(S.getVectorSession().doc, added);
  await run(d, 'select', { ids: [added.paths[0].id] });
  await run(d, 'duplicateSelection'); assert.equal(S.getVectorSession().doc.paths.length, 2);
  assert.equal(S.getVectorSession().canRedo, false);
  await run(d, 'deleteSelection'); assert.equal(S.getVectorSession().doc.paths.length, 1);
});

test('strict schemas reject missing/extra/wrong/invalid nested args without a history step', async () => {
  const d = dispatcher(); S.createBlankVector(); S.addPath(rectPath({ x: 0, y: 0, w: 10, h: 10 }));
  const before = structuredClone(S.getVectorSession());
  const samples: [string, unknown][] = [
    ['moveSelection', { dx: 1 }], ['undo', { unexpected: true }], ['setTool', { tool: 'brush' }],
    ['setView', { zoom: 0 }], ['setView', { zoom: 1, pan: { x: 1 } }], ['select', { ids: ['same', 'same'] }],
    ['resizePage', { width: 1.5, height: 200 }], ['createBlank', { confirmed: true }],
    ['setStyle', { patch: { lineCap: 'sharp' } }], ['setStyle', { patch: { opacity: 2 } }],
    ['setStyle', { patch: { dashArray: [-1] } }], ['addPath', { path: { id: 'p', closed: true, nodes: [{ id: 'n', x: '1', y: 2, kind: 'corner' }] } }],
    ['setSelectionBounds', {}], ['setSelectionBounds', { w: 0 }], ['reorder', { mode: 'up' }],
    ['openSvg', { source: '<svg/>', confirmed: true }], ['replaceDocument', { document: { width: 2, height: 2, paths: [], patch: {} } }],
  ];
  for (const [id, params] of samples) { await rejects(d, id, params); assert.deepEqual(S.getVectorSession(), before, id); }
  await rejects(d, 'moveSelection', { dx: NaN, dy: 1 }, 'failed');
  assert.deepEqual(S.getVectorSession(), before);
});

test('enablement blocks immediate edits outside vector and unavailable history', async () => {
  const d = dispatcher(); await rejects(d, 'resizePage', { width: 10, height: 10 }, 'disabled');
  S.createBlankVector(); await rejects(d, 'undo', {}, 'disabled');
  const before = structuredClone(S.getVectorSession()); patchState({ activeStudio: 'code' });
  await rejects(d, 'resizePage', { width: 10, height: 10 }, 'disabled');
  assert.deepEqual(S.getVectorSession(), before);
  assert.equal((await d.runCommand<S.VectorSession>('vector.inspect', {}, { origin: 'mcp' })).open, true);
});

test('viewport, tool, selection and diagnostics do not enter document history', async () => {
  const d = dispatcher(); S.createBlankVector();
  await run(d, 'setTool', { tool: 'node' }); await run(d, 'setView', { zoom: 2, pan: { x: 3, y: 4 } });
  await run(d, 'select', { ids: ['missing'] }); await run(d, 'selectNode', { id: null }); await run(d, 'clearError');
  const s = S.getVectorSession(); assert.equal(s.tool, 'node'); assert.equal(s.zoom, 2); assert.deepEqual(s.pan, { x: 3, y: 4 });
  assert.equal(s.dirty, false); assert.equal(s.canUndo, false);
});

test('path/style/page/bounds/reorder wrappers each use session history', async () => {
  const d = dispatcher(); S.createBlankVector(); const a = rectPath({ x: 0, y: 0, w: 10, h: 10 }); S.addPath(a);
  await run(d, 'renamePath', { id: a.id, name: 'Renamed' }); assert.equal(S.getVectorSession().doc.paths[0].name, 'Renamed');
  await run(d, 'setStyle', { patch: { fill: '#ff0000' } }); assert.equal(S.getVectorSession().doc.paths[0].style?.fill, '#ff0000');
  await run(d, 'setSelectionBounds', { x: 20, y: 30, w: 40, h: 50 }); assert.equal(S.getVectorSession().doc.paths[0].nodes[0].x, 20);
  await run(d, 'resizePage', { width: 200, height: 150 }); assert.equal(S.getVectorSession().doc.width, 200);
  const b = rectPath({ x: 0, y: 0, w: 20, h: 20 }); await run(d, 'addPath', { path: b, select: false });
  await run(d, 'reorder', { mode: 'front', ids: [a.id] }); assert.equal(S.getVectorSession().doc.paths.at(-1)?.id, a.id);
  await run(d, 'toggleHidden', { id: a.id }); assert.equal(S.getVectorSession().doc.paths.at(-1)?.hidden, true);
  await run(d, 'undo'); assert.equal(S.getVectorSession().doc.paths.at(-1)?.hidden, undefined);
  const before = structuredClone(S.getVectorSession());
  await rejects(d, 'renamePath', { id: 'missing', name: 'x' }, 'failed'); assert.deepEqual(S.getVectorSession(), before);
});

test('node wrappers validate target identity and write one undoable snapshot', async () => {
  const d = dispatcher(); S.createBlankVector(); const p = rectPath({ x: 0, y: 0, w: 100, h: 100 }); S.addPath(p);
  await run(d, 'setTool', { tool: 'node' }); await run(d, 'selectNode', { id: p.nodes[0].id });
  assert.equal(S.getVectorSession().selectedNode, p.nodes[0].id);
  const before = structuredClone(S.getVectorSession().doc);
  await run(d, 'moveNode', { pathId: p.id, nodeId: p.nodes[0].id, to: { x: 5, y: 6 } });
  await run(d, 'undo'); assert.deepEqual(S.getVectorSession().doc, before);
  await run(d, 'setNodeKind', { pathId: p.id, nodeId: p.nodes[0].id, kind: 'smooth' });
  assert.equal(S.getVectorSession().doc.paths[0].nodes[0].kind, 'smooth');
  await run(d, 'toggleClosed', { pathId: p.id }); assert.equal(S.getVectorSession().doc.paths[0].closed, false);
  await run(d, 'deleteNode', { pathId: p.id, nodeId: p.nodes[0].id }); assert.equal(S.getVectorSession().doc.paths[0].nodes.length, 3);
  const current = structuredClone(S.getVectorSession());
  await rejects(d, 'moveNode', { pathId: p.id, nodeId: 'missing', to: { x: 1, y: 2 } }, 'failed'); assert.deepEqual(S.getVectorSession(), current);
  await run(d, 'openSvg', { source: '<svg width="100" height="100"><path d="M0 0L100 0"/></svg>' });
  const line = S.getVectorSession().doc.paths[0];
  const added = await run(d, 'addNodeNear', { pathId: line.id, point: { x: 50, y: 0 } }); assert.equal(typeof added, 'string');
  assert.equal(S.getVectorSession().doc.paths[0].nodes.length, 3);
});

test('SVG and document replacement wrappers preserve import rejection and history', async () => {
  const d = dispatcher(); await run(d, 'createBlank', { width: 200, height: 100, name: 'custom.svg' });
  const src = '<svg width="100" height="100"><rect width="20" height="10"/></svg>';
  assert.equal(await run(d, 'importSvg', { source: src }), true); assert.equal(S.getVectorSession().doc.paths.length, 1);
  await run(d, 'undo'); assert.equal(S.getVectorSession().doc.paths.length, 0);
  const original = structuredClone(S.getVectorSession().doc);
  await run(d, 'replaceDocument', { document: { width: 300, height: 200, paths: [] } });
  await run(d, 'undo'); assert.deepEqual(S.getVectorSession().doc, original);
  assert.equal(await run(d, 'openSvg', { source: src, name: 'new.svg' }), true);
  assert.equal(S.getVectorSession().name, 'new.svg'); assert.equal(S.getVectorSession().canUndo, false);
  const good = structuredClone(S.getVectorSession().doc);
  assert.equal(await run(d, 'openSvg', { source: 'invalid' }), false); assert.deepEqual(S.getVectorSession().doc, good);
  assert.equal(getState().activeStudio, 'vector');
});

test('discard cancellation preserves the entire session and history for blank/open wrappers', async () => {
  const d = dispatcher(); S.createBlankVector(); S.addPath(rectPath({ x: 0, y: 0, w: 10, h: 10 }));
  const before = structuredClone(S.getVectorSession());
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => false } });
  try {
    assert.equal(await run(d, 'createBlank', { name: 'other.svg' }), false);
    assert.deepEqual(S.getVectorSession(), before);
    assert.equal(await run(d, 'openSvg', { source: '<svg width="10" height="10"/>', name: 'other.svg' }), false);
    assert.deepEqual(S.getVectorSession(), before);
  } finally {
    if (old) Object.defineProperty(globalThis, 'window', old); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('view and handle params cannot mutate the session after dispatch', async () => {
  const d = dispatcher(); S.createBlankVector(); const p = rectPath({ x: 0, y: 0, w: 10, h: 10 }); S.addPath(p);
  const pan = { x: 10, y: 20 }; await run(d, 'setView', { zoom: 1, pan }); pan.x = 999;
  assert.equal(S.getVectorSession().pan.x, 10);
  const to = { x: 5, y: 6 }; await run(d, 'moveNode', { pathId: p.id, nodeId: p.nodes[0].id, to, part: 'out' }); to.x = 999;
  assert.equal(S.getVectorSession().doc.paths[0].nodes[0].out?.x, 5);
});

test('registration disposer removes both registries and permits a clean reinstall', async () => {
  await vectorCommandsReady;
  const off = registerVectorCommands(activeVector); off();
  for (const spec of vectorCommandSpecs(activeVector)) {
    assert.equal(commandDispatcher.has(spec.id), false);
    assert.equal(listCommands().some(c => c.id === spec.id), false);
  }
  const restored = registerVectorCommands(activeVector); assert.notEqual(restored, off);
  assert.ok(commandDispatcher.has('vector.inspect'));
});
