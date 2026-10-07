import { cloneImage, type RasterImage } from './buffer.ts'

/** Generic square-kernel convolution with edge clamping. Alpha is convolved premultiplied-safe: RGB weighted by alpha. */
export function convolve(img: RasterImage, kernel: readonly number[], size: number, divisor?: number, bias = 0): RasterImage {
  if (size % 2 === 0 || kernel.length !== size * size) throw new RangeError('kernel must be odd square')
  const div = divisor ?? (kernel.reduce((a, b) => a + b, 0) || 1)
  const { width: w, height: h, data: src } = img
  const out = cloneImage(img)
  const half = (size - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0
      for (let ky = 0; ky < size; ky++) {
        const sy = Math.min(h - 1, Math.max(0, y + ky - half))
        for (let kx = 0; kx < size; kx++) {
          const sx = Math.min(w - 1, Math.max(0, x + kx - half))
          const k = kernel[ky * size + kx]
          const i = (sy * w + sx) * 4
          r += src[i] * k
          g += src[i + 1] * k
          b += src[i + 2] * k
        }
      }
      const o = (y * w + x) * 4
      out.data[o] = r / div + bias
      out.data[o + 1] = g / div + bias
      out.data[o + 2] = b / div + bias
    }
  }
  return out
}

export const KERNELS = {
  sharpen3: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  edge3: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  emboss3: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  box3: [1, 1, 1, 1, 1, 1, 1, 1, 1],
} as const

/** Normalised 1D Gaussian kernel; radius = ceil(3*sigma). */
export function gaussianKernel(sigma: number): Float32Array {
  if (!Number.isFinite(sigma) || !(sigma > 0) || sigma > 100) throw new RangeError('sigma must be finite and between 0 and 100')
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    k[i + r] = v
    sum += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return k
}

/** Separable Gaussian blur: O(w*h*r). Edge-clamped; filter premultiplied RGB, then return straight-alpha sRGB. */
export function gaussianBlur(img: RasterImage, sigma: number, signal?: AbortSignal): RasterImage {
  signal?.throwIfAborted()
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 100) throw new RangeError('sigma must be finite and between 0 and 100')
  if (sigma === 0) return cloneImage(img)
  const k = gaussianKernel(sigma)
  const r = (k.length - 1) / 2
  const { width: w, height: h } = img
  const tmp = new Float32Array(w * h * 4)
  const src = img.data
  for (let y = 0; y < h; y++) {
    signal?.throwIfAborted()
    for (let x = 0; x < w; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0
      for (let j = -r; j <= r; j++) {
        const sx = Math.min(w - 1, Math.max(0, x + j))
        const i = (y * w + sx) * 4
        const wt = k[j + r]
        const alpha = src[i + 3] / 255
        a0 += src[i] * alpha * wt
        a1 += src[i + 1] * alpha * wt
        a2 += src[i + 2] * alpha * wt
        a3 += src[i + 3] * wt
      }
      const o = (y * w + x) * 4
      tmp[o] = a0; tmp[o + 1] = a1; tmp[o + 2] = a2; tmp[o + 3] = a3
    }
  }
  const out = cloneImage(img)
  for (let y = 0; y < h; y++) {
    signal?.throwIfAborted()
    for (let x = 0; x < w; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0
      for (let j = -r; j <= r; j++) {
        const sy = Math.min(h - 1, Math.max(0, y + j))
        const i = (sy * w + x) * 4
        const wt = k[j + r]
        a0 += tmp[i] * wt
        a1 += tmp[i + 1] * wt
        a2 += tmp[i + 2] * wt
        a3 += tmp[i + 3] * wt
      }
      const o = (y * w + x) * 4
      const scale = a3 > 0 ? 255 / a3 : 0
      out.data[o] = a0 * scale; out.data[o + 1] = a1 * scale; out.data[o + 2] = a2 * scale; out.data[o + 3] = a3
    }
  }
  return out
}

/** Unsharp mask: out = src + amount * (src - blur(src)) when |diff| >= threshold (0..255). */
export function unsharpMask(img: RasterImage, sigma: number, amount: number, threshold = 0, signal?: AbortSignal): RasterImage {
  const blur = gaussianBlur(img, sigma, signal)
  const out = cloneImage(img)
  for (let i = 0; i < out.data.length; i += 4) {
    if (i % (img.width * 4) === 0) signal?.throwIfAborted()
    if (img.data[i + 3] === 0) continue
    for (let c = 0; c < 3; c++) {
      const diff = img.data[i + c] - blur.data[i + c]
      if (Math.abs(diff) >= threshold) out.data[i + c] = img.data[i + c] + amount * diff
    }
  }
  return out
}
