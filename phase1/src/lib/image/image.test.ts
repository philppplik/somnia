import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImage, type RasterImage } from './buffer.ts'
import * as A from './adjust.ts'
import { gaussianBlur, gaussianKernel, convolve, KERNELS, unsharpMask } from './convolve.ts'
import { buildContributions, resize } from './resize.ts'
import { crop, flip, rotate, rotate90 } from './transform.ts'
import { applyStack } from './pipeline.ts'
import { ADJUST_FRAGMENT, toColumnMajor, packLutTexture } from './shaders.ts'

const px = (img: RasterImage, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))
function gradient(w: number, h: number): RasterImage {
  const img = createImage(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set([(x * 255) / (w - 1), (y * 255) / (h - 1), 128, 255], (y * w + x) * 4)
  return img
}
const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)

test('identity parameters are no-ops', () => {
  const g = gradient(8, 8)
  assert.deepEqual(A.brightnessContrast(g, 0, 0).data, g.data)
  assert.deepEqual(A.saturation(g, 0).data, g.data)
  near(px(A.hueRotate(g, 0), 3, 2)[0], px(g, 3, 2)[0])
  assert.deepEqual(A.levels(g, {}).data, g.data)
  assert.deepEqual(A.curves(g, { rgb: [[0, 0], [255, 255]] }).data, g.data)
  assert.deepEqual(A.exposure(g, 0).data, g.data)
})

test('brightness, contrast, invert, gray, sepia', () => {
  const p = createImage(1, 1, [100, 100, 100, 255])
  assert.deepEqual(px(A.brightnessContrast(p, 0.1, 0), 0, 0).slice(0, 3), [126, 126, 126])
  near(px(A.brightnessContrast(createImage(1, 1, [127.5, 127.5, 127.5, 255]), 0, 0.5), 0, 0)[0], 128)
  assert.deepEqual(px(A.invert(p), 0, 0), [155, 155, 155, 255])
  const c = createImage(1, 1, [255, 0, 0, 77])
  const gr = px(A.grayscale(c), 0, 0)
  assert.equal(gr[0], gr[1]); near(gr[0], 54); assert.equal(gr[3], 77)
  assert.deepEqual(px(A.sepia(createImage(1, 1, [255, 255, 255, 255])), 0, 0).slice(0, 3), [255, 255, 239])
})

test('saturation -1 equals grayscale; +1 increases chroma', () => {
  const c = createImage(1, 1, [200, 100, 50, 255])
  assert.deepEqual(A.saturation(c, -1).data, A.grayscale(c).data)
  const s = px(A.saturation(c, 0.5), 0, 0)
  assert.ok(s[0] - s[2] > 150)
})

test('hue rotation: 360 identity, 120 deg rotates red toward green/blue, preserves grey', () => {
  const grey = createImage(1, 1, [90, 90, 90, 255])
  const h = px(A.hueRotate(grey, 77), 0, 0)
  near(h[0], 90, 1); near(h[1], 90, 1); near(h[2], 90, 1)
  const red = createImage(1, 1, [255, 0, 0, 255])
  near(px(A.hueRotate(red, 360), 0, 0)[0], 255)
  const r120 = px(A.hueRotate(red, 120), 0, 0)
  assert.ok(r120[1] > r120[0] && r120[1] > r120[2])
})

test('levels clip and gamma', () => {
  const l = A.levelsLut({ inBlack: 50, inWhite: 200 })
  assert.equal(l[50], 0); assert.equal(l[200], 255); assert.equal(l[0], 0); assert.equal(l[255], 255)
  assert.ok(A.levelsLut({ gamma: 2 })[64] > 64)
  assert.throws(() => A.levelsLut({ gamma: 0 }))
})

test('curve LUT is monotone, passes through control points, no overshoot', () => {
  const lut = A.curveLut([[0, 0], [64, 30], [192, 224], [255, 255]])
  assert.equal(lut[0], 0); assert.equal(lut[64], 30); assert.equal(lut[192], 224); assert.equal(lut[255], 255)
  for (let i = 1; i < 256; i++) assert.ok(lut[i] >= lut[i - 1], `non-monotone at ${i}`)
  const steep = A.curveLut([[0, 0], [100, 0], [101, 255], [255, 255]])
  for (let i = 0; i < 256; i++) assert.ok(steep[i] === 0 || steep[i] === 255 || (i >= 100 && i <= 101))
  assert.throws(() => A.curveLut([[1, 1], [1, 2]]))
})

test('gaussian kernel normalised; blur preserves flat image and mean', () => {
  const k = gaussianKernel(2); assert.ok(Math.abs(k.reduce((a, b) => a + b, 0) - 1) < 1e-5)
  const flat = createImage(9, 9, [10, 20, 30, 255])
  assert.deepEqual(gaussianBlur(flat, 3).data, flat.data)
  const dot = createImage(11, 11, [0, 0, 0, 255]); dot.data.set([255, 255, 255, 255], (5 * 11 + 5) * 4)
  const b = gaussianBlur(dot, 1.5)
  assert.ok(px(b, 5, 5)[0] < 255 && px(b, 5, 5)[0] > px(b, 5, 7)[0] && px(b, 5, 7)[0] > 0)
  assert.equal(px(b, 4, 5)[0], px(b, 6, 5)[0]); assert.equal(px(b, 5, 4)[0], px(b, 5, 6)[0])
})

