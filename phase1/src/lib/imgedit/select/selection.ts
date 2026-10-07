import { assertImageSize } from '../../image-editor/document';
import { validateRaster } from '../../image-editor/pipeline';
import type { Point } from '../../image-editor/types';
import type { RasterImage } from '../../image/buffer';

/** Binary pixel selection in the dimensions of the current rendered raster, not the source. */
export interface SelectionMask { width: number; height: number; data: Uint8Array }
export interface SelectionBounds { x: number; y: number; width: number; height: number }
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export function emptySelection(width: number, height: number): SelectionMask {
  assertImageSize(width, height); return { width, height, data: new Uint8Array(width * height) };
}
export function validateSelection(mask: SelectionMask, image?: { width: number; height: number }): void {
  assertImageSize(mask.width, mask.height);
  if (!(mask.data instanceof Uint8Array) || mask.data.length !== mask.width * mask.height) throw new TypeError('Invalid selection mask');
  if (image && (image.width !== mask.width || image.height !== mask.height)) throw new RangeError('Selection dimensions no longer match the image');
  for (const value of mask.data) if (value !== 0 && value !== 1) throw new TypeError('Selection mask must be binary');
}
function finitePoint(p: Point): void { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Selection coordinates must be finite'); }
/** Select pixel centers inside a half-open rectangle, including reverse drags and clipped edges. */
export function rectSelection(width: number, height: number, a: Point, b: Point): SelectionMask {
  finitePoint(a); finitePoint(b); const out = emptySelection(width, height);
  const x0 = Math.max(0, Math.ceil(Math.min(a.x, b.x) - .5)), x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) - .5));
  const y0 = Math.max(0, Math.ceil(Math.min(a.y, b.y) - .5)), y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) - .5));
  if (x1 <= x0 || y1 <= y0) return out;
  for (let y = y0; y < y1; y++) out.data.fill(1, y * width + x0, y * width + x1);
  return out;
}
/** Closed freehand polygon, even-odd rule at pixel centers; works with concave/self-crossing paths. */
export function lassoSelection(width: number, height: number, points: readonly Point[], signal?: AbortSignal): SelectionMask {
  const out = emptySelection(width, height); points.forEach(finitePoint); signal?.throwIfAborted();
  if (points.length < 3) return out;
  let minY = height, maxY = 0; for (const p of points) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (let y = Math.max(0, Math.ceil(minY - .5)); y < Math.min(height, Math.ceil(maxY - .5)); y++) {
    signal?.throwIfAborted(); const scan = y + .5, hits: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a.y > scan) !== (b.y > scan)) hits.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(hits[i] - .5)), x1 = Math.min(width, Math.ceil(hits[i + 1] - .5));
      if (x1 > x0) out.data.fill(1, y * width + x0, y * width + x1);
    }
  }
  return out;
}
/** Four-connected flood selection. Tolerance is maximum sRGB RGBA channel difference (0..255).
 * Compare every candidate to the seed, never its neighbor. Hidden RGB on fully transparent pixels is ignored. */
export function wandSelection(image: RasterImage, point: Point, tolerance = 0, signal?: AbortSignal): SelectionMask {
  validateRaster(image); finitePoint(point);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new RangeError('Tolerance must be between 0 and 255');
  signal?.throwIfAborted(); const out = emptySelection(image.width, image.height), x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return out;
  const seed = y * image.width + x, offset = seed * 4, queue = new Int32Array(out.data.length), seen = new Uint8Array(out.data.length);
  let head = 0, tail = 0;
  const visit = (index: number) => {
    if (seen[index]) return; seen[index] = 1; const p = index * 4;
    if (Math.abs(image.data[p + 3] - image.data[offset + 3]) > tolerance) return;
    if (!(image.data[p + 3] === 0 && image.data[offset + 3] === 0)) {
      for (let c = 0; c < 3; c++) if (Math.abs(image.data[p + c] - image.data[offset + c]) > tolerance) return;
    }
    out.data[index] = 1; queue[tail++] = index;
  };
  visit(seed);
  while (head < tail) {
    if ((head & 4095) === 0) signal?.throwIfAborted(); const i = queue[head++], col = i % image.width;
    if (col > 0) visit(i - 1); if (col + 1 < image.width) visit(i + 1);
    if (i >= image.width) visit(i - image.width); if (i + image.width < out.data.length) visit(i + image.width);
  }
  return out;
}
export function combineSelections(base: SelectionMask, next: SelectionMask, mode: SelectionMode): SelectionMask {
  validateSelection(base); validateSelection(next, base);
  if (!['replace', 'add', 'subtract', 'intersect'].includes(mode)) throw new TypeError('Invalid selection mode');
  const out = emptySelection(base.width, base.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = Number(mode === 'replace' ? next.data[i] : mode === 'add' ? base.data[i] || next.data[i] : mode === 'subtract' ? base.data[i] && !next.data[i] : base.data[i] && next.data[i]);
  return out;
}
export function selectionBounds(mask: SelectionMask): SelectionBounds | null {
  validateSelection(mask); let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) { const x = i % mask.width, y = Math.floor(i / mask.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
/** A local clipboard payload. Pixels outside an irregular selection remain transparent. */
export function copySelection(image: RasterImage, mask: SelectionMask): { image: RasterImage; origin: Point } | null {
  validateRaster(image); validateSelection(mask, image); const bounds = selectionBounds(mask); if (!bounds) return null;
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const i = (bounds.y + y) * image.width + bounds.x + x;
    if (mask.data[i]) data.set(image.data.subarray(i * 4, i * 4 + 4), (y * bounds.width + x) * 4);
  }
  return { image: { width: bounds.width, height: bounds.height, data }, origin: { x: bounds.x, y: bounds.y } };
}
export function fillSelection(image: RasterImage, mask: SelectionMask, color: readonly number[], signal?: AbortSignal): RasterImage {
  validateRaster(image); validateSelection(mask, image); signal?.throwIfAborted();
  if (color.length !== 4 || color.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new TypeError('Fill color must be four RGBA bytes');
  const out = { ...image, data: new Uint8ClampedArray(image.data) };
  for (let i = 0; i < mask.data.length; i++) { if ((i & 4095) === 0) signal?.throwIfAborted(); if (mask.data[i]) out.data.set(color, i * 4); }
  return out;
}
export function cutSelection(image: RasterImage, mask: SelectionMask, signal?: AbortSignal): RasterImage { return fillSelection(image, mask, [0, 0, 0, 0], signal); }
