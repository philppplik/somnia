import type { ImageEditDocument, ImageOperation, ImageSourceInfo, JsonValue } from './types';
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
export function assertImageSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) throw new RangeError('Image dimensions must be positive integers below the 64 megapixel limit.');
}
function freezeJson(value: JsonValue): JsonValue {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Operation numbers must be finite.');
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (value !== null && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([k,v]) => [k, freezeJson(v)])));
  if (value === null || ['string','number','boolean'].includes(typeof value)) return value;
  throw new TypeError('Operation parameters must be JSON values.');
}
export function operation(input: ImageOperation): ImageOperation {
  if (!input.id || !input.type || !Number.isInteger(input.version) || input.version < 1 || typeof input.enabled !== 'boolean') throw new TypeError('Invalid image operation.');
  if (!input.params || Array.isArray(input.params)) throw new TypeError('Operation parameters must be an object.');
  return Object.freeze({ ...input, params: freezeJson(input.params) as ImageOperation['params'] });
}
export function createImageDocument(source: ImageSourceInfo): ImageEditDocument {
  assertImageSize(source.width, source.height);
  return Object.freeze({schemaVersion: 1, source: Object.freeze({...source}), operations: Object.freeze([]), revision: 0});
}
/** Immutable snapshots let the history layer retain references, never pixel copies. */
export function withOperations(doc: ImageEditDocument, ops: readonly ImageOperation[]): ImageEditDocument {
  const ids = new Set<string>();
  const operations = ops.map(op => { if (ids.has(op.id)) throw new Error(`Duplicate operation ID: ${op.id}`); ids.add(op.id); return operation(op); });
  return Object.freeze({...doc, operations: Object.freeze(operations), revision: doc.revision + 1});
}
export function appendOperation(doc: ImageEditDocument, op: ImageOperation): ImageEditDocument { return withOperations(doc, [...doc.operations, op]); }
export function updateOperation(doc: ImageEditDocument, id: string, patch: Partial<Omit<ImageOperation,'id'>>): ImageEditDocument {
  if (!doc.operations.some(op => op.id === id)) throw new Error(`Unknown operation: ${id}`);
  return withOperations(doc, doc.operations.map(op => op.id === id ? {...op, ...patch} : op));
}
export function removeOperation(doc: ImageEditDocument, id: string): ImageEditDocument { return withOperations(doc, doc.operations.filter(op => op.id !== id)); }
export function serializeDocument(doc: ImageEditDocument): string { return JSON.stringify(doc); }
export function parseDocument(json: string): ImageEditDocument {
  const raw = JSON.parse(json);
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.operations)) throw new Error('Unsupported image document.');
  if (!raw.source || ['id','name','mime'].some(k => typeof raw.source[k] !== 'string') || !Number.isInteger(raw.revision) || raw.revision < 0) throw new Error('Invalid image document.');
  const result = withOperations(createImageDocument(raw.source), raw.operations);
  return Object.freeze({...result, revision: raw.revision});
}
