import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADJUST_PARAMS, adjustHandler, adjustToJson, applyAdjust, buildCurveLut, buildFragmentShader,
  createAdjustRenderer, createLivePreview, isNeutralAdjust, newAdjustOperation, normalizeAdjustParams,
  normalizeCurve, patchAdjustOperation, registerAdjustOp, evalCurve, addPoint, movePoint, removePoint,
  adjustParamsEqual, type AdjustParams, type PixelBuffer,
} from './index';

const px = (...rgba: number[]): PixelBuffer => ({ width: rgba.length / 4, height: 1, data: new Uint8ClampedArray(rgba) });
const adj = (p: Partial<AdjustParams>, ...rgba: number[]) => Array.from(applyAdjust(px(...rgba), p).data);

test('neutral params are a byte-exact no-op and never mutate input', () => {
  const img = px(10, 200, 99, 255, 0, 0, 0, 7);
  const before = Array.from(img.data);
  const out = applyAdjust(img, DEFAULT_ADJUST_PARAMS);
  assert.deepEqual(Array.from(out.data), before);
  assert.notEqual(out.data, img.data);
  applyAdjust(img, { brightness: 0.5, hue: 90 });
  assert.deepEqual(Array.from(img.data), before);
  assert.ok(isNeutralAdjust({}));
  assert.ok(isNeutralAdjust({ curves: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
  assert.ok(!isNeutralAdjust({ curves: [{ x: 0, y: 0.1 }, { x: 1, y: 1 }] }));
});

test('normalize clamps, rejects NaN, merges patches', () => {
  const n = normalizeAdjustParams({ brightness: 5, hue: -999, contrast: NaN as number, saturation: '0.5' as unknown as number });
  assert.equal(n.brightness, 1);
  assert.equal(n.hue, -180);
  assert.equal(n.contrast, 0);
  assert.equal(n.saturation, 0.5);
  const m = normalizeAdjustParams({ shadows: 0.2 }, n);
  assert.equal(m.brightness, 1);
  assert.equal(m.shadows, 0.2);
  assert.ok(adjustParamsEqual(n, { ...n }));
});

test('brightness, alpha passthrough, clamping', () => {
  assert.deepEqual(adj({ brightness: 1 }, 100, 100, 100, 77), [227, 227, 227, 77]);
  assert.deepEqual(adj({ brightness: -1 }, 100, 100, 100, 5), [0, 0, 0, 5]);
  assert.deepEqual(adj({ brightness: 1 }, 255, 255, 255, 255), [255, 255, 255, 255]);
});

test('contrast pivots on mid grey; -1 flattens to grey', () => {
  const mid = adj({ contrast: 1 }, 128, 128, 128, 255);
  assert.ok(Math.abs(mid[0] - 128) <= 1);
  const hi = adj({ contrast: 0.5 }, 200, 200, 200, 255)[0];
  assert.ok(hi > 200);
  const lo = adj({ contrast: 0.5 }, 60, 60, 60, 255)[0];
  assert.ok(lo < 60);
  const flat = adj({ contrast: -1 }, 0, 255, 90, 255);
  assert.deepEqual(flat.slice(0, 3), [128, 128, 128]);
});

test('saturation -1 gives luma grey, +1 increases chroma', () => {
  const g = adj({ saturation: -1 }, 255, 0, 0, 255);
  assert.equal(g[0], g[1]); assert.equal(g[1], g[2]);
  assert.equal(g[0], Math.round(0.2126 * 255));
  const s = adj({ saturation: 0.5 }, 200, 100, 100, 255);
  assert.ok(s[0] - s[1] > 100);
});

test('hue: 0 is identity, 180 keeps grey, 120 rotates red toward green-ish', () => {
  assert.deepEqual(adj({ hue: 0 }, 10, 20, 30, 255), [10, 20, 30, 255]);
  const g = adj({ hue: 180 }, 128, 128, 128, 255);
  assert.ok(g.slice(0, 3).every((v) => Math.abs(v - 128) <= 1));
  const r = adj({ hue: 120 }, 255, 0, 0, 255);
  assert.ok(r[1] > r[0] && r[1] > r[2]);
  const full = adj({ hue: 360 as number }, 255, 0, 0, 255); // clamped to 180
  assert.ok(full[0] < 255);
});

test('temperature: warm lifts red, drops blue', () => {
  const w = adj({ temperature: 0.5 }, 100, 100, 100, 255);
  assert.ok(w[0] > 100 && w[2] < 100 && w[1] === 100);
  const c = adj({ temperature: -0.5 }, 100, 100, 100, 255);
  assert.ok(c[0] < 100 && c[2] > 100);
});

test('shadows lift darks more than lights; highlights the reverse', () => {
  const d = adj({ shadows: 1 }, 30, 30, 30, 255, 230, 230, 230, 255);
  assert.ok(d[0] - 30 > d[4] - 230);
  const h = adj({ highlights: -1 }, 30, 30, 30, 255, 230, 230, 230, 255);
  assert.ok(230 - h[4] > 30 - h[0]);
});

test('curves: endpoint anchors, piecewise-linear, LUT', () => {
  assert.deepEqual(normalizeCurve([{ x: 0.5, y: 0.8 }]), [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }]);
  assert.deepEqual(normalizeCurve(undefined), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(normalizeCurve([{ x: 1, y: 0.5 }, { x: 0, y: 0.2 }, { x: 0.5, y: NaN }]), [{ x: 0, y: 0.2 }, { x: 1, y: 0.5 }]);
  assert.equal(evalCurve([{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }], 0.25), 0.5);
  const lut = buildCurveLut([{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }]);
  assert.equal(lut[0], 0); assert.equal(lut[255], 255);
  assert.equal(lut[128], 255);
  assert.ok(Math.abs(lut[64] - 128) <= 1);
  const id = buildCurveLut(undefined);
  for (let i = 0; i < 256; i++) assert.equal(id[i], i);
  // inverted curve
  assert.deepEqual(adj({ curves: [{ x: 0, y: 1 }, { x: 1, y: 0 }] }, 0, 255, 51, 255), [255, 0, 204, 255]);
});

test('curve editing helpers keep anchors and order', () => {
  const base = normalizeCurve(undefined);
  const a = addPoint(base, 0.4, 0.6);
  assert.equal(a.points.length, 3); assert.equal(a.index, 1);
  assert.equal(addPoint(a.points, 0.405, 0.1).points.length, 3);
  const m = movePoint(a.points, 0, 0.5, 0.3);
  assert.deepEqual(m[0], { x: 0, y: 0.3 });
  const m2 = movePoint(a.points, 1, 5, 2);
  assert.ok(m2[1].x < 1 && m2[1].y === 1);
  assert.equal(removePoint(a.points, 0).length, 3);
  assert.equal(removePoint(a.points, 1).length, 2);
});

test('combined params stay in range and are deterministic', () => {
  const all: Partial<AdjustParams> = { brightness: 0.3, contrast: 0.4, saturation: 0.6, hue: 45, temperature: 0.2, highlights: -0.5, shadows: 0.5, curves: [{ x: 0, y: 0.05 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.95 }] };
  const data: number[] = [];
  for (let i = 0; i < 64; i++) data.push((i * 37) & 255, (i * 91) & 255, (i * 53) & 255, 255);
  const a = adj(all, ...data);
  const b = adj(all, ...data);
  assert.deepEqual(a, b);
  assert.equal(a.length, data.length);
});

test('handler: contract, abort, no mutation, json round-trip', async () => {
  assert.equal(adjustHandler.type, 'adjust'); assert.equal(adjustHandler.version, 1);
  const input = px(50, 60, 70, 255);
  const copy = Array.from(input.data);
  const out = await adjustHandler.apply(input, adjustToJson({ brightness: 0.5 }), {});
  assert.deepEqual(Array.from(input.data), copy);
  assert.deepEqual(Array.from(out.data), adj({ brightness: 0.5 }, 50, 60, 70, 255));
  const ac = new AbortController(); ac.abort();
  assert.throws(() => adjustHandler.apply(input, {}, { signal: ac.signal }), { name: 'AbortError' });
  const op = newAdjustOperation('op1');
  assert.equal(op.type, 'adjust'); assert.equal(op.version, 1);
  const p = patchAdjustOperation(op, { hue: 30 });
  assert.equal(p.params.hue, 30); assert.equal(p.params.brightness, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(p.params)), p.params);
  const reg: unknown[] = [];
  registerAdjustOp({ register: (h) => reg.push(h) });
  assert.equal(reg[0], adjustHandler);
});

test('shader: both modes mirror the stage constants; baked mode embeds values', () => {
  const uni = buildFragmentShader();
  for (const n of ['uBrightness', 'uContrast', 'uSaturation', 'uHue', 'uTemperature', 'uHighlights', 'uShadows', 'uLut', 'texelFetch']) assert.ok(uni.includes(n), n);
  assert.ok(uni.startsWith('#version 300 es'));
  assert.ok(!uni.includes('float[256]'));
  const baked = adjustHandler.fragmentShader!(adjustToJson({ brightness: 0.5, curves: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }] }));
  assert.match(baked, /const float uBrightness = 0\.25/);
  assert.match(baked, /const bool uUseCurve = true/);
  assert.ok(baked.includes('float[256]('));
  assert.ok(!/uniform float uBrightness/.test(baked));
});

