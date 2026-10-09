import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const directory = fileURLToPath(new URL('../../tests/assets/design-studio/', import.meta.url));
const read = (name: string) => readFileSync(`${directory}${name}`, 'utf8');

test('Design QA corpus contains only small checked-in, deterministic local inputs', () => {
  const names = readdirSync(directory).filter(name => name.endsWith('.svg'));
  assert.equal(names.length, 7);
  for (const name of names) {
    const content = read(name);
    assert.ok(Buffer.byteLength(content) < 4096, name);
    assert.ok(!content.includes('data:image'), name);
    assert.ok(!content.includes('file://'), name);
    assert.ok(!content.includes('http://127.0.0.1'), name);
  }
});

test('blank SVG reference has no objects and a stable artboard', () => {
  const blank = read('blank.svg');
  assert.match(blank, /viewBox="0 0 640 480"/);
  assert.doesNotMatch(blank, /<(rect|ellipse|text|path|image|g)\b/);
});

test('layered SVG reference keeps painter order and Unicode text', () => {
  const svg = read('layered-card.svg');
  const ids = Array.from(svg.matchAll(/id="([^"]+)"/g), match => match[1]);
  assert.deepEqual(ids, ['background', 'card', 'badge', 'headline', 'unicode']);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(svg.includes('Café · 東京 · مرحبا · A &amp; B'));
});

test('security input is intentionally distinct from the safe reference inputs', () => {
  const hostile = read('active-content.svg');
  assert.match(hostile, /<script>/);
  assert.match(hostile, /onload=/);
  assert.match(hostile, /onclick=/);
  assert.match(hostile, /<foreignObject/);
  assert.match(hostile, /javascript:/);
  assert.match(hostile, /https:\/\/example\.invalid\//);
  for (const name of ['blank.svg', 'layered-card.svg', 'geometry.svg']) {
    assert.doesNotMatch(read(name), /<script|onload=|onclick=|<foreignObject|javascript:|https:\/\//);
  }
});

test('geometry reference includes fractional and negative coordinates', () => {
  assert.match(read('geometry.svg'), /x="-20"/);
  assert.match(read('geometry.svg'), /width="80.75"/);
  assert.match(read('geometry.svg'), /opacity="0.5"/);
  assert.match(read('geometry.svg'), /&lt;Design&gt; &amp;/);
});

test('invalid fixture content cannot be mistaken for the blank artboard', () => {
  assert.ok(!read('not-a-design.svg').includes('<svg'));
  assert.match(read('malformed.svg'), /<rect[^>]+><\/svg>/);
});
