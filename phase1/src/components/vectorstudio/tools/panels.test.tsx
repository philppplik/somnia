import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { VectorToolsPanel } from './VectorToolsPanel';
import { VectorNodePanel } from './VectorNodePanel';
import { importSvg } from '../../../lib/vectorio';
const doc = importSvg('<svg width="100" height="100"><rect x="10" y="20" width="30" height="40"/></svg>').doc;
const noop = () => {};
test('transform panel exposes accessible tools, SVG actions and dimensions', () => {
  const html = renderToStaticMarkup(<VectorToolsPanel value={doc} selection={[doc.paths[0].id]} onSelectionChange={noop} onCommit={noop} onToolChange={noop}/>);
  for (const id of ['vector-tools-panel', 'vector-tool-select', 'vector-tool-node', 'vector-transform-panel', 'vector-transform-x', 'vector-transform-y', 'vector-transform-width', 'vector-transform-height', 'vector-transform-rotation', 'vector-import-svg', 'vector-export-svg']) assert.ok(html.includes(`data-testid="${id}"`));
  assert.match(html, /aria-pressed="true"/); assert.match(html, /aria-label="Selection width"/); assert.match(html, /value="30"/);
});
test('empty and disabled states prevent transforming', () => {
  const empty = renderToStaticMarkup(<VectorToolsPanel value={doc} selection={[]} onSelectionChange={noop} onCommit={noop}/>);
  assert.match(empty, /fieldset disabled=""/); assert.match(empty, /Select an object/);
  const disabled = renderToStaticMarkup(<VectorToolsPanel value={doc} selection={[doc.paths[0].id]} onSelectionChange={noop} onCommit={noop} disabled/>);
  assert.match(disabled, /data-testid="vector-import-svg"[^>]*disabled=""/);
});
test('node panel exposes editable position and node type', () => {
  const html = renderToStaticMarkup(<VectorNodePanel value={doc} nodeSelection={[{ pathId: doc.paths[0].id, nodeId: doc.paths[0].nodes[0].id }]} onNodeSelectionChange={noop} onCommit={noop}/>);
  for (const id of ['vector-node-panel', 'vector-node-x', 'vector-node-y', 'vector-node-corner', 'vector-node-smooth', 'vector-node-symmetric', 'vector-node-straighten', 'vector-node-delete']) assert.ok(html.includes(`data-testid="${id}"`));
  assert.match(html, /aria-label="Node x"/); assert.match(html, /value="10"/);
});
