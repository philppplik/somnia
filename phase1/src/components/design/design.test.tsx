import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {DesignToolbox} from './DesignToolbox';
import {DesignLayersPanel} from './DesignLayersPanel';
import {DesignInspectorPanel} from './DesignInspectorPanel';
import {CATALOGUES} from '../../lib/i18n';
import type {DesignNodeView} from '../../lib/design/panelContract';
const n = (id: string, extra: Partial<DesignNodeView> = {}): DesignNodeView =>
  ({id, name: id, type: 'rectangle', visible: true, locked: false, depth: 0, x: 1, y: 2, width: 30, height: 40, rotation: 0, opacity: 0.5, fill: '#ff0000', ...extra});
const noop = () => {};
test('toolbox exposes every tool with label, shortcut and pressed state', () => {
  const html = renderToStaticMarkup(<DesignToolbox active="rectangle" onSelectTool={noop} />);
  for (const id of ['select', 'hand', 'frame', 'rectangle', 'text']) assert.match(html, new RegExp(`data-testid="design-tool-${id}"`));
  assert.match(html, /aria-label="Rectangle \(R\)"[^>]*|aria-pressed="true"[^>]*aria-label="Rectangle \(R\)"/);
  assert.match(html, /title="Artboard \(F\): Draw a new artboard"/);
});
test('layers panel: empty state, order, selection, lock/visibility labels', () => {
  const props = {selectedIds: ['b'], onSelect: noop, onRename: noop, onToggleVisible: noop, onToggleLocked: noop, onReorder: noop, onDelete: noop, onDuplicate: noop};
  assert.match(renderToStaticMarkup(<DesignLayersPanel rows={[]} {...props} />), /data-testid="design-layers-empty"/);
  const html = renderToStaticMarkup(<DesignLayersPanel rows={[n('a', {visible: false}), n('b', {type: 'text', depth: 1}), n('c', {locked: true})]} {...props} />);
  assert.ok(html.indexOf('data-layer-id="a"') < html.indexOf('data-layer-id="b"'));
  assert.match(html, /aria-selected="true" aria-level="2"[^>]*data-layer-id="b"/);
  assert.match(html, /aria-label="Show layer: a"/);
  assert.match(html, /aria-label="Unlock layer: c"/);
});
test('inspector: empty, single rectangle, mixed multi-selection with align, text node', () => {
  const p = {onChange: noop, onAlign: noop, onDistribute: noop};
  assert.match(renderToStaticMarkup(<DesignInspectorPanel selection={[]} {...p} />), /design-inspector-empty/);
  const one = renderToStaticMarkup(<DesignInspectorPanel selection={[n('a')]} {...p} />);
  assert.match(one, /data-testid="design-field-opacity"[^>]*value="50"|value="50"[^>]*data-testid="design-field-opacity"/);
  assert.match(one, /design-field-radius/); assert.doesNotMatch(one, /design-section-align/);
  const two = renderToStaticMarkup(<DesignInspectorPanel selection={[n('a'), n('b', {x: 9})]} {...p} />);
  assert.match(two, /placeholder="Mixed"/); assert.match(two, /design-align-left/); assert.match(two, /2 layers selected/);
  assert.match(two, /data-testid="design-distribute-horizontal"[^>]*disabled|disabled=""[^>]*data-testid="design-distribute-horizontal"/);
  const t = renderToStaticMarkup(<DesignInspectorPanel selection={[n('t', {type: 'text', text: 'Hi', fontSize: 16})]} {...p} />);
  assert.match(t, /design-field-text/); assert.match(t, /design-field-fontSize/); assert.doesNotMatch(t, /design-field-radius/);
});
test('all design keys exist in every locale', () => {
  const base = Object.keys(CATALOGUES.en).filter(k => k.startsWith('design.'));
  assert.ok(base.length > 40);
  for (const [l, c] of Object.entries(CATALOGUES)) assert.deepEqual(base.filter(k => !(k in c)), [], l);
});
