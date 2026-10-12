import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDispatcher } from './commandDispatcher';
import { listCommands, executeCommand } from './commands';
import { registerCoreCommandSpec, NO_CORE_PARAMS } from './coreCommandRegistration';
import { getState, patchState, connectEditorProject } from '../store/appStore';
import type { EditorNode } from './editorPort';
import { EditorProject } from '@somnia/editor-core';
import { tOr } from './i18n';
import { checkMcpArgs } from './mcpSchema';

const inventory = listCommands();
test('every static Core command has a validated UI spec and keeps its menu metadata', () => {
  for (const command of inventory) {
    const spec = commandDispatcher.get(command.id);
    assert.ok(spec, command.id);
    assert.equal(spec.level, 'ui', command.id);
    assert.ok(spec.params, command.id);
    assert.equal(checkMcpArgs({}, spec.params).ok, true, command.id);
    assert.equal(checkMcpArgs({ unexpected: true }, spec.params).ok, false, command.id);
    assert.equal(tOr(`cmd.${spec.id}`,spec.title), command.title);
    assert.equal(spec.category, command.category);
    assert.equal(spec.shortcut, command.shortcut);
  }
});

test('core UI actions reject agent and MCP origins without changing UI state', async () => {
  patchState({ sidebarOpen: false });
  for (const origin of ['agent', 'mcp'] as const) {
    await assert.rejects(commandDispatcher.runCommand('sidebar.toggle', {}, { origin }), { code: 'forbidden-origin' });
  }
  assert.equal(getState().sidebarOpen, false);
  await assert.rejects(commandDispatcher.runCommand('sidebar.toggle', { extra: 1 }, { origin: 'test' }), { code: 'invalid-params' });
  assert.equal(getState().sidebarOpen, false);
  assert.equal(await executeCommand('sidebar.toggle'), true);
  assert.equal(getState().sidebarOpen, true);
});

test('core providers replace duplicate ids and restore the previous provider on cleanup', async () => {
  let ran = '';
  const base = registerCoreCommandSpec({ id: 'test.coreProvider', title: 'Base', category: 'Project', params: NO_CORE_PARAMS, level: 'ui', run: () => { ran = 'base'; } });
  const first = registerCoreCommandSpec({ id: 'test.coreProvider', title: 'First', category: 'Project', params: NO_CORE_PARAMS, level: 'ui', run: () => { ran = 'first'; } });
  const second = registerCoreCommandSpec({ id: 'test.coreProvider', title: 'Second', category: 'Project', params: NO_CORE_PARAMS, level: 'ui', run: () => { ran = 'second'; } });
  try {
    await executeCommand('test.coreProvider'); assert.equal(ran, 'second');
    first(); // Removing an inactive provider must not affect the active one.
    await executeCommand('test.coreProvider'); assert.equal(ran, 'second');
    second(); second(); // Cleanup is idempotent.
    await executeCommand('test.coreProvider'); assert.equal(ran, 'base');
  } finally { second(); first(); base(); }
  assert.equal(commandDispatcher.has('test.coreProvider'), false);
  assert.equal(listCommands().some(c => c.id === 'test.coreProvider'), false);
});

test('wrap validates its tag and writes to the existing project history', async () => {
  const project = new EditorProject({ 'index.html': '<html><head></head><body><p>Text</p></body></html>' });
  const disconnect = connectEditorProject(project);
  const find = (nodes: EditorNode[]): string | undefined => {
    for (const node of nodes) { if (node.tag === 'p') return node.id; const found = find(node.children); if (found) return found; }
  };
  patchState({ selectedElementId: find(getState().nodes)! });
  try {
    const before = project.files['index.html'];
    await assert.rejects(commandDispatcher.runCommand('edit.wrap', { tag: 'script' }, { origin: 'test' }), { code: 'invalid-params' });
    assert.equal(project.files['index.html'], before);
    await commandDispatcher.runCommand('edit.wrap', { tag: 'section' }, { origin: 'test' });
    assert.match(project.files['index.html'], /<section>\s*<p>Text<\/p>\s*<\/section>/);
    await commandDispatcher.runCommand('edit.undo', {}, { origin: 'test' });
    assert.equal(project.files['index.html'], before);
    await commandDispatcher.runCommand('edit.redo', {}, { origin: 'test' });
    assert.match(project.files['index.html'], /<section>/);
  } finally { disconnect(); }
});

test('table params are bounded, with the original 3x3 palette defaults', async () => {
  const project = new EditorProject({ 'index.html': '<html><head></head><body></body></html>' });
  const disconnect = connectEditorProject(project);
  try {
    for (const params of [{ rows: 0 }, { cols: 21 }, { rows: 51 }, { rows: 1.5 }, { cols: '2' }]) {
      await assert.rejects(commandDispatcher.runCommand('table.insert', params, { origin: 'test' }), { code: 'invalid-params' });
    }
    await commandDispatcher.runCommand('table.insert', undefined, { origin: 'test' });
    assert.equal((project.files['index.html'].match(/<tr>/g) ?? []).length, 3); // 3 rows including header
    await commandDispatcher.runCommand('edit.undo', {}, { origin: 'test' });
    await commandDispatcher.runCommand('table.insert', { rows: 2, cols: 2 }, { origin: 'test' });
    assert.equal((project.files['index.html'].match(/<td>/g) ?? []).length, 2);
  } finally { disconnect(); }
});

test('live file adapter replaces Core project specs and restores them when unmounted', async () => {
  const { installFileAdapter } = await import('./fileAdapter');
  const before = new Map(['project.open', 'project.save', 'project.openFile'].map(id => [id, commandDispatcher.get(id)]));
  const calls: string[] = [];
  patchState({ isDirty: false });
  const off = await installFileAdapter({
    shell: { closeWindow: async () => {}, destroyWindow: async () => {} },
    invoke: async <T>(command: string): Promise<T> => { calls.push(command); return null as T; },
    listen: async () => () => {},
  });
  try {
    for (const id of before.keys()) assert.notEqual(commandDispatcher.get(id), before.get(id), id);
    await commandDispatcher.runCommand('project.openFile', {}, { origin: 'test' });
    assert.ok(calls.includes('choose_file'));
    await commandDispatcher.runCommand('project.save', {}, { origin: 'test' });
    assert.ok(getState().saveDialog);
  } finally { off(); patchState({ saveDialog: null }); }
  for (const id of before.keys()) assert.equal(commandDispatcher.get(id), before.get(id), id);
  for (const id of ['project.compare', 'project.close']) assert.equal(commandDispatcher.has(id), false, id);
});
