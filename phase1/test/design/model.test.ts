import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDesignDocument, parseDesignDocument, serializeDesignDocument, exportArtboardSVG} from '../../src/lib/design/model';

const fixture = (name: string) => readFileSync(new URL(`../../tests/assets/design-studio/${name}.somdesign`, import.meta.url), 'utf8');

test('native blank fixture is a real editable empty artboard', () => {
  const doc = parseDesignDocument(fixture('blank'));
  assert.equal(doc.format, 'somnia-design');
  assert.equal(doc.version, 1);
  assert.equal(doc.artboards.length, 1);
  assert.equal(doc.artboards[0].width, 640);
  assert.equal(doc.artboards[0].height, 480);
  assert.deepEqual(doc.artboards[0].nodes, []);
});

test('native project round trip retains identity, ordering, geometry and Unicode', () => {
  for (const name of ['blank', 'layered', 'multiple-artboards', 'layer-flags']) {
    const original = parseDesignDocument(fixture(name));
    const reopened = parseDesignDocument(serializeDesignDocument(original));
    assert.deepEqual(reopened, original, name);
    assert.notEqual(reopened, original, name);
    assert.notEqual(reopened.artboards[0], original.artboards[0], name);
  }
});

test('separate blank starts never alias the same mutable document', () => {
  const first = createDesignDocument();
  const second = createDesignDocument();
  assert.notEqual(first, second);
  assert.notEqual(first.artboards, second.artboards);
  assert.notEqual(first.artboards[0], second.artboards[0]);
  assert.equal(first.artboards[0].nodes.length, 0);
  assert.equal(second.artboards[0].nodes.length, 0);
});

for (const name of ['malformed', 'wrong-version', 'wrong-format', 'duplicate-ids', 'invalid-geometry', 'unknown-kind']) {
  test(`native import rejects ${name} instead of silently repairing it`, () => {
    assert.throws(() => parseDesignDocument(fixture(name)));
  });
}

test('SVG export preserves rectangle-before-text order and does not emit active text markup', () => {
  const doc = parseDesignDocument(fixture('layered'));
  const svg = exportArtboardSVG(doc.artboards[0]);
  assert.match(svg, /<svg\b/);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 640 480"/);
  assert.ok(svg.indexOf('<rect') < svg.indexOf('<text'));
  assert.ok(svg.includes('Café'));
  assert.ok(svg.includes('東京'));
  assert.ok(svg.includes('مرحبا'));
  assert.ok(svg.includes('&lt;Design&gt;'));
  assert.ok(svg.includes('&amp;'));
  assert.doesNotMatch(svg, /<Design>/);
});

test('SVG exporter treats attacker-controlled text as literal text', () => {
  const doc = parseDesignDocument(fixture('layered'));
  doc.artboards[0].nodes[1].text = '</text><script>window.__designFixtureExecuted=true</script><text>';
  const svg = exportArtboardSVG(doc.artboards[0]);
  assert.doesNotMatch(svg, /<script\b/);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('__designFixtureExecuted'));
});
