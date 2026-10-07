import { createImage, type RasterImage } from './buffer.ts'

export interface Rect { x: number; y: number; width: number; height: number }

export function crop(img: RasterImage, r: Rect): RasterImage {
  const x0 = Math.max(0, Math.floor(r.x))
  const y0 = Math.max(0, Math.floor(r.y))
  const x1 = Math.min(img.width, Math.ceil(r.x + r.width))
  const y1 = Math.min(img.height, Math.ceil(r.y + r.height))
  if (x1 <= x0 || y1 <= y0) throw new RangeError('crop rect outside image')
  const out = createImage(x1 - x0, y1 - y0)
  for (let y = y0; y < y1; y++) {
    const from = (y * img.width + x0) * 4
    out.data.set(img.data.subarray(from, from + (x1 - x0) * 4), (y - y0) * out.width * 4)
  }
  return out
}

export function rotate90(img: RasterImage, quarterTurnsCw: number): RasterImage {
  const q = ((Math.round(quarterTurnsCw) % 4) + 4) % 4
  const { width: w, height: h } = img
  if (q === 0) return { width: w, height: h, data: new Uint8ClampedArray(img.data) }
  const out = q === 2 ? createImage(w, h) : createImage(h, w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx: number, dy: number
      if (q === 1) { dx = h - 1 - y; dy = x }
      else if (q === 2) { dx = w - 1 - x; dy = h - 1 - y }
      else { dx = y; dy = w - 1 - x }
      const s = (y * w + x) * 4
      const d = (dy * out.width + dx) * 4
      out.data.set(img.data.subarray(s, s + 4), d)
    }
  }
  return out
}

export function flip(img: RasterImage, horizontal: boolean): RasterImage {
  const { width: w, height: h } = img
  const out = createImage(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? w - 1 - x : x
      const sy = horizontal ? y : h - 1 - y
      out.data.set(img.data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4)
    }
  }
  return out
}

/** Bilinear sample with premultiplied alpha; returns false when outside. */
function sampleBilinear(img: RasterImage, fx: number, fy: number, out: number[]): boolean {
  const { width: w, height: h, data: d } = img
  if (fx < -0.5 || fy < -0.5 || fx > w - 0.5 || fy > h - 0.5) return false
  const x = fx - 0.5, y = fy - 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const tx = x - x0, ty = y - y0
  let r = 0, g = 0, b = 0, a = 0
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const sx = Math.min(w - 1, Math.max(0, x0 + i))
      const sy = Math.min(h - 1, Math.max(0, y0 + j))
      const wt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty)
      const p = (sy * w + sx) * 4
      const al = (d[p + 3] / 255) * wt
      r += d[p] * al; g += d[p + 1] * al; b += d[p + 2] * al; a += al
    }
  }
  out[0] = a > 0 ? r / a : 0
  out[1] = a > 0 ? g / a : 0
  out[2] = a > 0 ? b / a : 0
  out[3] = a * 255
  return true
}

/** Rotate by arbitrary degrees clockwise; expand=true grows the canvas to fit, else keeps size. Exposed corners are transparent. */
export function rotate(img: RasterImage, degrees: number, expand = true): RasterImage {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const { width: w, height: h } = img
  const ow = expand ? Math.max(1, Math.round(Math.abs(w * cos) + Math.abs(h * sin))) : w
  const oh = expand ? Math.max(1, Math.round(Math.abs(w * sin) + Math.abs(h * cos))) : h
  const out = createImage(ow, oh)
  const t = [0, 0, 0, 0]
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const dx = x + 0.5 - ow / 2
      const dy = y + 0.5 - oh / 2
      // inverse rotation (clockwise forward => counter-clockwise back)
      const sx = dx * cos + dy * sin + w / 2
      const sy = -dx * sin + dy * cos + h / 2
      if (sampleBilinear(img, sx, sy, t)) out.data.set(t, (y * ow + x) * 4)
    }
  }
  return out
}
