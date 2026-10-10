import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeRefs, sha} from './fakeRefs';
import {explain, changelogMarkdown, groupOf} from './explain';
import {buildRefComparison, contentHash, evidenceMatches} from './snapshot';
import {cleanSafetyList, SafetyController, SafetyError} from './safety';
import {safeRefName, validateDiffRefs} from './contract';
import {createFakeBackend} from '../../../components/versions/fakeBackend';
import {translate} from '../i18n-shim';
const t = (k: string, p?: Record<string, string | number>) => translate('en', k, p);
const trees = {
  v1: {'index.html': '<h1>Hi</h1><link rel="stylesheet" href="style.css">', 'style.css': 'h1{color:red}', 'logo.png': '\0BINa'},
  v2: {'index.html': '<h1>Hello</h1><link rel="stylesheet" href="style.css">', 'style.css': 'h1{color:red}', 'logo.png': '\0BINa', 'css/new.css': 'p{}'},
};
test('groupOf and explain count kinds deterministically', async () => {
  assert.equal(groupOf('a/b.CSS'), 'styles');
  const d = await createFakeRefs(trees).diffRefs({from: 'v1', to: 'v2'});
  const ex = explain(d, t);
  assert.equal(ex.counts.added, 1); assert.equal(ex.counts.modified, 1); assert.equal(ex.empty, false);
  assert.match(ex.headline, /^2 files changed: 1 added, 1 edited, 0 removed, 0 renamed\.$/);
  assert.ok(!/\u2014/.test(changelogMarkdown(d, t)));
  assert.match(changelogMarkdown(d, t), /- css\/new\.css/);
});
test('identical versions explain as empty', async () => {
  const d = await createFakeRefs({a: trees.v1, b: trees.v1}).diffRefs({from: 'a', to: 'b'});
  assert.equal(explain(d, t).empty, true);
});
test('full snapshot carries unchanged files, hashes both sides, and discloses limits', async () => {
  const refs = createFakeRefs(trees);
  const b = await buildRefComparison(refs, 'v1', 'v2');
  assert.equal(b.evidence.complete, true);
  assert.equal(b.evidence.before.fileCount, 3); assert.equal(b.evidence.after.fileCount, 4);
  assert.notEqual(b.evidence.before.contentHash, b.evidence.after.contentHash);
  assert.match(b.evidence.before.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(b.comparisons.map(c => c.path).sort(), ['css/new.css', 'index.html']);
  const idx = b.comparisons.find(c => c.path === 'index.html')!;
  assert.equal(idx.before.files['style.css'], 'h1{color:red}');   // unchanged asset is present for rendering
  assert.ok(!('logo.png' in idx.before.files));                   // binary never inlined
  const keys = b.evidence.limitations.map(l => l.key);
  for (const k of ['static', 'animation', 'remote']) assert.ok(keys.includes(k as never));
  assert.ok(!keys.includes('partial'));
});
test('without tree/blob reads the snapshot is marked partial', async () => {
  const b = await buildRefComparison(createFakeRefs(trees, {full: false}), 'v1', 'v2');
  assert.equal(b.evidence.complete, false);
  assert.ok(b.evidence.limitations.some(l => l.key === 'partial'));
  assert.equal(b.comparisons.length, 0); // no blob reader: nothing is faked
});
test('content hash is order independent and content sensitive', async () => {
  const a = await contentHash([{path: 'a', blob: '1'}, {path: 'b', blob: '2'}]);
  assert.equal(a, await contentHash([{path: 'b', blob: '2'}, {path: 'a', blob: '1'}]));
  assert.notEqual(a, await contentHash([{path: 'a', blob: '1'}, {path: 'b', blob: '3'}]));
});
test('evidence goes stale when a ref moves', async () => {
  const refs = createFakeRefs(trees);
  const b = await buildRefComparison(refs, 'v1', 'v2');
  assert.equal(await evidenceMatches(refs, b.evidence), true);
  const moved = createFakeRefs(trees, {moved: {ref: 'v2', to: sha('f')}});
  assert.equal(await evidenceMatches(moved, b.evidence), false);
});
test('contract validation rejects mismatches and unsafe paths', async () => {
  const d = await createFakeRefs(trees).diffRefs({from: 'v1', to: 'v2'});
  assert.throws(() => validateDiffRefs(d, {from: 'v1', to: 'other'}));
  assert.throws(() => validateDiffRefs({...d, files: [{...d.files[0], path: '../x'}]}, {from: 'v1', to: 'v2'}));
  assert.throws(() => validateDiffRefs({...d, files: [{...d.files[0], afterBlob: 'zz'}]}, {from: 'v1', to: 'v2'}));
  assert.equal(safeRefName('--upload-pack=x'), false); assert.equal(safeRefName('main'), true); assert.equal(safeRefName('a..b'), false);
});
const entry = (n: number, over = {}) => ({ref: `refs/somnia/safety/${n}`, sha: sha(String(n)), time: n, scope: [], operation: 'restore' as const, subject: `Safety ${n}`, ...over});
test('safety list drops foreign refs and sorts newest first', () => {
  const out = cleanSafetyList([entry(1), entry(3), {...entry(2), ref: 'refs/heads/main'}, {...entry(4), sha: 'nope'}, entry(1)]);
  assert.deepEqual(out.map(e => e.time), [3, 1]);
});
test('safety restore is guarded by unsaved buffers, conflicts, and a moved ref', async () => {
  const git = createFakeBackend({changes: []});
  let restoredWith: unknown = null;
  git.restoreAsNewVersion = async req => { restoredWith = req; return {safetyCopy: null, newVersion: {} as never}; };
  const e = entry(2);
  const refs = createFakeRefs(trees, {safety: [e]});
  let unsaved = true;
  const c = new SafetyController(git, refs, () => unsaved);
  await assert.rejects(c.review(e), (x: SafetyError) => x.code === 'unsaved');
  unsaved = false;
  const review = await c.review(e);
  assert.equal(review.stateToken, 't1');
  unsaved = true;
  await assert.rejects(c.restore(review), (x: SafetyError) => x.code === 'unsaved');
  assert.equal(restoredWith, null);
  unsaved = false;
  const moved = new SafetyController(git, createFakeRefs(trees, {safety: [{...e, sha: sha('9')}]}), () => false);
  await assert.rejects(moved.restore(review), (x: SafetyError) => x.code === 'changed');
  await c.restore(review);
  assert.deepEqual(restoredWith, {sha: e.sha, stateToken: 't1'});
  const conflicted = createFakeBackend({changes: [{path: 'a', kind: 'conflicted', staged: false, unstaged: true, binary: false}]});
  await assert.rejects(new SafetyController(conflicted, refs, () => false).review(e), (x: SafetyError) => x.code === 'conflicts');
});
