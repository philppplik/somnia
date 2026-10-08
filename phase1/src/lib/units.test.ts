import test from 'node:test';
import assert from 'node:assert/strict';
import { unitSystem, paperFor, formatLength, parseLength, regionOf } from './units';

test('auto follows locale region', () => {
  assert.equal(unitSystem('auto', 'en-US'), 'imperial');
  assert.equal(unitSystem('auto', 'de-DE'), 'metric');
  assert.equal(unitSystem('auto', 'en-GB'), 'metric');
  assert.equal(unitSystem('auto', 'de'), 'metric');
  assert.equal(unitSystem('auto', undefined), 'metric');
  assert.equal(paperFor('auto', 'en-US'), 'Letter');
  assert.equal(paperFor('auto', 'en-CA'), 'Letter');
  assert.equal(paperFor('auto', 'pt-BR'), 'A4');
  assert.equal(regionOf('fr_FR'), 'FR');
});
test('explicit choice wins', () => {
  assert.equal(unitSystem('metric', 'en-US'), 'metric');
  assert.equal(paperFor('imperial', 'de-DE'), 'Letter');
});
test('format and parse', () => {
  assert.equal(formatLength(595.28, 'metric'), '210 mm');
  assert.equal(formatLength(612, 'imperial'), '8.5 in');
  assert.ok(Math.abs(parseLength('210 mm', 'imperial')! - 595.28) < 0.01);
  assert.equal(parseLength('8,5in', 'metric'), 612);
  assert.equal(parseLength('1', 'imperial'), 72);
  assert.equal(parseLength('abc', 'metric'), null);
});
