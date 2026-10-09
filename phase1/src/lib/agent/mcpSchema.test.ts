import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMcpArgs } from './mcpSchema';
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
test('malformed or hostile schemas are ignored safely', () => {
  assert.deepEqual(validateMcpArgs({ a: 1 }, null), []);
  assert.deepEqual(validateMcpArgs({ a: 1 }, { type: 'object', properties: { a: 'nonsense' } }), []);
  assert.deepEqual(validateMcpArgs('x', { type: 'object' }), ['arguments must be object']);
  const deep: Record<string, unknown> = {}; let cur = deep; for (let i = 0; i < 50; i++) { cur.properties = { n: { type: 'string' } }; const nx: Record<string, unknown> = {}; (cur.properties as Record<string, unknown>).n = nx; cur = nx; }
  assert.doesNotThrow(() => validateMcpArgs({}, deep));
});
