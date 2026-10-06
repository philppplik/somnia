import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankComments, cssRegions, parseVariables, setVariableValue, addVariable, renameClass, classesInSelectors } from './cssTools';

test('comment masking preserves every source offset and newline', () => {
  const text = '/* first\n second */\n:root { --real: 2px; }';
  const blank = blankComments(text);
  assert.equal(blank.length, text.length);
  assert.deepEqual([...blank.matchAll(/\n/g)].map(m => m.index), [...text.matchAll(/\n/g)].map(m => m.index));
  assert.equal(blank.indexOf(':root'), text.indexOf(':root'));
  assert.equal(parseVariables({ 'a.css': text })[0].line, 3);
});

test('variable edits target the correct one of multiple style regions without touching surrounding HTML', () => {
  const html = '<!doctype html>\r\n<style>:root { --gap: 8px; }</style>\r\n<p>8px</p>\r\n<STYLE media="print">.print { --gap: 12px; }</STYLE>';
  const files = { 'index.html': html, 'notes.txt': ':root { --fake: 0; }' };
  assert.equal(cssRegions(files).length, 2);
  const vars = parseVariables(files); assert.equal(vars.length, 2);
  const v = vars.find(v => v.scope === '.print')!;
  assert.equal(v.line, 4); assert.equal(html.slice(v.start, v.end), '12px');
  assert.equal(setVariableValue(files, v, '  16px  '), html.replace('--gap: 12px', '--gap: 16px'));
  assert.equal(files['index.html'], html, 'pure tooling must not mutate its input');
});

test('nested media variables retain distinct selector scopes and exact edit ranges', () => {
  const text = ':root { --gap: 8px; }\n@media (max-width:600px) { .card { --gap: 4px; } }';
  const files = { 'a.css': text }, vars = parseVariables(files);
  assert.deepEqual(vars.map(v => [v.scope, v.value]), [[':root', '8px'], ['.card', '4px']]);
  assert.equal(setVariableValue(files, vars[1], '2px'), text.replace('4px', '2px'));
});

test('variable value validation blocks declaration/block/comment injection', () => {
  const files = { 'a.css': ':root { --color: red; }' }, v = parseVariables(files)[0];
  for (const value of ['blue;display:none', 'blue}', '{blue', '/*blue*/', 'blue*/', '\n\t']) assert.equal(setVariableValue(files, v, value), null, value);
  assert.equal(setVariableValue({}, v, 'blue'), null);
  assert.equal(setVariableValue(files, v, 'var(--fallback, rgb(1, 2, 3))'), ':root { --color: var(--fallback, rgb(1, 2, 3)); }');
});

test('adding a variable skips a commented-out root and preserves the existing real root', () => {
  const text = '/* :root { --old: 0; } */\n:root { --real: 1; }';
  assert.equal(addVariable({ 'a.css': text }, 'a.css', '--new', '2'), '/* :root { --old: 0; } */\n:root {\n  --new: 2; --real: 1; }');
  assert.equal(addVariable({ 'a.css': text }, 'missing.css', '--new', '2'), null);
});

test('class renaming preserves token prefixes, whitespace, quote style and declaration values', () => {
  const files = {
    'index.html': '<div class=\'card\tcard-large  card\'>card</div>',
    'a.css': '.card:hover, .card-large .card { content: ".card"; --label: card; }',
    'readme.md': '.card class="card"',
  };
  const result = renameClass(files, 'card', 'tile'); assert.ok('changed' in result);
  assert.deepEqual(result, { count: 4, changed: {
    'index.html': '<div class=\'tile\tcard-large  tile\'>card</div>',
    'a.css': '.tile:hover, .card-large .tile { content: ".card"; --label: card; }',
  } });
  assert.equal(files['a.css'], '.card:hover, .card-large .card { content: ".card"; --label: card; }');
});

test('selector class listing ignores quoted attribute values and decimal keyframes', () => {
  assert.deepEqual(classesInSelectors('[data-label=".fake"] .real:hover {x:1} @keyframes fade { 0.5% {opacity:0} }'), ['real']);
  const files = { 'a.css': '.one {}', 'b.html': '<div class="two"></div>' };
  assert.ok('error' in renameClass(files, 'one', 'two'), 'usage-only target is a collision too');
  assert.deepEqual(renameClass(files, 'absent', 'unused'), { changed: {}, count: 0 });
});
