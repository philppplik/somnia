import test from 'node:test';
import assert from 'node:assert/strict';
import { createBitmap, crop, flip, resize, rotate, rotate90, rotatedBounds, fitAspectRect, dragCropHandle, moveCropRect, resolveResizeSize, lanczosKernel, aspectRatio, type Bitmap } from './transform';
import { TRANSFORM_HANDLERS, cropOp, flipOp, rotateOp, resizeOp, initialCropRect } from './handlers';

const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
function grid(w: number, h: number): Bitmap { const b = createBitmap(w, h); for (let i = 0; i < w * h; i++) { b.data[i * 4] = i % 256; b.data[i * 4 + 1] = Math.floor(i / 256); b.data[i * 4 + 3] = 255; } return b; }
function solid(w: number, h: number, c: [number, number, number, number]): Bitmap { const b = createBitmap(w, h); for (let i = 0; i < w * h; i++) b.data.set(c, i * 4); return b; }

test('crop copies the region and clamps to the image', () => {
  const g = grid(5, 4), c = crop(g, { x: 1, y: 1, width: 3, height: 2 });
  assert.equal(c.width, 3); assert.deepEqual(px(c, 0, 0), px(g, 1, 1)); assert.deepEqual(px(c, 2, 1), px(g, 3, 2));
  const o = crop(g, { x: -2, y: -2, width: 4, height: 4 }); assert.equal(o.width, 2);
  assert.throws(() => crop(g, { x: 9, y: 9, width: 2, height: 2 }), RangeError);
});
test('crop does not change the input', () => { const g = grid(4, 4), before = new Uint8ClampedArray(g.data); crop(g, { x: 0, y: 0, width: 2, height: 2 }); assert.deepEqual(g.data, before); });

test('aspect presets and fitted rect', () => {
  assert.equal(aspectRatio('16:9', 1, 1), 16 / 9); assert.equal(aspectRatio('free', 1, 1), null); assert.equal(aspectRatio('original', 200, 100), 2);
  assert.deepEqual(fitAspectRect(200, 100, 1), { x: 50, y: 0, width: 100, height: 100 });
  assert.deepEqual(fitAspectRect(100, 200, 2), { x: 0, y: 75, width: 100, height: 50 });
  assert.deepEqual(initialCropRect(300, 300, 'free'), { x: 0, y: 0, width: 300, height: 300 });
});
test('free handle drag stays in bounds and above min size', () => {
  const b = { width: 100, height: 100 }, r = { x: 10, y: 10, width: 50, height: 50 };
  assert.deepEqual(dragCropHandle(r, 'se', 100, 100, b, null), { x: 10, y: 10, width: 90, height: 90 });
  assert.deepEqual(dragCropHandle(r, 'nw', -50, -50, b, null), { x: 0, y: 0, width: 60, height: 60 });
  const tiny = dragCropHandle(r, 'e', -500, 0, b, null, 4); assert.equal(tiny.width, 4);
});
test('ratio handle drag keeps ratio and anchor', () => {
  const b = { width: 200, height: 200 }, r = { x: 20, y: 20, width: 40, height: 40 };
  const s = dragCropHandle(r, 'se', 40, 10, b, 1); assert.equal(s.x, 20); assert.equal(s.y, 20); assert.equal(s.width, s.height); assert.equal(s.width, 80);
  const w = dragCropHandle(r, 'e', 20, 0, b, 2); assert.equal(w.width, 60); assert.equal(w.height, 30); assert.equal(w.x, 20);
  const big = dragCropHandle(r, 'se', 1000, 1000, b, 2); assert.ok(big.x + big.width <= 200 && big.y + big.height <= 200); assert.ok(Math.abs(big.width / big.height - 2) < 0.05);
  assert.deepEqual(moveCropRect(r, -100, 500, b), { x: 0, y: 160, width: 40, height: 40 });
});

