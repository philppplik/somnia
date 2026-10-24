import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elementOverlayBox} from './overlayGeometry';
test('overlay box maps getBoundingClientRect to x/y/w/h without rounding', () => {
  const el = {getBoundingClientRect: () => ({x: 10.25, y: 3.5, width: 100.75, height: 20.125})} as unknown as Element;
  assert.deepEqual(elementOverlayBox(el), {x: 10.25, y: 3.5, w: 100.75, h: 20.125});
});
