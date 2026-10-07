import { cloneImage } from '../../image/buffer';
import { saturation, sepia, invert } from '../../image/adjust';
import { gaussianBlur, unsharpMask } from '../../image/convolve';
import { mixRgb, vignette } from '../../image/filters';
import { validateRaster, type OperationHandler, type OperationRegistry } from '../../image-editor/pipeline';
import type { ImageOperation } from '../../image-editor/types';

export const FILTER_TYPES = ['blur', 'sharpen', 'grayscale', 'sepia', 'invert', 'vignette'] as const;
export type FilterType = typeof FILTER_TYPES[number];
export const FILTER_VERSION = 1;
export interface FilterParams { strength: number; sigma?: number; threshold?: number }

function finite(value: unknown, name: string, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  if (value < 0 || value > max) throw new RangeError(`${name} must be between 0 and ${max}`);
  return value;
}
export function normalizeFilterParams(type: FilterType, params: ImageOperation['params']): FilterParams {
  if (!FILTER_TYPES.includes(type)) throw new TypeError('Unknown image filter');
  const strength = finite(params.strength, 'strength', 1, 1);
  return type === 'blur' || type === 'sharpen'
    ? { strength, sigma: finite(params.sigma, 'sigma', type === 'blur' ? 10 : 1, 100), ...(type === 'sharpen' ? { threshold: finite(params.threshold, 'threshold', 0, 255) } : {}) }
    : { strength };
}

/** One serializable core operation per filter. strength is normalized 0..1, never percent. */
export function newFilterOperation(id: string, type: FilterType, params: Partial<FilterParams> = {}): ImageOperation {
  const normalized = normalizeFilterParams(type, { ...params });
  return { id, type, version: FILTER_VERSION, enabled: true, params: { ...normalized } };
}
export function patchFilterOperation(op: ImageOperation, patch: Partial<FilterParams>): ImageOperation {
  if (op.version !== FILTER_VERSION || !FILTER_TYPES.includes(op.type as FilterType)) throw new TypeError('Not a supported filter operation');
  return { ...op, params: { ...normalizeFilterParams(op.type as FilterType, { ...op.params, ...patch }) } };
}

export const FILTER_HANDLERS: readonly OperationHandler[] = FILTER_TYPES.map((type) => ({
  type, version: FILTER_VERSION,
  apply(input, params, { signal }) {
    signal?.throwIfAborted();
    validateRaster(input);
    const p = normalizeFilterParams(type, params);
    if (p.strength === 0) return cloneImage(input);
    let out;
    switch (type) {
      case 'blur': out = gaussianBlur(input, p.sigma! * p.strength, signal); break;
      case 'sharpen': out = unsharpMask(input, p.sigma!, 2 * p.strength, p.threshold!, signal); break;
      case 'grayscale': out = saturation(input, -p.strength); break;
      case 'sepia': out = sepia(input, p.strength); break;
      case 'invert': out = mixRgb(input, invert(input), p.strength, signal); break;
      case 'vignette': out = vignette(input, p.strength, signal); break;
    }
    signal?.throwIfAborted();
    return out;
  },
}));

/** Explicit opt-in, like adjust and transform. Cleanup belongs to this registration only. */
export function registerFilterOps(registry: OperationRegistry): () => void {
  const cleanup: (() => void)[] = [];
  try { for (const handler of FILTER_HANDLERS) cleanup.push(registry.register(handler)); }
  catch (error) { for (const remove of cleanup.reverse()) remove(); throw error; }
  return () => { for (const remove of cleanup) remove(); };
}