test('lanczos kernel basics', () => { assert.equal(lanczosKernel(0, 3), 1); assert.ok(Math.abs(lanczosKernel(1, 3)) < 1e-12); assert.equal(lanczosKernel(3, 3), 0); });
test('resize keeps flat colour exactly (weights sum to 1), up and down, all filters', () => {
  for (const f of ['lanczos3', 'lanczos2', 'bilinear', 'nearest'] as const) for (const [w, h] of [[3, 3], [17, 11], [50, 40]]) {
    const r = resize(solid(10, 8, [200, 100, 50, 255]), w, h, f); assert.equal(r.width, w);
    for (let i = 0; i < w * h; i++) assert.deepEqual(Array.from(r.data.subarray(i * 4, i * 4 + 4)), [200, 100, 50, 255], `${f} ${w}x${h}`);
  }
});
test('resize down averages a checkerboard to grey (no aliasing)', () => {
  const b = createBitmap(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = (x + y) % 2 ? 255 : 0; b.data.set([v, v, v, 255], (y * 64 + x) * 4); }
  const r = resize(b, 8, 8, 'lanczos3'); for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) assert.ok(Math.abs(px(r, x, y)[0] - 127.5) <= 3, String(px(r, x, y)[0]));
});
test('resize is sharper than bilinear on an edge, and identity size copies', () => {
  const b = createBitmap(8, 1); for (let x = 0; x < 8; x++) b.data.set(x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255], x * 4);
  const l = resize(b, 16, 1, 'lanczos3'), n = resize(b, 16, 1, 'nearest');
  assert.deepEqual(px(n, 7, 0).slice(0, 1), [0]); assert.ok(px(l, 0, 0)[0] <= 2 && px(l, 15, 0)[0] >= 253);
  const same = resize(b, 8, 1); assert.deepEqual(same.data, b.data); assert.notEqual(same.data, b.data);
});
test('resize does not bleed colour from transparent pixels', () => {
  const b = createBitmap(4, 1); b.data.set([255, 0, 0, 255], 0); b.data.set([0, 255, 0, 0], 4); b.data.set([0, 255, 0, 0], 8); b.data.set([0, 255, 0, 0], 12);
  const r = resize(b, 8, 1, 'lanczos3'); for (let x = 0; x < 8; x++) { const p = px(r, x, 0); if (p[3] > 0) assert.ok(p[1] < 8, `green leaked at ${x}: ${p}`); }
});
test('resolveResizeSize keeps ratio, percent, free', () => {
  assert.deepEqual(resolveResizeSize(200, 100, { width: 100 }), { width: 100, height: 50 });
  assert.deepEqual(resolveResizeSize(200, 100, { height: 10 }), { width: 20, height: 10 });
  assert.deepEqual(resolveResizeSize(200, 100, { width: 100, height: 100 }), { width: 100, height: 50 });
  assert.deepEqual(resolveResizeSize(200, 100, { width: 100, height: 100, keepAspect: false }), { width: 100, height: 100 });
  assert.deepEqual(resolveResizeSize(200, 100, { percent: 50 }), { width: 100, height: 50 });
  assert.throws(() => resize(solid(2, 2, [0, 0, 0, 255]), 0, 5), RangeError);
});

