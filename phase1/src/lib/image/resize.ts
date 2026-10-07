import { createImage, type RasterImage } from './buffer.ts'

export type ResampleFilter = 'box' | 'bilinear' | 'hamming' | 'catmull' | 'lanczos2' | 'lanczos3'

const sinc = (x: number): number => {
  if (x === 0) return 1
  const p = Math.PI * x
  return Math.sin(p) / p
}

interface Kernel { support: number; fn: (x: number) => number }

export const FILTERS: Record<ResampleFilter, Kernel> = {
  box: { support: 0.5, fn: (x) => (Math.abs(x) < 0.5 ? 1 : 0) },
  bilinear: { support: 1, fn: (x) => Math.max(0, 1 - Math.abs(x)) },
  hamming: { support: 1, fn: (x) => (Math.abs(x) >= 1 ? 0 : sinc(x) * (0.54 + 0.46 * Math.cos(Math.PI * x))) },
  catmull: {
    support: 2,
    fn: (x) => {
      const a = Math.abs(x)
      if (a < 1) return 1.5 * a ** 3 - 2.5 * a * a + 1
      if (a < 2) return -0.5 * a ** 3 + 2.5 * a * a - 4 * a + 2
      return 0
    },
  },
  lanczos2: { support: 2, fn: (x) => (Math.abs(x) >= 2 ? 0 : sinc(x) * sinc(x / 2)) },
  lanczos3: { support: 3, fn: (x) => (Math.abs(x) >= 3 ? 0 : sinc(x) * sinc(x / 3)) },
}

interface Contrib { start: number; weights: Float32Array }

/** Per-destination-pixel weights. When downscaling the kernel is stretched by the scale (anti-aliasing), the pica/ImageMagick approach. */
export function buildContributions(srcLen: number, dstLen: number, filter: ResampleFilter): Contrib[] {
  const { support, fn } = FILTERS[filter]
  const scale = dstLen / srcLen
  const fscale = Math.max(1, 1 / scale)
  const sup = support * fscale
  const out: Contrib[] = []
  for (let d = 0; d < dstLen; d++) {
    const center = (d + 0.5) / scale
    const start = Math.max(0, Math.floor(center - sup + 0.5))
    const end = Math.min(srcLen - 1, Math.floor(center + sup - 0.5))
    const weights = new Float32Array(end - start + 1)
    let sum = 0
    for (let s = start; s <= end; s++) {
      const w = fn((s + 0.5 - center) / fscale)
      weights[s - start] = w
      sum += w
    }
    if (sum === 0) {
      weights.fill(0)
      weights[Math.min(weights.length - 1, Math.max(0, Math.floor(center) - start))] = 1
    } else for (let i = 0; i < weights.length; i++) weights[i] /= sum
    out.push({ start, weights })
  }
  return out
}

/** Separable resample. Alpha-weighted so transparent pixels do not bleed colour (premultiply on the fly). */
export function resize(img: RasterImage, dstW: number, dstH: number, filter: ResampleFilter = 'lanczos3'): RasterImage {
  const { width: sw, height: sh, data: s } = img
  const cx = buildContributions(sw, dstW, filter)
  const cy = buildContributions(sh, dstH, filter)
  const tmp = new Float32Array(dstW * sh * 4) // premultiplied
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dstW; x++) {
      const { start, weights } = cx[x]
      let r = 0, g = 0, b = 0, a = 0
      for (let k = 0; k < weights.length; k++) {
        const i = (y * sw + start + k) * 4
        const al = (s[i + 3] / 255) * weights[k]
        r += s[i] * al
        g += s[i + 1] * al
        b += s[i + 2] * al
        a += al
      }
      const o = (y * dstW + x) * 4
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a
    }
  }
  const out = createImage(dstW, dstH)
  for (let y = 0; y < dstH; y++) {
    const { start, weights } = cy[y]
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let k = 0; k < weights.length; k++) {
        const i = ((start + k) * dstW + x) * 4
        r += tmp[i] * weights[k]
        g += tmp[i + 1] * weights[k]
        b += tmp[i + 2] * weights[k]
        a += tmp[i + 3] * weights[k]
      }
      const o = (y * dstW + x) * 4
      if (a > 1e-6) {
        out.data[o] = r / a
        out.data[o + 1] = g / a
        out.data[o + 2] = b / a
      }
      out.data[o + 3] = a * 255
    }
  }
  return out
}
