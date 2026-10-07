import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdjustPanel } from './AdjustPanel';
import { DEFAULT_ADJUST_PARAMS } from '../../lib/imageedit/adjust';

test('AdjustPanel renders 7 sliders, curve with anchors, reset disabled when neutral', () => {
  const html = renderToStaticMarkup(<AdjustPanel params={{ ...DEFAULT_ADJUST_PARAMS }} onChange={() => {}} />);
  for (const k of ['brightness', 'contrast', 'saturation', 'hue', 'temperature', 'highlights', 'shadows']) assert.ok(html.includes(`data-testid="adjust-${k}"`), k);
  assert.equal((html.match(/role="slider"/g) ?? []).length, 2);
  assert.match(html, /data-testid="adjust-reset"[^>]*disabled|disabled=""[^>]*data-testid="adjust-reset"/);
  assert.ok(html.includes('aria-label="Brightness"'));
});
