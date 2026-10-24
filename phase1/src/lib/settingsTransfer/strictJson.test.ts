import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictJson, SETUP_LIMITS } from './strictJson';

const ok = (t: string) => { const r = parseStrictJson(t); assert.ok(r.ok, t); return (r as { value: any }).value; };
const bad = (t: string, why?: RegExp) => { const r = parseStrictJson(t); assert.equal(r.ok, false, t); if (why) assert.match((r as { error: string }).error, why); };

test('parses ordinary JSON into null-prototype objects', () => {
  const v = ok('{"a":1,"b":[true,null,"x\\u00e4"],"c":{"d":-1.5e2}}');
  assert.equal(Object.getPrototypeOf(v), null);
  assert.deepEqual(v.b, [true, null, 'xä']);
  assert.equal(v.c.d, -150);
});
test('rejects duplicate keys that JSON.parse would accept', () => {
  bad('{"a":1,"a":2}', /Duplicate/);
  bad('{"x":{"a":1,"a":1}}', /Duplicate/);
});
test('rejects prototype-pollution keys at any depth, also via escapes', () => {
  bad('{"__proto__":{"x":1}}', /Forbidden/);
  bad('{"a":{"constructor":1}}', /Forbidden/);
  bad('{"prototype":1}', /Forbidden/);
  bad('{"\\u005f_proto__":1}', /Forbidden/);
  assert.equal(({} as any).x, undefined);
});
test('rejects control characters, NUL and lone surrogates', () => {
  bad('{"a":"x\ny"}', /Control/);
  bad('{"a":"\\u0000"}', /NUL/);
  bad('{"a":"\\ud800"}', /Unicode/);
  bad('{"a":"\ud800"}', /Unicode/);
});
test('enforces depth, entry and byte limits', () => {
  bad('['.repeat(40) + ']'.repeat(40), /deeply/);
  bad('[' + Array(10_001).fill('1').join(',') + ']', /Too many/);
  bad('"' + 'a'.repeat(SETUP_LIMITS.maxBytes) + '"', /too large/);
  // bytes, not string length: 3-byte characters
  bad('"' + '€'.repeat(Math.ceil(SETUP_LIMITS.maxBytes / 3)) + '"', /too large/);
});
test('rejects trailing garbage, comments and bare tokens', () => {
  bad('{} x'); bad('{"a":1,}'); bad('// c\n{}'); bad('{"a":NaN}'); bad('{"a":1e999}'); bad(''); bad('{"a"');
});
