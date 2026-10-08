import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EditorProject, type EditorNode } from '../../packages/editor-core/src/index';
import { applyHistory, applyOperations, closeCore, closeFileTab, connectEditorProject, getProjectGeneration, getSavedFile, getState, markFileSaved, markSaved, openFileTab, patchState } from '../store/appStore';

const html = '<html><head></head><body><div><p>one</p><span>two</span></div></body></html>';
const create = () => new EditorProject({ 'index.html': html, 'second.html': '<p>second</p>', 'site.css': 'p{}' });
const all = (nodes: EditorNode[]): EditorNode[] => nodes.flatMap(n => [n, ...all(n.children)]);
const id = (tag: string) => all(getState().nodes).find(n => n.tag === tag)!.id;
beforeEach(() => closeCore());
afterEach(() => closeCore());

test('refresh prunes deleted multi-selection IDs but preserves surviving selection', () => {
  const p = create(); connectEditorProject(p);
  const para = id('p'), span = id('span');
  patchState({ selectedElementId: para, selectedElementIds: [para, span, 'stale'] });
  applyOperations([{ type: 'remove', file: 'index.html', nodeId: para }]);
  assert.equal(getState().selectedElementId, null);
  assert.deepEqual(getState().selectedElementIds, [span]);
  assert.ok(all(getState().nodes).some(n => n.id === span));
  applyHistory('undo'); assert.ok(all(getState().nodes).some(n => n.id === para));
  assert.deepEqual(getState().selectedElementIds, [span], 'undo must not revive stale selection');
});

test('switching HTML files clears selection and CSS tabs retain the current design document', () => {
  connectEditorProject(create()); const para = id('p');
  patchState({ selectedElementId: para }); openFileTab('site.css');
  assert.equal(getState().activeFile, 'site.css'); assert.equal(getState().designFile, 'index.html');
  assert.equal(getState().selectedElementId, null); assert.deepEqual(getState().selectedElementIds, []);
  openFileTab('second.html'); assert.equal(getState().designFile, 'second.html');
  assert.deepEqual(all(getState().nodes).map(n => n.tag), ['p']);
  const before = getState(); openFileTab('missing.html'); assert.equal(getState(), before);
});

test('dirty state compares exact saved bytes through edit, undo, redo and stale save completion', () => {
  const p = create(); connectEditorProject(p, { alreadySaved: true });
  assert.equal(getState().isDirty, false);
  const written = p.files; const para = id('p');
  applyOperations([{ type: 'setText', file: 'index.html', nodeId: para, text: 'new' }]);
  markSaved(written, '2026-10-06T17:00:00Z');
  assert.equal(getState().isDirty, true); assert.equal(getSavedFile('index.html'), html);
  applyHistory('undo'); assert.equal(getState().isDirty, false);
  applyHistory('redo'); assert.equal(getState().isDirty, true);
  markSaved(p.files); assert.equal(getState().isDirty, false);
});

test('single-file save cannot hide other dirty files or newly created files', () => {
  const p = create(); connectEditorProject(p, { alreadySaved: true });
  applyOperations([{ type: 'replaceSource', file: 'site.css', text: 'p{color:red}' }, { type: 'createFile', file: 'new.txt', text: 'new' }]);
  markFileSaved('site.css', p.files['site.css']); assert.equal(getState().isDirty, true);
  markFileSaved('new.txt', 'new'); assert.equal(getState().isDirty, false);
  applyOperations([{ type: 'deleteFile', file: 'new.txt' }]); assert.equal(getState().isDirty, true);
  markSaved(p.files); assert.equal(getState().isDirty, false);
});

test('old project cleanup and events cannot disconnect or overwrite its replacement', () => {
  const p = create(), generation = getProjectGeneration();
  const disconnect = connectEditorProject(p);
  const q = new EditorProject({ 'replacement.html': '<p>replacement</p>' });
  connectEditorProject(q); assert.equal(getProjectGeneration(), generation + 2);
  const current = getState(); disconnect(); assert.equal(getState(), current);
  p.transact({ origin: 'code', operations: [{ type: 'replaceSource', file: 'index.html', text: '<p>obsolete</p>' }] });
  assert.equal(getState(), current); assert.deepEqual(getState().files, q.files);
  assert.equal(getState().coreConnected, true);
});

test('closing the active tab selects its neighbour and keeps the last tab open', () => {
  connectEditorProject(create()); openFileTab('second.html'); openFileTab('site.css');
  closeFileTab('site.css'); assert.equal(getState().activeFile, 'second.html');
  assert.deepEqual(getState().openFiles, ['index.html', 'second.html']);
  closeFileTab('second.html'); closeFileTab('index.html');
  assert.equal(getState().activeFile, 'index.html'); assert.deepEqual(getState().openFiles, ['index.html']);
});

test('close clears project, selection, tabs and saved state and rejects disconnected edits', () => {
  connectEditorProject(create(), { alreadySaved: true }); patchState({ selectedElementId: id('p') });
  closeCore(); assert.deepEqual(getState().files, {}); assert.deepEqual(getState().nodes, []);
  assert.deepEqual(getState().selectedElementIds, []); assert.deepEqual(getState().openFiles, []);
  assert.equal(getState().activeFile, ''); assert.equal(getState().designFile, '');
  assert.equal(getSavedFile('index.html'), ''); assert.equal(getState().coreConnected, false);
  assert.throws(() => applyOperations([]), /not connected/); assert.throws(() => applyHistory('undo'), /not connected/);
});
import {sanitizeLeftTab,patchState as patchForTab,getState as getForTab} from '../store/appStore';
test('a persisted or external leftTab "assets" (removed in the Components redesign) falls back to layers',()=>{assert.equal(sanitizeLeftTab('assets'),'layers');assert.equal(sanitizeLeftTab(undefined),'layers');assert.equal(sanitizeLeftTab('components'),'components');patchForTab({leftTab:'assets' as never});assert.equal(getForTab().leftTab,'layers');patchForTab({leftTab:'components'});assert.equal(getForTab().leftTab,'components');patchForTab({leftTab:'layers'});});
