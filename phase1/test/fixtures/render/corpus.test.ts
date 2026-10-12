import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'parse5';
import {manifest, projectFiles, root} from './corpus';
import {updateScope, validateApproval} from './approval';
const files = projectFiles();
test('versioned corpus contains 30-50 unique fixtures', () => {
  assert.equal(manifest.version, 1);
  assert.ok(manifest.fixtures.length >= 30 && manifest.fixtures.length <= 50);
  assert.equal(new Set(manifest.fixtures.map(f => f.id)).size, manifest.fixtures.length);
});
test('required layout categories have coverage', () => {
  for (const category of ['flex', 'grid', 'table', 'forms', 'mail', 'responsive', 'geometry', 'type', 'assets', 'scripts', 'motion']) {
    assert.ok(manifest.fixtures.some(f => f.category === category), category);
  }
});
test('fixture sources have root markers, real bodies, desktop/mobile viewports and no remote URLs', () => {
  for (const f of manifest.fixtures) {
    const source = files[f.entry]; assert.ok(source, f.entry);
    assert.match(source, new RegExp(`data-fixture="${f.id}"`));
    assert.ok(parse(source).childNodes.length);
    assert.equal(f.viewports.length, 2); assert.equal(f.viewports[0].width, 960); assert.equal(f.viewports[1].width, 375);
    assert.doesNotMatch(source, /(?:src|href)=["'](?:https?:)?\/\//);
  }
});
test('all local stylesheet and script links resolve', () => {
  for (const [name, source] of Object.entries(files)) {
    if (!name.endsWith('.html')) continue;
    for (const match of source.matchAll(/(?:src|href)="([^"#]+\.(?:css|js|svg))"/g)) {
      const resolved = match[1].startsWith('/') ? match[1].slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
      assert.ok(files[resolved], `${name} -> ${resolved}`);
    }
  }
});
test('bundled font and its redistribution notice are present', () => {
  assert.ok(readFileSync(path.join(root, 'assets/DejaVuSans.ttf')).byteLength > 1000);
  assert.match(readFileSync(path.join(root, 'assets/FONT-LICENSE.txt'), 'utf8'), /Permission is hereby granted/);
  assert.match(files['assets/base.css'], /font-family:RenderReference/);
});
test('every fixture and viewport has a PNG golden', () => {
  for (const f of manifest.fixtures) for (const v of f.viewports) {
    const p = path.join(root, 'goldens', `${f.id}-${v.width}x${v.height}.png`);
    assert.ok(existsSync(p), p);
    assert.deepEqual([...readFileSync(p).subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  }
});
const approval = {approver: 'Philipp Paulik', source: 'authenticated decision reference', reason: 'Intentional spacing change', fixtures: ['flex-row']};
test('approval receipt accepts explicit known fixture scope', () => assert.deepEqual(validateApproval(approval).fixtures, ['flex-row']));
test('approval receipt rejects missing or different approver', () => {
  assert.throws(() => validateApproval({...approval, approver: 'agent'})); assert.throws(() => validateApproval(null));
});
test('approval receipt rejects missing source or reason', () => {
  assert.throws(() => validateApproval({...approval, source: ''})); assert.throws(() => validateApproval({...approval, reason: ''}));
});
test('approval receipt rejects unknown, duplicate or wildcard scope', () => {
  for (const fixtures of [[], ['*'], ['absent'], ['flex-row', 'flex-row']]) assert.throws(() => validateApproval({...approval, fixtures}));
});
test('unapproved update and second bootstrap are refused', () => {
  assert.throws(() => updateScope({}), /direct snapshot updates/);
  assert.throws(() => updateScope({SOMNIA_RENDER_BOOTSTRAP: '1'}), /Existing references need approval/);
});
