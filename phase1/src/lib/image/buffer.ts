/** Minimal RGBA8 raster (non-premultiplied, sRGB-encoded), independent of DOM ImageData so it runs under node:test. */
export interface RasterImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function createImage(width: number, height: number, fill?: [number, number, number, number]): RasterImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`invalid image size ${width}x${height}`)
  }
  const data = new Uint8ClampedArray(width * height * 4)
  if (fill) for (let i = 0; i < data.length; i += 4) data.set(fill, i)
  return { width, height, data }
}

export function cloneImage(img: RasterImage): RasterImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
