import { deflateSync, inflateSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RasterImage } from '../../image/buffer'

/** Test-only raster golden helpers. Goldens are RGBA8 PNGs in ./png.
 * Regenerate deliberately with UPDATE_GOLDENS=1 and review the diff images. */
export const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'png')
export const TOLERANCE = 1 // per channel, out of 255 (plan step 3.5)

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(buf: Uint8Array): number { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
export function encodePng(img: RasterImage): Buffer {
  const { width, height, data } = img
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
/** Decodes only what encodePng writes: 8-bit RGBA, filters 0-4 handled. */
export function decodePng(buf: Buffer): RasterImage {
  let p = 8, width = 0, height = 0; const idat: Buffer[] = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('golden PNG must be 8-bit RGBA, non-interlaced') }
    else if (type === 'IDAT') idat.push(body)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, data = new Uint8ClampedArray(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? data[y * stride + i - 4] : 0, b = y ? data[(y - 1) * stride + i] : 0, c = i >= 4 && y ? data[(y - 1) * stride + i - 4] : 0
      let v = line[i]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      data[y * stride + i] = v & 255
    }
  }
  return { width, height, data }
}

export interface Diff { ok: boolean; maxDelta: number; badPixels: number; firstBad?: { x: number; y: number; got: number[]; want: number[] } }
export function compareImages(got: RasterImage, want: RasterImage, tol = TOLERANCE): Diff {
  if (got.width !== want.width || got.height !== want.height) return { ok: false, maxDelta: Infinity, badPixels: -1 }
  let maxDelta = 0, badPixels = 0; let firstBad: Diff['firstBad']
  for (let i = 0; i < got.data.length; i += 4) {
    let bad = false
    for (let c = 0; c < 4; c++) { const d = Math.abs(got.data[i + c] - want.data[i + c]); if (d > maxDelta) maxDelta = d; if (d > tol) bad = true }
    if (bad) { badPixels++; firstBad ??= { x: (i / 4) % got.width, y: Math.floor(i / 4 / got.width), got: [...got.data.subarray(i, i + 4)], want: [...want.data.subarray(i, i + 4)] } }
  }
  return { ok: badPixels === 0, maxDelta, badPixels, firstBad }
}

/** Compare to golden `name`. Missing golden fails unless UPDATE_GOLDENS=1 (which writes it). */
export function expectGolden(name: string, got: RasterImage, tol = TOLERANCE): void {
  const file = join(GOLDEN_DIR, `${name}.png`)
  if (process.env.UPDATE_GOLDENS === '1') { mkdirSync(GOLDEN_DIR, { recursive: true }); writeFileSync(file, encodePng(got)); return }
  if (!existsSync(file)) throw new Error(`missing golden ${name}.png - run with UPDATE_GOLDENS=1 and review`)
  const diff = compareImages(got, decodePng(readFileSync(file)), tol)
  if (!diff.ok) throw new Error(`golden ${name} mismatch: max delta ${diff.maxDelta}, ${diff.badPixels} pixels over ${tol}/255, first ${JSON.stringify(diff.firstBad)}`)
}

// ---- deterministic fixtures (no RNG, no Math.random) ----
function make(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4)
  return { width: w, height: h, data }
}
export const fixtures = {
  /** smooth colour gradient, opaque */
  gradient: () => make(48, 32, (x, y) => [Math.round(x * 255 / 47), Math.round(y * 255 / 31), 128, 255]),
  /** hard edges: 8px checker with colour tints, opaque */
  checker: () => make(48, 32, (x, y) => ((x >> 3) + (y >> 3)) & 1 ? [230, 40, 60, 255] : [20, 60, 200, 255]),
  /** alpha ramp over a stripe pattern, exercises straight-alpha handling */
  alpha: () => make(48, 32, (x, y) => [x % 16 < 8 ? 250 : 30, 120, y % 16 < 8 ? 40 : 220, Math.round(x * 255 / 47)]),
  /** concentric rings (integer maths only) for resample/rotate */
  rings: () => make(48, 48, (x, y) => { const d = Math.round(Math.sqrt((x - 24) ** 2 + (y - 24) ** 2)); const v = d % 6 < 3 ? 235 : 25; return [v, 255 - v, (d * 9) & 255, 255] }),
}
