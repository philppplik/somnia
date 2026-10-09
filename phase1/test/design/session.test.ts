import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDesignDocument} from '../../src/lib/design/model';
import {clearDesign, editDesign, getDesignState, loadDesign, markDesignSaved, redoDesign, selectArtboard, undoDesign} from '../../src/lib/design/session';
import {deleteDesignNodes, duplicateDesignNodes, patchDesignNodes, reorderDesignNode} from '../../src/lib/design/panelAdapter';

const fixture = (name='layered') => parseDesignDocument(readFileSync(new URL(`../../tests/assets/design-studio/${name}.somdesign`, import.meta.url), 'utf8'));

test('invalid edit is atomic: document, dirty and history remain untouched', () => {
  loadDesign(fixture());
  const before = getDesignState();
  assert.throws(() => editDesign(doc => {doc.artboards[0].nodes[0].width = -1; return doc;}));
  assert.equal(getDesignState(), before);
  assert.equal(getDesignState().dirty, false);
});

test('batch edit is one history transaction; undo/redo is exact and no-op edit adds none', () => {
  loadDesign(fixture());
  const original = structuredClone(getDesignState().document);
  patchDesignNodes(new Map([['qa-card', {x: 100}], ['qa-headline', {x: 100}]]));
  assert.equal(getDesignState().past.length, 1);
  const edited = structuredClone(getDesignState().document);
  undoDesign(); assert.deepEqual(getDesignState().document, original);
  redoDesign(); assert.deepEqual(getDesignState().document, edited);
  editDesign(doc => doc); assert.equal(getDesignState().past.length, 1);
});

test('new edit after undo truncates redo; history retains at most 100 snapshots', () => {
  loadDesign(fixture());
  patchDesignNodes(new Map([['qa-card', {x: 81}]]));
  patchDesignNodes(new Map([['qa-card', {x: 82}]]));
  undoDesign(); assert.equal(getDesignState().future.length, 1);
  patchDesignNodes(new Map([['qa-card', {x: 83}]]));
  assert.equal(getDesignState().future.length, 0);
  for (let x=84; x<210; x++) patchDesignNodes(new Map([['qa-card', {x}]]));
  assert.equal(getDesignState().past.length, 100);
});

test('locked layers reject transform, delete, duplicate and reorder, but may be unlocked', () => {
  loadDesign(fixture('layer-flags'));
  const before = structuredClone(getDesignState().document);
  patchDesignNodes(new Map([['qa-headline', {x: 99}]]));
  deleteDesignNodes(['qa-headline']); duplicateDesignNodes(['qa-headline']); reorderDesignNode('qa-headline', -1);
  assert.deepEqual(getDesignState().document, before);
  assert.equal(getDesignState().past.length, 0);
  patchDesignNodes(new Map([['qa-headline', {locked: false}]]), true);
  assert.equal(getDesignState().document!.artboards[0].nodes[1].locked, false);
});

test('duplicate gets a fresh id, deleting it is undoable, other artboard is untouched', () => {
  loadDesign(fixture('multiple-artboards'));
  const other = structuredClone(getDesignState().document!.artboards[1]);
  duplicateDesignNodes(['qa-card']);
  const nodes = getDesignState().document!.artboards[0].nodes;
  assert.equal(nodes.length, 3); assert.notEqual(nodes[2].id, nodes[0].id);
  assert.equal(nodes[2].x, nodes[0].x+16);
  deleteDesignNodes([nodes[2].id]); assert.equal(getDesignState().document!.artboards[0].nodes.length, 2);
  undoDesign(); assert.equal(getDesignState().document!.artboards[0].nodes.length, 3);
  assert.deepEqual(getDesignState().document!.artboards[1], other);
  selectArtboard(other.id); patchDesignNodes(new Map([['qa-card', {x: 1}]]));
  assert.equal(getDesignState().document!.artboards[0].nodes[0].x, 80);
});

test('mark saved clears only dirty; clear removes document, selection and history', () => {
  loadDesign(fixture(), true); patchDesignNodes(new Map([['qa-card', {x: 99}]]));
  const before = getDesignState(); markDesignSaved();
  assert.equal(getDesignState().dirty, false);
  assert.equal(getDesignState().document, before.document);
  assert.equal(getDesignState().past, before.past);
  clearDesign();
  assert.equal(getDesignState().document, null);
  assert.equal(getDesignState().dirty, false);
  assert.deepEqual(getDesignState().past, []);
  assert.deepEqual(getDesignState().selectedIds, []);
});
