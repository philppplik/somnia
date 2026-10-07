import { cloneImage, type RasterImage } from './buffer.ts'

/** Rec.709 luma weights (matches the GLSL in shaders.ts). */
export const LUMA = [0.2126, 0.7152, 0.0722] as const

/** Apply a per-pixel function on 0..255 floats; alpha is untouched. */
function mapRgb(img: RasterImage, fn: (r: number, g: number, b: number, out: number[]) => void): RasterImage {
  const out = cloneImage(img)
  const d = out.data
  const t = [0, 0, 0]
  for (let i = 0; i < d.length; i += 4) {
    fn(d[i], d[i + 1], d[i + 2], t)
    d[i] = t[0]
    d[i + 1] = t[1]
    d[i + 2] = t[2]
  }
  return out
}

/** Photoshop-legacy-free brightness/contrast. Both -1..1. brightness shifts, contrast pivots on mid grey (glfx.js model). */
export function brightnessContrast(img: RasterImage, brightness: number, contrast: number): RasterImage {
  const k = contrast > 0 ? 1 / (1 - Math.min(contrast, 0.999)) : 1 + contrast
  return mapRgb(img, (r, g, b, o) => {
    o[0] = (r + brightness * 255 - 127.5) * k + 127.5
    o[1] = (g + brightness * 255 - 127.5) * k + 127.5
    o[2] = (b + brightness * 255 - 127.5) * k + 127.5
  })
}

/** Saturation -1..1 (-1 = grayscale, 0 = identity, 1 = double). Works by lerping away from Rec.709 luma. */
export function saturation(img: RasterImage, amount: number): RasterImage {
  const s = 1 + amount
  return mapRgb(img, (r, g, b, o) => {
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b
    o[0] = y + (r - y) * s
    o[1] = y + (g - y) * s
    o[2] = y + (b - y) * s
  })
}

/** 3x3 matrix rotating RGB around the grey axis (W3C Filter Effects feColorMatrix hueRotate; fixed 0.213/0.715/0.072 weights). */
export function hueRotateMatrix(degrees: number): number[] {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]
}

export function hueRotate(img: RasterImage, degrees: number): RasterImage {
  const m = hueRotateMatrix(degrees)
  return mapRgb(img, (r, g, b, o) => {
    o[0] = m[0] * r + m[1] * g + m[2] * b
    o[1] = m[3] * r + m[4] * g + m[5] * b
    o[2] = m[6] * r + m[7] * g + m[8] * b
  })
}

/** Exposure in stops, applied in linear light. */
export function exposure(img: RasterImage, stops: number): RasterImage {
  const f = 2 ** stops
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.round(linearToSrgb(srgbToLinear(i / 255) * f) * 255)
  return applyLut(img, lut, lut, lut)
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export function linearToSrgb(c: number): number {
  const v = c < 0 ? 0 : c > 1 ? 1 : c
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

export function grayscale(img: RasterImage): RasterImage {
  return mapRgb(img, (r, g, b, o) => {
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b
    o[0] = o[1] = o[2] = y
  })
}

/** Classic sepia matrix (W3C Filter Effects), amount 0..1. */
export function sepia(img: RasterImage, amount = 1): RasterImage {
  const a = 1 - Math.min(1, Math.max(0, amount))
  const m = [
    0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
    0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
    0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
  ]
  return mapRgb(img, (r, g, b, o) => {
    o[0] = m[0] * r + m[1] * g + m[2] * b
    o[1] = m[3] * r + m[4] * g + m[5] * b
    o[2] = m[6] * r + m[7] * g + m[8] * b
  })
}

export function invert(img: RasterImage): RasterImage {
  return mapRgb(img, (r, g, b, o) => {
    o[0] = 255 - r
    o[1] = 255 - g
    o[2] = 255 - b
  })
}

export function applyLut(img: RasterImage, lr: ArrayLike<number>, lg: ArrayLike<number>, lb: ArrayLike<number>): RasterImage {
  const out = cloneImage(img)
  const d = out.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lr[d[i]]
    d[i + 1] = lg[d[i + 1]]
    d[i + 2] = lb[d[i + 2]]
  }
  return out
}

export interface LevelsParams {
  inBlack?: number // 0..255
  inWhite?: number // 0..255
  gamma?: number // >0, 1 = identity; >1 brightens midtones (Photoshop convention)
  outBlack?: number
  outWhite?: number
}

/** 256-entry LUT for Photoshop-style Levels. */
export function levelsLut(p: LevelsParams = {}): Uint8ClampedArray {
  const inB = p.inBlack ?? 0
  const inW = p.inWhite ?? 255
  const g = p.gamma ?? 1
  const outB = p.outBlack ?? 0
  const outW = p.outWhite ?? 255
  if (g <= 0) throw new RangeError('gamma must be > 0')
  const span = Math.max(1e-6, inW - inB)
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    const t = Math.min(1, Math.max(0, (i - inB) / span))
    lut[i] = Math.round(outB + (outW - outB) * t ** (1 / g))
  }
  return lut
}