test('renderer falls back to CPU when WebGL2 is unavailable, and matches handler output', () => {
  const r = createAdjustRenderer({ createCanvas: () => ({ getContext: () => null }) as never });
  const src = px(10, 20, 30, 255, 200, 100, 50, 128);
  r.setSource(src);
  assert.equal(r.backend, 'cpu');
  const p = { contrast: 0.3, hue: 20 };
  assert.deepEqual(Array.from(r.render(p).data), adj(p, 10, 20, 30, 255, 200, 100, 50, 128));
  assert.deepEqual(Array.from(r.render({}).data), Array.from(src.data));
  r.dispose();
  const f = createAdjustRenderer({ forceCpu: true });
  f.setSource(src); assert.equal(f.backend, 'cpu'); f.dispose();
});

test('live preview coalesces to one render per frame, latest wins', () => {
  const frames: (() => void)[] = [];
  const seen: number[] = [];
  const lp = createLivePreview((p) => seen.push(p.brightness!), (cb) => frames.push(cb), () => {});
  lp.schedule({ brightness: 0.1 }); lp.schedule({ brightness: 0.2 }); lp.schedule({ brightness: 0.3 });
  assert.equal(frames.length, 1);
  frames.shift()!();
  assert.deepEqual(seen, [0.3]);
  lp.schedule({ brightness: 0.4 }); lp.cancel(); 
  frames.shift()?.();
  assert.deepEqual(seen, [0.3]);
});

test('perf: 4 MP CPU pass stays interactive-ish', () => {
  const n = 2000 * 2000;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  const t0 = performance.now();
  applyAdjust({ width: 2000, height: 2000, data }, { brightness: 0.1, contrast: 0.2, saturation: 0.3, hue: 20, temperature: 0.1, shadows: 0.2, curves: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] });
  const ms = performance.now() - t0;
  console.log(`# 4MP random-noise CPU pass: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 5000);
});

test('adjust handler registers in the image-editor core registry', async () => {
  const core = await import('../../image-editor/index');
  const { adjustHandler, newAdjustOperation, patchAdjustOperation } = await import('./op');
  const reg = core.createOperationRegistry();
  reg.register(adjustHandler);
  const op = patchAdjustOperation(newAdjustOperation('a1'), { brightness: 0.2 });
  const src = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(100) };
  const out = await core.renderStack(src, { schemaVersion: 1, source: { width: 2, height: 2, format: 'png', name: 'x.png' }, operations: [op], revision: 0 } as never, reg, {});
  assert.ok(out.data[0] > 100);
});
