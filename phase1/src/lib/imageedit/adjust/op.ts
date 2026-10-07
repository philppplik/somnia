import { applyAdjust, isNeutralAdjust, normalizeAdjustParams, type PixelBuffer } from './math';
import { buildFragmentShader } from './shader';
import { ADJUST_OP_TYPE, DEFAULT_ADJUST_PARAMS, type AdjustParams } from './types';

/** Structural copies of the core pipeline contract (core: {types,document,loader,renderer,viewport,export}). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export interface RasterImage { width: number; height: number; data: Uint8ClampedArray }
export interface OpContext { signal?: AbortSignal }
export interface OpHandler {
  type: string;
  version: number;
  apply(input: RasterImage, params: Record<string, JsonValue>, context: OpContext): RasterImage | Promise<RasterImage>;
  fragmentShader?(params: Record<string, JsonValue>): string;
}
export interface ImageOperationLike {
  id: string; type: string; version: number; enabled: boolean; params: Record<string, JsonValue>;
}

export const ADJUST_OP_VERSION = 1;

/** Typed params -> JSON params stored in Document.operations[].params. */
export function adjustToJson(p: Partial<AdjustParams>): Record<string, JsonValue> {
  const n = normalizeAdjustParams(p);
  return {
    brightness: n.brightness, contrast: n.contrast, saturation: n.saturation, hue: n.hue,
    temperature: n.temperature, highlights: n.highlights, shadows: n.shadows,
    curves: n.curves.map((c) => ({ x: c.x, y: c.y })),
  };
}

/** Defaults for a freshly added adjust operation. */
export function newAdjustOperation(id: string): ImageOperationLike {
  return { id, type: ADJUST_OP_TYPE, version: ADJUST_OP_VERSION, enabled: true, params: adjustToJson(DEFAULT_ADJUST_PARAMS) };
}

/** Atomic slider update: replace the whole params object with the old values + the patch. */
export function patchAdjustOperation(op: ImageOperationLike, patch: Partial<AdjustParams>): ImageOperationLike {
  const next = normalizeAdjustParams(patch, normalizeAdjustParams(op.params as unknown as Partial<AdjustParams>));
  return { ...op, params: adjustToJson(next) };
}

const abortError = () => (typeof DOMException !== 'undefined' ? new DOMException('Aborted', 'AbortError') : Object.assign(new Error('Aborted'), { name: 'AbortError' }));

/** Registry handler. Never mutates `input`; neutral params return an untouched copy. */
export const adjustHandler: OpHandler = {
  type: ADJUST_OP_TYPE,
  version: ADJUST_OP_VERSION,
  apply(input, params, context) {
    if (context?.signal?.aborted) throw abortError();
    const p = params as unknown as Partial<AdjustParams>;
    const out: PixelBuffer = isNeutralAdjust(p)
      ? { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) }
      : applyAdjust(input, p);
    if (context?.signal?.aborted) throw abortError();
    return out;
  },
  /** Params baked in as constants; for the live slider path use buildFragmentShader() with uniforms. */
  fragmentShader(params) {
    return buildFragmentShader(params as unknown as Partial<AdjustParams>, true);
  },
};

export function registerAdjustOp(registry: { register(handler: OpHandler): void }): void {
  registry.register(adjustHandler);
}
