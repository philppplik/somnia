import test from 'node:test';
import assert from 'node:assert/strict';
import { createImage, type RasterImage } from '../../image/buffer';
import { gaussianBlur, gaussianKernel, unsharpMask } from '../../image/convolve';
import { grayscale, sepia, invert, saturation } from '../../image/adjust';
import { vignette } from '../../image/filters';
import { OperationRegistry, renderStack } from '../../image-editor/pipeline';
import { createImageDocument, withOperations } from '../../image-editor/document';
import { FILTER_TYPES, FILTER_HANDLERS, newFilterOperation, patchFilterOperation, registerFilterOps } from './index';

const fixture = (): RasterImage => ({ width: 3, height: 1, data: new Uint8ClampedArray([210, 30, 60, 255, 80, 140, 220, 128, 30, 10, 70, 0]) });
const run = (type: typeof FILTER_TYPES[number], strength = 1, image = fixture()) => FILTER_HANDLERS.find(h => h.type === type)!.apply(image, { strength }, {});

test('all six core handlers expose type/version; strength zero clones with exact identity', async () => {
  for (const type of FILTER_TYPES) {
    const input = fixture(), snapshot = new Uint8ClampedArray(input.data);
    const op = newFilterOperation(`test-${type}`, type, { strength: 0 });
    assert.equal(op.type, type); assert.equal(op.version, 1); assert.ok(op.enabled);
    assert.deepEqual(JSON.parse(JSON.stringify(op)), op);
    const result = await run(type, 0, input);
    assert.deepEqual(result.data, snapshot); assert.notEqual(result.data, input.data);
    result.data[0] = 0; assert.deepEqual(input.data, snapshot);
  }
});

test('handlers reuse canonical CPU kernels and never mutate source', async () => {
  const input = fixture(), snapshot = new Uint8ClampedArray(input.data);
  for (const [type, expected] of [
    ['blur', gaussianBlur(input, 10)], ['sharpen', unsharpMask(input, 1, 2)],
    ['grayscale', grayscale(input)], ['sepia', sepia(input)], ['invert', invert(input)],
    ['vignette', vignette(input)],
  ] as const) {
    assert.deepEqual((await run(type)).data, expected.data);
    assert.deepEqual(input.data, snapshot);
  }
  assert.deepEqual((await run('grayscale', 0.5)).data, saturation(input, -0.5).data);
  assert.deepEqual((await run('sepia', 0.5)).data, sepia(input, 0.5).data);
  assert.deepEqual((await run('invert', 0.5)).data.filter((_, i) => i % 4 !== 3), new Uint8ClampedArray(9).fill(128));
});

test('color effects and sharpening preserve original alpha at all strengths', async () => {
  for (const type of FILTER_TYPES.filter(t => t !== 'blur')) for (const strength of [0, 0.25, 0.5, 1]) {
    const img = fixture(); const result = await run(type, strength, img);
    assert.deepEqual(result.data.filter((_, i) => i % 4 === 3), img.data.filter((_, i) => i % 4 === 3));
  }
});

