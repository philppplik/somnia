import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSetup } from './format';
import { planImport } from './plan';
import { applyChange, buildChange, pruneSnapshots, restoreChange, takeSnapshot, MAX_SNAPSHOTS, type Adapters, type Snapshot } from './apply';
import { TRANSFER_CATEGORIES } from './classify';
import { baseState } from './format.test';

const setup = (settings: object, shortcuts: object = {}) => (parseSetup(JSON.stringify({ app: 'somnia', kind: 'setup', schemaVersion: 1, scope: 'user', categories: {
  settings: { mode: 'overrides', values: settings }, keybindings: { common: shortcuts, platforms: {} } } }), ['a.one', 'b.two', 'c.three']) as any).setup;
const target = (fn?: (s: any) => void, shortcuts: Record<string, string> = {}) => { const s: any = baseState(); fn?.(s); return { state: s, shortcuts }; };
const all = (p: { rows: readonly { key: string }[] }) => new Set(p.rows.map((r) => r.key));

test('buildChange writes only selected, non-same rows', () => {
  const t = target(); const p = planImport(setup({ 'editor.lint': false, 'workflow.units': 'metric' }), t, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  const r = buildChange(p, t, { selectedKeys: new Set(['setting:workflow.units']) });
  assert.ok(r.ok); if (r.ok) { assert.deepEqual(r.change.settings, { 'workflow.units': 'metric' }); assert.equal(r.applied, 1); assert.equal(r.skipped, 1); }
});
test('stale target blocks apply and requires a new review', () => {
  const t = target(); const p = planImport(setup({ 'editor.lint': false }), t, { mode: 'merge', categories: TRANSFER_CATEGORIES });
  const r = buildChange(p, target((s) => { s.workflowPrefs.units = 'metric'; }), { selectedKeys: all(p) });
  assert.ok(!r.ok && r.code === 'stale');
});
test('replace needs the reset count acknowledged', () => {
  const t = target((s) => { s.editorPrefs.emmet = !s.editorPrefs.emmet; });
  const p = planImport(setup({}), t, { mode: 'replace', categories: ['editor'] });
  assert.equal(p.resetCount, 1);
  const no = buildChange(p, t, { selectedKeys: all(p) }); assert.ok(!no.ok && no.code === 'ack-required');
  const yes = buildChange(p, t, { selectedKeys: all(p), acknowledgedResets: 1 }); assert.ok(yes.ok);
  if (yes.ok) assert.equal(yes.change.settings['editor.emmet'], (baseState().editorPrefs as any).emmet);
  const unchecked = buildChange(p, t, { selectedKeys: new Set(), acknowledgedResets: 0 }); assert.ok(!unchecked.ok && unchecked.code === 'nothing-selected');
});
test('conflicts are skipped by default and replaced only on request (other holder is unbound)', () => {
  const t = target(undefined, { 'c.three': 'Mod+K' }); const p = planImport(setup({}, { 'a.one': 'Mod+K' }), t, { mode: 'merge', categories: ['keybindings'] });
  assert.equal(buildChange(p, t, { selectedKeys: all(p) }).ok, false);
  const r = buildChange(p, t, { selectedKeys: all(p), resolutions: { 'shortcut:a.one': 'replace' } });
  assert.ok(r.ok); if (r.ok) assert.deepEqual(r.change.shortcuts, { 'a.one': 'Mod+K', 'c.three': '' });
});
test('replace removes shortcut overrides as null', () => {
  const t = target(undefined, { 'a.one': 'Mod+1' }); const p = planImport(setup({}), t, { mode: 'replace', categories: ['keybindings'] });
  const r = buildChange(p, t, { selectedKeys: all(p), acknowledgedResets: 1 }); assert.ok(r.ok); if (r.ok) assert.deepEqual(r.change.shortcuts, { 'a.one': null });
});

const mem = (opts: { failSnapshot?: boolean; failSettings?: boolean; failShortcuts?: boolean; failRollbackShortcuts?: boolean } = {}) => {
  const log: string[] = []; let snap: Snapshot | undefined; let shortcutCalls = 0;
  const a: Adapters = {
    async saveSnapshot(s) { if (opts.failSnapshot) throw new Error('disk'); snap = s; log.push('snapshot'); },
    async writeSettings(v) { if (opts.failSettings) throw new Error('x'); log.push('settings:' + JSON.stringify(v)); },
    async writeShortcuts(m) { shortcutCalls++; if (opts.failShortcuts && shortcutCalls === 1) throw new Error('x'); if (opts.failRollbackShortcuts && shortcutCalls > 1) throw new Error('x'); log.push('shortcuts:' + JSON.stringify(m)); },
  };
  return { a, log, snap: () => snap };
};
const change = { settings: { 'editor.lint': false }, shortcuts: { 'a.one': 'Mod+1' as string | null } };

test('snapshot is written before any change; backup failure stops the apply with zero writes', async () => {
  const ok = mem(); const r = await applyChange(change, target(), ok.a, 1);
  assert.equal(r.status, 'applied'); assert.equal(ok.log[0], 'snapshot'); assert.equal(ok.log.length, 3);
  const bad = mem({ failSnapshot: true }); const r2 = await applyChange(change, target(), bad.a, 1);
  assert.deepEqual(r2, { status: 'blocked', reason: 'backup-failed' }); assert.deepEqual(bad.log, []);
});
test('a failing adapter rolls back every adapter to the snapshot values', async () => {
  const m = mem({ failShortcuts: true }); const t = target((s) => { s.editorPrefs.lint = true; }, { 'a.one': 'Mod+9' });
  const r = await applyChange(change, t, m.a, 1);
  assert.deepEqual(r, { status: 'rolled-back', failed: 'shortcuts' });
  assert.deepEqual(m.log.slice(-2), ['shortcuts:{"a.one":"Mod+9"}', 'settings:{"editor.lint":true}']);
});
test('rollback failure is reported honestly, not hidden', async () => {
  const m = mem({ failShortcuts: true, failRollbackShortcuts: true });
  const r = await applyChange(change, target(), m.a, 1);
  assert.deepEqual(r, { status: 'rollback-failed', failed: 'shortcuts', incomplete: ['shortcuts'] });
  const s = mem({ failSettings: true }); assert.equal((await applyChange(change, target(), s.a, 1)).status, 'rollback-failed');
});
test('snapshots hold only transferable settings and shortcuts', () => {
  const sn = takeSnapshot(target((s) => { s.previewScripts = !s.previewScripts; }, { 'a.one': 'Mod+1' }), 5);
  assert.ok(!('previewScripts' in sn.settings)); assert.equal(Object.keys(sn.settings).length, 21); assert.deepEqual(sn.shortcuts, { 'a.one': 'Mod+1' });
});
test('restore proposes only differing values and drops shortcuts added later', () => {
  const before = takeSnapshot(target(undefined, { 'a.one': 'Mod+1' }), 1);
  const now = target((s) => { s.editorPrefs.lint = !s.editorPrefs.lint; }, { 'a.one': 'Mod+2', 'b.two': 'Mod+3' });
  const r = restoreChange(before, now);
  assert.deepEqual(r.change.settings, { 'editor.lint': (baseState().editorPrefs as any).lint });
  assert.deepEqual(r.change.shortcuts, { 'a.one': 'Mod+1', 'b.two': null }); assert.equal(r.differing, 3);
});
test('retention: newest first, at most 10, within 10 MiB', () => {
  const mk = (n: number, pad = 0): Snapshot => ({ schemaVersion: 1, createdAt: n, revision: 'r', settings: pad ? { pad: 'x'.repeat(pad) } : {}, shortcuts: {} });
  const many = Array.from({ length: 14 }, (_, i) => mk(i));
  const kept = pruneSnapshots(many); assert.equal(kept.length, MAX_SNAPSHOTS); assert.equal(kept[0].createdAt, 13);
  const big = pruneSnapshots([mk(3, 6 * 1024 * 1024), mk(2, 6 * 1024 * 1024), mk(1)]); assert.deepEqual(big.map((s) => s.createdAt), [3]);
});
