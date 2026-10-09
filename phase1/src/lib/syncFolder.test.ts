import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, payloadText, parseRemote, snapshot } from './syncFolder';
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

const state = { workflowPrefs: { ...DEFAULT_WORKFLOW_PREFS }, editorPrefs: { ...DEFAULT_EDITOR_PREFS }, documentPrefs: { ...DEFAULT_DOCUMENT_PREFS }, wrapLines: false };
const m = (lastSynced: string | null, localSnapshot: string | null = lastSynced, localChangedAt = 100) => ({ lastSynced, localSnapshot, localChangedAt });

test('absent remote writes, equal does nothing', () => {
  assert.equal(decide('A', null, m(null), 5).action, 'write');
  assert.equal(decide('A', { snap: 'A', updatedAt: 1 }, m('A'), 5).action, 'noop');
});
test('only one side changed: that side wins', () => {
  assert.equal(decide('B', { snap: 'A', updatedAt: 999 }, m('A'), 5).action, 'write');
  assert.equal(decide('A', { snap: 'B', updatedAt: 1 }, m('A'), 5).action, 'apply');
});
test('both changed: newer wins and it is flagged', () => {
  const newerRemote = decide('B', { snap: 'C', updatedAt: 500 }, m('A', 'B', 100), 600);
  assert.deepEqual([newerRemote.action, newerRemote.both], ['apply', true]);
  const newerLocal = decide('B', { snap: 'C', updatedAt: 50 }, m('A', 'B', 100), 600);
  assert.deepEqual([newerLocal.action, newerLocal.both], ['write', true]);
});
test('a changed local snapshot is stamped with the time it was noticed', () => {
  assert.equal(decide('B', { snap: 'A', updatedAt: 1 }, m('A', 'A', 100), 777).localChangedAt, 777);
});
test('remote is validated: bad shape rejected, unknown and invalid entries skipped', () => {
  assert.equal(parseRemote('nope', 1, []), null);
  assert.equal(parseRemote(JSON.stringify({ app: 'somnia', kind: 'settings', version: 1 }), 1, []), null);
  const r = parseRemote(JSON.stringify({ app: 'somnia', kind: 'sync', version: 1, updatedAt: 7, settings: { 'nope.x': 1 }, shortcuts: { 'bad.cmd': 'Mod+K' } }), 1, ['file.save'])!;
  assert.deepEqual(r.accepted, {});
  assert.ok(r.warnings.length >= 2);
  assert.equal(r.updatedAt, 7);
});
test('payload round trips through the parser', () => {
  const snap = snapshot(state, { 'file.save': 'Mod+S' });
  const r = parseRemote(payloadText(snap, 42), 1, ['file.save'])!;
  assert.equal(r.snap, snap);
  assert.equal(r.updatedAt, 42);
});
test('first link with default local settings takes the folder, not the other way round', () => {
  const empty = '{"settings":{},"shortcuts":{}}';
  assert.equal(decide(empty, { snap: 'X', updatedAt: 1 }, m(null, null, 0), 9).action, 'apply');
  assert.equal(decide('Y', { snap: 'X', updatedAt: 1 }, m(null, null, 0), 9).action, 'write');
});