test('convolution identity, sharpen increases edge contrast, box matches blur on flat', () => {
  const g = gradient(6, 6)
  assert.deepEqual(convolve(g, [0, 0, 0, 0, 1, 0, 0, 0, 0], 3).data, g.data)
  const edge = createImage(6, 1, [0, 0, 0, 255]); for (let x = 3; x < 6; x++) edge.data.set([200, 200, 200, 255], x * 4)
  const sh = convolve(edge, KERNELS.sharpen3, 3)
  assert.equal(px(sh, 3, 0)[0], 255); assert.equal(px(sh, 2, 0)[0], 0)
  const us = unsharpMask(edge, 1, 1)
  assert.ok(px(us, 3, 0)[0] > 200)
  assert.throws(() => convolve(g, [1, 1, 1, 1], 2))
})

test('lanczos weights normalised; flat stays flat; downscale averages; upscale keeps endpoints', () => {
  for (const f of ['lanczos3', 'lanczos2', 'catmull', 'bilinear', 'hamming', 'box'] as const) {
    for (const c of buildContributions(17, 5, f)) near(c.weights.reduce((a, b) => a + b, 0), 1, 1e-4)
  }
  const flat = createImage(20, 10, [40, 80, 120, 255])
  const r = resize(flat, 7, 3)
  for (let i = 0; i < r.data.length; i += 4) assert.deepEqual(Array.from(r.data.subarray(i, i + 4)), [40, 80, 120, 255])
  const chk = createImage(4, 4); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) chk.data.set(((x + y) & 1) ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * 4 + x) * 4)
  near(px(resize(chk, 1, 1, 'box'), 0, 0)[0], 128, 1)
  const up = resize(gradient(4, 4), 16, 16)
  assert.equal(up.width, 16); near(px(up, 0, 0)[0], 0, 12); near(px(up, 15, 0)[0], 255, 12)
})

test('resize does not bleed colour from transparent pixels', () => {
  const img = createImage(2, 1); img.data.set([255, 0, 0, 255, 0, 255, 0, 0])
  const r = resize(img, 1, 1, 'box')
  assert.deepEqual(px(r, 0, 0).slice(0, 3), [255, 0, 0]); near(px(r, 0, 0)[3], 128, 1)
})

test('crop, rotate90, flip, arbitrary rotate', () => {
  const g = gradient(4, 3)
  assert.deepEqual(px(crop(g, { x: 1, y: 1, width: 2, height: 2 }), 0, 0), px(g, 1, 1))
  assert.throws(() => crop(g, { x: 9, y: 9, width: 1, height: 1 }))
  const r1 = rotate90(g, 1); assert.equal(r1.width, 3); assert.equal(r1.height, 4)
  assert.deepEqual(px(r1, 2, 0), px(g, 0, 0)) // top-left goes to top-right when rotating cw
  assert.deepEqual(rotate90(rotate90(g, 1), 3).data, g.data)
  assert.deepEqual(rotate90(g, 2).data, flip(flip(g, true), false).data)
  assert.deepEqual(flip(flip(g, true), true).data, g.data)
  const r = rotate(createImage(10, 10, [9, 9, 9, 255]), 45)
  assert.ok(r.width >= 14 && r.width <= 15); assert.equal(px(r, 0, 0)[3], 0); assert.equal(px(r, r.width >> 1, r.height >> 1)[3], 255)
  assert.deepEqual(rotate(g, 0, false).data, g.data)
})

test('edit stack is serialisable and composes', () => {
  const ops = [{ op: 'crop', rect: { x: 0, y: 0, width: 4, height: 4 } }, { op: 'grayscale' }, { op: 'invert' }, { op: 'resize', width: 2, height: 2 }] as const
  const out = applyStack(gradient(8, 8), JSON.parse(JSON.stringify(ops)))
  assert.equal(out.width, 2); assert.equal(px(out, 0, 0)[0], px(out, 0, 0)[2])
})

test('shader sources reference every uniform the CPU model needs; LUT packing', () => {
  for (const u of ['uExposure', 'uBrightness', 'uContrast', 'uHue', 'uSaturation', 'uLut', 'uSepia', 'uGray', 'uInvert']) assert.ok(ADJUST_FRAGMENT.includes(u))
  const m = toColumnMajor([1, 2, 3, 4, 5, 6, 7, 8, 9]); assert.deepEqual(Array.from(m), [1, 4, 7, 2, 5, 8, 3, 6, 9])
  const t = packLutTexture(A.identityLut(), A.identityLut(), A.identityLut()); assert.equal(t.length, 1024); assert.equal(t[255 * 4], 255)
})