export function levels(img: RasterImage, p: LevelsParams): RasterImage {
  const l = levelsLut(p)
  return applyLut(img, l, l, l)
}

export type CurvePoint = readonly [x: number, y: number]

/**
 * Monotone cubic (Fritsch-Carlson) spline through control points in 0..255 space.
 * Monotone interpolation avoids the overshoot/inversions a natural spline gives on steep curves.
 */
export function curveLut(points: readonly CurvePoint[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a[0] - b[0])
  if (pts.length === 0) return identityLut()
  for (let i = 1; i < pts.length; i++) if (pts[i][0] === pts[i - 1][0]) throw new RangeError('duplicate curve x')
  const n = pts.length
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const lut = new Uint8ClampedArray(256)
  if (n === 1) return lut.fill(Math.round(ys[0]))
  const dx: number[] = []
  const sl: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i])
    sl.push((ys[i + 1] - ys[i]) / dx[i])
  }
  const m = new Array<number>(n)
  m[0] = sl[0]
  m[n - 1] = sl[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / sl[i]
    const b = m[i + 1] / sl[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      const t = 3 / h
      m[i] = t * a * sl[i]
      m[i + 1] = t * b * sl[i]
    }
  }
  let seg = 0
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) {
      lut[x] = Math.round(ys[0])
      continue
    }
    if (x >= xs[n - 1]) {
      lut[x] = Math.round(ys[n - 1])
      continue
    }
    while (x > xs[seg + 1]) seg++
    const h = dx[seg]
    const t = (x - xs[seg]) / h
    const t2 = t * t
    const t3 = t2 * t
    const v =
      (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] +
      (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1]
    lut[x] = Math.round(v)
  }
  return lut
}

export function identityLut(): Uint8ClampedArray {
  const l = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) l[i] = i
  return l
}

export interface CurvesParams {
  rgb?: readonly CurvePoint[]
  r?: readonly CurvePoint[]
  g?: readonly CurvePoint[]
  b?: readonly CurvePoint[]
}

/** Master (rgb) curve is applied first, then the per-channel curve (Photoshop order). */
export function curves(img: RasterImage, p: CurvesParams): RasterImage {
  const master = p.rgb ? curveLut(p.rgb) : identityLut()
  const comp = (pts?: readonly CurvePoint[]) => {
    const c = pts ? curveLut(pts) : identityLut()
    const out = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i++) out[i] = c[master[i]]
    return out
  }
  return applyLut(img, comp(p.r), comp(p.g), comp(p.b))
}

/** Histogram of Rec.709 luma, for the Levels/Curves panel. */
export function lumaHistogram(img: RasterImage): Uint32Array {
  const h = new Uint32Array(256)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) h[Math.round(LUMA[0] * d[i] + LUMA[1] * d[i + 1] + LUMA[2] * d[i + 2])]++
  return h
}
