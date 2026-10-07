// Renderer-registry handlers for the transform ops. Shape follows the core contract:
// ImageOperation {id,type,version,enabled,params}, handler {type,version,apply(input,params,ctx)}.
// Handlers never mutate their input. Params are plain JSON and validated on every call.
import { crop, flip, resize, rotate, rotatedBounds, normalizeDegrees, clampRect, fitAspectRect, aspectRatio, type AspectPreset, type ResizeFilter, type CropRect } from './transform';

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export interface ImageOperation { id: string; type: string; version: number; enabled: boolean; params: Record<string, JsonValue> }
export interface OpContext { signal?: AbortSignal }
export interface TransformHandler {
  type: string; version: number;
  apply(input: RasterImage, params: Record<string, JsonValue>, context: OpContext): RasterImage;
  /** Output size without pixel work (UI preview, size limits). */
  outputSize(width: number, height: number, params: Record<string, JsonValue>): { width: number; height: number };
}

const FILTERS: ResizeFilter[] = ['lanczos3', 'lanczos2', 'bilinear', 'nearest'];
function num(p: Record<string, JsonValue>, k: string): number {
  const v = p[k]; if (typeof v !== 'number' || !isFinite(v)) throw new TypeError(`param "${k}" must be a finite number`); return v;
}
function aborted(c: OpContext): void { if (c.signal?.aborted) throw new DOMException('aborted', 'AbortError'); }

export function cropRectOf(p: Record<string, JsonValue>): CropRect { return { x: num(p, 'x'), y: num(p, 'y'), width: num(p, 'width'), height: num(p, 'height') }; }

/** params: {x,y,width,height} in source pixels. */
export const cropHandler: TransformHandler = {
  type: 'crop', version: 1,
  apply(input, p, c) { aborted(c); return crop(input, cropRectOf(p)); },
  outputSize(w, h, p) { const r = clampRect(cropRectOf(p), w, h); return { width: r.width, height: r.height }; },
};

/** params: {width,height,filter?}. */
export const resizeHandler: TransformHandler = {
  type: 'resize', version: 1,
  apply(input, p, c) {
    aborted(c);
    const f = (p.filter ?? 'lanczos3') as ResizeFilter; if (!FILTERS.includes(f)) throw new TypeError('unknown filter');
    return resize(input, Math.round(num(p, 'width')), Math.round(num(p, 'height')), f);
  },
  outputSize(_w, _h, p) { return { width: Math.round(num(p, 'width')), height: Math.round(num(p, 'height')) }; },
};

/** params: {degrees (clockwise), expand?: boolean (default true), background?: [r,g,b,a]}. */
export const rotateHandler: TransformHandler = {
  type: 'rotate', version: 1,
  apply(input, p, c) {
    aborted(c);
    const bg = Array.isArray(p.background) && p.background.length === 4 && p.background.every((n) => typeof n === 'number') ? (p.background as [number, number, number, number]) : undefined;
    return rotate(input, num(p, 'degrees'), { expand: p.expand !== false, background: bg });
  },
  outputSize(w, h, p) {
    const d = normalizeDegrees(num(p, 'degrees'));
    if (d % 90 === 0) return d === 90 || d === 270 ? { width: h, height: w } : { width: w, height: h };
    return p.expand === false ? { width: w, height: h } : rotatedBounds(w, h, d);
  },
};

/** params: {axis: 'horizontal'|'vertical'}. */
export const flipHandler: TransformHandler = {
  type: 'flip', version: 1,
  apply(input, p, c) {
    aborted(c);
    if (p.axis !== 'horizontal' && p.axis !== 'vertical') throw new TypeError('axis must be horizontal or vertical');
    return flip(input, p.axis);
  },
  outputSize(w, h) { return { width: w, height: h }; },
};

export const TRANSFORM_HANDLERS: readonly TransformHandler[] = [cropHandler, resizeHandler, rotateHandler, flipHandler];

// ---------- op factories used by the UI ----------
let seq = 0;
const mk = (type: string, params: Record<string, JsonValue>): ImageOperation => ({ id: `${type}-${Date.now().toString(36)}-${(seq++).toString(36)}`, type, version: 1, enabled: true, params });
export const cropOp = (r: CropRect): ImageOperation => mk('crop', { x: r.x, y: r.y, width: r.width, height: r.height });
export const resizeOp = (width: number, height: number, filter: ResizeFilter = 'lanczos3'): ImageOperation => mk('resize', { width, height, filter });
export const rotateOp = (degrees: number, expand = true): ImageOperation => mk('rotate', { degrees, expand });
export const flipOp = (axis: 'horizontal' | 'vertical'): ImageOperation => mk('flip', { axis });
/** Initial crop rect for an aspect preset on an image of the given size. */
export function initialCropRect(w: number, h: number, preset: AspectPreset | number): CropRect {
  const r = aspectRatio(preset, w, h); return r ? fitAspectRect(w, h, r) : { x: 0, y: 0, width: w, height: h };
}
