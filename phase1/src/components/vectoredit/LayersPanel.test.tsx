import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayersPanel } from './LayersPanel';
import { CATALOGUES } from '../../lib/i18n';
import { DEFAULT_SHAPE_STYLE, IDENTITY, appendVectorOperation, createScene, createVectorDocument, defaultGeometry, insertOp, propertiesOp, replayVector, validateNode } from '../../lib/imageedit/vector';

const c = (id: string, name: string, extra = {}) => ({ id, name, transform: IDENTITY, opacity: 1, visible: true, locked: false, ...extra });
const nodes = {
  g: validateNode({ ...c('g', 'Folder', { locked: true }), kind: 'group', children: ['k'] }),
  k: validateNode({ ...c('k', 'Inside'), ...defaultGeometry('rect'), style: DEFAULT_SHAPE_STYLE }),
  top: validateNode({ ...c('top', 'Edge'), ...defaultGeometry('line'), style: DEFAULT_SHAPE_STYLE }),
  bot: validateNode({ ...c('bot', 'Background'), ...defaultGeometry('ellipse'), style: DEFAULT_SHAPE_STYLE }),
};
let d = createVectorDocument({ id: 's', name: 's.svg' }, createScene(100, 100));
d = appendVectorOperation(d, insertOp('1', { parentId: null, index: 0, rootId: 'bot', nodes: { bot: nodes.bot } }));
d = appendVectorOperation(d, insertOp('2', { parentId: null, index: 1, rootId: 'g', nodes: { g: nodes.g, k: nodes.k } }));
d = appendVectorOperation(d, insertOp('3', { parentId: null, index: 2, rootId: 'top', nodes: { top: nodes.top } }));
d = appendVectorOperation(d, propertiesOp('4', [{ id: 'bot', visible: false }]));
const scene = replayVector(d); // roots bottom-first: bot, g(k), top

test('lists top layer first, nested rows indented, with selection, visibility and lock state', () => {
  const html = renderToStaticMarkup(<LayersPanel scene={scene} selectedId="k" />);
  const order = ['Edge', 'Folder', 'Inside', 'Background'].map((n) => html.indexOf(`>${n}</button>`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /aria-selected="true" aria-level="2"[^>]*data-layer-id="k"/);
  assert.match(html, /aria-label="Show layer: Background"/);
  assert.match(html, /aria-label="Unlock layer: Folder"/);
  assert.match(html, /aria-label="Rename layer \(double-click or F2\): Edge"/);
  assert.match(html, /aria-label="Hide layer: Edge"/);
});

test('top sibling cannot move up, bottom sibling cannot move down; panel can be disabled', () => {
  const rows = renderToStaticMarkup(<LayersPanel scene={scene} />).split('data-testid="layer-row"').slice(1); // Edge, Folder, Inside, Background
  assert.match(rows[0], /disabled=""[^>]*data-testid="layer-up"/);
  assert.match(rows[3], /disabled=""[^>]*data-testid="layer-down"/);
  assert.doesNotMatch(rows[1], /disabled=""/);
  assert.match(rows[2], /disabled=""[^>]*data-testid="layer-up"/); // only child: neither direction
  assert.match(rows[2], /disabled=""[^>]*data-testid="layer-down"/);
  assert.equal((renderToStaticMarkup(<LayersPanel scene={scene} disabled />).match(/disabled=""/g) ?? []).length, 4 * 5);
});

test('empty state', () => {
  assert.match(renderToStaticMarkup(<LayersPanel scene={createScene(10, 10)} />), /No layers yet/);
});

test('all 5 locales have every vectoredit key', () => {
  const keys = Object.keys(CATALOGUES.en).filter((k) => k.startsWith('vectoredit.'));
  assert.equal(keys.length, 16);
  for (const [loc, cat] of Object.entries(CATALOGUES)) for (const k of keys) assert.ok(cat[k] && cat[k].length > 0, `${loc} missing ${k}`);
  for (const loc of ['de', 'es', 'fr', 'pt-BR']) assert.notEqual(CATALOGUES[loc]['vectoredit.layers.title'], CATALOGUES.en['vectoredit.layers.title']);
});
