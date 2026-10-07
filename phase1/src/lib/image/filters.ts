import { cloneImage, type RasterImage } from './buffer';

/** Blend RGB only. Color filters keep the source alpha exactly. */
export function mixRgb(source: RasterImage, filtered: RasterImage, strength: number, signal?: AbortSignal): RasterImage {
  if (source.width !== filtered.width || source.height !== filtered.height) throw new RangeError('Filter sizes must match');
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new RangeError('Strength must be 0..1');
  const out = cloneImage(source);
  for (let y = 0; y < source.height; y++) {
    signal?.throwIfAborted();
    for (let x = 0; x < source.width; x++) {
      const i = (y * source.width + x) * 4;
      for (let c = 0; c < 3; c++) out.data[i + c] = source.data[i + c] + strength * (filtered.data[i + c] - source.data[i + c]);
    }
  }
  return out;
}

/** Elliptical vignette in image coordinates. Center stays unchanged, corners darken smoothly; alpha is untouched. */
export function vignette(img: RasterImage, strength = 1, signal?: AbortSignal): RasterImage {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new RangeError('Strength must be 0..1');
  const out = cloneImage(img);
  for (let y = 0; y < img.height; y++) {
    signal?.throwIfAborted();
    const ny = img.height === 1 ? 0 : 2 * y / (img.height - 1) - 1;
    for (let x = 0; x < img.width; x++) {
      const nx = img.width === 1 ? 0 : 2 * x / (img.width - 1) - 1;
      const radius = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2);
      const t = Math.max(0, (radius - 0.25) / 0.75);
      const factor = 1 - strength * t * t * (3 - 2 * t);
      const i = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) out.data[i + c] *= factor;
    }
  }
  return out;
}
