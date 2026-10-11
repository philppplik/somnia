import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMcpArgs, checkMcpArgs, assertMcpArgs, McpArgsError, MCP_ARG_ERROR_ID } from './mcpSchema';
import { ERROR_IDS } from '../../generated/errorIds';
const schema = { type: 'object', required: ['path'], properties: { path: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 10 }, mode: { enum: ['a', 'b'] }, tags: { type: 'array', items: { type: 'string' }, maxItems: 2 } } };
test('valid arguments pass', () => { assert.deepEqual(validateMcpArgs({ path: 'x', limit: 3, mode: 'a', tags: ['t'] }, schema), []); });
test('missing required and wrong types are reported with paths', () => {
  assert.deepEqual(validateMcpArgs({}, schema), ['path is required']);
  assert.deepEqual(validateMcpArgs({ path: 5 }, schema), ['path must be string']);
  assert.deepEqual(validateMcpArgs({ path: 'x', limit: 1.5 }, schema), ['limit must be integer']);
});
test('ranges, enums and arrays', () => {
  assert.deepEqual(validateMcpArgs({ path: 'x', limit: 11 }, schema), ['limit must be at most 10']);
  assert.deepEqual(validateMcpArgs({ path: 'x', mode: 'z' }, schema), ['mode must be one of the allowed values']);
  assert.deepEqual(validateMcpArgs({ path: 'x', tags: ['a', 'b', 'c'] }, schema), ['tags allows at most 2 items']);
  assert.deepEqual(validateMcpArgs({ path: 'x', tags: [1] }, schema), ['tags[0] must be string']);
});
const codes = (a: unknown, sc: unknown) => { const r = checkMcpArgs(a, sc); return r.ok ? [] : r.issues.map(i => i.code); };
test('absent schema means any object, everything else non-object fails closed', () => {
  assert.deepEqual(validateMcpArgs({ a: 1 }, undefined), []);
  assert.deepEqual(validateMcpArgs({ a: 1 }, null), []);
  for (const bad of ['x', 5, [], ['object']]) assert.deepEqual(codes({}, bad), ['unsupported-schema']);
  assert.deepEqual(codes({ a: 1 }, { type: 'object', properties: { a: 'nonsense' } }), ['unsupported-schema']);
  assert.deepEqual(validateMcpArgs('x', { type: 'object' }), ['arguments must be object']);
});
test('unknown or unhonorable keywords reject instead of being skipped', () => {
  for (const kw of ['$ref', 'not', 'if', 'patternProperties', 'dependentRequired', 'unevaluatedProperties', 'bogus']) {
    assert.deepEqual(codes({}, { type: 'object', [kw]: {} }), ['unsupported-schema'], kw);
  }
  assert.deepEqual(codes({ a: 1 }, { type: 'object', properties: { a: { $ref: '#/x' } } }), ['unsupported-schema']);
});
test('annotation keywords are ignored', () => {
  assert.deepEqual(validateMcpArgs({ a: 'x' }, { $schema: 'http://json-schema.org/draft-07/schema#', title: 'T', description: 'd', type: 'object', properties: { a: { type: 'string', format: 'uri', default: 'q', examples: ['z'] } }, $defs: {} }), []);
});
test('malformed keyword values reject', () => {
  const bad: unknown[] = [{ type: 'strng' }, { type: [] }, { type: 7 }, { enum: 'a' }, { required: 'a' }, { required: [1] }, { properties: [] }, { additionalProperties: 'no' }, { minimum: '1' }, { minLength: -1 }, { anyOf: [] }, { oneOf: 'x' }, { multipleOf: 0 }];
  for (const sc of bad) {
    const wrapped = { type: 'object', properties: { v: sc } };
    const val = typeof (sc as Record<string, unknown>).minimum === 'string' ? 5 : typeof (sc as Record<string, unknown>).minLength === 'number' ? 'abc' : (sc as Record<string, unknown>).multipleOf === 0 ? 3 : {};
    assert.deepEqual(codes({ v: val }, wrapped), ['unsupported-schema'], JSON.stringify(sc));
  }
});
test('additionalProperties, nested objects and uniqueness', () => {
  const sc = { type: 'object', additionalProperties: false, properties: { o: { type: 'object', additionalProperties: { type: 'integer' } }, u: { type: 'array', uniqueItems: true } } };
  assert.deepEqual(codes({ x: 1 }, sc), ['additional']);
  assert.deepEqual(codes({ o: { a: 1 } }, sc), []);
  assert.deepEqual(codes({ o: { a: 'z' } }, sc), ['type']);
  assert.deepEqual(codes({ u: [1, 2, 1] }, sc), ['unique']);
  assert.deepEqual(codes({ u: [{ a: 1, b: 2 }, { b: 2, a: 1 }] }, sc), ['unique']);
});
test('numbers: exclusive bounds and multipleOf', () => {
  const sc = { type: 'object', properties: { n: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.1 } } };
  assert.deepEqual(codes({ n: 0.3 }, sc), []);
  assert.deepEqual(codes({ n: 0 }, sc), ['range']);
  assert.deepEqual(codes({ n: 1 }, sc), ['range']);
  assert.deepEqual(codes({ n: 0.25 }, sc), ['range']);
});
test('strings: pattern, code point length, bad and oversized patterns', () => {
  const sc = { type: 'object', properties: { s: { type: 'string', pattern: '^[a-z]+$', maxLength: 3 } } };
  assert.deepEqual(codes({ s: 'abc' }, sc), []);
  assert.deepEqual(codes({ s: 'AB' }, sc), ['pattern']);
  assert.deepEqual(codes({ s: 'abcd' }, sc), ['length']);
  assert.deepEqual(codes({ s: '\u{1F600}\u{1F600}' }, { type: 'object', properties: { s: { maxLength: 2 } } }), []);
  assert.deepEqual(codes({ s: 'a' }, { type: 'object', properties: { s: { pattern: '(' } } }), ['unsupported-schema']);
  assert.deepEqual(codes({ s: 'a' }, { type: 'object', properties: { s: { pattern: 'a'.repeat(300) } } }), ['unsupported-schema']);
  assert.deepEqual(codes({ s: 'a'.repeat(5000) }, { type: 'object', properties: { s: { pattern: 'a' } } }), ['limit']);
});
test('anyOf, oneOf and allOf', () => {
  const sc = { type: 'object', properties: { v: { anyOf: [{ type: 'string' }, { type: 'integer' }] }, w: { oneOf: [{ type: 'number' }, { type: 'integer' }] }, x: { allOf: [{ type: 'string' }, { minLength: 2 }] } } };
  assert.deepEqual(codes({ v: 's', x: 'ab' }, sc), []);
  assert.deepEqual(codes({ v: true }, sc), ['combinator']);
  assert.deepEqual(codes({ w: 1 }, sc), ['combinator']);
  assert.deepEqual(codes({ w: 1.5 }, sc), []);
  assert.deepEqual(codes({ x: 'a' }, sc), ['length']);
  assert.deepEqual(codes({ v: 1 }, { type: 'object', properties: { v: { anyOf: [{ $ref: 'x' }] } } }), ['unsupported-schema']);
});
test('limits: depth and node budget fail closed', () => {
  let sc: Record<string, unknown> = { type: 'string' }; let val: unknown = 'x';
  for (let i = 0; i < 20; i++) { sc = { type: 'object', properties: { n: sc } }; val = { n: val }; }
  assert.deepEqual(codes(val, sc), ['limit']);
  assert.deepEqual(codes({ l: Array.from({ length: 201 }, () => 1) }, { type: 'object', properties: { l: { type: 'array', items: { type: 'integer' } } } }), ['limit']);
  const wide = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'string' } } } } };
  assert.doesNotThrow(() => checkMcpArgs({ a: { b: 'x' } }, wide));
});
test('prototype keys and hostile objects do not escape', () => {
  const sc = { type: 'object', required: ['toString'], properties: { constructor: { type: 'string' } } };
  assert.deepEqual(codes({}, sc), ['required']);
  assert.deepEqual(codes(JSON.parse('{"__proto__": 1, "toString": "a"}'), { type: 'object', additionalProperties: false, properties: { toString: { type: 'string' } } }), ['additional']);
  const cyc: Record<string, unknown> = {}; cyc.self = cyc;
  assert.doesNotThrow(() => checkMcpArgs(cyc, { type: 'object', properties: { self: { type: 'object' } } }));
});
test('typed error carries the registry id and never echoes values', () => {
  assert.equal(MCP_ARG_ERROR_ID, ERROR_IDS.AGT_003);
  assert.throws(() => assertMcpArgs({ path: 'SECRET-TOKEN', limit: 99 }, schema), (e: unknown) => {
    assert.ok(e instanceof McpArgsError);
    assert.equal(e.errorId, ERROR_IDS.AGT_003);
    assert.deepEqual(e.issues.map(i => i.code), ['range']);
    assert.ok(!e.message.includes('SECRET-TOKEN'));
    return true;
  });
  assert.doesNotThrow(() => assertMcpArgs({ path: 'x' }, schema));
});
