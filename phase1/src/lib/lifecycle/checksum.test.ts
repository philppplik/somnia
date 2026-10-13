import test from 'node:test';
import assert from 'node:assert/strict';
import { checksumBytes, checksumParts } from './checksum';

test('checksums are deterministic and stable in shape', () => {
  const a = checksumBytes(new Uint8Array([1, 2, 3]));
  const b = checksumBytes(new Uint8Array([1, 2, 3]));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('different bytes produce different checksums', () => {
  assert.notEqual(checksumBytes(new Uint8Array([1, 2, 3])), checksumBytes(new Uint8Array([1, 2, 4])));
});

test('part order and content matter', () => {
  const base = ['a', 1, new Uint8Array([9])] as const;
  assert.equal(checksumParts(base), checksumParts([...base]));
  assert.notEqual(checksumParts(['a', 1]), checksumParts(['a', 2]));
  assert.notEqual(checksumParts(['ab', 'c']), checksumParts(['a', 'bc']));
});

test('length prefixes prevent concatenation ambiguity', () => {
  assert.notEqual(
    checksumParts(['x', 'yz']),
    checksumParts(['xy', 'z']),
  );
  assert.notEqual(checksumParts([null, 'a']), checksumParts(['a', null]));
});
