import type { ImageOperation } from '../../image-editor/types';
import type { OperationHandler, OperationRegistry } from '../../image-editor/pipeline';
import { emptySelection, validateSelection, cutSelection, fillSelection, type SelectionMask } from './selection';

/** Sorted non-overlapping [linear pixel start, length] runs keep selection intent serializable. */
export function encodeSelection(mask: SelectionMask): ImageOperation['params'] {
  validateSelection(mask); const runs: number[][] = [];
  for (let i = 0; i < mask.data.length;) { if (!mask.data[i]) { i++; continue; } const start = i; while (i < mask.data.length && mask.data[i]) i++; runs.push([start, i - start]); }
  return { width: mask.width, height: mask.height, runs };
}
export function decodeSelection(params: ImageOperation['params'], image: { width: number; height: number }): SelectionMask {
  if (params.width !== image.width || params.height !== image.height) throw new RangeError('Selection dimensions no longer match the image');
  const mask = emptySelection(image.width, image.height); if (!Array.isArray(params.runs)) throw new TypeError('Missing selection runs');
  let end = 0;
  for (const run of params.runs) {
    if (!Array.isArray(run) || run.length !== 2 || typeof run[0] !== 'number' || typeof run[1] !== 'number') throw new TypeError('Invalid selection run');
    const [start, length] = run;
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < end || length < 1 || start + length > mask.data.length) throw new RangeError('Invalid selection run range');
    mask.data.fill(1, start, start + length); end = start + length;
  }
  return mask;
}
export const selectionCutHandler: OperationHandler = { type: 'selection-cut', version: 1, apply(input, params, context) {
  context.signal?.throwIfAborted(); return cutSelection(input, decodeSelection(params, input), context.signal);
} };
export const selectionFillHandler: OperationHandler = { type: 'selection-fill', version: 1, apply(input, params, context) {
  context.signal?.throwIfAborted();
  if (!Array.isArray(params.color) || !params.color.every(n => typeof n === 'number')) throw new TypeError('Missing RGBA fill color');
  return fillSelection(input, decodeSelection(params, input), params.color as number[], context.signal);
} };
export const SELECTION_HANDLERS = [selectionCutHandler, selectionFillHandler] as const;
export function registerSelectionOps(registry: OperationRegistry): () => void {
  const undo: (() => void)[] = [];
  try { for (const handler of SELECTION_HANDLERS) undo.push(registry.register(handler)); } catch (error) { undo.reverse().forEach(fn => fn()); throw error; }
  return () => undo.reverse().forEach(fn => fn());
}
let sequence = 0;
function op(type: string, params: ImageOperation['params']): ImageOperation { return { id: `${type}-${Date.now().toString(36)}-${sequence++}`, type, version: 1, enabled: true, params }; }
export const selectionCutOp = (mask: SelectionMask): ImageOperation => op('selection-cut', encodeSelection(mask));
export const selectionFillOp = (mask: SelectionMask, color: readonly number[]): ImageOperation => {
  if (color.length !== 4 || color.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new TypeError('Fill color must be four RGBA bytes');
  return op('selection-fill', { ...encodeSelection(mask), color: [...color] });
};
