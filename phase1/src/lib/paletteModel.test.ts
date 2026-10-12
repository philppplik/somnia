import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaletteEntries, coerceParam, paramPrompts, rankEntries } from './paletteModel';
import type { CommandSpec } from './commandSpec';

const spec = (over: Partial<CommandSpec<unknown, unknown>>): CommandSpec<unknown, unknown> => ({ id: 'a.one', title: 'One', category: 'Tools', level: 'ui', run: () => {}, ...over });

test('entries come from specs first, legacy-only commands are appended, no duplicates', () => {
  const entries = buildPaletteEntries(
    [spec({ id: 'a.one', title: 'One', keywords: ['uno'], shortcut: 'Mod+1' })],
    [{ id: 'a.one', title: 'Eins', category: 'Tools', shortcut: 'Mod+9' }, { id: 'legacy.x', title: 'Legacy', category: 'View' }],
  );
  assert.deepEqual(entries.map(e => [e.id, e.spec]), [['a.one', true], ['legacy.x', false]]);
  assert.equal(entries[0].title, 'Eins', 'translated title from the registry wins');
  assert.equal(entries[0].shortcut, 'Mod+9', 'user shortcut override wins');
  assert.deepEqual(entries[0].keywords, ['uno']);
});

test('a user-disabled shortcut (empty override) hides the spec default', () => {
  const [e] = buildPaletteEntries([spec({ shortcut: 'Mod+1' })], [{ id: 'a.one', title: 'One', category: 'Tools' }]);
  assert.equal(e.shortcut, undefined);
});

test('required scalar params become prompts, optional and complex ones do not', () => {
  const prompts = paramPrompts({ type: 'object', required: ['name', 'size', 'tags'], properties: { name: { type: 'string', title: 'File name' }, size: { type: 'integer' }, tags: { type: 'array' }, extra: { type: 'string' } } });
  assert.deepEqual(prompts.map(p => [p.name, p.label, p.type]), [['name', 'File name', 'string'], ['size', 'size', 'integer']]);
  assert.deepEqual(paramPrompts(undefined), []);
});

test('coerceParam parses by type and respects enums', () => {
  const p = (type: 'string' | 'number' | 'integer' | 'boolean', e?: unknown[]) => ({ name: 'x', label: 'x', type, ...(e ? { enum: e } : {}) });
  assert.equal(coerceParam(p('string'), 'hi'), 'hi');
  assert.equal(coerceParam(p('string'), ''), undefined);
  assert.equal(coerceParam(p('integer'), ' 4 '), 4);
  assert.equal(coerceParam(p('integer'), '4.5'), undefined);
  assert.equal(coerceParam(p('number'), '4.5'), 4.5);
  assert.equal(coerceParam(p('number'), 'abc'), undefined);
  assert.equal(coerceParam(p('boolean'), 'yes'), true);
  assert.equal(coerceParam(p('boolean'), 'off'), false);
  assert.equal(coerceParam(p('string', ['a', 'b']), 'c'), undefined);
});

test('ranking: fuzzy match on title and keywords, recents first for an empty query', () => {
  const entries = buildPaletteEntries([spec({ id: 'a.one', title: 'Open file', keywords: ['load'] }), spec({ id: 'a.two', title: 'Close' }), spec({ id: 'a.three', title: 'Zoom' })], []);
  assert.deepEqual(rankEntries(entries, '>opn', []).map(e => e.id), ['a.one']);
  assert.deepEqual(rankEntries(entries, 'load', []).map(e => e.id), ['a.one']);
  assert.deepEqual(rankEntries(entries, '', ['a.three']).map(e => e.id)[0], 'a.three');
  assert.deepEqual(rankEntries(entries, 'qq', []), []);
});

test('generic form retains full optional and nested schema, not only scalar prompts', () => {
  const params = {type:'object',properties:{settings:{type:'object',properties:{amount:{type:'number'}}}},additionalProperties:false};
  const [entry] = buildPaletteEntries([spec({params})], []);
  assert.equal(entry.schema, params);
  assert.deepEqual(entry.params, []);
});