test('flip horizontal/vertical and double flip is identity', () => {
  const g = grid(3, 2), h = flip(g, 'horizontal'), v = flip(g, 'vertical');
  assert.deepEqual(px(h, 0, 0), px(g, 2, 0)); assert.deepEqual(px(v, 1, 0), px(g, 1, 1));
  assert.deepEqual(flip(h, 'horizontal').data, g.data); assert.deepEqual(flip(v, 'vertical').data, g.data);
});
test('rotate90: 90 cw, 180, 270, four turns identity', () => {
  const g = grid(3, 2), r = rotate90(g, 1);
  assert.equal(r.width, 2); assert.equal(r.height, 3);
  assert.deepEqual(px(r, 1, 0), px(g, 0, 0)); assert.deepEqual(px(r, 0, 0), px(g, 0, 1)); assert.deepEqual(px(r, 1, 2), px(g, 2, 0));
  assert.deepEqual(px(rotate90(g, 2), 0, 0), px(g, 2, 1));
  assert.deepEqual(px(rotate90(g, 3), 0, 2), px(g, 0, 0)); assert.deepEqual(px(rotate90(g, 3), 0, 0), px(g, 2, 0));
  let x = g; for (let i = 0; i < 4; i++) x = rotate90(x, 1); assert.deepEqual(x.data, g.data);
  assert.deepEqual(rotate(g, -90).data, rotate90(g, 3).data); assert.deepEqual(rotate(g, 450).data, r.data);
});
test('free rotate: bounds, centre pixel, corners transparent, size kept without expand', () => {
  assert.deepEqual(rotatedBounds(100, 50, 90), { width: 50, height: 100 }); assert.deepEqual(rotatedBounds(100, 50, 0), { width: 100, height: 50 });
  const b = rotatedBounds(100, 100, 45); assert.equal(b.width, 142);
  const s = solid(40, 40, [10, 200, 30, 255]), r = rotate(s, 45);
  assert.equal(r.width, 57); assert.deepEqual(px(r, 28, 28), [10, 200, 30, 255]); assert.equal(px(r, 0, 0)[3], 0); assert.equal(px(r, 56, 0)[3], 0);
  const k = rotate(s, 30, { expand: false, background: [255, 255, 255, 255] }); assert.equal(k.width, 40); assert.deepEqual(px(k, 0, 0), [255, 255, 255, 255]); assert.deepEqual(px(k, 20, 20), [10, 200, 30, 255]);
});
test('free rotate keeps a 180-ish image mirrored correctly (179.99 vs 180)', () => {
  const g = grid(6, 6), a = rotate(g, 180), b = rotate(g, 179.99, { expand: false });
  let diff = 0; for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) diff += Math.abs(px(a, x, y)[0] - px(b, x, y)[0]); assert.ok(diff / 16 < 3, String(diff / 16));
});

test('handlers: registry shape, no input mutation, outputSize matches apply', () => {
  const g = grid(20, 10), before = new Uint8ClampedArray(g.data);
  assert.deepEqual(TRANSFORM_HANDLERS.map((h) => h.type), ['crop', 'resize', 'rotate', 'flip']);
  const by = Object.fromEntries(TRANSFORM_HANDLERS.map((h) => [h.type, h]));
  for (const op of [cropOp({ x: 2, y: 1, width: 8, height: 6 }), resizeOp(33, 7), rotateOp(90), rotateOp(33), rotateOp(33, false), flipOp('vertical')]) {
    const h = by[op.type], out = h.apply(g, op.params, {}), sz = h.outputSize(g.width, g.height, op.params);
    assert.deepEqual([out.width, out.height], [sz.width, sz.height], op.type); assert.equal(op.version, 1); assert.equal(op.enabled, true);
  }
  assert.deepEqual(g.data, before);
});
test('handlers reject bad params and honour abort', () => {
  const g = grid(4, 4), by = Object.fromEntries(TRANSFORM_HANDLERS.map((h) => [h.type, h]));
  assert.throws(() => by.crop.apply(g, { x: 'a' as never, y: 0, width: 1, height: 1 }, {}), TypeError);
  assert.throws(() => by.flip.apply(g, { axis: 'diag' }, {}), TypeError);
  assert.throws(() => by.resize.apply(g, { width: 2, height: 2, filter: 'x' }, {}), TypeError);
  const ac = new AbortController(); ac.abort(); assert.throws(() => by.rotate.apply(g, { degrees: 10 }, { signal: ac.signal }));
});
test('performance: 2000x1500 -> 1000x750 lanczos3 under 5s', () => {
  const t = Date.now(); resize(solid(2000, 1500, [1, 2, 3, 255]), 1000, 750); assert.ok(Date.now() - t < 5000);
});

test('transform handlers register in the image-editor core and render through its stack', async () => {
  const core = await import('../image-editor/index');
  const reg = core.createOperationRegistry();
  for (const h of TRANSFORM_HANDLERS) reg.register(h);
  const src = { width: 4, height: 2, data: new Uint8ClampedArray(4 * 2 * 4).fill(200) };
  const doc = { schemaVersion: 1 as const, source: { width: 4, height: 2, format: 'png', name: 't.png' }, operations: [flipOp('horizontal'), rotateOp(90), resizeOp(4, 4)], revision: 0 };
  const out = await core.renderStack(src, doc as never, reg, {});
  assert.equal(out.width, 4); assert.equal(out.height, 4);
});
