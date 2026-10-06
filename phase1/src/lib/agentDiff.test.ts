import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHunks, applyReviewed, checkFresh, hunkKey, planApply, reviewFile, validatePath, type ChangeSet, type Decisions, type FileProposal, type PlannedWrite} from './agentDiff';

const base = 'a\nb\nc\nd\ne\nf\ng\nh\n';
const edit: FileProposal = {path: 'index.html', kind: 'edit', baseText: base, proposedText: 'a\nB\nc\nd\ne\nf\nG\nh\nnew\n'};
const cs = (files: FileProposal[], extra: Partial<ChangeSet> = {}): ChangeSet => ({id: 'cs1', complete: true, files, ...extra});
const k = (path: string, index: number) => hunkKey({path, index});

test('hunks are independent change blocks', () => {
  const r = reviewFile(edit);
  assert.equal(r.hunks.length, 3);
  assert.deepEqual(r.hunks[0].removed, ['b']); assert.deepEqual(r.hunks[0].added, ['B']);
  assert.equal(r.hunks[0].baseLine, 2);
  assert.deepEqual(r.hunks[0].before, ['a']);
});
test('accept all equals proposal, reject all equals base', () => {
  const r = reviewFile(edit); const all: Decisions = {}; r.hunks.forEach(h => all[h.key] = 'accept');
  assert.equal(applyHunks(r, all), edit.proposedText);
  assert.equal(applyHunks(r, {}), base);
});
test('partial accept applies only chosen hunks', () => {
  const r = reviewFile(edit);
  assert.equal(applyHunks(r, {[k('index.html', 1)]: 'accept'}), 'a\nb\nc\nd\ne\nf\nG\nh\n');
});
test('CRLF, unicode and empty input round trip', () => {
  const f: FileProposal = {path: 'a.css', kind: 'edit', baseText: 'x\r\nü\r\n', proposedText: 'x\r\nö\r\n'};
  const r = reviewFile(f); const d: Decisions = {[r.hunks[0].key]: 'accept'};
  assert.equal(applyHunks(r, d), f.proposedText);
  const e = reviewFile({path: 'e.txt', kind: 'edit', baseText: '', proposedText: 'hi'});
  assert.equal(applyHunks(e, {[e.hunks[0].key]: 'accept'}), 'hi');
});
test('create is one whole-file hunk', () => {
  const f: FileProposal = {path: 'new/page.html', kind: 'create', baseText: null, proposedText: '<p>x</p>\n'};
  const r = reviewFile(f); assert.equal(r.hunks.length, 1);
  const p = planApply(cs([f]), {[r.hunks[0].key]: 'accept'}, () => null);
  assert.ok(p.ok); assert.equal(p.writes[0].text, f.proposedText); assert.equal(p.writes[0].kind, 'create');
});
test('create never overwrites an existing file', () => {
  const f: FileProposal = {path: 'index.html', kind: 'create', baseText: null, proposedText: 'x'};
  const p = planApply(cs([f]), {[k('index.html', 0)]: 'accept'}, () => 'already here');
  assert.equal(p.ok, false); assert.equal(p.blockers[0].reason, 'exists'); assert.deepEqual(p.writes, []);
});
test('stale edit is blocked, including unsaved user changes', () => {
  const p = planApply(cs([edit]), {[k('index.html', 0)]: 'accept'}, () => base + 'user typed\n', {allowPending: true});
  assert.equal(p.ok, false); assert.equal(p.blockers[0].reason, 'stale');
  assert.equal(checkFresh(edit, null), 'missing-base');
});
test('rejected-only and untouched files produce no writes', () => {
  const p = planApply(cs([edit]), {[k('index.html', 0)]: 'reject', [k('index.html', 1)]: 'reject', [k('index.html', 2)]: 'reject'}, () => base);
  assert.ok(p.ok); assert.deepEqual(p.writes, []); assert.deepEqual(p.skipped, ['index.html']);
});
test('pending hunks block unless allowPending', () => {
  const d = {[k('index.html', 0)]: 'accept' as const};
  assert.equal(planApply(cs([edit]), d, () => base).blockers[0].reason, 'pending');
  assert.ok(planApply(cs([edit]), d, () => base, {allowPending: true}).ok);
});
test('incomplete (streaming) set cannot be applied', () => {
  const p = planApply(cs([edit], {complete: false}), {}, () => base);
  assert.equal(p.ok, false); assert.equal(p.blockers[0].reason, 'incomplete');
});
test('dependency link blocks partial accept', () => {
  const css: FileProposal = {path: 'style.css', kind: 'edit', baseText: 'p{}\n', proposedText: 'p{}\n.hero{}\n'};
  const html: FileProposal = {path: 'index.html', kind: 'edit', baseText: 'a\n', proposedText: 'a\n<div class=hero>\n'};
  const links = [{hunk: {path: 'index.html', index: 0}, requires: {path: 'style.css', index: 0}, reason: 'class hero needs its rule'}];
  const files = [html, css]; const read = (p: string) => files.find(f => f.path === p)!.baseText;
  const only = planApply(cs(files, {links}), {[k('index.html', 0)]: 'accept', [k('style.css', 0)]: 'reject'}, read);
  assert.equal(only.ok, false); assert.equal(only.blockers[0].reason, 'dependency');
  const both = planApply(cs(files, {links}), {[k('index.html', 0)]: 'accept', [k('style.css', 0)]: 'accept'}, read);
  assert.ok(both.ok); assert.equal(both.writes.length, 2);
});
test('atomic: one blocked file means no writes at all', () => {
  const b: FileProposal = {path: 'b.js', kind: 'edit', baseText: '1\n', proposedText: '2\n'};
  const d = {[k('index.html', 0)]: 'accept' as const, [k('b.js', 0)]: 'accept' as const};
  const p = planApply(cs([edit, b]), d, path => path === 'b.js' ? 'changed' : base, {allowPending: true});
  assert.equal(p.ok, false); assert.deepEqual(p.writes, []);
});
test('forbidden paths', () => {
  for (const bad of ['../x', '/etc/passwd', 'C:/x', 'a\\b', 'a//b', './a', '.git/config', 'sub/.git/x', '.env', 'config/.env.local', 'k/server.pem', 'id_rsa', '', 'a\0b']) assert.notEqual(validatePath(bad), null, bad);
  for (const ok of ['index.html', 'css/site.css', 'a/b/c.js', 'env.md']) assert.equal(validatePath(ok), null, ok);
  const p = planApply(cs([{path: '../evil.html', kind: 'create', baseText: null, proposedText: 'x'}]), {[k('../evil.html', 0)]: 'accept'}, () => null);
  assert.equal(p.ok, false); assert.equal(p.blockers[0].reason, 'invalid-path');
});
test('duplicate paths (case-insensitive) are blocked', () => {
  const a: FileProposal = {path: 'A.html', kind: 'create', baseText: null, proposedText: '1'};
  const b: FileProposal = {path: 'a.html', kind: 'create', baseText: null, proposedText: '2'};
  assert.ok(planApply(cs([a, b]), {}, () => null).blockers.some(x => x.reason === 'duplicate-path'));
});
test('oversized files fail closed', () => {
  const big = 'x\n'.repeat(200_000);
  const f: FileProposal = {path: 'big.js', kind: 'edit', baseText: big, proposedText: big + 'y'};
  const r = reviewFile(f); assert.ok(r.tooLarge);
  const p = planApply(cs([f]), {}, () => big, {allowPending: true});
  assert.equal(p.ok, false); // unreviewable file blocks the set even when nothing is accepted
  const q = planApply(cs([f]), {[k('big.js', 0)]: 'accept'}, () => big, {allowPending: true});
  assert.equal(q.ok, false); assert.equal(q.blockers[0].reason, 'too-large');
});
test('applyReviewed re-plans against live state and writes once, only through the port', async () => {
  const store = new Map([['index.html', base]]); const calls: PlannedWrite[][] = []; const order: string[] = [];
  const port = {read: (p: string) => store.get(p) ?? null, holdAutosave: (p: string[]) => { order.push('hold:' + p.join()); }, applyBatch: (w: PlannedWrite[]) => { order.push('apply'); calls.push(w); }};
  const all: Decisions = {}; reviewFile(edit).hunks.forEach(h => all[h.key] = 'accept');
  store.set('index.html', 'user edited meanwhile');
  const blocked = await applyReviewed(port, cs([edit]), all);
  assert.equal(blocked.ok, false); assert.equal(calls.length, 0);
  store.set('index.html', base);
  const done = await applyReviewed(port, cs([edit]), all);
  assert.ok(done.ok); assert.equal(calls.length, 1); assert.equal(calls[0][0].text, edit.proposedText);
  assert.deepEqual(order, ['hold:index.html', 'apply']); // autosave guard strictly before apply
  assert.equal(store.get('index.html'), base); // engine itself never mutates state
});
test('AI provenance is carried to the plan and marked human reviewed; input is not mutated', () => {
  const provenance = {generatedBy: 'ai' as const, provider: 'openrouter', model: 'm', generatedAt: '2026-10-06T00:00:00Z', humanReviewed: false};
  const set = cs([edit], {provenance}); const all: Decisions = {}; reviewFile(edit).hunks.forEach(h => all[h.key] = 'accept');
  const p = planApply(set, all, () => base);
  assert.equal(p.provenance?.generatedBy, 'ai'); assert.equal(p.provenance?.humanReviewed, true);
  assert.equal(p.writes[0].provenance?.model, 'm'); assert.equal(provenance.humanReviewed, false);
});
test('failing autosave guard prevents apply', async () => {
  const calls: string[] = [];
  const port = {read: () => base, holdAutosave: () => { throw new Error('no guard'); }, applyBatch: () => { calls.push('apply'); }};
  const all: Decisions = {}; reviewFile(edit).hunks.forEach(h => all[h.key] = 'accept');
  await assert.rejects(applyReviewed(port, cs([edit]), all), /no guard/);
  assert.deepEqual(calls, []);
});

test('editor changes during async autosave hold are rechecked before apply',async()=>{
 let current='before';let applied=false;
 const cs:ChangeSet={id:'hold-race',complete:true,files:[{path:'index.html',kind:'edit',baseText:'before',proposedText:'after'}]};
 const result=await applyReviewed({read:()=>current,holdAutosave:async()=>{current='human edit';},applyBatch:()=>{applied=true;}},cs,{'index.html#0':'accept'});
 assert.equal(result.ok,false);assert.equal(applied,false);
});