test('Gaussian is separable, symmetric, normalized and alpha-safe at transparent edges', () => {
  const kernel = gaussianKernel(2);
  assert.ok(Math.abs(kernel.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  const image = createImage(9, 9, [0, 255, 0, 0]); image.data.set([255, 0, 0, 255], (4 * 9 + 4) * 4);
  const result = gaussianBlur(image, 1);
  for (let i = 0; i < result.data.length; i += 4) if (result.data[i + 3]) {
    assert.equal(result.data[i], 255); assert.equal(result.data[i + 1], 0); assert.equal(result.data[i + 2], 0);
  }
  const alpha = (x: number, y: number) => result.data[(y * 9 + x) * 4 + 3];
  assert.equal(alpha(3, 4), alpha(5, 4)); assert.equal(alpha(4, 3), alpha(4, 5));
  assert.ok(alpha(4, 4) > alpha(3, 4));
  const transparent = createImage(3, 3, [255, 200, 100, 0]);
  assert.deepEqual(gaussianBlur(transparent, 1).data, new Uint8ClampedArray(36));
});

test('blur strength controls sigma; sharpen strength controls amount and threshold', async () => {
  const registry = new OperationRegistry(); registerFilterOps(registry);
  const img = createImage(5, 1, [60, 60, 60, 255]); img.data.set([180, 180, 180, 255], 8);
  const blur = newFilterOperation('b', 'blur', { strength: 0.5, sigma: 2 });
  assert.deepEqual((await registry.get(blur).apply(img, blur.params, {})).data, gaussianBlur(img, 1).data);
  const sharp = newFilterOperation('s', 'sharpen', { strength: 1, sigma: 1, threshold: 255 });
  assert.deepEqual((await registry.get(sharp).apply(img, sharp.params, {})).data, img.data);
  const edge = await run('sharpen', 1, img); assert.ok(edge.data[8] > img.data[8]);
});

test('vignette is symmetric, center-preserving, strength-continuous including skinny images', () => {
  const img = createImage(5, 5, [200, 100, 50, 77]);
  const full = vignette(img), half = vignette(img, 0.5);
  assert.deepEqual([...full.data.slice(48, 52)], [200, 100, 50, 77]);
  assert.deepEqual([...full.data.slice(0, 4)], [0, 0, 0, 77]);
  assert.deepEqual([...half.data.slice(0, 4)], [100, 50, 25, 77]);
  assert.deepEqual([...full.data.slice(0, 4)], [...full.data.slice(-4)]);
  for (const [w, h] of [[1, 1], [1, 5], [5, 1]]) {
    const raster = createImage(w, h, [200, 100, 50, 77]), result = vignette(raster);
    const mid = Math.floor(w * h / 2) * 4;
    assert.deepEqual(result.data.slice(mid, mid + 4), raster.data.slice(mid, mid + 4));
  }
});

test('validation rejects malformed strengths, sigma, threshold and raster before pixel work', async () => {
  for (const type of FILTER_TYPES) for (const strength of [-1, 1.01, NaN, Infinity, '0.5', null]) {
    assert.throws(() => FILTER_HANDLERS.find(h => h.type === type)!.apply(fixture(), { strength }, {}));
  }
  for (const sigma of [-1, 101, Infinity, NaN]) {
    assert.throws(() => newFilterOperation('b', 'blur', { sigma }));
    assert.throws(() => gaussianBlur(fixture(), sigma));
  }
  assert.throws(() => gaussianKernel(Infinity));
  assert.throws(() => newFilterOperation('s', 'sharpen', { threshold: 256 }));
  assert.throws(() => FILTER_HANDLERS[0].apply({ width: 2, height: 1, data: new Uint8ClampedArray(4) }, {}, {}));
  assert.throws(() => patchFilterOperation({ ...newFilterOperation('b', 'blur'), version: 2 }, { strength: 0.5 }));
});

test('cancellation before work and between Gaussian scanlines throws AbortError', () => {
  const controller = new AbortController(); controller.abort();
  for (const handler of FILTER_HANDLERS) assert.throws(() => handler.apply(fixture(), {}, { signal: controller.signal }), { name: 'AbortError' });
  let checks = 0;
  const signal = { throwIfAborted() { if (++checks === 3) throw new DOMException('Aborted', 'AbortError'); } } as AbortSignal;
  assert.throws(() => gaussianBlur(createImage(5, 5, [100, 100, 100, 255]), 1, signal), { name: 'AbortError' });
});

test('registry cleanup, duplicate rollback, ordered core replay and disabled filters', async () => {
  const registry = new OperationRegistry(); const cleanup = registerFilterOps(registry);
  const img = fixture(); const source = { id: 'src', name: 'test.png', mime: 'image/png', width: img.width, height: img.height };
  const ops = [newFilterOperation('gray', 'grayscale'), { ...newFilterOperation('sepia', 'sepia'), enabled: false }, newFilterOperation('invert', 'invert')];
  const doc = withOperations(createImageDocument(source), ops);
  assert.deepEqual((await renderStack(img, doc, registry)).data, invert(grayscale(img)).data);
  cleanup(); cleanup(); assert.throws(() => registry.get(ops[0]), /Unsupported/);
  const conflicting = new OperationRegistry(); conflicting.register(FILTER_HANDLERS[2]);
  assert.throws(() => registerFilterOps(conflicting), /already registered/);
  assert.throws(() => conflicting.get(newFilterOperation('b', 'blur')), /Unsupported/);
  assert.equal(conflicting.get(ops[0]), FILTER_HANDLERS[2]);
});

test('patch updates strength atomically preserving id, disabled state and effect options', () => {
  const op = { ...newFilterOperation('blur-a', 'blur', { sigma: 4 }), enabled: false };
  const next = patchFilterOperation(op, { strength: 0.25 });
  assert.deepEqual(next, { ...op, params: { strength: 0.25, sigma: 4 } });
  assert.equal(op.params.strength, 1); assert.notEqual(next.params, op.params);
});
