import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterPanel } from './FilterPanel';
import { FILTER_TYPES, newFilterOperation } from '../../lib/imageedit/filters';

test('each filter has a labelled strength slider with normalized range and percent output', () => {
  for (const type of FILTER_TYPES) {
    const html = renderToStaticMarkup(<FilterPanel operation={newFilterOperation(type, type, { strength: 0.42 })} onChange={() => {}} />);
    assert.match(html, /type="range"/); assert.match(html, /min="0" max="1" step="0.01"/);
    assert.match(html, /aria-valuetext="42%"/); assert.match(html, /aria-label="[^"]+: Strength"/);
    assert.match(html, /<output[^>]*>42%<\/output>/);
  }
});

test('neutral reset is disabled and entire panel can be disabled', () => {
  const html = renderToStaticMarkup(<FilterPanel operation={newFilterOperation('b', 'blur', { strength: 0 })} onChange={() => {}} disabled />);
  assert.match(html, /<fieldset disabled=""/); assert.match(html, /<button type="button" disabled=""/);
});
