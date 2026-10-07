import * as A from './adjust.ts'
import * as C from './convolve.ts'
import { resize, type ResampleFilter } from './resize.ts'
import { crop, flip, rotate, rotate90, type Rect } from './transform.ts'
import type { RasterImage } from './buffer.ts'

/** Serialisable, non-destructive edit stack (history-friendly: plain JSON). */
export type EditOp =
  | { op: 'brightnessContrast'; brightness: number; contrast: number }
  | { op: 'saturation'; amount: number }
  | { op: 'hue'; degrees: number }
  | { op: 'exposure'; stops: number }
  | { op: 'levels'; params: A.LevelsParams }
  | { op: 'curves'; params: A.CurvesParams }
  | { op: 'grayscale' }
  | { op: 'sepia'; amount?: number }
  | { op: 'invert' }
  | { op: 'blur'; sigma: number }
  | { op: 'sharpen'; sigma: number; amount: number; threshold?: number }
  | { op: 'convolve'; kernel: number[]; size: number; divisor?: number; bias?: number }
  | { op: 'resize'; width: number; height: number; filter?: ResampleFilter }
  | { op: 'crop'; rect: Rect }
  | { op: 'rotate90'; turns: number }
  | { op: 'rotate'; degrees: number; expand?: boolean }
  | { op: 'flip'; horizontal: boolean }

export function applyOp(img: RasterImage, e: EditOp): RasterImage {
  switch (e.op) {
    case 'brightnessContrast': return A.brightnessContrast(img, e.brightness, e.contrast)
    case 'saturation': return A.saturation(img, e.amount)
    case 'hue': return A.hueRotate(img, e.degrees)
    case 'exposure': return A.exposure(img, e.stops)
    case 'levels': return A.levels(img, e.params)
    case 'curves': return A.curves(img, e.params)
    case 'grayscale': return A.grayscale(img)
    case 'sepia': return A.sepia(img, e.amount ?? 1)
    case 'invert': return A.invert(img)
    case 'blur': return C.gaussianBlur(img, e.sigma)
    case 'sharpen': return C.unsharpMask(img, e.sigma, e.amount, e.threshold ?? 0)
    case 'convolve': return C.convolve(img, e.kernel, e.size, e.divisor, e.bias ?? 0)
    case 'resize': return resize(img, e.width, e.height, e.filter ?? 'lanczos3')
    case 'crop': return crop(img, e.rect)
    case 'rotate90': return rotate90(img, e.turns)
    case 'rotate': return rotate(img, e.degrees, e.expand ?? true)
    case 'flip': return flip(img, e.horizontal)
    default: { const _x: never = e; throw new Error(`unknown op ${JSON.stringify(_x)}`) }
  }
}

export function applyStack(img: RasterImage, ops: readonly EditOp[]): RasterImage {
  return ops.reduce(applyOp, img)
}
