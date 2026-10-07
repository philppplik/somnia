import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransformPanel } from './TransformPanel';

const base = { width: 400, height: 300, cropRect: { x: 10, y: 10, width: 100, height: 100 }, aspect: 'free' as const, onAspectChange() {}, onCropRectChange() {}, onCommit() {} };

test('transform panel renders crop, resize, rotate and flip controls', () => {
  const html = renderToStaticMarkup(<TransformPanel {...base} />);
  for (const id of ['imgedit-aspect', 'imgedit-crop-apply', 'imgedit-filter', 'imgedit-resize-apply', 'imgedit-rotate-left', 'imgedit-rotate-right', 'imgedit-flip-h', 'imgedit-flip-v', 'imgedit-rotate-apply']) assert.ok(html.includes(id), id);
  assert.match(html, /<option value="16:9"/); assert.match(html, /value="400"/);
});
test('buttons that would change nothing are disabled, crop apply enabled for a real crop', () => {
  const html = renderToStaticMarkup(<TransformPanel {...base} cropRect={{ x: 0, y: 0, width: 400, height: 300 }} />);
  assert.ok(/<button[^>]*data-testid="imgedit-resize-apply"[^>]*>/s.exec(html)![0].includes('disabled'));
  const crop = html.match(/<button[^>]*data-testid="imgedit-crop-apply"[^>]*>/s)![0];
  assert.ok(/disabled/.test(crop));
  const on = renderToStaticMarkup(<TransformPanel {...base} />).match(/<button[^>]*data-testid="imgedit-crop-apply"[^>]*>/s)![0];
  assert.ok(!/disabled=""/.test(on));
});
test('disabled prop disables all fieldsets', () => {
  assert.equal((renderToStaticMarkup(<TransformPanel {...base} disabled />).match(/<fieldset[^>]*disabled/g) ?? []).length, 3);
});
