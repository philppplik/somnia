import type { JsonValue, VectorDocument, VectorOperation, VectorState } from './types';
import { createVectorRegistry, type VectorOpRegistry } from './ops';
import { shapeToSvgElement, styleToSvgAttrs } from './shapes';

export const MAX_VECTOR_SIZE = 100_000;
export const MAX_VECTOR_OPS = 100_000;
function freezeJson(v: JsonValue): JsonValue {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('Operation numbers must be finite.');
  if (Array.isArray(v)) return Object.freeze(v.map(freezeJson));
  if (v !== null && typeof v === 'object') return Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freezeJson(x as JsonValue)])));
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
  throw new TypeError('Operation parameters must be JSON values.');
}
export function vectorOperation(input: VectorOperation): VectorOperation {
  if (!input.id || !input.type || !Number.isInteger(input.version) || input.version < 1 || typeof input.enabled !== 'boolean') throw new TypeError('Invalid vector operation.');
  if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) throw new TypeError('Operation parameters must be an object.');
  return Object.freeze({ ...input, params: freezeJson(input.params as JsonValue) as VectorOperation['params'] });
}
export function createVectorDocument(width: number, height: number): VectorDocument {
  for (const n of [width, height]) if (!Number.isFinite(n) || n <= 0 || n > MAX_VECTOR_SIZE) throw new RangeError(`Canvas size must be between 0 and ${MAX_VECTOR_SIZE}.`);
  return Object.freeze({ schemaVersion: 1 as const, size: Object.freeze({ width, height }), operations: Object.freeze([]), revision: 0 });
}
export function withVectorOperations(doc: VectorDocument, ops: readonly VectorOperation[]): VectorDocument {
  if (ops.length > MAX_VECTOR_OPS) throw new RangeError('Too many operations.');
  const ids = new Set<string>();
  const operations = ops.map((op) => { if (ids.has(op.id)) throw new Error(`Duplicate operation ID: ${op.id}`); ids.add(op.id); return vectorOperation(op); });
  return Object.freeze({ ...doc, operations: Object.freeze(operations), revision: doc.revision + 1 });
}
export const appendVectorOperation = (doc: VectorDocument, op: VectorOperation) => withVectorOperations(doc, [...doc.operations, op]);
export function updateVectorOperation(doc: VectorDocument, id: string, patch: Partial<Omit<VectorOperation, 'id'>>): VectorDocument {
  if (!doc.operations.some((o) => o.id === id)) throw new Error(`Unknown operation: ${id}`);
  return withVectorOperations(doc, doc.operations.map((o) => (o.id === id ? { ...o, ...patch } : o)));
}
export const removeVectorOperation = (doc: VectorDocument, id: string) => withVectorOperations(doc, doc.operations.filter((o) => o.id !== id));
export const serializeVectorDocument = (doc: VectorDocument) => JSON.stringify(doc);
export function parseVectorDocument(json: string): VectorDocument {
  const raw = JSON.parse(json);
  if (raw?.schemaVersion !== 1 || !Array.isArray(raw.operations)) throw new Error('Unsupported vector document.');
  if (!raw.size || !Number.isInteger(raw.revision) || raw.revision < 0) throw new Error('Invalid vector document.');
  const doc = withVectorOperations(createVectorDocument(raw.size.width, raw.size.height), raw.operations);
  // Fail on load, not later: replay once to prove every op is valid.
  resolveLayers(doc);
  return Object.freeze({ ...doc, revision: raw.revision });
}

/** Folds enabled operations into the layer list. */
export function resolveLayers(doc: VectorDocument, registry: VectorOpRegistry = createVectorRegistry()): VectorState {
  let state: VectorState = [];
  for (const op of doc.operations) { if (op.enabled) state = registry.get(op).apply(state, op.params); }
  return state;
}
/** SVG export. Hidden layers are skipped; the first layer is painted first (bottom). */
export function toSvg(doc: VectorDocument, state: VectorState = resolveLayers(doc)): string {
  const { width, height } = doc.size;
  const body = state.filter((l) => l.visible).map((l) => '  ' + shapeToSvgElement(l.shape, `${styleToSvgAttrs(l.style)} data-layer="${l.id.replace(/[^\w-]/g, '_')}"`)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`;
}

/** Undo/redo over immutable snapshots, like the image editor: no deep copies. */
export class VectorHistory {
  private past: VectorDocument[] = []; private future: VectorDocument[] = [];
  constructor(private doc: VectorDocument, private readonly limit = 200) {}
  get current(): VectorDocument { return this.doc; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  /** Validates by replaying before accepting, so a bad op leaves history untouched. */
  push(op: VectorOperation, registry?: VectorOpRegistry): VectorDocument {
    const next = appendVectorOperation(this.doc, op);
    resolveLayers(next, registry);
    this.past.push(this.doc); if (this.past.length > this.limit) this.past.shift();
    this.future = []; this.doc = next; return next;
  }
  undo(): VectorDocument { const p = this.past.pop(); if (p) { this.future.push(this.doc); this.doc = p; } return this.doc; }
  redo(): VectorDocument { const f = this.future.pop(); if (f) { this.past.push(this.doc); this.doc = f; } return this.doc; }
}
