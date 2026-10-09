import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DEFAULT_STYLE, exportSvg, importSvg, LIMITS, SvgImportError, type VectorDocument} from './index';

const fixtureRoot = new URL('../../../tests/assets/vector-studio/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('manifest.json', fixtureRoot), 'utf8')) as
  Array<{file:string; outcome:'accept'|'reject'; paths?:number; diagnostic?:string}>;
const source = (file:string) => readFileSync(new URL(file, fixtureRoot), 'utf8');
// Source IDs are regenerated at import. The comparison retains geometry, style,
// visibility, paint order and compound relationships, not incidental local IDs.
function semantic(doc:VectorDocument) {
  const compounds = new Map<string, number>();
  const round = (n:number) => Math.round(n * 1000) / 1000;
  return {
    width:round(doc.width), height:round(doc.height),
    paths:doc.paths.map(p => ({
      closed:p.closed, layer:p.layer, name:p.name, hidden:!!p.hidden,
      compound:p.compound === undefined ? null : (compounds.has(p.compound)
        ? compounds.get(p.compound) : (compounds.set(p.compound, compounds.size), compounds.get(p.compound))),
      style:{...DEFAULT_STYLE,...p.style},
      nodes:p.nodes.map(n => ({x:round(n.x),y:round(n.y),
        in:n.in && {x:round(n.in.x),y:round(n.in.y)},
        out:n.out && {x:round(n.out.x),y:round(n.out.y)}})),
    })),
  };
}
for (const fixture of cases) {
  test(`Vector Studio fixture: ${fixture.file}`, () => {
    const text = source(fixture.file);
    if (fixture.outcome === 'reject') {
      assert.throws(() => importSvg(text), error => {
        assert.ok(error instanceof SvgImportError);
        assert.ok(error.diagnostics.some(d => d.severity === 'error' && d.message.includes(fixture.diagnostic!)),
          `expected diagnostic ${fixture.diagnostic}`);
        return true;
      });
    } else {
      const imported = importSvg(text);
      assert.equal(imported.doc.paths.length, fixture.paths);
      assert.equal(imported.warnings.length, 0);
      const before = structuredClone(imported.doc);
      const output = exportSvg(imported.doc);
      assert.deepEqual(imported.doc, before, 'export must not mutate its input');
      assert.deepEqual(semantic(importSvg(output).doc), semantic(before));
      assert.doesNotMatch(output, /<script|<foreignObject|\bonload=|href=/i);
      assert.equal(source(fixture.file), text, 'source fixture remains unchanged');
    }
  });
}
test('SVG corpus offset viewBox bakes to document pixels without drifting', () => {
  const doc = importSvg(source('offset-viewbox.svg')).doc;
  assert.equal(doc.width, 200); assert.equal(doc.height, 120);
  assert.deepEqual(doc.paths[0].nodes.map(n => [n.x,n.y]), [[20,10],[80,10],[80,50],[20,50]]);
});
test('SVG corpus strict diagnostics do not permit partial import', () => {
  const text = source('reject-event.svg');
  assert.throws(() => importSvg(text), SvgImportError);
  const partial = importSvg(text,{strict:false});
  assert.equal(partial.doc.paths.length,1);
  assert.ok(partial.warnings.some(d => d.severity === 'warning' && d.message.includes('event attribute')));
  assert.doesNotMatch(exportSvg(partial.doc), /onload|vectorFixtureExecuted/);
});
test('SVG importer rejects byte, depth and node budgets', () => {
  assert.throws(() => importSvg(' '.repeat(LIMITS.maxBytes + 1)), SvgImportError);
  const wrap = (body:string) => `<svg viewBox="0 0 100 100">${body}</svg>`;
  assert.throws(() => importSvg(wrap('<g>'.repeat(LIMITS.maxDepth + 1) + '<path d="M0 0L10 10"/>' + '</g>'.repeat(LIMITS.maxDepth + 1))), SvgImportError);
  assert.throws(() => importSvg(wrap('<line x2="10" y2="10"/>'.repeat(Math.floor(LIMITS.maxNodes / 2) + 1))), SvgImportError);
});
test('fixture manifest is unique and contains supported and adversarial cases', () => {
  assert.equal(new Set(cases.map(c => c.file)).size, cases.length);
  assert.ok(cases.filter(c => c.outcome === 'accept').length >= 7);
  assert.ok(cases.filter(c => c.outcome === 'reject').length >= 10);
  for (const c of cases) assert.ok(fileURLToPath(new URL(c.file, fixtureRoot)).endsWith('.svg'));
});
