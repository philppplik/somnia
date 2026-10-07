import { applyAdjust, isNeutralAdjust, normalizeAdjustParams, type PixelBuffer } from './math';
import { buildFragmentShader } from './shader';
import { ADJUST_OP_TYPE, DEFAULT_ADJUST_PARAMS, type AdjustParams } from './types';

import type { RasterImage } from '../../image/buffer';
import type { ImageOperation, JsonValue } from '../../image-editor/types';
import type { OperationHandler } from '../../image-editor/pipeline';
export type { JsonValue, RasterImage };
export type OpHandler = OperationHandler;
export type ImageOperationLike = ImageOperation;
type JsonParams = ImageOperation['params'];

export const ADJUST_OP_VERSION = 1;

/** Typed params -> JSON params stored in Document.operations[].params. */
export function adjustToJson(p: Partial<AdjustParams>): JsonParams {
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
