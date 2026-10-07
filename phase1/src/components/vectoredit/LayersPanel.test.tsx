import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayersPanel } from './LayersPanel';
import { CATALOGUES } from '../../lib/i18n';
import { addLayerOp, appendVectorOperation, createVectorDocument, defaultShape, resolveLayers, setLockedOp, setVisibleOp } from '../../lib/vectoredit';

const doc = [
  addLayerOp('1', { id: 'bottom', name: 'Background', shape: defaultShape('rect') as any }),
  addLayerOp('2', { id: 'mid', name: 'Circle', shape: defaultShape('ellipse') as any }),
  addLayerOp('3', { id: 'top', name: 'Edge', shape: defaultShape('line') as any }),
  setVisibleOp('4', 'mid', false), setLockedOp('5', 'top', true),
].reduce(appendVectorOperation, createVectorDocument(100, 100));
const layers = resolveLayers(doc);

test('lists top layer first with selection, visibility and lock state', () => {
  const html = renderToStaticMarkup(<LayersPanel layers={layers} selectedId="mid" />);
  assert.ok(html.indexOf('Edge') < html.indexOf('Circle') && html.indexOf('Circle') < html.indexOf('Background'));
  assert.match(html, /aria-selected="true"[^>]*data-layer-id="mid"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 3); // 2 visible + 1 locked
  assert.match(html, /aria-label="Show layer: Circle"/);
  assert.match(html, /aria-label="Unlock layer: Edge"/);
  assert.match(html, /aria-label="Rename layer \(double-click or F2\): Background"/);
});

test('top layer cannot move up, bottom cannot move down; panel can be disabled', () => {
  const html = renderToStaticMarkup(<LayersPanel layers={layers} />);
  const rows = html.split('data-testid="layer-row"').slice(1);
  assert.match(rows[0], /disabled=""[^>]*data-testid="layer-up"/);
  assert.match(rows[2], /disabled=""[^>]*data-testid="layer-down"/);
  assert.doesNotMatch(rows[1], /disabled=""/);
  assert.equal((renderToStaticMarkup(<LayersPanel layers={layers} disabled />).match(/disabled=""/g) ?? []).length, 3 * 5);
});

test('empty state', () => {
  assert.match(renderToStaticMarkup(<LayersPanel layers={[]} />), /No layers yet/);
});

test('all 5 locales have every vectoredit key', () => {
  const keys = Object.keys(CATALOGUES.en).filter((k) => k.startsWith('vectoredit.'));
  assert.equal(keys.length, 15);
  for (const [loc, cat] of Object.entries(CATALOGUES)) for (const k of keys) assert.ok(cat[k] && cat[k].length > 0, `${loc} missing ${k}`);
  for (const loc of ['de', 'es', 'fr', 'pt-BR']) assert.notEqual(CATALOGUES[loc]['vectoredit.layers.title'], CATALOGUES.en['vectoredit.layers.title']);
});
