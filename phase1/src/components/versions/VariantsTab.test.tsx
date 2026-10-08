import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Notice, VariantsList } from './VariantsTab';
import { ConflictResolver } from './ConflictResolver';
import { conflict, variant } from '../../lib/git/fakeVariantsBackend';
import { initDrafts, pickSide, editResult } from '../../lib/git/variantsFlow';
import { CATALOGUES, translate } from '../../lib/i18n';

const noop = () => {};
const listProps = { busy: false, onOpen: noop, onCombine: noop, onRename: noop, onDelete: noop };

test('variant list: text badge for the open variant, per-variant accessible names, no delete on the open one', () => {
  const html = renderToStaticMarkup(<VariantsList variants={[variant('main', { current: true }), variant('redesign', { merged: false, ahead: 2 })]} {...listProps} />);
  assert.match(html, /Open now/);
  assert.match(html, /aria-label="Open variant redesign"/);
  assert.match(html, /aria-label="Combine variant redesign into the open one"/);
  assert.match(html, /aria-label="Delete variant redesign"/);
  assert.doesNotMatch(html, /Delete variant main/);
  assert.doesNotMatch(html, /Open variant main/);
  assert.match(html, /2 versions that are not in the open variant yet/);
});
test('merged variants offer no combine button', () => {
  const html = renderToStaticMarkup(<VariantsList variants={[variant('main', { current: true }), variant('old')]} {...listProps} />);
  assert.doesNotMatch(html, /Combine variant old/);
  assert.match(html, /already in the open one/);
});
test('empty list explains what a variant is for', () => {
  assert.match(renderToStaticMarkup(<VariantsList variants={[]} {...listProps} />), /No variants yet/);
});
test('guard notice lists unsaved files and open reviews and is announced as an alert', () => {
  const html = renderToStaticMarkup(<Notice n={{ kind: 'guard', unsaved: ['index.html'], reviews: ['AI change review'] }} />);
  assert.match(html, /role="alert"/); assert.match(html, /index\.html/); assert.match(html, /AI change review/);
});
test('dirty notice offers to go to Changes', () => {
  const html = renderToStaticMarkup(<Notice n={{ kind: 'dirty', changes: 1 }} onSaveVersion={noop} />);
  assert.match(html, /1 file has changes/); assert.match(html, /Go to Changes/);
});

const props = (drafts: ReturnType<typeof initDrafts>) => ({ yoursName: 'open variant', theirsName: 'other', drafts, selected: 0, message: 'Combined', onSelect: noop, onChange: noop, onMessage: noop, onFinish: noop, onAbort: noop });

test('conflict dialog: three columns, result editable, finish disabled until decided, no global keep-all button', () => {
  const html = renderToStaticMarkup(<ConflictResolver {...props(initDrafts([conflict('index.html'), conflict('b.css')]))} />);
  assert.match(html, /Yours \(open variant\)/); assert.match(html, /Theirs \(other\)/); assert.match(html, />Result</);
  assert.match(html, /<textarea[^>]*class="vr-result"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Finish combine<\/button>/);
  assert.match(html, /2 files still need a decision/);
  assert.match(html, /Needs decision/);
  assert.match(html, /still contains conflict markers/);
  assert.match(html, /Use yours for this file/); assert.match(html, /Use theirs for this file/);
  assert.doesNotMatch(html, /keep all|Alle meine|all of mine|all of theirs/i);
  assert.match(html, /Cancel combine/);
});
test('finish becomes enabled once every file is decided', () => {
  let ds = initDrafts([conflict('a.html'), conflict('b.css')]);
  ds = [pickSide(ds[0], 'yours'), editResult(ds[1], 'ok\n')];
  const html = renderToStaticMarkup(<ConflictResolver {...props(ds)} />);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Finish combine/);
  assert.match(html, /All files are decided/);
});
test('binary conflict has no editable result and asks for an explicit side', () => {
  const html = renderToStaticMarkup(<ConflictResolver {...props(initDrafts([conflict('logo.png', { binary: true, yours: null, theirs: null, working: null, yoursBytes: 12, theirsBytes: 20 })]))} />);
  assert.doesNotMatch(html, /<textarea/);
  assert.match(html, /cannot be merged as text/); assert.match(html, /12 bytes/); assert.match(html, /20 bytes/);
  assert.doesNotMatch(html, /Use both/);
});
test('a side that deleted the file offers to accept the deletion', () => {
  const html = renderToStaticMarkup(<ConflictResolver {...props(initDrafts([conflict('x.txt', { kind: 'deleted-by-theirs', theirs: null })]))} />);
  assert.match(html, /Accept that it is deleted/);
  assert.match(html, /file deleted on this side/);
});
test('every variants key exists in en and de with matching placeholders; de renders', () => {
  const keys = Object.keys(CATALOGUES.en).filter(k => k.startsWith('variants.'));
  assert.ok(keys.length > 80);
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  for (const k of keys) { assert.ok(CATALOGUES.de[k], `de ${k}`); assert.equal(ph(CATALOGUES.de[k]), ph(CATALOGUES.en[k]), k); }
  assert.equal(translate('de', 'variants.conflict.open', { count: 1 }), '1 Datei braucht noch eine Entscheidung');
  assert.equal(translate('de', 'variants.conflict.open', { count: 3 }), '3 Dateien brauchen noch eine Entscheidung');
  const html = renderToStaticMarkup(<Notice n={{ kind: 'error', error: { code: 'blocked', message: '', detail: 'variant-exists' } }} />);
  assert.match(html, /already exists/);
});
test('every i18n key referenced by the variants sources exists', async () => {
  const { readFileSync } = await import('node:fs');
  const src = ['src/components/versions/VariantsTab.tsx', 'src/components/versions/ConflictResolver.tsx', 'src/lib/git/variantsFlow.ts'].map(f => readFileSync(f, 'utf8')).join('\n');
  const used = new Set([...src.matchAll(/'(variants\.[\w.-]+)'/g)].map(m => m[1]));
  assert.ok(used.size > 50);
  for (const k of used) assert.ok(k in CATALOGUES.en || `${k}_other` in CATALOGUES.en, `missing ${k}`);
});
