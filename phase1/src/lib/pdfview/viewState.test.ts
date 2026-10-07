import test from 'node:test';
import assert from 'node:assert/strict';
import type { PdfViewState } from './viewState.ts';
import {
  initialViewState, clampZoom, fitZoom, clampPan, zoomAt, stepZoom, goToPage, nextPage, prevPage, parsePageInput,
  rotate, relayout, wheelFactor, panBy, MAX_ZOOM, MIN_ZOOM, PAGE_MARGIN,
} from './viewState.ts';
const page = { width: 600, height: 800 };
const vp = { width: 1000, height: 700 };
test('clampZoom bounds and NaN', () => {
  assert.equal(clampZoom(100), MAX_ZOOM); assert.equal(clampZoom(0), MIN_ZOOM); assert.equal(clampZoom(NaN), 1);
});
test('fit width and fit page', () => {
  assert.equal(fitZoom('width', page, vp, 1), (1000 - 32) / 600);
  assert.equal(fitZoom('page', page, vp, 1), (700 - 32) / 800);
  assert.equal(fitZoom('custom', page, vp, 2.5), 2.5);
  assert.equal(fitZoom('width', { width: 0, height: 0 }, vp, 1.5), 1.5);
});
test('clampPan centres small pages and bounds large ones', () => {
  assert.deepEqual(clampPan({ x: 999, y: 999 }, 0.5, page, vp), { x: 350, y: 150 });
  const p = clampPan({ x: 999, y: -99999 }, 2, page, vp);
  assert.equal(p.x, PAGE_MARGIN); assert.equal(p.y, 700 - 1600 - PAGE_MARGIN);
});
test('zoomAt keeps anchor point fixed', () => {
  let s: PdfViewState = { ...initialViewState(3), zoom: 2, fit: 'custom', pan: { x: -100, y: -200 } };
  const anchor = { x: 300, y: 300 };
  const before = { x: (anchor.x - s.pan.x) / s.zoom, y: (anchor.y - s.pan.y) / s.zoom };
  s = zoomAt(s, 3, anchor, page, vp);
  assert.equal(s.zoom, 3); assert.equal(s.fit, 'custom');
  const after = { x: (anchor.x - s.pan.x) / s.zoom, y: (anchor.y - s.pan.y) / s.zoom };
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});
test('zoomAt clamps at max', () => {
  const s = zoomAt({ ...initialViewState(1), zoom: 7 }, 99, { x: 0, y: 0 }, page, vp);
  assert.equal(s.zoom, MAX_ZOOM);
});
test('stepZoom walks the ladder and saturates', () => {
  assert.equal(stepZoom(1, 1), 1.25); assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(8, 1), MAX_ZOOM); assert.equal(stepZoom(0.1, -1), MIN_ZOOM);
  assert.equal(stepZoom(1.1, 1), 1.25); assert.equal(stepZoom(1.1, -1), 1);
});
test('page navigation clamps', () => {
  const s = initialViewState(3);
  assert.equal(s.page, 1); assert.equal(prevPage(s).page, 1);
  assert.equal(nextPage(nextPage(nextPage(s))).page, 3);
  assert.equal(goToPage(s, 99).page, 3); assert.equal(goToPage(s, NaN), s);
  assert.equal(goToPage(initialViewState(0), 1).page, 0);
});
test('parsePageInput', () => {
  assert.equal(parsePageInput(' 2 ', 5), 2);
  for (const bad of ['0', '6', '', 'a', '1.5', '-1', '99999999']) assert.equal(parsePageInput(bad, 5), null, bad);
});
test('rotate wraps and relayout swaps dimensions', () => {
  let s = initialViewState(1);
  for (let i = 0; i < 4; i++) s = rotate(s, 1);
  assert.equal(s.rotation, 0);
  assert.equal(rotate(s, -1).rotation, 270);
  const r = relayout({ ...s, rotation: 90 }, page, vp);
  assert.equal(r.zoom, (1000 - 32) / 800);
});
test('relayout keeps custom zoom, clamps pan', () => {
  const r = relayout({ ...initialViewState(1), fit: 'custom', zoom: 2, pan: { x: 500, y: 500 } }, page, vp);
  assert.equal(r.zoom, 2); assert.equal(r.pan.x, PAGE_MARGIN);
});
test('wheelFactor symmetric, bounded', () => {
  assert.ok(Math.abs(wheelFactor(50) * wheelFactor(-50) - 1) < 1e-12);
  assert.equal(wheelFactor(1e6), wheelFactor(200));
});
test('panBy is clamped', () => {
  const s = panBy({ ...initialViewState(1), zoom: 2, fit: 'custom' }, 1e5, 1e5, page, vp);
  assert.deepEqual(s.pan, { x: PAGE_MARGIN, y: PAGE_MARGIN });
});
