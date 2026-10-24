import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import * as A from '../../image/adjust.ts'
import { gaussianBlur, unsharpMask } from '../../image/convolve.ts'
import { vignette } from '../../image/filters.ts'
import { resize } from '../../image/resize.ts'
import { rotate, flip } from '../../image/transform.ts'
import { clampPadding, cropPadding } from '../blurPreview.ts'
import { compareImages, decodePng, encodePng, expectGolden, fixtures, GOLDEN_DIR } from './golden.ts'

// --- harness self-tests ---
test('png codec round trips and fixtures are deterministic', () => {
  for (const [name, make] of Object.entries(fixtures)) {
    const a = make(), b = make()
    assert.deepEqual(a.data, b.data, name)
    const back = decodePng(encodePng(a))
    assert.equal(back.width, a.width); assert.deepEqual(back.data, a.data, name)
  }
})
test('compare honours 1/255 tolerance', () => {
  const a = fixtures.gradient(), b = { ...a, data: new Uint8ClampedArray(a.data) }
  b.data[0] = Math.min(255, b.data[0] + 1); assert.ok(compareImages(a, b).ok)
  b.data[0] = Math.min(255, a.data[0] + 2); const d = compareImages(a, b); assert.equal(d.ok, false); assert.equal(d.badPixels, 1)
})

// --- reference (TS) renderer goldens ---
type Case = [string, keyof typeof fixtures, (i: ReturnType<typeof fixtures.gradient>) => ReturnType<typeof fixtures.gradient>]
const cases: Case[] = [
  ['ref-blur-s2-checker', 'checker', i => gaussianBlur(i, 2)],
  ['ref-blur-s1.5-alpha', 'alpha', i => gaussianBlur(i, 1.5)],
  ['ref-unsharp-gradient', 'checker', i => unsharpMask(i, 1.5, 1.2)],
  ['ref-brightness-contrast', 'gradient', i => A.brightnessContrast(i, 20, 30)],
  ['ref-saturation-up', 'checker', i => A.saturation(i, 0.5)],
  ['ref-hue-90', 'checker', i => A.hueRotate(i, 90)],
  ['ref-exposure-plus1', 'gradient', i => A.exposure(i, 1)],
  ['ref-grayscale', 'gradient', i => A.grayscale(i)],
  ['ref-sepia', 'gradient', i => A.sepia(i, 1)],
  ['ref-invert-alpha', 'alpha', i => A.invert(i)],
  ['ref-levels', 'gradient', i => A.levels(i, { inBlack: 20, inWhite: 235, gamma: 1.4 })],
  ['ref-curves-s', 'gradient', i => A.curves(i, { rgb: [[0, 0], [64, 40], [192, 220], [255, 255]] })],
  ['ref-vignette', 'gradient', i => vignette(i, 1)],
  ['ref-resize-lanczos3-down', 'rings', i => resize(i, 20, 20, 'lanczos3')],
  ['ref-resize-bilinear-up', 'rings', i => resize(i, 70, 70, 'bilinear')],
  ['ref-rotate-30', 'rings', i => rotate(i, 30)],
  ['ref-flip-h', 'gradient', i => flip(i, true)],
]
for (const [name, fx, fn] of cases) test(`golden ${name}`, () => expectGolden(name, fn(fixtures[fx]())))

// --- craft preview padding pipeline (pure TS half of the WASM blur path) ---
test('golden craft-pad-crop: edge extension then crop restores source', () => {
  const src = fixtures.alpha(), p = clampPadding(src, 3)
  expectGolden('craft-pad-r3-alpha', { width: p.width, height: p.height, data: new Uint8ClampedArray(p.bytes) })
  const back = cropPadding(p.bytes.buffer as ArrayBuffer, p.width, p.height, p.pad, src)
  assert.deepEqual(back.data, src.data)
})

// --- WASM engine goldens: run only where the built package exists (craft/build.sh) ---
const wasmFile = new URL('../../../../craft/pkg/somnia_craft_bg.wasm', import.meta.url)
const hasWasm = existsSync(wasmFile) && existsSync(new URL('../../../../craft/pkg/somnia_craft.js', import.meta.url))
test('golden craft-wasm gaussian_blur_rgba (needs craft/pkg build)', { skip: !hasWasm && 'craft/pkg wasm not built' }, async () => {
  const mod = await import('../../../../craft/pkg/somnia_craft.js')
  await mod.default({ module_or_path: readFileSync(wasmFile) })
  const src = fixtures.checker(), p = clampPadding(src, 3)
  const out = mod.gaussian_blur_rgba(p.bytes, p.width, p.height, 3)
  const got = cropPadding(new Uint8Array(out).buffer, p.width, p.height, p.pad, src)
  expectGolden('craft-wasm-blur-r3-checker', got)
})
test('wasm goldens present when wasm is built', { skip: !hasWasm && 'craft/pkg wasm not built' }, () => {
  assert.ok(existsSync(join(GOLDEN_DIR, 'craft-wasm-blur-r3-checker.png')) || process.env.UPDATE_GOLDENS === '1')
})
